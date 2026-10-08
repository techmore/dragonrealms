import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serializePublicExperiment } from '../scripts/lib/public-experiment.mjs';
import { simulationWatchLink } from '../public/js/sim-watch.js';

test('public experiment serialization preserves evidence and excludes credential fields', () => {
  const report = {runId:'fixture',status:'running',startedAt:'2026-10-08T00:00:00Z',updatedAt:'2026-10-08T00:00:01Z',worldPort:3001,
    completedLegs:0,targetCircle:10,watchToken:'private-watch',gmToken:'private-gm',authorization:'private-bearer',
    plan:[{index:1,guild:'barbarian',char:'Fixture',status:'running',token:'private-plan'}]};
  const encoded = serializePublicExperiment(report), value = JSON.parse(encoded);
  assert.deepEqual(value,{runId:report.runId,status:report.status,startedAt:report.startedAt,updatedAt:report.updatedAt,targetCircle:10,worldPort:3001,completedLegs:0,plan:[{index:1,guild:'barbarian',char:'Fixture',status:'running'}]});
  for(const secret of ['private-watch','private-gm','private-bearer','private-plan']) assert.equal(encoded.includes(secret),false);
  const publisher=readFileSync(new URL('../scripts/race-guild-sweep.mjs',import.meta.url),'utf8');
  assert.ok(publisher.includes('const encoded = serializePublicExperiment(body);'));
});

test('legacy public watch tokens are ignored; same-origin watch requires the private operator token', () => {
  const manifest={worldPort:3000,watchToken:'untrusted-public'};
  const options={origin:'http://localhost:3000',operatorToken:'private-operator'};
  const allowed=simulationWatchLink('Name & safe',manifest,options);
  const url=new URL(allowed.href);
  assert.equal(allowed.enabled,true);
  assert.equal(url.searchParams.get('spectate'),'Name & safe');
  assert.equal(url.hash,'#gm=private-operator');
  assert.equal(allowed.href.includes('untrusted-public'),false);
  const disabled=simulationWatchLink('Name',manifest,{origin:options.origin});
  assert.equal(disabled.enabled,false);assert.equal(disabled.href,null);assert.match(disabled.title,/GM token needed/);
});

test('cross-origin world watch never transfers the current-world credential', () => {
  for(const origin of ['http://localhost:3000','https://example.test']) {
    const link=simulationWatchLink('Name',{worldPort:3001,watchToken:'untrusted-public'},{origin,operatorToken:'private-operator'});
    const url=new URL(link.href);
    assert.equal(url.port,'3001');assert.equal(url.hash,'');
    assert.equal(link.href.includes('private-operator'),false);assert.equal(link.href.includes('untrusted-public'),false);
    assert.equal(link.enabled,true);assert.match(link.title,/its own GM credential/);
  }
  assert.equal(new URL(simulationWatchLink('Name',{worldPort:443},{origin:'https://example.test',operatorToken:'private-operator'}).href).hash,'#gm=private-operator');
});
