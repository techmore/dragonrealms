import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeJevPlayerEfficiency } from '../scripts/lib/jev-player-efficiency-audit.mjs';

test('efficiency audit reports latency, kill throughput and observed gate pace',()=>{
  const report=summarizeJevPlayerEfficiency({manifest:{runId:'sample',status:'playing',
    model:'qwen3:4b',decisions:2,progression:{evidence:{rankPointsGained:4,
      rowsClosedSinceStart:0,unmetRows:19}}},events:[
    {ts:'2026-09-21T18:00:00.000Z',type:'local-decision'},
    {ts:'2026-09-21T18:00:02.000Z',type:'local-response',elapsedMs:1000,
      usage:{prompt_tokens:100,completion_tokens:10}},
    {ts:'2026-09-21T19:00:00.000Z',type:'creature-defeated'},
    {ts:'2026-09-21T19:00:01.000Z',type:'local-response',elapsedMs:3000,
      usage:{prompt_tokens:300,completion_tokens:20}},
  ]});
  assert.equal(report.runId,'sample');
  assert.equal(report.providerLatencyMs.samples,2);
  assert.equal(report.providerLatencyMs.mean,2000);
  assert.equal(report.providerLatencyMs.p90,3000);
  assert.equal(report.tokenUsage.meanPromptTokens,200);
  assert.equal(report.tokenUsage.completionTokens,30);
  assert.equal(report.killsPerHour,1);
  assert.equal(report.observedRankPointsPerHour,4);
  assert.equal(report.rowsClosed,0);
  assert.match(report.interpretation,/not a causal estimate/);
});

test('efficiency audit handles empty or partial telemetry without inventing pace',()=>{
  const report=summarizeJevPlayerEfficiency({manifest:{status:'starting'},events:[]});
  assert.equal(report.wallSpanMs,null);
  assert.equal(report.providerLatencyMs,null);
  assert.equal(report.killsPerHour,null);
  assert.equal(report.observedRankPointsPerHour,null);
});

test('efficiency audit reports per-requirement movement and closure time by circle gate',()=>{
  const reqs=(circle,expertise,armor)=>({circle,rows:[
    {label:'expertise',have:expertise,need:2},
    {label:'1st armor',have:armor,need:2},
  ]});
  const report=summarizeJevPlayerEfficiency({manifest:{runId:'rows',status:'complete'},events:[
    {ts:'2026-09-21T18:00:00Z',type:'local-decision',state:{requirements:reqs(2,0,0)}},
    {ts:'2026-09-21T18:00:10Z',type:'local-decision',state:{requirements:reqs(2,1,2)}},
    {ts:'2026-09-21T18:00:20Z',type:'jev-decision',state:{requirements:reqs(3,0,0)}},
  ]});
  assert.equal(report.requirementProgress.length,2);
  assert.deepEqual(report.requirementProgress[0].rows,[
    {label:'expertise',firstHave:0,latestHave:1,need:2,delta:1,closedDuringRun:false,closedAt:null},
    {label:'1st armor',firstHave:0,latestHave:2,need:2,delta:2,closedDuringRun:true,closedAt:'2026-09-21T18:00:10Z'},
  ]);
  assert.equal(report.requirementProgress[1].circle,3,
    'a circle-up starts a separate gate timeline instead of mixing requirements');
});
