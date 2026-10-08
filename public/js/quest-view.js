// Normalize additive quest snapshots without inventing progress for old saves.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value : '';
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const labels = { kill: 'Pest control', skin: 'Harvest', deliver: 'Delivery', recover: 'Recovery' };

export function questView(quest) {
  if (quest == null) return null;
  if (!record(quest) || (!text(quest.kind) && !text(quest.desc) && !text(quest.objective))) return { unavailable: true, label: 'Journal', objective: 'Task details unavailable.', complete: false };
  const complete = quest.done === true;
  const source = quest.source === 'leader' ? 'Guild task' : 'Town work';
  const returnTo = text(quest.returnTo) || (quest.source === 'leader' ? 'your guild leader' : 'the town crier');
  const raw = record(quest.counter) ? quest.counter : {};
  const current = count(raw.current), total = count(raw.total), remaining = count(raw.remaining);
  // Inconsistent or incomplete counters are text only; DONE determines status.
  const consistent = current === null || total === null || remaining === null || current + remaining === total;
  const progress = consistent && total > 0 && current !== null && current <= total ? { current, total } : null;
  const unit = text(raw.unit) || 'objectives';
  let counterText = 'Progress details unavailable.';
  if (current !== null && total !== null && current <= total) counterText = `${current}/${total} ${unit}`;
  else if (remaining !== null) counterText = `${remaining} ${unit} remaining${total === null ? ' · original total unknown' : ` · total ${total}`}`;
  else if (current !== null && total === null) counterText = `${current} ${unit} completed · original total unknown`;
  if (progress && remaining !== null) counterText += ` · ${remaining} remaining`;
  if (!consistent) counterText = 'Progress details inconsistent. Wait for the next live snapshot.';
  const destination = record(quest.destination) ? quest.destination : null;
  const destinationText = destination
    ? [text(destination.parcel), text(destination.recipient), text(destination.name)].filter(Boolean).join(' · ')
    : '';
  return {
    label: Object.hasOwn(labels, quest.kind) ? labels[quest.kind] : 'Task', source, complete, progress, counterText,
    objective: text(quest.objective) || text(quest.desc) || 'Ask the task giver to review your assignment.',
    description: text(quest.desc),
    destinationText,
    atDestination: destination?.atDestination === true,
    next: complete ? `Reward unclaimed. Return to ${returnTo} when you choose to claim it.`
      : quest.kind === 'deliver' && destination?.atDestination === true ? 'At the destination. Hand over the parcel when ready.'
      : `Finish the objective, then return to ${returnTo}.`,
  };
}
