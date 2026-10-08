import test from 'node:test';
import assert from 'node:assert/strict';
import { routeSteps, exitAllows, promptState, requirementSnapshot, safeWireMessage, sourceWsUrl, JourneyPeer } from '../scripts/lib/release-wire-journey.mjs';
import { sweepLaunchPlan } from '../scripts/lib/sweep-launch-plan.mjs';
import { WebSocketServer } from 'ws';

 test('observed walking plans parse directions and retain exact destination identity', () => {
  const frames = [{ t: 'msg', msg: '\x1b[1mRoute\x1b[0m\n  1. nw → Road [road]\n  2. u → Hall [hall_warmage]\n' }];
  assert.deepEqual(routeSteps(frames), [{ direction: 'nw', roomId: 'road' }, { direction: 'u', roomId: 'hall_warmage' }]);
  assert.equal(exitAllows({ exits: ['northwest', 'up'] }, 'nw'), true);
  assert.equal(exitAllows({ exits: ['northwest', 'up'] }, 's'), false);
  assert.deepEqual(routeSteps([{ msg: 'No route; 15 silvers' }]), []);
});
test('wire state preserves gameplay numbers and clones requirement rows', () => {
  const prompt = { t: 'prompt', msg: '\x1b[31mHP: 70/80 RT: 3\x1b[0m Circle 1 125 silvers', journey: { hp: 70, maxHp: 80, circle: 1, guildId: 'trader' }, requirements: { circle: 2, rows: [{ skill: 'trading', have: 0, need: 8 }] } };
  assert.equal(promptState(prompt).silver, 125); assert.equal(promptState(prompt).rt, 3); assert.equal(promptState(prompt).hp, 70);
  const snapshot = requirementSnapshot(prompt); snapshot.rows[0].have = 9; assert.equal(prompt.requirements.rows[0].have, 0);
  assert.throws(() => requirementSnapshot({}), /Requirement rows missing/);
});
test('source endpoints reject credentials, bot flags and unsupported schemes; stored auth is redacted', () => {
  assert.equal(sourceWsUrl('http://127.0.0.1:1234'), 'ws://127.0.0.1:1234/ws');
  assert.equal(sourceWsUrl('wss://example.invalid/ws'), 'wss://example.invalid/ws');
  for (const value of ['ws://localhost:3000/ws?bot=1','http://user:password@localhost/','file:///tmp/server','ws://localhost/private','#bad']) assert.throws(() => sourceWsUrl(value));
  assert.deepEqual(safeWireMessage({ t: 'authed', token: 'DO-NOT-STORE' }), { t: 'authed', token: '[REDACTED]' });
  assert.deepEqual(safeWireMessage({ t: 'prompt', journey: { hp: 25 }, token: 'DROP', password: 'DROP' }), { t: 'prompt', journey: { hp: 25 } });
});
test('actual websocket transport uses plain /ws, correlates command responses and sanitizes durable records', async (t) => {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise(resolve => server.once('listening', resolve));
  const urls = [], requests = [], records = [];
  server.on('connection', (socket, request) => {
    urls.push(request.url); socket.send(JSON.stringify({ t: 'login_prompt' }));
    socket.on('message', bytes => {
      const message = JSON.parse(bytes); requests.push(message);
      if (message.t === 'register') { socket.send(JSON.stringify({ t: 'authed', token: 'SECRET' })); socket.send(JSON.stringify({ t: 'charcreate' })); }
      else if (message.t === 'input') { socket.send(JSON.stringify({ t: 'msg', msg: 'accepted ' + message.line })); socket.send(JSON.stringify({ t: 'prompt', msg: '20 silvers', journey: { circle: 1, hp: 60 } })); }
    });
  });
  const peer = new JourneyPeer(`ws://127.0.0.1:${server.address().port}/ws`, { onRecord: record => records.push(record) });
  t.after(async () => { peer.close(); for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); });
  await peer.wait(message => message.t === 'login_prompt');
  await peer.send({ t: 'register', u: 'ordinary', p: 'private-password' }, message => message.t === 'charcreate');
  const responses = await peer.command('deposit 10');
  assert.equal(urls[0], '/ws'); assert.deepEqual(requests.map(request => request.t), ['register','input']);
  assert.match(responses[0].msg, /deposit 10/); assert.equal(promptState(peer.prompt).silver, 20);
  assert.ok(!JSON.stringify(records).includes('SECRET')); assert.ok(!JSON.stringify(records).includes('private-password'));
});
test('missing expected wire response fails within the bound rather than fabricating completion', async (t) => {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await new Promise(resolve => server.once('listening', resolve));
  const peer = new JourneyPeer(`ws://127.0.0.1:${server.address().port}/ws`, { deadline: Date.now() + 100 });
  t.after(async () => { peer.close(); for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); });
  await assert.rejects(peer.wait(message => message.t === 'never', 0, 5000), /timed out/);
});


