// Parse the ordinary, read-only `skills` command output. This is a harness
// observer helper; it does not add or change a game command.
import { SKILLS } from '../../data/skills.js';

const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const stripAnsi=value=>String(value||'').replace(/\x1b\[[0-9;]*m/g,'');
const SKILL_IDS=new Map(Object.entries(SKILLS).flatMap(([id,skill])=>[
  [normalize(id),id],[normalize(skill.name),id],
]));

export function parseSkillCensus(text='') {
  const skills={};
  const duplicateSkillIds=new Set();
  const clean=stripAnsi(text);
  const totalMatch=/Skills\s*\(total ranks:\s*(\d+)\)/i.exec(clean);
  for(const line of clean.split(/\r?\n/)) {
    const match=/^\s{2,}(.+?)\s+(\d+)\s+([a-z][a-z -]*)\s*$/i.exec(line);
    if(!match)continue;
    const id=SKILL_IDS.get(normalize(match[1]));
    if(id) {
      if(Object.hasOwn(skills,id))duplicateSkillIds.add(id);
      skills[id]=Number(match[2]);
    }
  }
  const missingSkillIds=Object.keys(SKILLS).filter(id=>!Object.hasOwn(skills,id));
  const sumSkillRanks=Object.values(skills).reduce((sum,rank)=>sum+rank,0);
  const totalRanks=totalMatch?Number(totalMatch[1]):null;
  const totalRanksMatch=totalRanks!==null&&sumSkillRanks===totalRanks;
  return {skills,complete:missingSkillIds.length===0&&duplicateSkillIds.size===0&&totalRanksMatch,
    totalRanks,
    sumSkillRanks,totalRanksMatch,duplicateSkillIds:[...duplicateSkillIds],
    parsedSkillCount:Object.keys(skills).length,expectedSkillCount:Object.keys(SKILLS).length,
    missingSkillIds};
}

export function mergeSkillCensusIntoState(state={},census={},observedAt=null) {
  if(!state||typeof state!=='object'||Array.isArray(state))
    throw new TypeError('state must be an object');
  if(!census?.complete)return {...state,skillSnapshotComplete:false,
    skillSnapshotSource:'partial-skills-command',skillSnapshotAt:observedAt};
  const hasEverySkill=Object.keys(SKILLS).every(id=>Object.hasOwn(census.skills||{},id));
  if(!hasEverySkill||Object.keys(census.skills||{}).length!==Object.keys(SKILLS).length)
    return {...state,skillSnapshotComplete:false,
      skillSnapshotSource:'invalid-skills-command-census',skillSnapshotAt:observedAt};
  return {...state,skills:{...(state.skills||{}),...census.skills},
    skillSnapshotComplete:true,skillSnapshotSource:'skills-command',
    skillSnapshotAt:observedAt,skillCensusTotalRanks:census.totalRanks};
}

export function skillCensusEvent(census={},observedAt=null) {
  const complete=Boolean(census.complete&&Object.keys(SKILLS).every(id=>
    Object.hasOwn(census.skills||{},id))&&Object.keys(census.skills||{}).length===Object.keys(SKILLS).length);
  return {type:'skill-census',ts:observedAt,complete,
    skills:complete?{...census.skills}:null,
    totalRanks:complete?census.totalRanks:null,
    parsedSkillCount:census.parsedSkillCount??Object.keys(census.skills||{}).length,
    expectedSkillCount:census.expectedSkillCount??Object.keys(SKILLS).length};
}

function isCompleteSkillMap(skills) {
  return Boolean(skills&&typeof skills==='object'&&!Array.isArray(skills)
    &&Object.keys(skills).length===Object.keys(SKILLS).length
    &&Object.keys(SKILLS).every(id=>Object.hasOwn(skills,id)));
}

// Attach the latest complete census to decision snapshots only while fresh.
// Partial census events never erase or complete a decision's rank evidence.
export function attachRecentSkillCensus(events,{maxAgeSeconds=180}={}) {
  let latest=null;
  return events.map(event=>{
    if(event?.type==='skill-census') {
      const at=Date.parse(event.ts||'');
      if(event.complete===true&&isCompleteSkillMap(event.skills)&&Number.isFinite(at))
        latest={at,skills:event.skills,totalRanks:event.totalRanks};
      return null;
    }
    if(!event?.state||!/-decision$/.test(String(event.type||'')))return event;
    if(event.state.skillSnapshotComplete===true&&isCompleteSkillMap(event.state.skills))return event;
    const at=Date.parse(event.ts||'');
    if(!latest||!Number.isFinite(at)||at<latest.at||at-latest.at>maxAgeSeconds*1000)return event;
    return {...event,state:{...event.state,skills:{...(event.state.skills||{}),...latest.skills},
      skillSnapshotComplete:true,skillSnapshotSource:'skill-census-event',
      skillSnapshotAt:new Date(latest.at).toISOString(),skillCensusTotalRanks:latest.totalRanks}};
}).filter(Boolean);
}

// Optional observer-side collector for the ordinary read-only `skills`
// command. The caller owns scheduling/sending; this object only brackets the
// response text and emits a census event when the matching prompt arrives.
export class SkillCensusProbe {
  constructor({onCensus=()=>{},maxBytes=65536}={}) {
    if(typeof onCensus!=='function')throw new TypeError('onCensus must be a function');
    if(!Number.isInteger(maxBytes)||maxBytes<1)throw new TypeError('maxBytes must be a positive integer');
    this.onCensus=onCensus;
    this.maxBytes=maxBytes;
    this.pending=null;
  }

  begin(requestedAt=new Date().toISOString()) {
    if(this.pending)return false;
    const at=Date.parse(requestedAt);
    if(!Number.isFinite(at))throw new TypeError('requestedAt must be a valid timestamp');
    this.pending={requestedAt:new Date(at).toISOString(),chunks:[],bytes:0,overflow:false};
    return true;
  }

  text(chunk) {
    if(!this.pending)return false;
    const value=String(chunk??'');
    this.pending.bytes+=Buffer.byteLength(value,'utf8');
    if(this.pending.bytes>this.maxBytes) {
      this.pending.chunks=[];
      this.pending.overflow=true;
      return false;
    }
    if(!this.pending.overflow)this.pending.chunks.push(value);
    return true;
  }

  finish(observedAt=new Date().toISOString()) {
    if(!this.pending)return null;
    const pending=this.pending;
    this.pending=null;
    const census=pending.overflow?{complete:false,skills:{},totalRanks:null,
      parsedSkillCount:0,expectedSkillCount:Object.keys(SKILLS).length}:parseSkillCensus(pending.chunks.join('\n'));
    const event={...skillCensusEvent(census,observedAt),command:'skills',
      requestedAt:pending.requestedAt,responseBytes:pending.bytes,
      ...(pending.overflow?{captureError:'response-too-large'}:{})};
    this.onCensus(event);
    return event;
  }

  cancel() {
    if(!this.pending)return false;
    this.pending=null;
    return true;
  }
}

// Callers may use this to schedule a read-only census without colliding with
// combat/roundtime or hammering the skills panel. The command itself is sent
// by the caller only when this predicate returns true.
export function shouldRequestSkillCensus(state={}, {now=Date.now(),lastRequestedAt=0,
  intervalMs=180_000,minHpFraction=0.8}={}) {
  if(!Number.isFinite(now)||!Number.isFinite(lastRequestedAt)
      ||!Number.isFinite(intervalMs)||intervalMs<1
      ||!Number.isFinite(minHpFraction)||minHpFraction<0||minHpFraction>1)return false;
  const hp=Number(state.hp),maxHp=Number(state.maxHp);
  const rt=Number(state.rt);
  const bleeding=Array.isArray(state.bleeding)?state.bleeding.length>0
    :state.bleeding===true||(Number(state.bleeding)||0)>0;
  if(state.inCombat!==false||!Number.isFinite(rt)||rt>0||bleeding||state.overloaded
      ||!Number.isFinite(hp)||!Number.isFinite(maxHp)||maxHp<=0
      ||hp/maxHp<minHpFraction)return false;
  return now-lastRequestedAt>=intervalMs;
}
