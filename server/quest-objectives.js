// One read-only interpretation for wire snapshots, NPC reminders and journals.
// Kill count is remaining; skin count is the goal. Old kill records have no
// original total, so their completed count remains unknown rather than guessed.
import { roomById } from '../data/world.js';
import { creatureById } from '../data/creatures.js';

const countOf = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function questSnapshot(p) {
  const q = p.quest;
  if (!q) return null;
  const done = Boolean(q.done);
  const returnTo = q.source === 'leader' ? 'your guild leader' : 'the town crier';
  const creature = creatureById(q.creatureId);
  const creatures = creature?.plural || q.creatureId || 'the assigned creatures';
  const snapshot = {
    kind: q.kind || 'unknown', source: q.source || null, done,
    state: done ? 'complete' : 'active', objective: '', desc: '',
    counter: null, destination: null, returnTo,
  };
  if (q.kind === 'kill') {
    const remaining = done ? 0 : countOf(q.count);
    const storedTotal = countOf(q.total);
    const total = storedTotal !== null && (remaining === null || storedTotal >= remaining) ? storedTotal : null;
    snapshot.objective = `Slay ${creatures}.`;
    snapshot.counter = { current: total !== null && remaining !== null ? total - remaining : null, total, remaining, unit: 'creatures' };
    snapshot.desc = remaining === null ? `Slay ${creatures}; remaining count unavailable.` : `Slay ${remaining} more ${creatures}.`;
  } else if (q.kind === 'skin') {
    const total = countOf(q.count);
    const harvested = countOf(q.skinned ?? 0);
    snapshot.objective = 'Skin creatures for the town crier.';
    snapshot.counter = {
      current: total !== null && harvested !== null ? Math.min(harvested, total) : harvested,
      total, remaining: done ? 0 : total !== null && harvested !== null ? Math.max(0, total - harvested) : null,
      unit: 'hides',
    };
    snapshot.desc = snapshot.counter.remaining === null ? 'Skin creatures; harvest count unavailable.' : `Skin ${snapshot.counter.remaining} more creatures and bring the hides to the crier.`;
  } else if (q.kind === 'deliver') {
    const target = q.target || {};
    const room = roomById(target.room);
    snapshot.destination = {
      roomId: target.room || null, name: room?.name || target.room || 'the assigned destination',
      recipient: target.name || 'the recipient', parcel: target.parcel || 'the assigned parcel',
      atDestination: Boolean(target.room && p.room === target.room),
    };
    const destination = snapshot.destination;
    snapshot.objective = `Carry ${destination.parcel} to ${destination.recipient} at ${destination.name}.`;
    snapshot.desc = `${snapshot.objective} Say "deliver" when you arrive.`;
  } else if (q.kind === 'recover') {
    const found = Boolean(q.found);
    const trinket = q.trinket?.name || 'the missing trinket';
    snapshot.objective = `Recover ${trinket}.`;
    snapshot.counter = { current: found ? 1 : 0, total: 1, remaining: done || found ? 0 : 1, unit: 'trinkets' };
    snapshot.desc = found ? `Recover ${trinket} — it is yours, bring it to ${returnTo}.`
      : `Find ${trinket}; it was lost to the ${creatures} of the wilds.`;
  } else {
    snapshot.objective = 'The objective type is unavailable. Ask the task giver to review your assignment.';
    snapshot.desc = snapshot.objective;
  }
  if (done) snapshot.desc = `${snapshot.objective} Complete; reward unclaimed. Return to ${returnTo} and type "claim".`;
  return snapshot;
}