test('sweep metadata matches scheduled batch width without changing ad-hoc or spawn behavior', () => {
  assert.deepEqual(sweepLaunchPlan({ mode: 'benchmark', requestedConcurrency: 3, agents: 2 }), { requestedConcurrency: 3, scheduledLaunchWidth: 2 });
  assert.deepEqual(sweepLaunchPlan({ mode: 'benchmark', requestedConcurrency: 1, agents: 6 }), { requestedConcurrency: 1, scheduledLaunchWidth: 1 });
  assert.deepEqual(sweepLaunchPlan({ mode: 'sweep', requestedConcurrency: 3, agents: 21 }), { requestedConcurrency: 3, scheduledLaunchWidth: 21 });
  assert.deepEqual(sweepLaunchPlan({ mode: 'spawn', requestedConcurrency: 3, agents: 1 }), { requestedConcurrency: 3, scheduledLaunchWidth: 1 });
  assert.deepEqual(sweepLaunchPlan({ mode: 'sweep', requestedConcurrency: 3, agents: 0 }), { requestedConcurrency: 3, scheduledLaunchWidth: 0 });
  assert.deepEqual(sweepLaunchPlan({ mode: 'benchmark', requestedConcurrency: 11, agents: 12 }), { requestedConcurrency: 11, scheduledLaunchWidth: 10 });
  assert.deepEqual(sweepLaunchPlan({ mode: 'benchmark', requestedConcurrency: 99, agents: 20 }), { requestedConcurrency: 99, scheduledLaunchWidth: 10 });
  assert.throws(() => sweepLaunchPlan({ mode: 'benchmark', requestedConcurrency: 2.5, agents: 3 }), /positive integer/);
});

test('paid recovery requires real injury, positive healing and an accepted money debit', async () => {
  const { assertPaidRecovery } = await import('../scripts/lib/release-wire-journey.mjs');
  const before = { hp: 140, maxHp: 145, silver: 40 }, after = { hp: 145, maxHp: 145, silver: 35 }, frames = [{ t: 'msg', msg: 'You are restored for 5 silvers.' }];
  assert.doesNotThrow(() => assertPaidRecovery(before, after, frames));
  assert.throws(() => assertPaidRecovery({ ...before, hp: 145 }, after, frames), /injury/);
  assert.throws(() => assertPaidRecovery(before, { ...after, hp: 140 }, frames), /healing/);
  assert.throws(() => assertPaidRecovery(before, { ...after, silver: 40 }, frames), /money/);
  assert.throws(() => assertPaidRecovery(before, { ...after, silver: 34 }, frames), /match the native receipt/);
  assert.throws(() => assertPaidRecovery(before, after, [{ msg: 'There is no healer here.' }]));
});

test('malformed wire and capture failures reject waiters and close the owned peer', async (t) => {
  for (const type of ['malformed', 'capture-error']) await t.test(type, async (t) => {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await new Promise(resolve => server.once('listening', resolve));
    server.on('connection', socket => socket.send(type === 'malformed' ? '{broken' : JSON.stringify({ t: 'notice', msg: 'safe' })));
    const peer = new JourneyPeer(`ws://127.0.0.1:${server.address().port}/ws`, { onRecord: () => { throw new Error('Capture sink failed'); } });
    t.after(async () => { peer.close(); for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); });
    await assert.rejects(peer.wait(message => message.t === 'prompt'), type === 'malformed' ? /JSON|property|Unexpected/i : /Capture sink failed/);
    assert.ok(peer.failure);
  });
});

test('expired deadlines prevent opening peers or sending new accounts; auth commands are never captured', async (t) => {
  assert.throws(() => new JourneyPeer('ws://127.0.0.1:1/ws', { deadline: Date.now() - 1 }), /before connection/);
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await new Promise(resolve => server.once('listening', resolve));
  const requests = [], records = [];
  server.on('connection', socket => { socket.send(JSON.stringify({ t: 'login_prompt' })); socket.on('message', bytes => requests.push(JSON.parse(bytes))); });
  const peer = new JourneyPeer(`ws://127.0.0.1:${server.address().port}/ws`, { onRecord: record => records.push(record) });
  t.after(async () => { peer.close(); for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); });
  await peer.wait(message => message.t === 'login_prompt');
  await assert.rejects(peer.command('login name secret-password'), /unlogged/);
  peer.deadline = Date.now() - 1;
  await assert.rejects(peer.send({ t: 'register', u: 'not-created', p: 'not-sent' }), /before send/);
  assert.deepEqual(requests, []); assert.ok(!JSON.stringify(records).includes('secret-password'));
});

test('public launch metadata retains only valid numeric scheduled/requested widths and never credentials', async () => {
  const { serializePublicExperiment } = await import('../scripts/lib/public-experiment.mjs');
  const plan = sweepLaunchPlan({ mode: 'sweep', requestedConcurrency: 3, agents: 21 });
  const publicRecord = JSON.parse(serializePublicExperiment({ ...plan, concurrency: plan.scheduledLaunchWidth, gmToken: 'DROP', watchToken: 'DROP', plan: [] }));
  assert.equal(publicRecord.concurrency, 21); assert.equal(publicRecord.scheduledLaunchWidth, 21); assert.equal(publicRecord.requestedConcurrency, 3);
  assert.ok(!JSON.stringify(publicRecord).includes('DROP'));
  const malformed = JSON.parse(serializePublicExperiment({ scheduledLaunchWidth: 'SECRET', requestedConcurrency: 2.5 }));
  assert.equal(malformed.scheduledLaunchWidth, undefined); assert.equal(malformed.requestedConcurrency, undefined);
});
