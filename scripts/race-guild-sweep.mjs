// Race × guild fidelity sweep: automated characters play through the REAL
// session stack, driven by DR-style scripts (the same engine the browser
// client uses), exercising each guild's signature mechanics.
//
//   node scripts/race-guild-sweep.mjs --guilds warmage,barbarian --minutes 12
//   node scripts/race-guild-sweep.mjs --all            # curated race matrix
//
// Per character:
//   1. Real account + WS chargen entry (WireSession, no bot flag).
//   2. A generated script library saved to the ACCOUNT via scripts_put —
//      hunt.dr / circle.dr / mega.dr for that guild (data/guild-scripts.js).
//   3. The mega script runs via public/js/script-engine.js; a supervisor
//      interlock handles flee/death/stalls OUTSIDE the scripts.
//   4. Fidelity events (spell casts, khri, enchantes, circle-ups...) are
//      parsed from player-facing prose and appended to
//      public/live/fidelity-<guild>.log plus a JSON summary line.
import { mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ARGS = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = ARGS.indexOf('--' + name);
  return i >= 0 ? ARGS[i + 1] : dflt;
};
const MINUTES = Number(flag('minutes', 10));
const CIRCLE_TARGET = Number(flag('circle', 2));
const BOOST = Number(flag('boost', 20)); // agent speed multiplier (0/1 = off)
const PASS = 'SweepRun1!';

const { GUILDS } = await import('../data/guilds.js');
const { ROOMS } = await import('../data/world.js');
const { creatureById } = await import('../data/creatures.js');
const { GUILD_SCRIPTS, RACE_MATRIX } = await import('../data/guild-scripts.js');
const { nounOf, moves, buildHuntScript, buildCircleScript, buildMegaScript, reversePath, trainListFromMissing } = await import('./lib/script-gen.mjs');
const { WireSession, stripAnsi, trackMove } = await import('./lib/wire-session.mjs');
const { createRunner } = await import('../public/js/script-engine.js');

