// Poll only when event-driven wire state has become meaningfully stale.
// The world respawn clock is 25s; a 12.5s room refresh still observes at
// least once per spawn interval without repeatedly issuing free look commands.
export const ROOM_REFRESH_MS = 12_500;
export const COMBAT_ASSESS_REFRESH_MS = 20_000;

export function shouldRefreshRoom({ now, observedAt }) {
  return !Number.isFinite(observedAt) || now - observedAt >= ROOM_REFRESH_MS;
}

export function shouldAssessCombat({ now, assessedAt }) {
  return !Number.isFinite(assessedAt) || now - assessedAt >= COMBAT_ASSESS_REFRESH_MS;
}

// A new fight starts with an RT-free decision window. Do not carry the
// ordinary post-command dwell across that edge or the first automatic swing
// can close the only window for RT-gated combat abilities.
export function isDecisionDue({ now, nextDecisionAt, enteredCombat = false }) {
  return Boolean(enteredCombat) || now >= nextDecisionAt;
}

export function combatEntryDecision({ inCombat, previousInCombat, decisionBusy }) {
  const enteredCombat = Boolean(inCombat) && !Boolean(previousInCombat);
  return { enteredCombat, deferFollowup:enteredCombat && Boolean(decisionBusy) };
}

export function consumeCombatEntryFollowup(pending, inCombat) {
  return { run:Boolean(pending) && Boolean(inCombat), pending:false };
}
