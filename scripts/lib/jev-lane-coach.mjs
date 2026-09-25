// Additive, decision-only coaching context for the Jev harness. This module
// never chooses or executes an action: Jev still selects from the legal menu.
// It makes the gate-to-action map explicit and preserves a chosen lane long
// enough for the game's delayed EXP pulses to become visible.

const ACTION_SKILLS = Object.freeze({
  forage:['foraging'], hunt_signs:['perception'], practice_stealth:['stealth'],
  perform:['performance'], practice_brawling:['brawling'],
  study_lore:['scholarship','appraisal'], analyze_flame:['expertise','tactics'],
});

const LEARNING_STATES = [
  'clear', 'dabbling', 'perusing', 'learning', 'thoughtful', 'thinking',
  'considering', 'pondering', 'ruminating', 'concentrating', 'attentive',
  'deliberative', 'interested', 'examining', 'understanding', 'absorbing',
  'intrigued', 'scrutinizing', 'analyzing', 'studious', 'focused',
  'very focused', 'engaged', 'very engaged', 'cogitating', 'fascinated',
  'captivated', 'engrossed', 'riveted', 'very riveted', 'rapt', 'very rapt',
  'enthralled', 'nearly locked', 'mind lock',
];

const skillKey = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function learningForSkill(state, skill) {
  const key = skillKey(skill);
  const row = (state.skillLearning || []).find(item => skillKey(item.name) === key);
  if (!row) return null; // The wire feed is top-10; absence is unknown, not clear.
  const stage = LEARNING_STATES.indexOf(String(row.mindstate || '').toLowerCase());
  return {rank:Number(row.rank) || 0,stage};
}

function actionSkills(action) {
  const skills = new Set(ACTION_SKILLS[action.id] || []);
  if (/^skin_/.test(action.id)) skills.add('skinning');
  if (/^appraise_/.test(action.id)) skills.add('appraisal');
  if (/^attack_\d+$/.test(action.id)) skills.add('melee_mastery');
  const trains = String(action.description || '').matchAll(/\b(?:trains?|practice)\s+(?:the\s+)?([a-z][a-z_]+)\b/gi);
  for (const [,skill] of trains) skills.add(skill.toLowerCase());
  return [...skills];
}

function unmetRows(state) {
  return (state.requirements?.rows || []).filter(row => Number(row.have) < Number(row.need));
}

function candidateLanes(state, options) {
  const rows = unmetRows(state);
  return options.flatMap(action => {
    const skills=actionSkills(action);
    if (/^attack_\d+$/.test(action.id) && state.wieldedWeaponSkill)
      skills.push(String(state.wieldedWeaponSkill).toLowerCase());
    return skills.flatMap(skill => {
    const eligible = rows.filter(row => (row.eligible || []).includes(skill));
    if (!eligible.length) return [];
    const rank = Number(state.skills?.[skill]) || 0;
    const openRows = eligible.map(row => ({label:row.label,have:Number(row.have)||0,need:Number(row.need)||0}));
    const learning=learningForSkill(state,skill);
    return [{actionId:action.id,skill,rank,learningStage:learning?.stage ?? null,openRows,
      advances:openRows.map(row=>row.label)}];
    });
  });
}

/**
 * Return compact, evidence-grounded context to add to a provider's choice
 * payload. `commitment` is optional prior output from this function; callers
 * may persist it between decisions. The model remains the sole action chooser.
 */
