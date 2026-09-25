// Read-only diagnostics for repeated Jev decisions in saved player traces.
// A streak is a review lead, not proof that an action is ineffective: skill
// and requirement ranks can update on delayed experience pulses.
import { ITEMS } from '../../data/items.js';
import { SKILLS } from '../../data/skills.js';
import { attachRecentSkillCensus } from './jev-skill-census.mjs';
import { abilityAdvancesOpenRequirement } from './jev-rt-prefetch.mjs';

const ACTION_SKILLS={
  perform:['performance'],practice_brawling:['brawling'],practice_stealth:['stealth'],
  forage:['foraging'],hunt_signs:['perception'],study_lore:['scholarship','appraisal'],
  analyze_flame:['expertise','tactics','inner_fire'],disarm:['tactics'],berserk:['expertise','inner_fire'],
};
const RANGED_WEAPON_SKILLS=new Set(['slings','bow','crossbow','thrown','heavy_thrown']);
const FIELD_PRACTICE_ACTION=/^(?:perform|practice_stealth|forage|hunt_signs|study_lore|appraise_[a-z0-9_]+)$/;

function gateSnapshot(state = {}) {
  const rows=state.requirements?.rows || [];
  if (!rows.length) return null;
  return {
    points:rows.reduce((sum,row)=>sum+Math.min(Number(row.have)||0,Number(row.need)||0),0),
    closed:rows.filter(row=>Number(row.have)>=Number(row.need)).length,
  };
}

function skillSnapshot(state = {}) {
  return Object.fromEntries(Object.entries(state.skills || {})
    .map(([skill,rank])=>[skill,Number(rank)||0]));
}

// A skillset row is the Nth-highest rank in its eligible pool. An action can
// be nominally eligible yet fail to move that row (e.g. raising the top weapon
// does not advance an untouched 3rd-weapon lane). This models a single rank
// increase for diagnostic sensitivity only; it does not predict EXP or rank
// timing. null means the snapshot cannot support this estimate.
function rankSnapshotMatchesRequirement(row,state) {
  const skills=state.skills;
  if(!skills||typeof skills!=='object')return false;
  const eligible=Array.isArray(row.eligible)?row.eligible.map(String):[];
  const nth=/^(\d+)(?:st|nd|rd|th) (?:weapon|armor|survival|lore|supernatural)$/i
    .exec(String(row.label||''));
  if(!nth&&eligible.length===1)
    return (Number(skills[eligible[0]])||0)===Number(row.have);
  if(!nth)return false;
  // The live harness currently mirrors only the top-10 mindstate feed. An
  // apparently matching order statistic is not proof that unlisted skills
  // are rank 0; require an explicit full-census marker before simulating.
  if(state.skillSnapshotComplete!==true)return false;
  const position=Number(nth[1])-1;
  const ranks=eligible.map(id=>Number(skills[id])||0);
  const sorted=ranks.toSorted((a,b)=>b-a);
  const before=sorted[position]||0;
  return before===Number(row.have);
}

function oneRankMovesRequirement(row,state,skill) {
  const skills=state.skills;
  if(!rankSnapshotMatchesRequirement(row,state))return null;
  const eligible=Array.isArray(row.eligible)?row.eligible.map(String):[];
  if(!eligible.includes(skill))return false;
  const nth=/^(\d+)(?:st|nd|rd|th) (?:weapon|armor|survival|lore|supernatural)$/i
    .exec(String(row.label||''));
  if(!nth)return (Number(skills[skill])||0)<Number(row.need);
  const position=Number(nth[1])-1;
  const ranks=eligible.map(id=>Number(skills[id])||0);
  const before=ranks.toSorted((a,b)=>b-a)[position]||0;
  const index=eligible.indexOf(skill);
  ranks[index]++;
  return (ranks.toSorted((a,b)=>b-a)[position]||0)>before;
}

