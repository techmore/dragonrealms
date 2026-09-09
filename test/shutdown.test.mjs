import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { auth, createCharacter, loadPlayer, setupGame, teardownGame, fakeWs } from './helpers.mjs';
import { shutdownWorld } from '../server/shutdown.js';

let game;
before(() => { game = setupGame(); });
after(teardownGame);

test('shutdown saves unsaved players before closing persistence and listeners', async () => {
  const a = await auth.registerAccount('shutdownsave', 'test-password');
  const p = loadPlayer(createCharacter(a.accountId, { name: 'Shutdownsave', race: 'human', guild: 'barbarian' }));
  p.ws = fakeWs();
  game.addPlayer(p);
  p.silver = 8765;
  p.expPools.brawling = 12;
  const server = createServer();
  const wss = new WebSocketServer({ server });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let closed = false;
  await shutdownWorld({ game, server, wss, closeDb() {
    const disk = loadPlayer(p.charId);
    assert.equal(disk.silver, 8765);
    assert.equal(disk.expPools.brawling, 12);
    closed = true;
  } });
  assert.equal(closed, true);
  assert.equal(server.listening, false);
  assert.equal(game.players.size, 0);
});

test('shutdown attempts every player and reports failed saves', async () => {
  const saved = [];
  const server = createServer();
  const wss = new WebSocketServer({ server });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let closed = false;
  await assert.rejects(shutdownWorld({ server, wss, closeDb() { closed = true; }, game: {
    stop() {}, players: new Map([[1, 1], [2, 2]]),
    removePlayer(p) { saved.push(p); if (p === 1) throw new Error('disk failure'); },
  } }), /could not save all state/);
  assert.deepEqual(saved, [1, 2]);
  assert.equal(closed, true);
});

test('pending authentication finishes before SQLite is closed', async () => {
  const server = createServer();
  const wss = new WebSocketServer({ server });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const pending = auth.registerAccount('shutdowndrain', 'test-password');
  let finished = false;
  pending.then(() => { finished = true; });
  await shutdownWorld({ server, wss, game: { stop() {}, players: new Map() }, closeDb() {
    assert.equal(finished, true, 'native auth work and its DB write must settle first');
  } });
  assert.equal((await pending).ok, true);
});
