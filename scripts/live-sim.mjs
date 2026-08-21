// Live progression sims: grind characters through the REAL session stack.
//
//   node scripts/live-sim.mjs [--guilds bard,cleric] [--all] [--minutes 20]
//                             [--name-base Sim] [--race human]
//
// Unlike simulate-progression.mjs (headless, private in-process Game), this
// drives the actual server over the wire protocol — register/login, chargen,
// {t:'input'} commands, full message stream — exactly like a human client,
// so it exercises auth, sessions, rate limiting, command dispatch, and the
// combat tickers. No ?bot=1 flag: the characters are indistinguishable from
// ordinary players in every status surface.
//
// Progress appends to public/live/sim-<guild>.log (the admin jobs tailer
// picks these up), and the characters are online, so GM Watch renders their
// genuine interface while they play.

const ARGS = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = ARGS.indexOf('--' + name);
  return i >= 0 ? ARGS[i + 1] : dflt;
};
const BASE = 'http://localhost:3000';
const ORIGIN = 'ws://localhost:3000/ws';
const MINUTES = Number(flag('minutes', 15));
const NAME_BASE = flag('name-base', 'Sim');
const RACE = flag('race', 'human');
const PASS = 'SimGrind1!';

const { GUILDS } = await import('../data/guilds.js');
const { ROOMS } = await import('../data/world.js');
import { appendFileSync } from 'node:fs';

