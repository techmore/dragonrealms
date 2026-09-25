// Descriptive outcome windows for saved Jev decisions. This does not claim
// that a command caused a later skill or gate change.
import { mappedActionSkills } from './jev-loop-audit.mjs';
import { summarizeActionFeedback } from './jev-action-feedback.mjs';
const rowsFor = event => Array.isArray(event?.state?.requirements?.rows)
  ? event.state.requirements.rows : null;

const gatePoints = rows => rows?.reduce((sum,row) =>
  sum + Math.min(Number(row.have) || 0,Number(row.need) || 0),0) ?? null;

const skillRanks = event => event?.state?.skills && typeof event.state.skills === 'object'
  ? event.state.skills : null;

function boundedFollowup(decisions,index,{maxDecisions=5,maxSeconds=60}={}) {
  const start=decisions[index];
  const startMs=Date.parse(start?.ts||'');
  const followups=[];
  for(let i=index+1;i<decisions.length&&followups.length<maxDecisions;i++) {
    const event=decisions[i];
    if(Number.isFinite(startMs)) {
      const at=Date.parse(event.ts||'');
      if(!Number.isFinite(at)||at-startMs>maxSeconds*1000) break;
    }
    followups.push(event);
  }
  return followups;
}

export function summarizeJevPlayerOutcomes(events = []) {
  const decisionPositions=[];
  events.forEach((event,index)=>{
    if (['local-decision','jev-decision'].includes(event?.type)
        && event.state && typeof event.id === 'string') decisionPositions.push(index);
  });
  const decisions=decisionPositions.map(index=>events[index]);
  const records = decisions.map((event,index) => {
    const next = decisions[index+1] || null;
    const followups=boundedFollowup(decisions,index);
    const intervalEvents=events.slice(decisionPositions[index]+1,
      decisionPositions[index+1] ?? events.length);
    const dispatches=intervalEvents.filter(item=>item?.type==='execution'
      && (item.kind===event.kind || !event.kind)
      && (item.command===event.command || (event.command==null&&item.command==null)));
    const commandEchoes=intervalEvents.filter(item=>item?.type==='command'
      && typeof item.reason==='string' && item.reason.endsWith(`:${event.id}`));
    const navigationSteps=intervalEvents.filter(item=>item?.type==='navigation-step');
    const beforeRows = rowsFor(event), afterRows = rowsFor(next);
    const beforeRanks = skillRanks(event), afterRanks = skillRanks(next);
    const skillAdvances = beforeRanks && afterRanks
      ? Object.keys(afterRanks).filter(skill => Number(afterRanks[skill]) > Number(beforeRanks[skill] || 0))
        .map(skill => ({skill,from:Number(beforeRanks[skill]) || 0,to:Number(afterRanks[skill])}))
      : null;
    const beforePoints = gatePoints(beforeRows), afterPoints = gatePoints(afterRows);
    const lastFollowup=followups.at(-1)||null;
    const horizonRows=rowsFor(lastFollowup),horizonRanks=skillRanks(lastFollowup);
    const horizonPoints=gatePoints(horizonRows);
    const mappedSkills=mappedActionSkills({id:event.id,state:event.state});
    const actionFeedback=summarizeActionFeedback(event.id,intervalEvents);
    const horizonSkillAdvances=beforeRanks&&horizonRanks
      ?Object.keys(horizonRanks).filter(skill=>followups.some(candidate=>
        Number(candidate.state.skills?.[skill]||0)>Number(beforeRanks[skill]||0)))
        .map(skill=>({skill,from:Number(beforeRanks[skill])||0,
          to:Math.max(...followups.map(candidate=>Number(candidate.state.skills?.[skill])||0))}))
      :null;
    const currentWeapon = event.state.wieldedWeaponSkill || event.state.skills?.wieldedWeaponSkill || null;
    return {
      at:event.ts || null,nextAt:next?.ts || null,
      windowSeconds:event.ts && next?.ts ? Math.max(0,(Date.parse(next.ts)-Date.parse(event.ts))/1000) : null,
      room:event.state.room || null,actionId:event.id,
      providerChoice:event.providerChoice || null,
      overrideReason:event.supervisorOverride || event.overrideReason || null,
      actionKind:event.kind||null,
      actionFeedback,
      dispatchObserved:dispatches.length>0,
      dispatchCount:dispatches.length,
      commandEchoObserved:commandEchoes.length>0,
      navigationStepCount:navigationSteps.length,
      navigationDestination:next?.state?.room||null,
      equippedWeaponSkill:currentWeapon,
      equippedWeaponRank:currentWeapon ? Number(event.state.skills?.[currentWeapon]) || 0 : null,
      outcomeObserved:!!(next && beforeRows && afterRows && beforeRanks && afterRanks),
      gateRankPointsBefore:beforePoints,gateRankPointsAfter:afterPoints,
      gateRankPointsDelta:beforePoints == null || afterPoints == null ? null : afterPoints-beforePoints,
      skillAdvances,
      lookaheadDecisions:followups.length,
      lookaheadSeconds:event.ts&&lastFollowup?.ts
        ?Math.max(0,(Date.parse(lastFollowup.ts)-Date.parse(event.ts))/1000):null,
      gateRankPointsAtLookaheadEnd:horizonPoints,
      gateRankPointsDeltaWithinLookahead:beforePoints==null||horizonPoints==null
        ?null:horizonPoints-beforePoints,
      skillAdvancesWithinLookahead:horizonSkillAdvances,
      mappedActionSkills:mappedSkills,
      mappedSkillAdvancesWithinLookahead:(horizonSkillAdvances||[])
        .filter(advance=>mappedSkills.includes(advance.skill)),
    };
  });

  const groups = new Map();
  for (const record of records) {
    const key = `${record.overrideReason || 'no-override'}\u0000${record.actionId}`;
    const group = groups.get(key) || {overrideReason:record.overrideReason,actionId:record.actionId,
      decisions:0,observedWindows:0,positiveGateWindows:0,gateRankPointsDelta:0,
      dispatchedDecisions:0,undispatchedDecisions:0,windowsWithSkillAdvance:0,skillAdvances:{},
      lookaheadWindows:0,positiveLookaheadGateWindows:0,lookaheadGateRankPointsDelta:0,
      lookaheadWindowsWithSkillAdvance:0,lookaheadSkillAdvances:{},
      mappedSkillAdvancesWithinLookahead:{},actionFeedbackStatuses:{}};
    group.decisions++;
    group.actionFeedbackStatuses[record.actionFeedback.status]
      =(group.actionFeedbackStatuses[record.actionFeedback.status]||0)+1;
    if(record.dispatchObserved) group.dispatchedDecisions++;
    else group.undispatchedDecisions++;
    if (record.outcomeObserved) {
      group.observedWindows++;
      if (record.gateRankPointsDelta > 0) group.positiveGateWindows++;
      group.gateRankPointsDelta += record.gateRankPointsDelta;
      if (record.skillAdvances.length) group.windowsWithSkillAdvance++;
      for (const advance of record.skillAdvances)
        group.skillAdvances[advance.skill]=(group.skillAdvances[advance.skill] || 0)+1;
    }
    if(record.gateRankPointsDeltaWithinLookahead!==null) {
      group.lookaheadWindows++;
      if(record.gateRankPointsDeltaWithinLookahead>0) group.positiveLookaheadGateWindows++;
      group.lookaheadGateRankPointsDelta+=record.gateRankPointsDeltaWithinLookahead;
      if(record.skillAdvancesWithinLookahead?.length) group.lookaheadWindowsWithSkillAdvance++;
      for(const advance of record.skillAdvancesWithinLookahead||[])
        group.lookaheadSkillAdvances[advance.skill]=(group.lookaheadSkillAdvances[advance.skill]||0)+1;
      for(const advance of record.mappedSkillAdvancesWithinLookahead||[])
        group.mappedSkillAdvancesWithinLookahead[advance.skill]
          =(group.mappedSkillAdvancesWithinLookahead[advance.skill]||0)+1;
    }
    groups.set(key,group);
  }
  return {
    scope:'Adjacent decision snapshots only; descriptive association, not causal attribution.',
    decisionCount:records.length,
    observedOutcomeWindows:records.filter(record=>record.outcomeObserved).length,
    records,
    byAction:[...groups.values()].map(group=>({...group,
      gateRankPointsDelta:group.observedWindows ? group.gateRankPointsDelta : null,
      lookaheadGateRankPointsDelta:group.lookaheadWindows?group.lookaheadGateRankPointsDelta:null})),
  };
}
