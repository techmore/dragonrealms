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
    this.mode = 'hunt';          // hunt | goHall | hallwait | training
    this.modeAt = Date.now();
    this.trainQueue = [];        // [{skill, need, have}]
    this.killsAtVisit = 0;
    this.circles = 0;
    this.armed = false;
    this.armStage = null;        // null | 'go' | 'buy'
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
        this.setMode('armUp'); // every adventurer arms up first
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
      case 'msg':
      case 'notice':
        this.onText(stripAnsi(String(m.msg || '')));
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
    const rt = /RT:\s*(\d+)/.exec(plain);
    this.rt = rt ? Number(rt[1]) : 0;
    this.inCombat = /\[COMBAT\]/.test(plain);
    this.restingFlag = /\[Resting\]/.test(plain);
  }

  // Guild/leveling validation: parse circle attempts, missing-skill lists,
  // and TDP exhaustion straight from the player-facing prose.
  onText(text) {
    if (this.phase !== 'playing') return;
    if (this.mode === 'armUp') {
      if (/You buy|you purchas/i.test(text)) {
        this.cmd('wield club');
        this.armed = true;
        log(`[${this.guild}] bought and wielded a club`);
        this.setMode('hunt');
        return;
      }
      if (/no shopkeeper|do not have|out of stock/i.test(text)) {
        this.armed = true;
        this.setMode('hunt');
        return;
      }
    }
    if (/Rise, /.test(text) && /now a /.test(text)) {
      this.circles += 1;
      this.appendLog(`*** CIRCLE-UP OK -> circle ${this.circle + 1} (guild/leveling path works) ***`);
      log(`[${this.guild}] ${this.name} CIRCLED UP -> circle ${this.circle + 1}`);
      this.setMode('hunt');
      this.killsAtVisit = this.kills;
      return;
    }
    if (/not yet ready to circle/.test(text)) {
      const re = /([a-z0-9' ]+?)\s+at least rank (\d+)\s+\(you have (\d+)\)/g;
      let m2; const list = [];
      while ((m2 = re.exec(text))) list.push({ skill: m2[1].trim(), need: +m2[2], have: +m2[3] });
      if (list.length) {
        list.sort((a, b) => (b.need - b.have) - (a.need - a.have));
        this.trainQueue = list;
        this.setMode('training');
        log(`[${this.guild}] circle blocked: ${list.map((x) => `${x.skill} ${x.have}/${x.need}`).join(', ')}`);
      }
      return;
    }
    if (this.mode === 'training' && /costs \d+ TDPs; you have \d+\./.test(text)) {
      // Out of TDPs for the front skill — drop it; empty queue means hunt more.
      this.trainQueue.shift();
      if (!this.trainQueue.length) { this.setMode('hunt'); this.killsAtVisit = this.kills; }
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.modeAt = Date.now();
  }

  async tick() {
    if (this.phase !== 'playing' || this.done) return;

    // survival always wins
    const frac = this.maxHp ? this.hp / this.maxHp : 1;
    if (this.inCombat && frac < 0.3) return this.cmd('flee');

    // Rest when hurt — issue 'rest' ONCE, then let the [Resting] prompt flag
    // carry it (spamming rest just floods "You are already resting.").
    if (this.resting) {
      if (frac >= 0.75 || this.creatures.length || Date.now() - this.restSince > 30000) {
        this.resting = false;
        if (this.restingFlag) this.cmd('stand');
      } else return;
    }
    if (!this.inCombat && frac < 0.5 && !this.creatures.length && !this.restingFlag
        && Date.now() - (this.restSince || 0) > 5000) {
      this.resting = true;
      this.restSince = Date.now();
      return this.cmd('rest');
    }

    // fight whatever is here, whatever we were doing
    if (this.creatures.length) {
      if (this.rt > 0) return; // roundtime — wait it out like a player would
      this.hunts += 1;
      return this.cmd(`attack ${this.creatures[0]}`);
    }

    // a stuck non-hunt mode self-heals after 30s
    if (this.mode !== 'hunt' && Date.now() - this.modeAt > 30000) this.setMode('hunt');

    if (this.mode === 'armUp') {
      if (!this.pathQueue.length && !this.armStage) {
        if (!this.room) return;
        const p = bfsPath(this.room, 'bazaar');
        if (!p) { this.armed = true; return this.setMode('hunt'); }
        this.pathQueue = p;
      }
      if (this.pathQueue.length) return this.cmd(this.pathQueue.shift());
      if (this.room === 'bazaar' && !this.armStage) {
        this.armStage = 'buy';
        return this.cmd('buy club');
      }
      return this.setMode('hunt');
    }

    if (this.mode === 'goHall') {
      if (this.pathQueue.length) return this.cmd(this.pathQueue.shift());
      if (this.room === 'hall_' + this.guild) {
        this.setMode('hallwait');
        return this.cmd('circle');
      }
      return this.setMode('hunt'); // lost the path — resume hunting
    }

    if (this.mode === 'hallwait') return; // circle response inbound

    if (this.mode === 'training') {
      if (this.room !== 'hall_' + this.guild) return this.setMode('goHall');
      const q = this.trainQueue[0];
      if (!q) {
        this.setMode('hallwait');
        return this.cmd('circle'); // requirements may be met now
      }
      return this.cmd(`tdptrain ${q.skill}`);
    }

    // hunt mode: walk spawn routes; every few kills, visit the hall to
    // circle and spend TDPs — the full player progression loop.
    if (this.kills - this.killsAtVisit >= 6 || Date.now() - this.modeAt > 90000) {
      const hall = 'hall_' + this.guild;
      const path = bfsPath(this.room, hall);
      if (path) {
        log(`[${this.guild}] heading to guild hall to circle`);
        this.pathQueue = path;
        return this.setMode('goHall');
      }
    }
    if (this.pathQueue.length) return this.cmd(this.pathQueue.shift());
    if (this.room) {
      const target = nearestSpawnRoom(this.room);
      if (target && target.path.length) this.pathQueue = target.path;
      else if (this.exits.length) this.pathQueue = [this.exits[Math.floor(Math.random() * this.exits.length)]];
    }
  }

  progressLine() {
    const mins = Math.round((Date.now() - this.startedAt) / 60000);
    return `  hunt ${this.hunts}: circle ${this.circle}, hp ${this.hp}/${this.maxHp}, kills ${this.kills}, circles ${this.circles}, ticks ${mins}m`;
  }

  finish(reason) {
    if (this.done) return;
    this.done = true;
    this.appendLog(this.progressLine());
    this.appendLog(`=== Results (${GUILDS[this.guild]?.name || this.guild}) ===`);
    this.appendLog(`  ${reason}: reached circle ${this.circle} after ${this.circles} circle-ups, ${this.kills} kills in ${Math.round((Date.now() - this.startedAt) / 60000)}m`);
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
