import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'dr-player-owner-'));
process.env.DR_DB_PATH = join(tmp, 'owner.db');

const { migrate, closeDb } = await import('../server/db.js');
const { registerAccount, logoutSession } = await import('../server/auth.js');
const { loadPlayer } = await import('../server/player.js');
const { Game } = await import('../server/game.js');
const { apiRequest } = await import('../server/api.js');
const { doAlloc, doCharCreate, doEnter, enterWorld } = await import('../server/chargen.js');

let game;
let server;
let base;

before(async () => {
  migrate();
  game = new Game();
  game.init();
  game.stop();
  server = createServer((req, res) => apiRequest(req, res, game));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  game.stop();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

async function call(method, path, token, body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json() };
}

test('API sessions cannot replace, command as, or release another character owner', async () => {
  const registered = await call('POST', '/register', null, {
    user: 'OwnerTest', pass: 's3cretword',
  });
  assert.equal(registered.json.ok, true);
  const tokenA = registered.json.token;
  const loggedIn = await call('POST', '/login', null, {
    user: 'OwnerTest', pass: 's3cretword',
  });
  assert.equal(loggedIn.json.ok, true);
  const tokenB = loggedIn.json.token;

  const first = await call('POST', '/characters', tokenA, {
    name: 'Ownerone', race: 'human', guild: 'paladin',
  });
  const second = await call('POST', '/characters', tokenA, {
    name: 'Ownertwo', race: 'elf', guild: 'ranger',
  });
  assert.equal(first.json.ok, true);
  assert.equal(second.json.ok, true);
  const firstId = first.json.charId;
  const secondId = second.json.charId;

  assert.equal((await call('POST', '/enter', tokenA, { charId: firstId })).status, 200);
  const firstOwner = game.players.get(firstId);

  const duplicate = await call('POST', '/enter', tokenB, { charId: firstId });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.json.error, /already active/i);
  assert.equal(game.players.get(firstId), firstOwner, 'conflict keeps the original runtime owner');

  assert.equal((await call('POST', '/enter', tokenB, { charId: secondId })).status, 200);
  const secondOwner = game.players.get(secondId);
  const blockedSwitch = await call('POST', '/enter', tokenA, { charId: secondId });
  assert.equal(blockedSwitch.status, 409);
  assert.equal(game.players.get(firstId), firstOwner, 'failed switch keeps the caller in-world');
  assert.equal(game.players.get(secondId), secondOwner);

  firstOwner.silver = 432;
  assert.equal((await call('POST', '/logout', tokenB)).status, 200);
  assert.equal(game.players.has(secondId), false, 'logout releases its owned player');
  assert.equal((await call('GET', '/state', tokenB)).status, 401, 'logout revokes the API token');

  const switched = await call('POST', '/enter', tokenA, { charId: secondId });
  assert.equal(switched.status, 200);
  assert.equal(game.players.has(firstId), false, 'successful switch releases the old character');
  assert.equal(loadPlayer(firstId).silver, 432, 'successful switch persists the old character');

  const tokenC = (await call('POST', '/login', null, {
    user: 'OwnerTest', pass: 's3cretword',
  })).json.token;
  assert.equal((await call('POST', '/enter', tokenC, { charId: firstId })).status, 200);
  const replacement = game.players.get(firstId);
  replacement.silver = 765;
  firstOwner.silver = 1;
  assert.equal(game.persistPlayer(firstOwner), false, 'stale object cannot persist over the owner');
  assert.equal(game.removePlayer(firstOwner), false, 'stale object cannot evict the owner');
  assert.equal(game.players.get(firstId), replacement);

  // Simulate a delayed request from an API session whose runtime was released
  // and then reclaimed elsewhere. Matching charId is insufficient authority.
  const staleApiPlayer = game.players.get(secondId);
  assert.equal(game.removePlayer(staleApiPlayer), true);
  const newSecondOwner = loadPlayer(secondId);
  assert.equal(game.addPlayer(newSecondOwner), true);
  const staleState = await call('GET', '/state', tokenA);
  assert.equal(staleState.json.ok, false);
  assert.match(staleState.json.error, /No active character/);

  assert.equal((await call('POST', '/logout', tokenC)).status, 200);
  assert.equal(loadPlayer(firstId).silver, 765, 'logout persists the current owner');

  const tokenD = (await call('POST', '/login', null, {
    user: 'OwnerTest', pass: 's3cretword',
  })).json.token;
  assert.equal((await call('POST', '/enter', tokenD, { charId: firstId })).status, 200);
  game.players.get(firstId).silver = 876;
  logoutSession(tokenD); // model an expired/revoked token with no HTTP logout
  await call('GET', '/characters', tokenA);
  assert.equal(game.players.has(firstId), false, 'another API request sweeps an abandoned invalid session');
  assert.equal(loadPlayer(firstId).silver, 876, 'sweeping an invalid session persists its player');

  await call('POST', '/logout', tokenA);
  assert.equal(game.players.get(secondId), newSecondOwner, 'stale logout cannot evict the new owner');
  game.removePlayer(newSecondOwner);
});

test('chargen entry preserves its allocation draft and rejects a live duplicate', async () => {
  const account = await registerAccount('ChargenOwner', 's3cretword');
  assert.equal(account.ok, true);
  const socket = {
    OPEN: 1,
    readyState: 1,
    msgs: [],
    send(data) { this.msgs.push(typeof data === 'string' ? JSON.parse(data) : data); },
  };
  const session = {
    state: 'charcreate', accountId: account.accountId, game, socket,
    player: null, send(message) { socket.send(message); },
  };

  doCharCreate(session, 'Draftkeep', 'human', 'paladin');
  const draft = session.player;
  const before = draft.stats.str;
  doAlloc(session, 'str', 5);
  assert.equal(draft.stats.str, before + 5);
  doEnter(session);
  assert.equal(session.state, 'playing');
  assert.equal(session.player, draft, 'entry keeps the allocated Player object');
  assert.equal(game.players.get(draft.charId), draft);
  assert.equal(draft.stats.str, before + 5, 'allocated stats survive world entry');

  const otherSocket = { ...socket, msgs: [], send: socket.send };
  const other = {
    state: 'charselect', accountId: account.accountId, game, socket: otherSocket,
    player: null, send(message) { otherSocket.send(message); },
  };
  assert.equal(enterWorld(other, draft.charId), false);
  assert.equal(other.state, 'charselect');
  assert.equal(game.players.get(draft.charId), draft);
  assert.match(otherSocket.msgs.at(-1).msg, /already active/i);
  game.removePlayer(draft);
});
