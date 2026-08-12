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

export function handleCommand(game, p, input, depth = 0) {
  if (depth > 4) return;
  let line = String(input || '').trim();
  if (!line) return;

  // Multi-command strings: "cast fire; retreat" executes in sequence.
  if (line.includes(';')) {
    const parts = line.split(';').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) handleCommand(game, p, part, depth + 1);
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
    handleCommand(game, p, cmd, depth + 1);
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
    handler(ctx);
    return;
  }

  emit(`Hmm? I do not know the command "${cmd}". Type "help" for a list.`);
}
