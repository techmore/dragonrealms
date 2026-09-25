// Isolated production-generated-script benchmark worker. No model or live socket.
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {virtualClock} from './virtual_clock.mjs';
import {productionLibrary} from './script_baseline.mjs';
import {scriptController} from './script_controller.mjs';
import {controlObserver} from './control_observer.mjs';

const {values} = parseArgs({options:{seed:{type:'string',default:'0'},target:{type:'string',default:'20'},
  seconds:{type:'string',default:'300'},commands:{type:'string',default:'60000'},
  'simulated-seconds':{type:'string',default:'450000'},'hall-supervisor':{type:'boolean',default:false},
  'trace-commands':{type:'boolean',default:false}}});
const [seed,target,seconds,commandCap,simCap]=['seed','target','seconds','commands','simulated-seconds'].map(k=>Number(values[k]));
if (![seed,target,seconds,commandCap,simCap].every(Number.isInteger)||seed<0||seed>2147483647||target<2||target>20
    ||seconds<1||seconds>600||commandCap<4||commandCap>1000000||simCap<20||simCap>10000000) throw new Error('Invalid benchmark bounds');
const directory=mkdtempSync(join(tmpdir(),'dr-puffer-script-'));
process.env.DR_DB_PATH=join(directory,'world.db');process.env.DR_SPAWN_MULT='1';
console.log=(...args)=>process.stderr.write(args.join(' ')+'\n');
const {migrate,closeDb}=await import('../server/db.js');
const {registerAccount}=await import('../server/auth.js');
const {createCharacter,loadPlayer}=await import('../server/player.js');
const {Game}=await import('../server/game.js');
const {handleCommand}=await import('../server/commands/index.js');
const {circleRequirements}=await import('../data/guilds.js');
migrate();
const account=await registerAccount('PufferScript','local-disposable-account');
const clock=virtualClock(), oldRandom=Math.random;
let randomState=seed>>>0;
Math.random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
const game=new Game();game.init();
const player=loadPlayer(createCharacter(account.accountId,{name:'PufferScript',race:'gortog',guild:'barbarian'}));
game.addPlayer(player);
let host,commandCount=0,cycles=0,lastCommand=null,stop=false,milestones=[],lastCircle=1,messages=[];
let scriptHashes={};
const sourceFiles=['engine_script.mjs','script_baseline.mjs','script_controller.mjs','virtual_clock.mjs',
  'control_observer.mjs','hall_handoff.mjs','wire_observation.mjs',
  '../scripts/lib/script-gen.mjs','../public/js/script-engine.js'];
for(const dir of ['../data/','../server/'])sourceFiles.push(...readdirSync(new URL(dir,import.meta.url),{recursive:true}).filter(name=>name.endsWith('.js')).map(name=>dir+name));
sourceFiles.sort();
const sourceHash=()=>{const hash=createHash('sha256');for(const name of sourceFiles){hash.update(name);hash.update(readFileSync(new URL(name,import.meta.url)));}return hash.digest('hex');};
const beforeHash=sourceHash();
const started=Date.now(),wallStart=performance.now();
const observer=values['hall-supervisor']?controlObserver():null;
let phase='hunt',pendingHandoff=null,nextHallDecision=null,lastReceivedPrompt=null;
let commandReplies=null;
const handoffs=[];
const dead=()=>Boolean(player.lastCorpse)||player.hp<=0;
player.ws={readyState:1,send(raw){const event=typeof raw==='string'?JSON.parse(raw):raw;
  if(commandReplies&&typeof event.msg==='string'&&commandReplies.length<32)
    commandReplies.push({type:event.t,text:event.msg});
  if(event.t==='prompt'&&typeof event.msg==='string')lastReceivedPrompt=event.msg;
  if(observer){
    observer.feed(event);
    if(phase==='hall'&&event.t==='room'&&event.roomId==='hall_barbarian') handoffs.push({event:'hall_enter',commands:commandCount,room:event.roomId});
    if(phase==='hunt'&&!pendingHandoff){const decision=observer.decision();if(decision.action!=='hold')pendingHandoff=decision;}
  }
  if(event.msg){messages.push(event.msg);messages=messages.slice(-8);host?.feed(event.msg,event.t);}}};
