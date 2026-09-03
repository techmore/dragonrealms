// Warmage speedrunning bot: levels to 5 as fast as possible.
//
//   node scripts/warmage-bot.mjs --circle 5 --minutes 15 --boost 50 --name FlameWizard
//
// Variants (--variant): spell-loop (baseline), watchdog-loop, spell-loop-crowded,
//   longHaul (KAIZEN 2026-08-28: hunts 8 kills between town/hall trips instead
//   of 3 — one knob, hypothesis: less commuting => more spell rotations =>
//   faster war_magic/offensive_magic ranks => faster circle-up, at modestly
//   higher death risk).
// Uses WireSession (the same class race-guild-sweep uses) so the bot appears
// as a normal player on all status surfaces: /api/gm/summary, sims.html, etc.
//
import { WireSession, stripAnsi, trackMove, trackRefusedMove } from './lib/wire-session.mjs';
import { liveJob } from './live-log.mjs';
import { circleRequirements } from '../data/guilds.js';
import { ROOMS } from '../data/world.js';

const args = process.argv.slice(2);
const opt = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const TARGET_CIRCLE = Number(opt('--circle', '5'));
const MAX_MINUTES = Number(opt('--minutes', '15'));
const BOOST = Number(opt('--boost', '50'));
const VARIANT = String(opt('--variant', 'spell-loop')).replace(/[^a-zA-Z0-9_-]/g, '') || 'spell-loop';
const PASS = 'SpeedRun!';
const letters = 'abcdefghijklmnopqrstuvwxyz';
const rnd = (n) => letters[Math.floor(Math.random() * n)];
const BOT_NAME = (opt('--name', '') || 'Flm' + Array.from({ length: 5 }, () => rnd(26)).join('')).replace(/[^a-zA-Z]/g, '');
const ACCOUNT = 'wmbot' + BOT_NAME.toLowerCase();

// Sims.html discovers active runs from public/live/index.json and fresh log
// files. Keep the terminal stream, but tee it into the same live-log format
// used by race-guild-sweep so standalone Warmage runs are visible too.
const liveLog = liveJob(`warmage-${VARIANT}-${BOT_NAME}`);
const log = (msg) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  liveLog(line);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- world knowledge (mirrors data/world.js routes) ----
const ZONES = {
  sewers_1: 'sewers', sewers_2: 'sewers', sewers_3: 'sewers',
  woods_path: 'woods', woods_1: 'woods', woods_2: 'woods',
  marsh_1: 'marsh', marsh_2: 'marsh',
};

const ROUTES = {
  // Square -> town green northwest -> northwest road -> temple row -> grate.
  sewers: ['nw', 'nw', 'nw', 'n', 'n', 'n', 'n', 'd'],
  fromSewers: ['up', 's', 's', 's', 's', 'se', 'se', 'se'],
  marsh: ['se', 'e', 'e', 'e'],
  fromMarsh: ['w', 'w', 'w', 'w', 'w', 'w', 'w'],
  // Authoritative square -> Warmage Hall route from data/world.js. The old
  // west/north route dead-ended at dens_square_tg_w_1, so hall training never
  // ran even after the kill counter fix.
  hall: ['ne', 'ne', 'ne', 'e', 'e', 'e', 'ne', 'e', 'e', 'e', 'e', 'e', 'e', 'e'],
  fromHall: ['w', 'w', 'w', 'w', 'w', 'w', 'w', 'sw', 'w', 'w', 'w', 'w', 'w', 'w', 'sw', 'sw', 'sw'],
  market: ['e', 'e'],
  fromMarket: ['w', 'w'],
};

const ARRIVES = {
  sewers: 'sewers_1', marsh: 'marsh_1', hall: 'hall_warmage', market: 'bazaar', square: 'square',
};

