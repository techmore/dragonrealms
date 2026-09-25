// Offline candidate rule for the Jev harness. This is deliberately not
// imported by the live player: replay it against saved legal menus first.
const FIELD_SKILLS=Object.freeze({
  practice_stealth:['stealth'],forage:['foraging'],hunt_signs:['perception'],
  perform:['performance'],study_lore:['scholarship','appraisal'],
});

function isOpenFieldLane(action,state) {
  return skillsForFieldAction(String(action.id||'')).some(skill=>
    (state.requirements?.rows||[]).some(row=>
      /\b(?:survival|lore)$/i.test(String(row.label||''))
      && Number(row.have)<Number(row.need)
      && (row.eligible||[]).includes(skill)
      && Number(state.skills?.[skill]||0)<Number(row.need)));
}

function skillsForFieldAction(actionId) {
  if(FIELD_SKILLS[actionId]) return FIELD_SKILLS[actionId];
  if(/^appraise_[a-z0-9_]+$/.test(actionId)) return ['appraisal'];
  return [];
}

/**
 * Counterfactually release a stalled safe hunter to a directly offered
 * Survival/Lore action. Only substitutes a fresh optional fight; travel to
 * fields is preserved because it unlocks combat-gate opportunities. Quests,
 * corpses, gear, healing, training, and unsafe states remain under the existing
 * supervisor/provider.
 */
export function releaseStalledFieldPractice({options,selected,state,afterSeconds=180,recentActions}) {
  if (!Array.isArray(options)||!selected?.action||!state
      || !Number.isFinite(afterSeconds)||afterSeconds<0) return null;
  const hpFraction=Number(state.hp)/Math.max(1,Number(state.maxHp));
  if (state.inCombat!==false || hpFraction<0.75 || (state.bleeding||[]).length
      || state.overloaded || state.quest
      || Number(state.trainingProgress?.secondsSinceGateProgress||0)<afterSeconds)
    return null;
  const optionalHunt=/^attack_\d+$/.test(selected.action.id);
  if (!optionalHunt) return null;
  const recentCounts=new Map();
  for(const recent of (Array.isArray(recentActions)?recentActions:state.recentActions)||[])
    if(recent?.id) recentCounts.set(recent.id,(recentCounts.get(recent.id)||0)+1);
  const candidates=options.map((action,index)=>({action,index,
    skills:skillsForFieldAction(String(action.id||''))})).filter(row=>isOpenFieldLane(row.action,state))
    .map(row=>({ ...row,rank:Math.min(...row.skills.filter(skill=>
      (state.requirements?.rows||[]).some(req=>/\b(?:survival|lore)$/i.test(String(req.label||''))
        && Number(req.have)<Number(req.need)&&(req.eligible||[]).includes(skill)))
      .map(skill=>Number(state.skills?.[skill]||0))),
      recentCount:recentCounts.get(row.action.id)||0 } ))
    .sort((a,b)=>a.rank-b.rank||a.recentCount-b.recentCount||a.index-b.index);
  if (!candidates.length) return null;
  const chosen=candidates[0];
  return {...selected,action:chosen.action,probability:null,
    overrideReason:'release-stalled-safe-field-lane-before-optional-hunt',
    supervisorReleaseReason:'stalled-safe-field-practice-counterfactual',
    releasedSkill:chosen.skills.find(skill=>
      Number(state.skills?.[skill]||0)===chosen.rank) || null};
}
