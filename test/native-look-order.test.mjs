import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {setupGame,teardownGame,auth,createCharacter,loadPlayer,handleCommand} from './helpers.mjs';
import {createRunner} from '../public/js/script-engine.js';
import {findPath} from '../data/grid.js';
import {buildHuntScript} from '../scripts/lib/script-gen.mjs';
let game,p;
before(async()=>{
  game=setupGame();
  const account=await auth.registerAccount('Nativelooktest','owned-test-password');
  p=loadPlayer(createCharacter(account.accountId,{name:'Nativelooktest',race:'human',guild:'warmage'}));
  game.addPlayer(p);
});
after(()=>teardownGame());
function nativeTranscript(script,options={}) {
  const {room='square',...io}=options;
  p.room=room;p.rtUntil=0;
  let clientRoom=p.room,owner=null;
  const frames=[],requests=[],events=[];
  p.ws={readyState:1,send(raw){frames.push({owner,frame:typeof raw==='string'?JSON.parse(raw):raw});}};
  const runner=createRunner(script,[],{...io,roomNow:()=>clientRoom,
    send(line){requests.push(line);events.push({event:'send',line});},
    say(line){events.push({event:'echo',line});}});
  runner.start();
  // Deliver already emitted native frames before processing requests generated
  // by their receipt, just as the original websocket stream is ordered.
  while(frames.length||requests.length) {
    if(!frames.length){owner=requests.shift();handleCommand(game,p,owner,0,{applyRT:true});owner=null;}
    if(!frames.length)continue;
    const {owner:command,frame}=frames.shift();
    if(frame.t==='room')clientRoom=frame.roomId;
    events.push({event:'receive',command,type:frame.t,text:frame.msg??''});
    runner.feed(frame.msg??'',frame.t);
  }
  return {runner,events};
}
const branch=look=>`matchre act .+\nput ${look}\nmatchwait 10\nact:\nput forage grass\nwait\necho ACTION_COMPLETE`;
function assertOrderedLook(events,look) {
  const firstPrompt=events.findIndex(e=>e.event==='receive'&&e.command===look&&e.type==='prompt');
  const actionSend=events.findIndex(e=>e.event==='send'&&e.line==='forage grass');
  const actionPrompt=events.findIndex(e=>e.event==='receive'&&e.command==='forage grass'&&e.type==='prompt');
  const complete=events.findIndex(e=>e.event==='echo'&&e.line==='ACTION_COMPLETE');
  assert.ok(firstPrompt>=0&&actionSend>firstPrompt,'look prompt is consumed before new action send');
  assert.ok(actionPrompt>actionSend&&complete>actionPrompt,'action wait belongs to its later native prompt');
  assert.equal(events.filter(e=>e.event==='send'&&e.line==='forage grass').length,1,'accepted action is never replayed');
  assert.match(events[actionPrompt].text,/RT: 5/,'real backend forage arms native roundtime');
}
test('actual look room/hands/prompt/mindstate order cannot release a subsequent gated action wait',()=>{
  const {runner,events}=nativeTranscript(branch('look'));
  assert.deepEqual(events.filter(e=>e.event==='receive'&&e.command==='look').map(e=>e.type),['room','hands','prompt','mindstate']);
  assertOrderedLook(events,'look');
  assert.equal(runner.state.outcome,'completed');
});
test('actual directional, around and object look prose also retain native completion ownership',()=>{
  for(const look of ['look around','look at crier','look crier','look north']) {
    const {events}=nativeTranscript(branch(look));assertOrderedLook(events,look);
  }
});
test('successful native movement has no trailing prompt barrier',()=>{
  const dir=findPath('square','temple')[0];
  const {events}=nativeTranscript(`move ${dir}\nput forage grass\nwait\necho ACTION_COMPLETE`);
  assert.deepEqual(events.filter(e=>e.event==='receive'&&e.command===dir).map(e=>e.type),['room']);
  const room=events.findIndex(e=>e.type==='room');
  assert.equal(events[room+1].line,'forage grass','movement immediately continues on changed room');
  const prompt=events.findIndex(e=>e.command==='forage grass'&&e.type==='prompt');
  assert.ok(events.findIndex(e=>e.line==='ACTION_COMPLETE')>prompt);
});
test('nested native look continuation retains called frame and resumes parent once',()=>{
  const {runner,events}=nativeTranscript('putrun child\necho PARENT_COMPLETE',{
    name:'parent',getScript:name=>name==='child'?branch('look'):null,
  });
  assertOrderedLook(events,'look');
  assert.deepEqual(events.filter(e=>e.event==='echo').map(e=>e.line),['ACTION_COMPLETE','PARENT_COMPLETE']);
  assert.equal(runner.state.outcome,'completed');
});
function manual(script,options={}) {
  const sends=[],echoes=[],diagnostics=[];
  const runner=createRunner(script,[],{...options,send:line=>sends.push(line),say:line=>echoes.push(line),onDiagnostic:d=>diagnostics.push(d)});
  runner.start();return {runner,sends,echoes,diagnostics};
}
test('native waitfor/regex defer but plain-text compatibility and no-look matches remain immediate',()=>{
  for(const wait of ['waitfor description','waitforre description']) {
    const {runner,sends,echoes}=manual(`put look at crier\n${wait}\nput forage grass\nwait\necho DONE`);
    runner.feed('description','msg');assert.equal(runner.state.mode,'prompt');assert.deepEqual(sends,['look at crier']);
    runner.feed('HP: 10/10','inject');runner.feed('','hands');assert.equal(sends.length,1);
    runner.feed('HP: 10/10','prompt');assert.deepEqual(sends,['look at crier','forage grass']);assert.deepEqual(echoes,[]);
    runner.feed('forage result','msg');assert.deepEqual(echoes,[]);
    runner.feed('HP: 10/10 RT: 5','prompt');assert.deepEqual(echoes,['DONE']);
  }
  const legacy=manual(branch('look'));legacy.runner.feed('description',false);assert.deepEqual(legacy.sends,['look','forage grass']);
  const generic=manual('match act ready\nmatchwait\nact:\nput forage grass\nwait');
  generic.runner.feed('ready','msg');assert.deepEqual(generic.sends,['forage grass']);assert.equal(generic.runner.state.mode,'prompt');
});
test('ordinary prompt-only wait consumes look completion exactly once',()=>{
  const {runner,sends,echoes}=manual('put look\nwait\nput forage grass\nwait\necho DONE');
  runner.feed('description','room');assert.deepEqual(sends,['look']);
  runner.feed('HP: 10/10',true);assert.deepEqual(sends,['look','forage grass']);assert.deepEqual(echoes,[]);
  runner.feed('HP: 10/10',true);assert.deepEqual(echoes,['DONE']);
});
test('stopping a deferred look and fatal continuation never restart or replay',()=>{
  const stopped=manual(branch('look'));stopped.runner.feed('description','room');stopped.runner.stop();
  stopped.runner.feed('HP: 10/10','prompt');stopped.runner.start();assert.deepEqual(stopped.sends,['look']);
  assert.equal(stopped.runner.state.outcome,'stopped');
  const fatal=manual('putrun child\nput forage grass',{name:'parent',getScript:()=>
    '# child\nput look\nwaitfor description\nwaitforre [\nput hunt'});
  fatal.runner.feed('description','room');assert.equal(fatal.runner.state.location.script,'child');
  fatal.runner.feed('HP: 10/10','prompt');assert.equal(fatal.runner.state.outcome,'error');
  assert.equal(fatal.diagnostics[0].script,'child');assert.equal(fatal.diagnostics[0].line,4);
  fatal.runner.feed('HP: 10/10','prompt');assert.deepEqual(fatal.sends,['look']);
});
test('authored pause after look completion retains its own timer and native roundtime is not bypassed',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const paused=manual('put look\nwaitfor description\npause 2\necho PAUSE_COMPLETE');
  paused.runner.feed('description','room');now=1500;paused.runner.feed('HP: 10/10 RT: 5','prompt');
  assert.equal(paused.runner.state.mode,'timer');assert.equal(paused.runner.state.timerRemainingMs,2000);
  now=2500;paused.runner.feed('HP: 10/10 RT: 4','prompt');assert.deepEqual(paused.echoes,[]);
  now=3500;paused.runner.feed('');assert.deepEqual(paused.echoes,['PAUSE_COMPLETE']);
  now=10000;const gated=manual('put look\nwaitfor description\nput forage grass\nwait\necho DONE');
  gated.runner.feed('description','room');gated.runner.feed('HP: 10/10 RT: 2','prompt');
  assert.deepEqual(gated.sends,['look']);assert.equal(gated.runner.state.pendingRtLine,'forage grass');
  now=13000;gated.runner.feed('');assert.deepEqual(gated.sends,['look','forage grass']);assert.deepEqual(gated.echoes,[]);
  gated.runner.feed('HP: 10/10 RT: 5','prompt');assert.deepEqual(gated.echoes,['DONE']);
});
test('unmatched completed look retains matchwait timeout without resurrecting a cancelled branch',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const {runner,sends,echoes}=manual('match hit impossible\nput look\nmatchwait 2\nput forage grass\nwait\necho TIMEOUT_ACTION\nexit\nhit:\necho WRONG');
  runner.feed('description','room');runner.feed('HP: 10/10','prompt');assert.deepEqual(sends,['look']);
  now=4000;runner.feed('');assert.deepEqual(sends,['look','forage grass']);assert.deepEqual(echoes,[]);
  runner.feed('impossible','msg');assert.deepEqual(echoes,[],'expired match does not supersede action wait');
  runner.feed('HP: 10/10','prompt');assert.deepEqual(echoes,['TIMEOUT_ACTION']);
});


