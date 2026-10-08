import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRunner } from '../public/js/script-engine.js';
import { sweepRunnerCompletion } from '../scripts/lib/sweep-runner-completion.mjs';

// Exercise the real supervisor callbacks without importing the executable
// sweep entry point (which launches accounts, WS sessions and durable jobs).
const source = readFileSync(new URL('../scripts/race-guild-sweep.mjs', import.meta.url), 'utf8');
const method = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function harness({ brokenEscape = false } = {}) {
  const context = vm.createContext({
    createRunner: (src, args, io) => createRunner(brokenEscape && io.name === '<escape>' ? '# escape header\nwaitforre [' : src, args, io),
    sweepRunnerCompletion, Date, ROOMS: { bazaar: { spawns: [] } }, CLAIMED_ARENAS: new Set(),
    trackMove() {}, trackRefusedMove() {}, log() {}, VERB_ALLOWLIST_RE: /./,
  });
  vm.runInContext(`class Fixture {
    ${method('  startCycle(src, name) {', '  updateActivity() {')}
    ${method('  walkBazaarEscape(steps) {', '  restartCycle() {')}
    ${method('  heartbeat() {', '  progressLine() {')}
  }
  globalThis.Fixture = Fixture;`, context);
  const agent = new context.Fixture();
  Object.assign(agent, {
    scriptBase: 'sw_', guild: 'barbarian', race: 'human', library: { sw_mega: 'pause 30' },
    commandCounts: {}, kitParts: {}, logs: [], finishes: [], sends: [], starts: [], done: false,
    lastRoomChangeAt: Date.now(), flatSince: Date.now(),
    appendLog(line) { this.logs.push(line); },
    updateActivity() {}, recordMilestone() {}, updateStallVerdict() {},
    getScript(name) { return this.library[name]; },
    diskAdj() { return {}; },
    regenerateFromHere() { this.regenerated = (this.regenerated || 0) + 1; },
    finish(reason) { this.done = true; this.finishes.push(reason); this.runner?.stop(); },
    session: { vitals: { room: 'bazaar', inCombat: false }, bfsPath() { return null; }, injectState() {}, cmd(line) { agent.sends.push(line); } },
  });
  const start = agent.startCycle;
  agent.startCycle = function(src, name) { this.starts.push(name); return start.call(this, src, name); };
  return agent;
}

test('main sweep fatal failure records exact nested script source and prevents watchdog replay', () => {
  const agent = harness();
  agent.library.child = '# child header\nwaitforre [';
  agent.startCycle('putrun child\nput attack', 'sw_mega');
  assert.equal(agent.done, true);
  assert.equal(agent.finishes.length, 1);
  assert.match(agent.finishes[0], /script error: Error at child:2/);
  assert.match(agent.finishes[0], /waitforre \[/);
  assert.match(agent.finishes[0], /Called from sw_mega:1/);
  agent.lastSendAt = Date.now() - 5000;
  agent.heartbeat();
  assert.deepEqual(agent.starts, ['sw_mega']);
  assert.deepEqual(agent.sends, []);
});

test('escape errors terminate instead of announcing arrival or rebuilding the library', () => {
  const agent = harness({ brokenEscape: true });
  agent.walkBazaarEscape(['n']);
  assert.equal(agent.done, true);
  assert.match(agent.finishes[0], /Error at <escape>:2/);
  assert.equal(agent.regenerated, undefined);
  assert.equal(agent.logs.some(line => line.includes('arrived at')), false);
  assert.deepEqual(agent.starts, []);
  agent.lastSendAt = Date.now() - 5000;
  agent.heartbeat();
  assert.deepEqual(agent.starts, []);
});

test('a heartbeat-resumed runtime error returns before injection or replay in the same tick', t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const agent = harness();
  agent.startCycle('pause 1\nwaitforre [\nput attack', 'sw_mega');
  assert.equal(agent.done, false);
  agent.session.injectState = () => { throw new Error('must not inject after terminal failure'); };
  now = 7000;
  assert.doesNotThrow(() => agent.heartbeat());
  assert.equal(agent.done, true);
  assert.match(agent.finishes[0], /Error at sw_mega:2/);
  assert.deepEqual(agent.starts, ['sw_mega']);
  assert.deepEqual(agent.sends, []);
});

test('normal completed runners retain watchdog recovery and normal escapes retain arrival handoff', () => {
  const agent = harness();
  agent.startCycle('exit', 'sw_mega');
  assert.equal(agent.done, false);
  agent.lastSendAt = Date.now() - 5000;
  agent.heartbeat();
  assert.deepEqual(agent.starts, ['sw_mega', 'sw_mega']);
  assert.deepEqual(agent.finishes, []);
  const escape = harness();
  escape.session.vitals.room = 'start';
  escape.walkBazaarEscape(['n']);
  escape.session.vitals.room = 'bazaar';
  escape.runner.feed('[[Bazaar]]', 'room');
  escape.runner.feed('HP: 10/10', true);
  assert.equal(escape.regenerated, 1);
  assert.equal(escape.logs.some(line => line.includes('arrived at')), true);
  assert.deepEqual(escape.starts, ['sw_mega']);
  assert.deepEqual(escape.finishes, []);
});