const LIVE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'live');
try { mkdirSync(LIVE_DIR, { recursive: true }); } catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const ALL_GUILDS = Object.keys(GUILDS).filter((g) => GUILD_SCRIPTS[g]);
let wanted = [];
if (ARGS.includes('--all')) {
  wanted = ALL_GUILDS.flatMap((g) => RACE_MATRIX[g].map((race) => ({ guild: g, race })));
} else {
  const guilds = (flag('guilds', 'barbarian') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const races = (flag('races', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const g of guilds) {
    if (!ALL_GUILDS.includes(g)) { log(`unknown guild "${g}" — skipping`); continue; }
    if (races.length) races.forEach((race) => wanted.push({ guild: g, race }));
    else RACE_MATRIX[g]?.forEach((race) => wanted.push({ guild: g, race }));
  }
}

// ---------------- per-character agent ----------------

class SweepAgent {
  constructor({ guild, race }) {
    this.guild = guild;
    this.race = race;
    this.char = ('Sw' + guild[0].toUpperCase() + guild.slice(1).replace(/[^a-zA-Z]/g, '')
      + race[0].toUpperCase() + race.slice(1).replace(/[^a-zA-Z]/g, '')).replace(/[^a-zA-Z]/g, '').slice(0, 16);
    this.user = `sweep_${guild}_${race}`;
    this.scriptBase = guild.slice(0, 6); // e.g. "warmag", "barbar"
    this.session = new WireSession({
      user: this.user, pass: PASS, char: this.char, race, guild,
    });
    this.logPath = join(LIVE_DIR, `fidelity-${guild}-${race}.log`);
    this.fidelity = {};       // check name -> count
    this.kills = 0; this.circles = 0; this.deaths = 0; this.trains = 0;
    this.done = false;
    this.runner = null;
    this.curName = null;
    this.lastSendAt = 0;
    this.lastPromptAt = 0;
    this.lastRoomChangeAt = 0;
    this.lastHallAt = Date.now();
    this.trainList = null;
    this.killsAtVisit = 0;
    this.lastFleeAt = 0;
    this.scriptsSaved = false;
  }

  appendLog(line) { try { appendFileSync(this.logPath, line + '\n'); } catch {} }

  diskAdj() { return (id) => Object.entries(ROOMS[id]?.exits || {}).map(([dir, to]) => ({ dir, to })); }

  nearestSpawnRoom(from) {
    let best = null, bestAny = null;
    const myCircle = this.session.vitals.circle || 1;
    for (const id of Object.keys(ROOMS)) {
      if (!(ROOMS[id].spawns || []).length) continue;
      const p = this.session.bfsPath(from, id, this.diskAdj());
      if (!p) continue;
      if (!bestAny || p.length < bestAny.path.length) bestAny = { id, path: p };
      // Prefer hunting grounds within our weight class: a c1 character sent
      // against c5 spawns dies in RT-locked cycles (live-sim pitfall).
      const tooStrong = ROOMS[id].spawns.some((sid) => {
        const c = creatureById(sid);
        return c && (c.circle || 1) > myCircle + 2;
      });
      if (tooStrong) continue;
      if (!best || p.length < best.path.length) best = { id, path: p };
    }
    return best || bestAny;
  }

  async start() {
    await this.session.httpLogin();
    log(`[${this.guild}/${this.race}] authed as ${this.user} (${this.session.knownChar ? 'existing' : 'new'} char)`);
    this.session.connect({
      onEnter: () => {
        this.appendLog(`=== sweep ${this.char} (${this.race} ${this.guild}) entered ${new Date().toISOString()} ===`);
        if (BOOST > 1) this.session.sendObj({ t: 'boost', mult: BOOST });
        void this.beginPlaying();
      },
      onRoom: (m, changed) => {
        if (changed) this.lastRoomChangeAt = Date.now();
        if (this.runner) this.runner.feed(stripAnsi(m.msg), 'room');
      },
      onPrompt: (_m, plain) => {
        this.lastPromptAt = Date.now();
        this.runner?.feed(plain, true);
        this.supervise();
      },
      onText: (text, type) => this.onText(text, type),
      onError: (msg) => {
        this.appendLog(`[error] ${new Date().toISOString()} ${msg}`);
        // Ghost-session guard: back-to-back runs reuse the char; if the old
        // socket is still winding down server-side, 'enter' is refused. The
        // server's idle-session reaper needs well over 30s to release the
        // character, so retry entry on a longer, repeating backoff until a
        // real room message confirms we're in.
        if (/already active in another session/i.test(String(msg))) {
          const retries = [5, 15, 35, 60];
          for (const delay of retries) {
            setTimeout(() => {
              if (this.done || this.session.vitals.room) return;
              this.appendLog(`[ghost-retry] re-select + enter after ${delay}s`);
              this.session.sendObj({ t: 'token', token: this.session.token });
              setTimeout(() => {
                this.session.sendObj({ t: 'charselect', id: this.session.knownChar?.charId ?? 'new' });
                setTimeout(() => this.session.sendObj({ t: 'enter' }), 1200);
              }, 800);
            }, delay * 1000);
          }
        }
      },
      onFatal: (reason) => this.finish(reason),
      onReconnect: (n) => this.appendLog(`[reconnect] attempt ${n}`),
    });
  }

  // Generate the library from the ACTUAL room we landed in, save to account,
  // then run the mega script.
  async beginPlaying() {
    await sleep(500);
    const s = this.session;
    const room = s.vitals.room;
    const arena = this.nearestSpawnRoom(room);
    if (!arena) { this.finish(`no hunting grounds reachable from ${room}`); return; }
    this.arena = arena.id;
    const bazaarPath = s.bfsPath(room, 'bazaar', this.diskAdj());
    // Reverse the path we actually plan to walk in (bazaar->...->spawn room):
    // live exits can disagree with disk mid-regrid, so derive the return trip
    // from the same edges the outbound leg uses.
    const backFromBazaar = reversePath(bazaarPath);
    const cap = {
      guild: this.guild, race: this.race, char: this.char, scriptBase: this.scriptBase,
      bazaarPath, trainList: null, trainOffset: this.trainOffset || 0,
    };
    const huntSrc = buildHuntScript({
      cap,
      arena: {
        id: arena.id,
        // Return trip = exact reverse of how we get TO the bazaar (walked-in
        // edges are ground truth even when the disk map is mid-regrid).
        fromArmed: reversePath(bazaarPath),
        fromHere: s.bfsPath(room, arena.id, this.diskAdj()),
      },
    });
    const circleSrc = buildCircleScript({
      cap,
      fromArena: {
        hall: s.bfsPath(room === 'bazaar' ? 'bazaar' : arena.id, 'hall_' + this.guild, this.diskAdj()),
        back: s.bfsPath('hall_' + this.guild, arena.id, this.diskAdj()),
      },
    });
    const megaSrc = buildMegaScript(cap);
    this.library = {
      [this.scriptBase + 'hunt']: huntSrc,
      [this.scriptBase + 'circle']: circleSrc,
      [this.scriptBase + 'mega']: megaSrc,
    };
    for (const [name, body] of Object.entries(this.library)) {
      s.sendObj({ t: 'scripts_put', name, body });
      await sleep(250);
    }
    this.appendLog(`library saved: ${Object.keys(this.library).join(', ')} (${huntSrc.split('\n').length} hunt lines)`);
    if (process.env.SWEEP_DUMP) this.appendLog('--- hunt.dr ---\n' + huntSrc);
    log(`[${this.guild}/${this.race}] arena ${ROOMS[arena.id].name} — species: ${[...new Set(ROOMS[arena.id].spawns)].map(nounOf).join(', ')}`);
    await sleep(600);
    this.startCycle(megaSrc, this.scriptBase + 'mega');
  }

  getScript = (name) => {
    // Server copy wins once round-tripped; local otherwise. Mirrors barb-run.
    if (this.serverScripts?.[name] != null) return this.serverScripts[name];
    return this.library?.[name] ?? null;
  };

  startCycle(src, name) {
    this.curName = name;
    if (name.endsWith('mega')) this.lastSendAt = Date.now();
    const s = this.session;
    this.runner = createRunner(src, [], {
      send: async (line) => {
        if (/^(attack|tdptrain|flee|rest|stand|circle|buy|wield|prepare|cast|khri|enchant|backstab|analyze|roar|drink|effects|stealth|hide)/.test(line)) {
          this.appendLog(`script> ${line}`);
          log(`[${this.guild}/${this.race}] > ${line}`);
        } else if (/^(n|s|e|w|ne|nw|se|sw|up|down|d|out)$/.test(line)) {
          this.appendLog(`script> move ${line}`);
        }
        trackMove(s, line);
        this.lastSendAt = Date.now();
        if (/^tdptrain /.test(line)) this.trains += 1;
        void s.cmd(line);
      },
      say: (t) => { if (t && !/^--/.test(t)) this.appendLog(`[echo] ${t}`); },
      getScript: (n) => this.getScript(n),
    });
    this.runner.start();
  }

  onText(text, type) {
    const cfg = GUILD_SCRIPTS[this.guild];
    // fidelity checks
    const allChecks = [...(cfg.fidelityChecks || [])];
    for (const chk of allChecks) {
      if (chk.re.test(text)) {
        this.fidelity[chk.name] = (this.fidelity[chk.name] || 0) + 1;
        if (this.fidelity[chk.name] === 1) {
          log(`[${this.guild}/${this.race}] FIDELITY OK: ${chk.name}`);
          this.appendLog(`[fidelity] ${chk.name}: ${stripAnsi(text).slice(0, 140)}`);
        }
      }
    }
    if (/Rise, /.test(text) && /now a /.test(text)) {
      this.circles += 1;
      this.killsAtVisit = this.kills;
      log(`[${this.guild}/${this.race}] *** CIRCLE-UP -> circle ${this.session.vitals.circle + 1} ***`);
      this.appendLog(`*** CIRCLE-UP -> circle ${this.session.vitals.circle + 1} ***`);
      if (this.session.vitals.circle >= CIRCLE_TARGET) return this.finish('target circle reached');
      // Mega finished its circle leg; restart the whole cycle.
      setTimeout(() => this.restartCycle(), 1500);
      return;
    }
    if (/You awaken in the Temple/.test(text)) {
      this.deaths += 1;
      this.appendLog(`[death] #${this.deaths} at ${new Date().toISOString()}`);
      this.runner?.stop(); this.runner = null;
      setTimeout(() => this.restartCycle(), 3000);
      return;
    }
    if (/dies|slumps|lifeless|stops moving|collapses/.test(text)) this.kills += 1;
    // Observability: movement/combat refusals are the #1 reason agents park
    // silently. Tag them so a fidelity log explains its own stalls.
    if (/^(You cannot go that way|You are overloaded|You must wait|Creatures block your path|You are in the stocks|The cell door is barred|Go where)/.test(stripAnsi(text))) {
      this.refusals = (this.refusals || 0) + 1;
      if (this.refusals <= 200) {
        this.appendLog(`[refuse] ${stripAnsi(text).slice(0, 120)} [room ${this.session.vitals.room}]`);
      }
      // A "cannot go that way" disproves a learned edge — drop it so the
      // graph re-derives from live exits instead of re-baking the same
      // broken path on every regeneration cycle.
      const pm = this.session.pendingMove;
      if (/cannot go that way/.test(stripAnsi(text)) && pm?.from) {
        const list = this.session.observedEdges[pm.from];
        if (list) {
          const i = list.findIndex((e) => e.dir === pm.dir);
          if (i >= 0) list.splice(i, 1);
          this.appendLog(`[graph] dropped disproven edge ${pm.from} --${pm.dir}-->`);
        }
      }
    }
    if (/not yet ready to circle/.test(text)) {
      this.appendLog(`[circle-blocked] ${stripAnsi(text).replace(/\n+/g, ' | ').slice(0, 220)}`);
      // Retarget: parse the exact missing list so the next hall trip trains
      // the blocking skills instead of the generic curriculum.
      const missing = trainListFromMissing(stripAnsi(text), this.guild);
      if (missing.length) {
        this.trainList = missing;
        log(`[${this.guild}/${this.race}] retargeting curriculum: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` +${missing.length - 6}` : ''}`);
      }
    }
    // Feed the runner (matches/waitfor react to prose)
    if (this.runner) this.runner.feed(text, type);
  }

  restartCycle() {
    if (this.done || !this.library) return;
    this.runner?.stop();
    // Dead-end escape: if flagged, walk to the bazaar hub first, then re-path
    // everything from there (the hub connects to every town road).
    if (this.escapePath?.length && this.session.vitals.room !== 'bazaar') {
      const steps = this.escapePath;
      this.escapePath = null;
      const s = this.session;
      this.runner = createRunner(steps.map((d) => 'move ' + d).join('\n') + '\nput look\nwait', [], {
        send: async (line) => { trackMove(s, line); void s.cmd(line); },
        say: () => {},
      });
      this.runner.start();
      return;
    }
    this.regenerateFromHere();
    this.startCycle(this.library[this.scriptBase + 'mega'], this.scriptBase + 'mega');
  }

  // Rebuild baked paths from wherever the character actually stands.
  regenerateFromHere() {
    const s = this.session;
    const room = s.vitals.room;
    if (!room || !ROOMS[room]) return;
    let arena = this.nearestSpawnRoom(room);
    // Town-strand guard: shops, halls, and other interior rooms have no
    // spawns and thin exits — pathing "regenerates" fine but the hunt just
    // walks back into the same dead end (the cleric-dies-in-a-shop bug).
    // If we're parked in an interior room, escape to the bazaar hub first
    // and re-derive everything from there next tick.
    const r = ROOMS[room];
    const exitCount = Object.keys(r.exits || {}).length;
    const interior = !r.spawns?.length && exitCount <= 1;
    if (!arena || interior) {
      if (!arena) this.appendLog(`[regen] no arena reachable from ${room}`);
      else this.appendLog(`[regen] stranded in interior room ${room} (${arena.id} is ${arena.path.length} steps away) — bazaar escape`);
      const toBazaar = s.bfsPath(room, 'bazaar', this.diskAdj());
      if (toBazaar?.length) {
        this.escapePath = toBazaar.map((e) => e.dir);
        return; // walk out now; regenerateFromHere runs again on arrival
      }
      if (!arena) return;
      // Couldn't reach bazaar either — at least try the distant arena.
    }
    this.arena = arena.id;
    const cap = { guild: this.guild, race: this.race, char: this.char, scriptBase: this.scriptBase, bazaarPath: null, trainList: this.trainList, trainOffset: this.trainOffset || 0 };
    this.library[this.scriptBase + 'hunt'] = buildHuntScript({
      cap,
      arena: {
        id: arena.id,
        fromArmed: [],
        fromHere: s.bfsPath(room, arena.id, this.diskAdj()),
      },
    });
    this.library[this.scriptBase + 'circle'] = buildCircleScript({
      cap,
      fromArena: {
        hall: s.bfsPath(arena.id, 'hall_' + this.guild, this.diskAdj()),
        back: s.bfsPath('hall_' + this.guild, arena.id, this.diskAdj()),
      },
    });
    for (const [name, body] of Object.entries(this.library)) {
      s.sendObj({ t: 'scripts_put', name, body });
    }
  }

  supervise() {
    if (this.done) return;
    const v = this.session.vitals;
    // Fresh characters (circle 1) flee earlier: a single death early in a run
    // costs gear + TDP pool and spirals into the D grades seen in grading.
    const fleeAt = (v.circle || 1) <= 1 ? 0.45 : 0.28;
    if (v.maxhp && v.inCombat && v.hp / v.maxhp < fleeAt && Date.now() - this.lastFleeAt > 6000) {
      this.lastFleeAt = Date.now();
      this.appendLog(`[interlock] HP ${v.hp}/${v.maxhp} — fleeing`);
      void this.session.cmd('flee');
      return;
    }
    // Rest interlock (supervisor-side, like live-sim): the generated hunt
    // script gates resting on an ABSOLUTE hp literal (< 40 ≈ 28% of a c1
    // bar), so a hurt agent can hover just above it forever — fleeing every
    // fight, never healing, never winning. Rest out-of-combat below 55%,
    // stand above 90%.
    if (!v.maxhp || v.inCombat) return;
    const frac = v.hp / v.maxhp;
    const now = Date.now();
    if (!v.restingFlag && frac < 0.55 && now - (this.lastRestCmdAt || 0) > 4000) {
      this.lastRestCmdAt = now;
      if (!this.restAnnounced) {
        this.restAnnounced = true;
        this.appendLog(`[interlock] HP ${v.hp}/${v.maxhp} — resting until 90%`);
      }
      void this.session.cmd('rest');
    } else if (v.restingFlag && frac >= 0.9) {
      this.restAnnounced = false;
      void this.session.cmd('stand');
    }
  }

  heartbeat() {
    if (this.done) return;
    try { this.runner?.feed('', false); } catch {}
    this.session.injectState(this.runner);
    if (!this.runner || !this.runner.running) {
      if (Date.now() - this.lastSendAt > 4000 && this.library) {
        this.startCycle(this.library[this.scriptBase + 'mega'], this.scriptBase + 'mega');
      }
      return;
    }
    // Hall-trip alternation: while hunting, every 4 kills or 4 minutes run
    // the circle script once (guild hall trip: circle attempt + TDP spend).
    const v2 = this.session.vitals;
    // Standing in our own guild hall? Circle + TDP-spend right here.
    if (this.library && v2.room === 'hall_' + this.guild && this.curName !== this.scriptBase + 'circle') {
      this.appendLog('[hall] already at the guild hall — circling');
      this.startCycle(this.library[this.scriptBase + 'circle'], this.scriptBase + 'circle');
      return;
    }
    const huntingLeg = this.curName === this.scriptBase + 'mega';
    if (huntingLeg && !v2.inCombat && this.kills > this.killsAtVisit
      && (this.kills - this.killsAtVisit >= 4 || Date.now() - this.lastHallAt > 240000)) {
      log(`[${this.guild}/${this.race}] hall trip (${this.kills - this.killsAtVisit} kills since last visit)`);
      this.appendLog(`[hall-trip] ${this.kills - this.killsAtVisit} kills since last visit`);
      this.killsAtVisit = this.kills;
      this.regenerateFromHere();
      this.startCycle(this.library[this.scriptBase + 'circle'], this.scriptBase + 'circle');
      return;
    }
    // Parked too long: regenerate paths from the current room. If we keep
      // regenerating into the same stuck state (dead-end geography), walk to
      // the bazaar hub instead — every town road connects there eventually.
      if (this.session.vitals.room && Date.now() - this.lastRoomChangeAt > 90000
        && !this.session.vitals.inCombat) {
      const st = this.runner?.state || {};
      this.appendLog(`[watchdog] parked 90s — regenerating cycle from here [room ${this.session.vitals.room} script ${this.curName} mode ${st.mode}/${st.pc} hp ${this.session.vitals.hp}/${this.session.vitals.maxhp} refusals ${this.refusals || 0}]`);
      this.lastRoomChangeAt = Date.now();
      this.stuckCount = (this.stuckCount || 0) + 1;
      if (this.stuckCount >= 2 && this.session.vitals.room !== 'bazaar') {
        // Escape hatch: head for the bazaar hub and re-path from there.
        const s2 = this.session;
        let toBazaar = s2.bfsPath(this.session.vitals.room, 'bazaar', this.diskAdj());
        if (!toBazaar?.length) {
          // Disk BFS failed (mid-regrid): explore instead — cycle through the
          // current room's LIVE exits to discover real edges for the graph.
          const live = Object.keys(s2.liveExits[this.session.vitals.room] || {})
            .map((i) => s2.liveExits[this.session.vitals.room][i].dir);
          const dirs = live.length ? live : ['n', 's', 'e', 'w'];
          const dir = dirs[(this.stuckCount - 2) % dirs.length];
          this.appendLog(`[watchdog] no path to hub — exploring '${dir}'`);
          this.escapePath = [dir];
        } else {
          this.appendLog(`[watchdog] dead-end escape — walking to bazaar (${toBazaar.length} steps)`);
          this.escapePath = toBazaar.map((e) => e.dir);
        }
      }
      this.restartCycle();
      return;
    }
    if (Date.now() - this.lastSendAt > 90000) {
      this.appendLog('[watchdog] stalled 90s — restarting cycle');
      this.restartCycle();
    }
  }

  progressLine() {
    const v = this.session.vitals;
    const mins = Math.round((Date.now() - this.startedAt) / 60000);
    return `[progress] ${mins}m circle ${v.circle} hp ${v.hp}/${v.maxhp} kills ${this.kills} circles ${this.circles} trains ${this.trains} deaths ${this.deaths} boost x${BOOST} fidelity:${JSON.stringify(this.fidelity)} [room ${v.room}]`;
  }

  async finish(reason) {
    if (this.done) return;
    this.done = true;
    this.runner?.stop();
    this.session.close();
    this.appendLog(this.progressLine());
    this.appendLog(`=== Results (${GUILDS[this.guild]?.name}) ===`);
    this.appendLog(`  ${reason}: circle ${this.session.vitals.circle}, ${this.circles} circle-ups, ${this.kills} kills, ${this.deaths} deaths`);
    const checksPassed = Object.keys(this.fidelity).length;
    const checksTotal = (GUILD_SCRIPTS[this.guild].fidelityChecks || []).length;
    // Script success grade: circles are the primary metric, fidelity and
    // deaths secondary. A = circled + healthy; B = circled; C = solid effort
    // (kills + no deaths); D = struggled.
    let grade;
    if (this.circles >= 2 && this.deaths === 0) grade = 'A';
    else if (this.circles >= 2) grade = 'B';
    else if (this.circles >= 1 || (this.kills >= 10 && this.deaths === 0)) grade = 'C';
    else if (this.kills >= 5 && this.deaths <= 1) grade = 'D+';
    else grade = 'D';
    const summary = {
      ts: new Date().toISOString(), guild: this.guild, race: this.race, char: this.char,
      reason, circle: this.session.vitals.circle, circles: this.circles,
      kills: this.kills, deaths: this.deaths, trains: this.trains,
      refusals: this.refusals || 0,
      fidelity: this.fidelity, fidelityScore: `${checksPassed}/${checksTotal}`,
      grade,
    };
    try { appendFileSync(join(LIVE_DIR, 'fidelity-summary.jsonl'), JSON.stringify(summary) + '\n'); } catch {}
    log(`[${this.guild}/${this.race}] FINISHED (${reason}): circle ${summary.circle}, fidelity ${summary.fidelityScore}`, JSON.stringify(summary.fidelity));
    await this.appendHistory(summary);
  }

  // Run-end history snapshot for the Sims page trending charts: appends
  // {ts, char, circle, topSkills[]} to public/live/sims-history.jsonl so
  // skill-rank deltas between runs can be charted over time. Reads the GM
  // token from the world's published token file (same host); skips
  // silently when unavailable — history is best-effort, never fatal.
  async appendHistory(summary) {
    try {
      const { readFile } = await import('node:fs/promises');
      const port = Number(process.env.DR_PORT || process.env.PORT || 3000);
      let token = null;
      try {
        token = JSON.parse(await readFile(`/tmp/dr-world-token-${port}.json`, 'utf8')).token;
      } catch {}
      if (!token) return;
      const r = await fetch(`http://127.0.0.1:${port}/api/gm/player/${encodeURIComponent(this.char)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((x) => x.json());
      if (!r?.ok) return;
      const skills = Object.entries(r.skills || {});
      const ranked = skills.filter(([, s]) => s.rank > 0)
        .sort((a, b) => b[1].rank - a[1].rank);
      const row = {
        ts: summary.ts, char: this.char, guild: this.guild, race: this.race,
        circle: summary.circle, kills: summary.kills, trains: summary.trains,
        totalRanks: ranked.reduce((n, [, s]) => n + s.rank, 0),
        topSkills: Object.fromEntries(ranked.slice(0, 12)),
      };
      appendFileSync(join(LIVE_DIR, 'sims-history.jsonl'), JSON.stringify(row) + '\n');
      log(`[${this.guild}/${this.race}] history: ${ranked.length} trained skills, ${row.totalRanks} total ranks`);
    } catch (e) {
      log(`[${this.guild}/${this.race}] history snapshot skipped: ${e.message}`);
    }
  }

  run(minutes) {
    this.startedAt = Date.now();
    const PROGRESS = setInterval(() => { if (!this.done) this.appendLog(this.progressLine()); }, 30000);
    const HB = setInterval(() => this.heartbeat(), 1000);
    setTimeout(() => { clearInterval(PROGRESS); clearInterval(HB); this.finish(`--minutes ${minutes} elapsed`); }, minutes * 60000);
  }
}


// --report: render fidelity-summary.jsonl as a guild x race results table.
function report() {
  const file = join(LIVE_DIR, 'fidelity-summary.jsonl');
  let rows = [];
  try {
    rows = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { console.log('no summary yet:', file); return; }
  // Latest entry per (guild, race)
  const latest = new Map();
  for (const r of rows) latest.set(r.guild + '|' + r.race, r);
  const byGuild = new Map();
  for (const r of latest.values()) {
    if (!byGuild.has(r.guild)) byGuild.set(r.guild, []);
    byGuild.get(r.guild).push(r);
  }
  console.log('\n=== Fidelity sweep results (latest run per guild/race) ===');
  console.log(pad('guild', 13) + pad('race', 10) + pad('grade', 6) + pad('circle', 7)
    + pad('kills', 6) + pad('deaths', 7) + pad('fidelity', 10) + 'checks');
  for (const [guild, rs] of [...byGuild.entries()].sort()) {
    for (const r of rs.sort((a, b) => a.race.localeCompare(b.race))) {
      console.log(pad(guild, 13) + pad(r.race, 10) + pad(r.grade || '-', 6)
        + pad(String(r.circle), 7) + pad(String(r.kills), 6) + pad(String(r.deaths), 7)
        + pad(r.fidelityScore, 10) + Object.keys(r.fidelity || {}).join(','));
    }
  }
  const circles = [...latest.values()].reduce((s, r) => s + r.circles, 0);
  console.log(`\n${latest.size} combos, ${circles} total circle-ups`);
}
function pad(s, n) { return String(s).padEnd(n); }

// ---------------- orchestration ----------------

if (ARGS.includes('--report')) { report(); process.exit(0); }

const agents = wanted.map((w) => new SweepAgent(w));
log(`sweep: ${agents.length} agents over ${new Set(wanted.map((w) => w.guild)).size} guilds, ${MINUTES}m each`);

for (const a of agents) {
  try { await a.start(); a.run(MINUTES); }
  catch (e) { log(`[${a.guild}/${a.race}] failed to start: ${e.message}`); a.finish('start-failed'); }
}

process.on('uncaughtException', (e) => {
  log(`uncaught: ${e.code || e.message} — finishing agents gracefully`);
  for (const a of agents) if (!a.done) { a.session.close(); a.finish(`error: ${e.code || e.message}`); }
});
process.on('SIGINT', () => { for (const a of agents) a.finish('interrupted'); process.exit(0); });
process.on('SIGTERM', () => { for (const a of agents) a.finish('terminated'); process.exit(0); });