test('actual raw colored rooms satisfy generated target presence and header-only absence gates',()=>{
  const hunt=buildHuntScript({cap:{guild:'barbarian',char:'Nativelooktest',circle:1,scriptBase:'fixture'},
    arena:{id:'sewers_1',fromArmed:[]},hallPath:[]});
  const start=hunt.indexOf('FIGHT_rat:');
  const end=hunt.indexOf('TG_rat:',start);
  assert.ok(start>=0&&end>start);
  const gate=hunt.slice(start+'FIGHT_rat:'.length,end);
  const script=`${gate}\nTG_rat:\necho TARGET_ABSENT\nexit\nFN_rat:\nput forage grass\nwait\necho ACTION_COMPLETE`;
  const presence=nativeTranscript(script,{room:'sewers_1'});
  const room=presence.events.find(e=>e.type==='room');
  assert.match(room.text,/\x1b\[1m\[\[/,'native backend room header remains raw ANSI in fixture');
  assert.match(room.text,/sewer rat\x1b\[0m is here/i,'SGR reset really interrupts generated visible noun match');
  assertOrderedLook(presence.events,'look');
  assert.ok(!presence.events.some(e=>e.line==='TARGET_ABSENT'));
  const absence=nativeTranscript(script,{room:'square'});
  assert.ok(!absence.events.some(e=>e.event==='send'&&e.line==='forage grass'));
  const prompt=absence.events.findIndex(e=>e.type==='prompt'&&e.command==='look');
  assert.ok(absence.events.findIndex(e=>e.line==='TARGET_ABSENT')>prompt,
    'colored header absence resolves only after its native look prompt');
});

test('SGR normalization preserves visible waitfor/regex and prompt state for raw and already plain callers',()=>{
  for(const wait of ['waitfor bold description','waitforre ^bold description$']) {
    const {runner,sends}=manual(`put look at crier\n${wait}\nput forage grass\nwait`);
    runner.feed('\x1b[1;33mbold\x1b[0m description','msg');
    assert.deepEqual(sends,['look at crier']);
    runner.feed('\x1b[36mHP: 10/20\x1b[0m Circle 1','prompt');
    assert.deepEqual(sends,['look at crier','forage grass']);
    assert.equal(runner.getVar('hp'),'10');
    assert.equal(runner.getVar('maxhp'),'20');
  }
  const plain=manual('waitfor description\necho DONE');plain.runner.feed('description');
  assert.deepEqual(plain.echoes,['DONE']);
  const colored=manual('waitfor description\necho DONE');colored.runner.feed('\x1b[1mdescription\x1b[m');
  assert.deepEqual(colored.echoes,['DONE']);
});
