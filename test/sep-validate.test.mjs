import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
function run(kind, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sep-'));
  const file = path.join(dir, kind === 'script' ? 'test.dr' : 'route.json');
  fs.writeFileSync(file, body);
  return spawnSync(process.execPath, ['scripts/sep-validate.mjs', kind, file], { cwd: root, encoding: 'utf8' });
}

test('SEP accepts a valid script', () => {
  const r = run('script', '# test\n  put exp\n  wait\n  move n\n');
  assert.equal(r.status, 0, r.stderr);
});

test('SEP rejects unavailable throwing knives', () => {
  const r = run('script', '  buy throwing knives\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /throwing knives/);
});

test('SEP validates route room ids', () => {
  assert.equal(run('route', JSON.stringify(['square', 'not_a_room'])).status, 1);
  assert.equal(run('route', JSON.stringify(['square', 'tg_pond'])).status, 0);
});
