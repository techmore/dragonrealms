// Inspection stays separate from assignment, delivery and reward collection.
import { questSnapshot } from './quest-objectives.js';

export function formatQuestJournal(p) {
  const snapshot = questSnapshot(p);
  if (!snapshot) return '\nJournal: no active task. Ask the town crier or your guild leader for work. "quest" can request an assignment at the crier.';
  const lines = [`\nJournal — ${snapshot.source === 'leader' ? 'Guild task' : 'Town work'}`, `Status: ${snapshot.done ? 'Complete; reward unclaimed' : 'In progress'}`, `Objective: ${snapshot.objective}`];
  const counter = snapshot.counter;
  if (snapshot.kind === 'kill') {
    lines.push(counter.remaining === null ? 'Remaining count unavailable.' : `Remaining: ${counter.remaining}.`);
    if (counter.total !== null) lines.push(`Completed: ${counter.current}/${counter.total}.`);
    if (!snapshot.done) lines.push('Use "ladder" to review hunting grounds; match the assigned creature before fighting.');
  } else if (snapshot.kind === 'skin') {
    lines.push(counter.total !== null && counter.current !== null
      ? `Harvested: ${counter.current}/${counter.total}; remaining: ${counter.remaining ?? 'unavailable'}.`
      : 'Harvest count unavailable.');
    if (!snapshot.done) lines.push('After a suitable kill, use "skin <creature>" to advance this task.');
  } else if (snapshot.kind === 'deliver' && !snapshot.done) {
    lines.push(snapshot.destination.atDestination
      ? 'You are at the destination. Type "deliver" to hand over the parcel.'
      : 'Reach the destination using "route quest", then type "deliver" to hand over the parcel.');
  } else if (snapshot.kind === 'recover') {
    lines.push(counter.current ? 'The trinket has been recovered.' : `${snapshot.desc} Recovery is not guaranteed on each kill.`);
  }
  lines.push(snapshot.done
    ? `Use "route quest" for directions to your task giver. Type "claim" when you choose to collect your reward from ${snapshot.returnTo}.`
    : `Finish the objective, then return to ${snapshot.returnTo} and type "claim".`);
  lines.push('Reading this journal does not assign work, deliver parcels or claim rewards.');
  return lines.join('\n');
}
