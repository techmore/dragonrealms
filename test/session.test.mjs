// Session/WebSocket resilience tests.
//
// Regression guard for the world-killing crash found during a barbarian
// benchmark sweep: the WSS was created with maxPayload:4096 while putScript()
// accepts bodies up to 8000 chars, so a legitimate {t:'scripts_put'} frame
// from the sim agents overflowed the frame cap. `ws` reports an over-cap frame
// as an 'error' EVENT (WS_ERR_UNSUPPORTED_MESSAGE_LENGTH); with no 'error'
// listener registered, Node rethrew it as an unhandled 'error' and killed the
// ENTIRE world process — every online player dropped, and the sweep agents
// silently reconnected into fresh level-1 characters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { attachWebSocket } from '../server/session.js';

// Minimal Game stand-in: attachWebSocket only touches players/removePlayer
// before login, which is as far as these transport-level tests go.
const fakeGame = () => ({ players: new Map(), removePlayer() {}, addPlayer: () => true });

async function withWorld(fn) {
  const server = createServer(() => {});
  const wss = attachWebSocket(server, fakeGame(), { gmToken: 'test-token' });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    // Tear down hard: server.close() only stops NEW connections and waits for
    // live ones, so any still-open client socket would hang the test runner.
    for (const c of wss.clients) { try { c.terminate(); } catch {} }
    wss.close();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

const openSocket = (port) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://localhost:${port}/ws?bot=1`);
  ws.once('open', () => resolve(ws));
  ws.once('error', reject);
});

test('maxPayload accepts the largest script body putScript() allows', async () => {
  await withWorld(async (port) => {
    const ws = await openSocket(port);
    // SCRIPT_MAX_BODY is 8000 chars — a frame at that size is legitimate
    // traffic and must survive the transport layer intact.
    const frame = JSON.stringify({ t: 'scripts_put', name: 'big', body: 'x'.repeat(8000) });
    assert.ok(Buffer.byteLength(frame) > 4096, 'test frame must exceed the old 4096 cap');

    let socketError = null;
    ws.on('error', (e) => { socketError = e; });
    ws.send(frame);

    // A frame over maxPayload is closed with status 1009 by `ws`. Give the
    // round trip a moment, then assert the connection is still usable.
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(socketError, null, 'legitimate 8000-char script frame must not error');
    assert.equal(ws.readyState, WebSocket.OPEN, 'socket must stay open');
    ws.close();
  });
});

test('a malformed/oversized frame does not take the world down', async () => {
  await withWorld(async (port) => {
    // Client A is an innocent bystander; client B misbehaves.
    const a = await openSocket(port);
    const b = await openSocket(port);

    // Well past any sane cap: this SHOULD kill client B's socket, and must
    // NOT propagate as an unhandled 'error' that tears down the process.
    b.on('error', () => {});
    b.send('z'.repeat(200000));

    await new Promise((r) => setTimeout(r, 300));

    // The world is still serving: A stays connected and a fresh client can
    // still complete a handshake.
    assert.equal(a.readyState, WebSocket.OPEN, 'bystander socket must survive');
    const c = await openSocket(port);
    assert.equal(c.readyState, WebSocket.OPEN, 'world must still accept new connections');

    a.close(); b.close(); c.close();
  });
});

test('login prompt is sent on connect', async () => {
  await withWorld(async (port) => {
    // Attach the message listener BEFORE 'open' resolves: the server sends
    // the notice + login_prompt immediately on connection, so a handler wired
    // up after awaiting 'open' can miss them.
    const ws = new WebSocket(`ws://localhost:${port}/ws?bot=1`);
    const types = [];
    const gotPrompt = new Promise((resolve) => {
      ws.on('message', (raw) => {
        try { types.push(JSON.parse(raw).t); } catch {}
        if (types.includes('login_prompt')) resolve(true);
      });
      setTimeout(() => resolve(false), 1000);
    });
    assert.equal(await gotPrompt, true, `expected login_prompt, got ${types.join(',') || '(nothing)'}`);
    ws.close();
  });
});