const TOWN_TO_SQUARE = {
  square: [],
  tg_n: ['s'], tg_ne: ['sw'], tg_e: ['w'], tg_se: ['nw'], tg_s: ['n'], tg_sw: ['ne'],
  tg_w: ['e'], tg_nw: ['se'], tg_pond: ['up'],
  bazaar: ['w', 'w'], market_plaza: ['n', 'w', 'w'], market_way: ['w', 'w', 'w'],
  bank_plaza: ['w', 'w', 'w', 'w'],
  hall_warmage: ['w', 's', 's', 's', 's', 's', 's', 'e'],
};

// New characters can enter on any square-side room (for example
// dens_square_tg_nw_0), not the literal `square` room. The old runner treated
// those rooms as wilds and never issued its first movement command.
const SQUARE_SIDE_BACK = {
  n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e', nw: 'se',
};

function routeToSquare(room) {
  const match = /^dens_square_tg_(n|ne|e|se|s|sw|w|nw)_(0|1)$/.exec(room || '');
  if (!match) return null;
  const back = SQUARE_SIDE_BACK[match[1]];
  return match[2] === '1' ? [back, back] : [back];
}

// BFS path from the bot's ACTUAL room to `to` using real room exits. Replaces
// the hardcoded ROUTES tables (sewers/marsh/square) which only worked from one
// known start room — from any other room goTown fell through to a generic
// `out out out out out` that never reached `square`, so killsSinceVisit never
// reset and the bot looped "Haul complete -> returning to town" forever without
// hunting (the 25-kill wedge). See KAIZEN note 2026-08-28.
function diskAdj() {
  return (id) => Object.entries(ROOMS[id]?.exits || {}).map(([dir, to]) => ({ dir, to }));
}
function toSquare(from) {
  if (!from) return null;
  if (from === 'square') return [];
  try {
    return session.bfsPath(from, 'square', diskAdj()).map((e) => e.dir);
  } catch {
    return null;
  }
}

// Warmage training priority (from data/guild-scripts.js defaultTrain)
// KAIZEN knob (2026-08-28): how many kills before returning to town/hall.
// Baseline returns every 3 kills (mirrors an early hardcoded commute gate);
// the `longHaul` variant stretches it to 8 so the caster spends more time on
// spell rotations and less walking — one knob vs baseline, hypothesis below.
const HALL_KILLS = VARIANT === 'longHaul' ? 8 : 3;
const TDP_PRIORITY = [
  'war_magic', 'offensive_magic', 'primary_magic', 'summoning',
  'targeted_magic', 'evasion', 'parry', 'chain_armor', 'shield_usage',
  'medium_edged', 'attunement', 'elemental_lore', 'scholarship', 'perception',
];

// ---- state ----
const state = {
  room: null,
  zone: 'town',
  creatures: [],
  corpses: [],
  // Names reported by the room snapshot. WireSession already excludes our
  // own character; keep a local count so hunting is cooperative: if another
  // trainee is present, move on and re-check the next room.
  players: [],
  lastOccupiedLogAt: 0,
  hp: 0, maxHp: 1,
  mana: 0, maxMana: 1,
  circle: 1,
  silver: 0,
  inCombat: false,
  resting: false,
  destination: null,
  queue: [],
  kills: 0,
  trains: 0,
  killsSinceVisit: 0,
  lastPromptAt: 0,
  tdpIdx: 0,
  circleTriedThisVisit: false,
  start: Date.now(),
  missingTrains: [],
  hasShield: false,
  weaponUpgraded: false,
  armorUpgraded: false,
  silverKnown: false,
  lastSendAt: 0,
  entered: false,
  prepared: false,
  wasInCombat: false,
  target: null,
  lastActionAt: Date.now(),
  skills: {},
  lastTelemetryAt: 0,
  requirementSplits: {},
};

