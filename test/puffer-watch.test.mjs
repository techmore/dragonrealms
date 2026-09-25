import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validRunId,watchView} from '../public/js/puffer-watch.js';
const now=1800000000000;
const manifest={run_id:'puffer-123',status:'completed',environment:{actions:['magic']},circle:1};
test('historical evaluations show counts and unmet requirements, not fake screen text',()=>{
  const evaluation={run_id:'puffer-123',rows:[{policy:'trained_greedy',seed:1,circle:1,actions:[20],commands:123,requirements:{missing:['first aid 1/4']}}]};
  const view=watchView(manifest,null,evaluation,'0',now);
  assert.equal(view.live,false);
  assert.match(view.text,/No game-text capture/);
  assert.match(view.text,/magic: 20/);
  assert.match(view.text,/first aid 1\/4/);
  assert.match(view.text,/123/);
});
test('live requires fresh captured text from an active run, never just completed metadata',()=>{
  const watch={captured_at:now/1000,messages:['A real captured event']};
  assert.equal(watchView({...manifest,status:'running',watch},null,null,'',now).live,true);
  assert.equal(watchView({...manifest,watch},null,null,'',now).live,false);
  assert.equal(watchView({...manifest,status:'running',watch},null,null,'',now+16000).live,false);
  assert.equal(watchView({...manifest,status:'running'},null,null,'',now).live,false);
});
test('other run evidence and unsafe run paths are rejected',()=>{
  assert.equal(watchView(manifest,null,{run_id:'puffer-other',rows:[{}]},'',now).episodes.length,0);
  assert.equal(validRunId('puffer-20260915-143754-890869'),true);
  for(const value of ['../manifest','puffer-../../secret','<script>',null]) assert.equal(validRunId(value),false);
});
