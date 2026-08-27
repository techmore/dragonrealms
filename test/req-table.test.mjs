// Requirement-table (Olwydd-style live-card row) unit tests:
// the have/need color thresholds, the [reqs] line parser, and the full
// rows[] that circleRequirements() now returns (driver + UI feed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { circleRequirements } from '../data/guilds.js';

// Load the plain-script helper in a node context (no build step, no deps).
new Function(readFileSync(new URL('../public/js/req-table.js', import.meta.url), 'utf8'))();
const T = globalThis.DRReqTable;

test('reqState thresholds: met / near (within 2) / far', () => {
  assert.equal(T.reqState(6, 6), 'met');
  assert.equal(T.reqState(8, 6), 'met');
  assert.equal(T.reqState(5, 6), 'near', '1 short → amber');
  assert.equal(T.reqState(4, 6), 'near', 'exactly 2 short → amber');
  assert.equal(T.reqState(3, 6), 'far', '3 short → red');
  assert.equal(T.reqState(0, 6), 'far');
});

test('parseReqLine extracts rows from a driver [reqs] line', () => {
  const line = '[reqs] 5m c2 | expertise 12/4, 1st weapon 15/4, 1st armor 5/6, parry 2/4';
  const p = T.parseReqLine(line);
  assert.equal(p.min, 5);
  assert.equal(p.circle, 2);
  assert.deepEqual(p.rows, [
    { label: 'expertise', have: 12, need: 4 },
    { label: '1st weapon', have: 15, need: 4 },
    { label: '1st armor', have: 5, need: 6 },
    { label: 'parry', have: 2, need: 4 },
  ]);
  assert.equal(T.parseReqLine('[gaps] 5m circle 1->2 blocked:1 shortfall:2'), null, 'gaps line is not a reqs line');
  assert.equal(T.parseReqLine(''), null);
});

test('renderTable colors met/near/far and labels Expert(Tactics)/Primary Mastery', () => {
  const html = T.renderTable(T.parseReqLine('[reqs] 5m c2 | expertise 12/4, 1st armor 5/6, parry 1/4'));
  assert.match(html, /Expert\(Tactics\)/);
  assert.match(html, /1st Armor/);
  assert.match(html, /12\/4/, 'met cell present');
  assert.match(html, /5\/6/, 'near cell present');
  assert.match(html, /1\/4/, 'far cell present');
  const metIdx = html.indexOf('>12/4<');
  assert.ok(html.slice(0, metIdx).includes('var(--green'), 'met cell colored green');
  const farIdx = html.indexOf('>1/4<');
  assert.ok(html.slice(0, farIdx).includes('var(--red'), 'far cell colored red');
  assert.equal(T.renderTable(null), '');
});

test('circleRequirements returns full rows (not just missing) for the UI feed', () => {
  const skills = { expertise: { rank: 9 }, parry: { rank: 4 }, light_armor: { rank: 6 } };
  const res = circleRequirements({ id: 'barbarian' }, skills, 2);
  assert.ok(res.rows.length > 5, 'barbarian c2 table has many rows');
  // Banded-cumulative: c2 need = band × 2 (1st armor band 3 → 6).
  const armorRow = res.rows.find((r) => r.label === '1st armor');
  assert.equal(armorRow.have, 6);
  assert.equal(armorRow.need, 6);
  const expRow = res.rows.find((r) => r.label === 'expertise');
  assert.equal(expRow.need, 8);
  assert.equal(expRow.hard, true);
});
