// Runtime-only gate for provider choices prepared during combat roundtime.
// This never changes game mechanics; it delays a selected action until the
// ordinary player-visible RT prompt says the command is legal again.
export function prefetchedCombatActionStatus(pending, state = {}) {
  if (!pending) return 'none';
  const hp=Number(state.hp),maxHp=Number(state.maxHp);
  const safe=Number.isFinite(hp)&&Number.isFinite(maxHp)&&maxHp>0
    && hp/maxHp >= (Number(pending.minHpFraction)||0.75);
  if (!state.inCombat || state.room!==pending.room || !safe
      || !state.actionStillRelevant) return 'cancel';
  if (Number(state.rt)>0 || Date.now()<Number(pending.retryAt||0)) return 'wait';
  return 'execute';
}

export function abilityAdvancesOpenRequirement(abilityId,requirements=[]) {
  const skills=({dragon:['inner_fire','augmentation'],
    tenacity:['inner_fire','warding_magic'],serenity:['inner_fire','warding_magic']})[abilityId] || [];
  return requirements.some(row=>Number(row.have)<Number(row.need)
    &&(row.eligible||[]).some(skill=>skills.includes(skill)));
}

export function canPrefetchBarbarianAbility({guild,inCombat,rt,abilityId,learnedAbilities=[],
  oncePerFightActions=[],innerFire=0,requirements=[],hp,maxHp,minHpFraction=0}={}) {
  if (guild!=='barbarian'||!inCombat||!(Number(rt)>0)
      ||!['dragon','tenacity','serenity'].includes(abilityId)
      ||!learnedAbilities.includes(abilityId)
      ||oncePerFightActions.includes(`ability_${abilityId}`)) return false;
  const floor=Number(minHpFraction);
  if (floor>0 && (!Number.isFinite(Number(hp))||!Number.isFinite(Number(maxHp))
      ||Number(maxHp)<=0||Number(hp)/Number(maxHp)<floor)) return false;
  const cost=({dragon:20,tenacity:25,serenity:20})[abilityId];
  return abilityAdvancesOpenRequirement(abilityId,requirements)&&Number(innerFire)>=cost;
}
