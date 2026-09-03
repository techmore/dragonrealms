// Race × guild fidelity sweep: automated characters play through the REAL
// session stack, driven by DR-style scripts (the same engine the browser
// client uses), exercising each guild's signature mechanics.
//
//   node scripts/race-guild-sweep.mjs --guilds warmage,barbarian --minutes 12
//   node scripts/race-guild-sweep.mjs --all            # curated race matrix
//   node scripts/race-guild-sweep.mjs --benchmark barbarian --concurrency 2
//     # two matched workers at once (crowded-world trial; default is 1)
//   node scripts/race-guild-sweep.mjs --benchmark barbarian --fast
//     # 3-worker optimized Circle-5 trial (30-minute iteration cap)
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
import { mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openSweepsDb, insertSweep } from './lib/sweeps-db.mjs';
import { classifyStall, verdictLabel } from './lib/stall-detect.mjs';
import { pad, median, fmtMin, fmtMs } from './lib/report-utils.mjs';
import { refreshLiveIndex } from './lib/live-index.mjs';
import { circleRequirements, circleRequirementNeeds } from '../data/guilds.js';
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
const FAST = ARGS.includes('--fast');
const DEFAULT_BENCH_MINUTES = 20;
// Structured EXP/requirement checkpoints are always 30s; `--fast` no longer
// changes telemetry cadence, so manifests and logs describe one contract.
const EXP_INTERVAL_MS = 30000;
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
const SCRIPT_SCHEMA_VERSION = 2;
const MILESTONE_SCHEMA_VERSION = 1;
const CODE_REVISION = (() => {
  try {
    const rev = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
    return rev + (dirty ? '-dirty' : '');
  } catch { return 'unknown'; }
})();

const { GUILDS } = await import('../data/guilds.js');
const { RACES } = await import('../data/races.js');
const { ROOMS } = await import('../data/world.js');
const { creatureById } = await import('../data/creatures.js');
const { GUILD_SCRIPTS, RACE_MATRIX, VARIANTS } = await import('../data/guild-scripts.js');
const { nounOf, moves, buildHuntScript, buildWeaponRotationScript, buildSharedFightScript, buildCircleScript, buildMegaScript, reversePath, trainListFromMissing } = await import('./lib/script-gen.mjs');
const { WireSession, stripAnsi, trackMove, trackRefusedMove } = await import('./lib/wire-session.mjs');
const { createRunner } = await import('../public/js/script-engine.js');

const LIVE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'live');
try { mkdirSync(LIVE_DIR, { recursive: true }); } catch {}

// Process-wide set of hunting rooms currently held by a live sweep agent.
// MANY agents run in ONE node process (see launchAll's Promise.all), so this
// lets them spread across distinct rooms instead of all converging on the
// single nearest spawn room and starving each other for spawns (the
// "crowded-world" contention the skill docs warn about). Cross-process
// coordination is out of scope — separate `node` invocations each start a
// fresh empty set, which matches the historical parallel-launch behaviour.
const CLAIMED_ARENAS = new Set();

