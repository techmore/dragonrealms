// Shared wire-level session for live test agents (extracted from
// scripts/barb-run.mjs). Registers/logs in over HTTP, opens a WebSocket like
// the web client, walks chargen, and exposes the message stream to a caller
// via callbacks. No ?bot=1: these characters are ordinary players on every
// status surface.
//
//   const s = new WireSession({ user, pass, char, race, guild });
//   await s.connect({
//     onRoom(m), onPrompt(m, vitals), onText(text, type), onError(msg),
//   });
//   s.cmd('attack rat');            // rate-limited send
//   s.sendObj({ t:'scripts_put', ... });
//   s.vitals                        // {hp,maxhp,circle,rt,inCombat,room}
import WebSocket from 'ws';

const BASE = 'http://localhost:3000';
const ORIGIN = 'ws://localhost:3000/ws';
const DIR_SHORT = {
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  up: 'up', down: 'd', out: 'out',
};

export const stripAnsi = (s) => String(s ?? '').replace(/\x1b\[\d+m/g, '');

export class WireSession {
  constructor({ user, pass, char, race = 'human', guild = 'barbarian' }) {
    this.user = user;
    this.pass = pass;
    this.char = char;
    this.race = race;
    this.guild = guild;
    this.ws = null;
    this.token = null;
    this.knownChar = null; // {charId} when the character already exists
    this.reconnects = 0;
    this.lastCmdAt = 0;
    // live vitals, updated from prompts + rest msgs
    this.vitals = {
      room: null, hp: 0, maxhp: 0, mana: 0, maxmana: 0,
      circle: 1, rt: 0, inCombat: false, restingFlag: false,
    };
    this.done = false;
    // navigation learning: observed transitions beat exit lists beat disk data
    this.observedEdges = {};  // roomId -> [{dir,to}]
    this.liveExits = {};      // roomId -> [{dir,to}]
    this.pendingMove = null;  // {from, dir}
  }

  async httpLogin() {
    let r = await fetch(`${BASE}/api/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: this.user, pass: this.pass }),
    }).then((x) => x.json());
    if (!r.ok) r = await fetch(`${BASE}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: this.user, pass: this.pass }),
    }).then((x) => x.json());
    if (!r.ok) throw new Error(`account setup failed: ${r.error}`);
    this.token = r.token;
    this.knownChar = (r.characters || []).find((c) => c.name === this.char) || null;
    return r;
  }

  sendObj(obj) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj)); }

  // Server allows 20 cmds/sec; stay well under it.
  async cmd(line) {
    const wait = 150 - (Date.now() - this.lastCmdAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCmdAt = Date.now();
    this.sendObj({ t: 'input', line });
  }

  connect(handlers) {
    this.handlers = handlers || {};
    this.ws = new WebSocket(ORIGIN);
    this.ws.onmessage = async (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      await this.onMessage(m);
    };
    this.ws.onclose = () => {
      if (this.done) return;
      if (++this.reconnects > 5) return this.handlers.onFatal?.('disconnected (no reconnection left)');
      this.handlers.onReconnect?.(this.reconnects);
      setTimeout(() => this.connect(handlers), 2500);
    };
  }

  close() {
    this.done = true;
    try { this.ws.close(); } catch {}
  }

  noteLiveExits(roomId, exits) {
    if (!roomId || !Array.isArray(exits)) return;
    const adj = [];
    for (const dirWord of exits) {
      const dir = DIR_SHORT[dirWord] || dirWord;
      adj.push({ dir, to: `?${dirWord}` }); // destination resolved lazily by adjacencyFor
    }
    this.liveExits[roomId] = adj;
  }

  adjacencyFor(roomId, diskAdj) {
    // 1. Walked transitions are ground truth.
    if (this.observedEdges[roomId]) return this.observedEdges[roomId];
    const live = this.liveExits[roomId];
    if (!live) return diskAdj?.(roomId) || [];
    const out = [];
    for (const e of live) {
      if (!e.to.startsWith('?')) { out.push(e); continue; }
      const stat = (diskAdj?.(roomId) || []).find((s) => s.dir === e.dir);
      if (stat) out.push(stat);
    }
    return out.length ? out : (diskAdj?.(roomId) || []);
  }

  bfsPath(from, to, diskAdj) {
    if (from === to) return [];
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const curRoom = q.shift();
      for (const edge of this.adjacencyFor(curRoom, diskAdj)) {
        if (edge.to.startsWith('?')) continue;
        if (prev.has(edge.to)) continue;
        prev.set(edge.to, { via: curRoom, dir: edge.dir });
        if (edge.to === to) {
          const path = [];
          let at = to;
          while (prev.get(at)) { path.unshift(prev.get(at)); at = prev.get(at).via; }
          return path;
        }
        q.push(edge.to);
      }
    }
    return null;
  }

  async onMessage(m) {
    const v = this.vitals;
    switch (m.t) {
      case 'login_prompt': this.sendObj({ t: 'token', token: this.token }); break;
      case 'charselect':
        this.sendObj({ t: 'charselect', id: this.knownChar ? this.knownChar.charId : 'new' });
        break;
      case 'charcreate':
        this.sendObj({ t: 'charcreate', name: this.char, race: this.race, guild: this.guild, city: 'crossing' });
        break;
      case 'charalloc': this.sendObj({ t: 'enter' }); break;
      case 'enter': this.handlers.onEnter?.(); break;
      case 'room': {
        if (this.pendingMove) {
          const { from, dir } = this.pendingMove;
          this.pendingMove = null;
          if (from && m.roomId && from !== m.roomId) {
            const list = (this.observedEdges[from] ||= []);
            const hit = list.find((e) => e.dir === dir);
            if (hit) hit.to = m.roomId; else list.push({ dir, to: m.roomId });
          }
        }
        const changed = v.room !== m.roomId;
        v.room = m.roomId;
        this.noteLiveExits(m.roomId, m.exits);
        this.handlers.onRoom?.(m, changed);
        break;
      }
      case 'prompt': {
        const plain = stripAnsi(m.msg);
        const hp = /HP:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
        if (hp) { v.hp = Number(hp[1]); v.maxhp = Number(hp[2]); }
        const mana = /Mana:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
        if (mana) { v.mana = Number(mana[1]); v.maxmana = Number(mana[2]); }
        const c = /Circle\s*(\d+)/.exec(plain);
        if (c) v.circle = Number(c[1]);
        const rt = /RT:\s*(\d+)/.exec(plain);
        v.rt = rt ? Number(rt[1]) : 0;
        v.inCombat = /\[COMBAT\]/.test(plain);
        v.restingFlag = /\[Resting\]/.test(plain);
        // Bleeding wounds: scripts can check vitals.bleeding (array of
        // "part (severity)") and react with `tend` between swings.
        const bleed = /\[bleeding: ([^\]]+)\]/.exec(plain);
        v.bleeding = bleed ? bleed[1].split(', ').map((s) => s.trim()) : [];
        this.handlers.onPrompt?.(m, plain);
        break;
      }
      case 'msg': case 'combat': case 'notice': {
        const text = stripAnsi(m.msg);
        // rest ticks carry vitals outside prompts
        const restHp = /hp (\d+)\/(\d+)/i.exec(text);
        if (restHp) { v.hp = Number(restHp[1]); v.maxhp = Number(restHp[2]); }
        this.handlers.onText?.(text, m.t);
        break;
      }
      case 'scripts': this.handlers.onScripts?.(m); break;
      case 'error':
        this.handlers.onError?.(stripAnsi(m.msg));
        if (/not a valid character|no such character/i.test(String(m.msg))) {
          this.sendObj({ t: 'charselect', id: 'new' });
        }
        break;
      default:
        this.handlers.onOther?.(m);
    }
  }

  // Feed the latest known vitals into a script runner as a prompt-shaped line,
  // so %hp/%mana/%rt/%combat stay fresh while resting (prompts only arrive
  // per-command server-side).
  injectState(runner) {
    if (!runner?.running || !this.vitals.maxhp) return;
    const v = this.vitals;
    runner.feed(`HP: ${v.hp}/${v.maxhp}  Mana: ${v.mana}/${v.maxmana}  RT: ${v.rt}  Circle ${v.circle}${v.inCombat ? ' [COMBAT]' : ''}`, true);
  }
}

// Track a move command issued by an agent/script so the next room event
// records a ground-truth edge.
export function trackMove(session, line) {
  if (/^(n|s|e|w|ne|nw|se|sw|up|down|d|out)$/.test(line)) {
    session.pendingMove = { from: session.vitals.room, dir: line };
  }
}
