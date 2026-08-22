// WebSocket authorization and session-lifecycle regressions. Live streams
// expose typed commands, so they require the dedicated GM credential; a
// transport disconnect must still leave an account session resumable.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';

const tmp = mkdtempSync(join(tmpdir(), 'dr-session-security-'));
process.env.DR_DB_PATH = join(tmp, 'session.db');
process.env.DR_GM_TOKEN = 'test-gm-secret-with-enough-entropy';

const { migrate, closeDb } = await import('../server/db.js');
const { registerAccount, loginAccount, validateSession } = await import('../server/auth.js');
const { createCharacter, loadPlayer } = await import('../server/player.js');
const { Game } = await import('../server/game.js');
const { attachWebSocket } = await import('../server/session.js');
const { forwardCommand, watcherCount } = await import('../server/spectate.js');

let server;
let wss;
let game;
let target;
let accountToken;
let wsUrl;
const clients = new Set();

before(async () => {
  migrate();
  game = new Game();
  game.init();
  game.stop();

  const targetAccount = await registerAccount('streamtarget', 'target-pass-123');
  const targetId = createCharacter(targetAccount.accountId, {
    name: 'Streamtarget', race: 'human', guild: 'barbarian', city: 'crossing',
  });
  target = loadPlayer(targetId);
  target.ws = { readyState: 1, send() {} };
  game.addPlayer(target);

  await registerAccount('ordinarywatcher', 'watcher-pass-123');
  const account = await loginAccount('ordinarywatcher', 'watcher-pass-123');
  accountToken = account.token;

  server = createServer((req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });
  wss = attachWebSocket(server, game);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  wsUrl = `ws://127.0.0.1:${server.address().port}/ws`;
});

after(async () => {
  await Promise.all([...clients].map((client) => client.close()));
  if (game.players.get(target.charId) === target) game.removePlayer(target);
  await new Promise((resolve) => wss.close(resolve));
  await new Promise((resolve) => server.close(resolve));
  game.stop();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.DR_GM_TOKEN;
});

function openClient() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const queued = [];
    const waiters = [];

    socket.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      const index = waiters.findIndex((waiter) => waiter.predicate(msg));
      if (index < 0) {
        queued.push(msg);
        return;
      }
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    });
    socket.once('error', reject);
    socket.once('open', () => {
      const client = {
        socket,
        send(msg) { socket.send(JSON.stringify(msg)); },
        waitFor(predicate, timeoutMs = 1500) {
          const index = queued.findIndex(predicate);
          if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
          return new Promise((waitResolve, waitReject) => {
            const waiter = { predicate, resolve: waitResolve, reject: waitReject, timer: null };
            waiter.timer = setTimeout(() => {
              const pos = waiters.indexOf(waiter);
              if (pos >= 0) waiters.splice(pos, 1);
              waitReject(new Error('Timed out waiting for WebSocket message.'));
            }, timeoutMs);
            waiters.push(waiter);
          });
        },
        close() {
          clients.delete(client);
          if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
          return new Promise((closeResolve) => {
            socket.once('close', closeResolve);
            socket.close();
          });
        },
      };
      clients.add(client);
      resolve(client);
    });
  });
}

const isErrorContaining = (text) => (msg) => msg.t === 'error' && msg.msg.includes(text);
const isNoticeContaining = (text) => (msg) => msg.t === 'notice' && msg.msg.includes(text);