function emitTelemetry() {
  if (!session || !state.entered) return;
  const skills = { ...(session.vitals.skills || {}), ...state.skills };
  const shaped = Object.fromEntries(Object.entries(skills).map(([id, rank]) => [id, { rank }]));
  const target = state.circle + 1;
  let req;
  try { req = circleRequirements({ id: 'warmage' }, shaped, target); } catch { return; }
  const rows = req.rows || [];
  const shortfall = rows.reduce((sum, row) => sum + Math.max(0, row.need - row.have), 0);
  const blocked = rows.filter((row) => row.have < row.need).length;
  const totalRanks = Object.values(skills).reduce((sum, rank) => sum + (Number(rank) || 0), 0);
  const top10Sum = Object.values(skills).map(Number).filter(Number.isFinite).sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0);
  const ts = new Date().toISOString();
  for (const row of rows) {
    if (row.have >= row.need && !state.requirementSplits[row.label]) state.requirementSplits[row.label] = ts;
  }
  const mins = Math.round((Date.now() - state.start) / 60000);
  const reqs = rows.map((row) => `${row.label} ${row.have}/${row.need}`).join(', ');
  log(`[gaps] ${mins}m circle ${state.circle}->${target} blocked:${blocked} shortfall:${shortfall} ranks:${totalRanks} src:mindstate | expall:${top10Sum}/${totalRanks} | ts:${ts}`);
  log(`[reqs] ${mins}m c${target} ts:${ts} | ${reqs}`);
  state.lastTelemetryAt = Date.now();
}

// ---- message handlers ----
function parseRoom(m) {
  state.room = m.roomId;
  state.zone = ZONES[m.roomId] || (m.roomId.includes('town') || m.roomId.startsWith('dens_square_') || m.roomId === 'square' ? 'town' : 'wilds');
  state.creatures = [];
  state.corpses = [];
  state.players = Array.isArray(session?.vitals?.players) ? session.vitals.players.slice() :
    (Array.isArray(m.contents?.players) ? m.contents.players.slice() : []);

  const text = stripAnsi(m.msg);
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const c = /^(?:A|An|The)\s+([a-z]+(?: [a-z]+)*?) is here/.exec(line);
    if (c) state.creatures.push(c[1]);
    const corpse = /the corpse of ([a-z]+(?: [a-z]+)*)/.exec(line);
    if (corpse) state.corpses.push(corpse[1]);
  }

  log(`Room: ${m.roomId} | Players: ${state.players.length || 'none'} | Creatures: ${state.creatures.join(', ') || 'none'} | HP: ${state.hp}/${state.maxHp} Mana: ${state.mana}/${state.maxMana}`);

  // Check if we reached our destination
  if (state.destination && state.room === state.destination) {
    const arrivedAt = state.destination;
    state.queue = [];
    state.destination = null;
    log(`Arrived at ${arrivedAt}`);
  }

  decide('room');
}

function parsePrompt(m) {
  const plain = stripAnsi(m.msg);

  const hp = /HP:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
  if (hp) { state.hp = Number(hp[1]); state.maxHp = Number(hp[2]); }

  const mana = /Mana:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
  if (mana) { state.mana = Number(mana[1]); state.maxMana = Number(mana[2]); }

  const circle = /Circle\s*(\d+)/.exec(plain);
  if (circle) {
    const newCircle = Number(circle[1]);
    if (newCircle > state.circle) {
      log(`CIRCLING UP TO ${newCircle}!`);
      state.circle = newCircle;
      state.circleTriedThisVisit = false;
    } else {
      state.circle = newCircle;
    }
  }

  const silver = /(\d+)\s+silvers?/.exec(plain);
  if (silver) state.silver = Number(silver[1]);

  state.inCombat = /\[COMBAT\]/.test(plain);
  state.lastPromptAt = Date.now();
  state.silverKnown = true;

  const rt = /RT:\s*(\d+)/.exec(plain);
  state.rt = rt ? Number(rt[1]) : 0;

  // Check victory
  if (!state.done && state.circle >= TARGET_CIRCLE) {
    finish(`reached circle ${TARGET_CIRCLE}`);
    return;
  }

  decide('prompt');
}