// Nth-skill requirements are filled by distinct skill lanes, not by repeatedly
// advancing one skill. Keep this summary separate from raw points/row counts.
function distinctLaneCoverage(state = {}) {
  const rows=state.requirements?.rows;
  if (!Array.isArray(rows)) return null;
  const skills=state.skills&&typeof state.skills==='object'&&!Array.isArray(state.skills)
    ?state.skills:{};
  const categories=new Map();
  for (const row of rows) {
    const match=/^(\d+)(?:st|nd|rd|th) (weapon|armor|survival|lore|supernatural)$/i
      .exec(String(row.label||''));
    if (!match) continue;
    const category=match[2].toLowerCase();
    const item=categories.get(category)||{requiredDistinctLanes:0,eligibleSkills:new Set()};
    item.requiredDistinctLanes=Math.max(item.requiredDistinctLanes,Number(match[1]));
    for (const skill of Array.isArray(row.eligible)?row.eligible:[]) item.eligibleSkills.add(String(skill));
    categories.set(category,item);
  }
  return Object.fromEntries([...categories].sort(([a],[b])=>a.localeCompare(b)).map(([category,item])=>{
    const eligibleSkills=[...item.eligibleSkills].sort();
    const observedSkills=eligibleSkills.filter(skill=>Object.hasOwn(skills,skill));
    const rankedSkills=observedSkills.filter(skill=>Number(skills[skill])>0);
    const knownUnrankedSkills=observedSkills.filter(skill=>Number(skills[skill])===0);
    const unknownSkills=eligibleSkills.filter(skill=>!Object.hasOwn(skills,skill));
    const rankSnapshotComplete=unknownSkills.length===0;
    return [category,{requiredDistinctLanes:item.requiredDistinctLanes,
      rankedDistinctLanes:rankedSkills.length,
      // This is a lower bound when the top-10 mindstate feed omits eligible
      // skills; do not present unknown lanes as confirmed rank-zero lanes.
      remainingDistinctLanes:Math.max(0,item.requiredDistinctLanes-rankedSkills.length),
      maxPossibleRankedDistinctLanes:rankedSkills.length+unknownSkills.length,
      rankSnapshotComplete,rankedSkills,remainingSkills:knownUnrankedSkills,
      unknownSkills}];
  }));
}

function decisionEvents(events,{skillCensusMaxAgeSeconds=180}={}) {
  return attachRecentSkillCensus(events,{maxAgeSeconds:skillCensusMaxAgeSeconds})
    .filter(event=>/-decision$/.test(String(event?.type||''))&&event.state
      &&typeof event.id==='string'&&event.id.length>0);
}

export function mappedActionSkills(event) {
  const id=event.id;
  const skills=[...(ACTION_SKILLS[id] || [])];
  if (id.startsWith('ability_')) {
    const ability=id.slice('ability_'.length);
    const abilitySkills=({dragon:['inner_fire','augmentation'],
      tenacity:['inner_fire','warding_magic'],serenity:['inner_fire','warding_magic']})[ability] || [];
    if (abilityAdvancesOpenRequirement(ability,event.state.requirements?.rows || []))
      skills.push(...abilitySkills);
  }
  if (id.startsWith('appraise_')) skills.push('appraisal');
  if (id.startsWith('skin_')) skills.push('skinning');
  if (id.startsWith('train_')) skills.push(id.slice('train_'.length));
  const itemId=/^(?:wield|wear|buy)_([a-z0-9_]+)$/.exec(id)?.[1];
  if (itemId && ITEMS[itemId]?.skill) skills.push(ITEMS[itemId].skill);

  const state=event.state;
  // A visible-prey attack starts the fight when out of combat, so it can open
  // passive defense/armor lanes even though the snapshot is not yet combat.
  const startsCombat=/^attack_\d+$/.test(id) && !state.inCombat;
  const combatChoice=(state.inCombat && (id==='wait' || id==='disarm'
    || /^attack_\d+$/.test(id) || /^focus_\d+$/.test(id) || id==='analyze_flame'
    || id==='berserk' || id.startsWith('ability_'))) || startsCombat;
  if (combatChoice) {
    const weapon=String(state.wieldedWeaponSkill || '');
    if (weapon) skills.push(weapon);
    if (weapon && !RANGED_WEAPON_SKILLS.has(weapon)) skills.push('melee_mastery');
    // These are passive consequences of continuing an ordinary fight, not
    // direct commands. Count only gear visibly reported as equipped.
    skills.push('evasion','parry');
    for (const worn of Object.values(state.equipment || {}).flat()) {
      const equippedId=String(worn?.id || '');
      const wornName=String(worn?.name || '').toLowerCase().replace(/^(a|an|the)\s+/,'');
      const item=ITEMS[equippedId] || Object.values(ITEMS).find(candidate=>
        String(candidate.name || '').toLowerCase().replace(/^(a|an|the)\s+/,'')===wornName);
      if (item?.type==='armor' && item.skill) skills.push(item.skill);
    }
  }
  return [...new Set(skills)];
}

