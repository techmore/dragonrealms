// Barbarian bot: a live player that registers, hunts, trains, learns
// abilities, and circles — visible in-game and to an authorized GM via
// /spectate.html?name=<bot>.
//
//   node scripts/barbarian-bot.mjs [--name BarbX] [--minutes 5] [--circle 3]
//   node scripts/barbarian-bot.mjs --name Gor10 --minutes 20 --circle 10 --silver 1500 --start-ranks 8
//   npm run bot
//
// The bot plays through the real WebSocket protocol as a normal adventurer:
// shops for gear (basic kit, then circle-gated quartermaster tiers), hunts
// every zone through Blackwood Ruins, learns barbarian arts, spends TDPs on
// the exact skills the circle command reports as missing, and circles up.
// --start-ranks/<skill> and --silver use the separately authorized debug API
// so demos can skip the early grind (DR_ENABLE_DEBUG_API + DR_DEBUG_TOKEN).
import WebSocket from 'ws';

const args = process.argv.slice(2);
const opt = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const MAX_MINUTES = Number(opt('--minutes', '5'));
const TARGET_CIRCLE = Number(opt('--circle', '3'));
const START_SILVER = Number(opt('--silver', '0'));
const START_RANKS = Number(opt('--start-ranks', '0'));
const DEBUG_TOKEN = process.env.DR_DEBUG_TOKEN || '';
const letters = 'abcdefghijklmnopqrstuvwxyz';
const rnd = (n) => letters[Math.floor(Math.random() * n)];
const BOT_NAME = (opt('--name', '') || 'Gor' + Array.from({ length: 5 }, () => rnd(26)).join('')).replace(/[^a-zA-Z]/g, '');
const ACCOUNT = 'bot' + BOT_NAME.toLowerCase();

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- world knowledge (mirrors data/world.js routes) ----
const ZONES = {
  sewers_1: 'sewers', sewers_2: 'sewers', sewers_3: 'sewers',
  woods_path: 'woods', woods_1: 'woods', woods_2: 'woods',
  marsh_1: 'marsh', marsh_2: 'marsh',
  deep_1: 'deepwoods', deep_2: 'deepwoods',
  camp_path: 'camp', camp_hollow: 'camp', camp_den: 'camp',
  cinder_1: 'cinder', cinder_2: 'cinder',
  black_1: 'blackwood', black_2: 'blackwood',
};
const ROUTES = {
  sewers: ['nw', 'w', 'w', 'd'],              // from square (green -> nw_road -> temple row -> sewers_1)
  fromSewers: ['up', 'e', 'e', 'se'],         // sewers_1 -> square
  woods: ['w', 'n', 'w', 'w'],                // from square (tg_w -> west road -> west gate -> woods_path)
  fromWoods: ['e', 'e', 's', 'e'],            // woods_path -> square
  marsh: ['se', 'e', 'e', 'e'],               // from square (tg_se -> east road -> east gate -> marsh_1)
  fromMarsh: ['w', 'w', 'w', 'w', 'w', 'w', 'w'], // marsh_1 -> east gate -> bank plaza -> bazaar -> square
  cinder: ['w', 'n', 'n', 'n', 'e', 'd', 'n'], // square -> camp_den -> cinder_2
  fromCinder: ['s', 'up', 'w', 's', 's', 's', 'e'], // cinder_2 -> square
  blackwood: ['w', 'n', 'w', 'w', 'n', 'n', 'e', 'e', 'd'], // square -> black_2
  fromBlackwood: ['up', 'w', 'w', 's', 's', 'e', 'e', 's', 'e'], // black_2 -> square
  fromDeepWoods: ['w', 's', 's', 'e', 'e', 's', 'e'], // deep_2 -> square (emergency)
  fromCamp: ['s', 's', 'e'],     // camp_path -> square (emergency)
  hall: ['w', 'w', 'n', 'n'],    // from square (tg_w -> guild district -> north row -> barbarian hall)
  fromHall: ['s', 's', 'w', 'e'],
  market: ['e', 'e'],            // from square (tg_e -> bazaar)
  fromMarket: ['w', 'w'],
  fromMarketEnd: ['w', 'w', 'w', 'w'], // bank plaza -> market way -> bazaar -> square
  temple: ['s', 'e', 'e', 'se'], // from temple to square
};
// Room ids each route arrives at (used to detect arrival).
// Return-to-square routes for town rooms the bot can resume or wander into
// (mirrors data/world.js). Used when the bot finds itself off its normal loop.
const TOWN_TO_SQUARE = {
  square: [],
  tg_n: ['s'], tg_ne: ['sw'], tg_e: ['w'], tg_se: ['nw'], tg_s: ['n'], tg_sw: ['ne'],
  tg_w: ['e'], tg_nw: ['se'], tg_pond: ['up'],
  carousel_way: ['s', 's'], carousel: ['s', 's', 's'], hall_street: ['s', 's', 's', 's'],
  town_hall: ['w', 's', 's', 's', 's'],
  north_road: ['s', 's'], north_gate: ['s', 's', 's'],
  jadewater_way: ['w', 's', 's'], jadewater: ['w', 'w', 's', 's'],
  tenderfoot: ['w', 'w', 'w', 's', 's'],
  ne_road: ['w', 'sw'], ne_gate: ['w', 'w', 'sw'], herald_st: ['n', 'w', 'sw'],
  enchanting_soc: ['n', 'n', 'w', 'sw'],
  bazaar: ['w', 'w'], market_plaza: ['n', 'w', 'w'], market_way: ['w', 'w', 'w'],
  bank_plaza: ['w', 'w', 'w', 'w'], market_end: ['s', 'w', 'w', 'w', 'w'],
  brewery: ['s', 'w', 'w', 'w'], forge: ['w', 's', 'w', 'w', 'w'],
  forge_row: ['n', 'w', 'w', 'w'], auction_house: ['n', 'n', 'w', 'w', 'w'],
  commodity_pit: ['w', 'n', 'n', 'w', 'w', 'w'], order_hq: ['s', 'w', 'w', 'w', 'w'],
  east_road: ['w', 'w', 'w', 'w', 'w'], east_gate: ['w', 'w', 'w', 'w', 'w', 'w'],
  middens: ['n', 'w', 'w', 'w', 'w', 'w'], longbow: ['n', 'w', 'w', 'w', 'w', 'w'],
  tatting_st: ['n', 'n', 'w', 'w', 'w', 'w', 'w'],
  riverlace: ['n', 'n', 'n', 'w', 'w', 'w', 'w', 'w'],
  crofton_walk: ['e', 'n', 'n', 'w', 'w', 'w', 'w', 'w'],
  smithy_lane: ['e', 'e', 'n', 'n', 'w', 'w', 'w', 'w', 'w'],
  docks: ['s', 's', 'w', 'w', 'w', 'w'], pier: ['s', 's', 's', 'w', 'w', 'w', 'w'],
  half_pint: ['e', 's', 's', 'w', 'w', 'w', 'w'],
  west_road: ['s', 'e'], west_gate: ['e', 's', 'e'], tailor_shop: ['w', 's', 'e'],
  aldoran_barn: ['n', 'e', 's', 'e'],
  stockyard: ['n', 'n'], south_road: ['n', 'n', 'n'], strand: ['n', 'n', 'n', 'n'],
  strand_communal: ['n', 'n', 'n', 'n', 'n'],
  sw_road: ['e', 'n', 'n', 'n'], segoltha_stair: ['n', 'e', 'n', 'n', 'n'],
  jail: ['up', 'n', 'n'],
  guild_district: ['w', 'e'], guild_halls_n: ['s', 'w', 'e'], guild_halls_s: ['n', 'w', 'e'],
  hall_barbarian: ['s', 's', 'w', 'e'], hall_bard: ['s', 's', 's', 'w', 'e'],
  hall_cleric: ['s', 's', 's', 's', 'w', 'e'], hall_empath: ['s', 's', 's', 's', 's', 'w', 'e'],
  hall_moonmage: ['s', 's', 's', 's', 's', 's', 'w', 'e'],
  hall_necromancer: ['s', 's', 's', 's', 's', 's', 's', 'w', 'e'],
  hall_paladin: ['n', 'n', 'w', 'e'], hall_ranger: ['n', 'n', 'n', 'w', 'e'],
  hall_thief: ['n', 'n', 'n', 'n', 'w', 'e'], hall_trader: ['n', 'n', 'n', 'n', 'n', 'w', 'e'],
  hall_warmage: ['n', 'n', 'n', 'n', 'n', 'n', 'w', 'e'],
  academy: ['w', 'w', 'e'],
  temple_row: ['e', 'e', 'se'], temple: ['s', 'e', 'e', 'se'], high_temple: ['s', 's', 'e', 'e', 'se'],
  immortals_approach: ['s', 's', 's', 'e', 'e', 'se'],
  nw_road: ['e', 'se'],
  fane: ['n', 'e', 'e', 'se'],
};
// Routes from the square to each wilds room the bot can fight/die in
// (mirrors data/world.js). Used to reclaim gear left on a corpse.
const ROOM_ROUTES = {
  sewers_1: ['nw', 'w', 'w', 'd'], sewers_2: ['nw', 'w', 'w', 'd', 'n'], sewers_3: ['nw', 'w', 'w', 'd', 'n', 'n'],
  woods_path: ['w', 'n', 'w', 'w'], woods_1: ['w', 'n', 'w', 'w', 'n'], woods_2: ['w', 'n', 'w', 'w', 's'],
  marsh_1: ['se', 'e', 'e', 'e'], marsh_2: ['se', 'e', 'e', 'e', 's'],
  camp_den: ['w', 'n', 'n', 'n', 'e'],
  cinder_1: ['w', 'n', 'n', 'n', 'e', 'd'], cinder_2: ['w', 'n', 'n', 'n', 'e', 'd', 'n'],
  deep_1: ['w', 'n', 'w', 'w', 'n', 'n'], deep_2: ['w', 'n', 'w', 'w', 'n', 'n', 'e'],
  black_1: ['w', 'n', 'w', 'w', 'n', 'n', 'e', 'e'], black_2: ['w', 'n', 'w', 'w', 'n', 'n', 'e', 'e', 'd'],
};
const ARRIVES = {
  sewers: 'sewers_1', woods: 'woods_path', marsh: 'marsh_1',
  cinder: 'cinder_2', blackwood: 'black_2',
  hall: 'hall_barbarian', market: 'bazaar', square: 'square',
};
const SKINS = ['rat pelt', 'kobold hide', 'goblin hide', 'wolf pelt', 'wisp mote', 'troll hide', 'cinder scale', 'wraith essence', 'silver signet ring', 'iron ore', 'dread knight sigil', 'blood garnet', 'deep sapphire', 'forest emerald', 'cut diamond'];
const TRAIN_PRIORITY = ['large_edged', 'twohanded_edged', 'twohanded_blunt', 'light_armor', 'fitness', 'evasion', 'blunt', 'thrown', 'perception', 'foraging'];
// Circle-gated abilities: learn them when the circle allows.
const ABILITY_MIN_CIRCLE = { whirlwind: 6, war_stomp: 8, choke: 5, dual_load: 7 };
// Skills boosted by --start-ranks: the circle-band requirements, so a
// head-started bot can actually circle up.
const RANK_BOOST_SKILLS = [...TRAIN_PRIORITY, 'medium_edged', 'small_edged', 'chain_armor', 'shield_usage',
  'parry', 'expertise', 'inner_fire', 'tactics', 'stealth', 'hiding', 'skinning', 'appraisal',
  'tracking', 'swimming', 'climbing', 'scholarship'];
