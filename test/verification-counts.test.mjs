import test from 'node:test';
import assert from 'node:assert/strict';
import { verificationCounts, captureVerificationCommand } from '../scripts/lib/verification-counts.mjs';

const tap = '# tests 1350\n# suites 0\n# pass 1348\n# fail 0\n# cancelled 0\n# skipped 2\n# todo 0\n# duration_ms 42000\n';

test('final TAP aggregates ignore indented nested summaries and expose numeric actual counts', () => {
  const output = 'npm test\n    # tests 1\n    # pass 1\n    # fail 0\n    # skipped 0\n' + tap;
  assert.deepEqual(verificationCounts('tests', output), { known: true, counts: { tests: 1350, passed: 1348, failed: 0, skipped: 2, cancelled: 0, todo: 0, suites: 0 } });
  assert.deepEqual(verificationCounts('tests', Buffer.from(output.replace(/\n/g, '\r\n'))).counts.tests, 1350);
});

test('TAP todo/cancelled outcomes contribute to totals without fabricating absent optional fields', () => {
  assert.deepEqual(verificationCounts('tests', '# tests 2\n# pass 1\n# fail 0\n# skipped 0\n# todo 1\n').counts, { tests: 2, passed: 1, failed: 0, skipped: 0, todo: 1 });
  assert.equal(verificationCounts('tests', '# tests 2\n# pass 1\n# fail 0\n# skipped 0\n# cancelled 1\n').counts.cancelled, 1);
});

test('failed executions, incomplete TAP, inconsistent and duplicate totals stay unknown', () => {
  for (const output of ['# tests 2\n# pass 2\n', tap + tap, tap.replace('# pass 1348', '# pass 1300'), tap.replace('1350', '999999999999999999999999')]) assert.equal(verificationCounts('tests', output).known, false);
  assert.deepEqual(verificationCounts('tests', tap, { successful: false }), { known: false, counts: {}, reason: 'subprocess-failed-or-incomplete' });
});

test('browser summaries require both completed client and audit phases, never count PASS lines', () => {
  const result = verificationCounts('browser', 'PASS - example\nALL 135 CLIENT CHECKS PASSED\nALL 15 AUDIT CLIENT CHECKS PASSED\n');
  assert.deepEqual(result, { known: true, counts: { clientChecks: 135, auditClientChecks: 15, totalChecks: 150 } });
  for (const output of ['PASS - example\n', 'ALL 135 CLIENT CHECKS PASSED\n', 'ALL 15 AUDIT CLIENT CHECKS PASSED\n']) assert.equal(verificationCounts('browser', output).known, false);
  assert.equal(verificationCounts('browser', 'ALL 135 CLIENT CHECKS PASSED\nALL 15 AUDIT CLIENT CHECKS PASSED\n', { successful: false }).known, false);
});

test('corpus summaries require captured message count and exactly one completed match', () => {
  assert.deepEqual(verificationCounts('corpus', 'CAPTURED 184 messages -> /private/path/corpus.json\nCORPUS MATCH — behavior preserved\n'), { known: true, counts: { capturedMessages: 184, corpusMatches: 1 } });
  for (const output of ['CAPTURED 184 messages\n', 'CORPUS MATCH\n', 'CAPTURED 184 messages\nCORPUS MISMATCH\n', 'CAPTURED 184 messages\nCORPUS MATCHED\n', 'CAPTURED 184 messages\nCORPUS MATCH\nCORPUS MATCH\n']) assert.equal(verificationCounts('corpus', output).known, false);
});

test('ANSI summaries are handled, over-bound/missing logs stay unknown and output never enters parsed result', () => {
  assert.equal(verificationCounts('browser', '\x1b[32mALL 135 CLIENT CHECKS PASSED\x1b[0m\nALL 15 AUDIT CLIENT CHECKS PASSED\n').known, true);
  assert.equal(verificationCounts('tests', tap, { maxBytes: 10 }).reason, 'output-exceeds-parser-bound');
  assert.equal(verificationCounts('tests', undefined).reason, 'output-unavailable');
  const result = verificationCounts('corpus', 'SECRET_TOKEN=xyz\nCAPTURED 184 messages -> /secret/path\nCORPUS MATCH\n');
  assert.doesNotMatch(JSON.stringify(result), /SECRET|secret|xyz/);
  assert.equal(verificationCounts('unknown', tap).known, false);
});

test('capture forwards each stream once and parses actual browser summaries emitted on stderr', () => {
  const outputs = [], errors = [];
  const result = captureVerificationCommand(process.execPath, ['-e', 'console.log("owned fixture stdout"); console.error("ALL 141 CLIENT CHECKS PASSED"); console.error("ALL 15 AUDIT CLIENT CHECKS PASSED");'], 'browser', {
    stdout: text => outputs.push(text), stderr: text => errors.push(text),
  });
  assert.equal(result.failure, null);
  assert.equal(outputs.length, 1);
  assert.equal(errors.length, 1);
  assert.match(outputs[0], /owned fixture stdout/);
  assert.deepEqual(result.evidence, { known: true, counts: { clientChecks: 141, auditClientChecks: 15, totalChecks: 156 } });
  assert.doesNotMatch(JSON.stringify(result), /owned fixture stdout|ALL 141/);
});

test('captured failure/signal/buffer errors remain unknown and preserve nonzero exit status', () => {
  for (const state of [{ status: 9, signal: null }, { status: null, signal: 'SIGTERM' }, { status: null, error: Object.assign(new Error('buffer limit'), { code: 'ENOBUFS' }) }]) {
    const outputs = [], errors = [];
    let calls = 0;
    const result = captureVerificationCommand('fixture', [], 'browser', {
      execute: (_, __, options) => { calls++; assert.equal(options.maxBuffer, 32 * 1024 * 1024); return { stdout: 'stdout log', stderr: 'ALL 141 CLIENT CHECKS PASSED\nALL 15 AUDIT CLIENT CHECKS PASSED', ...state }; },
      stdout: text => outputs.push(text), stderr: text => errors.push(text),
    });
    assert.equal(calls, 1);
    assert.equal(outputs.length, 1);
    assert.equal(errors.length, 1);
    assert.equal(result.evidence.known, false);
    assert.ok(result.failure);
    if (state.status === 9) assert.equal(result.failure.status, 9);
  }
});
