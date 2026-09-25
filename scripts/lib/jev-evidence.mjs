// Restrict model input to explicit, bounded sim telemetry. Never send accounts,
// raw logs, credentials, code, or arbitrary extra fields from a summary row.
const number = value => Number.isFinite(value) && value >= 0 ? value : null;
const label = value => typeof value === 'string' ? value.slice(0, 100) : null;
export const dimensions = ['guild', 'race', 'statPolicy', 'boost', 'targetCircle',
  'minutesCap', 'concurrency', 'startingCircle', 'comparisonType', 'arena'];

export function sameCohort(a, b) {
  return dimensions.every(key => a[key] != null && b[key] != null && a[key] === b[key]);
}

export function evidence(row) {
  const missing = Array.isArray(row.finalRequirements?.missing)
    ? row.finalRequirements.missing.map(r => ({ label: label(r.label),
      have: number(r.have), need: number(r.need) })) : null;
  const validMissing = missing && missing.every(r => r.label && r.have != null && r.need != null);
  const circle = number(row.circle), target = number(row.targetCircle);
  const reached = circle != null && target != null ? circle >= target : null;
  const gap = validMissing ? missing.reduce((sum, r) => sum + Math.max(0, r.need - r.have), 0) : null;
  const first = number(row.shortfallFirst), last = number(row.shortfallLast);
  return {
    runId: label(row.run_id), timestamp: label(row.ts), variant: label(row.variant),
    cohort: Object.fromEntries(dimensions.map(k => [k, typeof row[k] === 'number' ? number(row[k]) : label(row[k])])),
    codeRevision: label(row.codeRevision), scriptHash: label(row.scriptHash),
    circle, targetReached: reached,
    completionFlagConflict: typeof row.completedTarget === 'boolean' && reached != null && reached !== row.completedTarget,
    requirementTarget: number(row.finalRequirements?.target), missing: validMissing ? missing : null,
    remainingGap: gap, reportedGap: last,
    gapConflict: gap != null && last != null && gap !== last,
    gapClosure: first != null && last != null ? first - last : null,
    durationMs: number(row.durationMs), timeToCircleMs: number(row.timeToCircleMs),
    deaths: number(row.deaths), kills: number(row.kills), refusals: number(row.refusals),
    commands: Object.fromEntries(['moves', 'attacks', 'training', 'recovery', 'circle', 'errands', 'info']
      .map(k => [k, number(row.commandCounts?.[k])])),
    telemetry: { expSamples: Array.isArray(row.expRateSamples) ? row.expRateSamples.length : null,
      lastGapTimestamp: label(row.gapsSamples?.at(-1)?.ts),
      gapsSamples: Array.isArray(row.gapsSamples) ? row.gapsSamples.length : null },
  };
}

export const questions = {
  investigation: { type: 'choice',
    instructions: 'Select ONE area to inspect next from the supplied completed-run evidence. This is an investigation hypothesis, not a proven cause. Use missing labels and observed command coverage. If facts are insufficient, choose insufficient_evidence. Never infer target completion from kills or EXP.',
    criteria: {
      skill_coverage: 'Required skill lanes are absent or undertrained; inspect curriculum and skill coverage.',
      survival_recovery: 'Recorded deaths or recovery behavior suggest inspecting survival handling.',
      navigation: 'Movement or errands suggest inspecting repeated travel and destinations.',
      trainer_handoff: 'Requirements appear met but the character has not advanced; inspect trainer handoff.',
      insufficient_evidence: 'The supplied facts cannot support a specific investigation.',
    } },
};
