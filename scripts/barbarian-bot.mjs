// Barbarian bot: a live player that registers, hunts, trains, learns
// abilities, and circles — visible in-game and via /spectate.html?name=<bot>.
//
//   node scripts/barbarian-bot.mjs [--name BarbX] [--minutes 5] [--circle 3]
//   npm run bot
//
// The bot plays through the real WebSocket protocol as a normal adventurer.
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
const letters = 'abcdefghijklmnopqrstuvwxyz';
const rnd = (n) => letters[Math.floor(Math.random() * n)];
const BOT_NAME = (opt('--name', '') || 'Gor' + Array.from({ length: 5 }, () => rnd(26)).join('')).replace(/[^a-zA-Z]/g, '');
const ACCOUNT = 'bot' + BOT_NAME.toLowerCase();

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- world knowledge (mirrors data/world.js routes) ----
const ZONES = { sewers_1: 'sewers', sewers_2: 'sewers', sewers_3: 'sewers', woods_path: 'woods', woods_1: 'woods', woods_2: 'woods', marsh_1: 'marsh', marsh_2: 'marsh' };
const ROUTES = {
  sewers: ['s', 'd'],            // from square
  fromSewers: ['up', 'n'],
  woods: ['w', 'w', 'w'],        // from square
  fromWoods: ['e', 'e', 'e'],
  marsh: ['n', 'n', 'e', 'e', 'e'],
  fromMarsh: ['w', 'w', 'w', 's', 's'],
  hall: ['e', 'n', 'n'],         // from square
  fromHall: ['s', 's', 'w'],
  market: ['n'],
  fromMarket: ['s'],
  temple: ['n', 'n'],            // from temple to square
};
// Room ids each route arrives at (used to detect arrival).
const ARRIVES = {
  sewers: 'sewers_1', woods: 'woods_path', marsh: 'marsh_1',
  hall: 'hall_barbarian', market: 'market_way', square: 'square',
};
const SKINS = ['rat pelt', 'kobold hide', 'goblin hide', 'wolf pelt', 'wisp mote', 'troll hide', 'cinder scale'];
const TRAIN_PRIORITY = ['large_edged', 'twohanded_edged', 'twohanded_blunt', 'light_armor', 'fitness', 'evasion', 'blunt', 'thrown', 'perception', 'foraging'];
// Circle-gated abilities: learn them when the circle allows.
const ABILITY_MIN_CIRCLE = { whirlwind: 6, war_stomp: 8, choke: 5, dual_load: 7 };
// Skills boosted by --start-ranks: the circle-band requirements, so a
// head-started bot can actually circle up.
const RANK_BOOST_SKILLS = [...TRAIN_PRIORITY, 'medium_edged', 'small_edged', 'chain_armor', 'shield_usage',
  'parry', 'expertise', 'inner_fire', 'tactics', 'stealth', 'hiding', 'skinning', 'appraisal',
  'tracking', 'swimming', 'climbing', 'scholarship'];
const ABILITY_PLAN = ['dragon', 'tenacity', 'serenity', 'everilds_rage', 'screech', 'choke', 'dispel', 'mageslash', 'whirlwind', 'war_stomp', 'dual_load', 'juggernaut', 'duelist', 'titan', 'exemplar'];

const state = {
  phase: 'connect',        // connect -> login -> chargen -> alloc -> playing
  name: BOT_NAME,
  room: null,
  zone: 'town',
  creatures: [],
  corpses: [],
  hp: 0, maxHp: 1, fire: 0, circle: 1, silver: 0,
  inCombat: false,
  queue: [],               // navigation directions
  destination: null,
  kills: 0,
  killsSinceVisit: 0,
  failedMoves: 0,
  lastPromptAt: 0,
  trainIdx: 0,
  learnIdx: 0,
  hasMagesLash: false,
  circleAttempts: 0,
  circleTriedThisVisit: false,
  learnTriedThisVisit: false,
  waitingToCircle: false,
  start: Date.now(),
  pendingErrand: null,
};