// This is deliberately a menu-coverage check, not an efficacy score. It only
// recognizes explicit action-to-skill mappings; passive combat training and
// compound effects are left unknown rather than guessed.
function offeredChoiceCoverage(decisions) {
  const rows=new Map();
  let decisionsWithRequirements=0;
  for (const event of decisions) {
    const requirements=event.state.requirements?.rows;
    if (!Array.isArray(requirements) || !requirements.length) continue;
    decisionsWithRequirements++;
    const options=Array.isArray(event.options) ? event.options : [];
    const mapped=options.flatMap(option=>mappedActionSkills({id:String(option.id || ''),state:event.state})
      .map(skill=>({skill,actionId:option.id})));
    const selectedSkills=new Set(mappedActionSkills(event));
    const providerChoice=typeof event.providerChoice==='string'?event.providerChoice:'';
    const providerSkills=new Set(providerChoice
      ?mappedActionSkills({id:providerChoice,state:event.state}):[]);
    for (const row of requirements) {
      if (Number(row.have)>=Number(row.need)) continue;
      const key=String(row.label || 'unlabeled');
      const eligible=Array.isArray(row.eligible) ? row.eligible.map(String) : [];
      const matchingActions=[...new Set(mapped.filter(entry=>eligible.includes(entry.skill))
        .map(entry=>entry.actionId))];
      const rankSnapshotKnown=rankSnapshotMatchesRequirement(row,event.state);
      const rankAdvancingActions=[...new Set(mapped.filter(entry=>entry.actionId&&rankSnapshotKnown
        &&oneRankMovesRequirement(row,event.state,entry.skill)===true)
        .map(entry=>entry.actionId))];
      const selectedMatches=matchingActions.includes(event.id)
        && eligible.some(skill=>selectedSkills.has(skill));
      const providerMatches=matchingActions.includes(providerChoice)
        && eligible.some(skill=>providerSkills.has(skill));
      const selectedRankAdvances=rankAdvancingActions.includes(event.id);
      const providerRankAdvances=rankAdvancingActions.includes(providerChoice);
      const record=rows.get(key) || {label:key,eligibleSkills:[...eligible],observations:0,
        withMappedChoice:0,withoutMappedChoice:0,selectedEligibleChoice:0,
        selectedActions:{},providerEligibleChoice:0,providerActions:{},offeredActions:{},
        rankSensitivityKnownObservations:0,rankSensitivityUnknownObservations:0,
        withOneRankAdvancingChoice:0,withoutOneRankAdvancingChoice:0,
        selectedOneRankAdvancingChoice:0,providerOneRankAdvancingChoice:0,
        oneRankAdvancingActions:{},selectedOneRankAdvancingActions:{},providerOneRankAdvancingActions:{}};
      record.observations++;
      if (matchingActions.length) record.withMappedChoice++;
      else record.withoutMappedChoice++;
      if (selectedMatches) {
        record.selectedEligibleChoice++;
        record.selectedActions[event.id]=(record.selectedActions[event.id]||0)+1;
      }
      if (providerMatches) {
        record.providerEligibleChoice++;
        record.providerActions[providerChoice]=(record.providerActions[providerChoice]||0)+1;
      }
      if(rankSnapshotKnown){
        record.rankSensitivityKnownObservations++;
        if(rankAdvancingActions.length)record.withOneRankAdvancingChoice++;
        else record.withoutOneRankAdvancingChoice++;
      }else record.rankSensitivityUnknownObservations++;
      if(selectedRankAdvances){
        record.selectedOneRankAdvancingChoice++;
        record.selectedOneRankAdvancingActions[event.id]=(record.selectedOneRankAdvancingActions[event.id]||0)+1;
      }
      if(providerRankAdvances){
        record.providerOneRankAdvancingChoice++;
        record.providerOneRankAdvancingActions[providerChoice]=(record.providerOneRankAdvancingActions[providerChoice]||0)+1;
      }
      for(const actionId of rankAdvancingActions)
        record.oneRankAdvancingActions[actionId]=(record.oneRankAdvancingActions[actionId]||0)+1;
      for (const actionId of matchingActions)
        record.offeredActions[actionId]=(record.offeredActions[actionId] || 0)+1;
      rows.set(key,record);
    }
  }
  const summarizedRows=[...rows.values()].sort((a,b)=>a.label.localeCompare(b.label))
    .map(row=>({...row,
      providerSelectionRateAmongEligibleMenus:row.withMappedChoice
        ?row.providerEligibleChoice/row.withMappedChoice:null,
      finalSelectionRateAmongEligibleMenus:row.withMappedChoice
        ?row.selectedEligibleChoice/row.withMappedChoice:null,
      providerSelectionRateAmongOneRankAdvancingMenus:row.withOneRankAdvancingChoice
        ?row.providerOneRankAdvancingChoice/row.withOneRankAdvancingChoice:null,
      finalSelectionRateAmongOneRankAdvancingMenus:row.withOneRankAdvancingChoice
        ?row.selectedOneRankAdvancingChoice/row.withOneRankAdvancingChoice:null,
      // Retain this alias for existing report consumers.
      selectionRateAmongEligibleMenus:row.withMappedChoice
        ?row.selectedEligibleChoice/row.withMappedChoice:null}));
  return {
    decisionsWithRequirements,
    rows:summarizedRows,
    interpretation:'Choice funnel telemetry separates Jev providerChoice from final event.id after wrapper/supervisor decisions. Broad eligibility uses explicit action-to-skill mappings and known combat side-effects (current weapon, melee mastery, passive evasion/parry, visibly worn armor). One-rank sensitivity separately simulates a single rank increase against the requirement row, and requires a complete skill census for Nth-skill rows. Current live runs only mirror the top-10 learning feed, so those snapshots are explicitly unknown rather than counted as no effective choice. Rates are conditional on menus with a mapped choice. This is not an EXP, command-success, or causal model.',
  };
}