function send(line){
  if(stop||dead()||player.circle>=target||commandCount>=commandCap)return;
  commandCount++;lastCommand=line;
  // Explicit diagnostics only, in this disposable isolated world. Never a
  // live-player transcript or part of default benchmark receipts.
  commandReplies=values['trace-commands']?[]:null;
  try {handleCommand(game,player,line,0,{applyRT:true});}
  finally {
    if(commandReplies)process.stdout.write(JSON.stringify({schema:'dragonrealms.puffer.script-command/1',
      command:line,index:commandCount,phase,simulated_seconds:(Date.now()-started)/1000,
      replies:commandReplies,database_isolated:true})+'\n');
    commandReplies=null;
  }
  if(player.circle>lastCircle){lastCircle=player.circle;milestones.push({circle:player.circle,commands:commandCount,
    simulated_seconds:(Date.now()-started)/1000,requirements:circleRequirements(player.guild,player.skills,player.circle)});}
}
function snapshot(status,reason){
  const requirements=circleRequirements(player.guild,player.skills,Math.min(target,player.circle+1));
  return {schema:'dragonrealms.puffer.production-script-benchmark/1',status,reason,seed,target_circle:target,
    controller:'production-generated baseline; fixed low-level arena, no wire-sweep adaptive supervisor',
    hall_supervisor:Boolean(observer),phase,handoffs:[...handoffs],control_equivalent_to_sims:false,
    guild:'barbarian',race:'gortog',boost:1,stat_allocation:{con:10,str:10,ref:10},
    circle:player.circle,death:dead(),requirements,requirement_gap:requirements.rows.reduce((sum,r)=>sum+Math.max(0,r.need-r.have),0),
    commands:commandCount,command_cap:commandCap,simulated_seconds:(Date.now()-started)/1000,
    simulated_seconds_cap:simCap,wall_seconds:(performance.now()-wallStart)/1000,seconds_cap:seconds,
    cycles,milestones,script_hashes:scriptHashes,source_sha256:beforeHash,source_unchanged:status==='completed'?sourceHash()===beforeHash:null,
    room:player.room,last_command:lastCommand,last_messages:messages,database_isolated:true,
    interpreter:host?.state.interpreter ?? null};
}
process.once('SIGTERM',()=>{stop=true;});process.once('SIGINT',()=>{stop=true;});
try {
  for(const line of ['alloc con 10','alloc str 10','alloc ref 10']){send(line);clock.advance(6000);}
  if(observer)send('look');
  for(let ticks=0;!stop&&!dead()&&player.circle<target&&commandCount<commandCap
      &&Date.now()-started<simCap*1000&&performance.now()-wallStart<seconds*1000;ticks++){
    if(!host||host.state.cycle_finished){
      if(host&&phase==='hall'){handoffs.push({event:'hall_script_return',commands:commandCount,room:observer.snapshot.room});phase='hunt';}
      const observed=observer?.snapshot;
      const generated=productionLibrary({room:observer?observed.room:player.room,arena:'sewers_3',circle:observer?observed.circle:player.circle,character:player.name,
        phase,trainList:phase==='hall'?observed.training:null,skipCircle:phase==='hall'&&nextHallDecision?.skipCircle===true});
      scriptHashes={...scriptHashes,...Object.fromEntries(Object.entries(generated.metadata.hashes).map(([name,hash])=>[`${cycles}:${name}`,hash]))};
      host=scriptController({library:generated.library,entry:generated.entry,isolated:true,send,roomNow:()=>player.room,
        initialPrompt:observer?lastReceivedPrompt:null,
        commandCap:commandCap-commandCount,simulatedSecondsCap:Math.max(.1,simCap-(Date.now()-started)/1000),
        unsafe:()=>stop||dead()||player.circle>=target||pendingHandoff?.action==='hall'});
      cycles++;host.start();
    }
    host.pump();
    if(pendingHandoff){
      const decision=pendingHandoff;pendingHandoff=null;observer.acknowledge(decision);
      if(decision.action==='hall'){
        host.stop('hall_handoff');host=null;phase='hall';nextHallDecision=decision;
        handoffs.push({event:'hall_handoff',reason:decision.reason,commands:commandCount,room:observer.snapshot.room,simulated_seconds:(Date.now()-started)/1000});
        continue;
      }
      if(decision.action==='probe_tdp')send('tdp');
    }
    if(host.state.stopped)break;
    clock.advance(100);
    if(ticks%1000===0){process.stdout.write(JSON.stringify(snapshot('running',null))+'\n');await new Promise(setImmediate);}
  }
  const reason=stop?'manual':dead()?'death':player.circle>=target?'target':commandCount>=commandCap?'command_cap':
    Date.now()-started>=simCap*1000?'simulated_time_cap':performance.now()-wallStart>=seconds*1000?'time_cap':host?.state.reason||'script_stopped';
  process.stdout.write(JSON.stringify(snapshot('completed',reason))+'\n');
} finally {
  host?.stop();game.stop();clock.close();Math.random=oldRandom;closeDb();rmSync(directory,{recursive:true,force:true});
}
