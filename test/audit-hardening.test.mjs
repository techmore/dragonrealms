import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { auth, db, createCharacter, loadPlayer, setupGame, teardownGame, game, fakeWs, handleCommand } from './helpers.mjs';
import { addItem } from '../server/player.js';
import { dropPlayerItem, takeFloorItem } from '../server/corpses.js';
import { route } from '../server/session.js';
import { consumeCommandBudget, COMMANDS_PER_SECOND } from '../server/command-budget.js';
import { apiRequest, reapApiSessions, API_MESSAGE_LIMIT, API_SESSION_IDLE_MS } from '../server/api.js';
import { normalizeCorpus } from '../scripts/lib/corpus-normalize.mjs';

before(() => setupGame());
after(() => teardownGame());

async function player(name) {
  const account = await auth.registerAccount(name.toLowerCase(), 's3cretword');
  const id = createCharacter(account.accountId, { name, race: 'human', guild: 'barbarian' });
  const p = loadPlayer(id);
  p.ws = fakeWs();
  return p;
}

function session(p = null, token = null) {
  const messages = [];
  return { game, player: p, token, accountId: p?.accountId, state: p ? 'playing' : 'login',
    authGeneration: 0, send: (message) => messages.push(message), messages };
}

async function api(method, path, token, body) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { method, url: '/api/' + path, headers: { host: 'localhost', authorization: 'Bearer ' + token } });
  let status;
  let response;
  await apiRequest(req, { writeHead(code) { status = code; }, end(text) { response = JSON.parse(text); } }, game);
  return { status, ...response };
}

