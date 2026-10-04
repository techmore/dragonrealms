// Repair identities without discarding entries or changing valid unique IDs.
export function repairTriggerIds(triggers) {
  const valid = (id) => Number.isSafeInteger(id) && id > 0;
  const reserved = new Set(triggers.filter((t) => valid(t.id)).map((t) => t.id));
  const seen = new Set();
  let next = 1;
  for (const trigger of triggers) {
    if (!valid(trigger.id) || seen.has(trigger.id)) {
      while (reserved.has(next)) next++;
      trigger.id = next;
      reserved.add(next);
    }
    seen.add(trigger.id);
  }
  while (reserved.has(next)) next++;
  return next;
}
