// Static handler unit tests: MIME types, 404s, path-traversal guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticHandler, SECURITY_HEADERS } from '../server/static.js';

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
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(res.calls[0][2][name], value, name);
  }
  assert.match(res.calls[0][2]['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(res.calls[0][2]['Content-Security-Policy'], /object-src 'none'/);
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
  assert.equal(res.calls[0][2]['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.calls[0][2]['X-Frame-Options'], 'DENY');
  assert.match(res.calls[0][2]['Content-Security-Policy'], /default-src 'self'/);
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

test('directory request 404s without crashing the handler', async () => {
  const res = fakeRes();
  handle(req('/js/'), res);
  await settle(res);
  assert.equal(res.calls[0][1], 404);
});

test('failed read never writes headers twice', async () => {
  const res = fakeRes();
  handle(req('/css/'), res);
  await settle(res);
  const heads = res.calls.filter(([k]) => k === 'head');
  assert.equal(heads.length, 1, 'exactly one writeHead call');
  assert.equal(heads[0][1], 404);
});

// S4 regression: a sibling directory sharing the root's name as a string
// prefix ("/tmp/x/public" vs "/tmp/x/publicity") must NOT be served. The old
// startsWith(publicDir) check passed exactly this shape (probe-verified in
// the audit); containment is now resolve + separator-bounded.
test('sibling-prefix directory escape is contained', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const base = mkdtempSync(join(tmpdir(), 'dr-static-s4-'));
  try {
    mkdirSync(join(base, 'public'));
    mkdirSync(join(base, 'publicity'));
    writeFileSync(join(base, 'publicity', 'secret.txt'), 'sibling contents');
    const h = createStaticHandler(join(base, 'public'));
    const res = fakeRes();
    h(req('/..%2fpublicity%2fsecret.txt'), res);
    await settle(res);
    assert.equal(res.calls[0][1], 404, 'sibling-prefix file must not be served');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('private artifacts and symlink escapes return no bytes or metadata', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const base = mkdtempSync(join(tmpdir(), 'dr-static-artifacts-'));
  try {
    const root = join(base, 'public');
    mkdirSync(join(root, 'live'), { recursive: true });
    mkdirSync(join(root, '.private'));
    for (const name of ['world.db','world.db-wal','world.db-shm','world.db-journal','world.sqlite','world.sqlite3','world.sql','world.bak','world.backup','.env']) {
      writeFileSync(join(root, 'live', name), 'private contents');
    }
    writeFileSync(join(root, '.private', 'notes.txt'), 'private contents');
    writeFileSync(join(base, 'secret.txt'), 'private contents');
    symlinkSync(join(base, 'secret.txt'), join(root, 'escape.txt'));
    symlinkSync(join(root, 'live', 'world.db'), join(root, 'alias.txt'));
    const handler = createStaticHandler(root);
    for (const path of ['/live/world.db','/live/world.db-wal','/live/world.db-shm','/live/world.db-journal','/live/world.sqlite','/live/world.sqlite3','/live/world.sql','/live/world.bak','/live/world.backup','/live/.env','/live/%2eenv','/.private/notes.txt','/escape.txt','/alias.txt','/live/']) {
      for (const method of ['GET','HEAD']) {
        const res = fakeRes();
        handler({ ...req(path), method, headers: { host:'localhost', range:'bytes=0-' } }, res);
        await settle(res);
        assert.equal(res.calls[0][1], 404, method + ' ' + path);
        assert.equal(res.calls[0][2]['Last-Modified'], undefined);
        assert.equal(res.calls[0][2]['Content-Length'], undefined);
        assert.ok(!String(res.calls[1][1]).includes('private contents'));
      }
    }
  } finally { rmSync(base, { recursive:true, force:true }); }
});

test('published logs and JSON reports remain readable with HEAD and range support', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { createServer } = await import('node:http');
  const root = mkdtempSync(join(tmpdir(), 'dr-static-public-'));
  const server = createServer(createStaticHandler(root));
  try {
    writeFileSync(join(root, 'run.log'), 'first\nsecond\n');
    writeFileSync(join(root, 'report.json'), '{"complete":true}');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const head = await fetch(url+'/run.log', { method:'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '13');
    assert.ok(head.headers.get('last-modified'));
    const tail = await fetch(url+'/run.log', { headers:{ Range:'bytes=6-' } });
    assert.equal(tail.status, 206);
    assert.equal(await tail.text(), 'second\n');
    const report = await fetch(url+'/report.json');
    assert.equal(report.status, 200);
    assert.deepEqual(await report.json(), { complete:true });
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive:true, force:true });
  }
});