const ws = new WebSocket('ws://localhost:3000/ws');
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
  for (const line of String(msg.msg).split('\n')) {
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

  // Dead at the temple: reclaim and resume.
  if (state.room === 'temple') {
    log('died — returning to the square');
    navigate('square', ROUTES.temple);
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

  // Low health: retreat to town and rest.
  if (state.hp > 0 && state.hp < state.maxHp * 0.4) {
    if (state.zone !== 'town') {
      log(`wounded (${state.hp}/${state.maxHp}) — retreating to the square to rest`);
      goTown();
    } else {
      sendCmd('rest');
    }
    return;
  }

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
    if (state.room === 'market_way' || state.room === 'market_end') {
      gearUp();
      return;
    }
    if (state.room === 'hall_barbarian') {
      hallBusiness();
      return;
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
    sendCmd(`attack ${state.creatures[0]}`);
    return;
  }
  if (state.corpses.length) {
    sendCmd(`skin ${state.corpses[0]}`);
    return;
  }
  if (state.hp < state.maxHp) sendCmd('rest');
  else patrol();
}

function combatTactics() {
  const t = state.tactics || {};
  if (state.hp < state.maxHp * 0.3) {
    if (!t.retreated) { t.retreated = true; sendCmd('retreat'); }
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

function gearUp() {
  // One action per prompt; advance through the market errand list.
  if (state.room === 'market_way') {
    const steps = state.boughtGear
      ? [...SKINS.map((s) => `sell ${s}`)]
      : [
          ...SKINS.map((s) => `sell ${s}`),
          'buy short_sword', 'buy leather', 'buy shield_wood',
          'wield short_sword', 'wear leather', 'wear shield_wood',
        ];
    const step = steps[state.marketStep] || null;
    if (!step) {
      state.marketStep = 0;
      state.boughtGear = true;
      log('market errands done — back to the square');
      navigate('square', ROUTES.fromMarket);
      return;
    }
    state.marketStep += 1;
    sendCmd(step);
    return;
  }
  navigate('square', ROUTES.fromMarket);
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
  if (!state.circleTriedThisVisit) {
    state.circleTriedThisVisit = true;
    log('circling...');
    sendCmd('circle');
    return;
  }
  // Done here: go earn more and grow.
  log('hall business done — back to hunting');
  navigate('square', ROUTES.fromHall);
}

function huntZone() {
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
    if (START_SILVER > 0) await call('/debug', 'POST', { silver: START_SILVER });
    if (START_RANKS > 0) {
      const skills = {};
      for (const id of RANK_BOOST_SKILLS) skills[id] = START_RANKS;
      await call('/debug', 'POST', { setSkills: skills });
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
      if (state.phase === 'alloc') { state.phase = 'playing'; log(`entered the world. watch live: http://localhost:3000/spectate.html?name=${BOT_NAME}`); }
      if (!state.inCombat) state.tactics = {}; // fresh fight, fresh tactics
      if (state.wasInCombat && !state.inCombat) {
        // Combat ended: the room picture is stale — refresh before deciding.
        state.wasInCombat = false;
        sendCmd('look');
        return;
      }
      state.wasInCombat = state.inCombat;
      decide('prompt');
      break;
    case 'combat':
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
      // Circle verdicts arrive as plain messages.
      if (/not yet ready/.test(msg.msg)) {
        log('circle not ready — will grow more first');
      } else if (/Rise,|are now a|circle/i.test(msg.msg) && /Rise,/.test(msg.msg)) {
        log(`CIRCLED UP — now circle ${state.circle + 1}`);
        state.circleTriedThisVisit = false;
      }
      if (/master Mage's Lash/.test(msg.msg)) state.hasMagesLash = true;
      break;
    case 'error':
      if (state.queue.length && /cannot go that way/.test(msg.msg)) {
        state.queue = [];
        state.destination = null;
        log('route blocked — rerouting');
        navigate('square', ROUTES['from' + cap(state.zone)]);
      }
      break;
    case 'enter':
      state.phase = 'playing';
      log(`entered the world. watch live: http://localhost:3000/spectate.html?name=${BOT_NAME}`);
      break;
  }
}

ws.on('open', () => log(`bot ${BOT_NAME} connecting...`));
ws.on('close', () => { log('disconnected — exiting'); process.exit(0); });
ws.on('error', (e) => { log('ws error: ' + e.message); process.exit(1); });

// Watchdog: if no prompt arrived for a while (rest idles), nudge the loop.
setInterval(() => {
  if (state.phase !== 'playing') return;
  if (Date.now() - state.lastPromptAt > 12000) {
    sendCmd('wake');
  }
}, 5000);

setTimeout(() => finish('timeout'), MAX_MINUTES * 60 * 1000 + 15000);
log(`barbarian bot starting — name ${BOT_NAME}, ${MAX_MINUTES} min cap, target circle ${TARGET_CIRCLE}`);
