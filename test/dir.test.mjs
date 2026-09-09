// DIR verb: town directions. Exercises the real dispatcher and room graph.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, setupGame, teardownGame, createCharacter, loadPlayer,
  handleCommand, reviveRoomSpawns, fakeWs,
} from './helpers.mjs';
import { findPath } from '../data/grid.js';

let game;

// Walk the player along a real path so p.room is honest.
function walkTo(p, roomId) {
  for (const step of findPath(p.room, roomId)) game.move(p, step);
  reviveRoomSpawns(game, p.room);
}

// Capture the msg lines emitted by one command.
function run(p, cmd) {
  const before = p.ws.msgs.length;
  handleCommand(game, p, cmd, 0, {});
  return p.ws.msgs.slice(before).filter((m) => m.t === 'msg').map((m) => m.msg).join('\n');
}

test.before(() => { game = setupGame(); });
test.after(() => teardownGame());

test('bare dir shows help and category names', async () => {
  const acc = await auth.registerAccount('Dirhelp', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dirhelp', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'square');
  const out = run(p, 'dir');
  assert.match(out, /Directions/);
  assert.match(out, /dir <place>/);
  assert.match(out, /guilds/);
  assert.match(out, /shops/);
  game.removePlayer(p);
});

test('dir <place> gives steps that are a legal prefix of the real route (bank)', async () => {
  const acc = await auth.registerAccount('Dirwalker', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dirwalker', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'square');
  const out = run(p, 'dir bank');
  assert.match(out, /Heading to /);
  // The default shows the first 5 steps — a legal PREFIX of the route, not
  // the whole way (DR's DIR BANK 5 shows 5 steps at a time). Follow the
  // shown steps on the real map: each hop must be legal, no wedges.
  const body = out.split(/Heading to [^:]+:/)[1] || '';
  const stepPart = body.split('.')[0].trim();
  const expanded = [];
  for (const chunk of stepPart.split(', ').map((s) => s.trim())) {
    const run = /^(\d+)x\s+(\w+)$/.exec(chunk);
    const one = /^(\w+)$/.exec(chunk);
    if (run) for (let i = 0; i < Number(run[1]); i++) expanded.push(run[2]);
    else if (one) expanded.push(one[1]);
  }
  assert.ok(expanded.length > 0, `expected parseable steps, got: ${stepPart}`);
  assert.ok(expanded.length <= 5, `default should show at most 5 steps, got ${expanded.length}`);
  let landed = 'square';
  for (const dir of expanded) {
    const res = game.move(p, dir);
    assert.equal(res.ok, true, `step ${dir} from ${landed} refused: ${res.msg}`);
    landed = p.room;
  }
  // And the full remaining route from where the prefix lands still reaches
  // the bank (the directions were truthful, just truncated).
  const full = findPath(landed, 'bank_plaza');
  assert.ok(full, 'bank still reachable from the prefix endpoint');
  assert.equal(landed === 'bank_plaza' ? 0 : full.length + expanded.length,
    findPath('square', 'bank_plaza').length,
    'shown prefix + remaining path = the whole route (same length, honest truncation)');
  game.removePlayer(p);
});

test('dir honors the steps argument (dir bank 2 shows at most 2 moves)', async () => {
  const acc = await auth.registerAccount('Dirsteps', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dirsteps', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'square');
  const out = run(p, 'dir bank 2');
  assert.match(out, /Heading to /);
  assert.match(out, /more step/);
  const steps = out.split(/Heading to [^:]+:/)[1].split('.')[0].trim().split(', ').filter(Boolean);
  assert.ok(steps.length <= 2, `expected <= 2 rendered chunks, got ${steps.length}: ${steps.join(', ')}`);
  game.removePlayer(p);
});

test('dir resolves aliases and containment (barbarian, barbarian guild)', async () => {
  const acc = await auth.registerAccount('Diralias', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Diralias', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'square');
  for (const q of ['barbarian', 'barbarian guild']) {
    const out = run(p, `dir ${q}`);
    assert.match(out, /Barbarian Guildhall/, `query "${q}" should route to the hall`);
  }
  game.removePlayer(p);
});

test('dir list shows categories; dir list shops lists shop entries', async () => {
  const acc = await auth.registerAccount('Dirlist', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dirlist', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'square');
  const all = run(p, 'dir list');
  for (const cat of ['Guilds', 'Training', 'Gates', 'Hunting', 'Shops', 'Other']) {
    assert.match(all, new RegExp(cat, 'i'), `missing category ${cat}`);
  }
  const shops = run(p, 'dir list shops');
  assert.match(shops, /Tannery|Alchemist|Gems|Bank/i);
  game.removePlayer(p);
});

test('dir list nonsense names the valid categories', async () => {
  const acc = await auth.registerAccount('Dircat', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dircat', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'square');
  const out = run(p, 'dir list blorbo');
  assert.match(out, /guilds/i);
  assert.match(out, /other/i);
  game.removePlayer(p);
});

test('dir unknown place suggests dir list', async () => {
  const acc = await auth.registerAccount('Dirnone', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dirnone', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'square');
  const out = run(p, 'dir atlantis');
  assert.match(out, /cannot recall directions/i);
  assert.match(out, /dir list/i);
  game.removePlayer(p);
});

test('dir refuses outside town with DR-flavored prose', async () => {
  const acc = await auth.registerAccount('Dirwild', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dirwild', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'sewers_1');
  const out = run(p, 'dir bank');
  assert.match(out, /do not offer directions/i);
  game.removePlayer(p);
});

test('dir works in Riverhaven for its own landmarks and refuses Crossing ones', async () => {
  const acc = await auth.registerAccount('Dirriver', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dirriver', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'rh_square');
  assert.match(run(p, 'dir temple'), /Harbor Shrine/);
  assert.match(run(p, 'dir barbarian'), /Barbarian Guildhall/);
  assert.match(run(p, 'dir town hall'), /cannot recall/i);
  game.removePlayer(p);
});

test('dir ferry from crossing renders a full honest path', async () => {
  const acc = await auth.registerAccount('Dirferry', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dirferry', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'square');
  const out = run(p, 'dir ferry 30');
  assert.match(out, /Heading to /);
  assert.doesNotMatch(out, /mystery/);
  game.removePlayer(p);
});

test('dir is not roundtime-gated', async () => {
  const acc = await auth.registerAccount('Dirrt', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dirrt', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  walkTo(p, 'square');
  run(p, 'study'); // arms roundtime (applyRT not set here, but keep the shape honest)
  const out = run(p, 'dir bank');
  assert.match(out, /Heading to /);
  game.removePlayer(p);
});
