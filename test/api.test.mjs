// End-to-end test of the secure HTTP test API (server/api.js).
// Spins up a real HTTP server on an ephemeral port with a temp DB and
// drives the game entirely over HTTP: auth, chargen, movement, real async
// combat, death + corpse retrieval, and state analysis.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const tmp = mkdtempSync(join(tmpdir(), 'dr-api-test-'));
process.env.DR_DB_PATH = join(tmp, 'api.db');
const DEBUG_TOKEN = 'debug-test-secret-distinct-from-session';

const { migrate, closeDb } = await import('../server/db.js');
const { Game } = await import('../server/game.js');
const { apiRequest } = await import('../server/api.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;
let base;
let token;
let charId;

before(async () => {
  migrate();
  const game = new Game();
  game.init(); // combat ticker left RUNNING: combat is real and async, like a live client
  server = createServer((req, res) => apiRequest(req, res, game, {
    debugApiEnabled: true,
    debugToken: DEBUG_TOKEN,
  }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  global.__testGame = game;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  global.__testGame.stop();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

async function call(method, path, token, body, extraHeaders = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

const debugCall = (body, credential = DEBUG_TOKEN) => call(
  'POST', '/debug', token, body, credential ? { 'X-DR-Debug-Token': credential } : {}
);

const msg = (o) => (o.messages || []).map((m) => m.msg || '').join(' ');
const state = async () => (await call('GET', '/state', token)).json.state;
async function until(fn, label, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(120);
  }
  throw new Error(`timeout waiting for ${label}`);
}
const waitCombatEnd = () => until(async () => {
  const s = await state();
  return s.combat === null ? s : null;
}, 'combat to resolve');

test('health is public; register + login; tokens enforced', async () => {
  const h = await call('GET', '/health');
  assert.equal(h.status, 200);
  assert.equal(h.json.ok, true);

  const reg = await call('POST', '/register', null, { user: 'Apidriver', pass: 's3cretword' });
  assert.equal(reg.json.ok, true);
  assert.ok(reg.json.token);
  assert.deepEqual(reg.json.characters, []);
  token = reg.json.token;

  const bad = await call('POST', '/login', null, { user: 'Apidriver', pass: 'wrongpass' });
  assert.equal(bad.json.ok, false, 'wrong password rejected');

  assert.equal((await call('GET', '/characters')).status, 401, 'no token -> 401');
  assert.equal((await call('GET', '/characters', 'forged-token')).status, 401, 'forged token -> 401');
  assert.equal((await call('POST', '/debug', token, { silver: 999 })).status, 403, 'game session alone cannot mutate debug state');
  assert.equal((await debugCall({ silver: 999 }, DEBUG_TOKEN + '-suffix')).status, 403, 'debug secret must match exactly');

  const disabledServer = createServer((req, res) => apiRequest(req, res, global.__testGame, {
    debugApiEnabled: false,
    debugToken: DEBUG_TOKEN,
  }));
  await new Promise((resolve) => disabledServer.listen(0, '127.0.0.1', resolve));
  const disabledResponse = await fetch(`http://127.0.0.1:${disabledServer.address().port}/api/debug`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-DR-Debug-Token': DEBUG_TOKEN,
    },
    body: '{}',
  });
  assert.equal(disabledResponse.status, 404, 'debug API is absent unless explicitly enabled');
  await new Promise((resolve) => disabledServer.close(resolve));

  const unconfiguredServer = createServer((req, res) => apiRequest(req, res, global.__testGame, {
    debugApiEnabled: true,
    debugToken: '',
  }));
  await new Promise((resolve) => unconfiguredServer.listen(0, '127.0.0.1', resolve));
  const unconfiguredResponse = await fetch(`http://127.0.0.1:${unconfiguredServer.address().port}/api/debug`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-DR-Debug-Token': DEBUG_TOKEN,
    },
    body: '{}',
  });
  assert.equal(unconfiguredResponse.status, 503, 'enabled debug API fails closed without a configured secret');
  await new Promise((resolve) => unconfiguredServer.close(resolve));
});

test('create character, enter world, alloc stats', async () => {
  const c = await call('POST', '/characters', token, { name: 'Apiadin', race: 'human', guild: 'paladin' });
  assert.equal(c.json.ok, true);
  assert.equal(c.json.character.guild, 'paladin');
  charId = c.json.charId;

  const badGuild = await call('POST', '/characters', token, { name: 'Wrongo', race: 'human', guild: 'notaguild' });
  assert.equal(badGuild.json.ok, false, 'invalid guild rejected');
  const dup = await call('POST', '/characters', token, { name: 'Apiadin', race: 'human', guild: 'paladin' });
  assert.equal(dup.json.ok, false, 'duplicate name rejected');

  const e = await call('POST', '/enter', token, { charId });
  assert.equal(e.json.ok, true);
  assert.match(msg(e.json), /You are Apiadin/);
  assert.equal(e.json.state.player.room, 'square');
  assert.ok(e.json.state.room.npcs.includes('towncrier'), 'room snapshot lists NPCs');
  assert.ok(e.json.state.skills && typeof e.json.state.skills === 'object', 'skills tree exposed for analysis');
  assert.ok(e.json.state.skills.brawling, 'skills include brawling');

  const alloc = await call('POST', '/command', token, { command: 'alloc str 10' });
  assert.equal(alloc.json.state.player.unspentStat, 20, 'alloc reduces pool');

  assert.equal((await call('POST', '/enter', token, { charId: 999999 })).status, 404, 'cannot enter another account\'s character');
});

test('movement, real async combat, and combat-state analysis', async () => {
  let s = await state();
  assert.equal(s.player.room, 'square');

  s = (await call('POST', '/command', token, { command: 'nw' })).json.state;
  assert.equal(s.player.room, 'tg_nw');
  s = (await call('POST', '/command', token, { command: 'w' })).json.state;
  assert.equal(s.player.room, 'nw_road');
  s = (await call('POST', '/command', token, { command: 'w' })).json.state;
  assert.equal(s.player.room, 'temple_row');
  s = (await call('POST', '/command', token, { command: 'd' })).json.state;
  assert.equal(s.player.room, 'sewers_1');

  // Arm the tester: a bare-fist paladin would take ~40s to kill a rat.
  await debugCall({ addItems: [{ id: 'long_sword', qty: 1 }] });
  await call('POST', '/command', token, { command: 'wield long_sword' });

  const atk = await call('POST', '/command', token, { command: 'attack sewer rat' });
  assert.ok(atk.json.state.combat, 'attack starts combat');
  assert.ok(atk.json.state.combat.enemies.length >= 1, 'combat snapshot lists enemies');
  assert.ok(atk.json.state.combat.enemies.every((e) => typeof e.hp === 'number' && typeof e.timer === 'number'), 'enemy hp/timer reported');
  assert.ok(atk.json.state.player.hp > 0 && atk.json.state.player.hp <= atk.json.state.player.maxHp, 'player vitals sane');

  const end = await waitCombatEnd();
  assert.ok(end.player.room === 'sewers_1', 'fight resolved in place');
  assert.ok(end.player.hp > 0, 'survived the rat');
  assert.ok(end.skills.medium_edged, 'combat trained the weapon skill');

  const st = await call('POST', '/command', token, { command: 'stance defensive' });
  assert.equal(st.json.state.player.stance, 'defensive');
});

test('state analysis: shops, inventory, equipment round-trip', async () => {
  await waitCombatEnd();
  // sewers_1 -> temple_row -> nw_road -> tg_nw -> square -> tg_e -> bazaar
  await call('POST', '/command', token, { command: 'u' });
  await call('POST', '/command', token, { command: 'e' });
  await call('POST', '/command', token, { command: 'e' });
  await call('POST', '/command', token, { command: 'se' });
  await call('POST', '/command', token, { command: 'e' });
  let r = await call('POST', '/command', token, { command: 'e' });
  assert.equal(r.json.state.player.room, 'bazaar');

  r = await call('POST', '/command', token, { command: 'buy dagger' });
  assert.ok(r.json.state.inventory.some((i) => i.id === 'dagger'), 'buy visible in inventory');
  r = await call('POST', '/command', token, { command: 'wield dagger' });
  assert.equal(r.json.state.equipment.hand, 'dagger', 'wield visible in equipment');
  assert.ok(typeof r.json.state.skills.small_edged.exp === 'number', 'skill exp analyzed');
});

test('death drops a corpse at the death site; reclaim via the API', async () => {
  await waitCombatEnd();
  // Self-contained: ensure the dagger is equipped, then die on purpose.
  let r = await call('POST', '/command', token, { command: 'wield dagger' });
  if (r.json.state.equipment.hand !== 'dagger') {
    await debugCall({ addItems: [{ id: 'dagger', qty: 1 }] });
    await call('POST', '/command', token, { command: 'wield dagger' });
  }
  assert.equal((await state()).equipment.hand, 'dagger', 'dagger equipped before death');

  r = await debugCall({ room: 'sewers_1', clearCombat: true });
  assert.equal(r.json.state.player.room, 'sewers_1');

  // Deterministic death: the debug fixture runs the real death path
  // (corpse drop at the death site, temple respawn, exp penalty).
  r = await debugCall({ die: true });
  const dead = await until(async () => {
    const s = await state();
    return s.player.room === 'temple' ? s : null;
  }, 'death and temple respawn');
  assert.ok(dead.player.hp > 0, 'respawned with health');
  assert.equal(dead.player.room, 'temple', 'awakens at the temple');
  assert.deepEqual(dead.equipment, {}, 'stripped at the temple');
  assert.equal(dead.inventory.length, 0, 'inventory emptied by death');

  // Return to the death site: the corpse should hold the dagger.
  await debugCall({ room: 'sewers_1' });
  const site = await state();
  const corpse = site.floor.find((f) => f.corpse);
  assert.ok(corpse, 'corpse lies at the death site');
  assert.equal(corpse.name, 'Apiadin\'s corpse');
  assert.deepEqual(corpse.equipment, ['dagger'], 'corpse holds worn gear');

  r = await call('POST', '/command', token, { command: 'search' });

  assert.match(msg(r.json), /dagger/, 'search lists corpse contents');

  r = await call('POST', '/command', token, { command: 'get dagger from corpse' });
  assert.ok(r.json.state.inventory.some((i) => i.id === 'dagger'), 'gear reclaimed over the API');
  r = await call('POST', '/command', token, { command: 'get long sword from corpse' });
  assert.ok(r.json.state.inventory.some((i) => i.id === 'long_sword'), 'carried gear reclaimed');

  const gone = await state();
  assert.ok(!gone.floor.find((f) => f.corpse), 'corpse vanishes when emptied');

  const ret = await call('POST', '/command', token, { command: 'retreat' });
  assert.equal(ret.json.ok, true, 'retreat resolves cleanly outside combat');
});

test('HTTP commands obey the same roundtime gate as WebSocket commands', async () => {
  const first = await call('POST', '/command', token, { command: 'forage' });
  assert.equal(first.json.ok, true);
  const blocked = await call('POST', '/command', token, { command: 'forage' });
  assert.match(msg(blocked.json), /must wait \d+ second/, 'second roundtime action is refused');
});