export function buildLaneCoachContext(state = {}, options = [], commitment = null, nowMs = Date.now()) {
  const candidates = candidateLanes(state, options);
  const rows=unmetRows(state);
  const openLanes=[...new Set(rows.flatMap(row=>row.eligible || []))].map(skill=>({
    skill,rank:Number(state.skills?.[skill]) || 0,
    learningStage:learningForSkill(state,skill)?.stage ?? null,
    rows:rows.filter(row=>(row.eligible || []).includes(skill)).map(row=>row.label),
    offeredActions:[...new Set(candidates.filter(item=>item.skill===skill)
      .map(item=>item.actionId))],
  }));
  const currentLane = commitment && openLanes.find(lane => lane.skill === commitment.skill);
  const observedRankAdvance = Boolean(currentLane
    && Number(currentLane.rank) > Number(commitment.lastObservedRank ?? commitment.rank ?? 0));
  const observedLearningAdvance = Boolean(currentLane?.learningStage !== null
    && currentLane?.learningStage !== undefined
    && Number(currentLane.learningStage) > Number(commitment.lastObservedLearningStage ?? -1));
  const secondsWithoutRankProgress = commitment && !observedRankAdvance
    ? Math.max(0,Math.floor((nowMs-Number(commitment.lastRankProgressAt || nowMs))/1000)) : 0;
  const secondsWithoutLearningProgress = commitment && !observedLearningAdvance
    ? Math.max(0,Math.floor((nowMs-Number(commitment.lastLearningProgressAt || nowMs))/1000)) : 0;
  const current = currentLane ? {...currentLane,secondsWithoutRankProgress,
    secondsWithoutLearningProgress,rankAdvancedSinceLastDecision:observedRankAdvance,
    learningAdvancedSinceLastDecision:observedLearningAdvance} : null;
  const instructions = [
    'Choose the action that best advances an unmet displayed requirement; the listed mapping is calculated from this legal menu.',
    'A distinct-skill row can be filled by only one skill. Prefer an unranked eligible lane when it closes another row.',
    'Once you choose a useful practice lane, keep using it while it is learning and the row remains open; EXP ranks update on delayed pulses, so do not switch merely because rank has not changed on the next decision.',
    'The harness records progress and handles safety and legality; you retain the choice among offered actions.',
  ];
  if (current) instructions.push(`Current lane commitment: ${current.skill} (rank ${current.rank}), still contributes to ${current.rows.join(', ')}. Continue it when an offered action safely advances it; if unavailable, choose another useful legal action without forgetting the commitment.`);
  if (current?.rankAdvancedSinceLastDecision)
    instructions.push(`The committed lane just advanced to rank ${current.rank}; continue while useful.`);
  else if (current?.learningAdvancedSinceLastDecision)
    instructions.push('The committed lane just advanced in its observed learning mindstate; it is making experience progress even though its rank has not changed yet. Continue while useful.');
  else if (current && current.secondsWithoutRankProgress >= 400
      && current.secondsWithoutLearningProgress >= 400)
    instructions.push(`The committed lane has shown neither a rank increase nor a learning-mindstate advance for ${current.secondsWithoutRankProgress}s, beyond two 200-second EXP pulses. Reconsider it against other offered open lanes; do not repeat it blindly.`);
  return {
    version:'jev-lane-coach-v2-rank-and-mindstate-progress',
    mode:'advisory-only-no-action-override',
    instructions,
    openLanes,
    candidates,
    commitment:current ? {skill:current.skill,rank:current.rank,rows:current.rows,
      secondsWithoutRankProgress:current.secondsWithoutRankProgress,
      secondsWithoutLearningProgress:current.secondsWithoutLearningProgress,
      rankAdvancedSinceLastDecision:current.rankAdvancedSinceLastDecision,
      learningAdvancedSinceLastDecision:current.learningAdvancedSinceLastDecision}
      : null,
  };
}

/** Record Jev's choice only when it maps to an actually unmet requirement. */
export function recordLaneChoice(context, choice) {
  const candidate = (context?.candidates || []).find(item => item.actionId === choice);
  return candidate ? {skill:candidate.skill,actionId:choice,rows:candidate.advances}
    : null;
}

/** Update the observation-only commitment; this never alters the chosen action. */
export function advanceLaneCommitment(context, previous, choice, nowMs = Date.now()) {
  const candidate=(context?.candidates || []).find(item=>item.actionId===choice);
  if (!candidate) {
    const stillOpen=previous && context?.openLanes?.find(lane=>lane.skill===previous.skill);
    if (!stillOpen) return null;
    const advanced=Number(stillOpen.rank)>Number(previous.lastObservedRank ?? previous.rank ?? 0);
    const learningStage=stillOpen.learningStage;
    const learningAdvanced=learningStage !== undefined && learningStage !== null
      && learningStage>Number(previous.lastObservedLearningStage ?? -1);
    return {...previous,rank:stillOpen.rank,lastObservedRank:stillOpen.rank,
      rows:stillOpen.rows,
      startedAt:previous.startedAt ?? nowMs,
      lastRankProgressAt:advanced?nowMs:(previous.lastRankProgressAt ?? nowMs),
      lastObservedLearningStage:learningStage ?? previous.lastObservedLearningStage ?? null,
      lastLearningProgressAt:learningAdvanced?nowMs:(previous.lastLearningProgressAt ?? nowMs),
      decisions:(previous.decisions || 0)+1};
  }
  const sameLane=previous?.skill===candidate.skill;
  const rankAdvanced=sameLane && Number(candidate.rank)>Number(previous.lastObservedRank ?? previous.rank ?? 0);
  const learningAdvanced=sameLane && candidate.learningStage !== null
    && candidate.learningStage !== undefined
    && candidate.learningStage>Number(previous.lastObservedLearningStage ?? -1);
  return {skill:candidate.skill,actionId:candidate.actionId,rank:candidate.rank,
    rows:[...new Set(candidate.advances)],startedAt:sameLane?(previous.startedAt ?? nowMs):nowMs,
    lastObservedRank:candidate.rank,
    lastRankProgressAt:!sameLane||rankAdvanced?nowMs:(previous.lastRankProgressAt ?? nowMs),
    lastObservedLearningStage:candidate.learningStage ?? (sameLane?previous.lastObservedLearningStage:null),
    lastLearningProgressAt:!sameLane||learningAdvanced?nowMs:(previous.lastLearningProgressAt ?? nowMs),
    decisions:sameLane?(previous.decisions || 0)+1:1};
}

/** Preserve Jev's gate-mapped choice against the known field-practice override only. */
export function preserveMappedChoice({context,options,choice,supervised,enabled=false,safetyOverride=false}) {
  if (!enabled || safetyOverride
      || supervised?.overrideReason!=='practice-least-developed-open-survival-or-lore-lane')
    return {result:supervised,preserved:false,skill:null};
  const mapping=recordLaneChoice(context,choice);
  const action=options?.find(option=>option.id===choice);
  if (!mapping || !action) return {result:supervised,preserved:false,skill:null};
  return {result:{...supervised,action,probability:supervised.probabilities?.[choice] ?? null,
    overrideReason:null,laneCoachPreserved:true},preserved:true,skill:mapping.skill};
}
