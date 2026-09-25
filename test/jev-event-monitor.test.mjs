import test from 'node:test';
import assert from 'node:assert/strict';
import { JevEventMonitor, JevEventTraceReader, JevEventTraceTail } from '../public/js/jev-event-monitor.js';

function mockTraceFetch(getSource,calls=[]){
  return async(url,options={})=>{
    calls.push({url,method:options.method||'GET',range:options.headers?.Range||null});
    const source=getSource();
    if(options.method==='HEAD')return new Response(null,{status:200,
      headers:{'content-length':String(source.byteLength)}});
    const start=Number(/^bytes=(\d+)-$/.exec(options.headers?.Range||'')?.[1]||0);
    if(start>=source.byteLength)return new Response(null,{status:416,
      headers:{'content-range':`bytes */${source.byteLength}`}});
    return new Response(source.slice(start),{status:206,
      headers:{'content-range':`bytes ${start}-${source.byteLength-1}/${source.byteLength}`}});
  };
}

test('incrementally keeps first/latest requirement samples and closure evidence',()=>{
  const monitor=new JevEventMonitor();
  monitor.ingest({type:'local-decision',ts:'2026-09-21T00:00:00Z',state:{requirements:{circle:2,rows:[
    {label:'3rd weapon',have:0,need:4},{label:'parry',have:2,need:3}]}}});
  monitor.ingest({type:'local-decision',ts:'2026-09-21T00:01:00Z',state:{requirements:{circle:2,rows:[
    {label:'3rd weapon',have:2,need:4},{label:'parry',have:3,need:3}]}}});
  const history=monitor.snapshot().gateHistory[0];
  assert.equal(history.snapshots,2);
  assert.deepEqual(history.rows,[
    {label:'3rd weapon',firstHave:0,latestHave:2,firstNeed:4,need:4,firstClosedAt:null,
      delta:2,closedDuringRun:false,closedAt:null},
    {label:'parry',firstHave:2,latestHave:3,firstNeed:3,need:3,firstClosedAt:'2026-09-21T00:01:00Z',
      delta:1,closedDuringRun:true,closedAt:'2026-09-21T00:01:00Z'},
  ]);
});

test('incrementally tracks Dragon Form evidence, offers, refusals, and provider latency',()=>{
  const monitor=new JevEventMonitor();
  monitor.ingest({type:'local-decision',ts:'2026-09-21T00:00:00Z',id:'ability_dragon',
    state:{inCombat:true,innerFire:20},options:[{id:'ability_dragon'}]});
  monitor.ingest({type:'execution',ts:'2026-09-21T00:00:00.100Z',command:'form dragon'});
  monitor.ingest({type:'local-decision',ts:'2026-09-21T00:00:01Z',id:'wait',
    state:{inCombat:true,innerFire:2},options:[]});
  monitor.ingest({type:'action-deferred',id:'ability_dragon',reason:'roundtime'});
  monitor.ingest({type:'local-response',elapsedMs:425});
  const summary=monitor.snapshot();
  assert.equal(summary.dragonOffers,1);
  assert.equal(summary.dragonSelections,1);
  assert.equal(summary.dragonFormDispatches,1);
  assert.equal(summary.dragonFormInferred,1);
  assert.equal(summary.dragonRtRefusals,1);
  assert.deepEqual(summary.responseMs,[425]);
});

test('keeps bounded recent decisions while accumulating loot totals',()=>{
  const monitor=new JevEventMonitor();
  for(let i=0;i<15;i++)monitor.ingest({type:'local-decision',ts:`2026-09-21T00:00:${String(i).padStart(2,'0')}Z`,id:`action_${i}`,state:{}});
  monitor.ingest({type:'loot-harvested',items:['hog_hide','hog_hide','tusk']});
  monitor.ingest({type:'loot-sold',item:'hog_hide',quantity:2});
  const summary=monitor.snapshot();
  assert.equal(summary.recentRows.length,10);
  assert.equal(summary.recentRows[0].id,'action_5');
  assert.deepEqual(summary.harvestedCounts,{hog_hide:2,tusk:1});
  assert.deepEqual(summary.soldCounts,{hog_hide:2});
});

test('reset clears accumulated run state before following a different run',()=>{
  const monitor=new JevEventMonitor();
  monitor.ingest({type:'loot-harvested',items:['hide']});
  monitor.reset();
  assert.deepEqual(monitor.snapshot().harvestedCounts,{});
  assert.equal(monitor.snapshot().recentRows.length,0);
});

test('legacy Jev decision records remain visible to dashboard summaries',()=>{
  const monitor=new JevEventMonitor();
  monitor.ingest({type:'jev',ts:'2026-09-21T00:00:00Z',id:'ability_dragon',
    state:{inCombat:true,innerFire:20},options:[{id:'ability_dragon'}]});
  assert.equal(monitor.snapshot().dragonOffers,1);
  assert.equal(monitor.snapshot().dragonSelections,1);
  assert.equal(monitor.snapshot().recentRows[0].type,'jev');
});

