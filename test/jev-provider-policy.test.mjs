import test from 'node:test';
import assert from 'node:assert/strict';
import { JEV_MAX_CONSECUTIVE_FAILURES, jevBackoffSeconds, isPermanentJevClientError }
  from '../scripts/lib/jev-provider-policy.mjs';
import { createJevLocalFallback } from '../scripts/lib/jev-provider-policy.mjs';

test('Jev failure backoff grows exponentially and has a strict cap', () => {
  assert.deepEqual([0,1,2,3,4,5,6].map(count=>jevBackoffSeconds(count)),
    [0,10,20,40,80,120,120]);
  assert.equal(JEV_MAX_CONSECUTIVE_FAILURES,5);
  assert.equal(jevBackoffSeconds(3,{baseSeconds:2,maxSeconds:6}),6);
});

test('only permanent client errors open the request circuit immediately', () => {
  for (const status of [400,401,402,403,404,422]) assert.equal(isPermanentJevClientError(status),true);
  for (const status of [undefined,0,200,429,500,503,529]) assert.equal(isPermanentJevClientError(status),false);
});

test('hybrid uses Jev while healthy and does not invoke the local fallback',async()=>{
  let localCalls=0;
  const hybrid=createJevLocalFallback({askJev:async()=>({answers:{next_action:{choice:'hunt'}}}),
    askLocal:async()=>{localCalls++;return {answers:{next_action:{choice:'wait'}}};}});
  const decision=await hybrid.choose({},{next_action:{} });
  assert.equal(decision.provider,'jev');
  assert.equal(decision.result.answers.next_action.choice,'hunt');
  assert.equal(localCalls,0);
  assert.equal(hybrid.isPrimaryCircuitOpen(),false);
});

test('hybrid falls back locally on HTTP 402 and permanently stops Jev requests',async()=>{
  let jevCalls=0,localCalls=0;
  const failure=Object.assign(new Error('Jev HTTP 402'),{status:402});
  const hybrid=createJevLocalFallback({askJev:async()=>{jevCalls++;throw failure;},
    askLocal:async()=>{localCalls++;return {answers:{next_action:{choice:'hunt'}}};}});
  const first=await hybrid.choose({},{next_action:{} });
  assert.equal(first.provider,'local');
  assert.equal(first.primaryError,failure);
  assert.equal(first.circuitOpen,true);
  const second=await hybrid.choose({},{next_action:{} });
  assert.equal(second.provider,'local');
  assert.equal(second.skippedPrimary,true);
  assert.equal(jevCalls,1,'a permanent error must not issue a second provider request');
  assert.equal(localCalls,2);
});

test('hybrid transient Jev failure falls back for this decision without permanently opening circuit',async()=>{
  let localCalls=0;
  const failure=Object.assign(new Error('Jev HTTP 503'),{status:503});
  const hybrid=createJevLocalFallback({askJev:async()=>{throw failure;},
    askLocal:async()=>{localCalls++;return {answers:{next_action:{choice:'hunt'}}};}});
  const decision=await hybrid.choose({},{next_action:{} });
  assert.equal(decision.provider,'local');
  assert.equal(decision.circuitOpen,false);
  assert.equal(hybrid.isPrimaryCircuitOpen(),false);
  assert.equal(localCalls,1);
});

test('hybrid preserves primary failure details when local fallback also fails',async()=>{
  const primary=Object.assign(new Error('Jev HTTP 402'),{status:402});
  const hybrid=createJevLocalFallback({askJev:async()=>{throw primary;},
    askLocal:async()=>{throw new Error('Ollama unavailable');}});
  await assert.rejects(hybrid.choose({},{next_action:{}}),error=>{
    assert.equal(error.message,'Ollama unavailable');
    assert.equal(error.primaryError,primary);
    assert.equal(error.primaryCircuitOpen,true);
    return true;
  });
  assert.equal(hybrid.isPrimaryCircuitOpen(),true);
});
