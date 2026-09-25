import test from 'node:test';
import assert from 'node:assert/strict';
import { askJev, askLocal, askLocalChoice } from '../scripts/lib/jev.mjs';
import { evidence, sameCohort, dimensions, questions } from '../scripts/lib/jev-evidence.mjs';

test('unknown telemetry stays unknown and exact completion ignores kills', () => {
  assert.equal(evidence({}).targetReached, null);
  assert.equal(evidence({}).remainingGap, null);
  assert.equal(evidence({}).deaths, null);
  const facts = evidence({ circle: 1, targetCircle: 2, completedTarget: true,
    kills: 900, shortfallFirst: 15, shortfallLast: 2,
    finalRequirements: { missing: [{ label: 'lore', have: 1, need: 4 }] }, token: 'secret', char: 'Private' });
  assert.equal(facts.targetReached, false);
  assert.equal(facts.remainingGap, 3);
  assert.equal(facts.completionFlagConflict, true);
  assert.equal(facts.gapConflict, true);
  assert.equal(facts.gapClosure, 13);
  assert.ok(!JSON.stringify(facts).includes('secret'));
  assert.ok(!JSON.stringify(facts).includes('Private'));
});

test('matching cohorts requires all dimensions, including cap and concurrency', () => {
  const row = Object.fromEntries(dimensions.map(key => [key, 'same']));
  assert.equal(sameCohort(row, { ...row }), true);
  for (const key of dimensions) {
    assert.equal(sameCohort(row, { ...row, [key]: null }), false);
    assert.equal(sameCohort(row, { ...row, [key]: 'different' }), false);
  }
});

test('Jev uses fixed host and rejects out-of-set decisions and malformed distributions', async () => {
  const options = Object.keys(questions.investigation.criteria);
  const valid = { type: 'choice', choice: options[0], confidence: 0.9,
    probabilities: Object.fromEntries(options.map((key, i) => [key, i ? 0 : 1])) };
  let calls = 0;
  const fetcher = async (url, init) => {
    ++calls;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(init.headers.authorization, 'Bearer test');
    return { ok: true, json: async () => ({ model: 'jev-1.13.0', answers: { investigation: valid } }) };
  };
  await askJev({}, questions, { apiKey: 'test', fetcher });
  valid.choice = 'execute_shell';
  await assert.rejects(askJev({}, questions, { apiKey: 'test', fetcher }), /Invalid Jev choice/);
  valid.choice = options[0]; valid.probabilities[options[0]] = NaN;
  await assert.rejects(askJev({}, questions, { apiKey: 'test', fetcher }), /Invalid Jev choice/);
  assert.equal(calls, 3);
});

test('Jev HTTP failure does not expose remote error body or retry by default', async () => {
  let calls = 0;
  await assert.rejects(askJev({}, questions, { apiKey: 'test', fetcher: async () => {
    calls++; return { ok: false, status: 429, json: () => { throw Error('secret body'); } };
  } }), error=>error.message.includes('Jev HTTP 429')&&error.status===429);
  assert.equal(calls, 1);
});

test('realtime Jev callers can make one observable retry for transient overload only', async () => {
  const options = Object.keys(questions.investigation.criteria);
  const answer = { type:'choice',choice:options[0],confidence:0.9,
    probabilities:Object.fromEntries(options.map((key,i)=>[key,i ? 0 : 1])) };
  let calls = 0;
  await assert.rejects(askJev({},questions,{apiKey:'test',fetcher:async()=>{
    calls++;
    throw Object.assign(new Error('The operation was aborted due to timeout'),{name:'TimeoutError'});
  }}),error=>error.message==='Jev request timed out after 1 attempt.'&&error.attempts===1);
  assert.equal(calls,1,'timeout retries remain opt-in');
  calls=0;
  const result = await askJev({},questions,{apiKey:'test',maxServiceRetries:1,retryDelayMs:0,
    fetcher:async () => ++calls === 1
      ? {ok:false,status:529}
      : {ok:true,json:async()=>({model:'jev-1.13.0',answers:{investigation:answer}})} });
  assert.equal(calls,2);
  assert.equal(result.attempts,2);
  await assert.rejects(askJev({},questions,{apiKey:'test',maxServiceRetries:1,retryDelayMs:0,
    fetcher:async()=>({ok:false,status:400})}),/Jev HTTP 400/);
});

test('realtime Jev callers can make one observable retry after a request timeout', async () => {
  const options = Object.keys(questions.investigation.criteria);
  const answer = { type:'choice',choice:options[0],confidence:0.9,
    probabilities:Object.fromEntries(options.map((key,i)=>[key,i ? 0 : 1])) };
  let calls = 0;
  const result = await askJev({},questions,{apiKey:'test',maxServiceRetries:1,retryDelayMs:0,
    fetcher:async()=> {
      calls++;
      if (calls === 1) throw Object.assign(new Error('The operation was aborted due to timeout'),{name:'TimeoutError'});
      return {ok:true,json:async()=>({model:'jev-1.13.0',answers:{investigation:answer}})};
    }});
  assert.equal(calls,2);
  assert.equal(result.attempts,2);
  await assert.rejects(askJev({},questions,{apiKey:'test',maxServiceRetries:1,retryDelayMs:0,
    fetcher:async()=>{throw Object.assign(new Error('The operation was aborted due to timeout'),{name:'TimeoutError'});}}),
  error=>error.message==='Jev request timed out after 2 attempts.'&&error.attempts===2);
});

test('offline companion refuses non-loopback hosts without sending evidence', async () => {
  let called = false;
  await assert.rejects(askLocal({}, { baseUrl: 'https://example.com/v1', fetcher: () => { called = true; } }), /loopback/);
  assert.equal(called, false);
});

