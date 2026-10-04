// Command dispatcher: alias expansion, multi-command chains, movement,
// and lookup across the domain command modules.
import { DIR_ALIASES } from './dirs.js';
import { MAX_COMMAND_LENGTH, MAX_COMMANDS_PER_INPUT } from '../command-budget.js';
import { commands as combat } from './combat.js';
import { commands as magic } from './magic.js';
import { commands as items } from './items.js';
import { commands as shops } from './shops.js';
import { commands as character } from './character.js';
import { commands as world } from './world.js';
import { commands as directions } from './dir.js';
import { commands as guildJoin } from './join.js';
import {
  buildCommandMetadata, commandMetadata, COMMAND_METADATA, MOVEMENT_COMMAND_METADATA,
  roundtimeCommands,
} from './metadata.js';

const COMMAND_MODULES = [
  ['combat', combat], ['magic', magic], ['items', items],
  ['shops', shops], ['character', character], ['world', world],
  ['directions', directions], ['guildJoin', guildJoin],
];

export function mergeCommandModules(modules) {
  const registry = Object.create(null);
  const owners = new Map();
  for (const [moduleName, commands] of modules) {
    for (const [verb, handler] of Object.entries(commands)) {
      if (Object.hasOwn(registry, verb)) {
        throw new Error(`Duplicate command "${verb}" in ${owners.get(verb)} and ${moduleName}`);
      }
      registry[verb] = handler;
      owners.set(verb, moduleName);
    }
  }
  return registry;
}

const REGISTRY = mergeCommandModules(COMMAND_MODULES);
export const COMMAND_REGISTRY_METADATA = buildCommandMetadata(REGISTRY, COMMAND_METADATA);
export function commandContract(name) {
  const key = String(name || '').toLowerCase();
  return commandMetadata(COMMAND_REGISTRY_METADATA, key)
    || MOVEMENT_COMMAND_METADATA[key]
    || null;
}

// Invoke only known read-only views, bypassing player aliases and chaining.
// Their output is returned as one response, never captured from live traffic.
export function readPanel(game, p, cmd) {
  const meta = COMMAND_REGISTRY_METADATA.get(cmd);
  if (!meta?.panelSafe) return { ok: false, error: 'Unknown character panel.' };
  const lines = [];
  const say = (text) => lines.push(String(text));
  REGISTRY[cmd]({ game, p, cmd, args: [cmd], rest: '', arg1: undefined, arg2: undefined, say, emit: say });
  return { ok: true, lines };
}

import { setRoundtime, roundtimeLeft, netBurden, say as sendLine } from '../player.js';

// Commands that take roundtime (DR): each sets its own RT when it runs, and
// is refused while RT is still counting down. Movement, passive reads, and
// everything whose metadata does not set `rt.gate` stay free during RT.
// `applyRT` is enabled by both network session types (WebSocket and HTTP API);
// direct engine tests and the simulator remain unaffected.
export const RT_BLOCK = roundtimeCommands(COMMAND_REGISTRY_METADATA);

export function handleCommand(game, p, input, depth = 0, opts = {}) {
  const budget = opts.executionBudget || { remaining: MAX_COMMANDS_PER_INPUT, nodes: 64, notified: false };
  opts = { ...opts, executionBudget: budget };
  const reject = (msg) => {
    if (!budget.notified) { budget.notified = true; sendLine(p, msg); game.status(p); }
  };
  if (budget.remaining <= 0 || --budget.nodes < 0) return reject('Too many commands at once. Please slow down.');
  if (depth > 4) return;
  let line = String(input || '').trim();
  if (!line) return;
  if (line.length > MAX_COMMAND_LENGTH) return reject('That command is too long.');

  // Multi-command strings: "cast fire; retreat" executes in sequence.
  if (line.includes(';')) {
    const parts = line.split(';').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        handleCommand(game, p, part, depth + 1, opts);
        if (budget.notified) break;
      }
      return;
    }
  }

  // Alias expansion.
  const first = line.split(/\s+/)[0].toLowerCase();
  if (first !== 'alias' && first !== 'unalias' && p.aliases && p.aliases[first]) {
    const rest = line.slice(first.length).trim();
    const restParts = rest.split(/\s+/).filter(Boolean);
    let cmd = p.aliases[first];
    let usedArg = false;
    for (let i = 1; i <= 9; i++) {
      const next = cmd.replace(new RegExp('\\$' + i, 'g'), restParts[i - 1] || '');
      if (next !== cmd) usedArg = true;
      cmd = next;
    }
    if (!usedArg && rest) cmd = `${cmd} ${rest}`;
    handleCommand(game, p, cmd, depth + 1, opts);
    return;
  }

  if (opts.consumeCommand && !opts.consumeCommand()) return reject('Command rate limit exceeded. Please slow down.');
  budget.remaining--;
  const args = line.split(/\s+/);
  const cmd = args[0].toLowerCase();
  const rest = args.slice(1).join(' ');
  const arg1 = args[1];
  const arg2 = args[2];

  const say = (msg) => sendLine(p, msg);
  const emit = (msg) => { say(msg); game.status(p); };
  const ctx = { game, p, cmd, arg1, arg2, rest, args, say, emit };

  // Movement (single-letter and "go <dir>"). Overloaded hunters must shed
  // weight before their legs will carry them (DR encumbrance).
  if (cmd === 'go') {
    if (netBurden(p) >= 6) return emit('You are overloaded! Drop, bundle, or sell something before you can walk.');
    const dir = DIR_ALIASES[arg1 && arg1.toLowerCase()];
    if (!dir) return emit('Go where? Try a direction (n, s, e, w, u, d).');
    const res = game.move(p, dir);
    if (!res.ok) emit(res.msg);
    return;
  }
  const dir = DIR_ALIASES[cmd];
  if (dir) {
    if (netBurden(p) >= 6) return emit('You are overloaded! Drop, bundle, or sell something before you can walk.');
    const res = game.move(p, dir);
    if (!res.ok) emit(res.msg);
    return;
  }

  const handler = REGISTRY[cmd];
  if (handler) {
    // Roundtime gate (real sessions only): RT actions are refused while the
    // timer runs. Movement was already handled above and stays free.
    // EXCEPTION (fresh-char deaths, guzk): metadata marks flee as exempt below
    // 30% HP — the interlock's flee cadence cannot express "wait out RT, then
    // flee", and three refused flee cycles at 20 HP/s chew = death every time.
    const meta = commandMetadata(COMMAND_REGISTRY_METADATA, cmd);
    const desperateFlee = meta?.rt.exempt === 'desperateFlee'
      && p.maxHp > 0 && p.hp / p.maxHp < 0.3;
    if (opts.applyRT && meta?.rt.gate && !desperateFlee && roundtimeLeft(p) > 0) {
      const fight = meta.canonical === 'flee' ? game.combat.getFor(p) : null;
      if (fight?.player === p) {
        fight.fleePending = true;
        return emit('You stop swinging and prepare to flee when your roundtime ends.');
      }
      return emit(`You must wait ${roundtimeLeft(p)} second${roundtimeLeft(p) === 1 ? '' : 's'} before you can do that.`);
    }
    handler(ctx);
    return;
  }

  emit(`Hmm? I do not know the command "${cmd}". Type "help" for a list.`);
}
