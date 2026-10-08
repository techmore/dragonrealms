import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, symlinkSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { collectReleaseSource, buildReleaseBundle, writeReleaseBundle, sourceFingerprint, excludedSourcePath, verifyExtractedRelease } from '../scripts/lib/release-package.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dr-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, text = '') => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  for (const path of ['README.md', 'AGENTS.md', 'ROADMAP.md', 'SKILLS.md']) put(path, '# Guide\n');
  put('package.json', JSON.stringify({ name: 'fixture', version: '1.2.3', type: 'module', main: 'server/index.js', scripts: { start: 'node server/index.js', test: 'node --test test/*.test.mjs' } }));
  put('package-lock.json', '{"lockfileVersion":3}\n');
  put('server/index.js', 'export const ready = true;\n');
  put('test/fixture.test.mjs', '');
  return { root, put };
}
function entries(archive) {
  const bytes = gunzipSync(archive), results = [];
  let offset = 0;
  while (bytes.subarray(offset, offset + 512).some((byte) => byte !== 0)) {
    const h = bytes.subarray(offset, offset + 512);
    const str = (start, length) => h.subarray(start, start + length).toString().split('\0')[0];
    const size = parseInt(str(124, 12), 8), prefix = str(345, 155);
    const expected = parseInt(str(148, 8), 8), checksumBytes = Buffer.from(h); checksumBytes.fill(32, 148, 156);
    assert.equal(expected, checksumBytes.reduce((total, byte) => total + byte, 0));
    assert.equal(str(257, 6), 'ustar');
    results.push({ path: (prefix ? `${prefix}/` : '') + str(0, 100), mode: parseInt(str(100, 8), 8), size, mtime: parseInt(str(136, 12), 8), content: bytes.subarray(offset + 512, offset + 512 + size) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.ok(bytes.subarray(offset, offset + 1024).every((byte) => byte === 0));
  return results;
}

test('collection excludes secrets and runtime paths before reading them, includes untracked authored assets', (t) => {
  const { root, put } = fixture(t);
  for (const path of ['data/store/accounts.db', 'public/live/results.json', 'scripts/nested/.envlocal', 'server/secrets.json', 'data/world.sqlite-wal', 'public/nested/id_ed25519', 'scripts/private-key.pem', 'puffer_adapter/__pycache__/x.pyc', 'public/backups/index.html']) put(path, 'MUST NOT READ');
  put('deploy/dragonrealms.service', 'service'); put('puffer_adapter/main.py', 'print("ok")'); put('scripts/build-admin-app.sh', '#!/bin/sh\n'); put('.gitignore', 'node_modules'); put('AUDIT.md', '# Audit');
  const reads = [];
  const snapshot = collectReleaseSource(root, { readFile: (path) => { reads.push(path); const bytes = readFileSync(path); assert.ok(!bytes.includes(Buffer.from('MUST NOT READ'))); return bytes; } });
  assert.ok(snapshot.files.some((file) => file.path === 'deploy/dragonrealms.service'));
  assert.ok(snapshot.files.some((file) => file.path === 'puffer_adapter/main.py'));
  assert.ok(snapshot.files.some((file) => file.path === 'AUDIT.md'));
  assert.equal(reads.length, snapshot.files.length);
  assert.ok(!snapshot.files.some((file) => excludedSourcePath(file.path)));
});

test('required root resources and npm main/script targets cannot be omitted', (t) => {
  const { root, put } = fixture(t);
  rmSync(join(root, 'SKILLS.md'));
  assert.throws(() => collectReleaseSource(root), /SKILLS.md/);
  put('SKILLS.md', '');
  put('package.json', JSON.stringify({ main: 'outside/main.js', scripts: { missing: 'node scripts/missing.mjs' } }));
  put('outside/main.js', '');
  assert.throws(() => collectReleaseSource(root), /outside\/main.js[\s\S]*scripts\/missing.mjs/);
});

test('relative exports and literal dynamic imports outside scope fail without executing modules', (t) => {
  const { root, put } = fixture(t);
  put('server/index.js', 'throw new Error("DO NOT RUN"); export {x} from "../outside/x.js?version#hash"; import("../public/live/x.js");');
  put('outside/x.js', ''); put('public/live/x.js', '');
  assert.throws(() => collectReleaseSource(root), /outside\/x.js[\s\S]*public\/live\/x.js/);
});

test('static asset closure fails for excluded or missing authored assets', (t) => {
  const { root, put } = fixture(t);
  put('public/index.html', '<script src="/js/app.js?v=1"></script><img src="./live/icon.png">');
  put('public/js/app.js', ''); put('public/live/icon.png', '');
  assert.throws(() => collectReleaseSource(root), /public\/live\/icon.png/);
  put('public/index.html', '<link href="/css/main.css" rel="stylesheet">');
  put('public/css/main.css', 'body { background: url(../missing.png) }');
  assert.throws(() => collectReleaseSource(root), /public\/missing.png/);
});

test('symlinks fail inside shipped scope but excluded directories are never followed', (t) => {
  const { root } = fixture(t);
  symlinkSync('/not/a/real/path', join(root, 'server/link.js'));
  assert.throws(() => collectReleaseSource(root), /Unsupported source file type: server\/link.js/);
  rmSync(join(root, 'server/link.js'));
  mkdirSync(join(root, 'public'));
  symlinkSync('/not/a/real/path', join(root, 'public/live'));
  assert.doesNotThrow(() => collectReleaseSource(root));
});

test('USTAR extraction preserves executable mode and every byte; inside manifest equals sidecar', (t) => {
  const { root, put } = fixture(t);
  put('scripts/execute.sh', '#!/bin/sh\necho safe\n'); chmodSync(join(root, 'scripts/execute.sh'), 0o755);
  const longPath = `docs/${'long'.repeat(28)}/unicode-élève.md`; put(longPath, 'Unicode text é\n');
  const snapshot = collectReleaseSource(root), bundle = buildReleaseBundle(snapshot, { gitHead: 'abcd', npm: '10.0.0' });
  const archived = entries(bundle.archive);
  assert.equal(archived.length, snapshot.files.length + 1);
  for (const file of snapshot.files) {
    const item = archived.find((entry) => entry.path === file.path);
    assert.deepEqual(item.content, file.content); assert.equal(item.mode, file.mode); assert.equal(item.mtime, 0);
  }
  assert.deepEqual(archived.find((entry) => entry.path === 'release-manifest.json').content, bundle.manifestBytes);
  const out = join(root, 'artifacts/release/source.tar.gz'), result = writeReleaseBundle(out, bundle);
  assert.equal(statSync(out).mode & 0o777, 0o600);
  assert.equal(statSync(result.manifestPath).mode & 0o777, 0o600);
  const extract = join(root, 'extracted'); mkdirSync(extract);
  execFileSync('tar', ['-xzf', out, '-C', extract]);
  assert.equal(statSync(join(extract, 'scripts/execute.sh')).mode & 0o777, 0o755);
  assert.deepEqual(readFileSync(join(extract, longPath)), readFileSync(join(root, longPath)));
  assert.deepEqual(readFileSync(join(extract, 'release-manifest.json')), readFileSync(result.manifestPath));
  assert.equal(verifyExtractedRelease(extract).ok, true);
  writeFileSync(join(extract, 'server/index.js'), 'tampered');
  assert.match(verifyExtractedRelease(extract).errors.join('\n'), /differs from manifest/);
  writeFileSync(join(extract, '.env'), 'DO NOT READ');
  assert.match(verifyExtractedRelease(extract).errors.join('\n'), /Unmanifested extracted file: .env/);
});

test('archives and fingerprints are deterministic and content/mode tampering changes identity', (t) => {
  const { root, put } = fixture(t);
  const snapshot = collectReleaseSource(root), first = buildReleaseBundle(snapshot), second = buildReleaseBundle(snapshot);
  assert.deepEqual(first.archive, second.archive);
  assert.equal(sourceFingerprint([...first.manifest.files].reverse()), first.manifest.sourceFingerprint);
  const changed = first.manifest.files.map((file) => ({ ...file })); changed[0].mode = 0o755;
  assert.notEqual(sourceFingerprint(changed), first.manifest.sourceFingerprint);
  put('server/index.js', 'export const ready = false;');
  assert.notEqual(buildReleaseBundle(collectReleaseSource(root)).manifest.sourceFingerprint, first.manifest.sourceFingerprint);
  snapshot.files[0].content = Buffer.from('tampered');
  assert.throws(() => buildReleaseBundle(snapshot), /Source bytes changed/);
});

test('exclusive publication never overwrites either output and rejects incomplete CLI arguments', (t) => {
  const { root, put } = fixture(t);
  const bundle = buildReleaseBundle(collectReleaseSource(root)), out = join(root, 'artifacts/source.tar.gz');
  put('artifacts/source.tar.gz.manifest.json', 'KEEP');
  assert.throws(() => writeReleaseBundle(out, bundle), /Output already exists/);
  assert.equal(readFileSync(`${out}.manifest.json`, 'utf8'), 'KEEP'); assert.equal(existsSync(out), false);
  rmSync(`${out}.manifest.json`); writeReleaseBundle(out, bundle);
  assert.throws(() => writeReleaseBundle(out, bundle), /Output already exists/);
  assert.deepEqual(readFileSync(out), bundle.archive);
  const cli = spawnSync(process.execPath, ['scripts/package-release.mjs', '--out'], { encoding: 'utf8' });
  assert.equal(cli.status, 1); assert.match(cli.stderr, /incomplete argument/);
});


test('extracted verification rejects forged paths and altered manifest fingerprints', (t) => {
  const { root } = fixture(t), bundle = buildReleaseBundle(collectReleaseSource(root));
  writeFileSync(join(root, 'release-manifest.json'), bundle.manifestBytes);
  const manifest = JSON.parse(bundle.manifestBytes);
  manifest.sourceFingerprint = '0'.repeat(64);
  writeFileSync(join(root, 'release-manifest.json'), JSON.stringify(manifest));
  assert.match(verifyExtractedRelease(root).errors.join('\n'), /Manifest source fingerprint mismatch/);
  manifest.files[0].path = '../outside';
  writeFileSync(join(root, 'release-manifest.json'), JSON.stringify(manifest));
  assert.throws(() => verifyExtractedRelease(root), /Unsafe archive path/);
});


test('bounded active Markdown links must resolve inside the release, including receipt files and anchors', (t) => {
  const { root, put } = fixture(t);
  put('docs/PROJECT-EXPANSION-2026-10-08.md', '[Historical receipt](../artifacts/verification/passed.json)');
  put('artifacts/verification/passed.json', '{"ok":true}');
  assert.throws(() => collectReleaseSource(root), /docs\/PROJECT-EXPANSION-2026-10-08.md:1: Link .*artifacts\/verification\/passed.json points to missing file/);
  put('docs/verification/passed.json', '{"ok":true}');
  put('docs/PROJECT-EXPANSION-2026-10-08.md', '[Historical receipt](verification/passed.json)\n[Runbook](RELEASE.md#acceptance)');
  put('docs/RELEASE.md', '# Release\n## Acceptance\n[External](https://example.invalid/never-fetch)');
  const snapshot = collectReleaseSource(root);
  assert.deepEqual(snapshot.closure.documentation.documents, ['README.md', 'docs/PROJECT-EXPANSION-2026-10-08.md', 'docs/RELEASE.md']);
  assert.equal(snapshot.closure.documentation.counts.localLinks, 2);
  assert.equal(snapshot.closure.documentation.counts.fragments, 1);
  assert.deepEqual(buildReleaseBundle(snapshot).manifest.documentationCheck, snapshot.closure.documentation);
  put('docs/PROJECT-EXPANSION-2026-10-08.md', '[Runbook](RELEASE.md#missing-anchor)');
  assert.throws(() => collectReleaseSource(root), /missing anchor/);
});

test('archived Markdown remains outside bounded link closure while README is always checked', (t) => {
  const { root, put } = fixture(t);
  put('docs/archive.md', '[Old artifact](../artifacts/not-shipped.json)');
  assert.doesNotThrow(() => collectReleaseSource(root));
  put('README.md', '[Required guide](docs/missing.md)');
  assert.throws(() => collectReleaseSource(root), /README.md:1: Link docs\/missing.md points to missing file/);
});