test('trace tail keeps exact byte offsets and parses JSONL across UTF-8 and line boundaries',()=>{
  const monitor=new JevEventMonitor(),tail=new JevEventTraceTail(monitor);
  const text='{"type":"loot-harvested","items":["Jév hide"]}\n{"type":"local-response","elapsedMs":12}\n';
  const bytes=new TextEncoder().encode(text);
  const split=new TextEncoder().encode(text.slice(0,text.indexOf('é'))).byteLength+1;
  const firstBytes=bytes.slice(0,split),secondBytes=bytes.slice(split);
  assert.equal(tail.append(firstBytes),0);
  assert.equal(tail.append(secondBytes),2);
  assert.equal(tail.offset,bytes.byteLength);
  assert.deepEqual(monitor.snapshot().harvestedCounts,{'Jév hide':1});
  assert.deepEqual(monitor.snapshot().responseMs,[12]);
});

test('trace tail retains an incomplete JSON record until its newline arrives',()=>{
  const monitor=new JevEventMonitor(),tail=new JevEventTraceTail(monitor);
  const first=new TextEncoder().encode('{"type":"loot-sold","item":"hide","quantity":2}');
  const second=new TextEncoder().encode('\n');
  assert.equal(tail.append(first),0);
  assert.deepEqual(monitor.snapshot().soldCounts,{});
  assert.equal(tail.append(second),1);
  assert.deepEqual(monitor.snapshot().soldCounts,{hide:2});
});

test('provider latency storage is capped while retaining a recent sample count',()=>{
  const monitor=new JevEventMonitor();
  for(let i=0;i<4100;i++)monitor.ingest({type:'local-response',elapsedMs:i});
  const summary=monitor.snapshot();
  assert.equal(summary.responseCount,4100);
  assert.equal(summary.responseMs.length,4096);
  assert.equal(summary.responseMs[0],4);
  assert.equal(summary.responseMs.at(-1),4099);
});

test('trace reader makes HEAD-only idle polls and requests appended bytes only',async()=>{
  const encoder=new TextEncoder(),monitor=new JevEventMonitor();let bytes=encoder.encode(
    JSON.stringify({type:'loot-harvested',items:['first']})+'\n');
  const calls=[],reader=new JevEventTraceReader(monitor,mockTraceFetch(()=>bytes,calls));
  let summary=await reader.refresh('run-a','/events.jsonl');
  assert.deepEqual(summary.harvestedCounts,{first:1});
  assert.deepEqual(calls.map(call=>call.range),[null,'bytes=0-']);
  calls.length=0;
  await reader.refresh('run-a','/events.jsonl');
  assert.deepEqual(calls.map(call=>call.method),['HEAD'],'unchanged logs need no body transfer');
  const appended=encoder.encode(JSON.stringify({type:'loot-harvested',items:['second']})+'\n');
  const offset=bytes.byteLength,combined=new Uint8Array(offset+appended.byteLength);
  combined.set(bytes);combined.set(appended,offset);bytes=combined;calls.length=0;
  summary=await reader.refresh('run-a','/events.jsonl');
  assert.deepEqual(summary.harvestedCounts,{first:1,second:1});
  assert.deepEqual(calls.map(call=>call.range),[null,`bytes=${offset}-`]);
});

test('trace reader resets its aggregates when run identity or file size changes',async()=>{
  const encoder=new TextEncoder(),monitor=new JevEventMonitor();let bytes=encoder.encode(
    JSON.stringify({type:'loot-harvested',items:Array(8).fill('old')})+'\n');
  const calls=[],reader=new JevEventTraceReader(monitor,mockTraceFetch(()=>bytes,calls));
  await reader.refresh('run-a','/a/events.jsonl');
  bytes=encoder.encode(JSON.stringify({type:'loot-harvested',items:['new']})+'\n');calls.length=0;
  const summary=await reader.refresh('run-a','/a/events.jsonl');
  assert.deepEqual(summary.harvestedCounts,{new:1});
  assert.deepEqual(calls.map(call=>call.range),[null,'bytes=0-']);
  bytes=encoder.encode(JSON.stringify({type:'loot-harvested',items:['other']})+'\n');calls.length=0;
  const next=await reader.refresh('run-b','/b/events.jsonl');
  assert.deepEqual(next.harvestedCounts,{other:1});
  assert.deepEqual(calls.map(call=>call.range),[null,'bytes=0-']);
});

test('trace reader parses a record completed by a later byte-range response',async()=>{
  const encoder=new TextEncoder(),monitor=new JevEventMonitor();
  let bytes=encoder.encode(JSON.stringify({type:'loot-sold',item:'hide',quantity:2}));
  const reader=new JevEventTraceReader(monitor,mockTraceFetch(()=>bytes));
  assert.deepEqual((await reader.refresh('run','/events.jsonl')).soldCounts,{});
  const newline=encoder.encode('\n'),combined=new Uint8Array(bytes.length+newline.length);
  combined.set(bytes);combined.set(newline,bytes.length);bytes=combined;
  assert.deepEqual((await reader.refresh('run','/events.jsonl')).soldCounts,{hide:2});
});