test('player and world streams require the dedicated GM credential', async () => {
  const anonymous = await openClient();
  anonymous.send({ t: 'spectate', name: target.name });
  await anonymous.waitFor(isErrorContaining('GM authorization'));
  anonymous.send({ t: 'worldwatch' });
  await anonymous.waitFor(isErrorContaining('GM authorization'));
  assert.equal(watcherCount(target), 0);
  await anonymous.close();

  const ordinary = await openClient();
  ordinary.send({ t: 'token', token: accountToken });
  await ordinary.waitFor((msg) => msg.t === 'authed');
  ordinary.send({ t: 'spectate', name: target.name, gmToken: accountToken });
  await ordinary.waitFor(isErrorContaining('GM authorization'));
  ordinary.send({ t: 'worldwatch', gmToken: accountToken });
  await ordinary.waitFor(isErrorContaining('GM authorization'));
  assert.equal(watcherCount(target), 0, 'a valid game session is not a GM credential');
  await ordinary.close();

  const gm = await openClient();
  gm.send({ t: 'spectate', name: target.name, gmToken: process.env.DR_GM_TOKEN });
  await gm.waitFor(isNoticeContaining(`watching ${target.name}`));
  assert.equal(watcherCount(target), 1);

  forwardCommand(target, 'say private words');
  const playerCommand = await gm.waitFor((msg) => msg.t === 'command');
  assert.equal(playerCommand.line, 'say private words');
  assert.equal(playerCommand._player, undefined);

  gm.send({ t: 'worldwatch' });
  await gm.waitFor(isNoticeContaining('entire world feed'));
  assert.equal(watcherCount(target), 0, 'switching feeds removes the old subscription');
  forwardCommand(target, 'move north');
  const worldCommand = await gm.waitFor((msg) => msg.t === 'command' && msg._player);
  assert.equal(worldCommand.line, 'move north');
  assert.equal(worldCommand._player, target.name);
  await gm.close();
});

test('gm_play requires the dedicated GM credential', async () => {
  const anonymous = await openClient();
  anonymous.send({ t: 'gm_play', guild: 'barbarian' });
  await anonymous.waitFor(isErrorContaining('GM authorization'));
  assert.ok(![...game.players.values()].some((p) => p.name.startsWith('Gm')), 'no character was entered without GM auth');
  await anonymous.close();
});

test('gm_play jumps straight into an auto-provisioned boosted character', async () => {
  const gm = await openClient();
  gm.send({ t: 'gm_play', gmToken: process.env.DR_GM_TOKEN, guild: 'barbarian', race: 'human', boost: 20 });
  await gm.waitFor((msg) => msg.t === 'enter', 3000);
  const notice = await gm.waitFor(isNoticeContaining('GM quick-play'));
  assert.match(notice.msg, /boost x20/);
  const prompt = await gm.waitFor((msg) => msg.t === 'prompt' && /BOOST x20/.test(msg.msg), 3000);
  assert.match(prompt.msg, /BOOST x20/);

  // The character is live in the world and flagged for status surfaces.
  const p = [...game.players.values()].find((x) => x.name === 'GmBarbarianHuman');
  assert.ok(p, 'GmBarbarianHuman was created and entered');
  assert.equal(p.boostMult, 20);
  assert.equal(p.isBot, true);

  // Commands route through the same session immediately (no charselect step).
  gm.send({ t: 'input', line: 'look' });
  await gm.waitFor((msg) => msg.t === 'room', 3000);

  // Re-running reuses the same character instead of duplicating it.
  await gm.close();
  if (game.players.get(p.charId) === p) game.removePlayer(p);

  const again = await openClient();
  again.send({ t: 'gm_play', gmToken: process.env.DR_GM_TOKEN, guild: 'barbarian', race: 'human', boost: 10 });
  await again.waitFor((msg) => msg.t === 'enter', 3000);
  const p2 = [...game.players.values()].find((x) => x.name === 'GmBarbarianHuman');
  assert.equal(p2.charId, p.charId, 'the same character is reused across gm_play runs');
  assert.equal(p2.boostMult, 10, 'the new boost applies');
  await again.close();
  if (game.players.get(p2.charId) === p2) game.removePlayer(p2);
});

test('disconnect preserves a valid session while explicit logout revokes it', async () => {
  const first = await openClient();
  first.send({ t: 'token', token: accountToken });
  await first.waitFor((msg) => msg.t === 'authed');
  await first.close();
  assert.ok(validateSession(accountToken), 'network close must not destroy the account session');

  const resumed = await openClient();
  resumed.send({ t: 'token', token: accountToken });
  const authed = await resumed.waitFor((msg) => msg.t === 'authed');
  assert.equal(authed.token, accountToken, 'the disconnected session can reconnect');

  resumed.send({ t: 'logout' });
  await resumed.waitFor(isNoticeContaining('logged out'));
  assert.equal(validateSession(accountToken), null, 'explicit logout revokes the session');
  await resumed.close();
});
