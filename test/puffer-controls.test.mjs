import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createControl,startArgs} from '../puffer_adapter/control.mjs';

test('training budget is typed, bounded, and contains no arbitrary arguments',()=>{
  assert.equal(startArgs({updates:500,minutes:60})[startArgs({updates:500,minutes:60}).indexOf('--steps')+1],'64000');
  for(const body of [null,{},[],{updates:5000,minutes:60},{updates:'50',minutes:10},{updates:50,minutes:10,resume:'anything'}]) assert.throws(()=>startArgs(body));
});
test('controller rejects foreign origins, unsafe input, overlap and inactive stop',async t=>{
  let runs=[],calls=[];
  const server=createControl({active:async()=>runs,execute:async args=>{calls.push(args);return JSON.stringify({run_id:'puffer-test'});}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const url=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,origin='http://127.0.0.1:3000')=>fetch(url+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post('/start',{updates:50,minutes:10},'http://evil.example')).status,403);
  assert.equal((await post('/start',{updates:51,minutes:10})).status,400);
  assert.equal((await post('/stop',{run_id:'puffer-test'})).status,409);
  runs=[{run_id:'puffer-active',kind:'train',pid:1}];
  assert.equal((await post('/start',{updates:50,minutes:10})).status,409);
  assert.equal(calls.length,0);
  assert.equal((await post('/stop',{run_id:'puffer-active'})).status,200);
  assert.deepEqual(calls[0],['-m','puffer_adapter.run','--stop','puffer-active']);
  runs=[];
  assert.equal((await post('/start',{updates:50,minutes:10})).status,200);
  assert.equal(calls.length,2);
});
test('double clicks cannot start overlapping launch requests',async t=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let started;
  const entered=new Promise(resolve=>{started=resolve;});
  const server=createControl({active:async()=>[],execute:async()=>{started();await gate;return '{}';}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const post=()=>fetch(`http://127.0.0.1:${server.address().port}/start`,{method:'POST',headers:{Origin:'http://127.0.0.1:3000','Content-Type':'application/json'},body:JSON.stringify({updates:50,minutes:10})});
  const first=post();await entered;
  assert.equal((await post()).status,409);
  release();assert.equal((await first).status,200);
});
