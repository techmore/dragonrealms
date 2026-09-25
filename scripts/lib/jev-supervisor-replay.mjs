import { superviseGoalAction } from './jev-player-policy.mjs';
import { buildLaneCoachContext, preserveMappedChoice } from './jev-lane-coach.mjs';
import { releaseStalledFieldPractice } from './jev-stall-field-release.mjs';
import { prioritizeTrainingFundsQuest } from './jev-training-funds-quest.mjs';
import { inspectDistinctWeaponTraining, prioritizeDistinctWeaponTraining } from './jev-distinct-weapon-training.mjs';
import { attachRecentSkillCensus } from './jev-skill-census.mjs';

// Re-evaluate one saved provider choice against its original legal menu and
// current supervisor. This is an offline diagnostic: it never sends commands.
export function replaySupervisorDecision(event, { laneCoach = false, recentActions,
  repeatedOverrideReleaseAfter = 0, stalledFieldPracticeReleaseAfter = 0,
  stalledFieldPracticeRecentActions,
  trainingFundsQuestMinimumSilver = 0, distinctWeaponTraining = false,
  distinctWeaponTrainingRecentActions } = {}) {
  if (!event || !Array.isArray(event.options) || !event.state)
    return { status:'invalid-record' };
  const recordedChoice = event.providerChoice;
  if (typeof recordedChoice !== 'string')
    return { status:'missing-provider-choice', recordedChoice:null };
  if (recordedChoice === 'emergency_flee'
      || recordedChoice === 'provider_error')
    return { status:'not-provider-choice', recordedChoice:recordedChoice || null };
  const actionIdCounts = new Map();
  for (const option of event.options)
    actionIdCounts.set(option.id,(actionIdCounts.get(option.id) || 0)+1);
  const duplicateOfferedIds = [...actionIdCounts].filter(([,count])=>count>1)
    .map(([id,count])=>({id,count}));
  const state = { ...event.state,
    recentActions:Array.isArray(recentActions)?recentActions:(event.state.recentActions || []) };
  let result = superviseGoalAction(event.options, { next_action:{
    choice:recordedChoice,
    probabilities:event.actionScores || {},
    confidence:event.choiceConfidence ?? null,
  } }, {
    guild:state.character?.guild || state.guild,
    inCombat:Boolean(state.inCombat), hp:state.hp, maxHp:state.maxHp,
    silver:state.silver, quest:state.quest, skills:state.skills,
    wieldedWeaponSkill:state.wieldedWeaponSkill,
    requirements:state.requirements,
    learnedAbilities:state.learnedAbilities || [],
    purchasedItems:state.purchasedItems || [],
    sustainedDamage:Boolean(state.combatEvidence?.sustainedDamage),
    trainingProgress:state.trainingProgress,room:state.room,
    recentActions:state.recentActions || [],
    repeatedOverrideReleaseAfter,
  });
  if (!result) return { status:'choice-not-in-recorded-menu', recordedChoice };
  const uncoachedSupervisorChoice=result.action.id;
  const uncoachedOverrideReason=result.overrideReason || null;
  const resultBeforeCoaching=result;
  const coaching=laneCoach ? preserveMappedChoice({
    context:buildLaneCoachContext(state,event.options),options:event.options,choice:recordedChoice,
    supervised:result,enabled:true,
    safetyOverride:Boolean(state.inCombat && (Number(state.hp)/Math.max(1,Number(state.maxHp))<0.4
      || state.combatEvidence?.sustainedDamage)),
  }) : {result,preserved:false};
  result=coaching.result;
  const fieldRelease=stalledFieldPracticeReleaseAfter>0
    ? releaseStalledFieldPractice({options:event.options,selected:result,state,
      recentActions:Array.isArray(stalledFieldPracticeRecentActions)
        ?stalledFieldPracticeRecentActions:state.recentActions,
      afterSeconds:stalledFieldPracticeReleaseAfter}) : null;
  const fundsQuest=trainingFundsQuestMinimumSilver>0
    ? prioritizeTrainingFundsQuest({options:event.options,selected:resultBeforeCoaching,state,
      minimumSilver:trainingFundsQuestMinimumSilver}) : null;
  const weaponTrainingState={...state,recentActions:Array.isArray(distinctWeaponTrainingRecentActions)
    ? distinctWeaponTrainingRecentActions : state.recentActions};
  const weaponTrainingInput={options:event.options,selected:resultBeforeCoaching,state:weaponTrainingState};
  const weaponTrainingReadiness=distinctWeaponTraining
    ? inspectDistinctWeaponTraining(weaponTrainingInput).reason:null;
  const weaponTraining=distinctWeaponTraining
    ? prioritizeDistinctWeaponTraining(weaponTrainingInput):null;
  return {
    status:'replayed', ts:event.ts, provider:event.provider || event.type,
    recordedChoice, supervisedChoice:result.action.id,
    uncoachedSupervisorChoice,uncoachedOverrideReason,
    supervisedActionDescription:event.options.find(option=>option.id===result.action.id)?.description||null,
    supervisedActionPathLength:event.options.find(option=>option.id===result.action.id)?.pathLength??null,
    changed:result.action.id !== recordedChoice,
    overrideReason:result.overrideReason || null,
    supervisorReleaseReason:result.supervisorReleaseReason || null,
    laneCoachPreserved:coaching.preserved,
    fieldReleaseChoice:fieldRelease?.action.id||null,
    fieldReleaseSkill:fieldRelease?.releasedSkill||null,
    trainingFundsQuestChoice:fundsQuest?.action.id||null,
    distinctWeaponTrainingChoice:weaponTraining?.action.id||null,
    distinctWeaponTrainingAdvertisedBudget:weaponTraining?.advertisedBudget??null,
    distinctWeaponTrainingReadiness:weaponTrainingReadiness,
    fieldReleaseDescription:fieldRelease?.action.description||null,
    fieldReleasePathLength:fieldRelease?.action.pathLength??null,
    offeredActionIds:event.options.map(option => option.id),
    duplicateOfferedIds,
  };
}

