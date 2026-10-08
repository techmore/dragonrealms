import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, connectionLabel } from '../public/js/connection.js';

function harness(options = {}) {
  let time = 0, sequence = 0, disconnects = 0;
  const timers = new Map(), sockets = [], states = [], messages = [];
  class Socket {
    readyState = 0; sent = []; closes = 0;
    open() { this.readyState = 1; this.onopen?.(); }
    close() { this.closes++; this.readyState = 3; this.onclose?.(); }
    message(data) { this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }); }
    send(data) { this.sent.push(JSON.parse(data)); }
  }
  const connection = createConnection({ url: 'ws://example/ws',
    socketFactory: () => { const socket = new Socket(); sockets.push(socket); return socket; },
    now: () => time, schedule: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: time + delay }); return id; },
    cancel: id => timers.delete(id), onState: state => states.push(state),
    onMessage: message => messages.push(message), onDisconnect: () => disconnects++, ...options,
  });
  const jump = milliseconds => {
    time += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); }
  };
  return { connection, sockets, states, messages, timers, jump, disconnects: () => disconnects };
}

test('connection distinguishes connecting, connected and deadline-based retry states', () => {
  const h = harness();
  assert.equal(h.connection.state().phase, 'idle');
  assert.equal(h.connection.connect(), true);
  assert.equal(connectionLabel(h.connection.state()), 'connecting…');
  h.sockets[0].open();
  assert.equal(h.connection.state().phase, 'connected');
  h.sockets[0].close();
  assert.equal(h.connection.state().phase, 'retrying');
  assert.equal(h.connection.state().retrySeconds, 1);
  assert.equal(h.timers.size, 1);
  h.jump(1000);
  assert.equal(connectionLabel(h.connection.state()), 'reconnecting…');
  assert.equal(h.sockets.length, 2);
  h.sockets[1].close();
  assert.equal(h.connection.state().retrySeconds, 2);
  h.jump(1200);
  assert.equal(h.connection.state().retrySeconds, 1);
  assert.match(connectionLabel(h.connection.state()), /retrying in 1s/);
  h.jump(800);
  assert.equal(h.sockets.length, 3);
});
test('delayed callbacks use the actual deadline and do not replay missed countdown ticks', () => {
  const h = harness(); h.connection.connect(); h.sockets[0].close();
  h.jump(5000);
  assert.equal(h.sockets.length, 2);
  assert.equal(h.connection.state().phase, 'connecting');
  assert.equal(h.timers.size, 0);
});
test('manual retry cancels the pending retry and repeated activation does not duplicate sockets', () => {
  const h = harness(); h.connection.connect(); h.sockets[0].close();
  assert.equal(h.connection.retryNow(), true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.connection.retryNow(), false);
  assert.equal(h.connection.connect(), false);
  h.jump(30000);
  assert.equal(h.sockets.length, 2);
  h.sockets[1].open();
  assert.equal(h.connection.retryNow(), false);
});
test('stale open, error, close and message callbacks cannot affect the new socket', () => {
  const h = harness({ getToken: () => 'session-token' });
  h.connection.connect(); const old = h.sockets[0]; old.close(); h.connection.retryNow();
  const current = h.sockets[1]; current.open();
  const disconnects = h.disconnects();
  old.onopen(); old.onerror(); old.onclose(); old.message({ t: 'enter' });
  assert.equal(h.connection.state().phase, 'connected');
  assert.equal(h.disconnects(), disconnects);
  assert.equal(old.closes, 1);
  assert.equal(h.messages.length, 0);
  assert.deepEqual(current.sent, [{ t: 'token', token: 'session-token' }]);
  assert.equal(h.timers.size, 0);
});
test('disconnected commands are rejected and reconnection sends only session restoration', () => {
  const h = harness({ getToken: () => 'session-token' });
  assert.equal(h.connection.send({ t: 'input', line: 'attack' }), false);
  h.connection.connect(); h.sockets[0].open();
  assert.equal(h.connection.send({ t: 'input', line: 'look' }), true);
  h.sockets[0].close();
  assert.equal(h.connection.send({ t: 'input', line: 'claim' }), false);
  h.connection.retryNow(); h.sockets[1].open();
  assert.deepEqual(h.sockets[1].sent, [{ t: 'token', token: 'session-token' }]);
});
test('authenticated restoration resets backoff; repeated closes schedule only one retry', () => {
  const h = harness(); h.connection.connect(); h.sockets[0].close();
  h.connection.retryNow(); h.sockets[1].open(); h.sockets[1].message({ t: 'authed' }); h.sockets[1].close();
  h.sockets[1].onclose();
  assert.equal(h.connection.state().retrySeconds, 1);
  assert.equal(h.timers.size, 1);
});
test('backoff is capped and invalid messages never reach the router', () => {
  const h = harness();
  for (let index = 0; index < 9; index++) { h.connection.connect(); h.sockets.at(-1).close(); h.jump(30000); }
  h.sockets.at(-1).open();
  h.sockets.at(-1).message('invalid JSON'); h.sockets.at(-1).message({ t: 'prompt', msg: 42 });
  assert.equal(h.messages.length, 0);
  h.sockets.at(-1).close();
  assert.equal(h.connection.state().retrySeconds, 30);
});
test('Puffer observation mode cannot create sockets, send commands or schedule retries', () => {
  const h = harness({ readOnly: true });
  assert.equal(h.connection.state().phase, 'read-only');
  assert.equal(h.connection.connect(), false);
  assert.equal(h.connection.retryNow(), false);
  assert.equal(h.connection.send({ t: 'input', line: 'look' }), false);
  h.jump(60000);
  assert.equal(h.sockets.length, 0);
  assert.equal(h.timers.size, 0);
});
test('socket construction errors enter a bounded retry state', () => {
  const h = harness({ socketFactory: () => { throw new Error('Offline'); } });
  assert.equal(h.connection.connect(), false);
  assert.equal(h.connection.state().phase, 'retrying');
  assert.equal(h.timers.size, 1);
});