// Contextual coverage for the specific safe-idle lane-selection question.
// This observes presented options and wrapper decisions; it does not assert
// that a selected command completed or earned experience.
function safeIdleFieldPractice(decisions) {
  const safeIdle=decisions.filter(event=>{
    const state=event.state;
    const hp=Number(state.hp),maxHp=Number(state.maxHp);
    const quest=state.quest;
    const deliveryPending=Boolean(quest && /deliver/i.test(String(quest.type||quest.kind||''))
      && !quest.completed && !quest.complete);
    return state.inCombat===false && maxHp>0 && hp/maxHp>=0.75
      && !(Number(state.bleeding)||0) && !deliveryPending;
  });
  const withFieldChoices=safeIdle.filter(event=>(Array.isArray(event.options)?event.options:[])
    .some(option=>FIELD_PRACTICE_ACTION.test(String(option.id||''))));
  const laneOpportunityCounts={};
  const laneOpportunityActions={};
  let safeDecisionsWithOpenLanePractice=0,selectedOpenLanePractice=0;
  for(const event of safeIdle) {
    const openSkills=new Set((event.state.requirements?.rows||[])
      .filter(row=>Number(row.have)<Number(row.need)
        &&/^(?:\d+(?:st|nd|rd|th) )?(?:survival|lore)$/i.test(String(row.label||'')))
      .flatMap(row=>Array.isArray(row.eligible)?row.eligible.map(String):[]));
    const candidates=(Array.isArray(event.options)?event.options:[]).flatMap(option=>{
      const id=String(option.id||'');
      if(!FIELD_PRACTICE_ACTION.test(id)) return [];
      return mappedActionSkills({id,state:event.state})
        .filter(skill=>openSkills.has(skill)).map(skill=>({id,skill}));
    });
    if(!candidates.length) continue;
    safeDecisionsWithOpenLanePractice++;
    for(const {id,skill} of candidates) {
      laneOpportunityCounts[skill]=(laneOpportunityCounts[skill]||0)+1;
      laneOpportunityActions[id]=(laneOpportunityActions[id]||0)+1;
    }
    if(candidates.some(candidate=>candidate.id===event.id)) selectedOpenLanePractice++;
  }
  const selected={};
  const alternatives={};
  let selectedFieldPractice=0;
  for (const event of withFieldChoices) {
    if (FIELD_PRACTICE_ACTION.test(event.id)) {
      selectedFieldPractice++;
      selected[event.id]=(selected[event.id]||0)+1;
    } else {
      const key=event.id||'unknown';
      const reason=event.supervisorOverride||'none';
      const record=alternatives[key]||{count:0,supervisorOverrides:{}};
      record.count++;
      record.supervisorOverrides[reason]=(record.supervisorOverrides[reason]||0)+1;
      alternatives[key]=record;
    }
  }
  return {
    safeOutOfCombatDecisions:safeIdle.length,
    safeDecisionsOfferingFieldPractice:withFieldChoices.length,
    safeDecisionsWithOpenLanePractice,selectedOpenLanePractice,
    openLanePracticeOpportunitiesBySkill:laneOpportunityCounts,
    openLanePracticeOpportunitiesByAction:laneOpportunityActions,
    selectedFieldPractice,selectedFieldPracticeByAction:selected,
    selectedAlternativeByAction:alternatives,
    selectionRateAmongMenus:withFieldChoices.length?selectedFieldPractice/withFieldChoices.length:null,
    interpretation:'Contextual menu/selection telemetry only. Safe means out of combat, at least 75% HP, no observed bleeding, and no pending delivery quest. Offered options and selected actions do not prove command completion, EXP gain, or causality; excluded decisions may still have other urgent needs.',
  };
}

