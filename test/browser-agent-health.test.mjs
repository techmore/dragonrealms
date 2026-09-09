import test from 'node:test';
import assert from 'node:assert/strict';
import { agentHealth } from '../public/js/admin/agent-health.js';
test('quiet script warns after a minute without declaring failure', () => {
  const a = { status: 'running', startedAt: 0, scriptStartedAt: 1000 };
  assert.equal(agentHealth(a, 60999), '');
  assert.match(agentHealth(a, 61000), /No script commands for 60s/);
  assert.equal(a.status, 'running');
});
test('script activity clears warning; future timestamps do not warn', () => {
  const a = { status: 'running', startedAt: 0, lastScriptCommandAt: 90000 };
  assert.equal(agentHealth(a, 100000), '');
  assert.equal(agentHealth(a, 80000), '');
});
test('startup and terminal states never show script inactivity', () => {
  for (const status of ['connecting', 'loading_scripts', 'failed', 'cancelled', 'completed']) {
    assert.equal(agentHealth({ status, startedAt: 0 }, 100000), '');
  }
});
