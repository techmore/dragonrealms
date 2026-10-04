import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTail, readTail, discoveryState, discoveryLabel } from '../public/js/sims-reliability.js';

const encode = (text) => new TextEncoder().encode(text);
const reply = (body, status = 200, headers = {}) => new Response(body, { status, headers });
function queue(...responses) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, ...options });
    assert.ok(responses.length, 'unexpected fetch');
    return responses.shift();
  };
  return { fetcher, calls };
}

test('discovery distinguishes unknown, unavailable, stale, and confirmed zero', () => {
  const unknown = { status: 'unknown', lastSuccess: null, data: null };
  assert.match(discoveryLabel(unknown), /unknown.*never/);
  const unavailable = discoveryState(unknown, { ok: false }, 100);
  assert.match(discoveryLabel(unavailable), /unavailable/);
  assert.doesNotMatch(discoveryLabel(unavailable), /0 live/);
  const data = ['worker'];
  const success = discoveryState(unavailable, { ok: true, data }, 1000);
  const stale = discoveryState(success, { ok: false }, 2000);
  assert.equal(stale.data, data);
  assert.equal(stale.lastSuccess, 1000);
  assert.match(discoveryLabel(stale), /stale.*1970-01-01T00:00:01.000Z.*1 previously/);
  const recovered = discoveryState(stale, { ok: true, data: [] }, 3000);
  assert.match(discoveryLabel(recovered), /0 live now.*00:00:03/);
});

test('Unicode, ANSI, and split UTF-8 append at actual byte offsets', async () => {
  const bytes = encode('\x1b[31mÉ 🐉\x1b[0m\n');
  const cut = 10; // inside the four-byte dragon character
  const q = queue(reply(bytes.slice(0, cut), 200, { etag: '"v1"' }),
    reply(bytes.slice(cut), 206, { 'content-range': `bytes ${cut}-${bytes.length - 1}/${bytes.length}` }));
  let tail = await readTail('/log', emptyTail(), q);
  assert.doesNotMatch(tail.text, /�/);
  tail = await readTail('/log', tail, q);
  assert.equal(q.calls[1].headers.Range, `bytes=${cut}-`);
  assert.equal(q.calls[1].headers['If-Range'], '"v1"');
  assert.equal(tail.text, new TextDecoder().decode(bytes));
  assert.equal(tail.bytes.byteLength, bytes.length);
});

test('partial ranges advance to bytes received, not advertised total', async () => {
  const q = queue(reply('abc'), reply('de', 206, { 'content-range': 'bytes 3-4/10' }),
    reply('fg', 206, { 'content-range': 'bytes 5-6/10' }));
  let tail = await readTail('/log', undefined, q);
  tail = await readTail('/log', tail, q);
  tail = await readTail('/log', tail, q);
  assert.equal(q.calls[2].headers.Range, 'bytes=5-');
  assert.equal(tail.text, 'abcdefg');
});

test('ignored ranges and validator rotation replace prior content', async () => {
  const q = queue(reply('old content'), reply('new É'));
  const old = await readTail('/log', undefined, q);
  const tail = await readTail('/log', old, q);
  assert.equal(tail.text, 'new É');
});

test('file identity permits append ranges and recovers larger rotated files', async () => {
  const q = queue(reply('old', 200, { 'x-file-identity': 'a', 'last-modified': 'yesterday' }),
    reply('!', 206, { 'content-range': 'bytes 3-3/4', 'x-file-identity': 'a' }),
    reply('new', 206, { 'content-range': 'bytes 4-6/7', 'x-file-identity': 'b' }),
    reply('rotated', 200, { 'x-file-identity': 'b' }));
  let tail = await readTail('/log', undefined, q);
  tail = await readTail('/log', tail, q);
  assert.equal(q.calls[1].headers['If-Range'], undefined);
  assert.equal(tail.text, 'old!');
  tail = await readTail('/log', tail, q);
  assert.equal(tail.text, 'rotated');
  assert.equal(q.calls[3].headers.Range, undefined);
});

test('truncation and equal-sized replacement request a full body', async () => {
  for (const size of [2, 3]) {
    const q = queue(reply('old'), reply('xy'));
    const old = await readTail('/log', undefined, q);
    const tail = await readTail('/log', old, { ...q, size });
    assert.equal(q.calls[1].headers.Range, undefined);
    assert.equal(tail.text, 'xy');
  }
});

test('416 recovers with full fetch, including empty truncated logs', async () => {
  const q = queue(reply('old'), reply(null, 416, { 'content-range': 'bytes */0' }), reply(''));
  const old = await readTail('/log', undefined, q);
  const tail = await readTail('/log', old, q);
  assert.equal(q.calls[2].headers.Range, undefined);
  assert.equal(tail.text, '');
  assert.equal(tail.bytes.byteLength, 0);
});

test('invalid ranges and HTTP errors preserve prior state', async () => {
  const old = await readTail('/log', undefined, queue(reply('abc')));
  for (const response of [reply('x', 206), reply('x', 206, { 'content-range': 'bytes 2-2/4' }),
    reply('x', 206, { 'content-range': 'bytes 3-4/5' }), reply('x', 206, { 'content-range': 'bytes 3-3/3' }), reply('error', 503)]) {
    await assert.rejects(readTail('/log', old, queue(response)));
    assert.equal(old.text, 'abc');
    assert.equal(old.bytes.byteLength, 3);
  }
});