const ALL_GUILDS = Object.keys(GUILDS);
const wanted = ARGS.includes('--all') ? ALL_GUILDS
  : (flag('guilds', '') || 'bard,barbarian').split(',').map((s) => s.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => String(s).replace(/\x1b\[\d+m/g, '');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Adjacency for BFS: roomId -> [{dir, to}]
const ADJ = {};
for (const [id, r] of Object.entries(ROOMS)) {
  ADJ[id] = Object.entries(r.exits || {}).map(([dir, to]) => ({ dir, to }));
}
const SPAWN_ROOMS = Object.keys(ROOMS).filter((id) => (ROOMS[id].spawns || []).length);

function bfsPath(from, to) {
  if (from === to) return [];
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    for (const edge of ADJ[cur] || []) {
      if (prev.has(edge.to)) continue;
      prev.set(edge.to, { via: cur, dir: edge.dir });
      if (edge.to === to) {
        const path = [];
        let at = to;
        while (prev.get(at)) { path.unshift(prev.get(at).dir); at = prev.get(at).via; }
        return path;
      }
      q.push(edge.to);
    }
  }
  return null;
}
function nearestSpawnRoom(from) {
  let best = null, bestLen = Infinity;
  for (const id of SPAWN_ROOMS) {
    const p = bfsPath(from, id);
    if (p && p.length < bestLen) { bestLen = p.length; best = { id, path: p }; }
  }
  return best;
}

class LiveSim {
  constructor(guild) {
    this.guild = guild;
    this.name = NAME_BASE + guild[0].toUpperCase() + guild.slice(1);
    this.user = `sim_${guild}`;
    this.ws = null;
    this.phase = 'connect';
    this.hp = 0; this.maxHp = 0; this.circle = 1;
    this.inCombat = false; this.room = null;
    this.creatures = []; this.exits = [];
    this.pathQueue = [];
    this.kills = 0; this.hunts = 0;
    this.startedAt = Date.now();
    this.lastCmdAt = 0;
    this.logPath = new URL(`../public/live/sim-${guild}.log`, import.meta.url);
    this.done = false;
  }

  async httpLogin() {
    let r = await fetch(BASE + '/api/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: this.user, pass: PASS }),
    }).then((x) => x.json());
    if (!r.ok) r = await fetch(BASE + '/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: this.user, pass: PASS }),
    }).then((x) => x.json());
    if (!r.ok) throw new Error(`${this.guild}: account setup failed: ${r.error}`);
    this.token = r.token;
    this.charId = (r.characters || []).find((c) => c.name === this.name)?.charId || null;
  }

  appendLog(line) {
    appendFileSync(this.logPath, line + '\n');
  }

  send(obj) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj)); }

  // Server allows 20 cmds/sec; stay well under it.
  async cmd(line) {
    const wait = 160 - (Date.now() - this.lastCmdAt);
    if (wait > 0) await sleep(wait);
    this.lastCmdAt = Date.now();
    this.send({ t: 'input', line });
  }

  start() {
    this.ws = new WebSocket(ORIGIN); // deliberately NO ?bot=1
    this.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      this.onMessage(m);
    };
    this.ws.onclose = () => { if (!this.done) setTimeout(() => this.start(), 2000); };
  }

  onMessage(m) {
    switch (m.t) {
      case 'login_prompt':
        this.send({ t: 'token', token: this.token });
        break;
      case 'authed':
        break;
      case 'charselect': {
        if (this.charId) this.send({ t: 'charselect', id: this.charId });
        else this.send({ t: 'charselect', id: 'new' });
        break;
      }
      case 'charcreate':
        this.send({ t: 'charcreate', name: this.name, race: RACE, guild: this.guild, city: 'crossing' });
        break;
      case 'charalloc':
        this.send({ t: 'enter' });
        break;
      case 'enter':
        this.phase = 'playing';
        log(`[${this.guild}] ${this.name} entered the world`);
        this.appendLog(`=== live sim ${this.name} (${RACE} ${this.guild}) started ${new Date().toISOString()} ===`);
        break;
      case 'room':
        this.onRoom(m);
        break;
      case 'prompt':
        this.onPrompt(m);
        break;
      case 'combat':
        if (/dies|slumps|corpse/i.test(String(m.msg))) this.kills += 1;
        break;
      case 'error':
        if (/Not a valid character/.test(String(m.msg)) && this.phase !== 'playing') {
          this.send({ t: 'charselect', id: 'new' });
        }
        break;
    }
  }

  onRoom(m) {
    this.room = m.roomId;
    this.creatures = [];
    for (const raw of String(m.msg).split('\n')) {
      const c = /^\s*(?:A|An|The)\s+([a-z]+(?: [a-z]+)*?) is here/.exec(stripAnsi(raw).trim());
      if (c) this.creatures.push(c[1]);
    }
    this.exits = m.exits || [];
  }

  onPrompt(m) {
    const plain = stripAnsi(m.msg);
    const hp = /HP:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
    if (hp) { this.hp = Number(hp[1]); this.maxHp = Number(hp[2]); }
    const circle = /Circle\s*(\d+)/.exec(plain);
    if (circle) this.circle = Number(circle[1]);
    this.inCombat = /\[COMBAT\]/.test(plain);
  }

  async tick() {
    if (this.phase !== 'playing' || this.done) return;

    // hurt badly mid-fight -> flee; hurt with no fight -> rest up
    const frac = this.maxHp ? this.hp / this.maxHp : 1;
    if (this.inCombat && frac < 0.3) return this.cmd('flee');
    if (!this.inCombat && frac < 0.6 && !this.creatures.length) return this.cmd('rest');
    if (!this.inCombat && frac < 0.9 && this.resting) return; // keep resting
    this.resting = frac < 0.9 && !this.creatures.length;

    if (this.creatures.length) {
      this.hunts += 1;
      return this.cmd(`attack ${this.creatures[0]}`);
    }

    // nothing here: walk to the nearest room with spawns
    if (this.pathQueue.length) return this.cmd(this.pathQueue.shift());
    if (this.room) {
      const target = nearestSpawnRoom(this.room);
      if (target && target.path.length) this.pathQueue = target.path;
      else if (this.exits.length) this.pathQueue = [this.exits[Math.floor(Math.random() * this.exits.length)]];
    }
  }

  progressLine() {
    const mins = Math.round((Date.now() - this.startedAt) / 60000);
    return `  hunt ${this.hunts}: circle ${this.circle}, hp ${this.hp}/${this.maxHp}, kills ${this.kills}, ticks ${mins}m`;
  }

  finish(reason) {
    if (this.done) return;
    this.done = true;
    this.appendLog(this.progressLine());
    this.appendLog(`=== Results (${GUILDS[this.guild]?.name || this.guild}) ===`);
    this.appendLog(`  ${reason}: reached circle ${this.circle}, ${this.kills} kills in ${Math.round((Date.now() - this.startedAt) / 60000)}m`);
    try { this.ws.close(); } catch {}
    log(`[${this.guild}] finished: ${reason}`);
  }
}

// ---------------- orchestration ----------------
const sims = wanted.map((g) => {
  if (!ALL_GUILDS.includes(g)) { log(`unknown guild "${g}" — skipping (valid: ${ALL_GUILDS.join(', ')})`); return null; }
  return new LiveSim(g);
}).filter(Boolean);

for (const s of sims) {
  await s.httpLogin();
  s.start();
  log(`[${s.guild}] connecting as ${s.name}`);
}

const TICK = setInterval(() => { for (const s of sims) s.tick(); }, 800);
const PROGRESS = setInterval(() => { for (const s of sims) if (s.phase === 'playing') s.appendLog(s.progressLine()); }, 30000);

const endAll = (reason) => {
  clearInterval(TICK); clearInterval(PROGRESS);
  for (const s of sims) s.finish(reason);
  setTimeout(() => process.exit(0), 500);
};
setTimeout(() => endAll(`--minutes ${MINUTES} elapsed`), MINUTES * 60000);
process.on('SIGINT', () => endAll('interrupted'));
process.on('SIGTERM', () => endAll('terminated'));