function handleText(text) {
  const t = stripAnsi(text);

  // Circle readiness - try to circle immediately
  if (/ready to circle/i.test(t)) {
    log('Ready to circle!');
    session.cmd('circle');
    state.circleTriedThisVisit = true;
  }

  // Missing requirements
  if (/Missing:/i.test(t)) {
    const match = /Missing: (.+)/i.exec(t);
    if (match) {
      const missing = match[1].split(',').map(s => s.trim().replace(/skills?\s*/i, ''));
      log(`Missing skills: ${missing.join(', ')}`);
      state.missingTrains = missing;
      // If we're at the hall, train the missing skill
      if (state.room === 'hall_warmage') {
        setTimeout(() => {
          const skill = state.missingTrains.shift();
          if (skill) {
            log(`Training missing skill: ${skill}`);
            session.cmd(`train ${skill} 1`);
            state.trains++;
          }
        }, 100);
      }
    }
  }

  // Circle-up success
  if (/You feel yourself grow stronger/i.test(t) || /You are now Rank/i.test(t)) {
    log('Circle-up successful!');
    state.circleTriedThisVisit = false;
    state.missingTrains = [];
  }

  // Fire shard preparation
  if (/You begin preparing Fire Shard/i.test(t)) {
    log('Prepared Fire Shard!');
    state.prepared = true;
  }

  // Fire shard cast
  if (/You cast Fire Shard/i.test(t)) {
    log('Cast Fire Shard!');
    state.prepared = false;
  }

  // Death detection
  if (/You have been slain/i.test(t) || /defeat/i.test(t)) {
    log('We died!');
    state.hp = 0;
    state.inCombat = false;
    state.prepared = false;
  }
}

// ---- decisions ----
function decide(trigger) {
  if (state.done) return;
  if (Date.now() - state.start > MAX_MINUTES * 60 * 1000) {
    finish('time cap reached');
    return;
  }

  if (state.circle >= TARGET_CIRCLE) {
    finish(`reached circle ${TARGET_CIRCLE}`);
    return;
  }

  if (!state.silverKnown) return;

  // Dead at temple - return to square
  if (state.room === 'temple' && state.hp === 0) {
    log('Died - returning to town');
    state.hp = 1;
    goTown();
    return;
  }

  // In combat - handle combat tactics
  if (state.inCombat) {
    // Just entered combat - reset spell preparation
    if (!state.wasInCombat) {
      state.prepared = false;
      log('Entered combat');
    }
    state.wasInCombat = true;
    combatTactics();
    return;
  }
  state.wasInCombat = false;

  // Navigation in progress - advance on room changes
  if (state.queue.length > 0 && trigger === 'room') {
    const next = state.queue.shift();
    if (next) {
      state.lastSendAt = Date.now();
      session.cmd(next);
      log(`Moving: ${next}`);
    }
    return;
  }

  // Health management
  if (state.hp > 0 && state.hp < state.maxHp * 0.5) {
    if (state.hp < state.maxHp * 0.2 && state.zone !== 'town') {
      log(`Badly hurt (${state.hp}/${state.maxHp}) - retreating to town`);
      goTown();
      return;
    } else if (!state.resting) {
      state.resting = true;
      session.cmd('rest');
      return;
    }
  }

  state.resting = false;

  // Mana management for warmage
  if (state.mana < state.maxMana * 0.3 && state.zone !== 'town' && !state.inCombat) {
    if (!state.resting) {
      log(`Low mana (${state.mana}/${state.maxMana}) - resting`);
      state.resting = true;
      session.cmd('rest');
    }
    return;
  }

  // Town business - only if we're actually in town rooms (not wilds)
  if (state.room === 'square' || (state.room && (TOWN_TO_SQUARE[state.room] || routeToSquare(state.room)))) {
    townBusiness();
    return;
  }

  // Wilds business
  wildsBusiness();
}

