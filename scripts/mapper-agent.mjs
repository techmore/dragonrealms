// Mapper agent: walks movement scripts through the REAL session stack and
// writes a per-run report of where navigation broke.
//
//   node scripts/mapper-agent.mjs [--routes routes.json] [--name MapWalker]
//                                 [--server http://localhost:3000]
//
// A route file is an array of walks:
//   [{ "name": "square-to-bazaar", "steps": ["e","e"] },
//    { "name": "gate-loop",        "steps": ["n","s","w","e"] }]
// Each step is one command the server understands (a direction, "go <exit>",
// or any command — the mapper logs whatever comes back).
//
// For every step the agent records: command sent, resulting room (id + name),
// and whether the world acknowledged the move ("You walk...", a room header)
// or refused it ("You can't go there", combat lock, roundtime). The report is
// appended to public/live/mapper-<run>.log as JSON lines:
//   { at, route, step, cmd, roomBefore, roomAfter, ok, note }
// plus a final summary with the failing steps, so the map-fixing pass can
// query exactly which edges misbehaved.
//
// Feed it known-good DR walking scripts (clean-room, from sourced maps) by
// translating their move lists into `steps` arrays.

import { WebSocket } from 'ws';
import { appendFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveDebugToken } from './lib/debug-token.mjs';
const ARGS = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = ARGS.indexOf('--' + name);
  return i >= 0 ? ARGS[i + 1] : dflt;
};
const SERVER = flag('server', 'http://localhost:3000');
const WS_ORIGIN = SERVER.replace(/^http/, 'ws') + '/ws';
const NAME_BASE = flag('name', 'MapWalker');
const ROUTES_FILE = flag('routes', '');
const PASS = 'MapperWalk1!';
const USER = 'mapper_agent';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => String(s).replace(/\x1b\[\d+m/g, '');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!ROUTES_FILE || !existsSync(ROUTES_FILE)) {
  console.error(`Usage: node scripts/mapper-agent.mjs --routes <routes.json> [--name MapWalker]`);
  console.error(`Routes file format: [{"name":"walk-name","steps":["e","ne","go gate"]}]`);
  process.exit(1);
}
const ROUTES = JSON.parse(readFileSync(ROUTES_FILE, 'utf8'));
const DEBUG_TOKEN = flag('debug', process.env.DR_MAPPER_DEBUG || resolveDebugToken());

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const REPORT = new URL(`../public/live/mapper-${RUN_ID}.log`, import.meta.url);

class Mapper {
  constructor() {
    this.name = NAME_BASE.replace(/[^a-zA-Z]/g, '') || 'MapWalker';
    this.user = USER;
    this.ws = null;
    this.phase = 'connect';
    this.room = null;
    this.roomName = null;
    this.pending = null;   // { route, index, roomBefore }
    this.results = [];
    this.done = false;
    this.waiters = [];
  }