const ABILITY_PLAN = ['dragon', 'tenacity', 'serenity', 'everilds_rage', 'screech', 'choke', 'dispel', 'mageslash', 'whirlwind', 'war_stomp', 'dual_load', 'juggernaut', 'duelist', 'titan', 'exemplar'];

// When the circle command says "Nth <skillset>" is short, the bot can't know
// which pool member to raise — so it cycles this candidate list. The lists
// mirror NTH_POOLS in data/guilds.js exactly (hunting/tracking are survival
// *category* skills but never count toward the Nth pools).
const SET_CANDIDATES = {
  survival: ['athletics', 'stealth', 'lockpicking', 'first_aid', 'skinning', 'perception', 'foraging', 'evasion'],
  weapon: ['small_edged', 'large_edged', 'twohanded_edged', 'twohanded_blunt', 'blunt', 'thrown', 'brawling'],
  armor: ['chain_armor', 'shield_usage', 'brigandine'],
  lore: ['scholarship', 'tactics', 'performance', 'appraisal'],
};

// Skills to raise with TDPs at the hall when the circle feedback queue is
// empty. Every entry is a real member of an Nth pool (data/guilds.js
// NTH_POOLS) — skills like hunting/tracking never count toward the pools.
const TDP_PRIORITY = [
  // hard band-table skills (combat grows evasion/parry/inner_fire, but slowly)
  'expertise', 'inner_fire', 'parry',
  // weapon pool: the bot fights with one blade — rank the rest for the Nth pool
  'small_edged', 'large_edged', 'twohanded_edged', 'twohanded_blunt', 'blunt', 'thrown', 'brawling',
  // armor pool: a second armor type for the Nth pool
  'chain_armor', 'shield_usage',
  // survival pool (combat grows evasion)
  'athletics', 'stealth', 'lockpicking', 'first_aid', 'skinning', 'perception', 'foraging',
  // lore pool
  'scholarship', 'tactics', 'performance', 'appraisal',
];

