const DECISIONS=new Set(['jev-decision','local-decision']);

function timestampMs(value) {
  const time=Date.parse(value);
  return Number.isFinite(time)?time:null;
}

// The Barbarian `form` command does not emit a success line in this game.
// Pair a dispatched form with the next fresh decision snapshot and report an
// inferred use only when Inner Fire drops by at least cost minus a small regen
// allowance. This is evidence, not a server-issued activation acknowledgment.
export function inferBarbarianFormUses(events,{abilityId='dragon',cost=20,
  regenAllowance=5,maxObservationMs=10_000}={}) {
  if (!Array.isArray(events)||!Number.isFinite(cost)||cost<=0) return [];
  const actionId=`ability_${abilityId}`;
  const command=`form ${abilityId}`;
  const uses=[];
  for (let index=0;index<events.length;index++) {
    const dispatch=events[index];
    if (dispatch?.type!=='execution'||dispatch.command!==command) continue;
    const dispatchedAt=timestampMs(dispatch.ts);
    if (dispatchedAt===null) continue;
    let before=null;
    for (let previous=index-1;previous>=0;previous--) {
      const row=events[previous],time=timestampMs(row?.ts);
      if (time===null||dispatchedAt-time>2_000) break;
      if (DECISIONS.has(row?.type)&&row.id===actionId
          &&Number.isFinite(Number(row.state?.innerFire))) {
        before=Number(row.state.innerFire);break;
      }
    }
    let after=null,observedAt=null;
    if (before!==null) for (let next=index+1;next<events.length;next++) {
      const row=events[next],time=timestampMs(row?.ts);
      if (time===null) continue;
      if (time-dispatchedAt>maxObservationMs) break;
      if (DECISIONS.has(row?.type)&&Number.isFinite(Number(row.state?.innerFire))) {
        after=Number(row.state.innerFire);observedAt=row.ts;break;
      }
    }
    const netDrop=before!==null&&after!==null?before-after:null;
    uses.push({abilityId,dispatchedAt:dispatch.ts,observedAt,innerFireBefore:before,
      innerFireAfter:after,netDrop,
      evidence:netDrop!==null&&netDrop>=cost-regenAllowance
        ?'resource-drop-consistent-with-use':'insufficient-resource-delta',
      confidence:'inferred-not-server-acknowledged'});
  }
  return uses;
}
