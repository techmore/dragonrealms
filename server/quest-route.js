// Read-only quest travel guidance. No objective progress or rewards are changed.
import { ROOMS } from '../data/world.js';
import { NPCS } from '../data/npcs.js';
import { questSnapshot } from './quest-objectives.js';
import { walkingRoute, formatRoute } from './route.js';

export function questRouteDestination(p, rooms = ROOMS, npcs = NPCS) {
  const snapshot = questSnapshot(p);
  if (!snapshot) return { state: 'none' };
  if (!snapshot.done) {
    if (snapshot.kind !== 'deliver') return { state: 'objective', kind: snapshot.kind };
    const roomId = snapshot.destination?.roomId;
    return roomId && rooms[roomId] ? { state: 'destination', roomId, purpose: 'Delivery destination' } : { state: 'unknown' };
  }
  const leaders = snapshot.source === 'leader';
  if (leaders && !p.guild?.id) return { state: 'unknown' };
  const targets = Object.entries(rooms).filter(([, room]) => room.npcs?.some(id => leaders
    ? npcs[id]?.role === 'guild' && npcs[id].guild === p.guild.id
    : id === 'towncrier'));
  const reachable = targets.map(([roomId]) => ({ roomId, path: walkingRoute(p.room, roomId, rooms) }))
    .filter(target => target.path !== null).sort((a, b) => a.path.length - b.path.length || a.roomId.localeCompare(b.roomId));
  if (!reachable.length) return { state: targets.length ? 'unreachable' : 'unknown' };
  return { state: 'destination', roomId: reachable[0].roomId, purpose: leaders ? 'Your guild leader' : 'The town crier' };
}

export function formatQuestRoute(p, steps = '', rooms = ROOMS, npcs = NPCS) {
  if (steps && !/^(?:[1-9]|1\d|20)$/.test(steps)) return 'Usage: route quest [steps] — steps must be a whole number from 1 to 20.';
  const destination = questRouteDestination(p, rooms, npcs);
  if (destination.state === 'none') return 'Your journal has no active task. Ask the town crier or your guild leader for work.';
  if (destination.state === 'objective') return 'This task has no single travel destination yet. Review "journal" and use "where creature <name>" or "ladder" to choose suitable hunting grounds.';
  if (destination.state === 'unknown') return 'The quest destination is unavailable. Review "journal" or ask your task giver about the assignment.';
  if (destination.state === 'unreachable') return 'No ordinary walking route reaches your task giver. Special travel may be needed; "where npc towncrier" or "where guild <name>" lists known locations.';
  return `${destination.purpose}:\n${formatRoute(p.room, `${destination.roomId}${steps ? ` ${steps}` : ''}`, rooms)}`;
}