// Loot items a town errand should try to sell at the bazaar: skins-tagged
// drops (pelts/hides the general store buys) from early-game creatures.
// Derived from data/creatures.js so new species flow in automatically.
import { CREATURES } from '../data/creatures.js';
import { ITEMS } from '../data/items.js';
import { NPCS } from '../data/npcs.js';
function errandLootFor(guild) {
  // Which shopkeepers actually buy, anywhere in the world — an item no
  // vendor buys is a wasted sell/bundle line (qvgp run: strongbox and
  // lout_vest spammed 40+ times each, sold zero).
  const bought = new Set();
  for (const npc of Object.values(NPCS)) {
    if (npc.role !== 'shop') continue;
    for (const id of npc.buys || []) bought.add(id);
  }
  const loot = new Set();
  for (const def of Object.values(CREATURES)) {
    if ((def.circle || 1) > 4) continue; // early-game errands only
    for (const id of def.loot || []) {
      // Skins-tagged AND actually purchasable AND not already bundled gear:
      // lootTags can ride along surprise items (strongbox is tagged 'box'
      // on the same creature; lout_vest is tagged 'skins' but is armor no
      // vendor buys and nothing bundleable).
      if ((def.lootTags || []).includes('skins') && bought.has(id) && ITEMS[id]?.type === 'misc') loot.add(id);
    }
  }
  return [...loot];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const BARBARIAN_STAT_ALLOCATION = Object.freeze({ str: 10, con: 10, agi: 5, ref: 5 });
const STAT_ALLOCATION_TOTAL = 30;

// Small deterministic PRNG used only for the optional paired-random policy.
// The seed is derived from race + repeat, never from the variant, so every
// competing script in a repeat receives the same randomized allocation.
function seededRandom(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function statAllocationFor(guild, race, repeat = 1) {
  if (STAT_POLICY === 'none' || MODE !== 'benchmark') return null;
  const fixed = DEFAULT_STAT_ALLOCATION[guild];
  // The canonical allocation is currently defined only for barbarian. Other
  // guilds retain their historical chargen behavior until their own policy
  // is designed and paired-tested.
  if (!fixed) return null;
  if (STAT_POLICY === 'paired-fixed-v1') return { ...fixed };
  // Paired-random keeps the same 30-point physical package but shuffles which
  // primary stat receives each tranche. This creates repeatable variation
  // without allowing one variant to get a different character build.
  const rng = seededRandom(`${guild}|${race}|${repeat}|stat-v1`);
  const stats = Object.keys(fixed);
  for (let i = stats.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [stats[i], stats[j]] = [stats[j], stats[i]];
  }
  const amounts = Object.values(fixed);
  return Object.fromEntries(stats.map((s, i) => [s, amounts[i]]));
}

const DEFAULT_STAT_ALLOCATION = { barbarian: BARBARIAN_STAT_ALLOCATION };

const ALL_GUILDS = Object.keys(GUILDS).filter((g) => GUILD_SCRIPTS[g]);

// ---------------- benchmark variant matrix ----------------
// A variant is a named param set over the generated script library + the
// supervisor interlocks; the SweepAgent applies it at script-build time and
// in supervise(). Definitions (knobs + hypothesis) live in data/guild-scripts.js
// as the single source of truth (top-level VARIANTS export, already in pure
// knob form) — consumed here, by /api/gm/scripts, and by the Sims page.
void VARIANTS; // referenced below via plan parsing

let wanted = [];            // [{guild, race, variant?}]
let MODE = 'sweep';         // 'sweep' | 'benchmark' | 'spawn'
const BENCH_GUILD = flag('benchmark', null);
const SPAWN_SPEC = flag('spawn', null);
// Benchmarks default to one worker so time-to-circle remains a clean
// script-pacing measurement. `--concurrency N` intentionally opts into a
// crowded-world trial: the MUD supports multiple WS sessions, but agents then
// share creature spawns and the result measures resilience under load.
const BENCH_CONCURRENCY = Math.max(1, Math.min(10, Number(flag('concurrency', 3)) || 3));
// A benchmark compares script behavior, so its default character must be
// stable too. Gor'Tog is the canonical physical barbarian in this project;
// the broader race matrix remains available via --race-matrix or --races.
const DEFAULT_BENCH_RACE = { barbarian: 'gortog' };
const STAT_POLICY = String(flag('stat-policy', 'paired-fixed-v1')).toLowerCase();
const VALID_STAT_POLICIES = new Set(['paired-fixed-v1', 'paired-random-v1', 'none']);
if (!VALID_STAT_POLICIES.has(STAT_POLICY)) {
  console.error(`unknown --stat-policy "${STAT_POLICY}" — have: ${[...VALID_STAT_POLICIES].join(', ')}`);
  process.exit(1);
}

if (ARGS.includes('--all')) {
  wanted = ALL_GUILDS.flatMap((g) => RACE_MATRIX[g].map((race) => ({ guild: g, race })));
} else if (BENCH_GUILD) {
  // Benchmark: curated matrix for ONE guild. Default is sequential for a
  // clean pacing comparison; --concurrency N runs N live agents together as
  // an explicit crowded-world measurement.
  const g = BENCH_GUILD;
  if (!ALL_GUILDS.includes(g)) { console.error(`unknown guild "${g}" — have: ${ALL_GUILDS.join(', ')}`); process.exit(1); }
  if (!Number.isFinite(MINUTES)) MINUTES = DEFAULT_BENCH_MINUTES;
  // --variants v1,v2 subsets the matrix; --fast uses the current three-way
  // iteration set: unchanged control plus threshold-aware weapon candidates.
  const names = (flag('variants', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const pick = names.length ? names : FAST
    ? ['baseline', 'edgedBowAware', 'edgedSkinAware']
    : Object.keys(VARIANTS);
  for (const vn of pick) {
    if (!VARIANTS[vn]) { console.error(`unknown variant "${vn}" — have: ${Object.keys(VARIANTS).join(', ')}`); process.exit(1); }
  }
  // --races g1,h2 subsets species; --repeats N runs each cell N times.
  // Without --races, benchmark mode uses one canonical race per guild so
  // script rankings do not silently pool different racial stat profiles.
  // --race-matrix opts back into the curated fit/mid/poor race sweep.
  // (leveling lab: medians + spread need repetition to judge repeatability).
  const raceNames = (flag('races', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const races = raceNames.length ? raceNames
    : ARGS.includes('--race-matrix') ? (RACE_MATRIX[g]?.length ? RACE_MATRIX[g] : ['human'])
      : [DEFAULT_BENCH_RACE[g] || RACE_MATRIX[g]?.[0] || 'human'];
  for (const rc of races) {
    if (!RACES[rc]) { console.error(`unknown race "${rc}" — have: ${Object.keys(RACES).join(', ')}`); process.exit(1); }
  }
  const repeats = Math.max(1, Math.min(10, Number(flag('repeats', 1)) || 1));
  // Interleave A/B legs by repeat (A1, B1, A2, B2...) so a server/runtime
  // drift cannot advantage every run of one variant merely because it ran
  // earlier in the invocation.
  wanted = races.flatMap((race) => Array.from({ length: repeats }, (_, repeat) =>
    pick.map((vn) => ({ guild: g, race, repeat: repeat + 1,
      variant: { name: vn, ...VARIANTS[vn] } }))).flat());
  MODE = 'benchmark';
  if (!Number.isFinite(CIRCLE_TARGET)) CIRCLE_TARGET = 5;
  if (!Number.isFinite(MINUTES)) MINUTES = DEFAULT_BENCH_MINUTES;
  const batches = Math.ceil(wanted.length / BENCH_CONCURRENCY);
  log(`benchmark mode: ${g} × [${pick.join(', ')}] × ${races.join(',')} → ${wanted.length} runs in ${batches} batch${batches === 1 ? '' : 'es'} (concurrency ${BENCH_CONCURRENCY}), ${MINUTES}m cap each, target circle ${CIRCLE_TARGET}, boost x${BOOST}, stats ${STAT_POLICY}${ARGS.includes('--race-matrix') ? ' (race matrix)' : ''}`);
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

  constructor({ guild, race, variant = null, repeat = 1 }) {
    this.guild = guild;
    this.race = race;
    this.repeat = repeat || 1;
    // Benchmark variant: named param set applied to generated scripts +
    // supervisor interlocks (see VARIANTS). Null for normal sweeps.
    this.variant = variant;
    this.variantName = variant?.name || null;
    this.statAllocation = statAllocationFor(guild, race, this.repeat);
    this.statPolicy = this.statAllocation ? STAT_POLICY : 'none';
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
    this.agentTag = agentTag.slice(1);

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
    // Benchmark runs get their own log file so variants never interleave. In
    // concurrent mode each agent also gets a unique suffix; otherwise two
    // live agents would append to the same variant/race file and make the
    // monitor unable to tell which stream belongs to which worker.
    const vTag2 = this.variantName ? '-' + String(this.variantName).replace(/[^a-z0-9]/gi, '') : '';
    const workerTag = MODE === 'benchmark'
      ? `-${RUN_ID}-${agentTag.slice(1)}` : '';
    this.logPath = join(LIVE_DIR, `fidelity-${guild}${vTag2}-${race}${workerTag}.log`);
    this.fidelity = {};       // check name -> count
    this.kills = 0; this.circles = 0; this.deaths = 0; this.trains = 0;
    this.lastHallAt = Date.now(); // NaN-uninitialized made the 4-min fallback trip fire never
    this.commandCounts = { moves: 0, attacks: 0, training: 0, recovery: 0, circle: 0, errands: 0, info: 0, other: 0 };
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
    this.lastTendAt = 0;
    this.scriptsSaved = false;
    this.circleTimes = [];    // [{circle, ms}] wall-clock from enter to EACH circle-up
    // Leveling lab: time-to-first-EXP and total-rank crossings (5/10/15...).
    // firstExpMs = enter -> first mindstate feed where any skill gained a
    // rank vs the enter baseline; rankSplits = [{ranks, ms}] at each RANK_
    // SPLIT crossing of TOTAL summed ranks (the DR "levels" proxy).
    this.firstExpMs = null;
    this.rankSplits = [];
    this.RANK_SPLITS = [5, 10, 15];
    // Circle-gap closure telemetry ([gaps] samples; shortfallFirst/Last).
    this.gapsSamples = [];
    this.expRateSamples = [];
    this.expRatePrevious = null;
    this.shortfallFirst = null;
    this.delta5Base = null;
    this.lastDelta5At = Date.now();
    this.requirementSplits = {};
    this.stateChanges = [];
    this.lastTrackedState = {};
    this.milestoneEvents = [];
    this.milestoneSeen = new Set();
    this.kitParts = { weapon: false, armor: false };
    this.wieldedWeapons = new Set();
    // Flat-progress tracking (drives the flat-progress breaker below):
    // kills+exp-ranks+room sampled each minute against this key/timer.
    this.lastProgressKey = null;
    this.flatSince = Date.now();
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
    // Publish liveness metadata at most once per interval. The previous path
    // rescanned and sorted hundreds of logs after every appended line.
    try { refreshLiveIndex(LIVE_DIR); } catch {}
  }

  recordMilestone(id, detail = '', extra = {}) {
    const key = `${id}:${extra.circle ?? ''}:${extra.target ?? ''}`;
    if (this.milestoneSeen.has(key)) return;
    this.milestoneSeen.add(key);
    const event = {
      id, ms: Math.max(0, Date.now() - (this.enteredAt || this.startedAt)),
      ts: new Date().toISOString(), detail, ...extra,
    };
    this.milestoneEvents.push(event);
    this.appendLog(`[milestone] ${id} ${event.ts}${detail ? ` — ${detail}` : ''}`);
  }

  diskAdj() { return (id) => Object.entries(ROOMS[id]?.exits || {}).map(([dir, to]) => ({ dir, to })); }

  // Pure-disk BFS over ROOMS data, IGNORING the session's learned/observed
  // edge graph (WireSession.bfsPath routes through adjacencyFor, which can be
  // polluted by stale observedEdges from a prior run / reconnect and return a
  // null or empty path even when the room data clearly connects two rooms).
  // Used for baked navigation routes (bazaar -> arena) that MUST be present in
  // the generated script regardless of graph state, so a regenerated hunt
  // script can always walk the agent out of the bazaar to its hunting ground.
  pureDiskPath(from, to) {
    if (!from || !to || !ROOMS[from] || !ROOMS[to]) return null;
    if (from === to) return [];
    const adj = this.diskAdj();
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const cur = q.shift();
      for (const e of adj(cur)) {
        if (prev.has(e.to)) continue;
        prev.set(e.to, { via: cur, dir: e.dir });
        if (e.to === to) {
          const p = [];
          let at = to;
          while (prev.get(at)) { p.unshift(prev.get(at)); at = prev.get(at).via; }
          return p;
        }
        q.push(e.to);
      }
    }
    return null;
  }

  async allocateAtChargen() {
    if (!this.statAllocation) {
      this.session.sendObj({ t: 'enter' });
      return;
    }
    const entries = Object.entries(this.statAllocation).filter(([, n]) => Number(n) > 0);
    const total = entries.reduce((sum, [, n]) => sum + Number(n), 0);
    if (total !== STAT_ALLOCATION_TOTAL) {
      throw new Error(`invalid ${this.statPolicy} allocation: ${total} points (expected ${STAT_ALLOCATION_TOTAL})`);
    }
    this.appendLog(`[chargen] stat policy ${this.statPolicy} · ${entries.map(([s, n]) => `${s} +${n}`).join(', ')}`);
    for (const [stat, amount] of entries) await this.session.cmd(`alloc ${stat} ${amount}`);
    await this.session.cmd('enter');
  }

  nearestSpawnRoom(from) {
    let best = null, bestAny = null;
    const myCircle = this.session.vitals.circle || 1;
    // Skip rooms another live agent already claimed so concurrent agents in
    // this process fan out. If EVERY in-weight-class room is claimed we fall
    // through to bestAny (any reachable room) so an agent is never left with
    // no hunting grounds — overlap then is the lesser evil to a dead agent.
    const exclude = CLAIMED_ARENAS;
    for (const id of Object.keys(ROOMS)) {
      if (!(ROOMS[id].spawns || []).length) continue;
      if (exclude.has(id)) continue;
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

  // Nearest K spawn rooms within our weight class, each with a baked BFS path
  // from `from`. The generated hunt script walks this ladder and hunts in the
  // first room that is EMPTY (%pcount == 0), so agents spread across distinct
  // hunting grounds by reading world state (no shared memory). Paths are
  // rooted at `from` (the arena hub), which is stable for the whole run, so
  // the ladder never goes stale the way gen-time start-room paths would.
  candidateRooms(from, k = 5) {
    const myCircle = this.session.vitals.circle || 1;
    const scored = [];
    for (const id of Object.keys(ROOMS)) {
      if (!(ROOMS[id].spawns || []).length) continue;
      const p = this.session.bfsPath(from, id, this.diskAdj());
      if (!p) continue;
      const tooStrong = ROOMS[id].spawns.some((sid) => {
        const c = creatureById(sid);
        return c && (c.circle || 1) > myCircle + this.arenaBand;
      });
      if (tooStrong) continue;
      scored.push({ id, path: p, len: p.length });
    }
    scored.sort((a, b) => a.len - b.len);
    return scored.slice(0, k).map((r) => ({ id: r.id, fromHere: r.path }));
  }

  async start() {
    await this.session.httpLogin();
    log(`[${this.guild}/${this.race}] authed as ${this.user} (${this.session.knownChar ? 'existing' : 'new'} char)`);
    this.session.connect({
      onCharAlloc: () => this.allocateAtChargen(),
      onEnter: () => {
        this.enteredAt = Date.now();
        this.startingCircle = this.session.vitals.circle || 1;
        this.appendLog(`=== sweep run ${RUN_ID} ${this.char}${this.variantName ? ` [${this.variantName}]` : ''} (${this.race} ${this.guild}) entered ${new Date().toISOString()} ===`);
        this.recordMilestone('world_entry', 'fresh character entered the world', { circle: this.startingCircle });
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
        // The circle-up prose can arrive before WireSession's next prompt has
        // mirrored the new circle into vitals. If we wait for the prose-side
        // check alone, a run that reaches its target keeps hunting until the
        // wall-clock cap (one observed c2 finisher burned the remaining ~7m).
        // The prompt is authoritative and stops the runner as soon as it
        // reflects the requested target.
        if (!this.done && CIRCLE_TARGET > 1 && this.session.vitals.circle >= CIRCLE_TARGET) {
          void this.finish('target circle reached');
          return;
        }
        this.runner?.feed(plain, true);
        this.captureStateChanges();
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
          // Fire once per error burst: a reconnect's own charselect traffic can
          // emit this error too, and stacked retry ladders (one per error) each
          // sending token/charselect/enter would collide mid-handshake.
          const now = Date.now();
          if (this.ghostRetryArmedAt && now - this.ghostRetryArmedAt < 90_000) return;
          this.ghostRetryArmedAt = now;
          const retries = [5, 15, 35, 60];
          for (const delay of retries) {
            setTimeout(() => {
              if (this.done || this.session.vitals.room) return;
              this.appendLog(`[ghost-retry] re-select + enter after ${delay}s`);
              this.session.sendObj({ t: 'token', token: this.session.token });
              setTimeout(() => {
                if (this.done || this.session.vitals.room) return;
                this.session.sendObj({ t: 'charselect', id: this.session.knownChar?.charId ?? 'new' });
                setTimeout(() => {
                  if (this.done || this.session.vitals.room) return;
                  this.session.sendObj({ t: 'enter' });
                }, 1200);
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
        if (!this.rankBaseline) {
          this.rankBaseline = { ...skills };
          this.startingTotalRanks = Object.values(skills).reduce((n, r) => n + (Number(r) || 0), 0);
        }
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
            this.recordMilestone('first_exp', 'first rank gain observed');
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
            this.recordMilestone(`rank_${target}`, `total ranks crossed +${target}`, { ranks: target });
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
    // Claim this room so sibling agents in this process pick a different one
    // (fan-out over spawn rooms instead of all stacking on the nearest).
    CLAIMED_ARENAS.add(arena.id);
    this.recordMilestone('arena_reached', `hunting ground selected: ${arena.id}`, { room: arena.id });
    const bazaarPath = s.bfsPath(room, 'bazaar', this.diskAdj());
    // Reverse the path we actually plan to walk in (bazaar->...->spawn room):
    // live exits can disagree with disk mid-regrid, so derive the return trip
    // from the same edges the outbound leg uses.
    const backFromBazaar = reversePath(bazaarPath);
    // Pure-disk route so a stale learned/observed graph can never null the
    // bazaar -> arena path; the script must always be able to walk out of the
    // bazaar. (WireSession.bfsPath routes through adjacencyFor, which can be
    // polluted by stale observedEdges and return empty even when ROOMS
    // clearly connects bazaar to the arena.)
    const fromBazaar = this.pureDiskPath('bazaar', arena.id)
      ?? (room === arena.id ? backFromBazaar : []);
    const cap = {
      guild: this.guild, race: this.race, char: this.char, circle: s.vitals.circle || 1, scriptBase: this.scriptBase,
      bazaarPath, trainList: null, trainOffset: this.trainOffset || 0,
      defensiveKit: this.guild === 'barbarian',
      survivalBreadth: !!this.variant?.survivalBreadth,
      survivalFocus: !!this.variant?.survivalFocus,
      leaveCombatOnLock: !!this.variant?.leaveCombatOnLock,
      // Variant knobs that alter generated script bodies (not just supervisor
      // tuning) must ride on cap — buildHuntScript/buildCircleScript read
      // them from here. skipRage gates the signature roar behind %rage.
      skipRage: this.variant?.skipRage,
      closeNth: this.variant?.closeNth,
      tdpFloor: this.variant?.tdpFloor,
      helmRetry: this.variant?.helmRetry,
      armorStack: this.variant?.armorStack,
      shieldKit: this.variant?.shieldKit,
      cheapWeaponKit: this.variant?.cheapWeaponKit,
      rotMargin: this.variant?.rotMargin,
      weaponReserve: this.variant?.weaponReserve,
      weaponReserveV2: this.variant?.weaponReserveV2,
      weaponReserveV3: this.variant?.weaponReserveV3,
      edgedKit: this.variant?.edgedKit,
      weaponAware: this.variant?.weaponAware,
      economyFallback: this.variant?.economyFallback,
      rotationSubscript: !!this.variant?.closeNth,
      sharedFight: !!this.variant?.closeNth,
    };
    const huntSrc = buildHuntScript({
      cap,
      hallPath: s.bfsPath(arena.id, 'hall_' + this.guild, this.diskAdj()),
      arena: {
        id: arena.id,
        // After buying, the character is at the bazaar. Use a route whose
        // origin is the bazaar; the old reverse(bazaarPath) only returned to
        // the original starting room when those differed.
        fromArmed: fromBazaar,
        fromHere: s.bfsPath(room, arena.id, this.diskAdj()),
        fromHereOrigin: room,
      },
      // Arena-picking ladder: nearest spawn rooms within weight class, rooted
      // at the arena hub (stable for the whole run). The script walks them and
      // hunts in the first that is empty (%pcount==0) — node-agnostic spread.
      // Use a broad Crossing ladder so three workers cannot deadlock in one
      // three-room pocket. Difficulty filtering still excludes unsafe rooms;
      // the ladder simply retains up to eight safe, reachable alternatives.
      candidates: this.candidateRooms(arena.id, 8),
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
      ...(cap.sharedFight ? { [this.scriptBase + 'fight']: buildSharedFightScript(cap) } : {}),
      ...(this.variant?.closeNth ? { [this.scriptBase + 'rotate']: buildWeaponRotationScript(cap) } : {}),
    };
    this.lastScripts = {
      hunt: huntSrc, circle: circleSrc, mega: megaSrc,
    };
    this.lastScriptMeta = {
      arena: arena.id,
      species: [...new Set(ROOMS[arena.id]?.spawns || [])].map(nounOf),
    };
    for (const [name, body] of Object.entries(this.libraryPending || this.library || {})) {
      s.sendObj({ t: 'scripts_put', name, body });
      await sleep(250);
    }
    this.appendLog(`library saved: ${Object.keys(this.libraryPending || {}).join(', ')} (${huntSrc.split('\n').length} hunt lines)`);
    const weaponKit = this.variant?.edgedKit
      ? 'dagger, broadsword, greatsword, hunting bow'
      : this.variant?.shieldKit
        ? (this.variant?.cheapWeaponKit ? 'dagger, throwing knives, club, staff' : 'dagger, club, broadsword, greatsword')
        : 'adaptive guild kit';
    this.weaponPolicy = `${this.variant?.weaponAware ? 'Nth-aware' : 'standard'} · ${weaponKit}`;
    this.appendLog(`[weapon-policy] ${this.weaponPolicy}`);
    this.recordMilestone('scripts_ready', 'generated hunt, circle, and mega scripts uploaded');
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
    if (name.endsWith('circle')) {
      this.recordMilestone('hall_handoff', `circle/training leg started at circle ${this.session.vitals.circle || 1}`, { circle: this.session.vitals.circle || 1 });
    }
    if (name.endsWith('mega')) this.lastSendAt = Date.now();
    const s = this.session;
    this.runner = createRunner(src, [], {
      roomNow: () => s.vitals.room,
      send: async (line) => {
        const bucket = /^(n|s|e|w|ne|nw|se|sw|up|down|d|out)$/.test(line) ? 'moves'
          : /^attack\b/.test(line) ? 'attacks'
          : /^(tdptrain|train)\b/.test(line) ? 'training'
          : /^(flee|retreat|rest|stand|tend)\b/.test(line) ? 'recovery'
          : /^circle\b/.test(line) ? 'circle'
          : /^(exp|tdp|info|skills|look)\b/.test(line) ? 'info'
          : /^(buy|sell|bundle|withdraw|wear|wield|remove)\b/.test(line) ? 'errands' : 'other';
        this.commandCounts[bucket] += 1;
        if (/^wield\b/.test(line)) {
          this.kitParts.weapon = true;
          const weapon = line.replace(/^wield\s+/, '').trim().toLowerCase();
          if (weapon) this.wieldedWeapons.add(weapon);
          if (this.wieldedWeapons.size >= 2) {
            this.recordMilestone('weapon_coverage', `${this.wieldedWeapons.size} weapon lanes observed`, { count: this.wieldedWeapons.size });
          }
        }
        if (/^wear\b/.test(line)) { this.kitParts.armor = true; this.lastWearCmd = line; }
        if (this.kitParts.weapon && this.kitParts.armor) {
          this.recordMilestone('kit_online', 'starter weapon and armor equipped');
        }
        if (/^(tdptrain|train)\b/.test(line)) {
          this.recordMilestone('training_loop', 'guild training command executed');
        }
        // Verb allowlist for the fidelity log. Anything omitted here is still
        // SENT — it just leaves no trace, which makes "did my change fire?"
        // unanswerable from the log. `learn` was missing, so a working
        // ability-learn step looked like it never ran (grep count 0) even
        // though the script provably contained it and the walk completed.
        // Keep this list in sync when adding scripted verbs.
        if (process.env.SWEEP_DEBUG || /^(attack|tdptrain|train|flee|rest|stand|circle|buy|wear|remove|wield|prepare|cast|khri|enchant|backstab|analyze|roar|meditate|form|learn|drink|effects|stealth|hide|skin|withdraw|sell|bundle|exp|tend)/.test(line)) {

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
        if (/^(tdptrain|train) /.test(line)) { this.trains += 1; this.lastProgressAt = Date.now(); }
        void s.cmd(line);
      },
      onRefusedMove: (dir) => trackRefusedMove(s, dir),
      onDeathPenalty: (m) => this.appendLog(`[death-penalty] ${JSON.stringify(m)}`),
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
      this.recordMilestone('circle_up', `character advanced to circle ${newCircle}`, { circle: newCircle });
      if (this.session.vitals.circle >= CIRCLE_TARGET) return this.finish('target circle reached');
      // Mega finished its circle leg; restart the whole cycle.
      setTimeout(() => this.restartCycle(), 1500);
      return;
    }
    if (/You awaken in the Temple/.test(text)) {
      this.deaths += 1;
      this.appendLog(`[death] #${this.deaths} at ${new Date().toISOString()}`);
      this.recordMilestone('death_recovery', 'death and temple recovery observed', { deaths: this.deaths });
      this.runner?.stop(); this.runner = null;
      setTimeout(() => this.restartCycle(), 3000);
      return;
    }
    if (/dies|slumps|lifeless|stops moving|collapses/.test(text)) {
      this.kills += 1;
      if (this.kills === 1) this.recordMilestone('first_kill', 'first creature defeated');
      this.lastProgressAt = Date.now();
      this.lastKillAt = Date.now();
      this.rtRefusalStreak = 0;
    }
    if (/You sell |You bundle |You have bundled/i.test(stripAnsi(text))) {
      this.recordMilestone('economy_loop', 'loot converted into usable funds');
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
    // Rank ledger from `exp` output — evaluated on EVERY message, not just
    // circle-failure prose. This block was originally nested inside the
    // `not yet ready to circle` branch, so it only ran on a failed hall circle
    // attempt (once or twice a run) and never on the routine per-kill `exp`
    // output it was written for. That is why [gaps] kept reporting
    // src:mindstate with understated ranks (89 reported vs ~104 real) even
    // after `put exp` was firing 22 times per run.
    //
    // showExp() prints EVERY skill the character has
    // ("  Parry Ability   rank 5  0%   clear"), unlike the mindstate feed which
    // omits any skill with an empty pool.
    // DISPLAY NAME != SKILL ID: "Parry Ability" -> parry, "Melee Mastery" ->
    // melee_mastery. Naively snake-casing the label yields parry_ability, which
    // circleRequirements() does not know, so the rank silently reads as 0.
    // Resolve through the SKILLS table's real names instead.
    const plainAll = stripAnsi(text);
    if (/\brank \d+/.test(plainAll)) {
      for (const m of plainAll.matchAll(/^\s{2}(\S.*?)\s{2,}rank (\d+)/gm)) {
        const id = SKILL_ID_BY_NAME[m[1].trim().toLowerCase()];
        if (id) (this.expRanks ||= {})[id] = Number(m[2]);
      }
      // The weapon rotator must see the same authoritative EXP ranks as the
      // circle gate. Mindstate is only a top-10 progress view and can omit
      // converted or low-progress weapon lanes.
      if (this.expRanks) Object.assign(this.session.vitals.skills ||= {}, this.expRanks);
    }
    if (/not yet ready to circle/.test(text)) {
      this.appendLog(`[circle-blocked] ${stripAnsi(text).replace(/\n+/g, ' | ').slice(0, 220)}`);
      this.lastProgressAt = Date.now(); // a circle attempt + curriculum parse is activity
      this.lastCircleBlockText = stripAnsi(text);
      // Retarget: parse the exact missing list so the next hall trip trains
      // the blocking skills instead of the generic curriculum.
      const missing = trainListFromMissing(stripAnsi(text), this.guild,
        { targetNth: !!this.variant?.closeNth, ranks: this.expRanks });
      if (missing.length) {
        this.trainList = missing;
        log(`[${this.guild}/${this.race}] retargeting curriculum: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` +${missing.length - 6}` : ''}`);
        // Rotate the train list start so the NEXT trip leads with different
        // candidates. trainOffset was read by buildCircleScript but never
        // incremented anywhere, so every hall trip trained the same first-N
        // curriculum and TDPs ran out before later set-fillers got any:
        // measured best char had blunt 10 / evasion 14 while large_blunt,
        // staff, thrown all sat at 0 — the fixed order starved them.
        this.trainOffset = (this.trainOffset || 0) + Math.max(1, Math.floor(missing.length / 2));
        // Regenerate the circle script NOW so the next hall trip trains
        // the blocking skills instead of the generic curriculum.
        this.regenerateScripts();
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

  // Pending bazaar-escape walk (set by regenerateFromHere when stranded).
  // Runs a move-only runner that resiliently re-derives the path on refusals.
  walkBazaarEscape(steps) {
    const s = this.session;
    const here = s.vitals.room;
    const fresh = (here && here !== 'bazaar') ? s.bfsPath(here, 'bazaar', this.diskAdj()) : null;
    // bfsPath returns EDGE OBJECTS ({dir,to}) — extract .dir before
    // building move lines. Raw objects used to render "move [object
    // Object]"-style garbage (or a stale first-step dir), refusing every
    // step and wedging the escape loop.
    const dirs = (fresh?.length ? fresh : steps).map((e) => (typeof e === 'string' ? e : e?.dir)).filter(Boolean);
    if (!dirs.length) { this.regenerateFromHere(); return; }
    this.appendLog(`[escape] ${dirs.length} steps from ${here}: ${dirs.join(',')}`);
    // When the escape finishes we are standing SOMEWHERE ELSE than where the
    // current library's baked routes start (regenerateFromHere ran at the
    // strand origin — temple, sewers, wherever). Without a re-bake, the next
    // mega cycle's room-gated arrival legs all skip (origin mismatch) and the
    // agent idles at the bazaar until time runs out (vuld, warmage/dwarf).
    // On arrival: regenerate from the landing room so every route/gate pair
    // matches reality, then start a fresh cycle.
    const done = () => {
      this.appendLog(`[escape] arrived at ${s.vitals.room} — regenerating from here`);
      if (this.arena) CLAIMED_ARENAS.delete(this.arena);
      this.arena = null;
      this.regenerateFromHere();
      if (this.library && !this.done) this.startCycle(this.library[this.scriptBase + 'mega'], this.scriptBase + 'mega');
    };
    const body = dirs.map((d) => 'move ' + d).join('\n') + '\nput look\nwait';
    this.runner = createRunner(body, [], {
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
      onDone: done,
    });
    this.runner.start();
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
      this.walkBazaarEscape(steps);
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
    // Release our prior claim first so a regen can re-pick the same room if it
    // is genuinely the best fit (don't exclude ourselves).
    if (this.arena) CLAIMED_ARENAS.delete(this.arena);
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
    CLAIMED_ARENAS.add(arena.id);
    this.appendLog(`[regen] arena=${arena.id} origin=${s.vitals.room} fromHereLen=${(this.session.bfsPath(s.vitals.room, arena.id, this.diskAdj()) || []).length}`);
    this.regenerateScripts();
  }

  // Rebuild the hunt + circle scripts from the current arena and push
  // them to the account. Used after TDP retargeting (so the next hall
  // trip trains blocking skills) and after regenerating paths.
  regenerateScripts() {
    const s = this.session;
    const arena = this.arena;
    if (!arena) return;
    const cap = { guild: this.guild, race: this.race, char: this.char, circle: s.vitals.circle || 1, scriptBase: this.scriptBase, bazaarPath: null, trainList: this.trainList, trainOffset: this.trainOffset || 0, skipRage: this.variant?.skipRage, closeNth: this.variant?.closeNth, tdpFloor: this.variant?.tdpFloor, helmRetry: this.variant?.helmRetry, armorStack: this.variant?.armorStack, shieldKit: this.variant?.shieldKit, cheapWeaponKit: this.variant?.cheapWeaponKit, rotMargin: this.variant?.rotMargin, weaponReserve: this.variant?.weaponReserve, weaponReserveV2: this.variant?.weaponReserveV2, weaponReserveV3: this.variant?.weaponReserveV3, edgedKit: this.variant?.edgedKit, weaponAware: this.variant?.weaponAware, economyFallback: this.variant?.economyFallback, sharedFight: !!this.variant?.closeNth };
    cap.defensiveKit = this.guild === 'barbarian';
    cap.survivalBreadth = !!this.variant?.survivalBreadth;
    cap.survivalFocus = !!this.variant?.survivalFocus;
    cap.leaveCombatOnLock = !!this.variant?.leaveCombatOnLock;
    cap.skipCircle = !!this.skipCircle;
    cap.rotationSubscript = !!this.variant?.closeNth;
    this.library[this.scriptBase + 'hunt'] = buildHuntScript({
      cap,
      hallPath: s.bfsPath(arena, 'hall_' + this.guild, this.diskAdj()),
      arena: {
        id: arena,
        // Regenerated scripts must still be able to walk out of the bazaar to
        // the arena (the buy/arm check leaves the agent at the bazaar and the
        // WIELD -> ARMED_HERE leg walks fromArmed). It was hardcoded to [],
        // which permanently stranded every re-pathed agent at the bazaar.
        fromArmed: this.pureDiskPath('bazaar', arena) ?? [],
        fromHere: s.bfsPath(s.vitals.room, arena, this.diskAdj()),
        fromHereOrigin: s.vitals.room,
      },
      // Ladder rooted at the arena hub (stable); regen may pick a different
      // arena, so recompute fresh each time.
      candidates: this.candidateRooms(arena, 3),
    });
    this.library[this.scriptBase + 'circle'] = buildCircleScript({
      cap,
      fromArena: {
        // From the agent's CURRENT room, not the arena. Fallback hall trips
        // fire wherever the agent is (bazaar, mid-transit) — a path generated
        // from arena.id starts with moves that don't exist here (run bdas:
        // 16 "You cannot go that way" refusals, first move `up` failing from
        // rooms with no up exit), burning ~3 moves plus a recovery walk per
        // trip. The fallback call sites call regenerateScripts() while the
        // agent is still in the arena — but the readiness-gated site and the
        // parked-watchdog don't guarantee that. s.vitals.room is the honest
        // "where am I standing right now" answer.
        hall: s.bfsPath(s.vitals.room || arena, 'hall_' + this.guild, this.diskAdj()),
        back: s.bfsPath('hall_' + this.guild, arena, this.diskAdj()),
      },
      errands: {
        bazaarPath: s.bfsPath('hall_' + this.guild, 'bazaar', this.diskAdj()),
        returnPath: s.bfsPath('bazaar', arena, this.diskAdj()),
        sellLoot: errandLootFor(this.guild),
      },
    });
    if (cap.sharedFight) this.library[this.scriptBase + 'fight'] = buildSharedFightScript(cap);
    if (this.variant?.closeNth) this.library[this.scriptBase + 'rotate'] = buildWeaponRotationScript(cap);
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
    // POST-FLEE TEND (bleed-out fix): deaths happen AFTER escaping — the
    // agent flees to a safe room at low HP with open wounds and bleeds out
    // (diversity-yahj died in the bazaar at 85/171 HP). If not bleeding,
    // tend is pointless; if bleeding, tend before resting. Free of RT when
    // out of combat; harmless 'no wounds' prose otherwise.
    if ((v.bleeding || []).length && Date.now() - (this.lastTendAt || 0) > 4000) {
      this.lastTendAt = Date.now();
      this.appendLog(`[interlock] bleeding after escape (${v.bleeding.join(', ')}) — tending`);
      void this.session.cmd('tend');
      return; // one tend per prompt; re-evaluate next tick
    }
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
      // NOTE: kills/trains/circle activity all reach the classifier through
      // lastProgressAt (refreshed in onText/startCycle's send hook); the
      // counters themselves are report fields, not classifier inputs.
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
    // NO-SEND BREAKER — must run before every other branch. Measured wedge
    // (run dfix, 2026-08-26): the runner engine parks in prompt/timer mode
    // when server prompts stop arriving, and reports running:true forever.
    // Every rescue below it is gated off in exactly that state: the
    // parked-watchdog needs !inCombat (the COMBAT flag can stick true), the
    // RT-stall breaker needs refusals that have stopped arriving, and this
    // breaker sat at the BOTTOM of the function behind early returns it could
    // never reach. Result: 20+ minutes of total silence with a "wedged"
    // verdict and no recovery. A runner that has sent nothing for 90s is dead
    // regardless of combat flags or refusal streaks — restart unconditionally.
    if (this.runner && Date.now() - (this.lastSendAt || 0) > 90000 && !this.restarting) {
      this.appendLog('[watchdog] no script send for 90s — restarting cycle (unconditional)');
      log(`[${this.guild}/${this.race}] no-send breaker fired`);
      this.lastSendAt = Date.now(); // don't re-fire each tick while restarting
      this.restartCycle();
      return;
    }
    this.updateStallVerdict();

    // PENDING-ESCAPE EXECUTION: regenerateFromHere sets escapePath but only a
    // restartCycle ever walked it — an agent whose sends keep flowing (exp
    // polling) starved in transit rooms with the walk armed forever (measured:
    // champ run lszo, room trav_grove_16, 20+ min of exp with [escape] armed).
    // If a walk is armed and we're not restarting, execute it now.
    if (this.runner && !this.restarting && this.escapePath?.length &&
        this.session.vitals.room !== 'bazaar') {
      const steps = this.escapePath;
      this.escapePath = null;
      this.appendLog('[escape] executing pending bazaar escape from heartbeat');
      this.walkBazaarEscape(steps);
      return;
    }

    // TOWN-STRAND BREAKER (gydk fix): an agent whose hub-gated arrival legs
    // all skipped (post-death respawn, drift) idles in a town/dens room where
    // SCAN can never match a creature. Kills/ranks/room all freeze, but the
    // 6-minute flat breaker is far too slow for a 10-minute run. Detect the
    // strand directly: current room spawns NOTHING and hasn't changed for
    // 45s while out of combat — restart the cycle immediately, which routes
    // through regenerateFromHere (bazaar-escape for transits, fresh arena
    // paths otherwise).
    if (this.runner && !this.restarting && !this.session.vitals.inCombat) {
      const here = this.session.vitals.room;
      if (here && !(ROOMS[here]?.spawns || []).length
        && Date.now() - (this.lastRoomChangeAt || 0) > 45000) {
        this.appendLog(`[watchdog] stranded in creature-less room ${here} — re-pathing`);
        log(`[${this.guild}/${this.race}] town-strand breaker fired at ${here}`);
        this.lastRoomChangeAt = Date.now(); // don't re-fire each tick
        this.restartCycle();
        return;
      }
    }

    // FLAT-PROGRESS BREAKER — must sit with the silence breaker above the
    // early-return interlocks. Sends are liveness, not progress: a script
    // polling `exp`/`look` in a starving loop refreshes lastSendAt every
    // tick, so the 90s-silence breaker never fires there. If kills AND
    // exp-sourced ranks AND room have not changed for 6 minutes, the run is
    // producing nothing — force a cycle restart, which routes through
    // regenerateFromHere.
    if (this.runner && !this.restarting &&
        Date.now() - (this.flatSince || Date.now()) > 360000) {
      this.appendLog('[watchdog] flat kills+ranks+room for 6m — forcing restart/escape');
      log(`[${this.guild}/${this.race}] flat-progress breaker fired`);
      this.flatSince = Date.now(); // don't re-fire each tick while restarting
      this.restartCycle();
      return;
    }

    try { this.runner?.feed('', false); } catch {}
    this.session.injectState(this.runner);
    // Armor-wear retry (server truth): the hands snapshot says whether the
    // wear LANDED. A lost/refused wear left 1st armor at 0/6 for whole runs
    // while the send-side kit check claimed it online.
    if (this.runner && this.session.vitals.armorWorn === false
      && this.lastWearCmd && !this.armorWearRetried && !this.session.vitals.inCombat) {
      this.armorWearRetried = true;
      this.appendLog('[armor] hands show nothing worn — re-sending wear');
      void this.session.cmd(this.lastWearCmd);
    }
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
    if (this.library && v2.room === 'hall_' + this.guild && !this.skipCircle && this.curName !== this.scriptBase + 'circle') {
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
    const requirementsMet = !!(gaps && Object.keys(gaps).length
      && Object.values(gaps).every((g) => g.have >= g.need));
    if (huntingLeg && gaps && Object.keys(gaps).length) {
      // Mindstate omits fully-converted skills; merge the authoritative exp
      // sheet before deciding whether a hall trip is warranted. Otherwise a
      // run can log shortfall:0 yet remain stranded in the hunting loop.
      const skills = { ...(v2.skills || {}), ...(this.expRanks || {}) };
      const moved = Object.entries(gaps).filter(([sk, g]) => (skills[sk] || 0) > g.have);
      const close = Object.values(gaps).every((g) => g.have >= g.need);
      if (!moved.length && !close && this.kills - this.killsAtVisit < 12) {
        return; // silently keep hunting — no log spam, no wasted walk
      }
      if (moved.length) {
        for (const [sk] of moved) gaps[sk].have = skills[sk]; // refresh ledger
        this.appendLog(`[circle-readiness] ranks moved: ${moved.map(([s]) => s).join(', ')} — retrying the hall`);
      } else if (close) {
        const key = `${v2.circle}:${this.kills}`;
        if (this.lastReadinessLogKey !== key) {
          this.lastReadinessLogKey = key;
          this.appendLog('[circle-readiness] requirements met by ranks — retrying circle');
        }
      }
    }
    // TDP-gate the hall trip: with a known balance below the floor there is
    // nothing to train, so skip the walk entirely and keep hunting (kills
    // earn ranks, ranks fill the TDP pool). The generated circle script
    // afford-gates again at the hall in case balance changed en route.
    // Fires at most once per fresh kill (killsAtVisit reset) — not per tick.
    const tdpKnown = Number.isFinite(v2.tdp);
    const tdpFloor = this.variant?.tdpFloor ?? 8;
    if (huntingLeg && tdpKnown && v2.tdp < tdpFloor && !v2.inCombat
      && this.kills > this.killsAtVisit && !requirementsMet) {
      this.appendLog(`[hall-skip] only ${v2.tdp} TDPs — hunting until the pool fills`);
      log(`[${this.guild}/${this.race}] hall skipped: ${v2.tdp} TDPs below floor`);
      this.killsAtVisit = this.kills;
      return;
    }
    if (huntingLeg && !tdpKnown && !v2.inCombat
      && (this.kills - this.killsAtVisit >= 6 || Date.now() - this.enteredAt > 180000)) {
      // Time-based arm: with steady kills the inCombat windows at tick time
      // are narrow — 3 minutes in the field probes TDP regardless of kills.
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
      const skills = { ...(v2.skills || {}), ...(this.expRanks || {}) };
      const shaped = Object.fromEntries(
        Object.entries(skills).map(([id, rank]) => [id, { rank }]));
      let ready = null;
      try {
        ready = circleRequirements({ id: this.guild }, shaped, (v2.circle || 1) + 1);
      } catch { /* unknown guild — fall through to timer trigger */ }
      if (ready?.ok) {
        this.skipCircle = false;
        this.recordMilestone('requirements_met', `circle-${(v2.circle || 1) + 1} requirement ledger reached zero`, { target: (v2.circle || 1) + 1 });
        log(`[${this.guild}/${this.race}] hall trip: circle-${(v2.circle || 1) + 1} requirements MET by mindstate ranks`);
        this.appendLog(`[hall-trip] requirements met (${(v2.circle || 1) + 1}) — circling`);
        this.killsAtVisit = this.kills;
        this.regenerateFromHere();
        this.startCycle(this.library[this.scriptBase + 'circle'], this.scriptBase + 'circle');
        return;
      }
    }
    // Every guild needs a periodic hall visit: Barbarian skill training and
    // ability learning are required for circle gates too. The old guard
    // accidentally excluded all non-economy Barbarian variants, leaving
    // their generated `train` curriculum unreachable and telemetry at zero.
    if (huntingLeg && !v2.inCombat && this.kills > this.killsAtVisit
      && Date.now() - this.lastHallAt > this.hallFallbackMs) {
      this.recordMilestone('hall_handoff', `fallback hall trip at circle ${v2.circle || 1}`, { circle: v2.circle || 1, reason: 'fallback-timer' });
      log(`[${this.guild}/${this.race}] hall trip (fallback timer)`);
      this.appendLog(`[hall-trip] fallback timer`);
      this.killsAtVisit = this.kills;
      this.skipCircle = true;
      // Recompute from the latest gate failure on every visit. Caching the
      // first list starves later armor/survival Nth slots after early rows
      // improve.
      if (this.lastCircleBlockText) {
        const refreshed = trainListFromMissing(this.lastCircleBlockText, this.guild,
          { targetNth: !!this.variant?.closeNth, ranks: this.expRanks || v2.skills || {} });
        if (refreshed.length) this.trainList = refreshed;
      }
      this.trainOffset = 0;
      this.regenerateScripts();
      this.startCycle(this.library[this.scriptBase + 'circle'], this.scriptBase + 'circle');
      return;
    }
    // RT-stalemate breaker: a long refusal streak with no kill means the
    // fight loop is spinning without progress (undamageable target, corpse
    // combat, RT deadlock). Hard-reset the cycle — re-scan finds a live
    // target or wanders, either of which beats spinning until the run ends.
    // Route through restartCycle() alone: it already stops the runner and
    // guards against stacked restarts via `restarting`. Nulling the runner
    // HERE as well raced the heartbeat's restart guard (a runner==null tick
    // between this and restartCycle would startCycle a second mega on top).
    if (this.rtRefusalStreak >= 12
      && Date.now() - (this.lastKillAt || this.enteredAt || Date.now()) > 90000) {
      this.appendLog(`[rt-stall] ${this.rtRefusalStreak} consecutive RT refusals without a kill — resetting combat cycle`);
      log(`[${this.guild}/${this.race}] rt-stall breaker fired (${this.rtRefusalStreak} refusals)`);
      this.rtRefusalStreak = 0;
      this.lastKillAt = Date.now(); // don't re-fire every tick while resetting
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
  }

  progressLine() {
    const v = this.session.vitals;
    const mins = Math.round((Date.now() - this.startedAt) / 60000);
    return `[progress] ${mins}m circle ${v.circle} hp ${v.hp}/${v.maxhp} kills ${this.kills} circles ${this.circles} trains ${this.trains} deaths ${this.deaths} tdp ${v.tdp ?? '?'} silver ${v.silver ?? '?'} boost x${BOOST} fidelity:${JSON.stringify(this.fidelity)} [room ${v.room}] ${verdictLabel(this.liveVerdict.verdict, this.liveVerdict.reason, 90)}`;
  }

  // Structured per-tick sample for the live multi-sim chart (public/sim-chart.html).
  // One line per progress tick; the chart polls public/live/*.log, parses these,
  // groups by guild (from filename), and plots ranks + circle-up markers. KAIZEN 2026-08-28.
  sampleLine() {
    const v = this.session.vitals;
    const mins = Math.round((Date.now() - this.startedAt) / 60000);
    return `[sample] ${JSON.stringify({
      t: mins, guild: this.guild, race: this.race, variant: this.variantName || this.variant?.id || '-',
      circle: v.circle ?? 1, kills: this.kills, ranks: this.totalRanksAtFinish ?? 0,
      room: v.room || '-', run: RUN_ID,
    })}`;
  }

  captureStateChanges() {
    const v = this.session.vitals || {};
    const fields = { circle: v.circle ?? 1, tdp: v.tdp ?? null, silver: v.silver ?? null, weapon: v.wsp || null };
    for (const [kind, value] of Object.entries(fields)) {
      const prev = this.lastTrackedState[kind];
      if (prev === undefined) { this.lastTrackedState[kind] = value; continue; }
      if (value === prev || value == null) continue;
      const change = { kind, from: prev, to: value, ms: Math.max(0, Date.now() - this.startedAt), ts: new Date().toISOString() };
      this.stateChanges.push(change);
      if (this.stateChanges.length > 200) this.stateChanges.shift();
      this.appendLog(`[change] ${change.ts} ${kind} ${prev} -> ${value}`);
      this.lastTrackedState[kind] = value;
    }
  }

  requirementSnapshot() {
    const v = this.session.vitals;
    const skills = { ...(v.skills || {}), ...(this.expRanks || {}) };
    const shaped = Object.fromEntries(Object.entries(skills).map(([id, rank]) => [id, { rank }]));
    try {
      const target = (v.circle || 1) + 1;
      const res = circleRequirements({ id: this.guild }, shaped, target);
      return {
        target,
        missing: res.missing.map((m) => ({
          label: m.replace(/ at least rank.*$/, ''),
          need: Number(m.match(/rank (\d+)/)?.[1] || 0),
          have: Number(m.match(/(?:you have|is) (\d+)/)?.[1] || 0),
        })),
      };
    } catch { return null; }
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
    const gatedTotal = (res.rows || []).reduce((s, r) => s + Number(r.need || 0), 0);
    const gatedProgress = Math.max(0, gatedTotal - shortfall);
    const gatedPct = gatedTotal ? Math.round((gatedProgress / gatedTotal) * 1000) / 10 : 100;
    const worst = parsed.slice().sort((a, b) => b.short - a.short).slice(0, 6)
      .map((g) => `${g.what} ${g.have}/${g.need}`).join(', ');
    const totalRanks = Object.values(skills).reduce((s, r) => s + (r || 0), 0);
    // Ranked contribution list for the Sims page's live "EXP ALL" panel:
    // every skill with ranks, biggest first. top10 rides the line; the UI
    // shows the sum (Σ) and can expand the leaders.
    const rankList = Object.entries(skills)
      .filter(([, r]) => r > 0)
      .sort((a, b) => b[1] - a[1]);
    const top10 = rankList.slice(0, 10);
    const top10Sum = top10.reduce((s, [, r]) => s + r, 0);
    const src = this.expRanks ? 'exp' : 'mindstate';
    // Full have/need requirement table for the Sims page's expanded live
    // card (Olwydd-style at-a-glance row). Same merged rank source as the
    // missing-set above; rides a second line so sampleGaps parsing is
    // untouched. Colors/thresholds live client-side (public/js/req-table.js).
    const splitTs = new Date().toISOString();
    for (const r of (res.rows || [])) {
      if (r.have >= r.need && !this.requirementSplits[r.label]) {
        this.requirementSplits[r.label] = {
          ms: Math.max(0, Date.now() - this.startedAt), ts: splitTs,
          have: r.have, need: r.need,
        };
        // Emit a human-readable crossover so the fidelity log shows the exact
        // minute each c2 requirement is satisfied — the last one is the c2
        // gate / max speed-run time. KAIZEN 2026-08-28.
        const mins = Math.round(this.requirementSplits[r.label].ms / 60000);
        this.appendLog(`[milestone] req_met ${r.label} ${mins}m (${r.have}/${r.need})`);
      }
    }
    const reqs = (res.rows || [])
      .map((r) => `${r.label} ${r.have}/${r.need}`)
      .join(', ');
    return `[gaps] ${mins}m circle ${v.circle}->${target} blocked:${parsed.length} shortfall:${shortfall} gated:${gatedProgress}/${gatedTotal} gatedPct:${gatedPct} ranks:${totalRanks} src:${src}`
      + ` | expall:${top10Sum}/${totalRanks} | ` + top10.map(([id, r]) => `${id} ${r}`).join(', ')
      + ` ts:${splitTs}`
      + `\n[reqs] ${mins}m c${target} ts:${splitTs} | ${reqs}`;
  }

  // Per-interval EXP telemetry. `ranks` is the authoritative total-rank
  // proxy from the merged EXP sheet; recording its delta exposes where a
  // script is actually converting learning into ranks rather than merely
  // producing kills. `over` lists high-ranked skills that are not currently
  // the concrete weakest member of a next-circle requirement, useful for
  // spotting rotation that should switch off sooner.
  expRateLine(sample) {
    const v = this.session.vitals;
    const previous = this.expRatePrevious;
    const elapsedMin = previous
      ? Math.max(1 / 60, ((sample.elapsedSec ?? sample.m * 60) - (previous.elapsedSec ?? previous.m * 60)) / 60)
      : 1;
    const delta = previous && sample.ranks != null && previous.ranks != null
      ? sample.ranks - previous.ranks : 0;
    const rate = delta / elapsedMin;
    const skills = { ...(v.skills || {}), ...(this.expRanks || {}) };
    const shaped = Object.fromEntries(Object.entries(skills).map(([id, rank]) => [id, { rank }]));
    let needed = new Set();
    try {
      needed = new Set(circleRequirementNeeds({ id: this.guild }, shaped, (v.circle || 1) + 1)
        .map((entry) => entry.skill));
    } catch {}
    const over = Object.entries(skills)
      .filter(([id, rank]) => Number(rank) >= 8 && !needed.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, rank]) => `${id}=${rank}`);
    const record = {
      m: sample.m, totalRanks: sample.ranks, delta,
      ranksPerMin: Math.round(rate * 100) / 100,
      shortfall: sample.shortfall, blocked: sample.blocked,
      overtrained: over,
    };
    this.expRateSamples.push(record);
    this.expRatePrevious = sample;
    const gatedTotal = sample.gatedTotal ?? 0;
    const gatedProgress = sample.gatedProgress ?? Math.max(0, gatedTotal - sample.shortfall);
    const gatedDelta = previous && previous.gatedProgress != null ? gatedProgress - previous.gatedProgress : 0;
    record.gatedProgress = gatedProgress;
    record.gatedTotal = gatedTotal;
    record.gatedDelta = gatedDelta;
    return `[exp-rate] ${sample.m}m elapsed:${sample.elapsedSec ?? sample.m * 60}s totalRanks:${sample.ranks} delta:${delta} rate:${record.ranksPerMin}/min gated:${gatedProgress}/${gatedTotal} gatedDelta:${gatedDelta} shortfall:${sample.shortfall} blocked:${sample.blocked} over:${over.join(',') || '-'}`;
  }

  // Parse one [gaps] line into closure-rate telemetry: shortfall at run start
  // vs end (shortfallFirst/shortfallLast) plus every per-minute sample.
  sampleGaps(line) {
    const m = /(\d+)m(?: elapsed:(\d+)s)? circle .*?blocked:(\d+) shortfall:(\d+)(?: gated:(\d+)\/(\d+) gatedPct:[\d.]+)?(?: ranks:(\d+))? src:(\w+)/.exec(line);
    if (!m) return null;
    const sample = {
      m: Number(m[1]), elapsedSec: m[2] != null ? Number(m[2]) : Number(m[1]) * 60,
      blocked: Number(m[3]), shortfall: Number(m[4]),
      gatedProgress: m[5] != null ? Number(m[5]) : null,
      gatedTotal: m[6] != null ? Number(m[6]) : null,
      ranks: m[7] != null ? Number(m[7]) : null, src: m[8],
    };
    this.gapsSamples.push(sample);
    if (this.shortfallFirst == null) this.shortfallFirst = sample.shortfall;
    return sample;
  }

  async finish(reason) {
    if (this.done) return;
    this.done = true;
    // Release our hunting room so a later regen batch (or a fresh agent in a
    // long-lived process) can claim it; prevents a finished agent's room from
    // being permanently off-limits to the rest of the cohort.
    if (this.arena) CLAIMED_ARENAS.delete(this.arena);
    this.runner?.stop();
    this.session.close();
    this.updateStallVerdict(); // final classification for this run
    this.appendLog(this.progressLine());
    this.appendLog(this.sampleLine());
    // Why didn't this run circle? Record the final blocking set so a run's own
    // log answers that without re-deriving it from mindstate afterwards.
    const finalGaps = this.gapsLine();
    if (finalGaps) this.appendLog(finalGaps.replace('[gaps]', '[gaps-final]'));
    // Persist gap telemetry so variants can be ranked by shortfall-closure
    // RATE (short runs become comparable) instead of only by circle-ups,
    // which no barbarian run has ever produced. Parsed back out of the same
    // line format the log uses — one source of truth.
    let gapTelemetry = { shortfall: null, blocked: null };
    if (finalGaps) {
      const sf = /shortfall:(\d+)/.exec(finalGaps);
      const bl = /blocked:(\d+)/.exec(finalGaps);
      gapTelemetry = { shortfall: sf ? Number(sf[1]) : null, blocked: bl ? Number(bl[1]) : null };
      // Feed the final reading through the same sampler as the per-minute
      // ticks so [gaps] lines and the summary row agree exactly.
      this.sampleGaps(finalGaps);
    }
    // Closure-rate telemetry: first/last shortfall + every per-minute sample,
    // so variants compare on ranks-needed-eliminated-per-minute without
    // re-parsing logs. ranks here is exp-sourced when the last [gaps] had
    // src:exp, else the mindstate floor.
    const gapRanks = this.gapsSamples.length
      ? this.gapsSamples[this.gapsSamples.length - 1].ranks : null;
    if ((gapRanks ?? 0) > (this.totalRanksAtFinish || 0)) {
      this.totalRanksAtFinish = gapRanks;
    }
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
      logName: basename(this.logPath, '.log'),
      variant: this.variantName, reason, circle: this.session.vitals.circle, circles: this.circles,
      kills: this.kills, deaths: this.deaths, trains: this.trains,
      refusals: this.refusals || 0,
      circleTimes: this.circleTimes,
      timeToCircleMs: this.circleTimes.find((c) => c.circle >= CIRCLE_TARGET)?.ms ?? null,
      // Leveling lab: first-EXP latency + rank-crossing splits.
      firstExpMs: this.firstExpMs,
      rankSplits: this.rankSplits,
      stallVerdict: this.liveVerdict?.verdict || null, stallReason: this.liveVerdict?.reason || null,
      shortfall: gapTelemetry.shortfall, blocked: gapTelemetry.blocked,
      // Closure-rate telemetry: ranks-needed eliminated per minute is
      // (shortfallFirst - shortfallLast) / minutes, computed downstream from
      // these fields — no log re-parsing needed.
      durationMs: Date.now() - this.startedAt,
      totalRanks: this.totalRanksAtFinish ?? null,
      shortfallFirst: this.shortfallFirst ?? null,
      shortfallLast: gapTelemetry.shortfall,
      gapsSamples: this.gapsSamples,
      expRateSamples: this.expRateSamples,
      milestoneSchemaVersion: MILESTONE_SCHEMA_VERSION,
      milestoneEvents: this.milestoneEvents,
      requirementSplits: this.requirementSplits,
      weaponPolicy: this.weaponPolicy || null,
      stateChanges: this.stateChanges,
      finalTdp: this.session.vitals.tdp ?? null,
      finalSilver: this.session.vitals.silver ?? null,
      // Reproducibility + cohort identity. A/B results are only comparable
      // when these conditions match; future dashboards must not silently
      // pool different boosts, caps, targets, races or generated libraries.
      mode: MODE,
      concurrency: BENCH_CONCURRENCY,
      comparisonType: BENCH_CONCURRENCY > 1 ? 'crowded-world' : 'controlled',
      statPolicy: this.statPolicy,
      statAllocation: this.statAllocation,
      targetCircle: CIRCLE_TARGET,
      boost: BOOST,
      minutesCap: MINUTES,
      arena: this.lastScriptMeta?.arena || this.arena || null,
      species: this.lastScriptMeta?.species || [],
      variantConfig: this.variant ? Object.fromEntries(Object.entries(this.variant)
        .filter(([k]) => k !== 'name' && k !== 'hypothesis')) : null,
      scriptSchemaVersion: SCRIPT_SCHEMA_VERSION,
      codeRevision: CODE_REVISION,
      scriptHash: this.lastScripts ? createHash('sha256')
        .update(Object.entries(this.lastScripts).sort(([a], [b]) => a.localeCompare(b))
          .map(([name, src]) => `${name}\n${src}`).join('\n---\n'))
        .digest('hex').slice(0, 16) : null,
      completedTarget: (this.session.vitals.circle || 1) >= CIRCLE_TARGET,
      startingCircle: this.startingCircle ?? null,
      startingTotalRanks: this.startingTotalRanks ?? null,
      commandCounts: this.commandCounts,
      closurePerMin: this.shortfallFirst != null && gapTelemetry.shortfall != null
        ? Math.round(((this.shortfallFirst - gapTelemetry.shortfall)
          / Math.max(1 / 60, (Date.now() - this.startedAt) / 60000)) * 100) / 100
        : null,
      finalRequirements: this.requirementSnapshot(),
      fidelity: this.fidelity, fidelityScore: `${checksPassed}/${checksTotal}`,
      grade,
    };
    // Persist the generated script library beside the log so the Sims page
    // can show WHAT ran, not just how it scored. Directory name encodes
    // guild-race-variant-<run-id>-<agent-tag>. The agent suffix matters when
    // --concurrency > 1: all workers in one invocation share RUN_ID and
    // variant, so omitting it makes their finish handlers overwrite each
    // other's .dr files/meta.json and the saved-runs index de-duplicates them.
    // The UI discovers runs via index.json instead of guessing names.
    if (this.lastScripts) {
      try {
        const scriptDirName = [
          this.guild, this.race,
          this.variantName || 'adhoc',
          RUN_ID, this.agentTag,
        ].join('-');
        const dir = join(LIVE_DIR, 'scripts', scriptDirName);
        mkdirSync(dir, { recursive: true });
        for (const [nm, body] of Object.entries(this.lastScripts)) {
          if (typeof body !== 'string') continue;
          writeFileSync(join(dir, `${nm}.dr`), body);
        }
        writeFileSync(join(dir, 'meta.json'), JSON.stringify({
          dir: scriptDirName,
          runId: RUN_ID,
          char: this.char, guild: this.guild, race: this.race,
          variant: this.variantName, restPct: this.restPct, hallEvery: this.hallEvery,
          arenaBand: this.arenaBand, hallFallbackMs: this.hallFallbackMs,
          targetCircle: CIRCLE_TARGET, boost: BOOST,
          milestoneSchemaVersion: MILESTONE_SCHEMA_VERSION,
          milestoneEvents: summary.milestoneEvents,
          statPolicy: this.statPolicy, statAllocation: this.statAllocation,
          arena: this.lastScriptMeta?.arena, species: this.lastScriptMeta?.species,
          weaponPolicy: this.weaponPolicy || null,
          ts: summary.ts,
        }, null, 2));
        // Append-only index so the UI lists saved runs without probing.
        const indexPath = join(LIVE_DIR, 'scripts', 'index.json');
        let index = [];
        try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch {}
        index = index.filter((e) => e.dir !== scriptDirName);
        index.push({
          dir: scriptDirName, guild: this.guild, race: this.race,
          variant: this.variantName, ts: summary.ts, char: this.char,
        });
        writeFileSync(indexPath, JSON.stringify(index.slice(-200), null, 2));
      } catch {}
    }
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
        shortfall: gapTelemetry.shortfall, blocked: gapTelemetry.blocked,
        circleTimes: this.circleTimes,
        char: this.char,
        totalRanks: this.totalRanksAtFinish ?? null,
        targetCircle: CIRCLE_TARGET, boost: BOOST, minutesCap: MINUTES,
        mode: MODE, arena: summary.arena, species: summary.species,
        statPolicy: summary.statPolicy, statAllocation: summary.statAllocation,
        concurrency: BENCH_CONCURRENCY,
        comparisonType: summary.comparisonType,
        variantConfig: summary.variantConfig, scriptHash: summary.scriptHash,
        scriptSchemaVersion: SCRIPT_SCHEMA_VERSION,
        codeRevision: CODE_REVISION,
        completedTarget: summary.completedTarget ? 1 : 0,
        closurePerMin: summary.closurePerMin,
        finalRequirements: summary.finalRequirements,
        requirementSplits: summary.requirementSplits,
        stateChanges: summary.stateChanges,
        shortfallFirst: summary.shortfallFirst,
        shortfallLast: summary.shortfallLast,
        gapsSamples: summary.gapsSamples,
        expRateSamples: summary.expRateSamples,
        milestoneEvents: summary.milestoneEvents,
        finalTdp: summary.finalTdp,
        finalSilver: summary.finalSilver,
        startingCircle: summary.startingCircle, startingTotalRanks: summary.startingTotalRanks,
        commandCounts: summary.commandCounts,
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
    this.requirementSplits = {};
    this.stateChanges = [];
    this.lastTrackedState = {};
    this.milestoneEvents = [];
    this.milestoneSeen = new Set();
    this.kitParts = { weapon: false, armor: false };
    this.wieldedWeapons = new Set();
    this.lowHpSince = null;
    this.liveVerdict = { verdict: 'healthy', reason: 'warming up' };
    const PROGRESS = setInterval(() => { if (!this.done) { this.appendLog(this.progressLine()); this.appendLog(this.sampleLine()); } }, 30000);
    // Circle-gap/EXP tracking: sample every 30 seconds so pool stalls and the
    // exact point of divergence are visible without LLM review.
    const GAPS = setInterval(() => {
      if (this.done) return;
      const line = this.gapsLine();
      if (!line) return;
      this.appendLog(line);
      const s = this.sampleGaps(line);
      if (s) {
        this.appendLog(this.expRateLine(s));
        // Five-minute outcome windows make long stalls visible without
        // requiring Kaizen review to compare a wall of one-minute lines.
        // Positive shortfallDelta means the circle gate improved.
        const now = Date.now();
        if (!this.delta5Base) {
          this.delta5Base = { ...s, kills: this.kills, deaths: this.deaths };
          this.lastDelta5At = now;
        } else if (now - this.lastDelta5At >= 5 * 60 * 1000) {
          const base = this.delta5Base;
          this.appendLog(`[delta5] ${JSON.stringify({
            fromMin: base.m, toMin: s.m,
            rankGain: (s.ranks ?? 0) - (base.ranks ?? 0),
            killGain: this.kills - base.kills,
            deathGain: this.deaths - base.deaths,
            shortfallDelta: base.shortfall - s.shortfall,
            blockedDelta: base.blocked - s.blocked,
            shortfall: s.shortfall, blocked: s.blocked,
            room: this.session.vitals?.room || '-',
          })}`);
          this.delta5Base = { ...s, kills: this.kills, deaths: this.deaths };
          this.lastDelta5At = now;
        }
        // Liveness vs progress: `exp`/`look` SENDS refresh lastSendAt, so the
        // 90s-silence breaker cannot catch a starving agent that keeps talking.
        // Measured wedge (runs 2/3 of A/B ab30b): post-death respawn in a
        // safe zone left the hunt's WANDER loop polling look/exp for 15m
        // with zero kills or rank movement. Key on outcomes (kills, exp
        // ranks, room); identical key for FLAT_PROGRESS_MS forces recovery.
        const key = `${this.kills}:${s.ranks ?? '?'}:${this.session.vitals?.room}`;
        if (key !== this.lastProgressKey) {
          this.lastProgressKey = key;
          this.flatSince = Date.now();
        }
      }
    }, 30000);
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
// pad/median/fmtMin/fmtMs live in scripts/lib/report-utils.mjs — shared by
// every report renderer below.

const NOISE_FRAC = 0.1;

// --by-variant: leveling-lab comparison. Groups runs by variant × race ×
// experiment cohort from the sweeps DB and reports median time-to-target-
// circle, per-circle pacing medians, kills/hour, deaths, and a winner line.
// A cohort includes concurrency/target/boost/cap: a crowded-world run must
// never silently pool with a controlled run just because the variant name
// matches. Runs whose time-to-circle is within NOISE_FRAC of the best are
// marked as ties (server-day variance can easily swing a single run by that
// much).

function cliCohortKey(r) {
  return [Number(r.concurrency) || 1, r.comparisonType || ((Number(r.concurrency) || 1) > 1 ? 'crowded-world' : 'controlled'),
    r.targetCircle ?? '?', r.boost ?? '?', r.minutesCap ?? '?', r.statPolicy || 'legacy'].join('|');
}

function reportByVariant() {
  const since = flag('since', null);
  const target = Number(flag('circle', CIRCLE_TARGET));
  let rows;
  try {
    const db = openSweepsDb(LIVE_DIR);
    let sql = 'SELECT run_id, ts, guild, race, variant, circle, kills, circles_up, deaths, durationMs, timeToCircleMs, circleTimes, stallVerdict, concurrency, comparisonType, targetCircle, boost, minutesCap, statPolicy FROM sweeps WHERE variant IS NOT NULL';
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

  // Group by guild|variant|race|cohort. Legacy rows without cohort columns
  // normalize to controlled ×1 so they remain comparable with one-worker
  // controls, but never with a crowded-world cohort.
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.guild}|${r.variant}|${r.race}|${cliCohortKey(r)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  console.log(`\n=== Leveling lab — variants → circle ${target} (${rows.length} runs) ===`);
  console.log(pad('guild', 11) + pad('variant', 10) + pad('race', 10) + pad('cohort', 25)
    + pad('runs', 5) + pad('to-c10', 8) + pad('kills/h', 8) + pad('deaths', 7)
    + pad('verdicts', 20) + 'pacing (median min/circle)');
  for (const [key, rs] of [...groups].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    const [guild, variant, race, ...cohortParts] = key.split('|');
    const cohort = cohortParts.join('|');
    const done = rs.filter((r) => r.timeToCircleMs != null);
    const times = done.map((r) => r.timeToCircleMs).sort((a, b) => a - b);
    const median = times.length ? times[Math.floor(times.length / 2)] : null;
    // Guard the spread: an empty filter yields Infinity, which would mark
    // every (nonexistent-finisher) row as tied with nothing.
    const bestTimes = rows.filter((x) => x.guild === guild && x.race === race && cliCohortKey(x) === cohort && x.timeToCircleMs != null).map((x) => x.timeToCircleMs);
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
    console.log(pad(guild, 11) + pad(variant, 10) + pad(race, 10) + pad(cohort, 25)
      + pad(String(rs.length), 5)
      + pad(median != null ? fmtMin(median) + (tie ? '*' : '') : '-', 8)
      + pad(kph.length ? String(Math.round(kph.reduce((s, x) => s + x, 0) / kph.length)) : '-', 8)
      + pad(String(deaths), 7)
      + pad(verdicts.slice(0, 18), 20)
      + pace.join(' '));
  }
  console.log('\n* = statistically tied with the fastest variant for this guild×race×cohort (±' + Math.round(NOISE_FRAC * 100) + '%)');
  console.log('-'.repeat(30));
}

// --lab: barbarian leveling-efficiency report. Per variant × race × cohort medians of:
//   firstExp — enter -> first rank gain (the "is the script alive" metric)
//   +5/+10/+15 — total-rank crossing splits (early leveling velocity)
//   circle1 — time to circle up (when reached)
//   spread — max-min of the above across runs (repeatability)
// Judged on timing AND repeatability: a config that's fast when it works but
// wildly variable loses to a slightly slower, tighter one.
// --speed: per-run c2 gate (max requirement-crossover minute). The last
// requirement to cross its threshold is the binding constraint on circling —
// i.e. the fastest the character COULD reach circle 2 if the run had walked
// the hall the instant ranks were ready. Surfaces the inferred speed-run
// floor across seeds/variants. KAIZEN 2026-08-28.
function reportSpeed() {
  const since = flag('since', null);
  const guild = flag('guild', 'barbarian');
  let rows;
  try {
    const db = openSweepsDb(LIVE_DIR);
    let sql = 'SELECT run_id, ts, guild, race, variant, circle, durationMs, requirementSplits FROM sweeps WHERE requirementSplits IS NOT NULL AND guild = ?';
    const params = [guild];
    if (since) {
      const cutoff = since === 'today' ? new Date().toISOString().slice(0, 10) : since;
      sql += ' AND ts >= ?'; params.push(cutoff);
    }
    sql += ' ORDER BY ts DESC';
    rows = db.prepare(sql).all(...params);
    db.close();
  } catch (e) { console.log('no sweeps.db yet:', e.message); return; }
  if (!rows.length) { console.log('no runs with requirementSplits found'); return; }
  console.log(`\n=== Speed-run gate — latest c2 requirement crossover (${rows.length} runs, guild ${guild}) ===`);
  console.log(pad('run', 10) + pad('variant', 12) + pad('race', 10) + pad('circle', 7) + 'c2-gate(min)  last-req');
  for (const r of rows) {
    let splits = {};
    try { splits = JSON.parse(r.requirementSplits || '{}'); } catch { /* ignore */ }
    const entries = Object.entries(splits);
    if (!entries.length) continue;
    let gateMin = 0; let lastReq = '-';
    for (const [label, s] of entries) {
      const m = Math.round((s.ms || 0) / 60000);
      if (m > gateMin) { gateMin = m; lastReq = label; }
    }
    console.log(pad(r.run_id, 10) + pad(r.variant || '-', 12) + pad(r.race, 10)
      + pad('c' + r.circle, 7) + pad(gateMin + 'm', 12) + lastReq);
  }
  console.log('-'.repeat(20));
  console.log('c2-gate = minute the LAST requirement crossed — the fastest c2 is reachable if the hall trip fires then.');
}

function reportLab() {
  const guild = flag('guild', 'barbarian');
  let rows;
  try {
    const db = openSweepsDb(LIVE_DIR);
    rows = db.prepare(`SELECT run_id, ts, race, variant, kills, durationMs, timeToCircleMs, firstExpMs, rankSplits, concurrency, comparisonType, targetCircle, boost, minutesCap, statPolicy FROM sweeps WHERE guild = ? AND variant IS NOT NULL`).all(guild);
    db.close();
  } catch (e) { console.log('no sweeps.db yet:', e.message); return; }
  if (!rows.length) { console.log(`no ${guild} variant runs found`); return; }

  const groups = new Map();
  for (const r of rows) {
    const key = `${r.variant}|${r.race}|${cliCohortKey(r)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  console.log(`\n=== ${guild} leveling lab (${rows.length} runs) ===`);
  console.log(pad('variant', 10) + pad('race', 10) + pad('cohort', 25) + pad('runs', 5)
    + pad('firstEXP', 9) + pad('+5ranks', 9) + pad('+10ranks', 9) + pad('+15ranks', 9)
    + pad('circle1', 8) + 'spread(firstExp..c1)');
  for (const [key, rs] of [...groups].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    const [variant, race, ...cohortParts] = key.split('|');
    const cohort = cohortParts.join('|');
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
    console.log(pad(variant, 10) + pad(race, 10) + pad(cohort, 25) + pad(String(rs.length), 5)
      + pad(fmtMin(fexp), 9) + pad(fmtMin(at(5)), 9) + pad(fmtMin(at(10)), 9) + pad(fmtMin(at(15)), 9)
      + pad(fmtMin(c1), 8) + spread);
  }
  console.log('\nJudged on timing (median) and repeatability (spread). Shorter is better everywhere.');
  console.log('-'.repeat(30));
}

// --leaderboard: ranked benchmark table from the sweeps DB — best/median
// wall time to reach the target circle per guild × variant × cohort (races pooled),
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
    let sql = 'SELECT run_id, ts, guild, race, grade, circle, kills, deaths, trains, refusals, durationMs, variant, timeToCircleMs, stallVerdict, concurrency, comparisonType, targetCircle, boost, minutesCap, statPolicy FROM sweeps WHERE variant IS NOT NULL';
    if (guild) { sql += ' AND guild = ?'; params.push(guild); }
    sql += ' ORDER BY ts ASC';
    rows = db.prepare(sql).all(...params);
    db.close();
  } catch { console.log('no sweeps.db yet:', LIVE_DIR); return; }
  if (!rows.length) { console.log(`no benchmark rows yet${guild ? ` for ${guild}` : ''} — run --benchmark <guild> first`); return; }

  // One ranked row per guild x variant x experiment cohort. Pooling different
  // concurrency levels would make a crowded-world trial silently outrank a
  // clean control (and pooling targets/boosts would invalidate time-to-circle).
  const byVariant = new Map();
  for (const r of rows) {
    const k = r.guild + '|' + r.variant + '|' + cliCohortKey(r);
    if (!byVariant.has(k)) byVariant.set(k, []);
    byVariant.get(k).push(r);
  }
  const rankRows = [...byVariant.entries()].map(([k, rs]) => {
    const [g, v, ...cohortParts] = k.split('|');
    const cohort = cohortParts.join('|');
    const times = rs.map((r) => r.timeToCircleMs).filter((t) => t != null);
    return {
      guild: g, variant: v, cohort, runs: rs.length,
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
  console.log(pad('rank', 5) + pad('variant', 10) + pad('guild', 13) + pad('cohort', 25)
    + pad('runs', 5) + pad('reached', 8) + pad('best', 7) + pad('median', 7)
    + pad('kills', 6) + pad('deaths', 7) + pad('kills/h', 8) + pad('stall/wdg', 10));
  rankRows.forEach((r, i) => {
      console.log(pad(String(i + 1), 5) + pad(r.variant, 10) + pad(r.guild, 13)
      + pad(r.cohort, 25)
      + pad(String(r.runs), 5) + pad(`${r.reached}/${r.runs}`, 8)
      + pad(fmtMs(r.best), 7) + pad(fmtMs(r.med), 7)
      + pad(String(r.kills), 6) + pad(String(r.deaths), 7)
      + pad(r.kph != null ? String(Math.round(r.kph)) : '-', 8)
      + pad(String(r.bad), 10));
    });
    }

// Machine-readable leaderboard for the /sims.html "Guild Champions" panel:
// best variant per guild and experiment cohort over time, with milestone pacing. Written to
// public/live/leaderboard.json alongside lab.json (refreshed at each run
// finish and by --report).
export function buildLeaderboard() {
  let rows = [];
  try {
    // A second benchmark process may be committing a row while the Sims
    // leaderboard refreshes. Wait for that writer rather than briefly
    // returning an empty leaderboard and overwriting the last good export.
    const db = new DatabaseSync(join(LIVE_DIR, 'sweeps.db'), { readOnly: true, timeout: 5000 });
rows = db.prepare(`SELECT run_id, ts, guild, race, grade, circle, kills, deaths,
trains, durationMs, variant, timeToCircleMs, stallVerdict, firstExpMs, rankSplits,
concurrency, comparisonType, targetCircle, boost, minutesCap, statPolicy
FROM sweeps WHERE variant IS NOT NULL ORDER BY ts ASC`).all();
    db.close();
  } catch { return { guilds: [] }; }
  const byGV = new Map();
  for (const r of rows) {
    const k = r.guild + '|' + r.variant + '|' + cliCohortKey(r);
    if (!byGV.has(k)) byGV.set(k, []);
    byGV.get(k).push(r);
  }
  const variants = [...byGV.entries()].map(([k, rs]) => {
    const [guild, variant, ...cohortParts] = k.split('|');
    const cohort = cohortParts.join('|');
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
      guild, variant, cohort, concurrency: Number(rs[0].concurrency) || 1,
      comparisonType: rs[0].comparisonType || (Number(rs[0].concurrency) > 1 ? 'crowded-world' : 'controlled'),
      targetCircle: rs[0].targetCircle ?? null, boost: rs[0].boost ?? null,
      minutesCap: rs[0].minutesCap ?? null, runs: rs.length,
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
    // A crowded-world run is useful resilience evidence, but it should not
    // replace the clean pacing champion. Prefer controlled cohorts whenever a
    // guild has one; fall back to crowded-only data when it does not.
    const preferred = vs.filter((v) => v.comparisonType === 'controlled');
    const pool = preferred.length ? preferred : vs;
    pool.sort((a, b) => ((a.medMs ?? Infinity) - (b.medMs ?? Infinity)) || (b.kills - a.kills));
    return {
      guild: g,
      champion: pool[0].variant,
      championMedMs: pool[0].medMs,
      championCohort: pool[0].cohort,
      variants: vs,
    };
  });
  return { generatedAt: new Date().toISOString(), guilds: out };
}

// ---------------- orchestration ----------------

if (ARGS.includes('--report')) {
  if (ARGS.includes('--lab')) reportLab();
  else if (ARGS.includes('--speed')) reportSpeed();
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

// The summary row for a leg arrives only when that leg finishes. This small
// manifest lets /sims.html explain a brand-new benchmark immediately: exact
// plan, current leg, queue, ETA, and the decision rule.
const EXPERIMENT_PATH = join(LIVE_DIR, 'experiment-current.json');
const EXPERIMENT_INDEX_PATH = join(LIVE_DIR, 'experiment-index.json');
const experimentStartedAt = new Date().toISOString();
const experimentWorldPort = Number(process.env.DR_PORT || process.env.PORT || 3000);
const experimentWatchToken = (() => {
  try {
    const tokenPath = `/tmp/dr-world-token-${experimentWorldPort}.json`;
    return JSON.parse(readFileSync(tokenPath, 'utf8')).token || null;
  } catch { return null; }
})();
function writeExperimentState(status, currentIndex = -1, completedLegs = 0, activeIndexes = []) {
  if (MODE !== 'benchmark') return;
  const current = currentIndex >= 0 ? wanted[currentIndex] : null;
  const repeatsPerVariant = Math.max(1, ...wanted.map((w) => w.repeat || 1));
  const requiredFinishes = Math.max(1, Math.ceil(repeatsPerVariant * 2 / 3));
  const plannedMinutes = Math.ceil(agents.length / BENCH_CONCURRENCY) * MINUTES;
  const elapsedMinutes = (Date.now() - Date.parse(experimentStartedAt)) / 60000;
  const active = new Set(activeIndexes);
  const body = {
    runId: RUN_ID, status, mode: MODE,
    startedAt: experimentStartedAt, updatedAt: new Date().toISOString(),
    guild: BENCH_GUILD, targetCircle: CIRCLE_TARGET, boost: BOOST,
    worldPort: experimentWorldPort,
    watchToken: experimentWatchToken,
    minutesPerLeg: MINUTES, totalLegs: agents.length, completedLegs,
    expIntervalSeconds: EXP_INTERVAL_MS / 1000,
    concurrency: BENCH_CONCURRENCY,
    comparisonType: BENCH_CONCURRENCY > 1 ? 'crowded-world' : 'controlled',
    statPolicy: STAT_POLICY,
    currentLeg: current ? currentIndex + 1 : null,
    estimatedRemainingMinutes: status === 'complete' ? 0 : Math.max(0, plannedMinutes - elapsedMinutes),
    decisionRule: `Promote the candidate only if at least ${requiredFinishes} of ${repeatsPerVariant} runs reach circle ${CIRCLE_TARGET} with no worse deaths; tie-break on median time-to-circle.`,
    plan: wanted.map((w, i) => ({
      index: i + 1, guild: w.guild, race: w.race, repeat: w.repeat || 1,
      variant: w.variant?.name || 'baseline', char: agents[i]?.char || null,
      status: i < completedLegs ? 'complete' : active.has(i) || i === currentIndex ? 'running' : 'queued',
    })),
  };
  const encoded = JSON.stringify(body, null, 2);
  // Keep a per-invocation manifest so separate ports/DBs cannot overwrite
  // each other's experiment history. The legacy current pointer remains for
  // older clients; the Sims page prefers the indexed per-run manifests.
  try { writeFileSync(join(LIVE_DIR, `experiment-${RUN_ID}.json`), encoded); } catch {}
  try { writeFileSync(EXPERIMENT_PATH, encoded); } catch {}
  try {
    let index = [];
    try {
      const prior = JSON.parse(readFileSync(EXPERIMENT_INDEX_PATH, 'utf8'));
      // Older builds wrote one manifest object here; normalize it instead of
      // throwing on `.filter`, so the first upgraded run repairs the index.
      index = Array.isArray(prior) ? prior
        : prior?.runId ? [{ runId: prior.runId, status: prior.status,
          updatedAt: prior.updatedAt, path: `/live/experiment-${prior.runId}.json` }] : [];
    } catch {}
    index = index.filter((e) => e.runId !== RUN_ID);
    index.push({ runId: RUN_ID, status, updatedAt: body.updatedAt, path: `/live/experiment-${RUN_ID}.json` });
    writeFileSync(EXPERIMENT_INDEX_PATH, JSON.stringify(index.slice(-50), null, 2));
  } catch {}
}
// Keep the manifest's clock/ETA fresh while a batch is running. Previously
// updatedAt changed only at batch boundaries, so a five-minute concurrent
// batch looked frozen for its entire duration even though all worker logs
// were active. This heartbeat is metadata-only and does not touch the game.
let experimentSnapshot = { currentIndex: 0, completedLegs: 0, activeIndexes: [] };
const experimentHeartbeat = MODE === 'benchmark'
  ? setInterval(() => writeExperimentState('running', experimentSnapshot.currentIndex,
    experimentSnapshot.completedLegs, experimentSnapshot.activeIndexes), 15000)
  : null;
writeExperimentState('running', 0, 0);
// Spawn-a-run contract: print the run-id and log path up front so the
// operator can tail the fidelity log without digging through public/live/.
if (MODE === 'spawn') {
  const a = agents[0];
  console.log(`SPAWNED ${a.guild},${a.race} -> ${a.char} | run-id ${RUN_ID} | log ${a.logPath} | ${MINUTES}m | boost x${BOOST}`);
}

// Benchmark runs are sequential by default so time-to-circle is a clean
// script-pacing measurement. --concurrency N is supported and deliberately
// models a crowded world; compare those results only with other runs using
// the same concurrency. Ad-hoc sweeps keep the historical parallel launch.
async function launchAll() {
  const width = MODE === 'benchmark' ? BENCH_CONCURRENCY : agents.length;
  for (let i = 0; i < agents.length; i += width) {
    const batch = agents.slice(i, i + width);
    const indexes = batch.map((_, j) => i + j);
    if (MODE === 'benchmark') {
      experimentSnapshot = { currentIndex: i, completedLegs: i, activeIndexes: indexes };
      writeExperimentState('running', i, i, indexes);
    }
    await Promise.all(batch.map(async (a, j) => {
      const index = i + j;
      try {
        await a.start();
        a.run(MINUTES);
        if (MODE === 'benchmark') {
          const t0 = Date.now();
          while (!a.done && Date.now() - t0 < (MINUTES + 2) * 60000) await sleep(2000);
          log(`[${a.guild}/${a.race}] benchmark run complete${BENCH_CONCURRENCY > 1 ? ` (worker ${index + 1}/${agents.length})` : ' — next agent'}`);
        }
      } catch (e) {
        log(`[${a.guild}/${a.race}] failed to start: ${e.message}`);
        await a.finish('start-failed');
      }
    }));
    if (MODE === 'benchmark') {
      experimentSnapshot = {
        currentIndex: i + batch.length < agents.length ? i + batch.length : -1,
        completedLegs: i + batch.length, activeIndexes: [],
      };
      writeExperimentState('running', experimentSnapshot.currentIndex,
        experimentSnapshot.completedLegs, experimentSnapshot.activeIndexes);
    }
  }
  if (MODE === 'benchmark') {
    if (experimentHeartbeat) clearInterval(experimentHeartbeat);
    writeExperimentState('complete', -1, agents.length);
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
