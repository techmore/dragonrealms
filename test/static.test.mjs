// Static handler unit tests: MIME types, 404s, path-traversal guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticHandler } from '../server/static.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const handle = createStaticHandler(PUBLIC_DIR);

function fakeRes() {
  const calls = [];
  return {
    calls,
    writeHead: (status, headers) => calls.push(['head', status, headers]),
    end: (body) => calls.push(['end', body]),
  };
}

const req = (url) => ({ url, headers: { host: 'localhost:3000' } });

// Reads are async now — yield until the response lands.
const settle = async (res) => {
  for (let i = 0; i < 50 && res.calls.length < 2; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
};

test('serves index.html at /', async () => {
  const res = fakeRes();
  handle(req('/'), res);
  await settle(res);
  assert.equal(res.calls[0][0], 'head');
  assert.equal(res.calls[0][1], 200);
  assert.match(String(res.calls[0][2]['Content-Type']), /^text\/html/);
  assert.match(String(res.calls[1][1]), /<!DOCTYPE html>/);
});

test('serves js files with correct mime', async () => {
  const res = fakeRes();
  handle(req('/js/main.js'), res);
  await settle(res);
  assert.equal(res.calls[0][1], 200);
  assert.match(String(res.calls[0][2]['Content-Type']), /^text\/javascript/);
});

test('pretty URL: extensionless path falls back to <path>.html', async () => {
  const res = fakeRes();
  handle(req('/admin'), res);
  await settle(res);
  assert.equal(res.calls[0][1], 200);
  assert.match(String(res.calls[0][2]['Content-Type']), /^text\/html/);
});

test('404 for missing files', async () => {
  const res = fakeRes();
  handle(req('/nope.js'), res);
  await settle(res);
  assert.equal(res.calls[0][1], 404);
});

test('extensionless miss still 404s (no phantom .html)', async () => {
  const res = fakeRes();
  handle(req('/nope'), res);
  await settle(res);
  assert.equal(res.calls[0][1], 404);
});

test('blocks path traversal', async () => {
  const res = fakeRes();
  handle(req('/..%2f..%2fserver%2fauth.js'), res);
  await settle(res);
  assert.equal(res.calls[0][1], 404);
});

test('404 does not leak beyond public dir via encoded slashes', async () => {
  const res = fakeRes();
  handle(req('/%2e%2e/%2e%2e/etc/passwd'), res);
  await settle(res);
  assert.equal(res.calls[0][1], 404);
});