// Tiered gear from the quartermaster (bank plaza, east of the market), circle-gated like
// the simulator's gear ladder. Basic kit comes from the market stalls.
const BASIC_KIT = ['buy short_sword', 'buy leather', 'buy shield_wood', 'wield short_sword', 'wear leather', 'wear shield_wood'];
const GEAR_BRACKETS = [
  { min: 3, steps: ['buy steel_sword', 'wield steel_sword', 'buy studded', 'wear studded'] },
  { min: 4, steps: ['buy chainmail', 'wear chainmail'] },
  { min: 6, steps: ['buy ring_mail', 'wear ring_mail', 'buy steel_shield', 'wear steel_shield'] },
  { min: 7, steps: ['buy mithril_blade', 'wield mithril_blade'] },
  { min: 10, steps: ['buy dragonsteel_greatsword', 'wield dragonsteel_greatsword'] },
];
function tierSteps() {
  return GEAR_BRACKETS
    .filter((b) => b.min <= state.circle && state.gearTier < b.min)
    .map((b) => b.steps).flat();
}

const state = {
  phase: 'connect',        // connect -> login -> chargen -> alloc -> playing
  name: BOT_NAME,
  room: null,
  zone: 'town',
  creatures: [],
  corpses: [],
  hp: 0, maxHp: 1, fire: 0, circle: 1, silver: 0,
  inCombat: false,
  resting: false,
  restLookAt: 0,
  reclaim: null, // { room, items, step, equipped } — corpse recovery after death
  queue: [],               // navigation directions
  destination: null,
  kills: 0,
  killsSinceVisit: 0,
  failedMoves: 0,
  lastPromptAt: 0,
  trainIdx: 0,
  learnIdx: 0,
  tdpIdx: 0,
  marketStep: 0,
  hasMagesLash: false,
  silverKnown: false,
  boughtGear: false,
  gearTier: 0,
  tdpTrainedThisVisit: 0,
  missingTrains: [],
  circleAttempts: 0,
  circleTriedThisVisit: false,
  learnTriedThisVisit: false,
  waitingToCircle: false,
  start: Date.now(),
  pendingErrand: null,
};

