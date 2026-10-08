import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, createRunner } from '../public/js/script-engine.js';
import { scriptStatusText, scriptDiagnosticText } from '../public/js/script-status.js';

test('parser retains physical CRLF line numbers and literal source while preserving instructions', () => {
  const parsed = parseScript('# header\r\n\r\nstart:\r\n  echo hello\r\n  waitforre [\r\n');
  assert.deepEqual(parsed.lines, ['echo hello', 'waitforre [']);
  assert.deepEqual(parsed.sourceLines, [4, 5]);
  assert.deepEqual(parsed.sourceText, ['  echo hello', '  waitforre [']);
  assert.deepEqual(parsed.labels, { start: 0 });
});
test('duplicate labels report parse context while keeping existing last-definition semantics', () => {
  const diagnostics = [], sent = [];
  const runner = createRunner('goto next\nnext:\nput old\nnext:\nput final', [],
    { name: 'duplicate', send: line => sent.push(line), onDiagnostic: error => diagnostics.push(error) });
  runner.start();
  assert.deepEqual(sent, ['final']);
  assert.equal(diagnostics[0].phase, 'parse');
  assert.equal(diagnostics[0].severity, 'warning');
  assert.equal(diagnostics[0].script, 'duplicate');
  assert.equal(diagnostics[0].line, 4);
  assert.equal(diagnostics[0].source, 'next:');
});
test('nested invalid regex stops with called-script and parent-call source locations', () => {
  const sent = [], diagnostics = [];
  const runner = createRunner('# parent\n\nput look\nputrun child\nput attack', [], {
    name: 'parent', send: line => sent.push(line), onDiagnostic: error => diagnostics.push(error),
    getScript: name => name === 'child' ? '# child\nstart:\n  waitforre [\nput hunt' : null,
  });
  assert.doesNotThrow(() => runner.start());
  assert.equal(runner.running, false);
  assert.equal(runner.state.outcome, 'error');
  const error = diagnostics[0];
  assert.equal(error.severity, 'error');
  assert.equal(error.script, 'child');
  assert.equal(error.line, 3);
  assert.equal(error.source, '  waitforre [');
  assert.deepEqual(error.stack.map(frame => [frame.script, frame.line]), [['parent', 4], ['child', 3]]);
  assert.match(scriptDiagnosticText(error), /Called from parent:4/);
  runner.feed('anything'); runner.start();
  assert.deepEqual(sent, ['look'], 'fatal errors never restart or send later instructions');
});
test('a regex exception reached after a wait is contained during feed', () => {
  const runner = createRunner('# header\nwait\nmatchre end [\nput look', [], { name: 'afterwait' });
  runner.start();
  assert.equal(runner.running, true);
  assert.doesNotThrow(() => runner.feed('HP: 10/10', true));
  assert.equal(runner.running, false);
  assert.equal(runner.state.diagnostic.line, 3);
});
test('missing called scripts, labels and unknown instructions remain nonfatal warnings', () => {
  const sent = [], diagnostics = [];
  const runner = createRunner('# header\nputrun missing\ngoto nowhere\nnot_a_verb\nput look', [], {
    name: 'warnings', send: line => sent.push(line), onDiagnostic: warning => diagnostics.push(warning),
  });
  runner.start();
  assert.deepEqual(sent, ['look']);
  assert.equal(runner.state.outcome, 'completed');
  assert.deepEqual(diagnostics.map(error => [error.severity, error.line]), [['warning', 2], ['warning', 3], ['warning', 4]]);
});
test('match branches report the physical source of a missing target while preserving fallthrough', () => {
  const warnings = [], sent = [];
  const runner = createRunner('# header\nmatch missing found\nmatchwait\nput look', [], {
    name: 'matchtest', onDiagnostic: value => warnings.push(value), send: line => sent.push(line),
  });
  runner.start(); runner.feed('found');
  assert.equal(warnings[0].line, 2);
  assert.equal(warnings[0].source, 'match missing found');
  assert.deepEqual(sent, ['look']);
});
test('run-state text distinguishes wait, completion, error, stop and automation pause', () => {
  const runner = createRunner('# header\npause 20', [], { name: 'waiting' }); runner.start();
  const snapshot = { name: 'waiting', phase: 'waiting', state: runner.state };
  assert.match(scriptStatusText(snapshot), /waiting for a timer or roundtime.*waiting:2/);
  assert.match(scriptStatusText(snapshot, true), /Automation paused.*explicitly/);
  assert.match(scriptStatusText({ ...snapshot, phase: 'error' }), /stopped after an error/);
  assert.match(scriptStatusText({ ...snapshot, phase: 'completed' }), /completed/);
  assert.match(scriptStatusText({ ...snapshot, phase: 'completed' }, true), /waiting: last run completed/);
  assert.match(scriptStatusText({ ...snapshot, phase: 'error' }, true), /waiting: last run errored/);
  assert.match(scriptStatusText({ ...snapshot, phase: 'stopped' }), /Run it explicitly/);
  runner.stop();
  assert.equal(runner.state.outcome, 'stopped');
});


test('deferred roundtime transport failure completes once with source and never retries', () => {
  const originalNow = Date.now; let now = 1000;
  Date.now = () => now;
  try {
    const completions = [], sends = [];
    const runner = createRunner('# deferred action\nput attack rat\nput look\nexit', [], {
      name: 'deferred', send: line => { sends.push(line); throw new Error('transport failed'); },
      onDone: result => completions.push(result),
    });
    runner.feed('HP: 10/10 RT: 1', true); runner.start();
    assert.equal(runner.state.mode, 'timer');
    assert.deepEqual(sends, []);
    now = 3000;
    assert.doesNotThrow(() => runner.feed(''));
    assert.equal(runner.running, false);
    assert.equal(runner.state.outcome, 'error');
    assert.equal(completions.length, 1);
    assert.equal(completions[0].reason, 'error');
    assert.equal(completions[0].diagnostic.script, 'deferred');
    assert.equal(completions[0].diagnostic.line, 2);
    assert.equal(completions[0].diagnostic.source, 'put attack rat');
    assert.match(completions[0].diagnostic.message, /transport failed/);
    runner.feed('RT: 0', true); runner.feed(''); runner.start();
    assert.deepEqual(sends, ['attack rat']);
    assert.equal(completions.length, 1);
  } finally { Date.now = originalNow; }
});
