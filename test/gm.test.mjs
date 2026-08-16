// GM console read-only API suite: summary/world/room/player inspection,
// DB browser, and the auth guard. Uses the real HTTP server on :3000
// (DR_ENABLE_API=1); authorization via a freshly registered account session.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:3000/api/gm';
const reg = await fetch('http://localhost:3000/api/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user: 'gmsuite' + Date.now(), pass: 'probepass1' }),
}).then((r) => r.json());
assert.ok(reg.token, 'registered a GM test session');
const TOKEN = reg.token;
const g = async (p) => (await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + TOKEN } })).json();

test('GM endpoints reject unauthenticated requests', async () => {
  const r = await fetch(BASE + '/summary');
  assert.equal(r.status, 401, 'no token -> 401');
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
  const p = await g('/player/Gornew');
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
  const t = await g('/db/characters');
  assert.ok(t.ok && Array.isArray(t.rows), 'table dump works');
  const q = await g('/db?q=' + encodeURIComponent('SELECT name, circle FROM characters ORDER BY circle DESC LIMIT 5'));
  assert.ok(q.ok && q.rows.length <= 5, 'sandboxed SELECT works');
  const bad = await g('/db?q=' + encodeURIComponent('DROP TABLE characters'));
  assert.equal(bad.ok, false, 'write statements rejected');
  const nolimit = await g('/db?q=' + encodeURIComponent('SELECT * FROM characters'));
  assert.equal(nolimit.ok, false, 'queries must include LIMIT');
});
