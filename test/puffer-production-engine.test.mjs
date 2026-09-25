import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupGame,teardownGame,auth,createCharacter,loadPlayer,handleCommand} from './helpers.mjs';
import {productionLibrary} from '../puffer_adapter/script_baseline.mjs';
import {scriptController} from '../puffer_adapter/script_controller.mjs';
import {virtualClock} from '../puffer_adapter/virtual_clock.mjs';

test('received prompt heartbeat releases waits after room arrival without inventing state',()=>{
  const clock=virtualClock();let host;const sent=[];
  try {
    host=scriptController({isolated:true,library:{main:'put status\nwait\nmove n\nwait\nput look\n'},entry:'main',
      commandCap:10,simulatedSecondsCap:30,roomNow:()=>null,
      send:line=>{sent.push(line);if(line==='status')host.feed('\x1b[32mHP: 10/10  Stamina: 10/10\x1b[0m','prompt');if(line==='n')host.feed('New room','room');}});
    host.start();host.pump();assert.deepEqual(sent,['status','n']);
    clock.advance(1000);host.pump();assert.deepEqual(sent,['status','n','look']);
  } finally {host?.stop();clock.close();}
});

test('production-generated hunt uses real navigation and purchases through the client interpreter',async()=>{
  const game=setupGame();
  let clock,host;
  try {
    const account=await auth.registerAccount('PufferScriptTest','local-test-only');
    const player=loadPlayer(createCharacter(account.accountId,{name:'PufferScriptTest',race:'gortog',guild:'barbarian'}));
    game.addPlayer(player);
    const initialRoom=player.room, initialSilver=player.silver;
    const generated=productionLibrary({room:player.room,arena:'sewers_2',circle:1,character:player.name});
    clock=virtualClock();
    const commands=[],rooms=[],messages=[];
    host=scriptController({library:generated.library,entry:generated.entry,isolated:true,
      commandCap:100,simulatedSecondsCap:300,roomNow:()=>player.room,
      unsafe:()=>Boolean(player.combatId)||player.hp<=0,
      send:line=>{commands.push(line);handleCommand(game,player,line,0,{applyRT:true});}});
    player.ws={readyState:1,send(raw){const event=typeof raw==='string'?JSON.parse(raw):raw;
      messages.push(event);
      if(event.t==='room')rooms.push(player.room);
      if(event.msg)host.feed(event.msg,event.t);}};
    host.start();
    for(let i=0;i<3000&&!host.state.stopped&&!host.state.cycle_finished;i++) {
      host.pump();clock.advance(100);
    }
    host.stop('test_complete');
    assert.ok(commands.includes('look'));
    assert.ok(commands.some(line=>/^buy /.test(line)),JSON.stringify({commands,rooms,initialRoom,initialSilver,messages:messages.slice(0,12)},null,2));
    assert.ok(rooms.some(room=>room!==initialRoom),'real navigation changed room');
    assert.ok(player.silver<initialSilver,'gear was bought with the real starter purse');
    assert.ok(player.inventory.length||Object.keys(player.equipment).length,'purchases affected the real player');
    assert.equal(player.circle,1,'this integration test is not a circling milestone');
    const before=commands.length;host.pump();assert.equal(commands.length,before);
  } finally {
    host?.stop();clock?.close();teardownGame();
  }
});
