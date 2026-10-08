// Recognize only bounded, complete aggregate summaries. Never retain raw logs.
import { spawnSync } from 'node:child_process';
export const MAX_COUNT_OUTPUT_BYTES = 4 * 1024 * 1024;
const unknown = (reason) => ({ known: false, counts: {}, reason });
const integer = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function verificationCounts(kind, output, { successful = true, maxBytes = MAX_COUNT_OUTPUT_BYTES } = {}) {
  if (!successful) return unknown('subprocess-failed-or-incomplete');
  if (typeof output !== 'string' && !Buffer.isBuffer(output)) return unknown('output-unavailable');
  if (Buffer.byteLength(output) > maxBytes) return unknown('output-exceeds-parser-bound');
  const text = String(output).replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n');
  if (kind === 'tests') {
    // Nested TAP suites indent their totals. Only the one final unindented
    // summary is authoritative; contradictory/duplicate summaries are unknown.
    const values = {};
    for (const field of ['tests', 'pass', 'fail', 'skipped']) {
      const matches = [...text.matchAll(new RegExp(`^# ${field} (\\d+)[ \\t]*$`, 'gm'))];
      if (matches.length !== 1) return unknown('missing-or-ambiguous-test-summary');
      values[field] = integer(matches[0][1]);
      if (values[field] === null) return unknown('invalid-test-summary');
    }
    const optional = {};
    for (const field of ['cancelled', 'todo', 'suites']) {
      const matches = [...text.matchAll(new RegExp(`^# ${field} (\\d+)[ \\t]*$`, 'gm'))];
      if (matches.length > 1) return unknown('ambiguous-test-summary');
      if (matches.length) {
        optional[field] = integer(matches[0][1]);
        if (optional[field] === null) return unknown('invalid-test-summary');
      }
    }
    if (values.tests !== values.pass + values.fail + values.skipped + (optional.cancelled ?? 0) + (optional.todo ?? 0)) return unknown('inconsistent-test-summary');
    return { known: true, counts: { tests: values.tests, passed: values.pass, failed: values.fail, skipped: values.skipped, ...optional } };
  }
  if (kind === 'browser') {
    const clients = [...text.matchAll(/^ALL (\d+) CLIENT CHECKS PASSED[ \t]*$/gm)];
    const audits = [...text.matchAll(/^ALL (\d+) AUDIT CLIENT CHECKS PASSED[ \t]*$/gm)];
    if (clients.length !== 1 || audits.length !== 1) return unknown('missing-or-ambiguous-browser-summary');
    const clientChecks = integer(clients[0][1]), auditClientChecks = integer(audits[0][1]);
    if (clientChecks === null || auditClientChecks === null || !Number.isSafeInteger(clientChecks + auditClientChecks)) return unknown('invalid-browser-summary');
    return { known: true, counts: { clientChecks, auditClientChecks, totalChecks: clientChecks + auditClientChecks } };
  }
  if (kind === 'corpus') {
    const captures = [...text.matchAll(/^CAPTURED (\d+) messages(?: ->[^\n]*)?[ \t]*$/gm)];
    const matches = [...text.matchAll(/^CORPUS MATCH(?:[ \t]+—[ \t]+behavior preserved)?[ \t]*$/gm)];
    if (captures.length !== 1 || matches.length !== 1) return unknown('missing-or-ambiguous-corpus-summary');
    const capturedMessages = integer(captures[0][1]);
    if (capturedMessages === null) return unknown('invalid-corpus-summary');
    return { known: true, counts: { capturedMessages, corpusMatches: 1 } };
  }
  return unknown('unsupported-summary-kind');
}

// Capture both streams because Ego's CLI writes browser summaries to stderr.
// Return only aggregate evidence and failure status; output stays in the log.
export function captureVerificationCommand(command, args, kind, {
  cwd, execute = spawnSync,
  stdout = (output) => process.stdout.write(output),
  stderr = (output) => process.stderr.write(output),
} = {}) {
  const result = execute(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  if (result.stdout) stdout(result.stdout);
  if (result.stderr) stderr(result.stderr);
  const successful = !result.error && result.status === 0 && !result.signal;
  const outputBytes = Buffer.byteLength(result.stdout ?? '') + Buffer.byteLength(result.stderr ?? '') + 1;
  const evidence = !successful ? unknown('subprocess-failed-or-incomplete')
    : outputBytes > MAX_COUNT_OUTPUT_BYTES ? unknown('output-exceeds-parser-bound')
    : verificationCounts(kind, `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (successful) return { evidence, failure: null };
  const failure = result.error ?? new Error(`Verification subprocess ${result.signal ? `terminated by ${result.signal}` : `exited with status ${result.status ?? 'unknown'}`}`);
  if (Number.isInteger(result.status)) failure.status = result.status;
  return { evidence, failure };
}
