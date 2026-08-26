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
import { mkdirSync, appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openSweepsDb, insertSweep } from './lib/sweeps-db.mjs';
import { classifyStall, verdictLabel } from './lib/stall-detect.mjs';
import { circleRequirements } from '../data/guilds.js';
// Display-name -> skill-id map for parsing `exp` output. showExp() prints the
// human label ("Parry Ability", "Melee Mastery"), not the id.
const { SKILLS } = await import('../data/skills.js');
const SKILL_ID_BY_NAME = Object.fromEntries(
  Object.values(SKILLS).map((s) => [String(s.name).toLowerCase(), s.id]));


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
// A unique account per run also avoids the MAX_CHARS slot cap filling up
// across repeated runs (server/player.js — 10 slots). A benchmark burns one
// character per run, so a sweep of more repeats than MAX_CHARS on a single
// account leaves the overflow runs unable to enter the world at all (hp 0/0,
// room null) until the stall watchdog kills them.
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

// Loot items a town errand should try to sell at the bazaar: skins-tagged
// drops (pelts/hides the general store buys) from early-game creatures.
// Derived from data/creatures.js so new species flow in automatically.
import { CREATURES } from '../data/creatures.js';
function errandLootFor(guild) {
  const loot = new Set();
  for (const def of Object.values(CREATURES)) {
    if ((def.circle || 1) > 4) continue; // early-game errands only
    for (const id of def.loot || []) {
      if ((def.lootTags || []).includes('skins')) loot.add(id);
    }
  }
  return [...loot];
}

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
//   hallFallbackMs — how long to keep hunting before a hall trip fires on the
//                 TIMER alone (the readiness gate still triggers immediately
//                 when mindstate ranks actually satisfy the next circle).
//                 Baseline's 4 minutes walked the full arena→hall→bazaar→arena
//                 circuit while ranks were still nowhere near (expertise 5/8),
//                 spending most of a 10-minute run in transit for 4 kills.
const VARIANTS = {
  baseline: { restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000 },
  // Kaizen v2: baseline with ONE variable changed — trust the rank-readiness
  // gate and let the blind timer fall back to 9 minutes, so a short run hunts
  // instead of commuting. Everything else matches baseline for a clean A/B.
  baseline_v2: { restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 540000 },
  rest50:   { restPct: 50, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000 },
  hall8:    { restPct: 35, hallEvery: 8, arenaBand: 2, hallFallbackMs: 240000 },
  wide2:    { restPct: 35, hallEvery: 6, arenaBand: 4, hallFallbackMs: 240000 },
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
  // --variants v1,v2 subsets the matrix; default runs every defined variant.
  const names = (flag('variants', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const pick = names.length ? names : Object.keys(VARIANTS);
  for (const vn of pick) {
    if (!VARIANTS[vn]) { console.error(`unknown variant "${vn}" — have: ${Object.keys(VARIANTS).join(', ')}`); process.exit(1); }
  }
  // --races g1,h2 subsets species; --repeats N runs each cell N times
  // (leveling lab: medians + spread need repetition to judge repeatability).
  const raceNames = (flag('races', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const races = raceNames.length ? raceNames : (RACE_MATRIX[g]?.length ? RACE_MATRIX[g] : ['human']);
  for (const rc of races) {
    if (!RACE_MATRIX[g]?.includes(rc)) { console.error(`unknown race "${rc}" for ${g} — have: ${RACE_MATRIX[g].join(', ')}`); process.exit(1); }
  }
  const repeats = Math.max(1, Math.min(10, Number(flag('repeats', 1)) || 1));
  wanted = races.flatMap((race) => pick.flatMap((vn) =>
    Array.from({ length: repeats }, () => ({ guild: g, race, variant: { name: vn, ...VARIANTS[vn] } }))));
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
  // Monotonic, letters-only agent tag: 4 chars over an 8-letter alphabet
  // encoding a plain counter (base 8), so every agent in a process gets a
  // distinct tag with zero collision probability. 8^4 = 4096 agents per
  // invocation, far beyond any real sweep; wraps harmlessly past that.
  static _seq = 0;
  static nextTag() {
    const A = 'ijklmnop';
    let n = SweepAgent._seq++ % 4096;
    let out = '';
    for (let i = 0; i < 4; i++) { out = A[n % 8] + out; n = Math.floor(n / 8); }
    return out;
  }

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
    // Blind hall-trip timer. Clamped to 1-15 minutes; the rank-readiness gate
    // above it still fires the moment mindstate ranks meet the requirement.
    this.hallFallbackMs = Math.min(Math.max(variant?.hallFallbackMs ?? 240000, 60000), 900000);

    const vTag = this.variantName ? '-' + String(this.variantName).replace(/[^a-z0-9]/gi, '').slice(0, 4) : '';
    // Per-AGENT suffix (not per-RUN): benchmark repeats reuse RUN_ID, so two
    // repeats of the same variant must never share a character — repeat 2
    // would inherit repeat 1's ranks and poison the leveling-lab splits.
    // Letters-only tag: names are validated letters-only server-side
    // (validName rejects digits — "Name must be 2-20 letters"), so base36
    // tags containing digits silently wedged ~60% of benchmark runs at
    // charcreate. Encode a MONOTONIC counter in base-8 letters rather than
    // random ones: 4 random chars over an 8-letter alphabet is only 8^4 and
    // collided ~1-in-40 in practice (two agents sharing an account/name is
    // exactly the slot-cap + UNIQUE-constraint failure we are fixing).
    // A counter is collision-free by construction for any sweep size.
    const agentTag = '-' + SweepAgent.nextTag();

    this.char = (('Sw' + guild[0].toUpperCase() + guild.slice(1).replace(/[^a-zA-Z]/g, '')
      + race[0].toUpperCase() + race.slice(1).replace(/[^a-zA-Z]/g, '')).replace(/[^a-zA-Z]/g, '').slice(0, 15 - vTag.length - agentTag.length)
    ) + vTag + agentTag + '-' + RUN_ID;
    // ONE ACCOUNT PER AGENT. A sweep burns one character per run, so sharing
    // a per-RUN account capped the whole sweep at MAX_CHARS runs: the
    // overflow agents got "This account already has N characters" at
    // charcreate, never entered the world (hp 0/0, room null), and burned
    // their full --minutes budget before the stall watchdog killed them.
    // That made any sweep longer than MAX_CHARS silently unable to finish.
    // Keying the username on agentTag (already unique per agent) gives every
    // run its own fresh account, so repeats are unbounded and each agent
    // still starts from a clean level-1 character.
    // Budget: 24 chars max after normalizeName (server/auth.js), lowercase
    // + [a-z0-9_-] only. agentTag is '-xxxx' (letters) and RUN_ID is 4
    // letters, so reserve those and shorten guild/race to fit.
    const aTag = agentTag.slice(1); // drop the leading hyphen
    const mkUser = (g, r) => `sw_${g}_${r}_${aTag}${RUN_ID}`.toLowerCase();
    this.user = mkUser(guild, race);
    if (this.user.length > 24) this.user = mkUser(guild.slice(0, 4), race.slice(0, 4));
    if (this.user.length > 24) this.user = `sw_${aTag}${RUN_ID}`.toLowerCase();

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
    // Leveling lab: time-to-first-EXP and total-rank crossings (5/10/15...).
    // firstExpMs = enter -> first mindstate feed where any skill gained a
    // rank vs the enter baseline; rankSplits = [{ranks, ms}] at each RANK_
    // SPLIT crossing of TOTAL summed ranks (the DR "levels" proxy).
    this.firstExpMs = null;
    this.rankSplits = [];
    this.RANK_SPLITS = [5, 10, 15];
    // ---- stall-detection state (snapshot into classifyStall) ----
    this.startedAt = Date.now();
    this.refusalTimes = [];   // timestamps of move/combat refusals
    this.swingTimes = [];     // timestamps of attack commands (effort detector)
    this.roomChangedAt = Date.now();
    this.lastProgressAt = Date.now();  // any kill/circle/train/move refreshes this
    this.lowHpSince = null;   // first prompt seen pinned below LOW_HP_FRAC
    this.liveVerdict = { verdict: 'healthy', reason: 'warming up' };
  }

  appendLog(line) {
    try { appendFileSync(this.logPath, line + '\n'); } catch {}
    // Update index.json so the /sims.html live panel discovers this log
    try {
      const names = readdirSync(LIVE_DIR).filter((f) => f.endsWith('.log'))
        .map((f) => f.replace(/\.log$/, '')).sort();
      writeFileSync(join(LIVE_DIR, 'index.json'), JSON.stringify(names));
    } catch {}
  }

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
      // First mindstate feed (~seconds after enter, ranks near zero) seeds
      // the effort-without-progress detector's immutable baseline; later feeds refresh
      // vitals.skills which classifyStall compares against it. Also the
      // leveling-lab tap: first rank gain = time-to-first-EXP; summed-rank
      // crossings record the 5/10/15 splits.
      onSkills: (skills) => {
        if (!this.rankBaseline) this.rankBaseline = { ...skills };
        else if (this.firstExpMs === null) {
          // Absent-baseline skills count as rank 0: the mindstate pane only
          // lists skills with ACTIVE pools, so a skill that starts training
          // later never appears in the baseline snapshot — the old `?? r`
          // fallback made every such gain invisible and firstEXP never fired.
          const gained = Object.entries(skills)
            .some(([sk, r]) => Number.isFinite(r) && r > (this.rankBaseline[sk] ?? 0));
          if (gained) {
            this.firstExpMs = Date.now() - (this.enteredAt || this.startedAt);
            log(`[${this.guild}/${this.race}] FIRST-EXP at ${Math.round(this.firstExpMs / 1000)}s`);
          }
        }
        if (this.RANK_SPLITS.length && this.rankBaseline) {
          const total = Object.entries(skills).reduce(
            (n, [sk, r]) => n + Math.max(0, Number(r) || 0), 0);
          const baseTotal = Object.values(this.rankBaseline).reduce(
            (n, r) => n + (Number(r) || 0), 0);
          const earned = total - baseTotal;
          while (this.RANK_SPLITS.length && earned >= this.RANK_SPLITS[0]) {
            const target = this.RANK_SPLITS.shift();
            const ms = Date.now() - (this.enteredAt || this.startedAt);
            this.rankSplits.push({ ranks: target, ms });
            log(`[${this.guild}/${this.race}] RANK-SPLIT +${target} ranks at ${Math.round(ms / 1000)}s`);
          }
        }
        // Running total-rank snapshot for the end-of-run DB row (the lab's
        // Total Ranks column). The mindstate feed lists the top-10 active
        // skills, so this is a floor on true total — but it grows with the
        // run and beats only recording the 5/10/15 split milestones.
        const feedTotal = Object.values(skills).reduce(
          (n, r) => n + (Number(r) || 0), 0);
        if (feedTotal > (this.totalRanksAtFinish || 0)) {
          this.totalRanksAtFinish = feedTotal;
        }
        this.updateStallVerdict();
      },
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
      hallPath: s.bfsPath(arena.id, 'hall_' + this.guild, this.diskAdj()),
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
      // Town errands: sell loot + bundle leftovers on the way home —
      // skins fund the weapon ladder (club → short sword → cavalry_sabre).
      errands: {
        bazaarPath: s.bfsPath('hall_' + this.guild, 'bazaar', this.diskAdj()),
        returnPath: s.bfsPath('bazaar', arena.id, this.diskAdj()),
        sellLoot: errandLootFor(this.guild),
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
        // Swing timestamps feed the effort-without-progress detector: hard effort with zero
        // kills and zero rank movement over a 2m window = broken script.
        if (/^attack\b/.test(line)) {
          this.swingTimes ||= [];
          this.swingTimes.push(Date.now());
          if (this.swingTimes.length > 120) this.swingTimes.splice(0, 60);
        }
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
      this.lastKillAt = Date.now();
      this.rtRefusalStreak = 0;
    }
    // Observability: movement/combat refusals are the #1 reason agents park
    // silently. Tag them so a fidelity log explains its own stalls.
    if (/^(You cannot go that way|You are overloaded|You must wait|Creatures block your path|You are in the stocks|The cell door is barred|Go where)/.test(stripAnsi(text))) {
      this.refusals = (this.refusals || 0) + 1;
      this.refusalTimes.push(Date.now());
      // RT-refusal storm tracking: a live combat stalemate (e.g. swinging at
      // something we can't damage, or a corpse still flagged in-combat)
      // produces an endless "You must wait N seconds" cadence with no kill.
      // The parked-watchdog can't fire here because inCombat stays true.
      if (/^You must wait/.test(stripAnsi(text))) {
        this.rtRefusalStreak = (this.rtRefusalStreak || 0) + 1;
      } else {
        this.rtRefusalStreak = 0;
      }
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
        // Regenerate the circle script NOW so the next hall trip trains
        // the blocking skills instead of the generic curriculum.
        this.regenerateScripts();
      }
      // Rank ledger from `exp` output. The generated hunt script already runs
      // `put exp` each scan cycle, and showExp() prints EVERY skill the
      // character has ("  Parry Ability   rank 5  0%   clear"), unlike the
      // mindstate feed which omits any skill with an empty pool.
      // DISPLAY NAME != SKILL ID: "Parry Ability" -> parry, "Melee Mastery" ->
      // melee_mastery. Naively snake-casing the label yields parry_ability,
      // which circleRequirements() does not know, so the rank silently reads
      // as 0. Resolve through the SKILLS table's real names instead.
      const plainExp = stripAnsi(text);
      if (/\brank \d+/.test(plainExp)) {
        for (const m of plainExp.matchAll(/^\s{2}(\S.*?)\s{2,}rank (\d+)/gm)) {
          const id = SKILL_ID_BY_NAME[m[1].trim().toLowerCase()];
          if (id) (this.expRanks ||= {})[id] = Number(m[2]);
        }
      }
      // Rank-gap ledger: remember what circling demanded and how far short we
      // fell ("expertise at least rank 4 (you have 2)"). The supervisor uses
      // it to skip pointless hall trips until ranks actually move.
      const v3 = this.session.vitals;
      for (const m of stripAnsi(text).matchAll(/([a-z_' ]+?) at least rank (\d+) \(you have (\d+)\)/gi)) {
        const skill = m[1].trim().toLowerCase().replace(/\s+/g, '_');
        (v3.circleGaps ||= {})[skill] = { need: Number(m[2]), have: Number(m[3]) };
      }
      if (v3.circleGaps && Object.keys(v3.circleGaps).length) {
        log(`[${this.guild}/${this.race}] circle gaps: ${Object.entries(v3.circleGaps).slice(0, 4).map(([s, g]) => `${s} ${g.have}/${g.need}`).join(', ')}${Object.keys(v3.circleGaps).length > 4 ? ` +${Object.keys(v3.circleGaps).length - 4}` : ''}`);
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
    const r = ROOMS[room];
    const exitCount = Object.keys(r.exits || {}).length;
    const interior = room !== 'bazaar' && !r.spawns?.length && exitCount <= 2;
    if (!arena || interior) {
      if (!arena) this.appendLog(`[regen] no arena reachable from ${room}`);
      else if (interior) {
        this.appendLog(`[regen] stranded in transit room ${room} — bazaar escape`);
        delete this.session.observedEdges[room];
      }
      const toBazaar = s.bfsPath(room, 'bazaar', this.diskAdj());
      if (toBazaar?.length) {
        this.escapePath = toBazaar.map((e) => e.dir);
        return;
      }
      if (!arena) return;
    }
    this.arena = arena.id;
    this.regenerateScripts();
  }

  // Rebuild the hunt + circle scripts from the current arena and push
  // them to the account. Used after TDP retargeting (so the next hall
  // trip trains blocking skills) and after regenerating paths.
  regenerateScripts() {
    const s = this.session;
    const arena = this.arena;
    if (!arena) return;
    const cap = { guild: this.guild, race: this.race, char: this.char, scriptBase: this.scriptBase, bazaarPath: null, trainList: this.trainList, trainOffset: this.trainOffset || 0 };
    this.library[this.scriptBase + 'hunt'] = buildHuntScript({
      cap,
      hallPath: s.bfsPath(arena, 'hall_' + this.guild, this.diskAdj()),
      arena: {
        id: arena,
        fromArmed: [],
        fromHere: s.bfsPath(s.vitals.room, arena, this.diskAdj()),
      },
    });
    this.library[this.scriptBase + 'circle'] = buildCircleScript({
      cap,
      fromArena: {
        hall: s.bfsPath(arena, 'hall_' + this.guild, this.diskAdj()),
        back: s.bfsPath('hall_' + this.guild, arena, this.diskAdj()),
      },
      errands: {
        bazaarPath: s.bfsPath('hall_' + this.guild, 'bazaar', this.diskAdj()),
        returnPath: s.bfsPath('bazaar', arena, this.diskAdj()),
        sellLoot: errandLootFor(this.guild),
      },
    });
    for (const [name, body] of Object.entries(this.library)) {
      s.sendObj({ t: 'scripts_put', name, body });
    }
  }

  supervise() {
    if (this.done) return;
    const v = this.session.vitals;
    // Low-HP stall signal, tracked FIRST and unconditionally. Every later
    // branch here can return early (flee interlock, in-combat guard), and
    // while this lived below them it was only ever cleared out of combat —
    // so it latched: an agent that dipped below 25% and then recovered
    // (rest, sun buff, regen) kept its original lowHpSince forever and
    // classifyStall reported "pinned under 25% HP for Nm" on a run that
    // ended at 136/171 HP with 10 kills. The verdict was wedged, not the
    // agent. Tracking it before any return keeps the signal truthful,
    // including across the flee path where HP is lowest by definition.
    if (v.maxhp) {
      const hpFrac = v.hp / v.maxhp;
      this.lowHpSince = hpFrac < 0.25 ? (this.lowHpSince || Date.now()) : null;
    }
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
      // effort-without-progress detector inputs
      swingTimes: this.swingTimes || [],
      skills: v.skills || {},
      rankLedger: v.circleGaps || {},
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
    // Circle-readiness gate: if a previous circle attempt told us our rank
    // gaps, and the mindstate feed shows NO blocking skill has gained any
    // ranks since, walking to the hall is pure waste — skip and keep hunting
    // until ranks move (or the long timer fires as a fallback). Closes the
    // walk-fail-train-walk-back-per-kill loop.
    const gaps = v2.circleGaps;
    if (huntingLeg && gaps && Object.keys(gaps).length) {
      const skills = v2.skills || {};
      const moved = Object.entries(gaps).filter(([sk, g]) => (skills[sk] || 0) > g.have);
      const close = Object.values(gaps).every((g) => g.have >= g.need);
      if (!moved.length && !close && this.kills - this.killsAtVisit < 12) {
        return; // silently keep hunting — no log spam, no wasted walk
      }
      if (moved.length) {
        for (const [sk] of moved) gaps[sk].have = skills[sk]; // refresh ledger
        this.appendLog(`[circle-readiness] ranks moved: ${moved.map(([s]) => s).join(', ')} — retrying the hall`);
      } else if (close) {
        this.appendLog('[circle-readiness] requirements met by ranks — retrying circle');
      }
    }
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
    // Readiness-gated hall trips: instead of walking to the hall on a kill
    // count to "check" circle status, evaluate the circle requirement table
    // against the mindstate ranks we already receive (t:'mindstate', pushed
    // ~every 10s). Walk ONLY when requirements are actually met — the trip
    // then does real work (circle + TDP spend) instead of checking. The
    // 4-minute timer stays as a fallback for feeds that never arrive.
    const huntingLeg2 = this.curName === this.scriptBase + 'mega';
    if (huntingLeg2 && !v2.inCombat && this.kills > this.killsAtVisit) {
      const skills = v2.skills || {};
      const shaped = Object.fromEntries(
        Object.entries(skills).map(([id, rank]) => [id, { rank }]));
      let ready = null;
      try {
        ready = circleRequirements({ id: this.guild }, shaped, (v2.circle || 1) + 1);
      } catch { /* unknown guild — fall through to timer trigger */ }
      if (ready?.ok) {
        log(`[${this.guild}/${this.race}] hall trip: circle-${(v2.circle || 1) + 1} requirements MET by mindstate ranks`);
        this.appendLog(`[hall-trip] requirements met (${(v2.circle || 1) + 1}) — circling`);
        this.killsAtVisit = this.kills;
        this.regenerateFromHere();
        this.startCycle(this.library[this.scriptBase + 'circle'], this.scriptBase + 'circle');
        return;
      }
    }
    if (huntingLeg && !v2.inCombat && this.kills > this.killsAtVisit
      && Date.now() - this.lastHallAt > this.hallFallbackMs) {
      log(`[${this.guild}/${this.race}] hall trip (fallback timer)`);
      this.appendLog(`[hall-trip] fallback timer`);
      this.killsAtVisit = this.kills;
      this.regenerateFromHere();
      this.startCycle(this.library[this.scriptBase + 'circle'], this.scriptBase + 'circle');
      return;
    }
    // RT-stalemate breaker: a long refusal streak with no kill means the
    // fight loop is spinning without progress (undamageable target, corpse
    // combat, RT deadlock). Hard-reset the cycle — re-scan finds a live
    // target or wanders, either of which beats spinning until the run ends.
    if (this.rtRefusalStreak >= 12
      && Date.now() - (this.lastKillAt || this.enteredAt || Date.now()) > 90000) {
      this.appendLog(`[rt-stall] ${this.rtRefusalStreak} consecutive RT refusals without a kill — resetting combat cycle`);
      log(`[${this.guild}/${this.race}] rt-stall breaker fired (${this.rtRefusalStreak} refusals)`);
      this.rtRefusalStreak = 0;
      this.lastKillAt = Date.now(); // don't re-fire every tick while resetting
      this.runner?.stop();
      this.runner = null;
      void this.session.cmd('look');
      this.restartCycle();
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

  // Per-minute circle-readiness snapshot. The single most useful number in a
  // progression run is "what is still blocking the next circle, and is that
  // shortfall shrinking?" — kills/hour can look great while a run is
  // permanently blocked on one unreachable slot. Computed from the mindstate
  // ranks we already receive (no extra game commands, so no RT cost) against
  // the same circleRequirements() table the server gates on.
  //
  // Emits, every minute:
  //   [gaps] 4m circle 1->2 blocked:5 shortfall:10 | 1st supernatural 0/2,
  //          2nd weapon 5/8, 1st armor 5/6, ...
  // A flat `shortfall` across the whole run is the signature of a structural
  // blocker (e.g. barbarians with no way to train any supernatural skill)
  // rather than a slow grind.
  gapsLine() {
    const v = this.session.vitals;
    const mins = Math.round((Date.now() - this.startedAt) / 60000);
    // Rank source, in order of trustworthiness:
    //  1. expRanks — parsed from `exp` output ("Expertise  rank 5  40% ...").
    //     AUTHORITATIVE: showExp() lists every skill the character has.
    //  2. vitals.skills — the mindstate feed. INCOMPLETE BY DESIGN: status.js
    //     skips any skill whose pool is empty (`if (!def || pool <= 0)
    //     continue`), because mindstate is a "currently learning" pane. A
    //     skill that has fully converted its exp into ranks DISAPPEARS from
    //     it. Treating absent-as-zero made this line report "parry 0/8" for a
    //     character the DB showed at parry rank 5 — a tracking bug, not a
    //     training one, and it sent me chasing a non-existent blocker.
    const skills = { ...(v.skills || {}), ...(this.expRanks || {}) };
    const shaped = Object.fromEntries(
      Object.entries(skills).map(([id, rank]) => [id, { rank }]));
    const target = (v.circle || 1) + 1;
    let res;
    try {
      res = circleRequirements({ id: this.guild }, shaped, target);
    } catch {
      return null; // unknown guild — nothing useful to report
    }
    const parsed = res.missing.map((m) => {
      const need = Number(m.match(/rank (\d+)/)?.[1] || 0);
      const have = Number(m.match(/(?:you have|is) (\d+)/)?.[1] || 0);
      const what = m.replace(/ at least rank.*$/, '');
      return { what, need, have, short: Math.max(0, need - have) };
    });
    const shortfall = parsed.reduce((s, g) => s + g.short, 0);
    const worst = parsed.slice().sort((a, b) => b.short - a.short).slice(0, 6)
      .map((g) => `${g.what} ${g.have}/${g.need}`).join(', ');
    const totalRanks = Object.values(skills).reduce((s, r) => s + (r || 0), 0);
    const src = this.expRanks ? 'exp' : 'mindstate';
    return `[gaps] ${mins}m circle ${v.circle}->${target} blocked:${parsed.length} shortfall:${shortfall} ranks:${totalRanks} src:${src} | ${worst}`;
  }

  async finish(reason) {
    if (this.done) return;
    this.done = true;
    this.runner?.stop();
    this.session.close();
    this.updateStallVerdict(); // final classification for this run
    this.appendLog(this.progressLine());
    // Why didn't this run circle? Record the final blocking set so a run's own
    // log answers that without re-deriving it from mindstate afterwards.
    const finalGaps = this.gapsLine();
    if (finalGaps) this.appendLog(finalGaps.replace('[gaps]', '[gaps-final]'));
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
      // Leveling lab: first-EXP latency + rank-crossing splits.
      firstExpMs: this.firstExpMs,
      rankSplits: this.rankSplits,
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
        char: this.char,
        totalRanks: this.totalRanksAtFinish ?? null,
      });
      // Leveling-lab columns (guarded migration keeps older DBs working).
      try {
        db.prepare('UPDATE sweeps SET firstExpMs = ?, rankSplits = ? WHERE id = last_insert_rowid()')
          .run(this.firstExpMs ?? null, JSON.stringify(this.rankSplits || []));
      } catch {}
      db.close();
    } catch (e) { log(`[${this.guild}/${this.race}] sweeps-db write failed: ${e.message}`); }
    log(`[${this.guild}/${this.race}] FINISHED run ${RUN_ID} (${reason}): circle ${summary.circle}, fidelity ${summary.fidelityScore}`, JSON.stringify(summary.fidelity));
    log(`[${this.guild}/${this.race}] VERDICT: ${verdictLabel(this.liveVerdict.verdict, this.liveVerdict.reason)}${this.variantName ? ` [variant ${this.variantName}]` : ''}`);
    await this.appendHistory(summary);
    // Refresh the Leveling Lab export (public/live/lab.json) and the
    // Guild Champions leaderboard (public/live/leaderboard.json) so the
    // /sims.html tabs reflect this run without a manual step.
    try {
      const { writeLabData } = await import('./lib/lab-export.mjs');
      writeLabData();
    } catch {}
    try {
      const lb = buildLeaderboard();
      const { writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      writeFileSync(join(LIVE_DIR, 'leaderboard.json'), JSON.stringify(lb));
    } catch {}
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
    // Circle-gap tracking, once a minute: shows exactly which requirements
    // still block the next circle and whether the shortfall is closing.
    const GAPS = setInterval(() => {
      if (this.done) return;
      const line = this.gapsLine();
      if (line) this.appendLog(line);
    }, 60000);
    const HB = setInterval(() => this.heartbeat(), 1000);
    setTimeout(() => {
      clearInterval(PROGRESS); clearInterval(GAPS); clearInterval(HB);
      this.finish(`--minutes ${minutes} elapsed`);
    }, minutes * 60000);
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
  for (const [key, rs] of [...groups].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
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

// --lab: barbarian leveling-efficiency report. Per variant × race medians of:
//   firstExp — enter -> first rank gain (the "is the script alive" metric)
//   +5/+10/+15 — total-rank crossing splits (early leveling velocity)
//   circle1 — time to circle up (when reached)
//   spread — max-min of the above across runs (repeatability)
// Judged on timing AND repeatability: a config that's fast when it works but
// wildly variable loses to a slightly slower, tighter one.
function reportLab() {
  const guild = flag('guild', 'barbarian');
  let rows;
  try {
    const db = openSweepsDb(LIVE_DIR);
    rows = db.prepare(`SELECT run_id, ts, race, variant, kills, durationMs, timeToCircleMs, firstExpMs, rankSplits FROM sweeps WHERE guild = ? AND variant IS NOT NULL`).all(guild);
    db.close();
  } catch (e) { console.log('no sweeps.db yet:', e.message); return; }
  if (!rows.length) { console.log(`no ${guild} variant runs found`); return; }

  const groups = new Map();
  for (const r of rows) {
    const key = `${r.variant}|${r.race}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  console.log(`\n=== ${guild} leveling lab (${rows.length} runs) ===`);
  console.log(pad('variant', 10) + pad('race', 10) + pad('runs', 5)
    + pad('firstEXP', 9) + pad('+5ranks', 9) + pad('+10ranks', 9) + pad('+15ranks', 9)
    + pad('circle1', 8) + 'spread(firstExp..c1)');
  for (const [key, rs] of [...groups].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    const [variant, race] = key.split('|');
    const med = (arr) => {
      const v = arr.filter(Number.isFinite).sort((a, b) => a - b);
      return v.length ? v[Math.floor(v.length / 2)] : null;
    };
    const splits = rs.map((r) => { try { return JSON.parse(r.rankSplits || '[]'); } catch { return []; } });
    const at = (n) => med(splits.map((s) => s.find((x) => x.ranks === n)?.ms));
    const fexp = med(rs.map((r) => r.firstExpMs));
    const c1 = med(rs.map((r) => r.timeToCircleMs));
    // Repeatability: relative spread of the metrics we have. Uses firstExp
    // (always present on healthy runs); '-' when under 2 samples.
    const feVals = rs.map((r) => r.firstExpMs).filter(Number.isFinite).sort((a, b) => a - b);
    const spread = feVals.length >= 2
      ? `±${Math.round(((feVals[feVals.length - 1] - feVals[0]) / 2 / 1000))}s`
      : '-';
    console.log(pad(variant, 10) + pad(race, 10) + pad(String(rs.length), 5)
      + pad(fmtMin(fexp), 9) + pad(fmtMin(at(5)), 9) + pad(fmtMin(at(10)), 9) + pad(fmtMin(at(15)), 9)
      + pad(fmtMin(c1), 8) + spread);
  }
  console.log('\nJudged on timing (median) and repeatability (spread). Shorter is better everywhere.');
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

// Machine-readable leaderboard for the /sims.html "Guild Champions" panel:
// best variant per guild over time, with milestone pacing. Written to
// public/live/leaderboard.json alongside lab.json (refreshed at each run
// finish and by --report).
export function buildLeaderboard() {
let rows = [];
try {
const db = new DatabaseSync(join(LIVE_DIR, 'sweeps.db'), { readOnly: true });
rows = db.prepare(`SELECT run_id, ts, guild, race, grade, circle, kills, deaths,
trains, durationMs, variant, timeToCircleMs, stallVerdict, firstExpMs, rankSplits
FROM sweeps WHERE variant IS NOT NULL ORDER BY ts ASC`).all();
db.close();
} catch { return { guilds: [] }; }
const median = (a) => {
if (!a.length) return null;
const s = [...a].sort((x, y) => x - y);
const m = Math.floor(s.length / 2);
return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const byGV = new Map();
for (const r of rows) {
const k = r.guild + '|' + r.variant;
if (!byGV.has(k)) byGV.set(k, []);
byGV.get(k).push(r);
}
const variants = [...byGV.entries()].map(([k, rs]) => {
const [guild, variant] = k.split('|');
const times = rs.map((r) => r.timeToCircleMs).filter((t) => t != null);
const firstExp = rs.map((r) => r.firstExpMs).filter((t) => t != null);
const splits = {};
for (const r of rs) {
let arr; try { arr = JSON.parse(r.rankSplits || '[]'); } catch { continue; }
for (const sp of arr) {
(splits[sp.ranks] ||= []).push(sp.ms);
}
}
const splitMed = Object.fromEntries(Object.entries(splits).map(([rk, ms]) =>
[rk, median(ms)]));
// Trend: compare the last half of runs' median time-to-circle vs the
// first half — negative = improving.
const chrono = rs.map((r) => r.timeToCircleMs).filter((t) => t != null);
let trend = null;
if (chrono.length >= 4) {
const h = Math.floor(chrono.length / 2);
const older = median(chrono.slice(0, h));
const newer = median(chrono.slice(h));
trend = newer != null && older != null ? newer - older : null;
}
return {
guild, variant, runs: rs.length,
reached: times.length,
bestMs: times.length ? Math.min(...times) : null,
medMs: median(times),
firstExpMedMs: median(firstExp),
splitMedianMs: splitMed,
kills: rs.reduce((s, r) => s + (r.kills || 0), 0),
deaths: rs.reduce((s, r) => s + (r.deaths || 0), 0),
stalls: rs.filter((r) => ['stalled', 'wedged'].includes(r.stallVerdict)).length,
kph: (() => { const v = median(rs.map((r) => r.durationMs > 0 ? r.kills / (r.durationMs / 3600000) : NaN).filter(Number.isFinite)); return v == null ? null : Math.round(v); })(),
trendMs: trend,
lastRunTs: rs[rs.length - 1].ts,
};
});
// Best per guild: finishers ranked by median time-to-circle; non-finishers
// by kills as a tiebreak proxy.
const guilds = {};
for (const v of variants) {
(guilds[v.guild] ||= []).push(v);
}
const out = Object.entries(guilds).map(([g, vs]) => {
vs.sort((a, b) => ((a.medMs ?? Infinity) - (b.medMs ?? Infinity)) || (b.kills - a.kills));
return {
guild: g,
champion: vs[0].variant,
championMedMs: vs[0].medMs,
variants: vs,
};
});
return { generatedAt: new Date().toISOString(), guilds: out };
    }

// ---------------- orchestration ----------------

if (ARGS.includes('--report')) {
  if (ARGS.includes('--lab')) reportLab();
  else if (ARGS.includes('--by-variant')) reportByVariant();
  else report();
  // Regenerate leaderboard.json alongside the report so the Champions
  // panel always reflects the latest data.
  try {
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    writeFileSync(join(LIVE_DIR, 'leaderboard.json'), JSON.stringify(buildLeaderboard()));
  } catch {}
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