const ws = new WebSocket('ws://localhost:3000/ws?bot=1');
const send = (o) => {
  if (o.t === 'input') log(`cmd: ${o.line}`);
  ws.send(JSON.stringify(o));
};

// Server allows 20 commands/sec; stay far below it.
let lastCmdAt = 0;
const cmdQueue = [];
function sendCmd(line) {
  cmdQueue.push(line);
  pump();
}
async function pump() {
  if (pumping) return;
  pumping = true;
  while (cmdQueue.length) {
    const wait = 140 - (Date.now() - lastCmdAt);
    if (wait > 0) await sleep(wait);
    lastCmdAt = Date.now();
    send({ t: 'input', line: cmdQueue.shift() });
  }
  pumping = false;
}
let pumping = false;

// ---------------- message parsing ----------------
function parseRoom(msg) {
  state.room = msg.roomId;
  state.zone = ZONES[msg.roomId] || 'town';
  state.creatures = [];
  state.corpses = [];
  for (const raw of String(msg.msg).split('\n')) {
    const line = raw.replace(/\x1b\[\d+m/g, '');
    const c = /^\s*(?:A|An|The)\s+([a-z]+(?: [a-z]+)*?) is here/.exec(line.trim());
    if (c) state.creatures.push(c[1]);
    const corpse = /the corpse of ([a-z]+(?: [a-z]+)*)/.exec(line.trim());
    if (corpse) state.corpses.push(corpse[1]);
  }
}

function parsePrompt(msg) {
  const plain = String(msg.msg).replace(/\x1b\[\d+m/g, '');
  const hp = /HP:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
  if (hp) { state.hp = Number(hp[1]); state.maxHp = Number(hp[2]); }
  const fire = /Fire:\s*(\d+)\s*\/\s*(\d+)/.exec(plain) || /Mana:\s*(\d+)/.exec(plain);
  if (fire) state.fire = Number(fire[1]);
  const circle = /Circle\s*(\d+)/.exec(plain);
  if (circle) state.circle = Number(circle[1]);
  const silver = /(\d+)\s+silvers?/.exec(plain);
  if (silver) state.silver = Number(silver[1]);
  state.inCombat = /\[COMBAT\]/.test(plain);
  state.lastPromptAt = Date.now();
  state.silverKnown = true;
  const rt = /RT:\s*(\d+)/.exec(plain);
  state.rt = rt ? Number(rt[1]) : 0;
}

// ---------------- navigation ----------------
function navigate(dest, dirs) {
  state.destination = ARRIVES[dest] || dest;
  state.queue = [...dirs];
  step();
}

// Get to the square from anywhere: exit the zone first if needed.
function goTown() {
  if (state.zone !== 'town') {
    navigate('square', ROUTES['from' + cap(state.zone)]);
  } else {
    navigate('square', []);
  }
}

function step() {
  const dir = state.queue[0];
  if (!dir) return;
  sendCmd(dir);
}

// ---------------- decisions ----------------
function decide(trigger) {
  if (state.phase !== 'playing') return;
  if (Date.now() - state.start > MAX_MINUTES * 60 * 1000) return finish('time cap reached');
  if (state.circle >= TARGET_CIRCLE) return finish(`reached circle ${TARGET_CIRCLE}`);
  // Wait for the first prompt before choosing: silver/HP are unknown until then.
  if (!state.silverKnown) return;

  // Dead at the temple: reclaim and resume.
  if (state.room === 'temple') {
    log('died — returning to the square');
    navigate('square', ROUTES.temple);
    return;
  }

  // Re-equip gear just reclaimed from a corpse (one piece per prompt).
  if (state.reequip && state.reequip.length) {
    sendCmd(`wear ${state.reequip.shift()}`);
    return;
  }

  // Corpse recovery: head back to where we fell and reclaim the gear.
  if (state.reclaim) {
    if (state.room !== state.reclaim.room) {
      const route = ROOM_ROUTES[state.reclaim.room];
      if (!route) {
        log(`no route back to ${state.reclaim.room} — leaving the corpse`);
        state.reclaim = null;
      } else {
        log(`reclaiming gear in ${state.reclaim.room}`);
        navigate(state.reclaim.room, route);
      }
      return;
    }
    reclaimGear();
    return;
  }

  if (state.inCombat) return combatTactics();

  // In the middle of a route: on each room arrival, pop the direction we just
  // took and send the next one. When the destination is reached, fall through
  // to the normal decision logic.
  if (state.queue.length) {
    if (state.destination === state.room) {
      state.queue = [];
      state.destination = null;
    } else if (trigger === 'room') {
      state.queue.shift();
      step();
      return;
    } else {
      return;
    }
  }

  // Recover before anything else: retreat to town if badly hurt, else rest
  // to fighting strength (85%). Rest sends its own ticks — never re-issue it
  // while already resting, and the watchdog skips resting players so it can
  // finish. "You rise" clears the flag via the msg handler.
  if (state.hp > 0 && state.hp < state.maxHp * 0.85) {
    if (state.hp < state.maxHp * 0.4 && state.zone !== 'town') {
      log(`badly hurt (${state.hp}/${state.maxHp}) — retreating to the square`);
      goTown();
    } else if (!state.resting) {
      state.resting = true;
      sendCmd('rest');
    }
    return;
  }
  state.resting = false;

  // Town errands.
  if (state.zone === 'town') {
    if (state.room === 'square') {
      const errand = state.pendingErrand;
      state.pendingErrand = null;
      if (errand === 'market') {
        log(`heading to market (${state.silver} silvers)`);
        navigate('market', ROUTES.market);
        return;
      }
      if (!state.boughtGear && state.silver >= 120) {
        log(`heading to market for gear (${state.silver} silvers)`);
        navigate('market', ROUTES.market);
      } else if (state.silver >= 150 || state.killsSinceVisit >= 4) {
        state.killsSinceVisit = 0;
        log(`heading to the guildhall (${state.silver} silvers, ${state.kills} kills)`);
        navigate('hall', ROUTES.hall);
      } else {
        log(`hunting again (${state.silver} silvers)`);
        navigate(huntZone(), ROUTES[huntZone()]);
      }
      return;
    }
    if (state.room === 'bazaar' || state.room === 'bank_plaza') {
      gearUp();
      return;
    }
    if (state.room === 'hall_barbarian') {
      hallBusiness();
      return;
    }
    if (state.room !== 'square') {
      const route = TOWN_TO_SQUARE[state.room];
      if (route) {
        log(`strayed into ${state.room} — heading back to the square`);
        navigate('square', route);
        return;
      }
    }
    return;
  }

  // In the wilds: fight what is here, else recover and wait for spawns.
  if (state.killsSinceVisit >= 4) {
    state.pendingErrand = 'market';
    log(`haul of skins — back to town (${state.kills} kills, ${state.silver} silvers)`);
    goTown();
    return;
  }
  if (state.creatures.length) {
    if (state.rt > 0) return;
    state.resting = false;
    sendCmd(`attack ${state.creatures[0]}`);
    return;
  }
  if (state.corpses.length) {
    if (state.rt > 0) return;
    state.resting = false;
    sendCmd(`skin ${state.corpses[0]}`);
    return;
  }
  if (state.hp < state.maxHp * 0.85) {
    if (!state.resting) { state.resting = true; sendCmd('rest'); }
    return;
  }
  state.resting = false;
  patrol();
}

function combatTactics() {
  if (state.rt > 0) return; // roundtime: wait it out before the next art
  const t = state.tactics || {};
  if (state.hp < state.maxHp * 0.3) {
    if (!t.retreated) { t.retreated = true; sendCmd('flee'); }
    state.tactics = t;
    return;
  }
  // Mage's Lash vs magic attackers: learn it at the hall, then flip it on
  // against wisps and other spell-flinging foes.
  if (state.hasMagesLash && /wisp|marsh wisp/.test(state.creatures.join(' ')) && !t.lash) {
    t.lash = true;
    sendCmd('mageslash');
    state.tactics = t;
    return;
  }
  if (state.circle >= 6 && state.creatures.length >= 3 && !t.whirlwind) {
    t.whirlwind = true;
    sendCmd('whirlwind');
    state.tactics = t;
    return;
  }
  if (state.fire >= 40 && !t.berserk) {
    t.berserk = true;
    sendCmd('berserk');
    state.tactics = t;
    return;
  }
  if (!t.roared) {
    t.roared = true;
    sendCmd('roar everilds_rage');
    state.tactics = t;
    return;
  }
  state.tactics = t;
}

// Parse a corpse search: "carried: a short sword, arrows (x10)" and
// "worn: leather, shield wood" -> item names (articles and counts stripped).
function parseCorpse(msg) {
  const clean = (raw) => raw.replace(/\(x\d+\)/g, '').replace(/^an?\s+|^the\s+/, '').trim();
  const all = [];
  const equipped = [];
  const carried = /carried:\s*(.+)/.exec(msg);
  if (carried) for (const r of carried[1].split(',')) { const n = clean(r); if (n) all.push(n); }
  const worn = /worn:\s*(.+)/.exec(msg);
  if (worn) for (const r of worn[1].split(',')) { const n = clean(r); if (n) { all.push(n); equipped.push(n); } }
  return { all, equipped };
}

// Work through corpse recovery one command per prompt: search the body, get
// each item back, then re-wear what was on the corpse.
function reclaimGear() {
  const r = state.reclaim;
  if (r.step === 0) { r.step = 1; sendCmd('search'); return; }
  if (r.step === 1) {
    if (!r.items.length) { log('the corpse holds nothing worth reclaiming'); state.reclaim = null; sendCmd('look'); return; }
    r.step = 2;
  }
  const idx = r.step - 2;
  if (idx >= r.items.length) {
    state.reclaim = null;
    if (r.equipped.length) {
      state.reequip = [...r.equipped];
      sendCmd(`wear ${state.reequip.shift()}`);
      return;
    }
    log('reclaimed the gear from my corpse');
    sendCmd('look');
    return;
  }
  r.step += 1;
  sendCmd(`get ${r.items[idx]} from corpse`);
}

function gearUp() {
  // bazaar: sell everything, then the basic kit (once), then head east to
  // the bank plaza for the quartermaster's tier gear if a bracket has opened.
  if (state.room === 'bazaar') {
    const steps = [...SKINS.map((s) => `sell ${s}`), ...(!state.boughtGear ? BASIC_KIT : [])];
    const step = steps[state.marketStep] || null;
    if (!step) {
      state.marketStep = 0;
      state.boughtGear = true;
      if (tierSteps().length) {
        log('market errands done — heading to the quartermaster');
        navigate('bank_plaza', ['e', 'e']);
        return;
      }
      log('market errands done — back to the square');
      navigate('square', ROUTES.fromMarket);
      return;
    }
    state.marketStep += 1;
    sendCmd(step);
    return;
  }
  // bank_plaza: the quartermaster's circle-gated tier kit.
  if (state.room === 'bank_plaza') {
    const steps = tierSteps();
    const step = steps[state.marketStep] || null;
    if (!step) {
      state.marketStep = 0;
      const opened = GEAR_BRACKETS.filter((b) => b.min <= state.circle).map((b) => b.min);
      state.gearTier = Math.max(state.gearTier, ...opened);
      log('quartermaster errands done — back to the square');
      navigate('square', ROUTES.fromMarketEnd);
      return;
    }
    state.marketStep += 1;
    sendCmd(step);
    return;
  }
  navigate('square', ROUTES.fromMarketEnd);
}

function hallBusiness() {
  // Train while silver holds out, learn what fits, circle once per visit.
  if (state.silver >= 120 && state.trainIdx < TRAIN_PRIORITY.length * 3) {
    const skill = TRAIN_PRIORITY[state.trainIdx % TRAIN_PRIORITY.length];
    state.trainIdx += 1;
    sendCmd(`train ${skill}`);
    return;
  }
  if (!state.learnTriedThisVisit && state.learnIdx < ABILITY_PLAN.length) {
    while (state.learnIdx < ABILITY_PLAN.length &&
           (ABILITY_MIN_CIRCLE[ABILITY_PLAN[state.learnIdx]] || 0) > state.circle) {
      state.learnIdx += 1; // gate not open yet — defer
    }
    if (state.learnIdx < ABILITY_PLAN.length) {
      state.learnTriedThisVisit = true;
      const id = ABILITY_PLAN[state.learnIdx];
      state.learnIdx += 1;
      sendCmd(`learn ${id}`);
      return;
    }
  }
  if ((state.tdpTrainedThisVisit || 0) < 3) {
    state.tdpTrainedThisVisit = (state.tdpTrainedThisVisit || 0) + 1;
    const skill = state.missingTrains && state.missingTrains.length
      ? state.missingTrains.shift()
      : TDP_PRIORITY[state.tdpIdx % TDP_PRIORITY.length];
    if (!skill) { state.tdpTrainedThisVisit = 3; return; }
    state.tdpIdx += 1;
    sendCmd(`tdptrain ${skill}`);
    return;
  }
  if (!state.circleTriedThisVisit) {
    state.circleTriedThisVisit = true;
    log('circling...');
    sendCmd('circle');
    return;
  }
  // Done here: go earn more and grow.
  log('hall business done — back to hunting');
  state.tdpTrainedThisVisit = 0;
  state.learnTriedThisVisit = false;
  state.circleTriedThisVisit = false;
  navigate('square', ROUTES.fromHall);
}

function huntZone() {
  if (state.circle >= 8) return 'blackwood';
  if (state.circle >= 6) return 'cinder';
  if (state.circle >= 5) return 'marsh';
  if (state.circle >= 3) return 'woods';
  return 'sewers';
}

// Idle patrolling: sweep the hunting zone so fresh spawns are found fast.
// Each entry points back into the zone (never toward town).
const PATROL = {
  sewers_1: 'n', sewers_2: 'n', sewers_3: 's',
  woods_path: 's', woods_2: 'n',
  marsh_1: 's', marsh_2: 'n',
  cinder_1: 'n', cinder_2: 's',
  black_1: 'd', black_2: 'up',
};
function patrol() {
  const dir = PATROL[state.room];
  if (dir) sendCmd(dir);
  else sendCmd('look');
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------- lifecycle ----------------
let apiToken = null;

// Bootstrap via the HTTP test API (DR_ENABLE_API=1): create the character and
// apply optional head-starts (silver, skill ranks) so demos can showcase
// training and circling without the full grind. Returns a session token for
// the WS login, or null if the API is unavailable.
async function apiBootstrap() {
  const base = 'http://localhost:3000/api';
  const call = async (path, method = 'GET', body) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(apiToken ? { Authorization: 'Bearer ' + apiToken } : {}),
        ...(path === '/debug' && DEBUG_TOKEN ? { 'X-DR-Debug-Token': DEBUG_TOKEN } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };
  try {
    const health = await call('/health');
    if (!health.ok) return null;
    const reg = await call('/register', 'POST', { user: ACCOUNT, pass: 'botpass123' });
    if (!reg.ok) return null;
    apiToken = reg.token;
    const cc = await call('/characters', 'POST', { name: BOT_NAME, race: 'gortog', guild: 'barbarian' });
    if (!cc.ok) return null;
    await call('/enter', 'POST', { charId: cc.charId });
    if ((START_SILVER > 0 || START_RANKS > 0) && !DEBUG_TOKEN) {
      throw new Error('head-start options require DR_ENABLE_DEBUG_API=1 and DR_DEBUG_TOKEN');
    }
    if (START_SILVER > 0) {
      const result = await call('/debug', 'POST', { silver: START_SILVER });
      if (!result.ok) throw new Error(result.error || 'debug silver bootstrap failed');
    }
    if (START_RANKS > 0) {
      const skills = {};
      for (const id of RANK_BOOST_SKILLS) skills[id] = START_RANKS;
      const result = await call('/debug', 'POST', { setSkills: skills });
      if (!result.ok) throw new Error(result.error || 'debug skill bootstrap failed');
    }
    log(`API bootstrap: ${BOT_NAME} created${START_SILVER ? ` with ${START_SILVER} silvers` : ''}${START_RANKS ? `, primaries at rank ${START_RANKS}` : ''}`);
    return apiToken;
  } catch (e) {
    log('API bootstrap unavailable (' + e.message + ') — playing a fresh character');
    return null;
  }
}

function finish(reason) {
  log(`done — ${reason}. circle ${state.circle}, ${state.kills} kills, ${state.silver} silvers, ${Math.round((Date.now() - state.start) / 1000)}s`);
  try { send({ t: 'input', line: 'quit' }); } catch {}
  setTimeout(() => process.exit(0), 500);
}

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  try {
    handle(msg);
  } catch (e) {
    log('handler error: ' + e.stack);
  }
});

let bootstrapDone = null;
if (START_SILVER > 0 || START_RANKS > 0) bootstrapDone = apiBootstrap();

async function handle(msg) {
  switch (msg.t) {
    case 'login_prompt':
      if (bootstrapDone) {
        await bootstrapDone; // the login banner races the API bootstrap
        bootstrapDone = null;
      }
      if (apiToken) {
        log('logging in with API session token');
        send({ t: 'token', token: apiToken });
        apiToken = null;
      } else {
        log('registering account ' + ACCOUNT);
        send({ t: 'register', u: ACCOUNT, p: 'botpass123' });
      }
      break;
    case 'charselect': {
      // The API-created character may already exist; enter the first slot.
      const m = /^\s*(\d+)\)/m.exec(String(msg.msg || ''));
      if (m) { log('entering character slot ' + m[1]); send({ t: 'charselect', id: m[1] }); }
      else { log('no character to enter — exiting'); process.exit(1); }
      break;
    }
    case 'charcreate':
      state.phase = 'chargen';
      log(`creating ${BOT_NAME}, a gortog barbarian`);
      send({ t: 'charcreate', name: BOT_NAME, race: 'gortog', guild: 'barbarian' });
      break;
    case 'charalloc':
      state.phase = 'alloc';
      send({ t: 'alloc', stat: 'str', amt: 10 });
      send({ t: 'alloc', stat: 'con', amt: 10 });
      send({ t: 'alloc', stat: 'agi', amt: 5 });
      send({ t: 'alloc', stat: 'ref', amt: 5 });
      send({ t: 'enter' });
      break;
    case 'room':
      parseRoom(msg);
      log(`at ${msg.roomId} — ${state.creatures.length} creature(s)${state.inCombat ? ' [COMBAT]' : ''}`);
      if (state.phase === 'playing') decide('room');
      break;
    case 'prompt':
      parsePrompt(msg);
      if (state.phase === 'alloc') { state.phase = 'playing'; log(`entered the world. GM watch (DR_GM_TOKEN required): http://localhost:3000/spectate.html?name=${BOT_NAME}`); }
      if (!state.inCombat) state.tactics = {}; // fresh fight, fresh tactics
      if (state.wasInCombat && !state.inCombat) {
        // Combat ended: the room picture is stale — resume the interrupted
        // route (a fight during navigation) or refresh before deciding.
        state.wasInCombat = false;
        if (state.queue.length) { sendCmd(state.queue[0]); return; }
        sendCmd('look');
        return;
      }
      state.wasInCombat = state.inCombat;
      decide('prompt');
      break;
    case 'combat':
      if (/awaken in the Temple/.test(msg.msg)) {
        // Death: everything dropped at the death spot. Remember it so we can
        // reclaim the gear after respawning.
        state.reclaim = { room: state.room, items: [], step: 0, equipped: [] };
        log(`died in ${state.room} — gear left on the corpse`);
        break;
      }
      if (/fell |fall |defeated/.test(msg.msg)) {
        state.kills += 1;
        state.killsSinceVisit += 1;
        if (state.kills % 5 === 0) log(`${state.kills} kills so far`);
      }
      break;
    case 'notice':
      if (/ready to circle|not yet ready/.test(msg.msg)) state.waitingToCircle = false;
      if (/Hmm\?|do not know/.test(msg.msg)) state.failedMoves += 1;
      break;
    case 'msg':
      // Corpse search output: remember what the body held so we can get it back.
      if (state.reclaim && state.reclaim.step === 1 && /and search it/.test(msg.msg)) {
        const parsed = parseCorpse(msg.msg);
        state.reclaim.items = parsed.all;
        state.reclaim.equipped = parsed.equipped;
        state.reclaim.step = 2;
        break;
      }
      // Rest ticks come as plain messages (no prompt): keep the loop alive by
      // peeking for new spawns, and resume hunting when the rest finishes.
      if (/You rest/.test(msg.msg)) {
        if (Date.now() - state.restLookAt > 4000) {
          state.restLookAt = Date.now();
          sendCmd('look');
        }
        break;
      }
      if (/You rise/.test(msg.msg)) {
        state.resting = false;
        sendCmd('look');
        break;
      }
      // Circle verdicts arrive as plain messages.
      if (/not yet ready/.test(msg.msg)) {
        log('circle not ready — will grow more first');
        // Build the training queue only when empty (don't re-queue every
        // visit, or survival hogging starves the weapon/armor pools). Named
        // hard skills first, then one candidate per mentioned skillset,
        // interleaved, so every pool advances together.
        if (!state.missingTrains || state.missingTrains.length === 0) {
          const m = /Missing:([\s\S]*)/.exec(msg.msg);
          if (m) {
            const body = m[1];
            const named = [...body.matchAll(/^\s+([a-z_]+) at least rank \d+ \(you have \d+\)/gm)].map((x) => x[1]);
            const sets = [...new Set([...body.matchAll(/^\s+\d+(?:st|nd|rd|th) (\w+) at least rank \d+/gm)].map((x) => x[1]))];
            const cands = sets.map((s) => [...(SET_CANDIDATES[s] || [])]);
            const queued = [...named];
            let guard = 0;
            while (cands.some((c) => c.length) && guard++ < 80) {
              for (const c of cands) if (c.length) queued.push(c.shift());
            }
            state.missingTrains = [...new Set(queued)];
            log('short skills: ' + state.missingTrains.join(', '));
          }
        }
      } else if (/Rise,|are now a|circle/i.test(msg.msg) && /Rise,/.test(msg.msg)) {
        log(`CIRCLED UP — now circle ${state.circle + 1}`);
        state.circleTriedThisVisit = false;
        state.missingTrains = [];
      }
      if (/master Mage's Lash/.test(msg.msg)) state.hasMagesLash = true;
      break;
    case 'error':
      if (/already taken/.test(msg.msg)) {
        log('account exists — logging in instead');
        send({ t: 'login', u: ACCOUNT, p: 'botpass123' });
        break;
      }
      if (state.queue.length && /cannot go that way/.test(msg.msg)) {
        state.queue = [];
        state.destination = null;
        log('route blocked — rerouting');
        navigate('square', ROUTES['from' + cap(state.zone)]);
      }
      break;
    case 'enter':
      state.phase = 'playing';
      log(`entered the world. GM watch (DR_GM_TOKEN required): http://localhost:3000/spectate.html?name=${BOT_NAME}`);
      break;
  }
}

ws.on('open', () => log(`bot ${BOT_NAME} connecting...`));
ws.on('close', () => { log('disconnected — exiting'); process.exit(0); });
ws.on('error', (e) => { log('ws error: ' + e.message); process.exit(1); });

// Watchdog: if no prompt arrived for a while and we are NOT resting (rest
// sends its own ticks and must not be interrupted), nudge the loop.
setInterval(() => {
  if (state.phase !== 'playing') return;
  if (state.resting) return;
  if (Date.now() - state.lastPromptAt > 12000) {
    sendCmd('wake');
  }
}, 5000);

setTimeout(() => finish('timeout'), MAX_MINUTES * 60 * 1000 + 15000);
log(`barbarian bot starting — name ${BOT_NAME}, ${MAX_MINUTES} min cap, target circle ${TARGET_CIRCLE}`);
