const WEAPON_SKILLS=new Set(['small_edged','medium_edged','large_edged','twohanded_edged',
  'blunt','large_blunt','twohanded_blunt','slings','bow','crossbow','staff','polearm',
  'thrown','heavy_thrown','brawling']);

function bleedingObserved(bleeding){
  return Array.isArray(bleeding)?bleeding.length>0
    :bleeding===true||(Number(bleeding)||0)>0;
}

// Explain whether the saved menu is safe and sufficiently observed for a
// distinct-weapon lesson. Missing top-10 mindstate ranks are unknown, never 0.
export function inspectDistinctWeaponTraining({options,state,
  minHpFraction=0.75,maxDistinctLanes=4}={}){
  if(!Array.isArray(options)||!state||!Number.isFinite(minHpFraction)
      ||minHpFraction<0||minHpFraction>1||!Number.isInteger(maxDistinctLanes)
      ||maxDistinctLanes<1)return {reason:'invalid-input'};
  const hpFraction=Number(state.hp)/Math.max(1,Number(state.maxHp));
  if(state.character?.guild!=='barbarian')return {reason:'wrong-guild'};
  if(state.inCombat!==false||hpFraction<minHpFraction||bleedingObserved(state.bleeding)
      ||state.overloaded||(state.quest&&state.quest.done!==true))return {reason:'unsafe-state'};
  if((state.recentActions||[]).some(action=>action?.room===state.room
      &&/^train_(?:small_edged|medium_edged|large_edged|twohanded_edged|blunt|large_blunt|twohanded_blunt|slings|bow|crossbow|staff|polearm|thrown|heavy_thrown|brawling)$/.test(action.id||'')))
    return {reason:'recent-same-room-training'};
  const requirements=state.requirements?.rows;
  if(!Array.isArray(requirements))return {reason:'requirements-unavailable'};
  const weaponRows=requirements.filter(row=>/^(?:\d+(?:st|nd|rd|th) )?weapon$/i.test(String(row.label||''))
    &&Number(row.have)<Number(row.need));
  if(!weaponRows.some(row=>/^4th weapon$/i.test(String(row.label||''))))
    return {reason:'fourth-weapon-gate-not-open'};
  const eligible=[...new Set(weaponRows.flatMap(row=>Array.isArray(row.eligible)?row.eligible:[])
    .filter(skill=>WEAPON_SKILLS.has(skill)))];
  const skills=state.skills&&typeof state.skills==='object'&&!Array.isArray(state.skills)
    ?state.skills:{};
  const observed=eligible.filter(skill=>Object.hasOwn(skills,skill)
    &&skills[skill]!==null&&skills[skill]!==undefined&&Number.isFinite(Number(skills[skill])));
  const unknown=eligible.filter(skill=>!observed.includes(skill));
  if(unknown.length)return {reason:'incomplete-weapon-rank-snapshot',observedSkills:observed,
    unknownSkills:unknown,eligibleSkills:eligible};
  const ranks=Object.fromEntries(eligible.map(skill=>[skill,Number(skills[skill])]));
  const trained=eligible.filter(skill=>ranks[skill]>0);
  if(trained.length>=maxDistinctLanes)return {reason:'distinct-lane-target-met',trainedSkills:trained,
    unknownSkills:[],eligibleSkills:eligible};
  const optionsById=new Map(options.map(option=>[option.id,option]));
  const legal=eligible.filter(skill=>ranks[skill]===0)
    .map(skill=>({skill,option:optionsById.get(`train_${skill}`)})).filter(row=>row.option);
  if(!legal.length)return {reason:'no-legal-zero-rank-weapon-lesson',trainedSkills:trained,
    unknownSkills:[],eligibleSkills:eligible};
  const affordable=legal.map(row=>({...row,budget:Number(String(row.option.description||'')
    .match(/budget\s+(\d+)\s+silvers/i)?.[1])}))
    .find(row=>Number.isFinite(row.budget)&&Number(state.silver)>=row.budget);
  if(!affordable)return {reason:'no-affordable-weapon-lesson',trainedSkills:trained,
    unknownSkills:[],eligibleSkills:eligible,legalChoices:legal.map(row=>row.option.id)};
  return {reason:'ready',action:affordable.option,skill:affordable.skill,
    advertisedBudget:affordable.budget,trainedSkills:trained,unknownSkills:[],eligibleSkills:eligible};
}

// Offline-only counterfactual: prefer an already-offered trainer lesson that
// opens a currently missing distinct weapon lane. No command is synthesized.
export function prioritizeDistinctWeaponTraining(input={}){
  const {options,selected}=input;
  if(!selected?.action)return null;
  const readiness=inspectDistinctWeaponTraining(input);
  if(!readiness.action)return null;
  return {...selected,action:readiness.action,probability:null,
    advertisedBudget:readiness.advertisedBudget,
    overrideReason:'train-new-distinct-weapon-lane-for-circle-gate',
    supervisorReleaseReason:'distinct-weapon-training-counterfactual'};
}
