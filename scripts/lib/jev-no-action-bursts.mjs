// Read-only classifier for saved Jev traces. A burst means repeated
// `only-legal-action` waits close together; it is a review signal, not a
// causal verdict and does not stop or mutate a run.
export function findJevNoActionBursts(events = [], {
  minWaits = 6, maxGapSeconds = 15,
} = {}) {
  if (!Number.isInteger(minWaits) || minWaits < 2) throw new Error('minWaits must be at least 2');
  if (!Number.isFinite(maxGapSeconds) || maxGapSeconds <= 0) throw new Error('maxGapSeconds must be positive');
  const waits=events.filter(event=>event?.type==='wait'&&event.reason==='only-legal-action'
    &&Number.isFinite(Date.parse(event.ts)));
  const bursts=[]; let current=[];
  const flush=()=>{
    if(current.length>=minWaits){
      const start=current[0],end=current.at(-1);
      const startMs=Date.parse(start.ts),endMs=Date.parse(end.ts);
      const intervening=events.filter(event=>{
        const at=Date.parse(event?.ts||''); return Number.isFinite(at)&&at>=startMs&&at<=endMs;
      });
      bursts.push({start:start.ts,end:end.ts,waits:current.length,
        spanSeconds:Math.max(0,(endMs-startMs)/1000),room:start.room||null,
        decisions:intervening.filter(event=>['local-decision','jev-decision'].includes(event?.type)).length,
        commands:intervening.filter(event=>event?.type==='command').length,
        source:'saved-events'});
    }
    current=[];
  };
  for(const wait of waits){
    const previous=current.at(-1);
    if(previous && Date.parse(wait.ts)-Date.parse(previous.ts)>maxGapSeconds*1000) flush();
    current.push(wait);
  }
  flush();
  const maxWaitBurst=bursts.length
    ?bursts.reduce((best,row)=>row.waits>best.waits?row:best,bursts[0]) : null;
  return {schema:'dragonrealms.jev-no-action-bursts/1',waitCount:waits.length,
    burstCount:bursts.length,maxWaitBurst,bursts};
}
