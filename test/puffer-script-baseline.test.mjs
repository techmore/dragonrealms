import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productionLibrary, route} from '../puffer_adapter/script_baseline.mjs';
import {parseScript} from '../public/js/script-engine.js';
import {ROOMS} from '../data/world.js';
import {scriptController} from '../puffer_adapter/script_controller.mjs';
import {virtualClock} from '../puffer_adapter/virtual_clock.mjs';

test('production baseline routes reach their endpoints using real exits',()=>{
  for (const [start,end] of [['hall_barbarian','sewers_3'],['sewers_3','bazaar'],['bazaar','market_end']]) {
    let room=start;
    for (const {dir} of route(start,end)) {
      const exit=ROOMS[room].exits[dir];
      room=typeof exit==='string'?exit:exit.to;
    }
    assert.equal(room,end);
  }
  assert.throws(()=>route('unknown','bazaar'));
});

test('real generator library has reproducible hashes and resolves nested scripts',()=>{
  const input={room:'hall_barbarian',arena:'sewers_3',circle:1};
  const result=productionLibrary(input);
  assert.deepEqual(result,productionLibrary(input));
  assert.equal(result.metadata.generator,'scripts/lib/script-gen.mjs');
  assert.equal(result.metadata.requires_supervisor,true);
  assert.ok(result.metadata.missing_supervisor_features.includes('hunt-to-hall handoff'));
  assert.equal(Object.keys(result.library).length,3);
  for (const [name,source] of Object.entries(result.library)) {
    assert.match(result.metadata.hashes[name],/^[a-f0-9]{64}$/);
    const parsed=parseScript(source);
    assert.ok(parsed.lines.length>0);
    for (const line of parsed.lines.filter(line=>/^putrun\s/.test(line))) {
      assert.ok(result.library[line.split(/\s+/)[1]],line);
    }
  }
  assert.match(result.library.puffer_baseline_circle,/put circle/);
  assert.throws(()=>productionLibrary({...input,arena:'hall_barbarian'}));
  assert.throws(()=>productionLibrary({...input,circle:21}));
});

test('fixed-arena hunt cannot claim an autonomous hall handoff',()=>{
  const result=productionLibrary({room:'square',arena:'sewers_3',circle:1});
  const hunt=parseScript(result.library.puffer_baseline_hunt);
  assert.equal(hunt.lines.some(line=>/^exit(?:\s|$)/.test(line)),false);
  assert.deepEqual(parseScript(result.library.puffer_baseline_mega).lines.slice(0,2),
    ['putrun puffer_baseline_hunt','putrun puffer_baseline_circle']);
  // The nested hall script is unreachable until an external supervisor stops
  // the perpetual hunt. Do not interpret its absence as a policy comparison.
});

test('interpreter bridge handles synchronous replies and nested scripts without re-entry',()=>{
  const sent=[];
  const host=scriptController({isolated:true,commandCap:10,simulatedSecondsCap:100,
    library:{main:'put look\nwait\nputrun child\nexit',child:'put inventory\nwait\nexit'},entry:'main',
    roomNow:()=> 'bazaar',send:line=>{sent.push(line);host.feed('HP: 100/100  Circle 1  150 silvers','prompt');}});
  host.start();
  host.pump();
  assert.deepEqual(sent,['look','inventory']);
  assert.equal(host.state.cycle_finished,true);
  assert.equal(host.state.commands,2);
});

test('phase restart inherits a received prompt only as a non-RT heartbeat',()=>{
  const clock=virtualClock();
  try {
    const sent=[];
    const host=scriptController({isolated:true,commandCap:10,simulatedSecondsCap:100,
      initialPrompt:'HP: 100/100  RT: 60  Circle 1  22 silvers',
      library:{main:'wait\nput exp\nexit'},entry:'main',send:line=>sent.push(line)});
    host.start();host.pump();assert.deepEqual(sent,[]);
    clock.advance(999);host.pump();assert.deepEqual(sent,[]);
    clock.advance(1);host.pump();assert.deepEqual(sent,['exp']);
    assert.equal(host.state.interpreter.rtUntil,0);
    assert.equal(host.state.cycle_finished,true);
  } finally {clock.close();}
});

test('baseline command/time/safety caps and stop prohibit further sends',()=>{
  const clock=virtualClock();
  try {
    const make=(extra={})=>scriptController({isolated:true,commandCap:1,simulatedSecondsCap:1,
      library:{main:'put look\nput status\nexit'},entry:'main',send:()=>{},...extra});
    let host=make();host.start();host.pump();assert.equal(host.state.reason,'command_cap');
    host.pump();assert.equal(host.state.commands,1);
    host=make();host.start();clock.advance(1000);host.pump();assert.equal(host.state.reason,'simulated_time_cap');
    assert.equal(host.state.commands,0);
    host=make({unsafe:()=>true});host.start();assert.equal(host.state.reason,'unsafe_state');
    host=make();host.start();host.stop();host.feed('anything','prompt');host.pump();assert.equal(host.state.commands,0);
    assert.throws(()=>make({isolated:false}));
  } finally {clock.close();}
});
