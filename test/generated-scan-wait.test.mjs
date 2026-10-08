import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as h from './helpers.mjs';
import { buildHuntScript } from '../scripts/lib/script-gen.mjs';
import { createRunner } from '../public/js/script-engine.js';
import { virtualClock } from '../puffer_adapter/virtual_clock.mjs';

h.setupGame();
after(() => h.teardownGame());

const hunt = buildHuntScript({ cap: { guild: 'barbarian', char: 'Scanfixture', circle: 1, scriptBase: 'fixture' },
  arena: { id: 'sewers_3', fromArmed: [] }, hallPath: [] });
const scan = hunt.slice(hunt.indexOf('SCAN:') + 'SCAN:'.length, hunt.indexOf('SCAN_LOOK:') + 'SCAN_LOOK:'.length);

test('generated scan probes after native room arrival without waiting for an unsolicited prompt', async () => {
  let clock, runner;
  try {
    const account = await h.auth.registerAccount('Scanfixture', 'secretword9');
    const p = h.loadPlayer(h.createCharacter(account.accountId, { name: 'Scanfixture', race: 'human', guild: 'barbarian' }));
    h.game.addPlayer(p); p.room = 'sewers_2'; p.ws = h.fakeWs();
    clock = virtualClock(); const pending = [], sent = [], replies = [];
    runner = createRunner(`move n\n${scan}\nput look\nwait\nexit`, [], {
      roomNow: () => p.room, send: line => { pending.push(line); sent.push(line); },
    }).start();
    const dispatch = () => {
      const line = pending.shift(), start = p.ws.msgs.length;
      h.handleCommand(h.game, p, line, 0, { applyRT: true });
      for (const frame of p.ws.msgs.slice(start)) {
        replies.push(frame); if (frame.msg) runner.feed(frame.msg.replace(/\x1b\[[0-9;]*m/g, ''), frame.t);
      }
    };
    assert.deepEqual(sent, ['n']); dispatch();
    assert.equal(p.room, 'sewers_3');
    const poolsAfterMovement = JSON.stringify(p.expPools);
    assert.ok(replies.some(frame => frame.t === 'room'));
    assert.ok(!replies.some(frame => frame.t === 'prompt'), 'ordinary movement owns only a room response');
    clock.advance(1999); runner.feed('', false); assert.deepEqual(sent, ['n']);
    clock.advance(1); runner.feed('', false); assert.deepEqual(sent, ['n', 'exp']);
    assert.equal(runner.state.mode, 'match');
    dispatch();
    assert.ok(replies.some(frame => frame.t === 'msg' && /Experience/.test(frame.msg || '')), 'native EXP sends its real information response');
    clock.advance(5000); runner.feed('', false); assert.deepEqual(sent, ['n', 'exp', 'look']);
    dispatch(); assert.equal(runner.running, false);
    assert.equal(p.circle, 1); assert.equal(JSON.stringify(p.expPools), poolsAfterMovement);
  } finally { runner?.stop(); clock?.close(); }
});

test('generated EXP probe keeps a bounded timeout when no response arrives', () => {
  const clock = virtualClock(); const sent = [];
  const runner = createRunner(`${scan}\nput look\nwait\nexit`, [], { send: line => sent.push(line) }).start();
  try {
    clock.advance(2000); runner.feed('', false); assert.deepEqual(sent, ['exp']);
    clock.advance(4999); runner.feed('', false); assert.deepEqual(sent, ['exp']);
    clock.advance(1); runner.feed('', false); assert.deepEqual(sent, ['exp', 'look']);
  } finally { runner.stop(); clock.close(); }
});

for (const sharedFight of [false, true]) {
  test(`generated ${sharedFight ? 'shared' : 'inline'} target checks register before look and reject non-room absence`, () => {
    const source = buildHuntScript({ cap: { guild: 'barbarian', char: 'Scanfixture', circle: 1, scriptBase: 'fixture', sharedFight },
      arena: { id: 'sewers_3', fromArmed: [] }, hallPath: [] });
    const gate = source.slice(source.indexOf('FIGHT_rat:'), source.indexOf('TG_rat:'));
    assert.ok(gate.indexOf('matchre TG_rat') < gate.indexOf('put look'));
    assert.ok(gate.indexOf('matchre FN_rat') < gate.indexOf('put look'));
    const absent = new RegExp(gate.match(/matchre TG_rat ([^\n]+)/)[1]);
    for (const prose of ['HP: 145/145 RT: 0 Circle 1', 'Experience\nScholarship rank 0', 'You attack a kobold!'])
      assert.equal(absent.test(prose), false);
    assert.equal(absent.test('\n[[Sewer Junction, Sewers]]\nA sewer rat is here.'), false);
    assert.equal(absent.test('\n[[Empty Sewer, Sewers]]\nObvious paths: south.'), true);
  });
}

test('actual generated target check reaches a native attack rather than repeating look', async () => {
  let clock, runner;
  try {
    const account = await h.auth.registerAccount('Fightscan', 'secretword9');
    const p = h.loadPlayer(h.createCharacter(account.accountId, { name: 'Fightscan', race: 'human', guild: 'barbarian' }));
    h.game.addPlayer(p); p.room = 'sewers_1'; p.ws = h.fakeWs(); clock = virtualClock();
    const pending = [], sent = [];
    runner = createRunner(`goto FIGHT_rat\n${hunt}`, [], {
      roomNow: () => p.room, send: line => { pending.push(line); sent.push(line); },
    }).start();
    let attacked = false;
    for (let attempts = 0; attempts < 40 && runner.running && !attacked; attempts++) {
      if (!pending.length) { clock.advance(1000); runner.feed('', false); continue; }
      const line = pending.shift(), start = p.ws.msgs.length;
      h.handleCommand(h.game, p, line, 0, { applyRT: true });
      for (const frame of p.ws.msgs.slice(start)) if (frame.msg) runner.feed(frame.msg.replace(/\x1b\[[0-9;]*m/g, ''), frame.t);
      if (line === 'attack sewer rat') attacked = true;
    }
    assert.equal(attacked, true, JSON.stringify(sent));
    assert.ok(h.game.combat.getFor(p), 'real attack entered native combat');
    assert.equal(sent.filter(line => line === 'look').length, 1, 'presence gate does not loop look');
    assert.ok(p.ws.msgs.some(frame => /engage|attack|swing|rat/i.test(frame.msg || '')));
    assert.equal(p.circle, 1);
  } finally { runner?.stop(); clock?.close(); }
});