function townBusiness() {
  const sideRoute = routeToSquare(state.room);
  if (sideRoute) {
    if (state.queue.length === 0) navigate('square', sideRoute);
    return;
  }

  if (state.room === 'square') {
    // Only start navigating if we're not already moving somewhere
    if (state.queue.length > 0) {
      return;
    }

    if (state.silver >= 300 && !state.weaponUpgraded) {
      log(`Buying gear (${state.silver} silvers)`);
      navigate('market', ROUTES.market);
      return;
    }

    if (state.silver >= 250 || state.killsSinceVisit >= HALL_KILLS) {
      log(`Heading to guild hall (${state.silver} silvers)`);
      state.killsSinceVisit = 0;
      navigate('hall', ROUTES.hall);
      return;
    }

    // Hunt in sewers for fast XP
    log('Hunting in sewers');
    navigate('sewers', ROUTES.sewers);
  }

  if (state.room === 'bazaar' || state.room === 'bank_plaza') {
    gearUp();
  }

  if (state.room === 'hall_warmage') {
    hallBusiness();
  }
}

function wildsBusiness() {
  if (state.killsSinceVisit >= HALL_KILLS) {
    log(`Haul complete - returning to town (${state.kills} kills)`);
    goTown();
    return;
  }

  // Never compete for a training room. This is intentionally advisory: we
  // do not lock, eject, or reserve rooms; we simply patrol until the next
  // room snapshot is empty and then hunt there.
  if (state.players.length > 0) {
    const now = Date.now();
    if (now - state.lastOccupiedLogAt > 5000) {
      state.lastOccupiedLogAt = now;
      log(`Room occupied by ${state.players.length} other player(s) — patrolling`);
    }
    patrol();
    return;
  }

  if (state.creatures.length > 0) {
    huntCreature(state.creatures[0]);
    return;
  }

  if (state.corpses.length > 0) {
    session.cmd(`skin ${state.corpses[0]}`);
    return;
  }

  // Patrol to find spawns
  patrol();
}

function combatTactics() {
  if (state.rt > 0) return;

  if (state.hp < state.maxHp * 0.25) {
    session.cmd('flee');
    return;
  }

  // Warmage combat: every prompt must advance the spell cycle. The previous
  // runner prepared a shard, then returned here forever while prepared=true.
  const target = state.target || state.creatures[0];
  if (state.mana >= 15 && target) {
    if (!state.prepared) {
      session.cmd('prepare fire shard');
      state.lastActionAt = Date.now();
      state.prepared = true;
    } else {
      session.cmd(`cast ${target}`);
      state.lastActionAt = Date.now();
      log(`Combat cast Fire Shard at ${target}`);
      state.kills++;
      state.killsSinceVisit++;
      state.prepared = false;
    }
  } else if (target) {
    session.cmd(`attack ${target}`);
    state.lastActionAt = Date.now();
    log(`Combat fallback attack at ${target}`);
    state.kills++;
    state.killsSinceVisit++;
  }
}

function huntCreature(target) {
  if (state.rt > 0) return;
  state.resting = false;
  state.target = target;

  if (state.mana >= 15) {
    if (!state.prepared) {
      // First prepare fire shard
      session.cmd('prepare fire shard');
      state.lastActionAt = Date.now();
      state.prepared = true;
    } else {
      // Now cast at the target
      session.cmd(`cast ${target}`);
      state.lastActionAt = Date.now();
      log(`Cast fire shard at ${target}!`);
      state.kills++;
      state.killsSinceVisit++;
      state.prepared = false;
    }
  } else {
    // Fallback to weapon attack
    session.cmd(`attack ${target}`);
    state.lastActionAt = Date.now();
    state.kills++;
    state.killsSinceVisit++;
  }
}

