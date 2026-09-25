import fs from 'node:fs';
import path from 'node:path';
import { SkillCensusProbe, mergeSkillCensusIntoState,
  parseSkillCensus, shouldRequestSkillCensus } from './jev-skill-census.mjs';

function runDirectory(root,pid) {
  const base=path.join(root,'public/live/jev-player');
  let names;
  try { names=fs.readdirSync(base); } catch { return null; }
  for(const name of names) {
    const dir=path.join(base,name);
    try {
      if(!fs.statSync(dir).isDirectory())continue;
      const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
      if(manifest.pid===pid)return dir;
    } catch {}
  }
  return null;
}

function appendRunEvent(root,pid,event) {
  const dir=runDirectory(root,pid);
  if(!dir)return false;
  fs.appendFileSync(path.join(dir,'events.jsonl'),JSON.stringify(event)+'\n');
  return true;
}

// Install an opt-in, observer-only extension around WireSession. It uses the
// ordinary `skills` command and the normal WS connection. Nothing in the game
// server or hashed player/policy modules is changed.
export function installJevSkillCensusInstrumentation(WireSession,{root,
  intervalMs=180_000,timeoutMs=5_000,minHpFraction=0.8,
  now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,
  writeEvent=(pid,event)=>appendRunEvent(root,pid,event)}={}) {
  if(typeof WireSession!=='function'||!WireSession.prototype)
    throw new TypeError('WireSession class is required');
  if(!root)throw new TypeError('project root is required');
  if(!Number.isInteger(intervalMs)||intervalMs<1||!Number.isInteger(timeoutMs)||timeoutMs<1)
    throw new TypeError('intervalMs and timeoutMs must be positive integers');
  const originalConnect=WireSession.prototype.connect;
  if(originalConnect.__jevSkillCensusInstrumented)return false;
  function connectWithCensus(handlers={}) {
    const session=this;
    if(handlers.__jevSkillCensusWrapped)return originalConnect.call(session,handlers);
    if(!session.__jevSkillCensus)session.__jevSkillCensus={entered:false,lastRequestedAt:0,pending:null};
    const observer=session.__jevSkillCensus;
    const finish=()=>{
      if(!observer.pending)return null;
      const pending=observer.pending;
      observer.pending=null;
      clearTimer(pending.timer);
      const event=pending.probe.finish(new Date(now()).toISOString());
      if(!event)return null;
      if(event.complete)Object.assign(session.vitals,mergeSkillCensusIntoState(session.vitals,event,event.ts));
      try {
        writeEvent(session.pid??process.pid,{type:'skill-census-request',command:'skills',
          requestedAt:event.requestedAt,complete:event.complete});
        writeEvent(session.pid??process.pid,event);
      } catch {}
      return event;
    };
    const request=()=>{
      const v=session.vitals||{};
      if(!observer.entered||observer.pending)return false;
      const state={inCombat:v.inCombat,hp:v.hp,maxHp:v.maxhp,rt:v.rt,
        bleeding:v.bleeding,overloaded:v.overloaded};
      const current=now();
      if(!shouldRequestSkillCensus(state,{now:current,lastRequestedAt:observer.lastRequestedAt,
        intervalMs,minHpFraction}))return false;
      observer.lastRequestedAt=current;
      const probe=new SkillCensusProbe();
      probe.begin(new Date(current).toISOString());
      observer.pending={probe,timer:null};
      observer.pending.timer=setTimer(finish,timeoutMs);
      try {
        const sent=session.cmd('skills');
        Promise.resolve(sent).catch(()=>finish());
        return true;
      } catch { finish(); return false; }
    };
    const wrapped={...handlers,
      onEnter(...args) {
        observer.entered=true;
        return handlers.onEnter?.(...args);
      },
      onPrompt(...args) {
        request();
        return handlers.onPrompt?.(...args);
      },
      onText(text,type,...args) {
        if(observer.pending) {
          observer.pending.probe.text(text);
          // The native skills panel is one complete msg frame. Finish early
          // when its self-check passes; otherwise the bounded timeout records
          // an incomplete census, never fabricated zero-ranks.
          if(type==='msg'&&parseSkillCensus(text).complete)finish();
        }
        return handlers.onText?.(text,type,...args);
      },
    };
    Object.defineProperty(wrapped,'__jevSkillCensusWrapped',{value:true});
    return originalConnect.call(session,wrapped);
  }
  Object.defineProperty(connectWithCensus,'__jevSkillCensusInstrumented',{value:true});
  WireSession.prototype.connect=connectWithCensus;
  return true;
}
