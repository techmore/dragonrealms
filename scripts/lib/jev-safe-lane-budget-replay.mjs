// Offline-only budget experiment. The same independent cadence policy can be
// reviewed/tested before a future live-run integration.
import { SafeFieldPracticeCadence } from './jev-safe-field-practice.mjs';

/**
 * Fixed-menu counterfactual. every=4 releases one safe open-lane opportunity
 * for every four such opportunities where the baseline already selected a
 * fresh attack. It never replaces travel, a quest, corpse work, or combat.
 */
export function replaySafeLaneBudget(events=[],{every=4,hpFloor=0.75}={}) {
  const decisions=events.filter(event=>['jev-decision','local-decision'].includes(event?.type)
    &&event.state&&typeof event.id==='string');
  const policy=new SafeFieldPracticeCadence({every,hpFloor});
  const displacedByAction={},records=[];
  for(const event of decisions) {
    const choice=policy.consider(event);
    if(!choice.released)continue;
    displacedByAction[choice.baselineAction]=(displacedByAction[choice.baselineAction]||0)+1;
    records.push({at:event.ts||null,providerChoice:event.providerChoice||null,
      baselineAction:choice.baselineAction,candidateAction:choice.option.id,skill:choice.skill,
      supervisorOverride:event.supervisorOverride||null});
  }
  const result=policy.snapshot();
  return {decisions:decisions.length,safeMenusWithOpenLaneChoice:result.safeMenusWithOpenLaneChoice,
    optionalAttackOpportunities:result.optionalAttackOpportunities,every:result.every,releases:result.releases,
    releaseRate:result.optionalAttackOpportunities?result.releases/result.optionalAttackOpportunities:null,
    candidateUseBySkill:result.candidateUseBySkill,candidateUseByAction:result.candidateUseByAction,
    displacedByAction,records,
    scope:'Fixed-menu counterfactual only. Safe, out-of-combat menus with an open Survival/Lore action; one candidate substitution per configured number of baseline optional attacks. No command, movement, EXP, or Circle outcome is simulated.'};
}
