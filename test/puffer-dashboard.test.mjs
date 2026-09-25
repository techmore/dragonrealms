import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { checkIn, reviewPrompt } from '../public/js/puffer-checkin.js';
import { activity, matchingRecords, verifiedMilestones, runIdentity, matchingCircleRecord, workSummary } from '../public/js/puffer-records.js';
import { validRunId, watchView } from '../public/js/puffer-watch.js';
import { policyLabel, evaluationSummary, requirementBlip, historyCurve } from '../public/js/puffer-results.js';

const run = { run_id: 'puffer-test', scenario: 'barbarian', guild: 'barbarian', engine_contract: {engine:'test',horizon:2048}, evaluation_status: 'completed' };
const evidence = { run_id: run.run_id, rows: [{ policy: 'trained_greedy', circle: 2, requirements: { ok: true } }] };
const group = {key:'matched',guild:'barbarian',scenario:'barbarian',engine_contract:run.engine_contract,seeds:[1,2,3,4,5],runs:[run.run_id],best:{run_id:run.run_id,circle:2,samples:5,median_commands:100,median_simulated_seconds:1000}};
const published = {schema:'dragonrealms.puffer.records/1',circle_groups:[group]};

test('Barbarian best requires authoritative five-seed matching group, never an individual episode', () => {
  assert.equal(matchingCircleRecord(run, published), group);
  for (const state of [
    { ...run, scenario: 'circling' }, { ...run, guild: undefined },
    { ...run, engine_contract: {engine:'different'} }, { ...run, run_id:'puffer-other' },
  ]) assert.equal(matchingCircleRecord(state, published), null);
  for (const invalid of [
    {...group,seeds:[1,1,2,3,4]}, {...group,best:{...group.best,samples:1}},
    {...group,best:{...group.best,median_commands:null}}, {...group,runs:['puffer-other']},
    {...group,guild:'ranger'}, {...group,best:null},
  ]) assert.equal(matchingCircleRecord(run, {...published,circle_groups:[invalid]}), null);
  assert.equal(matchingCircleRecord(run, evidence), null);
  assert.equal(matchingCircleRecord(run, {...published,circle_groups:[]}), null);
  assert.equal(runIdentity({ scenario: 'circling' }).guild, 'Ranger');
  assert.equal(matchingRecords({schema:'dragonrealms.puffer.records/1',groups:[{runs:[run.run_id]}]}, run.run_id, run), null);
});

test('dashboard renders status, guild provenance, best and watch without missing HTML targets', () => {
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.value = ''; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    get options() { return this.children; }
    addEventListener() {}
    setAttribute() {}
  }
  const html = fs.readFileSync(new URL('../public/puffer.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
  const nodes = new Map(ids.map(id => [id, new Element()]));
  const document = {
    getElementById(id) { assert.ok(nodes.has(id), `Missing HTML ID: ${id}`); return nodes.get(id); },
    createElement: () => new Element(), createDocumentFragment: () => new Element(),
    querySelector: () => new Element(),
  };
  const context = vm.createContext({ document, checkIn, reviewPrompt, activity, matchingRecords, workSummary,
    verifiedMilestones, runIdentity, matchingCircleRecord, validRunId, watchView, policyLabel, evaluationSummary, requirementBlip, historyCurve,
    URLSearchParams, location: { search: '' }, AbortController, AbortSignal,
    fetch: () => new Promise(() => {}), setTimeout: () => 0, clearTimeout() {}, setInterval() {},
  });
  const source = fs.readFileSync(new URL('../public/js/puffer-monitor.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*;\n/gm, ''), context);
  function render(state, evaluation = null) {
    context.fixture = state; context.evaluation = evaluation;
    vm.runInContext('snapshot=fixture; watchEvaluation=evaluation; render(fixture); freshness(); renderWatch()', context);
  }
  const current = { ...run, status: 'running', evaluation_status: 'pending', updated_at: Date.now(),
    environment: { horizon: 2048, target_circle: 2 }, circle: 1, max_circle: 2,
    circle_milestones: [{ circle: 2, requirements: { ok: true } }] };
  render(current);
  assert.equal(nodes.get('hero-status').textContent, 'Running');
  assert.equal(nodes.get('best-circle').textContent, 'Circle 2');
  assert.equal(nodes.get('verified-best').textContent, 'Not yet verified');
  assert.match(nodes.get('watch-title').textContent, /Barbarian/);
  render({ ...current, updated_at: Date.now() - 20000 });
  assert.equal(nodes.get('hero-status').textContent, 'Activity unknown');
  render({ ...current, status: 'completed', evaluation_status: 'completed' }, evidence);
  assert.equal(nodes.get('hero-status').textContent, 'Not running');
  assert.equal(nodes.get('freshness').dataset.tone, 'neutral');
  assert.equal(nodes.get('verified-best').textContent, 'Not yet verified');
  context.recordFixture = published;
  vm.runInContext('records=recordFixture; renderRecords()',context);
  assert.equal(nodes.get('verified-best').textContent, 'Circle 2 · 5/5 seeds');
  render({ ...current, scenario: 'circling', guild: 'ranger', status: 'completed', evaluation_status: 'completed' }, evidence);
  assert.match(nodes.get('training-milestone-label').textContent, /Ranger/);
  assert.match(nodes.get('watch-title').textContent, /Ranger/);
  assert.equal(nodes.get('verified-best').textContent, 'No Barbarian run selected');
  assert.equal(nodes.get('hero-status').textContent, 'Barbarian not started');
  assert.match(nodes.get('hero-context').textContent, /archived Ranger/);
  context.indexFixture = {runs:[{run_id:'puffer-new-barbarian',scenario:'barbarian',guild:'barbarian'}]};
  vm.runInContext('records=indexFixture; renderRunSelector()', context);
  assert.ok(nodes.get('run-selector').options.some(option => option.value === 'puffer-new-barbarian' && option.textContent.includes('Barbarian')));
  assert.ok(nodes.get('run-selector').options.some(option => option.value === run.run_id));
  vm.runInContext("requestError='Offline'; freshness()", context);
  assert.equal(nodes.get('hero-status').textContent, 'Activity unknown');
});
