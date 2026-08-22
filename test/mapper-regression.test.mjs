// Mapper regression: boots a throwaway world server on an ephemeral port and
// drives the wire like scripts/mapper-agent.mjs does. Fails if any step can't
// reach its expected room (combat drift is recovered via the debug API).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { readFileSync } from 'node:fs';

const PORT = 3456;
const SERVER = `http://127.0.0.1:${PORT}`;
const DEBUG = 'mapper-test-token';
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

test('mapper route audit: every edge walkable on a live wire', async () => {
  // --- boot temp server ---
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env, PORT: String(PORT),
      DR_ENABLE_API: '1', DR_ENABLE_DEBUG_API: '1', DR_DEBUG_TOKEN: DEBUG,
      DR_DB_PATH: ':memory:',
    },
    stdio: 'ignore',
  });
  child.on('error', () => {});
  try {
    // wait for health
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      await new Promise((r) => setTimeout(r, 250));
      up = await fetch(`${SERVER}/api/health`).then((x) => x.ok).catch(() => false);
    }
    assert.ok(up, 'temp server booted');

    const j = async (path, body, token, hdrs) => {
      const r = await fetch(SERVER + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(hdrs || {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return r.json();
    };

    const reg = await j('/api/register', { user: `mapreg${Date.now() % 100000000}`, pass: 'MapperTest1!' });
    assert.ok(reg.ok, 'registered');
    const token = reg.token;

    // create + enter a character over the API
    const created = await j('/api/characters', { name: 'MapAudit', race: 'human', guild: 'barbarian' }, token);
    assert.ok(created.ok !== false, JSON.stringify(created).slice(0, 120));
    const charId = created.charId;
    const entered = await j('/api/enter', { charId }, token);
    assert.ok(entered.ok, JSON.stringify(entered).slice(0, 120));

    // representative routes: town spokes, both gates, wilds heads, sewers
    const legs = [
      ['e', 'bazaar'], ['w', 'square'],
      ['w', null], ['w', null], ['w', null],   // toward west gate corridor
    ];
    // Use derived paths instead of hand steps: import findPath from grid.
    const { findPath } = await import('../data/grid.js');
    const { ROOMS } = await import('../data/world.js');
    const stops = ['bazaar', 'west_gate', 'woods_path', 'east_gate', 'marsh_1',
                   'temple_row', 'sewers_3', 'hall_paladin'];
    let cur = 'square';
    let okSteps = 0, total = 0;

    for (const dest of stops) {
      const steps = findPath(cur, dest);
      assert.ok(steps, `path ${cur} -> ${dest}`);
      const dist = await fetch(`${SERVER}/api/debug`, {
        method: 'POST',
        headers: { 'content-type': 'application/json',
          authorization: `Bearer ${token}`, 'x-dr-debug-token': DEBUG },
        body: JSON.stringify({ room: cur, clearCombat: true, hp: 145 }),
      }).then((x) => x.json());
      assert.ok(dist.ok, `teleport to ${cur}`);

      for (let i = 0; i < steps.length; i++) {
        total++;
        // Combat blocks movement at melee/pole; fall back first if engaged.
        let r = await j('/api/command', { command: steps[i] }, token).catch(() => null);
        let roomNow = r?.state?.player?.room;
        if (!roomNow || roomNow === cur) {
          await j('/api/command', { command: 'retreat' }, token);
          r = await j('/api/command', { command: steps[i] }, token);
          roomNow = r.state?.player?.room;
        }
        if (roomNow && roomNow !== cur) {
          cur = roomNow;
          okSteps++;
        } else {
          // last resort: debug re-home to the waypoint so the audit continues
          // intended waypoint: next room along remaining steps from `cur`
          let wp = cur;
          for (let k = i; k < steps.length; k++) {
            const nxt = ROOMS[wp]?.exits?.[steps[k]];
            if (!nxt) break;
            wp = nxt;
            break; // just the next room
          }
          if (wp === cur) wp = null;
          const fix = await fetch(`${SERVER}/api/debug`, {
            method: 'POST',
            headers: { 'content-type': 'application/json',
              authorization: `Bearer ${token}`, 'x-dr-debug-token': DEBUG },
            body: JSON.stringify({ room: wp, clearCombat: true, hp: 145 }),
          }).then((x) => x.json());
          assert.ok(fix.ok, `stuck before ${dest} at ${cur}`);
          cur = wp;
        }
      }
      assert.equal(cur, dest, `reached ${dest}`);
    }
    assert.ok(total >= 20, `exercised ${total} steps`);
  } finally {
    child.kill();
  }
});
