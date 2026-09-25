const MATCHED_FIELDS = [
  'provider','model','guild','race','durationMinutes','targetCircle','statPolicy',
  'experienceBoost','progressionMode','statAllocation','policyVersion',
  'supervisorVersion','codeHashes','rtAbilityPrefetchMinHpFraction',
];
const TERMINAL = new Set(['complete','incomplete','failed','needs-attention']);

const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
};

export function compareJevPlayerPair(baseline,candidate,{baselineCoach='off',candidateCoach='advisory',
  expectedPrefetchHealthFloor=null}={}) {
  const mismatches=[];
  let prefetchHealthTreatment=null;
  if (!baseline || !candidate) mismatches.push('missing-manifest');
  if (baseline && candidate) {
    for (const field of MATCHED_FIELDS) {
      if (baseline[field] == null || candidate[field] == null) {
        mismatches.push(`missing:${field}`);
      } else if (JSON.stringify(canonical(baseline[field]))
          !== JSON.stringify(canonical(candidate[field]))) mismatches.push(field);
    }
    const baselineFloor=Number(baseline.rtAbilityPrefetchMinHpFraction);
    const candidateFloor=Number(candidate.rtAbilityPrefetchMinHpFraction);
    if (Number.isFinite(baselineFloor)&&Number.isFinite(candidateFloor)
        &&baselineFloor!==candidateFloor&&expectedPrefetchHealthFloor!==null
        &&baselineFloor===0&&candidateFloor===Number(expectedPrefetchHealthFloor)) {
      const index=mismatches.indexOf('rtAbilityPrefetchMinHpFraction');
      if (index>=0)mismatches.splice(index,1);
      prefetchHealthTreatment={baseline:baselineFloor,candidate:candidateFloor};
    }
    if ((baseline.laneCoach?.mode ?? 'off') !== baselineCoach) mismatches.push('baseline-laneCoach-mode');
    if ((candidate.laneCoach?.mode ?? 'off') !== candidateCoach) mismatches.push('candidate-laneCoach-mode');
  }
  const terminal=Boolean(baseline && candidate
    && TERMINAL.has(baseline.status) && TERMINAL.has(candidate.status));
  const comparable=mismatches.length===0;
  const metrics=manifest=>{
    const evidence=manifest?.progression?.evidence || {};
    const elapsedMinutes=Number.isFinite(evidence.elapsedSeconds) ? evidence.elapsedSeconds/60 : null;
    const rankPoints=evidence.rankPoints ?? null;
    const kills=Number.isFinite(manifest?.kills) ? manifest.kills : null;
    const requirementRowsClosed=evidence.closedRows ?? null;
    const hours=elapsedMinutes>0?elapsedMinutes/60:null;
    return {
      runId:manifest?.runId ?? null,
      status:manifest?.status ?? 'missing',
      targetReached:typeof manifest?.progression?.targetReached==='boolean'
        ? manifest.progression.targetReached : null,
      circle:evidence.currentCircle ?? manifest?.progression?.currentCircle ?? manifest?.vitals?.circle ?? null,
      rankPoints,
      requiredRankPoints:evidence.requiredRankPoints ?? null,
      requirementRowsClosed,
      requirementRowsUnmet:evidence.unmetRows ?? manifest?.progression?.unmetRequirements ?? null,
      elapsedMinutes,
      rankPointsPerHour:hours&&Number.isFinite(Number(rankPoints))
        ?Number((Number(rankPoints)/hours).toFixed(2)):null,
      requirementRowsClosedPerHour:hours&&Number.isFinite(Number(requirementRowsClosed))
        ?Number((Number(requirementRowsClosed)/hours).toFixed(2)):null,
      kills,
      killsPerHour:hours&&Number.isFinite(Number(kills))
        ?Number((Number(kills)/hours).toFixed(2)):null,
      supervisorOverrides:Number.isFinite(manifest?.supervisorOverrides)
        ? manifest.supervisorOverrides : null,
      stalledChoicePassThroughs:Number.isFinite(manifest?.stalledChoicePassThroughs)
        ? manifest.stalledChoicePassThroughs : null,
      rtAbilityPrefetches:Number.isFinite(manifest?.rtAbilityPrefetches)
        ? manifest.rtAbilityPrefetches : null,
      rtAbilityPrefetchMinHpFraction:Number.isFinite(manifest?.rtAbilityPrefetchMinHpFraction)
        ? manifest.rtAbilityPrefetchMinHpFraction : null,
      rtAbilityPrefetchExecutions:Number.isFinite(manifest?.rtAbilityPrefetchExecutions)
        ? manifest.rtAbilityPrefetchExecutions : null,
      rtAbilityPrefetchCancellations:Number.isFinite(manifest?.rtAbilityPrefetchCancellations)
        ? manifest.rtAbilityPrefetchCancellations : null,
      rtAbilityRoundtimeDeferrals:Number.isFinite(manifest?.rtAbilityRoundtimeDeferrals)
        ? manifest.rtAbilityRoundtimeDeferrals : null,
      laneCoachDecisions:Number.isFinite(manifest?.laneCoach?.decisions)
        ? manifest.laneCoach.decisions : null,
      laneCoachGateMappedChoices:Number.isFinite(manifest?.laneCoach?.gateMappedChoices)
        ? manifest.laneCoach.gateMappedChoices : null,
      laneCoachPreservedProviderChoices:Number.isFinite(manifest?.laneCoach?.preservedProviderChoices)
        ? manifest.laneCoach.preservedProviderChoices : null,
      laneCoachObservedRankAdvances:Number.isFinite(manifest?.laneCoach?.observedRankAdvances)
        ? manifest.laneCoach.observedRankAdvances : null,
      laneCoachObservedLearningMindstateAdvances:Number.isFinite(manifest?.laneCoach?.observedLearningMindstateAdvances)
        ? manifest.laneCoach.observedLearningMindstateAdvances : null,
      laneCoachStalledDecisionPrompts:Number.isFinite(manifest?.laneCoach?.stalledDecisionPrompts)
        ? manifest.laneCoach.stalledDecisionPrompts : null,
      errors:Array.isArray(manifest?.errors) ? manifest.errors.length : null,
      laneCoachMode:manifest?.laneCoach?.mode ?? 'off/legacy',
    };
  };
  const baselineMetrics=metrics(baseline),candidateMetrics=metrics(candidate);
  const deltas={};
  for (const key of ['circle','rankPoints','requirementRowsClosed','requirementRowsUnmet',
    'elapsedMinutes','rankPointsPerHour','requirementRowsClosedPerHour','kills','killsPerHour',
    'supervisorOverrides','stalledChoicePassThroughs',
    'rtAbilityPrefetches','rtAbilityPrefetchExecutions','rtAbilityPrefetchCancellations',
    'rtAbilityRoundtimeDeferrals',
    'laneCoachDecisions','laneCoachGateMappedChoices','laneCoachPreservedProviderChoices',
    'laneCoachObservedRankAdvances','laneCoachObservedLearningMindstateAdvances',
    'laneCoachStalledDecisionPrompts']) {
    const before=baselineMetrics[key],after=candidateMetrics[key];
    const delta=Number.isFinite(before)&&Number.isFinite(after)?after-before:null;
    deltas[key]=delta!==null&&key.endsWith('PerHour')?Number(delta.toFixed(2)):delta;
  }
  return {
    schema:'dragonrealms.jev-player-pair-comparison/1',
    verdict:!comparable?'invalid-pair':terminal?'ready-to-compare':'pending-runs',
    comparable,
    terminal,
    mismatches,
    prefetchHealthTreatment,
    interpretation:'Descriptive matched-run comparison only; one pair does not establish causation or promote a policy.',
    baseline:baselineMetrics,
    candidate:candidateMetrics,
    candidateMinusBaseline:deltas,
  };
}