function gearUp() {
  if (state.silver < 300) {
    log('Not enough silver for gear');
    navigate('square', ROUTES.fromMarket);
    return;
  }

  if (!state.weaponUpgraded) {
    log('Buying staff...');
    session.cmd('buy staff');
    setTimeout(() => {
      session.cmd('wield staff');
      state.weaponUpgraded = true;
      setTimeout(() => navigate('square', ROUTES.fromMarket), 1500);
    }, 1000);
    return;
  }

  if (!state.hasShield) {
    session.cmd('buy shield_wood');
    setTimeout(() => {
      session.cmd('wear shield_wood');
      state.hasShield = true;
    }, 1000);
    return;
  }

  if (!state.armorUpgraded) {
    session.cmd('buy padded cloth armor');
    setTimeout(() => {
      session.cmd('wear padded cloth armor');
      state.armorUpgraded = true;
    }, 1000);
    return;
  }

  log('Gear up complete, returning to square');
  navigate('square', ROUTES.fromMarket);
}

function hallBusiness() {
  state.circleTriedThisVisit = true;

  // Check if we're ready to circle
  if (state.missingTrains && state.missingTrains.length > 0) {
    const skill = state.missingTrains.shift();
    log(`Training missing skill: ${skill}`);
    session.cmd(`train ${skill} 1`);
    state.trains++;
    return;
  }

  // Train ordinary guild skills with silver; TDPs are reserved for stats.
  if (state.tdpIdx < TDP_PRIORITY.length) {
    const skill = TDP_PRIORITY[state.tdpIdx];
    log(`Training skill: ${skill}`);
    session.cmd(`train ${skill} 1`);
    state.trains++;
    state.tdpIdx++;
    return;
  }

  // Try to circle up
  log('Attempting to circle up...');
  session.cmd('circle');

  // After circling, head back to hunting grounds
  setTimeout(() => {
    if (state.circle < TARGET_CIRCLE) {
      navigate('square', ROUTES.fromHall);
    }
  }, 2000);
}

function patrol() {
  const moves = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  const move = moves[state.kills % moves.length];
  session.cmd(move);
}

function navigate(dest, dirs) {
  state.destination = ARRIVES[dest] || dest;
  state.queue = [...dirs];
  log(`Navigating to ${dest}: ${dirs.join(' ')}`);

  // Send first move immediately
  const first = state.queue.shift();
  if (first) {
    state.lastSendAt = Date.now();
    session.cmd(first);
    log(`Moving: ${first}`);
  }
}

function goTown() {
  const path = toSquare(state.room) || routeToSquare(state.room);
  if (path && path.length) {
    navigate('square', path);
  } else if (!path) {
    // BFS failed (room not in graph) — fall back to the generic escape but
    // do NOT assume `out` works; try the side back-route first.
    const side = routeToSquare(state.room);
    navigate('square', side && side.length ? side : ['out', 'out', 'out', 'out', 'out']);
  } else {
    // path === [] means we're already at square.
    navigate('square', []);
  }
}

function finish(reason) {
  if (state.done) return;
  state.done = true;
  const elapsed = Math.round((Date.now() - state.start) / 1000);
  log(`FINISHED: ${reason} | Circle: ${state.circle} | Kills: ${state.kills} | Silver: ${state.silver} | Time: ${elapsed}s`);
  session.ws?.close();
  process.exit(0);
}

// ---- main ----
let session;
let interval;
let timeout;
let progressTimer;

const cleanup = () => {
  if (interval) clearInterval(interval);
  if (timeout) clearTimeout(timeout);
  if (progressTimer) clearInterval(progressTimer);
};

process.on('SIGINT', () => { log('Interrupted'); finish('interrupted'); });
process.on('SIGTERM', () => { log('Terminated'); finish('terminated'); });