  async httpLogin() {
    let r = await fetch(SERVER + '/api/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: this.user, pass: PASS }),
    }).then((x) => x.json());
    if (!r.ok) r = await fetch(SERVER + '/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: this.user, pass: PASS }),
    }).then((x) => x.json());
    if (!r.ok) throw new Error(`account setup failed: ${r.error}`);
    this.token = r.token;
    this.charId = (r.characters || []).find((c) => c.name === this.name)?.charId || null;
  }

  send(obj) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj)); }

  async cmd(line) {
    await sleep(250); // well under the 20/s rate limit
    this.send({ t: 'input', line });
  }

  start() {
    this.ws = new WebSocket(WS_ORIGIN);
    this.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      this.onMessage(m);
    };
    this.ws.onclose = () => { if (!this.done) { log('socket closed'); this.finish(); } };
  }

  onMessage(m) {
    switch (m.t) {
      case 'login_prompt':
        this.send({ t: 'token', token: this.token });
        break;
      case 'charselect':
        this.send({ t: 'charselect', id: this.charId || 'new' });
        break;
      case 'charcreate':
        this.send({ t: 'charcreate', name: this.name, race: 'human', guild: 'trader', city: 'crossing' });
        break;
      case 'charalloc':
        this.send({ t: 'enter' });
        break;
      case 'enter':
        this.phase = 'playing';
        log(`${this.name} entered the world — running ${ROUTES.length} routes`);
        this.appendLog(JSON.stringify({ at: new Date().toISOString(), event: 'start', routes: ROUTES.map((r) => r.name) }));
        this.runRoutes();
        break;
      case 'room':
        this.room = m.roomId;
        const header = stripAnsi(String(m.msg).split('\n')[1] || '');
        this.roomName = /^\[\[(.*?),/.exec(header)?.[1] || null;
        if (this.pending && this.waitResolve) { this.waitResolve(); this.waitResolve = null; }
        break;
      case 'combat':
        this.inCombat = true;
        this.lastNote = stripAnsi(String(m.msg||'')).trim().slice(0,80);
        break;
      case 'msg':
      case 'notice': {
        const text = stripAnsi(String(m.msg || ''));
        if (this.pending && /You can't go|You cannot|can't go that way|not the time|Creatures block|must wait/i.test(text)) {
          this.lastNote = text.trim().slice(0, 120);
          if (this.waitResolve) { this.waitResolve(); this.waitResolve = null; }
        }
        // Aggressive creatures auto-engage on room entry; a mapper's job is
        // surveying, not fighting. Track combat end so we can flee out.
        if (/no longer in combat|combat ends|the (fight|battle) is over|flee/i.test(text)) {
          this.inCombat = false;
        }
        if (/You (?:slay|kill|have killed)/i.test(text)) {
          this.kills = (this.kills || 0) + 1;
        }
        break;
      }
      case 'error':
        log(`server error: ${m.msg}`);
        break;
    }
  }

  // Send one step and wait for the room message (or a refusal) to come back.
  async step(route, index, cmdLine) {
    // Combat blocks movement at melee/pole (DR range rules); a single
    // 'retreat' falls back to missile range, where movement is allowed.
    let retreated = false;
    if (this.inCombat) {
      await this.cmd('retreat');
      await sleep(120); // move during the RT window before foes close again
      retreated = true;
    }
    const roomBefore = this.room;
    this.lastNote = null;
    const p = new Promise((resolve) => { this.waitResolve = resolve; });
    await this.cmd(cmdLine);
    const guard = sleep(1500); // never wait forever on a silent edge
    await Promise.race([p, guard]);
    const ok = this.room !== roomBefore || /^(look|inventory)/i.test(cmdLine);
    const result = {
      at: new Date().toISOString(),
      route: route.name,
      step: index,
      cmd: cmdLine,
      roomBefore,
      roomAfter: this.room,
      roomNameAfter: this.roomName,
      inCombat: !!this.inCombat,
      ok,
      note: this.lastNote || (ok ? '' : 'no movement observed'),
    };
    // One immediate retry after a retreat: the RT window is tight and a
    // blocked first attempt is expected; the retry lands in missile range.
    if (!ok && retreated && !this._retried) {
      this._retried = true;
      const retry = await this.step(route, index, cmdLine);
      this._retried = false;
      this.results.pop(); // keep the retry result, not the blocked attempt
      return retry;
    }
    this.results.push(result);
    this.appendLog(JSON.stringify(result));
    if (!ok) log(`[${route.name}] step ${index} FAILED: "${cmdLine}" (${result.note})`);
    return result;
  }

  async runRoutes() {
    for (const route of ROUTES) {
      log(`route: ${route.name} (${route.steps.length} steps)`);
      for (let i = 0; i < route.steps.length; i++) {
        const res = await this.step(route, i, route.steps[i]);
        // A failed step means the chain has drifted (combat flee, blocked
        // edge). With the debug API we re-home to the intended post-step
        // room so the remaining legs stay meaningful; without it, the run
        // continues but downstream failures are expected cascade.
        if (!res.ok) {
          const target = route.rooms?.[i + 1] ?? route.rooms?.[route.rooms.length - 1];
          await this.debugRehome(target);
        }
      }
    }
    this.writeSummary();
    this.finish();
  }

  async debugRehome(roomId) {
    if (!roomId || !DEBUG_TOKEN) return;
    try {
      // The WS session owns the character; bind it to an HTTP session first
      // so the debug endpoint's ownsPlayer check passes.
      await fetch(SERVER + '/api/enter', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ charId: this.charId }),
      }).then((x) => x.json());
      const r = await fetch(SERVER + '/api/debug', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dr-debug-token': DEBUG_TOKEN,
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ room: roomId, clearCombat: true, hp: 145 }),
      }).then((x) => x.json());
      if (!r.ok) log(`rehome rejected: ${JSON.stringify(r).slice(0, 120)}`);
      if (r.ok && r.state?.player?.room === roomId) {
        this.room = roomId;
        this.inCombat = false;
        this.appendLog(JSON.stringify({ at: new Date().toISOString(), event: 'rehome', room: roomId }));
        log(`re-homed to ${roomId}`);
      }
    } catch (e) { log(`rehome failed: ${e.message}`); }
  }

  writeSummary() {
    const failures = this.results.filter((r) => !r.ok);
    const summary = {
      at: new Date().toISOString(),
      event: 'summary',
      totalSteps: this.results.length,
      failures: failures.length,
      failedSteps: failures.map((f) => ({ route: f.route, step: f.step, cmd: f.cmd, roomBefore: f.roomBefore, note: f.note })),
    };
    this.appendLog(JSON.stringify(summary));
    // Machine-readable pointer for the fixing pass.
    writeFileSync(new URL('../public/live/mapper-latest-summary.json', import.meta.url), JSON.stringify(summary, null, 2));
    log(`done: ${this.results.length - failures.length}/${this.results.length} steps OK, ${failures.length} failures -> ${REPORT.pathname}`);
  }

  appendLog(line) {
    appendFileSync(REPORT, line + '\n');
  }

  finish() {
    if (this.done) return;
    this.done = true;
    try { this.ws.close(); } catch {}
    process.exit(0);
  }
}

const mapper = new Mapper();
await mapper.httpLogin();
mapper.start();
