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
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openSweepsDb, insertSweep } from './lib/sweeps-db.mjs';
import { classifyStall, verdictLabel } from './lib/stall-detect.mjs';

const ARGS = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = ARGS.indexOf('--' + name);
  return i >= 0 ? ARGS[i + 1] : dflt;
};
// Run length: default depends on mode (10m ad-hoc/sweep, 20m per benchmark
// variant) — resolved after plan parsing below.
let MINUTES = Number(flag('minutes', NaN));
// Leveling-lab target: benchmark mode defaults to the full 1->10 climb;
// ad-hoc sweeps keep the historical 2-circle target. Resolved after mode
// parsing below so `--circle` still overrides either.
let CIRCLE_TARGET = Number(flag('circle', NaN));
const BOOST = Number(flag('boost', 20)); // agent speed multiplier (0/1 = off)
const PASS = 'SweepRun1!';
// Per-invocation run id: 4 random lowercase letters appended to every
// character name AND to the account username so concurrent sweeps never
// collide ("already active in another session"). Constraints:
//   - char names: server/player.js validName = 2-20 chars, letters/'/- only,
//     so the suffix is letters and base is sliced to 15 (+1 hyphen +4 = 20).
//   - usernames: server/auth.js = 3-24 chars after normalizeName.
// A unique account per run also avoids the MAX_CHARS=5 slot cap filling up
// across repeated runs (server/player.js).
const RUN_ID = Array.from(randomBytes(4), (b) => String.fromCharCode(97 + (b % 26))).join('');

const { GUILDS } = await import('../data/guilds.js');
const { ROOMS } = await import('../data/world.js');
const { creatureById } = await import('../data/creatures.js');
const { GUILD_SCRIPTS, RACE_MATRIX } = await import('../data/guild-scripts.js');
const { nounOf, moves, buildHuntScript, buildCircleScript, buildMegaScript, reversePath, trainListFromMissing } = await import('./lib/script-gen.mjs');
const { WireSession, stripAnsi, trackMove, trackRefusedMove } = await import('./lib/wire-session.mjs');
const { createRunner } = await import('../public/js/script-engine.js');

const LIVE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'live');
try { mkdirSync(LIVE_DIR, { recursive: true }); } catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const ALL_GUILDS = Object.keys(GUILDS).filter((g) => GUILD_SCRIPTS[g]);

// ---------------- benchmark variant matrix ----------------
// A variant is a named param set over the generated script library + the
// supervisor interlocks. The SweepAgent applies it at script-build time and
// in supervise(); benchmark mode times each variant to CIRCLE_TARGET.
//   restPct   — supervisor rest interlock floor (% of maxhp; stand at 90%)
//   hallEvery — kills between forced guild-hall trips while hunting
//   arenaBand — allowed creature-circle spread above the agent's circle
//                 for nearestSpawnRoom (+2 = default weight-class filter)
const VARIANTS = {
  baseline: { restPct: 35, hallEvery: 4, arenaBand: 2 },
  rest50:   { restPct: 50, hallEvery: 4, arenaBand: 2 },
  hall8:    { restPct: 35, hallEvery: 8, arenaBand: 2 },
  wide2:    { restPct: 35, hallEvery: 6, arenaBand: 4 },
};
let wanted = [];            // [{guild, race, variant?}]
let MODE = 'sweep';         // 'sweep' | 'benchmark' | 'spawn'
const BENCH_GUILD = flag('benchmark', null);
const SPAWN_SPEC = flag('spawn', null);