/**
 * Report consecutive same-action/same-room streaks, distinguishing those
 * with displayed gate movement from flat ones. Defaults require a long window
 * to avoid emphasizing ordinary short decision runs.
 */
export function auditJevDecisionLoops(events, {
  minDecisions=10, minSpanSeconds=120,
} = {}) {
  const decisions=decisionEvents(events);
  const streaks=[],flatGateStreaks=[];
  let current=[];
  const flush=()=>{
    if (current.length < minDecisions) { current=[]; return; }
    const first=current[0],last=current.at(-1);
    const start=Date.parse(first.ts),end=Date.parse(last.ts);
    const spanSeconds=Number.isFinite(start)&&Number.isFinite(end)
      ? Math.max(0,Math.floor((end-start)/1000)) : null;
    const firstGate=gateSnapshot(first.state),lastGate=gateSnapshot(last.state);
    if (!firstGate || !lastGate) { current=[]; return; }
    if (spanSeconds != null && spanSeconds < minSpanSeconds) { current=[]; return; }
    const firstSkills=skillSnapshot(first.state),lastSkills=skillSnapshot(last.state);
    const changedSkills=Object.keys({...firstSkills,...lastSkills}).flatMap(skill=>{
      const before=firstSkills[skill]||0,after=lastSkills[skill]||0;
      return before===after?[]:[{skill,from:before,to:after}];
    });
    const actionSkills=mappedActionSkills(first);
    const actionSkillDeltas=actionSkills.map(skill=>({skill,
      from:firstSkills[skill]||0,to:lastSkills[skill]||0,
      delta:(lastSkills[skill]||0)-(firstSkills[skill]||0)}));
    const overrides={};
    const providerChoices={};
    for (const event of current) {
      const override=event.supervisorOverride || 'none';
      const choice=event.providerChoice || 'unknown';
      overrides[override]=(overrides[override]||0)+1;
      providerChoices[choice]=(providerChoices[choice]||0)+1;
    }
    const streak={
      actionId:first.id,command:first.command||null,room:first.state.room||null,
      decisions:current.length,spanSeconds,
      firstAt:first.ts||null,lastAt:last.ts||null,
      gate:{rankPoints:firstGate.points,closedRows:firstGate.closed,
        rankPointDelta:lastGate.points-firstGate.points,
        closedRowDelta:lastGate.closed-firstGate.closed},
      actionSkills,actionSkillDeltas,changedSkills,providerChoices,supervisorOverrides:overrides,
      gateProgressObserved:firstGate.points!==lastGate.points||firstGate.closed!==lastGate.closed,
    interpretation:'temporal trace summary, not causal attribution: unchanged gates do not prove failure because rank updates are delayed, and observed gate movement may come from concurrent automatic combat or other actions.',
    };
    streaks.push(streak);
    if (!streak.gateProgressObserved) flatGateStreaks.push(streak);
    current=[];
  };
  for (const event of decisions) {
    const prev=current.at(-1);
    if (prev && (prev.id!==event.id || prev.state.room!==event.state.room)) flush();
    current.push(event);
  }
  flush();

  // Wrapper output may rotate among several practice actions while repeatedly
  // overriding the same Jev choice. Audit that policy loop independently of
  // the executed action so alternating substitutions remain visible.
  const overrideStreaks=[];
  let overrideCurrent=[];
  const flushOverride=()=>{
    if (overrideCurrent.length<minDecisions) { overrideCurrent=[]; return; }
    const first=overrideCurrent[0],last=overrideCurrent.at(-1);
    const start=Date.parse(first.ts),end=Date.parse(last.ts);
    const spanSeconds=Number.isFinite(start)&&Number.isFinite(end)
      ? Math.max(0,Math.floor((end-start)/1000)) : null;
    const firstGate=gateSnapshot(first.state),lastGate=gateSnapshot(last.state);
    if (!firstGate || !lastGate || (spanSeconds!=null&&spanSeconds<minSpanSeconds)) {
      overrideCurrent=[]; return;
    }
    const executedActions={};
    for (const event of overrideCurrent)
      executedActions[event.id]=(executedActions[event.id]||0)+1;
    const gateProgressObserved=firstGate.points!==lastGate.points
      || firstGate.closed!==lastGate.closed;
    overrideStreaks.push({providerChoice:first.providerChoice,
      overrideReason:first.supervisorOverride,room:first.state.room||null,
      decisions:overrideCurrent.length,spanSeconds,firstAt:first.ts||null,lastAt:last.ts||null,
      executedActions,gate:{rankPoints:firstGate.points,closedRows:firstGate.closed,
        rankPointDelta:lastGate.points-firstGate.points,
        closedRowDelta:lastGate.closed-firstGate.closed},gateProgressObserved,
      interpretation:'temporal trace summary, not causal attribution: the supervisor repeatedly replaced this provider choice; gate movement may come from concurrent combat or another action.'});
    overrideCurrent=[];
  };
  for (const event of decisions) {
    if (typeof event.providerChoice!=='string'||!event.supervisorOverride) {
      flushOverride(); continue;
    }
    const prev=overrideCurrent.at(-1);
    if (prev && (prev.providerChoice!==event.providerChoice
        || prev.supervisorOverride!==event.supervisorOverride
        || prev.state.room!==event.state.room)) flushOverride();
    overrideCurrent.push(event);
  }
  flushOverride();
  return {
    schema:'dragonrealms.jev-player-loop-audit/1',
    decisionsAnalyzed:decisions.length,
    thresholds:{minDecisions,minSpanSeconds},
    interpretation:'Offline trace triage only; temporal associations do not prove an action caused gate movement. No game state or policy is changed.',
    streaks:streaks.sort((a,b)=>b.spanSeconds-a.spanSeconds||b.decisions-a.decisions),
    flatGateStreaks:flatGateStreaks.sort((a,b)=>b.spanSeconds-a.spanSeconds||b.decisions-a.decisions),
    overrideStreaks:overrideStreaks.sort((a,b)=>b.spanSeconds-a.spanSeconds||b.decisions-a.decisions),
    flatGateOverrideStreaks:overrideStreaks.filter(streak=>!streak.gateProgressObserved)
      .sort((a,b)=>b.spanSeconds-a.spanSeconds||b.decisions-a.decisions),
    offeredChoiceCoverage:offeredChoiceCoverage(decisions),
    distinctLaneCoverage:distinctLaneCoverage([...decisions].reverse()
      .find(event=>Array.isArray(event.state.requirements?.rows))?.state||{}),
    safeIdleFieldPractice:safeIdleFieldPractice(decisions),
  };
}