test('failed multi-item drop restores durable and in-memory ownership', async (t) => {
  const p = await player('Droprollback');
  p.room = 'square';
  game.floorItems.set(p.room, []);
  db.prepare('DELETE FROM world_loot WHERE room=?').run(p.room);
  addItem(p, 'dagger', 2);
  const count = () => p.inventory.filter((entry) => entry.item.id === 'dagger').reduce((sum, entry) => sum + entry.qty, 0);
  db.exec(`CREATE TRIGGER fail_second_drop BEFORE INSERT ON world_loot
    WHEN (SELECT COUNT(*) FROM world_loot WHERE room='square') > 0
    BEGIN SELECT RAISE(ABORT, 'injected floor failure'); END`);
  t.after(() => db.exec('DROP TRIGGER IF EXISTS fail_second_drop'));
  assert.equal(dropPlayerItem(game, p, { item: (await import('../data/items.js')).itemById('dagger') }, 2).ok, false);
  assert.equal(count(), 2);
  assert.equal(game.floorItems.get(p.room).length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM world_loot WHERE room=?').get(p.room).n, 0);
  handleCommand(game, p, 'get dagger');
  assert.equal(count(), 2, 'no phantom can be collected');
  db.exec('DROP TRIGGER fail_second_drop');
  assert.equal(dropPlayerItem(game, p, { item: (await import('../data/items.js')).itemById('dagger') }, 3).ok, false);
  assert.equal(count(), 2, 'insufficient quantity rolls back without minting loot');
  assert.equal(game.floorItems.get(p.room).length, 0);
});

test('failed floor pickup leaves quantity, instances and inventory unchanged', async (t) => {
  const p = await player('Pickuprollback');
  p.room = 'square';
  addItem(p, 'dagger', 1, { condition: 37, quality: 1.2, maker: 'Tester' });
  const item = (await import('../data/items.js')).itemById('dagger');
  assert.equal(dropPlayerItem(game, p, { item }, 1).ok, true);
  const floor = game.floorItems.get(p.room).at(-1);
  floor.instances = [{ condition: 37, quality: 1.2, maker: 'Tester' }];
  const inventory = structuredClone(p.inventory);
  const snapshot = structuredClone(floor);
  db.exec(`CREATE TRIGGER fail_pickup BEFORE DELETE ON world_loot
    BEGIN SELECT RAISE(ABORT, 'injected pickup failure'); END`);
  t.after(() => db.exec('DROP TRIGGER IF EXISTS fail_pickup'));
  assert.equal(takeFloorItem(p, floor).ok, false);
  assert.deepEqual(p.inventory, inventory);
  assert.deepEqual(floor, snapshot);
  db.exec('DROP TRIGGER fail_pickup');
  db.prepare('DELETE FROM world_loot WHERE uid=?').run(floor.uid);
  assert.equal(takeFloorItem(p, floor).ok, false, 'stale rows cannot mint inventory');
  assert.deepEqual(p.inventory, inventory);
});

test('authentication storage rejection is caught at routing boundary', async (t) => {
  await auth.registerAccount('authreject', 's3cretword');
  const s = session();
  t.mock.method(console, 'error', () => {});
  db.exec(`CREATE TRIGGER fail_auth BEFORE INSERT ON sessions
    BEGIN SELECT RAISE(ABORT, 'injected auth failure'); END`);
  t.after(() => db.exec('DROP TRIGGER IF EXISTS fail_auth'));
  await assert.doesNotReject(() => route(s, { t: 'login', u: 'authreject', p: 's3cretword' }));
  assert.equal(s.state, 'login');
  assert.ok(s.messages.some((message) => message.code === 'SESSION_ERROR'));
});

test('logout clears authorization even when persistence fails', async (t) => {
  const p = await player('Logoutfailure');
  const login = await auth.loginAccount('logoutfailure', 's3cretword');
  game.addPlayer(p);
  const s = session(p, login.token);
  t.mock.method(console, 'error', () => {});
  t.mock.method(game, 'persistPlayer', () => { throw new Error('injected save failure'); });
  route(s, { t: 'logout' });
  assert.equal(s.state, 'login');
  assert.equal(s.player, null);
  assert.equal(s.token, null);
  assert.equal(game.players.has(p.charId), false);
  assert.equal(auth.validateSession(login.token), null);
  clearTimeout(s.authTimer);
});

test('partial stack pickup checks durable quantity and rolls back on update failure', async (t) => {
  const p = await player('Stackrollback');
  p.room = 'square';
  addItem(p, 'rat_pelt', 3);
  const item = (await import('../data/items.js')).itemById('rat_pelt');
  assert.equal(dropPlayerItem(game, p, { item }, 3).ok, true);
  const floor = game.floorItems.get(p.room).at(-1);
  db.exec(`CREATE TRIGGER fail_stack BEFORE UPDATE ON world_loot
    BEGIN SELECT RAISE(ABORT, 'injected stack failure'); END`);
  t.after(() => db.exec('DROP TRIGGER IF EXISTS fail_stack'));
  const inventory = structuredClone(p.inventory);
  assert.equal(takeFloorItem(p, floor, 1).ok, false);
  assert.equal(floor.qty, 3);
  assert.deepEqual(p.inventory, inventory);
  db.exec('DROP TRIGGER fail_stack');
  db.prepare('UPDATE world_loot SET qty=2 WHERE uid=?').run(floor.uid);
  assert.equal(takeFloorItem(p, floor, 1).ok, false, 'mismatched persisted quantity fails closed');
  assert.equal(floor.qty, 3);
  assert.deepEqual(p.inventory, inventory);
  db.prepare('UPDATE world_loot SET qty=3 WHERE uid=?').run(floor.uid);
  assert.equal(takeFloorItem(p, floor, 1).ok, true);
  assert.equal(floor.qty, 2);
  assert.equal(db.prepare('SELECT qty FROM world_loot WHERE uid=?').get(floor.uid).qty, 2);
});

test('closed socket cannot be resurrected by async authentication', async () => {
  await auth.registerAccount('closedauth', 's3cretword');
  const s = session();
  const pending = route(s, { t: 'login', u: 'closedauth', p: 's3cretword' });
  s.closed = true;
  s.authGeneration++;
  await pending;
  assert.equal(s.token, null);
  assert.equal(s.messages.length, 0);
});

test('revoked and expired tokens cannot drive already-entered players', async () => {
  for (const [name, expired] of [['Revokedplay', false], ['Expiredplay', true]]) {
    const p = await player(name);
    const login = await auth.loginAccount(name.toLowerCase(), 's3cretword');
    game.addPlayer(p);
    const s = session(p, login.token);
    if (expired) db.prepare('UPDATE sessions SET expires_at=0 WHERE account_id=?').run(p.accountId);
    else auth.logoutSession(login.token);
    route(s, { t: 'input', line: 'say should not run' });
    assert.equal(s.state, 'login');
    assert.equal(game.players.has(p.charId), false);
    assert.ok(s.messages.some((message) => message.code === 'SESSION_EXPIRED'));
    clearTimeout(s.authTimer);
  }
});

test('command execution budgets cover chains, alias fanout, frames and oversized lines', async (t) => {
  const p = await player('Chainbudget');
  let executions = 0;
  t.mock.method(game, 'who', () => { executions++; return []; });
  const owner = {};
  const opts = { consumeCommand: () => consumeCommandBudget(owner) };
  handleCommand(game, p, Array(1000).fill('who').join(';'), 0, opts);
  assert.equal(executions, COMMANDS_PER_SECOND);
  handleCommand(game, p, 'who', 0, opts);
  assert.equal(executions, COMMANDS_PER_SECOND, 'next frame shares the same budget');
  p.aliases = { burst: Array(20).fill('branch').join(';'), branch: Array(20).fill('who').join(';') };
  executions = 0;
  handleCommand(game, p, 'burst');
  assert.equal(executions, COMMANDS_PER_SECOND);
  handleCommand(game, p, 'who ' + 'x'.repeat(5000));
  assert.equal(executions, COMMANDS_PER_SECOND);
  assert.equal(consumeCommandBudget(owner, Date.now() + 1001), true);
});

test('world creature health and rewards are authoritative across simultaneous fights', async () => {
  const a = await player('Sharedalpha');
  const b = await player('Sharedbeta');
  a.room = b.room = 'sewers_1';
  const instance = game.roomCreatures.get(a.room)[0];
  instance.alive = true;
  instance.hp = instance.maxHp;
  const ca = game.combat.start(a, [instance.def], [instance]).combat;
  const cb = game.combat.start(b, [instance.def], [instance]).combat;
  ca.enemies[0].hp -= 7;
  assert.equal(cb.enemies[0].hp, instance.maxHp - 7);
  const before = b.silver;
  ca.killCreature(ca.enemies[0]);
  assert.equal(instance.alive, false);
  cb.killCreature(cb.enemies[0]);
  assert.equal(b.silver, before);
  assert.equal(b.corpses?.length || 0, 0);
  assert.equal(a.corpses.length, 1);
  ca.killCreature(ca.enemies[0]);
  assert.equal(a.corpses.length, 1, 'repeat defeat resolution is idempotent');
  instance.respawnAt = 1;
  game.respawnTick();
  assert.equal(instance.alive, true);
  assert.equal(cb.enemies[0].dead, true, 'old fights cannot claim the next spawn generation');
  const hp = instance.hp;
  cb.enemies[0].hp = 0;
  assert.equal(instance.hp, hp, 'stale enemies cannot damage a respawn');
  cb.tick();
  assert.equal(game.combat.getFor(b), null);
});

test('HTTP sessions bound and drain messages, expire unattended, and share chain budget', async () => {
  const p = await player('Apiidle');
  const login = await auth.loginAccount('apiidle', 's3cretword');
  assert.equal((await api('POST', 'enter', login.token, { charId: p.charId })).ok, true);
  const live = game.players.get(p.charId);
  for (let i = 0; i < API_MESSAGE_LIMIT + 10; i++) live.ws.send({ t: 'msg', msg: String(i) });
  assert.equal(live.ws.msgs.length, API_MESSAGE_LIMIT);
  const state = await api('GET', 'state', login.token);
  assert.equal(state.messages.length, API_MESSAGE_LIMIT);
  assert.equal(state.messagesDropped, 10);
  assert.equal(live.ws.msgs.length, 0);
  const chain = await api('POST', 'command', login.token, { command: Array(21).fill('who').join(';') });
  assert.match(chain.messages.map((message) => message.msg || '').join(' '), /Too many commands/);
  const next = await api('POST', 'command', login.token, { command: 'who' });
  assert.match(next.messages.map((message) => message.msg || '').join(' '), /rate limit/);
  reapApiSessions(game, Date.now() + API_SESSION_IDLE_MS + 1);
  assert.equal(game.players.has(p.charId), false);
  assert.ok(auth.validateSession(login.token), 'idle runtime retirement does not revoke the account token');
});

test('HTTP logout revokes credentials even if saving the player fails', async (t) => {
  const p = await player('Apilogoutfail');
  const login = await auth.loginAccount('apilogoutfail', 's3cretword');
  await api('POST', 'enter', login.token, { charId: p.charId });
  t.mock.method(game, 'persistPlayer', () => { throw new Error('injected HTTP save failure'); });
  await assert.rejects(() => api('POST', 'logout', login.token, {}), /injected HTTP save failure/);
  assert.equal(auth.validateSession(login.token), null);
  assert.equal(game.players.has(p.charId), false);
});

test('corpus ignores timed FE position but preserves command responses and order', () => {
  const frames = [{ t: '>>', cmd: 'look' }, { t: 'room', msg: 'A room' }, { t: 'prompt', msg: '> ' }];
  assert.equal(normalizeCorpus(frames), normalizeCorpus([frames[0], { t: 'mindstate', skills: [] }, ...frames.slice(1)]));
  assert.notEqual(normalizeCorpus(frames), normalizeCorpus([frames[0], { t: 'error', msg: 'oops' }, ...frames.slice(1)]));
  assert.notEqual(normalizeCorpus(frames), normalizeCorpus([...frames].reverse()));
});