if (ARGS.includes('--all')) {
  wanted = ALL_GUILDS.flatMap((g) => RACE_MATRIX[g].map((race) => ({ guild: g, race })));
} else if (BENCH_GUILD) {
  // Benchmark: curated matrix for ONE guild, run strictly sequentially (one
  // live agent at a time) to avoid spawn contention skewing the timings.
  const g = BENCH_GUILD;
  if (!ALL_GUILDS.includes(g)) { console.error(`unknown guild "${g}" — have: ${ALL_GUILDS.join(', ')}`); process.exit(1); }
  if (!Number.isFinite(MINUTES)) MINUTES = 20;
  const races = RACE_MATRIX[g]?.length ? RACE_MATRIX[g] : ['human'];
  // --variants v1,v2 subsets the matrix; default runs every defined variant.
  const names = (flag('variants', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const pick = names.length ? names : Object.keys(VARIANTS);
  for (const vn of pick) {
    if (!VARIANTS[vn]) { console.error(`unknown variant "${vn}" — have: ${Object.keys(VARIANTS).join(', ')}`); process.exit(1); }
  }
  wanted = races.flatMap((race) => pick.map((vn) => ({ guild: g, race, variant: { name: vn, ...VARIANTS[vn] } })));
  MODE = 'benchmark';
  if (!Number.isFinite(CIRCLE_TARGET)) CIRCLE_TARGET = 10; // leveling lab: full climb
  if (!Number.isFinite(MINUTES)) MINUTES = 20;
  log(`benchmark mode: ${g} × [${pick.join(', ')}] × ${races.join(',')} → ${wanted.length} sequential runs, ${MINUTES}m cap each, target circle ${CIRCLE_TARGET}, boost x${BOOST}`);
} else if (SPAWN_SPEC) {
  // Spawn-a-run: exactly one agent with current defaults — no flag archaeology.
  const [g, race = 'human'] = SPAWN_SPEC.split(',').map((s) => s.trim());
  if (!ALL_GUILDS.includes(g)) { console.error(`unknown guild "${g}" — have: ${ALL_GUILDS.join(', ')}`); process.exit(1); }
  if (!Number.isFinite(MINUTES)) MINUTES = 10;
  if (!Number.isFinite(CIRCLE_TARGET)) CIRCLE_TARGET = 2;
  wanted = [{ guild: g, race }];
  MODE = 'spawn';
} else {
  const guilds = (flag('guilds', 'barbarian') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const races = (flag('races', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const g of guilds) {
    if (!ALL_GUILDS.includes(g)) { log(`unknown guild "${g}" — skipping`); continue; }
    if (races.length) races.forEach((race) => wanted.push({ guild: g, race }));
    else RACE_MATRIX[g]?.forEach((race) => wanted.push({ guild: g, race }));
  }
}
if (!Number.isFinite(MINUTES) || MINUTES <= 0) MINUTES = 10;
if (!Number.isFinite(CIRCLE_TARGET)) CIRCLE_TARGET = 2;

// ---------------- per-character agent ----------------

class SweepAgent {
  constructor({ guild, race, variant = null }) {
    this.guild = guild;
    this.race = race;
    // Benchmark variant: named param set applied to generated scripts +
    // supervisor interlocks (see VARIANTS). Null for normal sweeps.
    this.variant = variant;
    this.variantName = variant?.name || null;
    this.restPct = Math.min(Math.max(variant?.restPct ?? 55, 20), 90);
    this.hallEvery = Math.max(variant?.hallEvery ?? 4, 1);
    this.arenaBand = Math.max(variant?.arenaBand ?? 2, 0);
    const vTag = this.variantName ? '-' + String(this.variantName).replace(/[^a-z0-9]/gi, '').slice(0, 4) : '';
    this.char = (('Sw' + guild[0].toUpperCase() + guild.slice(1).replace(/[^a-zA-Z]/g, '')
      + race[0].toUpperCase() + race.slice(1).replace(/[^a-zA-Z]/g, '')).replace(/[^a-zA-Z]/g, '').slice(0, 15 - vTag.length)
    ) + vTag + '-' + RUN_ID;
    // Keep RUN_ID intact in the username (never blind-slice it off the end):
    // shorten guild/race instead so distinct runs never share an account.
    this.user = `sw_${guild}_${race}_${RUN_ID}`;
    if (this.user.length > 24) this.user = `sw_${guild.slice(0, 4)}_${race.slice(0, 4)}_${RUN_ID}`;
    this.scriptBase = guild.slice(0, 6); // e.g. "warmag", "barbar"
    this.session = new WireSession({
      user: this.user, pass: PASS, char: this.char, race, guild,
    });
    // Benchmark runs get their own log file so variants never interleave.
    const vTag2 = this.variantName ? '-' + String(this.variantName).replace(/[^a-z0-9]/gi, '') : '';
    this.logPath = join(LIVE_DIR, `fidelity-${guild}${vTag2}-${race}.log`);
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
    this.circleTimes = [];    // [{circle, ms}] wall-clock from enter to EACH circle-up
    // ---- stall-detection state (snapshot into classifyStall) ----
    this.startedAt = Date.now();
    this.refusalTimes = [];   // timestamps of move/combat refusals
    this.roomChangedAt = Date.now();
    this.lastProgressAt = Date.now();  // any kill/circle/train/move refreshes this
    this.lowHpSince = null;   // first prompt seen pinned below LOW_HP_FRAC
    this.liveVerdict = { verdict: 'healthy', reason: 'warming up' };
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
      // arenaBand widens/narrows that spread (benchmark variants).
      const tooStrong = ROOMS[id].spawns.some((sid) => {
        const c = creatureById(sid);
        return c && (c.circle || 1) > myCircle + this.arenaBand;
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
        this.enteredAt = Date.now();
        this.appendLog(`=== sweep run ${RUN_ID} ${this.char}${this.variantName ? ` [${this.variantName}]` : ''} (${this.race} ${this.guild}) entered ${new Date().toISOString()} ===`);
        if (BOOST > 1) this.session.sendObj({ t: 'boost', mult: BOOST });
        void this.beginPlaying();
      },
      onRoom: (m, changed) => {
        if (changed) {
          this.lastRoomChangeAt = Date.now();
          // A real room change is progress: it disproves "parked" verdicts.
          this.roomChangedAt = this.lastRoomChangeAt;
          this.lastProgressAt = this.lastRoomChangeAt;
        }
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
    // The room message can lag the enter handshake — wait for a real room
    // before generating paths, or bazaarPath comes back empty and the
    // generated script tries to BUY at the spawn room forever.
    for (let i = 0; !s.vitals.room && i < 20; i++) await sleep(250);
    const room = s.vitals.room;
    if (!room) { this.finish('never received a room after enter'); return; }
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
    // NOTE: this.library must stay null until startCycle below — the 1s
    // heartbeat restarts a mega cycle whenever (runner==null && library set),
    // so publishing early double-runs the hunt and interleaves both move
    // chains (the 10x-'move e' bazaar overshoot into catrox_forge).
    this.libraryPending = {
      [this.scriptBase + 'hunt']: huntSrc,
      [this.scriptBase + 'circle']: circleSrc,
      [this.scriptBase + 'mega']: megaSrc,
    };
    for (const [name, body] of Object.entries(this.libraryPending || this.library || {})) {
      s.sendObj({ t: 'scripts_put', name, body });
      await sleep(250);
    }
    this.appendLog(`library saved: ${Object.keys(this.libraryPending || {}).join(', ')} (${huntSrc.split('\n').length} hunt lines)`);
    if (process.env.SWEEP_DUMP) this.appendLog('--- hunt.dr ---\n' + huntSrc);
    log(`[${this.guild}/${this.race}] arena ${ROOMS[arena.id].name} — species: ${[...new Set(ROOMS[arena.id].spawns)].map(nounOf).join(', ')}`);
    await sleep(600);
    this.library = this.libraryPending || this.library;
    this.libraryPending = null;
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
      roomNow: () => s.vitals.room,
      send: async (line) => {
        if (process.env.SWEEP_DEBUG || /^(attack|tdptrain|flee|rest|stand|circle|buy|wield|prepare|cast|khri|enchant|backstab|analyze|roar|drink|effects|stealth|hide|skin|withdraw)/.test(line)) {
          this.appendLog(`script> ${line}`);
          log(`[${this.guild}/${this.race}] > ${line}`);
        } else if (/^(n|s|e|w|ne|nw|se|sw|up|down|d|out)$/.test(line)) {
          this.appendLog(`script> move ${line}`);
        }
        trackMove(s, line);
        this.lastSendAt = Date.now();
        // Movement is progress — it disproves "parked" stall verdicts.
        if (/^(n|s|e|w|ne|nw|se|sw|up|down|d|out)$/.test(line)) this.lastProgressAt = Date.now();
        if (/^tdptrain /.test(line)) { this.trains += 1; this.lastProgressAt = Date.now(); }
        void s.cmd(line);
      },
      onRefusedMove: (dir) => trackRefusedMove(s, dir),
      say: (t) => { if (t && !/^--/.test(t)) this.appendLog(`[echo] ${t}`); },
      getScript: (n) => this.getScript(n),
    });
    this.runner.start();
  }

  onText(text, type) {
    const cfg = GUILD_SCRIPTS[this.guild];
    // Raw-prose trace (opt-in): diagnosing script wedges needs the actual
    // room/shop prose the runner saw, not just the commands it sent.
    if (process.env.SWEEP_TEXT && text && text.trim()) {
      this.appendLog(`[text:${type}] ${text.replace(/\n+/g, ' | ').slice(0, 160)}`);
    }
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
      // Leveling-lab metric: record the wall-clock split for EVERY circle-up
      // (enter -> circle N), giving a pacing curve per run, not just the
      // final time-to-target.
      const newCircle = this.session.vitals.circle + 1;
      const split = Date.now() - (this.enteredAt || this.startedAt);
      this.circleTimes.push({ circle: newCircle, ms: split });
      log(`[${this.guild}/${this.race}] *** CIRCLE-UP -> circle ${newCircle} (${Math.round(split / 60000)}m) ***`);
      this.appendLog(`*** CIRCLE-UP -> circle ${newCircle} at ${Math.round(split / 1000)}s ***`);
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
    if (/dies|slumps|lifeless|stops moving|collapses/.test(text)) {
      this.kills += 1;
      this.lastProgressAt = Date.now();
    }
    // Observability: movement/combat refusals are the #1 reason agents park
    // silently. Tag them so a fidelity log explains its own stalls.
    if (/^(You cannot go that way|You are overloaded|You must wait|Creatures block your path|You are in the stocks|The cell door is barred|Go where)/.test(stripAnsi(text))) {
      this.refusals = (this.refusals || 0) + 1;
      this.refusalTimes.push(Date.now());
      if (this.refusalTimes.length > 400) this.refusalTimes.splice(0, 200);
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
      this.lastProgressAt = Date.now(); // a circle attempt + curriculum parse is activity
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
    if (this.done || !this.library || this.restarting) return;
    this.restarting = true;
    const done = () => { this.restarting = false; };
    this.runner?.stop();
    this.curName = null;
    // Dead-end escape: if flagged, walk to the bazaar hub first, then re-path
    // everything from there (the hub connects to every town road).
    if (this.escapePath?.length && this.session.vitals.room !== 'bazaar') {
      const steps = this.escapePath;
      this.escapePath = null;
      const s = this.session;
      // Walk the escape chain resiliently: on a refused move, recompute the
      // remaining path from wherever we actually are instead of aborting the
      // whole walk (a single refusal used to strand the char mid-escape for
      // another 90s watchdog cycle).
      const walkEscape = () => {
        const here = s.vitals.room;
        const fresh = (here && here !== 'bazaar') ? s.bfsPath(here, 'bazaar', this.diskAdj()) : null;
        // bfsPath returns EDGE OBJECTS ({dir,to}) — extract .dir before
        // building move lines. Raw objects used to render "move [object
        // Object]"-style garbage (or a stale first-step dir), refusing every
        // step and wedging the escape loop.
        const dirs = (fresh?.length ? fresh : steps).map((e) => (typeof e === 'string' ? e : e?.dir)).filter(Boolean);
        if (!dirs.length) { this.regenerateFromHere(); return; }
        this.appendLog(`[escape] ${dirs.length} steps from ${here}: ${dirs.join(',')}`);
        this.runner = createRunner(dirs.map((d) => 'move ' + d).join('\n') + '\nput look\nwait', [], {
          roomNow: () => s.vitals.room,
          send: async (line) => {
            trackMove(s, line);
            this.lastSendAt = Date.now();
            // Escape moves ARE progress: without refreshing lastProgressAt
            // the classifier reads the escape itself as silence and the
            // watchdog re-fires mid-walk (the catrox_forge loop).
            if (/^(n|s|e|w|ne|nw|se|sw|up|down|d|out)$/.test(line)) this.lastProgressAt = Date.now();
            void s.cmd(line);
          },
          onRefusedMove: (dir) => trackRefusedMove(s, dir),
          say: () => {},
        });
        this.runner.start();
      };
      walkEscape();
      done();
      return;
    }
    this.regenerateFromHere();
    this.startCycle(this.library[this.scriptBase + 'mega'], this.scriptBase + 'mega');
    done();
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
    // Interior OR transit room (dens: spawnless 2-exit corridors off the
    // bazaar): parking here means a baked path died mid-transit. Escape to
    // the hub and distrust this room's learned edges. The bazaar itself is
    // the hub — never "stranded" there, or we escape-loop forever.
    const interior = room !== 'bazaar' && !r.spawns?.length && exitCount <= 2;
    if (!arena || interior) {
      if (!arena) this.appendLog(`[regen] no arena reachable from ${room}`);
      else if (interior) {
        this.appendLog(`[regen] stranded in transit room ${room} — bazaar escape`);
        delete this.session.observedEdges[room]; // edges here just failed us
      }
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
    // fight, never healing, never winning. Rest below the variant's restPct
    // (default 55%), stand above 90%.
    if (!v.maxhp || v.inCombat) return;
    const frac = v.hp / v.maxhp;
    const now = Date.now();
    // Stall signal: pinned under 25% HP (see stall-detect LOW_HP_FRAC).
    this.lowHpSince = frac < 0.25 ? (this.lowHpSince || now) : null;
    if (!v.restingFlag && frac < this.restPct / 100 && now - (this.lastRestCmdAt || 0) > 4000) {
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

  // Live stall verdict, recomputed each heartbeat from the same pure
  // classifier the end-of-run row uses. Logged (once) when it CHANGES so a
  // fidelity log narrates its own decline; surfaced in progress lines.
  updateStallVerdict() {
    if (this.done) return;
    const v = this.session.vitals;
    this.liveVerdict = classifyStall({
      startedAt: this.startedAt,
      guild: this.guild,
      room: v.room || null,
      kills: this.kills,
      refusalTimes: this.refusalTimes.length ? this.refusalTimes : [],
      roomChangedAt: this.roomChangedAt,
      lastProgressAt: this.lastProgressAt,
      lowHpSince: this.lowHpSince,
      inCombat: !!v.inCombat,
      circles: this.circles,
      trains: this.trains,
    });
    const key = this.liveVerdict.verdict;
    if (key !== this.lastLoggedVerdict) {
      if (key === 'healthy') {
        if (this.lastLoggedVerdict && this.lastLoggedVerdict !== 'healthy') {
          this.appendLog(`[verdict] recovered to healthy`);
          this.lastLoggedVerdict = 'healthy';
        }
      } else {
        this.lastLoggedVerdict = key;
        const line = `[verdict] ${verdictLabel(this.liveVerdict.verdict, this.liveVerdict.reason)}`;
        this.appendLog(line);
        log(`[${this.guild}/${this.race}] ${line}`);
      }
    }
  }

  heartbeat() {
    if (this.done) return;
    this.updateStallVerdict();
    try { this.runner?.feed('', false); } catch {}
    this.session.injectState(this.runner);
    if (!this.runner || !this.runner.running) {
      // Restart guard: a restartCycle/escape-walk in flight has already
      // begun building the next runner — don't stack a second cycle on top.
      if (this.restarting) return;
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
    // TDP-gate the hall trip: with a known balance below the floor there is
    // nothing to train, so skip the walk entirely and keep hunting (kills
    // earn ranks, ranks fill the TDP pool). The generated circle script
    // afford-gates again at the hall in case balance changed en route.
    // Fires at most once per fresh kill (killsAtVisit reset) — not per tick.
    const tdpKnown = Number.isFinite(v2.tdp);
    if (huntingLeg && tdpKnown && v2.tdp < 8 && !v2.inCombat
      && this.kills > this.killsAtVisit) {
      this.appendLog(`[hall-skip] only ${v2.tdp} TDPs — hunting until the pool fills`);
      log(`[${this.guild}/${this.race}] hall skipped: ${v2.tdp} TDPs below floor`);
      this.killsAtVisit = this.kills;
      return;
    }
    if (huntingLeg && !tdpKnown && this.kills - this.killsAtVisit >= 12 && !v2.inCombat) {
      // Balance never observed yet — probe it once instead of walking blind.
      this.appendLog('[hall-probe] checking TDP balance before hall trip');
      void this.session.cmd('tdp');
      this.killsAtVisit = this.kills;
      return;
    }
    if (huntingLeg && !v2.inCombat && this.kills > this.killsAtVisit
      && (this.kills - this.killsAtVisit >= this.hallEvery || Date.now() - this.lastHallAt > 240000)) {
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
    return `[progress] ${mins}m circle ${v.circle} hp ${v.hp}/${v.maxhp} kills ${this.kills} circles ${this.circles} trains ${this.trains} deaths ${this.deaths} boost x${BOOST} fidelity:${JSON.stringify(this.fidelity)} [room ${v.room}] ${verdictLabel(this.liveVerdict.verdict, this.liveVerdict.reason, 90)}`;
  }

  async finish(reason) {
    if (this.done) return;
    this.done = true;
    this.runner?.stop();
    this.session.close();
    this.updateStallVerdict(); // final classification for this run
    this.appendLog(this.progressLine());
    this.appendLog(`=== Results (${GUILDS[this.guild]?.name}${this.variantName ? ` [${this.variantName}]` : ''}) ===`);
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
      run_id: RUN_ID,
      ts: new Date().toISOString(), guild: this.guild, race: this.race, char: this.char,
      variant: this.variantName, reason, circle: this.session.vitals.circle, circles: this.circles,
      kills: this.kills, deaths: this.deaths, trains: this.trains,
      refusals: this.refusals || 0,
      circleTimes: this.circleTimes,
      timeToCircleMs: this.circleTimes.find((c) => c.circle >= CIRCLE_TARGET)?.ms ?? null,
      stallVerdict: this.liveVerdict?.verdict || null, stallReason: this.liveVerdict?.reason || null,
      fidelity: this.fidelity, fidelityScore: `${checksPassed}/${checksTotal}`,
      grade,
    };
    try { appendFileSync(join(LIVE_DIR, 'fidelity-summary.jsonl'), JSON.stringify(summary) + '\n'); } catch {}
    // SQLite sweeps history (sim artifact — public/live/sweeps.db, NOT the
    // game DB). One row per agent run.
    try {
      const db = openSweepsDb(LIVE_DIR);
      insertSweep(db, {
        run_id: RUN_ID, ts: summary.ts, guild: this.guild, race: this.race,
        grade, circle: summary.circle, kills: this.kills, trains: this.trains,
        circles_up: this.circles, deaths: this.deaths, refusals: this.refusals || 0,
        durationMs: Date.now() - this.startedAt, notes: reason,
        variant: this.variantName,
        timeToCircleMs: summary.timeToCircleMs,
        stallVerdict: this.liveVerdict?.verdict, stallReason: this.liveVerdict?.reason,
        circleTimes: this.circleTimes,
      });
      db.close();
    } catch (e) { log(`[${this.guild}/${this.race}] sweeps-db write failed: ${e.message}`); }
    log(`[${this.guild}/${this.race}] FINISHED run ${RUN_ID} (${reason}): circle ${summary.circle}, fidelity ${summary.fidelityScore}`, JSON.stringify(summary.fidelity));
    log(`[${this.guild}/${this.race}] VERDICT: ${verdictLabel(this.liveVerdict.verdict, this.liveVerdict.reason)}${this.variantName ? ` [variant ${this.variantName}]` : ''}`);
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
    // Benchmark mode constructs ALL agents up front, then plays them one at
    // a time over hours. Re-stamp the stall clock HERE, at actual play time,
    // or duration/kills-per-hour/progress stamps measure time since process
    // boot and every variant after the first reads as fake "slow" decay.
    const now = Date.now();
    this.startedAt = now;
    this.refusalTimes = [];
    this.roomChangedAt = now;
    this.lastProgressAt = now;
    this.lowHpSince = null;
    this.liveVerdict = { verdict: 'healthy', reason: 'warming up' };
    const PROGRESS = setInterval(() => { if (!this.done) this.appendLog(this.progressLine()); }, 30000);
    const HB = setInterval(() => this.heartbeat(), 1000);
    setTimeout(() => { clearInterval(PROGRESS); clearInterval(HB); this.finish(`--minutes ${minutes} elapsed`); }, minutes * 60000);
  }
}


// --report: render sweep results from the SQLite history DB
// (public/live/sweeps.db). Flags:
//   --since <ts>     only runs at/after this ISO timestamp (or 'today')
//   --last <N>       last N runs per guild x race instead of the latest one
// Falls back to fidelity-summary.jsonl if the DB doesn't exist yet.
function report() {
  const since = flag('since', null);
  const lastN = Number(flag('last', 1));
  let rows;
  try {
    const db = openSweepsDb(LIVE_DIR);
    let sql = 'SELECT run_id, ts, guild, race, grade, circle, kills, trains, circles_up, deaths, refusals, durationMs, variant, timeToCircleMs, stallVerdict, stallReason FROM sweeps';
    const params = [];
    if (since) {
      const cutoff = since === 'today'
        ? new Date().toISOString().slice(0, 10)
        : since;
      sql += ' WHERE ts >= ?'; params.push(cutoff);
    }
    sql += ' ORDER BY ts ASC';
    rows = db.prepare(sql).all(...params);
    db.close();
  } catch {
    // Backward compat: no DB yet — read the jsonl summary.
    const file = join(LIVE_DIR, 'fidelity-summary.jsonl');
    try {
      rows = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
    } catch { console.log('no sweeps.db or summary yet:', LIVE_DIR); return; }
  }
  if (!rows.length) { console.log('no sweep rows found'); return; }
  const hasVerdicts = rows.some((r) => r.stallVerdict);
  console.log(`\n=== Fidelity sweep results (${rows.length} rows${since ? `, since ${since}` : ''}) ===`);
  console.log(pad('run', 6) + pad('guild', 13) + pad('race', 10) + pad('grade', 6)
    + pad('circle', 7) + pad('kills', 6) + pad('deaths', 7) + pad('refus', 6)
    + (hasVerdicts ? pad('verdict', 9) : '')
    + pad('mins', 5) + 'ts');
  for (const r of rows.slice(-Math.max(1, lastN) * 200)) {
    console.log(pad(r.run_id || '-', 6) + pad(r.guild, 13) + pad(r.race, 10)
      + pad(r.grade || '-', 6) + pad(String(r.circle ?? '-'), 7)
      + pad(String(r.kills ?? 0), 6) + pad(String(r.deaths ?? 0), 7)
      + pad(String(r.refusals ?? 0), 6)
      + (hasVerdicts ? pad(r.stallVerdict || '-', 9) : '')
      + pad(r.durationMs ? String(Math.round(r.durationMs / 60000)) : '-', 5)
      + r.ts);
  }
  // Latest per guild x race (x variant) rollup
  const latest = new Map();
  for (const r of rows) latest.set(r.guild + '|' + r.race + '|' + (r.variant || ''), r);
  const circles = [...latest.values()].reduce((s, r) => s + (r.circles_up ?? r.circles ?? 0), 0);
  console.log(`\n${latest.size} combos (latest per combo shown above), ${circles} total circle-ups`);
  // Stall watch: recently finished runs whose final verdict was stalled or
  // wedged — the ones needing a fidelity-log autopsy.
  const bad = rows.filter((r) => r.stallVerdict === 'stalled' || r.stallVerdict === 'wedged').slice(-12);
  if (bad.length) {
    console.log(`\n=== !! ${bad.length} stalled/wedged run(s), oldest first — autopsy via public/live/fidelity-<guild>-<race>.log ===`);
    for (const r of bad) {
      console.log(pad(r.ts.slice(5, 16).replace('T', ' '), 17) + pad(r.run_id, 6)
        + pad(`${r.guild}/${r.race}`, 26) + pad(r.variant || '-', 9)
        + verdictLabel(r.stallVerdict, r.stallReason));
    }
  }
}
function pad(s, n) { return String(s).padEnd(n); }

// --by-variant: leveling-lab comparison. Groups runs by variant × race from
// the sweeps DB and reports median time-to-target-circle, per-circle pacing
// medians, kills/hour, deaths, and a winner line. Runs whose time-to-circle
// is within NOISE_FRAC of the best are marked as ties (server-day variance
// can easily swing a single run by that much).
const NOISE_FRAC = 0.1;
const fmtMin = (ms) => (ms == null ? '-' : (ms / 60000).toFixed(1) + 'm');

function reportByVariant() {
  const since = flag('since', null);
  const target = Number(flag('circle', CIRCLE_TARGET));
  let rows;
  try {
    const db = openSweepsDb(LIVE_DIR);
    let sql = 'SELECT run_id, ts, guild, race, variant, circle, kills, circles_up, deaths, durationMs, timeToCircleMs, circleTimes, stallVerdict FROM sweeps WHERE variant IS NOT NULL';
    const params = [];
    if (since) {
      const cutoff = since === 'today' ? new Date().toISOString().slice(0, 10) : since;
      sql += ' AND ts >= ?'; params.push(cutoff);
    }
    sql += ' ORDER BY ts ASC';
    rows = db.prepare(sql).all(...params);
    db.close();
  } catch (e) { console.log('no sweeps.db yet:', e.message); return; }
  if (!rows.length) { console.log('no variant-tagged runs found'); return; }

  // Group by guild|variant|race.
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.guild}|${r.variant}|${r.race}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  console.log(`\n=== Leveling lab — variants → circle ${target} (${rows.length} runs) ===`);
  console.log(pad('guild', 11) + pad('variant', 10) + pad('race', 10)
    + pad('runs', 5) + pad('to-c10', 8) + pad('kills/h', 8) + pad('deaths', 7)
    + pad('verdicts', 20) + 'pacing (median min/circle)');
  for (const [key, rs] of [...groups].sort()) {
    const [guild, variant, race] = key.split('|');
    const done = rs.filter((r) => r.timeToCircleMs != null);
    const times = done.map((r) => r.timeToCircleMs).sort((a, b) => a - b);
    const median = times.length ? times[Math.floor(times.length / 2)] : null;
    // Guard the spread: an empty filter yields Infinity, which would mark
    // every (nonexistent-finisher) row as tied with nothing.
    const bestTimes = rows.filter((x) => x.guild === guild && x.race === race && x.timeToCircleMs != null).map((x) => x.timeToCircleMs);
    const best = bestTimes.length ? Math.min(...bestTimes) : null;
    const tie = median != null && best != null && median <= best * (1 + NOISE_FRAC);
    const kph = rs.map((r) => r.kills / ((r.durationMs || 0) / 3600000)).filter(Number.isFinite);
    const deaths = rs.reduce((s, r) => s + (r.deaths || 0), 0);
    const verdicts = rs.map((r) => r.stallVerdict || '-').join(',');
    // Median pacing curve across runs that have circleTimes.
    const curves = rs.map((r) => { try { return JSON.parse(r.circleTimes || '[]'); } catch { return []; } })
      .filter((c) => c.length);
    const maxC = Math.max(0, ...curves.map((c) => c[c.length - 1]?.circle || 0));
    const pace = [];
    for (let c = 2; c <= maxC; c++) {
      const splits = curves.map((cu) => cu.find((x) => x.circle === c)?.ms).filter(Boolean);
      if (splits.length) {
        splits.sort((a, b) => a - b);
        pace.push(`c${c}:${fmtMin(splits[Math.floor(splits.length / 2)])}`);
      }
    }
    console.log(pad(guild, 11) + pad(variant, 10) + pad(race, 10)
      + pad(String(rs.length), 5)
      + pad(median != null ? fmtMin(median) + (tie ? '*' : '') : '-', 8)
      + pad(kph.length ? String(Math.round(kph.reduce((s, x) => s + x, 0) / kph.length)) : '-', 8)
      + pad(String(deaths), 7)
      + pad(verdicts.slice(0, 18), 20)
      + pace.join(' '));
  }
  console.log('\n* = statistically tied with the fastest variant for this guild×race (±' + Math.round(NOISE_FRAC * 100) + '%)');
  console.log('-'.repeat(30));
}

// --leaderboard: ranked benchmark table from the sweeps DB — best/median
// wall time to reach the target circle per guild × variant (races pooled),
// plus kills, deaths, and stall counts. Variants that never reached the
// target circle rank below finishers, ordered by total kills. Pairs with
// --by-variant, which shows per-race detail and pacing curves.
function leaderboard() {
  const guild = flag('guild', null);
  const target = Number(flag('circle', CIRCLE_TARGET));
  let rows;
  try {
    const db = openSweepsDb(LIVE_DIR);
    const params = [];
    let sql = 'SELECT run_id, ts, guild, race, grade, circle, kills, deaths, trains, refusals, durationMs, variant, timeToCircleMs, stallVerdict FROM sweeps WHERE variant IS NOT NULL';
    if (guild) { sql += ' AND guild = ?'; params.push(guild); }
    sql += ' ORDER BY ts ASC';
    rows = db.prepare(sql).all(...params);
    db.close();
  } catch { console.log('no sweeps.db yet:', LIVE_DIR); return; }
  if (!rows.length) { console.log(`no benchmark rows yet${guild ? ` for ${guild}` : ''} — run --benchmark <guild> first`); return; }

  const median = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  };
  const fmtMs = (ms) => ms == null ? '-' : `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

  // One ranked row per guild x variant.
  const byVariant = new Map();
  for (const r of rows) {
    const k = r.guild + '|' + r.variant;
    if (!byVariant.has(k)) byVariant.set(k, []);
    byVariant.get(k).push(r);
  }
  const rankRows = [...byVariant.entries()].map(([k, rs]) => {
    const [g, v] = k.split('|');
    const times = rs.map((r) => r.timeToCircleMs).filter((t) => t != null);
    return {
      guild: g, variant: v, runs: rs.length,
      reached: times.length,
      best: times.length ? Math.min(...times) : null,
      med: median(times),
      kills: rs.reduce((s, r) => s + (r.kills || 0), 0),
      deaths: rs.reduce((s, r) => s + (r.deaths || 0), 0),
      bad: rs.filter((r) => r.stallVerdict === 'stalled' || r.stallVerdict === 'wedged').length,
      kph: median(rs.map((r) => (r.durationMs > 0 ? r.kills / (r.durationMs / 3600000) : NaN)).filter(Number.isFinite)),
    };
  }).sort((a, b) => ((a.med ?? Infinity) - (b.med ?? Infinity)) || (b.kills - a.kills));

  console.log(`\n=== Benchmark leaderboard — time to circle ${target}${guild ? ` — ${guild}` : ''} (${rows.length} runs, boost x${BOOST}) ===`);
  console.log(pad('rank', 5) + pad('variant', 10) + pad('guild', 13)
    + pad('runs', 5) + pad('reached', 8) + pad('best', 7) + pad('median', 7)
    + pad('kills', 6) + pad('deaths', 7) + pad('kills/h', 8) + pad('stall/wdg', 10));
  rankRows.forEach((r, i) => {
    console.log(pad(String(i + 1), 5) + pad(r.variant, 10) + pad(r.guild, 13)
      + pad(String(r.runs), 5) + pad(`${r.reached}/${r.runs}`, 8)
      + pad(fmtMs(r.best), 7) + pad(fmtMs(r.med), 7)
      + pad(String(r.kills), 6) + pad(String(r.deaths), 7)
      + pad(r.kph != null ? String(Math.round(r.kph)) : '-', 8)
      + pad(String(r.bad), 10));
  });
}

// ---------------- orchestration ----------------

if (ARGS.includes('--report')) {
  if (ARGS.includes('--by-variant')) reportByVariant();
  else report();
  process.exit(0);
}
if (ARGS.includes('--leaderboard')) { leaderboard(); process.exit(0); }

const agents = wanted.map((w) => new SweepAgent(w));
log(`sweep run ${RUN_ID}: ${agents.length} agents over ${new Set(wanted.map((w) => w.guild)).size} guilds, ${MINUTES}m each`);
// Spawn-a-run contract: print the run-id and log path up front so the
// operator can tail the fidelity log without digging through public/live/.
if (MODE === 'spawn') {
  const a = agents[0];
  console.log(`SPAWNED ${a.guild},${a.race} -> ${a.char} | run-id ${RUN_ID} | log ${a.logPath} | ${MINUTES}m | boost x${BOOST}`);
}

// Benchmark runs are STRICTLY sequential: concurrent agents contend for
// creature spawns, which inflates every time-to-circle and makes variant
// comparisons meaningless. Ad-hoc sweeps keep the historical parallel launch.
async function launchAll() {
  for (const a of agents) {
    try {
      await a.start();
      a.run(MINUTES);
      if (MODE === 'benchmark') {
        const t0 = Date.now();
        while (!a.done && Date.now() - t0 < (MINUTES + 2) * 60000) await sleep(2000);
        log(`[${a.guild}/${a.race}] benchmark run complete — next agent`);
      }
    } catch (e) { log(`[${a.guild}/${a.race}] failed to start: ${e.message}`); a.finish('start-failed'); }
  }
  if (MODE === 'benchmark') {
    log('all benchmark runs finished — compare with:');
    console.log(`  node scripts/race-guild-sweep.mjs --report --by-variant --since ${new Date().toISOString().slice(0, 10)}`);
  }
}
void launchAll();

process.on('uncaughtException', (e) => {
  log(`uncaught: ${e.code || e.message} — finishing agents gracefully`);
  log(`uncaught-stack: ${String(e.stack || '').split('\n').slice(0, 4).join(' | ')}`);
  for (const a of agents) if (!a.done) { a.session.close(); a.finish(`error: ${e.code || e.message}`); }
});
process.on('SIGINT', () => { for (const a of agents) a.finish('interrupted'); process.exit(0); });
process.on('SIGTERM', () => { for (const a of agents) a.finish('terminated'); process.exit(0); });