export function summarizeSupervisorReplay(events, { laneCoach = false,
  repeatedOverrideReleaseAfter = 0, stalledFieldPracticeReleaseAfter = 0,
  trainingFundsQuestMinimumSilver = 0, distinctWeaponTraining = false } = {}) {
  events=attachRecentSkillCensus(events).filter(event=>
    ['local-decision','jev-decision'].includes(event?.type)
      &&Array.isArray(event.options)&&event.state);
  // Each treatment gets its own evolving action history. Sharing the coached
  // history with the uncoached comparison lets preserved choices erase the
  // override streak that the control would actually accumulate.
  let simulatedActions=null,uncoachedActions=null,distinctWeaponActions=[],fieldReleaseActions=[];
  const records=events.map(event=>{
    const initial=event.state?.recentActions || [];
    const coachedSeed=simulatedActions ?? initial;
    const uncoachedSeed=uncoachedActions ?? initial;
    const coached=replaySupervisorDecision(event,{laneCoach,recentActions:coachedSeed,
      repeatedOverrideReleaseAfter,stalledFieldPracticeReleaseAfter,
      stalledFieldPracticeRecentActions:stalledFieldPracticeReleaseAfter
        ?[...(event.state?.recentActions||[]),...fieldReleaseActions].slice(-12):undefined,
      trainingFundsQuestMinimumSilver,distinctWeaponTraining,
      distinctWeaponTrainingRecentActions:distinctWeaponTraining
        ?[...(event.state?.recentActions||[]),...distinctWeaponActions].slice(-12):undefined});
    if (distinctWeaponTraining && coached.status==='replayed'&&coached.distinctWeaponTrainingChoice)
      distinctWeaponActions=[...distinctWeaponActions,{at:event.ts||null,
        id:coached.distinctWeaponTrainingChoice,room:event.state?.room||null}].slice(-12);
    if(stalledFieldPracticeReleaseAfter&&coached.status==='replayed'&&coached.fieldReleaseChoice)
      fieldReleaseActions=[...fieldReleaseActions,{at:event.ts||null,
        id:coached.fieldReleaseChoice,room:event.state?.room||null}].slice(-12);
    if (!laneCoach) {
      if (coached.status==='replayed') simulatedActions=[...coachedSeed,{
        at:event.ts || null,id:coached.supervisedChoice,room:event.state?.room || null,
        providerChoice:coached.recordedChoice,overrideReason:coached.overrideReason || null,
      }].slice(-12);
      else if (simulatedActions===null) simulatedActions=[...coachedSeed];
      return coached;
    }
    const uncoached=replaySupervisorDecision(event,{laneCoach:false,recentActions:uncoachedSeed,
      repeatedOverrideReleaseAfter});
    if (coached.status==='replayed' && uncoached.status==='replayed') {
      simulatedActions=[...coachedSeed,{at:event.ts || null,id:coached.supervisedChoice,
        room:event.state?.room || null,providerChoice:coached.recordedChoice,
        overrideReason:coached.overrideReason || null}].slice(-12);
      uncoachedActions=[...uncoachedSeed,{at:event.ts || null,id:uncoached.supervisedChoice,
        room:event.state?.room || null,providerChoice:uncoached.recordedChoice,
        overrideReason:uncoached.overrideReason || null}].slice(-12);
      return {...coached,uncoachedSupervisorChoice:uncoached.supervisedChoice,
        uncoachedOverrideReason:uncoached.overrideReason};
    }
    if (simulatedActions===null) simulatedActions=[...coachedSeed];
    if (uncoachedActions===null) uncoachedActions=[...uncoachedSeed];
    return coached;
  });
  const replayed = records.filter(record => record.status === 'replayed');
  const byReason = {};
  const uncoachedByReason = {};
  for (const record of replayed) {
    if (!record.overrideReason) continue;
    byReason[record.overrideReason] = (byReason[record.overrideReason] || 0) + 1;
  }
  for (const record of replayed) {
    if (!record.uncoachedOverrideReason) continue;
    uncoachedByReason[record.uncoachedOverrideReason]
      = (uncoachedByReason[record.uncoachedOverrideReason] || 0) + 1;
  }
  const uncoachedChanges=replayed.filter(record=>
    record.uncoachedSupervisorChoice!==record.recordedChoice).length;
  return {
    decisions:records.length,
    replayed:replayed.length,
    changed:replayed.filter(record => record.changed).length,
    uncoachedChanges,
    unchanged:replayed.filter(record => !record.changed).length,
      laneCoachPreserved:replayed.filter(record=>record.laneCoachPreserved).length,
    stalledFieldPracticeReleases:replayed.filter(record=>record.fieldReleaseChoice).length,
    stalledFieldPracticeByAction:Object.fromEntries(replayed.filter(record=>record.fieldReleaseChoice)
      .reduce((counts,record)=>counts.set(record.fieldReleaseChoice,
        (counts.get(record.fieldReleaseChoice)||0)+1),new Map())),
    stalledFieldPracticeBySkill:Object.fromEntries(replayed.filter(record=>record.fieldReleaseChoice)
      .reduce((counts,record)=>counts.set(record.fieldReleaseSkill||'unknown',
        (counts.get(record.fieldReleaseSkill||'unknown')||0)+1),new Map())),
    stalledFieldPracticeBaselines:Object.fromEntries(replayed.filter(record=>record.fieldReleaseChoice)
      .reduce((counts,record)=>counts.set(record.supervisedChoice,
        (counts.get(record.supervisedChoice)||0)+1),new Map())),
    stalledFieldPracticeDisplacedHuntDecisions:replayed.filter(record=>record.fieldReleaseChoice
      &&/^attack_\d+$/.test(record.supervisedChoice||'')).length,
    stalledFieldPracticeDisplacedTravelDecisions:replayed.filter(record=>record.fieldReleaseChoice
      &&/^travel_fields_/.test(record.supervisedChoice||'')).length,
    stalledFieldPracticeDisplacedTravelSteps:replayed.filter(record=>record.fieldReleaseChoice
      &&/^travel_fields_/.test(record.supervisedChoice||'')
      &&Number.isFinite(Number(record.supervisedActionPathLength)))
      .reduce((sum,record)=>sum+Number(record.supervisedActionPathLength),0),
    trainingFundsQuestOpportunities:replayed.filter(record=>record.trainingFundsQuestChoice).length,
    trainingFundsQuestBaselines:Object.fromEntries(replayed.filter(record=>record.trainingFundsQuestChoice)
      .reduce((counts,record)=>counts.set(record.supervisedChoice,
        (counts.get(record.supervisedChoice)||0)+1),new Map())),
    distinctWeaponTrainingOpportunities:replayed.filter(record=>record.distinctWeaponTrainingChoice).length,
    distinctWeaponTrainingBaselines:Object.fromEntries(replayed.filter(record=>record.distinctWeaponTrainingChoice)
      .reduce((counts,record)=>counts.set(record.supervisedChoice,
        (counts.get(record.supervisedChoice)||0)+1),new Map())),
    distinctWeaponTrainingBudgetCounts:Object.fromEntries(replayed.filter(record=>record.distinctWeaponTrainingChoice)
      .reduce((counts,record)=>counts.set(record.distinctWeaponTrainingAdvertisedBudget,
        (counts.get(record.distinctWeaponTrainingAdvertisedBudget)||0)+1),new Map())),
    distinctWeaponTrainingReadinessReasons:Object.fromEntries(replayed.filter(record=>record.distinctWeaponTrainingReadiness)
      .reduce((counts,record)=>counts.set(record.distinctWeaponTrainingReadiness,
        (counts.get(record.distinctWeaponTrainingReadiness)||0)+1),new Map())),
    skipped:records.length - replayed.length,
    missingProviderChoice:records.filter(record=>record.status==='missing-provider-choice').length,
    menusWithDuplicateActionIds:replayed.filter(record=>record.duplicateOfferedIds.length).length,
    duplicateActionIdOccurrences:replayed.reduce((sum,record)=>sum
      + record.duplicateOfferedIds.reduce((count,row)=>count+row.count-1,0),0),
    byReason,
    uncoachedByReason,
    repeatedOverridePassThroughs:replayed.filter(record=>record.supervisorReleaseReason).length,
    records,
  };
}
