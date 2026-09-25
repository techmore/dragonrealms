// Isolated real-socket contract check. No model, boosts, or primary-world access.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { WireObserver, WIRE_SCHEMA } from './wire_observation.mjs';

const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'dr-puffer-wire-'));
process.env.DR_DB_PATH=path.join(privateDir,'world.db');
const runId=`puffer-wire-smoke-${new Date().toISOString().replace(/[:.]/g,'-')}`;
const outputDir=new URL('../public/live/puffer/',import.meta.url);
fs.mkdirSync(outputDir,{recursive:true});
const receipt={schema:'dragonrealms.puffer.wire-smoke/1',run_id:runId,
  started_at:new Date().toISOString(),status:'starting',socket_deadline_seconds:8,
  scope:'Temporary isolated world; ordinary HTTP authentication and WebSocket; no policy inference or training',
  observation_schema:WIRE_SCHEMA,checkpoint_compatible:false,boost:1,commands:[],observations:[],checks:{}};
let game,server,wss,ws,observer,lastPrompt;
let closeDb=()=>{};
const receiptPath=new URL(`${runId}.json`,outputDir);
const save=()=>fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
save();
try {
  const db=await import('../server/db.js');closeDb=db.closeDb;db.migrate();
  const {Game}=await import('../server/game.js');
  const {createHttpHandler}=await import('../server/http.js');
  const {attachWebSocket}=await import('../server/session.js');
  game=new Game();game.init();
  server=createServer(createHttpHandler(game,{apiEnabled:true,debugApiEnabled:false,gmToken:undefined}));
  wss=attachWebSocket(server,game,{});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const base=`http://127.0.0.1:${server.address().port}`;
  const credentials={user:`wire_${randomUUID().replaceAll('-','').slice(0,12)}`,pass:randomUUID()};
  async function auth(route) {
    const response=await fetch(`${base}/api/${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(credentials),signal:AbortSignal.timeout(3000)});
    const body=await response.json();if(!response.ok||!body.ok)throw Error(`${route} failed`);return body;
  }
  await auth('register');const login=await auth('login');receipt.checks.register_and_login=true;
  ws=new WebSocket(base.replace('http:','ws:')+'/ws');
  let entered=false,lookSent=false,lookAcknowledged=false;
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('socket deadline')),8000);
    const finish=error=>{clearTimeout(timeout);error?reject(error):resolve()};
    ws.on('error',()=>finish(Error('socket error')));
    ws.on('close',()=>{observer?.disconnect();if(!lookAcknowledged)finish(Error('unexpected disconnect'))});
    ws.on('message',data=>{
      try {
        const m=JSON.parse(data.toString());
        // Auth frames and tokens are deliberately never stored in receipts.
        if(m.t==='login_prompt')ws.send(JSON.stringify({t:'token',token:login.token}));
        else if(m.t==='charselect')ws.send(JSON.stringify({t:'charselect',id:'new'}));
        else if(m.t==='charcreate')ws.send(JSON.stringify({t:'charcreate',name:'Pufferwirecheck',race:'gortog',guild:'barbarian'}));
        else if(m.t==='charalloc')ws.send(JSON.stringify({t:'enter'}));
        else if(m.t==='enter'){entered=true;observer=new WireObserver();receipt.checks.entered=true;}
        else if(m.t==='error')finish(Error('server rejected session or command'));
        else if(entered){
          const snapshot=observer.accept(m);
          if(snapshot.reason && snapshot.reason!=='awaiting_prompt')return finish(Error(snapshot.reason));
          if(m.t==='prompt'){
            lastPrompt=m;
            receipt.observations.push({ts:new Date().toISOString(),...snapshot});
            if(!snapshot.ready)return finish(Error('prompt was not usable'));
            if(!lookSent){
              lookSent=true;receipt.commands.push({ts:new Date().toISOString(),line:'look'});
              ws.send(JSON.stringify({t:'input',line:'look'}));
            }
          }
          if(m.t==='room' && lookSent){
            lookAcknowledged=true;receipt.checks.look_response=typeof m.roomId==='string';finish();
          }
        }
      }catch{finish(Error('wire protocol check failed'))}
    });
  });
  await new Promise(resolve=>{ws.once('close',resolve);ws.close()});
  receipt.checks.disconnect_latched=observer.snapshot().reason==='disconnected';
  receipt.checks.late_prompt_cannot_rearm=!observer.accept(lastPrompt).ready;
  receipt.checks.exact_exp_unknown=receipt.observations.every(o=>o.observation.exact_skill_exp===null);
  receipt.checks.requirements_observed=receipt.observations.every(o=>o.observation.requirements.rows.length>0);
  if(Object.values(receipt.checks).some(v=>v!==true))throw Error('contract check failed');
  receipt.status='passed';
}catch(error){receipt.status='failed';receipt.error=error.message;process.exitCode=1;}
finally {
  ws?.terminate();
  if(game&&server&&wss){
    const {shutdownWorld}=await import('../server/shutdown.js');
    try{await shutdownWorld({game,server,wss,closeDb})}catch{receipt.status='failed';receipt.error='shutdown failed';process.exitCode=1;}
  }else{game?.stop();closeDb();}
  // Only the exact mkdtemp-owned fixture is removed; no user world is touched.
  fs.rmSync(privateDir,{recursive:true,force:true});
  receipt.finished_at=new Date().toISOString();save();
  console.log(JSON.stringify({runId,status:receipt.status,checks:receipt.checks,receipt:receiptPath.pathname}));
}
