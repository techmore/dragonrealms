import { requirementProgressSummary } from '../../public/js/jev-gate-summary.js';

const timestampMs=value=>{
  const time=Date.parse(value || '');
  return Number.isFinite(time)?time:null;
};

function percentile(sorted,fraction) {
  if (!sorted.length) return null;
  return sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)];
}

export function summarizeJevPlayerEfficiency({manifest,events=[]}={}) {
  const first=events.find(event=>timestampMs(event?.ts)!==null);
  const last=[...events].reverse().find(event=>timestampMs(event?.ts)!==null);
  const startMs=timestampMs(first?.ts),endMs=timestampMs(last?.ts);
  const wallSpanMs=startMs!==null&&endMs!==null?Math.max(0,endMs-startMs):null;
  const providerEvents=events.filter(event=>/^(local|jev)-response$/.test(event?.type));
  const responseTimes=providerEvents.map(event=>Number(event.elapsedMs))
    .filter(value=>Number.isFinite(value)&&value>=0).sort((a,b)=>a-b);
  const providerLatencyMs=responseTimes.length?{
    samples:responseTimes.length,mean:Math.round(responseTimes.reduce((sum,value)=>sum+value,0)/responseTimes.length),
    median:percentile(responseTimes,0.5),p90:percentile(responseTimes,0.9),
    p95:percentile(responseTimes,0.95),max:responseTimes.at(-1),
    total:responseTimes.reduce((sum,value)=>sum+value,0),
    observedWallShare:wallSpanMs?Math.round(responseTimes.reduce((sum,value)=>sum+value,0)/wallSpanMs*1000)/10:null,
  }:null;
  const usageEvents=providerEvents.filter(event=>event?.usage&&typeof event.usage==='object');
  const promptTokens=usageEvents.reduce((sum,event)=>sum+Math.max(0,Number(event.usage.prompt_tokens)||0),0);
  const completionTokens=usageEvents.reduce((sum,event)=>sum+Math.max(0,Number(event.usage.completion_tokens)||0),0);
  const defeatCount=events.filter(event=>event?.type==='creature-defeated').length;
  const commandCount=events.filter(event=>event?.type==='command').length;
  const executionCount=events.filter(event=>event?.type==='execution').length;
  const hours=wallSpanMs>0?wallSpanMs/3_600_000:null;
  const evidence=manifest?.progression?.evidence || {};
  return {
    schema:'dragonrealms.jev-player-efficiency-audit/1',
    runId:manifest?.runId || null,
    status:manifest?.status || null,
    model:manifest?.model || manifest?.provider || null,
    wallSpanMs,
    firstEventAt:first?.ts || null,
    lastEventAt:last?.ts || null,
    decisions:manifest?.decisions ?? events.filter(event=>/^(local|jev)-decision$/.test(event?.type)).length,
    providerLatencyMs,
    tokenUsage:usageEvents.length?{
      samples:usageEvents.length,promptTokens,completionTokens,
      meanPromptTokens:Math.round(promptTokens/usageEvents.length),
      meanCompletionTokens:Math.round(completionTokens/usageEvents.length),
    }:null,
    commands:commandCount,
    executions:executionCount,
    kills:defeatCount,
    killsPerHour:hours?Math.round(defeatCount/hours*100)/100:null,
    observedRankPoints:evidence.rankPointsGained ?? null,
    observedRankPointsPerHour:hours&&Number.isFinite(Number(evidence.rankPointsGained))
      ?Math.round(Number(evidence.rankPointsGained)/hours*100)/100:null,
    rowsClosed:evidence.rowsClosedSinceStart ?? null,
    unmetRows:evidence.unmetRows ?? null,
    requirementProgress:requirementProgressSummary(events),
    interpretation:'Observed trace throughput only; not a causal estimate or future pace forecast.',
  };
}