test('local companion returns final text only and preserves truncation evidence', async () => {
  const result = await askLocal({ circle: 1 }, { fetcher: async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:1234/v1/chat/completions');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.authorization, undefined);
    return { ok: true, json: async () => ({ model: 'local-test',
      choices: [{ message: { content: 'Inspect coverage.', reasoning_content: 'Internal reasoning' }, finish_reason: 'length' }],
      usage: { completion_tokens: 1800 } }) };
  } });
  assert.equal(result.text, 'Inspect coverage.');
  assert.equal(result.finishReason, 'length');
  assert.ok(!JSON.stringify(result).includes('Internal reasoning'));
  await assert.rejects(askLocal({}, { fetcher: async () => ({ ok: true,
    json: async () => ({ choices: [{ message: { content: '', reasoning_content: 'thinking' }, finish_reason: 'length' }] }) }) }), /no final text/);
});

test('local decision backend chooses only among offered actions and labels its evidence', async () => {
  const questions = { next_action:{type:'choice',instructions:'Choose one.',criteria:{
    train:'Train the unmet skill.', hunt:'Fight safely.' } } };
  const result = await askLocalChoice({circle:1}, questions, { fetcher:async(url, init) => {
    assert.equal(url, 'http://127.0.0.1:11434/v1/chat/completions');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.authorization, undefined);
    const request = JSON.parse(init.body);
    assert.equal(request.response_format.type, 'json_object');
    assert.equal(request.messages[1].role, 'user');
    return {ok:true,json:async()=>({model:'offline-model',choices:[{
      message:{content:'{"choice":"train"}'},finish_reason:'stop'}]})};
  } });
  assert.equal(result.provider, 'local');
  assert.equal(result.model, 'offline-model');
  assert.deepEqual(result.answers.next_action, {type:'choice',choice:'train'});
  assert.equal('probabilities' in result.answers.next_action, false);
  await assert.rejects(askLocalChoice({}, questions, {baseUrl:'http://example.com/v1',fetcher:()=>{
    throw new Error('must not make external request');
  }}), /loopback/);
  await assert.rejects(askLocalChoice({}, questions, {fetcher:async()=>({ok:true,
    json:async()=>({choices:[{message:{content:'{"choice":"attack_player"}'}}]})})}),
  /outside the offered set: "attack_player"/);
});

test('Ollama decisions disable chain-of-thought and use its native structured JSON endpoint', async () => {
  const questions = { next_action:{type:'choice',instructions:'Choose.',criteria:{move:'Move safely. Current evasion rank 1; relevant gaps 1st survival 0/4. This skill is one distinct lane; raising it cannot fill multiple Nth-skill rows, which need separate skills.'}} };
  const laneCoach={version:'jev-lane-coach-v1',mode:'advisory-only-no-action-override',
    instructions:['Map this legal action to the first Survival lane.'],
    openLanes:[{skill:'stealth',rank:0,rows:['1st survival'],offeredActions:['move']}],
    candidates:[{actionId:'move',skill:'stealth',rank:0,openRows:[{label:'1st survival',have:0,need:4}],advances:['1st survival']}],
    commitment:{skill:'stealth',rank:0,rows:['1st survival']}};
  const result = await askLocalChoice({circle:1,objective:'repeat'.repeat(500),
    priorityGuidance:'Before another fight, wield club for an unmet blunt lane.',
    availableActions:[{id:'move',description:'duplicate'}],skills:{evasion:4},
    requirements:{circle:2,rows:[{label:'1st weapon',have:0,need:8,eligible:['small_edged','brawling']}]},
    laneCoach,
    trainingProgress:{rankPoints:3,unmetRows:4,verbose:'omit'},
    recentActions:Array.from({length:8},(_,i)=>({id:`a${i}`,room:'square',noise:'omit'}))},
    questions, {protocol:'ollama',baseUrl:'http://127.0.0.1:11434',
    fetcher:async(url,init)=>{
      assert.equal(url,'http://127.0.0.1:11434/api/chat');
      const request=JSON.parse(init.body);
      assert.equal(request.think,false);
      assert.equal(request.stream,false);
      assert.deepEqual(request.format,{type:'object',properties:{choice:{type:'string',enum:['move']}},
        required:['choice'],additionalProperties:false});
      const payload=JSON.parse(request.messages[1].content);
      assert.equal(payload.state.circle,1);
      assert.equal(payload.state.priorityGuidance,'Before another fight, wield club for an unmet blunt lane.');
      assert.deepEqual(payload.state.laneCoach,laneCoach);
      assert.deepEqual(payload.state.skills,{evasion:4});
      assert.deepEqual(payload.state.requirements,{circle:2,rows:[['1st weapon',0,8]]});
      assert.deepEqual(payload.state.trainingProgress,{rankPoints:3,unmetRows:4});
      assert.equal('objective' in payload.state,false);
      assert.equal('availableActions' in payload.state,false);
      assert.equal(payload.state.recentActions.length,3);
      assert.ok(request.messages[0].content.includes('Nth rows'));
      assert.deepEqual(Object.keys(payload.actions),['move']);
      assert.ok(!payload.actions.move.includes('relevant gaps'));
      assert.ok(!payload.actions.move.includes('one distinct lane'));
      return {ok:true,json:async()=>({model:'qwen3:8b',done:true,
        message:{content:'{"choice":"move"}'},prompt_eval_count:40,eval_count:5})};
    }});
  assert.deepEqual(result.answers.next_action,{type:'choice',choice:'move'});
  assert.deepEqual(result.usage,{prompt_tokens:40,completion_tokens:5});
});
