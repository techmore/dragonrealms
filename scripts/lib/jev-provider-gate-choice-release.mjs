// Offline-only counterfactual for testing whether the supervisor suppresses a
// safe Jev choice that directly advances a displayed open requirement.
import { mappedActionSkills } from './jev-loop-audit.mjs';

const ACTIVE_ROUTE_OVERRIDE='route-to-fields-for-open-combat-gates';

export function providerGateChoiceRelease(event) {
  const choice=String(event?.providerChoice||'');
  const state=event?.state||{};
  const options=Array.isArray(event?.options)?event.options:[];
  const action=options.find(option=>String(option?.id||'')===choice);
  if(event?.supervisorOverride!==ACTIVE_ROUTE_OVERRIDE||!action)
    return {eligible:false,reason:'not-an-offered-provider-choice-overridden-by-field-route'};

  const hp=Number(state.hp),maxHp=Number(state.maxHp);
  const bleeding=Array.isArray(state.bleeding)?state.bleeding.length>0
    :state.bleeding===true||(Number(state.bleeding)||0)>0;
  if(state.inCombat!==false||!(maxHp>0)||hp/maxHp<0.75||bleeding)
    return {eligible:false,reason:'unsafe-or-unknown-vitals'};
  const quest=state.quest;
  const pendingDelivery=Boolean(quest&&/deliver/i.test(String(quest.type||quest.kind||''))
    &&!quest.completed&&!quest.complete);
  if(pendingDelivery)return {eligible:false,reason:'pending-delivery-quest'};

  const openSkills=new Set((state.requirements?.rows||[])
    .filter(row=>Number(row.have)<Number(row.need))
    .flatMap(row=>Array.isArray(row.eligible)?row.eligible.map(String):[]));
  const mappedSkills=mappedActionSkills({id:choice,state}).filter(skill=>openSkills.has(skill));
  if(!mappedSkills.length)
    return {eligible:false,reason:'provider-choice-not-mapped-to-an-open-requirement'};
  return {eligible:true,choice,skills:mappedSkills,
    displacedAction:String(event.id||''),displacedOverride:ACTIVE_ROUTE_OVERRIDE,
    interpretation:'Safe-menu counterfactual only. It preserves a legal provider choice mapped to an open requirement instead of a field-route override. It does not predict command success, EXP, later navigation, or Circle progress.'};
}

export function summarizeProviderGateChoiceRelease(events=[]) {
  const decisions=events.filter(event=>['jev-decision','local-decision'].includes(event?.type)
    &&event.state&&typeof event.providerChoice==='string');
  const records=decisions.map(event=>({at:event.ts||null,...providerGateChoiceRelease(event)}));
  const released=records.filter(record=>record.eligible);
  const byAction={},bySkill={},displacedActions={};
  for(const record of released){
    byAction[record.choice]=(byAction[record.choice]||0)+1;
    displacedActions[record.displacedAction]=(displacedActions[record.displacedAction]||0)+1;
    for(const skill of record.skills)bySkill[skill]=(bySkill[skill]||0)+1;
  }
  return {
    decisions:decisions.length,
    providerChoicesExamined:decisions.length,
    routeOverrideMenus:decisions.filter(event=>event.supervisorOverride===ACTIVE_ROUTE_OVERRIDE).length,
    releases:released.length,byAction,bySkill,displacedActions,records,
    scope:'Fixed-menu offline counterfactual; no command is executed and no progression is simulated.',
  };
}
