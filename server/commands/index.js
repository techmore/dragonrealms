// Command dispatcher: alias expansion, multi-command chains, movement,
// and lookup across the domain command modules.
import { DIR_ALIASES } from './dirs.js';
import { commands as combat } from './combat.js';
import { commands as magic } from './magic.js';
import { commands as items } from './items.js';
import { commands as shops } from './shops.js';
import { commands as character } from './character.js';
import { commands as world } from './world.js';

const COMMAND_MODULES = [combat, magic, items, shops, character, world];
const REGISTRY = Object.assign({}, ...COMMAND_MODULES);

import { setRoundtime, roundtimeLeft } from '../player.js';

// Commands that take roundtime (DR): each sets its own RT when it runs, and
// is refused while RT is still counting down. Movement, passive reads, and
// everything not in this set stay free during RT. `applyRT` is only enabled
// from the real WS session (session.js) — tests and the simulator drive the
// engine directly and are unaffected.
export const RT_BLOCK = new Set([
  'attack', 'cast', 'berserk', 'roar', 'meditate', 'form', 'whirlwind', 'stomp', 'choke',
  'mageslash', 'dispel', 'backstab', 'snipe', 'slip', 'smite', 'impede', 'ambush', 'hide',
  'forage', 'scavenge', 'track', 'hunt', 'skin', 'steal', 'pick', 'study', 'perform', 'appraise',
  'repair', 'use', 'drink', 'eat', 'khri', 'predict', 'harness', 'perceive', 'charge', 'invoke',
  'focus', 'animate', 'ritual', 'devotion', 'beseech', 'enchante', 'glyph', 'summon', 'sacrifice',
]);

export function handleCommand(game, p, input, depth = 0, opts = {}) {
  if (depth > 4) return;
  let line = String(input || '').trim();
  if (!line) return;

  // Multi-command strings: "cast fire; retreat" executes in sequence.
  if (line.includes(';')) {
    const parts = line.split(';').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) handleCommand(game, p, part, depth + 1, opts);
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

  const args = line.split(/\s+/);
  const cmd = args[0].toLowerCase();
  const rest = args.slice(1).join(' ');
  const arg1 = args[1];
  const arg2 = args[2];

  const say = (msg) => p.ws.send(JSON.stringify({ t: 'msg', msg }));
  const emit = (msg) => { say(msg); game.status(p); };
  const ctx = { game, p, cmd, arg1, arg2, rest, args, say, emit };

  // Movement (single-letter and "go <dir>").
  if (cmd === 'go') {
    const dir = DIR_ALIASES[arg1 && arg1.toLowerCase()];
    if (!dir) return emit('Go where? Try a direction (n, s, e, w, u, d).');
    const res = game.move(p, dir);
    if (!res.ok) emit(res.msg);
    return;
  }
  const dir = DIR_ALIASES[cmd];
  if (dir) {
    const res = game.move(p, dir);
    if (!res.ok) emit(res.msg);
    return;
  }

  const handler = REGISTRY[cmd];
  if (handler) {
    // Roundtime gate (real sessions only): RT actions are refused while the
    // timer runs. Movement was already handled above and stays free.
    if (opts.applyRT && RT_BLOCK.has(cmd) && roundtimeLeft(p) > 0) {
      return emit(`You must wait ${roundtimeLeft(p)} second${roundtimeLeft(p) === 1 ? '' : 's'} before you can do that.`);
    }
    handler(ctx);
    return;
  }

  emit(`Hmm? I do not know the command "${cmd}". Type "help" for a list.`);
}