async function main() {
  liveLog(`=== sweep run warmage-${VARIANT.toLowerCase()}-${BOT_NAME.toLowerCase()} ${BOT_NAME} (elf warmage ${VARIANT}) ===`);
  log(`Starting warmage ${VARIANT} speedrun: ${BOT_NAME} -> circle ${TARGET_CIRCLE}, boost x${BOOST}`);

  session = new WireSession({
    user: ACCOUNT, pass: PASS, char: BOT_NAME, race: 'elf', guild: 'warmage',
  });

  await session.httpLogin();
  log(`Logged in as ${ACCOUNT}`);

  await session.connect({
    onRoom: (m, changed) => {
      // Room snapshots can arrive without a room-id change when another
      // player enters or leaves. Keep occupancy current even in-place; only
      // run the full decision loop on an actual move to avoid command spam.
      if (Array.isArray(session.vitals.players)) state.players = session.vitals.players.slice();
      if (changed) parseRoom(m);
    },
    onPrompt: (m, plain) => parsePrompt(m),
    onSkills: (skills) => { state.skills = { ...skills }; emitTelemetry(); },
    onText: (text, type) => handleText(text),
    onError: (msg) => log(`[error] ${msg}`),
    onEnter: () => {
      log('Entered the world!');
      state.entered = true;
      if (BOOST > 1) {
        session.sendObj({ t: 'boost', mult: BOOST });
      }
      // Wait for the initial room to settle before starting navigation
      setTimeout(() => {
        if (state.entered && state.silverKnown) {
          log('Starting sewers hunt');
          // Only navigate if we're still in the square and not already moving
          if (state.room === 'square' && state.queue.length === 0) {
            navigate('sewers', ROUTES.sewers);
          }
        }
      }, 3000);
    },
    onFatal: (reason) => finish(reason),
  });

  // Timeout safety
  timeout = setTimeout(() => {
    finish('timeout');
  }, MAX_MINUTES * 60 * 1000);

  // A compact heartbeat keeps the portal's live card useful even while the
  // wire session is waiting on roundtime, navigation, or combat output.
  progressTimer = setInterval(() => {
    if (state.done) return;
    const minutes = Math.floor((Date.now() - state.start) / 60000);
    const deaths = state.hp === 0 ? 1 : 0;
    const circles = Math.max(0, state.circle - 1);
    log(`[progress] ${minutes}m circle ${state.circle} hp ${state.hp}/${state.maxHp} kills ${state.kills} circles ${circles} trains ${state.trains} deaths ${deaths}`);
    // Structured sample for the live multi-sim chart (public/sim-chart.html):
    // warmage bots now feed the same [sample] stream as the sweep so both
    // guilds plot color-coded on one timeline. KAIZEN 2026-08-28.
    const sk = session.vitals?.skills || state.skills || {};
    const ranks = Object.values(sk).reduce((s, r) => s + (Number(r) || 0), 0);
    log(`[sample] ${JSON.stringify({
      t: minutes, guild: 'warmage', race: session.vitals?.race || 'elf', variant: VARIANT,
      circle: state.circle, kills: state.kills, ranks, room: state.room || '-', run: BOT_NAME,
    })}`);
    if (Date.now() - state.lastTelemetryAt >= 60000) emitTelemetry();
    // Recovery path for a stale combat/prompt state. It is deliberately
    // conservative: one fallback attack after 20s of no action, then the
    // normal prompt-driven loop takes over again.
    if (state.zone !== 'town' && state.room && state.room.startsWith('sewers_')
      && Date.now() - state.lastActionAt > 20000) {
      const target = state.target || state.creatures[0] || 'sewer rat';
      state.prepared = false;
      session.cmd(`attack ${target}`);
      state.lastActionAt = Date.now();
      log(`[watchdog] stale combat recovery: attack ${target}`);
    }
  }, 15000);
}

main().catch((err) => {
  log(`Fatal error: ${err.message}`);
  console.error(err);
  cleanup();
  process.exit(1);
});
