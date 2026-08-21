// GM console read-only API suite: summary/world/room/player inspection,
// DB browser, and the auth guard. Spins up an isolated HTTP server and temp
// database so `npm test` never depends on a separately running dev server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const tmp = mkdtempSync(join(tmpdir(), 'dr-gm-test-'));
process.env.DR_DB_PATH = join(tmp, 'gm.db');
const GM_TOKEN = 'gm-test-secret-that-is-not-a-game-session';

const { migrate, closeDb, db } = await import('../server/db.js');
const { Game } = await import('../server/game.js');
const { createHttpHandler } = await import('../server/http.js');

let server;
let game;
let base;
let token;

before(async () => {
  migrate();
  game = new Game();
  game.init();
  server = createServer(createHttpHandler(game, { apiEnabled: true, gmToken: GM_TOKEN }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const reg = await fetch(base + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: 'gmsuite', pass: 'probepass1' }),
  }).then((r) => r.json());
  assert.ok(reg.token, 'registered a GM test session');
  token = reg.token;

  const created = await fetch(base + '/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Gmprobe', race: 'human', guild: 'barbarian' }),
  }).then((r) => r.json());
  assert.equal(created.ok, true, 'created an offline character to inspect');
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  game.stop();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

const gmFetch = (p, credential = GM_TOKEN) => fetch(base + '/api/gm' + p, {
  headers: credential ? { Authorization: `Bearer ${credential}` } : {},
});
const g = async (p) => (await gmFetch(p)).json();

test('GM endpoints require the exact dedicated token, never a game session', async () => {
  const r = await gmFetch('/summary', null);
  assert.equal(r.status, 401, 'no token -> 401');
  assert.equal((await gmFetch('/summary', 'forged-token')).status, 403, 'invalid token -> 403');
  assert.equal((await gmFetch('/summary', GM_TOKEN + '-suffix')).status, 403, 'token must match exactly');
  assert.equal((await gmFetch('/summary', token)).status, 403, 'ordinary game session -> 403');
  assert.equal((await gmFetch('/summary')).status, 200, 'configured GM token -> 200');

  const unconfiguredServer = createServer(createHttpHandler(game, { apiEnabled: true, gmToken: '' }));
  await new Promise((resolve) => unconfiguredServer.listen(0, '127.0.0.1', resolve));
  const unconfigured = await fetch(`http://127.0.0.1:${unconfiguredServer.address().port}/api/gm/summary`, {
    headers: { Authorization: `Bearer ${GM_TOKEN}` },
  });
  assert.equal(unconfigured.status, 503, 'missing server-side GM configuration fails closed');
  await new Promise((resolve) => unconfiguredServer.close(resolve));
});

test('GM summary reports world/DB/live counts', async () => {
  const s = await g('/summary');
  assert.equal(s.ok, true);
  assert.equal(s.game, 'dragonrealms');
  assert.ok(s.rooms >= 50, 'rooms indexed');
  assert.ok(s.creatures >= 15, 'creatures indexed');
  assert.ok(s.guilds === 11, 'guilds indexed');
  assert.ok(typeof s.accounts === 'number', 'accounts counted');
  assert.ok(Array.isArray(s.online), 'online list present');
});

test('GM world lists zones and rooms with exits', async () => {
  const w = await g('/world');
  assert.equal(w.ok, true);
  assert.ok(w.zones.length >= 9, 'zones present');
  const town = w.zones.find((z) => z.id === 'town');
  assert.ok(town, 'town zone');
  assert.ok(town.rooms.some((r) => r.id === 'square'), 'square room present');
  const square = town.rooms.find((r) => r.id === 'square');
  assert.ok(square.exits.n, 'square has exits');
});

test('GM room detail returns creatures/players/floor', async () => {
  const r = await g('/room/square');
  assert.equal(r.ok, true);
  assert.equal(r.room.id, 'square');
  assert.ok(Array.isArray(r.creatures));
  assert.ok(Array.isArray(r.players));
});

test('GM player inspect works online and offline', async () => {
  const p = await g('/player/Gmprobe');
  assert.equal(p.ok, true);
  assert.equal(p.player.guild, 'barbarian');
  assert.ok(typeof p.player.circle === 'number');
  assert.ok(p.inventory && Array.isArray(p.inventory));
  assert.ok(p.skills && typeof p.skills === 'object');
  // a name that can't exist returns 404-style failure cleanly
  const x = await g('/player/NoSuchPlayerXYZ');
  assert.equal(x.ok, false);
});

test('GM creatures/items/guilds/races/skills indexes', async () => {
  const c = await g('/creatures');
  assert.ok(c.ok && c.creatures.length >= 15);
  const i = await g('/items');
  assert.ok(i.ok && i.items.length >= 50);
  const gl = await g('/guilds');
  assert.ok(gl.ok && gl.guilds.length === 11);
  const r = await g('/races');
  assert.ok(r.ok && r.races.length === 12);
  const s = await g('/skills');
  assert.ok(s.ok && s.skills.length >= 80);
});

test('GM unknown endpoint fails cleanly', async () => {
  const x = await g('/definitely-not-real');
  assert.equal(x.ok, false);
  assert.ok(x.error);
});

test('GM DB browser lists tables and runs sandboxed SELECTs', async () => {
  const d = await g('/db');
  assert.ok(d.ok && Array.isArray(d.tables), 'tables listed');
  assert.ok(d.tables.includes('characters'), 'characters table present');
  assert.ok(!d.tables.includes('accounts'), 'accounts table hidden');
  assert.ok(!d.tables.includes('sessions'), 'sessions table hidden');
  const t = await g('/db/characters');
  assert.ok(t.ok && Array.isArray(t.rows), 'table dump works');
  const q = await g('/db?q=' + encodeURIComponent('SELECT name, circle FROM characters ORDER BY circle DESC LIMIT 5'));
  assert.ok(q.ok && q.rows.length <= 5, 'sandboxed SELECT works');
  const bad = await g('/db?q=' + encodeURIComponent('DROP TABLE characters'));
  assert.equal(bad.ok, false, 'write statements rejected');
  const nolimit = await g('/db?q=' + encodeURIComponent('SELECT * FROM characters'));
  assert.equal(nolimit.ok, false, 'queries must include LIMIT');
});

test('GM DB browser cannot expose password or bearer-token material', async () => {
  const account = db.prepare('SELECT pass_hash, salt FROM accounts WHERE username=?').get('gmsuite');
  assert.ok(account.pass_hash && account.salt && token, 'test secrets exist in the database');

  const attempts = [
    '/db/accounts',
    '/db/sessions',
    '/db?q=' + encodeURIComponent('SELECT * FROM accounts LIMIT 1'),
    '/db?q=' + encodeURIComponent('SELECT * FROM "sessions" LIMIT 1'),
    '/db?q=' + encodeURIComponent('SELECT * FROM main.[accounts] LIMIT 1'),
    '/db?q=' + encodeURIComponent('SELECT pass_hash FROM characters LIMIT 1'),
    '/db?q=' + encodeURIComponent('WITH safe_name AS (SELECT salt FROM accounts) SELECT * FROM safe_name LIMIT 1'),
    '/db?q=' + encodeURIComponent('SELECT * FROM sqlite_master LIMIT 1'),
  ];
  for (const path of attempts) {
    const response = await gmFetch(path);
    assert.ok([400, 403].includes(response.status), `${path} rejected`);
    const text = await response.text();
    assert.ok(!text.includes(account.pass_hash), 'password hash absent from response');
    assert.ok(!text.includes(account.salt), 'password salt absent from response');
    assert.ok(!text.includes(token), 'session bearer token absent from response');
  }
});
