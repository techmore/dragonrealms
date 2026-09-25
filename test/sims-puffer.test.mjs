import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { discoveredRuns, mountPufferRuns } from '../public/js/sims-puffer.js';

test('discovery includes latest before records catch up and rejects unsafe IDs', () => {
  const runs = discoveredRuns({ runs: [{run_id:'puffer-a'}, {run_id:'../../secret'}, {run_id:'puffer-b',status:'running'}] }, {run_id:'puffer-b',status:'completed'});
  assert.deepEqual(runs, [{run_id:'puffer-b',status:'completed'}, {run_id:'puffer-a'}]);
  assert.deepEqual(discoveredRuns(null, null), []);
});

test('Sims renders post-training evidence, selectable screen, and offline warning', async t => {
  class Node {
    value = ''; children = []; listeners = {};
    replaceChildren(...children) { this.children = children; }
    addEventListener(event, cb) { this.listeners[event] = cb; }
  }
  const html = fs.readFileSync(new URL('../public/sims.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/id="(sp-[^"]+)"/g)].map(m => m[1]);
  const nodes = new Map(ids.map(id => [id, new Node()]));
  const doc = { getElementById(id) { assert.ok(nodes.has(id), id); return nodes.get(id); }, createElement: () => new Node() };
  const run = { run_id:'puffer-example', status:'completed', evaluation_status:'completed', guild:'barbarian', scenario:'barbarian', target_circle:20, updates:32 };
  const result = { run_id:run.run_id, rows:[{policy:'trained_greedy', seed:7, circle:20, requirements:{ok:true},death:false,watch:{last_command:'circle',circle:20,messages:['<script>not HTML</script>']}}] };
  let offline = false, playing = false;
  const stop = mountPufferRuns(doc, async path => {
    if (offline) throw new Error('Offline');
    if (path.endsWith('live-play.json')) return playing ? {ok:true,status:200,json:async()=>({
      ...run,run_id:'puffer-play-example',run_kind:'frozen_live_play',status:'running',evaluation_status:'running',
      updated_at:Date.now()/1000,current_activity:'knife_combat',watch:{captured_at:Date.now()/1000,last_command:'attack rat',messages:['A rat falls.']}
    })} : {ok:false,status:404};
    return { ok:true, status:200, json:async () => path.endsWith('records.json') ? {runs:[run]} : path.endsWith('latest.json') || path.endsWith('manifest.json') ? run : result };
  });
  t.after(stop);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.get('sp-status').textContent, 'Idle · run finished');
  assert.match(nodes.get('sp-results').children[0].textContent, /1\/1 reached target/);
  assert.match(nodes.get('sp-screen').textContent, /LAST COMMAND  circle/);
  assert.match(nodes.get('sp-screen').textContent, /<script>not HTML<\/script>/);
  assert.match(nodes.get('sp-details').href, /puffer-example#watch-panel$/);
  assert.equal(nodes.get('sp-watch-status').textContent, 'SAVED · recorded state');
  nodes.get('sp-episode').value = '';
  nodes.get('sp-episode').listeners.change();
  assert.match(nodes.get('sp-screen').textContent, /Training snapshot/);
  playing = true;
  await nodes.get('sp-run').listeners.change();
  assert.equal(nodes.get('sp-status').textContent, 'PLAYING · frozen model');
  assert.equal(nodes.get('sp-watch').open, true);
  assert.match(nodes.get('sp-screen').textContent, /attack rat/);
  assert.match(nodes.get('sp-screen').textContent, /knife_combat/);
  assert.match(nodes.get('sp-watch-status').textContent, /^LIVE/);
  offline = true;
  await nodes.get('sp-run').listeners.change();
  assert.match(nodes.get('sp-status').textContent, /Unavailable/);
  assert.match(nodes.get('sp-watch-status').textContent, /stale/);
});
