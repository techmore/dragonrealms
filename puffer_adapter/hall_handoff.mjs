// Pure decision seam for the isolated control. Inputs must be received client
// observations, never read from a Player object. This is only the hall subset
// of the Sims supervisor, not a claim of full adaptive-supervisor equivalence.
// Source: race-guild-sweep.mjs TDP/readiness/purse/fallback handoff branches.
export function hallHandoff(facts) {
  const {hunting, inCombat, kills, killsAtVisit, elapsedSinceHallMs,
    elapsedSinceEntryMs, requirementsMet, tdp, silver, helmWorn} = facts;
  const hold = reason => ({action:'hold',reason});
  if (hunting !== true || inCombat !== false) return hold('not_safe_hunting');
  if (![kills,killsAtVisit].every(n=>Number.isInteger(n)&&n>=0)
      || ![elapsedSinceHallMs,elapsedSinceEntryMs].every(n=>Number.isFinite(n)&&n>=0)
      || kills < killsAtVisit || typeof requirementsMet !== 'boolean') return hold('unknown_observation');
  const freshKill = kills > killsAtVisit;
  const knownTdp = Number.isFinite(tdp) && tdp >= 0;
  if (knownTdp && tdp < 8 && freshKill && !requirementsMet)
    return {action:'skip',reason:'tdp_below_floor',consumeKills:true};
  if (!knownTdp && (kills-killsAtVisit>=6 || elapsedSinceEntryMs>180000))
    return {action:'probe_tdp',reason:'tdp_unknown',consumeKills:true};
  if (freshKill && requirementsMet)
    return {action:'hall',reason:'requirements_met',skipCircle:false};
  if (freshKill && Number.isFinite(silver) && silver>=40 && typeof helmWorn==='boolean'
      && (helmWorn || silver>=120) && elapsedSinceHallMs>45000)
    return {action:'hall',reason:'purse_trigger',skipCircle:true};
  if (freshKill && elapsedSinceHallMs>240000)
    return {action:'hall',reason:'fallback_timer',skipCircle:true};
  return hold('not_due');
}
