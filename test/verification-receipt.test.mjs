import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseVerificationArgs, fingerprintFiles, gitIdentity, sourceIdentity, createReceipt, recordCheck, recordSkip, finishReceipt, writeReceiptAtomic } from '../scripts/lib/verification-receipt.mjs';

const clock = () => {
  let tick = Date.parse('2026-10-07T12:00:00Z');
  return () => new Date(tick += 10);
};
const identity = (digest = 'abc') => ({ fingerprint: { available: true, algorithm: 'sha256', digest, fileCount: 2 }, git: { available: true, head: 'head', dirty: true } });

test('CLI arguments accept opt-in reports and release, reject missing/duplicate output paths', () => {
  assert.deepEqual(parseVerificationArgs([]), { release: false, reportPath: undefined });
  assert.deepEqual(parseVerificationArgs(['--report', '/tmp/report.json', '--release']), { release: true, reportPath: '/tmp/report.json' });
  for (const args of [['--report'], ['--report', '--release'], ['--report', 'one', '--report', 'two'], ['--unknown']]) assert.throws(() => parseVerificationArgs(args));
});

test('receipt records check timing, numeric counts, failures and explicit unverified skips without diagnostics/secrets', () => {
  const now = clock();
  const receipt = createReceipt({ source: identity(), now });
  recordCheck(receipt, { id: 'syntax', name: 'syntax', run: () => ({ files: 5 }), counts: (result) => result }, now);
  const error = new Error('TOKEN_SECRET=123');
  error.status = 9; error.stdout = 'PRIVATE_OUTPUT';
  const result = recordCheck(receipt, { id: 'tests', name: 'tests', run: () => { throw error; } }, now);
  assert.equal(result.failure, error);
  recordCheck(receipt, { id: 'audit', name: 'audit', run: () => {}, counts: { files: 2, bad: 'PRIVATE_ENV', negative: -1 } }, now);
  recordSkip(receipt, { id: 'browser', name: 'browser', reason: 'Not selected' });
  finishReceipt(receipt, { source: identity(), now });
  assert.deepEqual(receipt.summary, { passed: 2, failed: 1, skipped: 1 });
  assert.equal(receipt.selectedChecksPassed, false);
  assert.equal(receipt.allChecksVerified, false);
  assert.equal(receipt.checks[0].durationMs, 10);
  assert.equal(receipt.checks[1].failure.exitCode, 9);
  assert.equal(receipt.checks[3].verified, false);
  assert.deepEqual(receipt.checks[2].counts, { files: 2 });
  assert.equal(receipt.sourceChanged, false);
  assert.ok(receipt.durationMs > 0);
  assert.doesNotMatch(JSON.stringify(receipt), /TOKEN_SECRET|PRIVATE_OUTPUT|PRIVATE_ENV/);
});

test('successful selected checks do not certify skips or changed/unknown source', () => {
  const now = clock(), receipt = createReceipt({ source: identity(), now });
  recordCheck(receipt, { id: 'test', name: 'test', run: () => {} }, now);
  recordSkip(receipt, { id: 'browser', name: 'browser', reason: 'Not selected' });
  finishReceipt(receipt, { source: identity('changed'), now });
  assert.equal(receipt.selectedChecksPassed, true);
  assert.equal(receipt.allChecksVerified, false);
  assert.equal(receipt.sourceChanged, true);
  assert.equal(receipt.source.stable, false);
  assert.ok(receipt.limitations.some((text) => text.includes('changed during verification')));
  const unavailable = finishReceipt(createReceipt(), { source: { fingerprint: { available: false } } });
  assert.equal(unavailable.sourceChanged, null);
});

test('fingerprints include source paths/bytes deterministically and detect changed or added files', () => {
  const files = { '/project/a.js': 'const a=1;', '/project/b.mjs': 'const b=2;' };
  const read = (path) => files[path];
  const before = fingerprintFiles('/project', ['b.mjs', 'a.js', 'a.js'], read);
  assert.deepEqual(before, fingerprintFiles('/project', ['a.js', 'b.mjs'], read));
  assert.equal(before.fileCount, 2);
  files['/project/a.js'] += '//changed';
  assert.notEqual(before.digest, fingerprintFiles('/project', ['a.js', 'b.mjs'], read).digest);
  assert.notEqual(before.digest, fingerprintFiles('/project', ['a.js'], read).digest);
});

test('Git dirty summaries handle renamed paths and exclude raw status paths and command errors', () => {
  const execute = (_, args) => args[0] === 'rev-parse' ? 'abc123\n' : ' M file.js\0R  renamed.js\0old.js\0?? untracked/\0';
  assert.deepEqual(gitIdentity('/project', execute), { available: true, head: 'abc123', dirty: true, trackedChanges: 2, untrackedEntries: 1 });
  assert.deepEqual(gitIdentity('/project', () => { throw new Error('SECRET'); }), { available: false });
  const source = sourceIdentity('/project', ['missing'], { read: () => { throw new Error('SECRET'); }, execute });
  assert.deepEqual(source.fingerprint, { available: false });
  assert.doesNotMatch(JSON.stringify(source), /SECRET|renamed|untracked\//);
});

test('atomic report replaces only destination and removes its temporary file on write/rename failures', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dr-verification-receipt-'));
  const target = join(directory, 'report.json');
  try {
    writeFileSync(target, 'previous');
    const receipt = finishReceipt(createReceipt());
    writeReceiptAtomic(target, receipt);
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), receipt);
    assert.deepEqual(readdirSync(directory), ['report.json']);
    assert.throws(() => writeReceiptAtomic(target, receipt, { rename: () => { throw new Error('rename failed'); } }), /rename failed/);
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), receipt);
    assert.deepEqual(readdirSync(directory), ['report.json']);
    assert.throws(() => writeReceiptAtomic(join(directory, 'missing', 'report.json'), receipt));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
