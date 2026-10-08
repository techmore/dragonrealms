// Shortest paths follow Game.move's ordinary exit lookup, never grid geometry
// or a synthesized ferry, passage, or spellcasting action.
import { ROOMS } from '../data/world.js';

const DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd'];
const DEFAULT_STEPS = 8;
const MAX_STEPS = 20;
const normalize = value => String(value || '').toLowerCase().replace(/_/g, ' ').trim().replace(/\s+/g, ' ');

export function walkingRoute(from, to, rooms = ROOMS) {
  if (!rooms[from] || !rooms[to]) return null;
  if (from === to) return [];
  const previous = new Map([[from, null]]);
  const queue = [from];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    const exits = rooms[id]?.exits || {};
    for (const direction of DIRECTIONS) {
      const alias = direction === 'u' ? 'up' : direction === 'd' ? 'down' : null;
      const destination = exits[direction] || (alias && exits[alias]);
      if (!destination || !rooms[destination] || previous.has(destination)) continue;
      previous.set(destination, { direction, from: id, to: destination });
      if (destination === to) {
        const path = [];
        for (let current = to; current !== from;) {
          const step = previous.get(current);
          path.push(step);
          current = step.from;
        }
        return path.reverse();
      }
      queue.push(destination);
    }
  }
  return null;
}

export function planRoute(from, input, rooms = ROOMS) {
  const parts = String(input || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { state: 'help' };
  let limit = DEFAULT_STEPS;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(parts.at(-1))) {
    limit = Number(parts.pop());
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_STEPS) return { state: 'invalid' };
  }
  const raw = parts.join(' ');
  const query = normalize(raw);
  if (!query) return { state: 'help' };
  if (!rooms[from]) return { state: 'origin-unknown' };
  const entries = Object.entries(rooms);
  const exactId = entries.find(([id]) => id.toLowerCase() === raw.toLowerCase());
  const exactNames = entries.filter(([, room]) => normalize(room.name) === query);
  const terms = query.split(' ');
  const matches = exactId ? [exactId] : exactNames.length ? exactNames
    : entries.filter(([id, room]) => terms.every(term => normalize(`${id} ${room.name}`).includes(term)));
  if (!matches.length) return { state: 'unknown', query };
  if (matches.length > 1) return {
    state: 'ambiguous', query, total: matches.length,
    matches: matches.sort(([a], [b]) => a.localeCompare(b)).slice(0, 8).map(([id, room]) => ({ id, name: room.name })),
  };
  const [destination, room] = matches[0];
  const path = walkingRoute(from, destination, rooms);
  return { state: path === null ? 'unreachable' : path.length ? 'route' : 'already', destination, name: room.name, path, limit };
}

export function formatRoute(from, input, rooms = ROOMS) {
  const result = planRoute(from, input, rooms);
  const usage = `Usage: route <room-id or room name> [steps] — show up to ${MAX_STEPS} steps (default ${DEFAULT_STEPS}). Find room IDs with "where room <name>".`;
  if (result.state === 'help') return usage;
  if (result.state === 'invalid') return `Steps must be a whole number from 1 to ${MAX_STEPS}.\n${usage}`;
  if (result.state === 'origin-unknown') return 'Your current room is unavailable; a walking route cannot be planned.';
  if (result.state === 'unknown') return `No room matches "${result.query}". Use "where room <name>" to find a room ID.`;
  if (result.state === 'ambiguous') return `Several rooms match "${result.query}" (${result.total}). Choose an exact room ID:\n${result.matches.map(room => `  ${room.name} [${room.id}]`).join('\n')}${result.total > result.matches.length ? '\n  More matches exist; use a more specific name.' : ''}`;
  if (result.state === 'already') return `You are already at ${result.name} [${result.destination}].`;
  if (result.state === 'unreachable') return `No ordinary walking route reaches ${result.name} [${result.destination}] from here. Ferry commands, special passages or travel magic may be needed; this guide does not plan those actions.`;
  const steps = result.path.slice(0, result.limit);
  const lines = [`\nWalking route to ${result.name} [${result.destination}] — ${result.path.length} step${result.path.length === 1 ? '' : 's'}.`];
  lines.push(...steps.map((step, index) => `  ${index + 1}. ${step.direction} → ${rooms[step.to].name} [${step.to}]`));
  if (steps.length < result.path.length) lines.push(`Showing the first ${steps.length} steps. Request more steps, or ask for the route again after walking.`);
  lines.push('Steps are commands over authored exits, not coordinate distance. Movement restrictions such as combat, stocks and jail still apply.');
  return lines.join('\n');
}
