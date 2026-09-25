import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWirePrompt, WireObserver } from '../puffer_adapter/wire_observation.mjs';

const prompt = () => ({ t: 'prompt', msg: '\n\x1b[36mHP: 100/100\x1b[0m  Fire: 20/30  Stamina: 70/80  Circle 1  50 silvers \n> ',
  requirements: { circle: 2, rows: [{ label: '1st weapon', have: 3, need: 4 }] } });
test('observer expires state and unrelated messages cannot refresh it', () => {
  let clock = 0;
  const observer = new WireObserver({ now: () => clock, staleMs: 100 });
  assert.equal(observer.snapshot().ready, false);
  assert.equal(observer.accept(prompt()).ready, true);
  clock = 101;
  assert.equal(observer.accept({ t: 'msg', msg: 'private chat' }).reason, 'stale_observation');
  assert.equal(observer.accept(prompt()).ready, false);
  clock = 0;
  const late = new WireObserver({ now: () => clock, staleMs: 100 });
  late.accept(prompt()); clock = 101;
  assert.equal(late.accept(prompt()).reason, 'stale_observation');
});
test('disconnect, login, parse uncertainty and manual stop latch until explicit new observer', () => {
  for (const stop of [o => o.disconnect(), o => o.stop(),
    o => o.accept({ t: 'login_prompt' }), o => o.accept({ t: 'prompt', msg: '?' })]) {
    const observer = new WireObserver(); observer.accept(prompt()); stop(observer);
    assert.equal(observer.accept(prompt()).ready, false);
    assert.equal(observer.snapshot().observation, null);
  }
  const observer = new WireObserver(); const view = observer.accept(prompt());
  view.observation.vitals.circle = 99;
  assert.equal(observer.snapshot().observation.vitals.circle, 1);
});
test('Barbarian wire values are read without invented exact EXP', () => {
  const parsed = parseWirePrompt(prompt());
  assert.equal(parsed.valid, true);
  assert.equal(parsed.vitals.resource, 'fire');
  assert.equal(parsed.vitals.roundtime_seconds, 0);
  assert.equal(parsed.exact_skill_exp, null);
  assert.equal(parsed.requirements.rows[0].have, 3);
});
test('roundtime and combat are observed, never inferred from training state', () => {
  const p = prompt(); p.msg = p.msg.replace('Circle', 'RT: 4  Circle').replace('silvers', 'silvers [COMBAT]');
  assert.equal(parseWirePrompt(p).vitals.roundtime_seconds, 4);
  assert.equal(parseWirePrompt(p).vitals.in_combat, true);
});
test('unsafe, missing, malformed or boosted observations fail closed', () => {
  for (const change of [p => p.t = 'login_prompt', p => p.msg = 'private chat',
    p => p.msg += '[BOOST x20]', p => p.msg = p.msg.replace('100/100', '0/100'),
    p => p.msg = p.msg.replace('100/100', '101/100'), p => delete p.requirements,
    p => p.requirements.circle = 3, p => p.requirements.rows[0].have = NaN,
    p => p.requirements.rows.push(p.requirements.rows[0])]) {
    const p = prompt(); change(p); const parsed = parseWirePrompt(p);
    assert.equal(parsed.valid, false); assert.equal(parsed.vitals, null);
    assert.equal(JSON.stringify(parsed).includes('private chat'), false);
  }
});
