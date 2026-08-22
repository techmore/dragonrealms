// Live barb run: a REAL user account plays a barbarian through the fully
// functional app — HTTP auth, WebSocket session, chargen — and drives the
// whole hunt/circle loop with a DR-style script that is saved to the
// character's account via {t:'scripts_put'} and executed through the pure
// script engine (public/js/script-engine.js), exactly like the browser UI
// runs it. Proves per-login scripting end to end.
//
//   node scripts/barb-run.mjs [--minutes 15] [--circle 2] [--user barb_player]
//     [--char Kargok]
//
// Requires the server running with DR_ENABLE_API=1.

const ARGS = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = ARGS.indexOf('--' + name);
  return i >= 0 ? ARGS[i + 1] : dflt;
};
const BASE = 'http://localhost:3000';
const ORIGIN = 'ws://localhost:3000/ws';
const MINUTES = Number(flag('minutes', 15));
const TARGET_CIRCLE = Number(flag('circle', 2));
const USER = flag('user', 'barb_player');
const PASS = flag('pass', 'BarbRun1!');
// Distinct runs must use distinct characters — the server allows one live
// session per character ("already active in another session" otherwise).
const CHAR_NAME = flag('char', 'Kargok');
const SCRIPT_NAME = 'huntbarb';

const { ROOMS } = await import('../data/world.js');
const { creatureById } = await import('../data/creatures.js');
const { createRunner } = await import('../public/js/script-engine.js');
import WebSocket from 'ws';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => String(s ?? '').replace(/\x1b\[\d+m/g, '');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const startedAt = Date.now();

// ---------------- geography ----------------
const ADJ = {};
for (const [id, r] of Object.entries(ROOMS)) {
  ADJ[id] = Object.entries(r.exits || {}).map(([dir, to]) => ({ dir, to }));
}
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
        while (prev.get(at)) { path.unshift(prev.get(at)); at = prev.get(at).via; }
        return path;
      }
      q.push(edge.to);
    }
  }
  return null;
}
const SPAWN_ROOMS = Object.keys(ROOMS).filter((id) => (ROOMS[id].spawns || []).length);
function nearestSpawnRoom(from) {
  let best = null;
  for (const id of SPAWN_ROOMS) {
    const p = bfsPath(from, id);
    if (p && (!best || p.length < best.path.length)) best = { id, path: p };
  }
  return best;
}
// Attack noun for a spawn species: "a great rat" -> "great rat".
const nounOf = (spawnId) => (creatureById(spawnId)?.name || spawnId).replace(/^(an?|the)\s+/i, '');

// ---------------- script generation ----------------
// One full cycle: orient -> arm -> travel -> hunt (scans + fights + rest) ->
// guild hall (circle attempt + TDP curriculum) -> exit. The driver restarts
// the cycle until the circle target is met. Conditional loops always contain
// a pause so advance() yields to the heartbeat instead of spinning forever.
function buildScript({ fromRoom, arena }) {
  const L = [];
  const moves = (path) => path.map((e) => `  move ${e.dir}`);
  const toArena0 = bfsPath(fromRoom, arena.id);
  const bazaar = bfsPath(fromRoom, 'bazaar');

  L.push(`# ${SCRIPT_NAME} — generated for ${CHAR_NAME} (${new Date().toISOString()})`);
  L.push('# Saved to the character account; survives logins and browsers.');
  L.push('START:');
  L.push('  put look');
  L.push('  wait');
  L.push('ARMCHECK:');
  // Equipping moves the club out of the carry list, so "wield" alone can't
  // tell "already armed" from "unarmed". Probe the inventory report instead:
  // equipped wins first, then a carried club gets picked up, else go buy.
  L.push('  matchre ARMED_HERE Worn:.*club');
  L.push('  matchre GETCLUB carrying:\\s*[\\s\\S]*?\\bclub\\b');
  L.push('  matchre BUY You are carrying');
  L.push('  put inventory');
  L.push('  matchwait');
  L.push('GETCLUB:');
  L.push('  put get club');
  L.push('  wait');
  L.push('  put wield club');
  L.push('  wait');
  L.push('  goto ARMCHECK');
  L.push('BUY:');
  if (bazaar && bazaar.length) L.push(...moves(bazaar));
  L.push('ARM:');
  L.push('  matchre WIELD You buy|You pay|hands you');
  // Buy failure (broke / not sold here): try wielding anyway — we may already own one.
  L.push('  matchre WIELD do not sell|already have|no such|do not have|out of stock|cannot afford');
  L.push('  put buy club');
  L.push('  matchwait');
  L.push('WIELD:');
  L.push('  put wield club');
  L.push('  wait');
  L.push('  pause 3');
  const toArena = bfsPath('bazaar', arena.id) || toArena0;
  const hall = bfsPath(arena.id, 'hall_barbarian');
  if (toArena?.length) L.push(...moves(toArena));
  L.push('  goto SCAN');
  L.push('ARMED_HERE:');
  {
    const here = bfsPath(fromRoom, arena.id);
    if (here?.length) L.push(...moves(here));
  }
  // Hunt segment: scan, fight what scans back, rest when hurt.
  L.push('SCAN:');
  L.push('  pause 2');
  L.push('  iflt hp 40 goto REST');
  L.push('  put look');
  const species = [...new Set(ROOMS[arena.id].spawns)];
  for (const sp of species) {
    L.push(`  matchre FIGHT_${sp.replace(/\W/g, '_')} ${nounOf(sp)} is here`);
  }
  L.push('  matchre WANDER \\[\\[');
  L.push('  matchwait');
  for (const sp of species) {
    L.push(`FIGHT_${sp.replace(/\W/g, '_')}:`);
    L.push(`  put attack ${nounOf(sp)}`);
    L.push('  wait');
    L.push('  pause 3');
    L.push('  iflt hp 40 goto REST');
    L.push('  goto SCAN');
  }
  L.push('WANDER:');
  L.push('  pause 4');
  L.push('  goto SCAN');
  L.push('REST:');
  L.push('  echo -- licking wounds --');
  // Still mid-fight? Resting would be refused and the wait loop below would
  // spin forever while the creature keeps swinging — go back to fighting
  // (or fleeing, via the driver's interlock) instead.
  L.push('  ifge combat 1 goto SCAN');
  L.push('  put rest');
  L.push('RESTWAIT:');
  L.push('  pause 3');
  L.push('  ifge combat 1 goto SCAN'); // ambushed mid-rest: no healing will happen
  L.push('  iflt hp 85 goto RESTWAIT');
  L.push('  put stand');
  L.push('  wait');
  L.push('  goto SCAN');
  return L.join('\n');
}

// Second script in the character's account library: guild-hall trip —
// circle attempt, TDP curriculum on failure, walk back to the arena.
// Barbarian candidate pools for "Nth weapon/armor/survival/lore" circle
// requirements — the script TDP-trains every candidate so the Nth-highest
// rank climbs no matter which slots are short.
const SET_CANDIDATES = {
  weapon: ['blunt', 'large_edged', 'twohanded_blunt', 'thrown', 'staff', 'small_edged'],
  armor: ['light_armor', 'chain_armor', 'shield_usage', 'brigandine', 'plate_armor'],
  survival: ['perception', 'foraging', 'athletics', 'climbing', 'first_aid', 'scouting', 'hunting', 'tracking'],
  lore: ['appraisal', 'scholarship'],
};
// Fallback curriculum before the first circle attempt tells us what's short.
const DEFAULT_TRAIN = ['expertise', 'parry', 'evasion', 'light_armor', 'blunt',
  'large_edged', 'twohanded_blunt', 'thrown', 'perception', 'foraging',
  'athletics', 'appraisal', 'tactics', 'inner_fire'];

// Circle-failure prose looks like:
//   expertise at least rank 8 (you have 5)
//   2nd weapon at least rank 8 (your 2nd is 0)
// Parse it into a targeted tdptrain list.
function trainListFromMissing(raw) {
  const list = new Set();
  for (const m of raw.matchAll(/^\s*-?\s*([a-z_]+) at least rank \d+/gm)) {
    if (!/^(1st|2nd|3rd|4th|5th|6th|7th|8th|9th)$/.test(m[1])) list.add(m[1]);
  }
  for (const m of raw.matchAll(/\d+(?:st|nd|rd|th) (weapon|armor|survival|lore) at least rank/gm)) {
    for (const c of SET_CANDIDATES[m[1]] || []) list.add(c);
  }
  return [...list];
}

function buildCircleScript({ fromRoom, arena, train }) {
  const L = [];
  const moves = (path) => path.map((e) => `  move ${e.dir}`);
  const hall = bfsPath(fromRoom, 'hall_barbarian') || bfsPath(arena.id, 'hall_barbarian') || [];
  const back = bfsPath('hall_barbarian', arena.id) || [];
  L.push(`# ${SCRIPT_NAME}circle — circle trip (generated ${new Date().toISOString()})`);
  L.push('HALLTRIP:');
  L.push(...moves(hall));
  L.push('  matchre CIRCLE_OK Rise, |now a ');
  L.push('  matchre TRAIN not yet ready|must stand in your own');
  L.push('  put circle');
  L.push('  matchwait');
  L.push('CIRCLE_OK:');
  L.push('  echo CIRCLE_UP_OK');
  L.push('  exit');
  L.push('TRAIN:');
  for (const sk of (train && train.length ? train : DEFAULT_TRAIN)) {
    L.push(`  put tdptrain ${sk}`);
    L.push('  wait');
    L.push('  pause 1');
  }
  if (back.length) L.push(...moves(back));
  L.push('  exit');
  return L.join('\n');
}

// ---------------- the run ----------------
const state = {
  phase: 'connect', room: null, hp: 0, maxhp: 0, circle: 1, rt: 0, inCombat: false,
  kills: 0, attacks: 0, circles: 0, trains: 0, flees: 0, deaths: 0,
  lastFleeAt: 0, lastSendAt: 0, done: false,
  runner: null, scriptVerified: false,
  huntSrc: null, circleSrc: null, curSrc: null, curName: null,
  arena: null, lastHallAt: 0, killsAtVisit: 0, lastTrainList: '',
};
let ws;

function send(obj) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
async function cmd(line) { send({ t: 'input', line }); await sleep(150); }

function feedRunner(text, tag) {
  try { state.runner?.feed(text, tag); } catch (e) { log('runner feed error:', e.message); }
}

// Prompts only arrive per-command server-side, so while resting no fresh HP
// reaches the script. Inject the latest known vitals prompt-shaped on each
// heartbeat so %hp/%maxhp/%circle/%rt/%combat stay live for iflt/ifge.
let lastInjected = '';
function injectState() {
  if (!state.runner?.running || !state.maxhp) return;
  const line = `HP: ${state.hp}/${state.maxhp}  RT: ${state.rt}  Circle ${state.circle}${state.inCombat ? ' [COMBAT]' : ''}`;
  if (line !== lastInjected) {
    lastInjected = line;
    feedRunner(line, true);
  }
}

// Rebuild both scripts from wherever the character ACTUALLY is and re-save
// them to the account. Baked paths go stale the moment the barb wanders,
// dies, or finishes a trip somewhere else than where the script assumed.
function refreshCycleScripts() {
  if (!state.room || !state.arena) return;
  const arena = { id: state.arena };
  state.huntSrc = buildScript({ fromRoom: state.room, arena });
  // Keep any circle-failure-retargeted curriculum; falling back to the
  // default here would undo the retarget and the dedupe would block it
  // from ever being applied again.
  const train = state.lastTrainList ? state.lastTrainList.split(',') : undefined;
  state.circleSrc = buildCircleScript({ fromRoom: state.room, arena, train });
  send({ t: 'scripts_put', name: SCRIPT_NAME, body: state.huntSrc });
  send({ t: 'scripts_put', name: SCRIPT_NAME + 'circle', body: state.circleSrc });
}

async function startCycle(src, name) {
  state.curSrc = src;
  state.curName = name;
  if (name === SCRIPT_NAME) state.lastHallAt = Date.now();
  else log(`-- running ${name} (guild-hall trip) --`);
  state.lastSendAt = Date.now();
  const runner = createRunner(src, [], {
    send: async (line) => {
      if (/^(attack|tdptrain|flee|rest|stand|circle|buy|wield|skin|search)/.test(line)) {
        log('script:', line);
      } else if (process.env.DRB_DEBUG) {
        log('script>', line);
      }
      state.lastSendAt = Date.now();
      state.attacks += /^attack /.test(line) ? 1 : 0;
      state.trains += /^tdptrain /.test(line) ? 1 : 0;
      state.flees += line === 'flee' ? 1 : 0;
      await cmd(line);
    },
    say: (t) => log('[script]', t),
  });
  state.runner = runner;
  runner.start();
}

function finish(reason) {
  if (state.done) return;
  state.done = true;
  state.runner?.stop();
  const mins = Math.round((Date.now() - startedAt) / 60000);
  console.log('\n=== barb-run results ===');
  console.log(`  reason:            ${reason}`);
  console.log(`  duration:          ${mins}m`);
  console.log(`  circle reached:    ${state.circle} (${state.circles} circle-up${state.circles === 1 ? '' : 's'})`);
  console.log(`  kills:             ${state.kills}`);
  console.log(`  attack commands:   ${state.attacks}`);
  console.log(`  tdp trainings:     ${state.trains}`);
  console.log(`  emergency flees:   ${state.flees}  deaths: ${state.deaths}`);
  console.log(`  script persisted:  ${state.scriptVerified ? 'YES (round-tripped through account)' : 'NO'}`);
  console.log(`  online:            http://localhost:3000  (login ${USER} / watch /?spectate=${CHAR_NAME})`);
  try { ws.close(); } catch {}
  setTimeout(() => process.exit(0), 300);
}

async function main() {
  // 1. Real account over HTTP.
  let r = await fetch(`${BASE}/api/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: USER, pass: PASS }),
  }).then((x) => x.json());
  if (!r.ok) r = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: USER, pass: PASS }),
  }).then((x) => x.json());
  if (!r.ok) throw new Error('account setup failed: ' + r.error);
  const token = r.token;
  const knownChar = (r.characters || []).find((c) => c.name === CHAR_NAME);
  log(`authed as ${USER} (${knownChar ? 'existing' : 'new'} character slot)`);

  // 2. WebSocket session like the web client.
  ws = new WebSocket(ORIGIN);
  ws.onmessage = async (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    await onMessage(m);
  };
  ws.onclose = () => { if (!state.done) { log('socket closed by server'); finish('disconnected'); } };

  function onMessage(m) {
    switch (m.t) {
      case 'login_prompt': send({ t: 'token', token }); break;
      case 'charselect':
        send({ t: 'charselect', id: knownChar ? knownChar.charId : 'new' });
        break;
      case 'charcreate':
        send({ t: 'charcreate', name: CHAR_NAME, race: 'human', guild: 'barbarian', city: 'crossing' });
        break;
      case 'charalloc': send({ t: 'enter' }); break;
      case 'enter':
        state.phase = 'playing';
        log(`${CHAR_NAME} entered the world`);
        break;
      case 'room': {
        const first = !state.room;
        state.room = m.roomId;
        feedRunner(stripAnsi(m.msg), 'room');
        if (first && state.phase === 'playing') void beginPlaying();
        break;
      }
      case 'prompt': {
        const plain = stripAnsi(m.msg);
        const hp = /HP:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
        if (hp) { state.hp = Number(hp[1]); state.maxhp = Number(hp[2]); }
        const c = /Circle\s*(\d+)/.exec(plain);
        if (c) state.circle = Number(c[1]);
        const rt = /RT:\s*(\d+)/.exec(plain);
        state.rt = rt ? Number(rt[1]) : 0;
        state.inCombat = /\[COMBAT\]/.test(plain);
        feedRunner(plain, true);
        supervisor();
        break;
      }
      case 'msg':
      case 'combat':
      case 'notice': {
        const text = stripAnsi(m.msg);
        if (process.env.DRB_DEBUG) log(`<${m.t}>`, JSON.stringify(text.slice(0, 120)));
        const restHp = /hp (\d+)\/(\d+)/i.exec(text); // rest ticks are msgs, not prompts
        if (restHp) { state.hp = Number(restHp[1]); state.maxhp = Number(restHp[2]); }
        if (/Rise, .* now a /.test(text) || /now a \w+/.test(text) && /Rise, /.test(text)) {
          state.circles += 1;
          log(`*** CIRCLE-UP -> circle ${state.circle + 1} ***`);
          if (state.circle >= TARGET_CIRCLE) finish('target circle reached');
        }
        if (/You awaken in the Temple/.test(text)) {
          state.deaths += 1;
          log('died — restarting cycle from the temple');
          state.runner?.stop(); state.runner = null;
          // The room event for the temple lands shortly; rebuild paths from
          // there so the fresh cycle doesn't replay stale geography.
          setTimeout(() => {
            if (!state.curSrc || state.done) return;
            refreshCycleScripts();
            startCycle(state.huntSrc, SCRIPT_NAME);
          }, 3000);
        }
        if (/dies|slumps|lifeless|stops moving|collapses/.test(text)) state.kills += 1;
        // Circle failure lists exactly what's short — fold it into the
        // saved circle-trip script so the next visit trains the right things.
        if (/not yet ready to circle/.test(text)) {
          const parsed = trainListFromMissing(text);
          if (parsed.length && parsed.join() !== state.lastTrainList) {
            state.lastTrainList = parsed.join();
            state.circleSrc = buildCircleScript({
              fromRoom: state.room, arena: { id: state.arena }, train: parsed,
            });
            send({ t: 'scripts_put', name: SCRIPT_NAME + 'circle', body: state.circleSrc });
            log(`circle blocked — retargeted curriculum: ${parsed.slice(0, 8).join(', ')}${parsed.length > 8 ? ` +${parsed.length - 8}` : ''}`);
          }
        }
        feedRunner(text, m.t);
        break;
      }
      case 'scripts': {
        const hunt = m.scripts?.[SCRIPT_NAME];
        const circle = m.scripts?.[SCRIPT_NAME + 'circle'];
        if (!state.huntSrc || !hunt) break; // pre-entry snapshot echo / partial
        const huntOk = hunt === state.huntSrc;
        const circleOk = circle === state.circleSrc;
        if (huntOk && circleOk) {
          if (!state.scriptVerified) {
            state.scriptVerified = true;
            log(`scripts verified on the account (login-tied storage works, ` +
              `${Object.keys(m.scripts).length} in library)`);
          }
        } else if (!huntOk && !circleOk) {
          // Fully divergent: only worth shouting about. One-sided mismatches
          // are just the intermediate echo between our two scripts_put calls.
          log('WARN: account snapshot differs from what was saved — running local copies');
        }
        // Whatever the round-trip says, get moving: execute the SERVER copy
        // when it matches, the local one otherwise. Never stall here.
        if (!state.curSrc) startCycle(huntOk ? hunt : state.huntSrc, SCRIPT_NAME);
        break;
      }
      case 'error':
        log(`server error: ${stripAnsi(m.msg)}`);
        // Stale charId (character deleted under us): start over with a new slot.
        if (/not a valid character|no such character/i.test(String(m.msg))
          && state.phase !== 'playing') {
          send({ t: 'charselect', id: 'new' });
        }
        feedRunner(stripAnsi(m.msg), 'error');
        break;
      default:
        if (process.env.DRB_DEBUG) log(`<${m.t}>`, JSON.stringify(m).slice(0, 160));
    }
  }

  // After world entry: generate the script for the actual geography, save it
  // to the ACCOUNT, then run whatever comes back.
  async function beginPlaying() {
    await sleep(400);
    const arena = nearestSpawnRoom(state.room);
    if (!arena) { log('no hunting grounds reachable — aborting'); return finish('no arena'); }
    state.arena = arena.id;
    state.huntSrc = buildScript({ fromRoom: state.room, arena });
    state.circleSrc = buildCircleScript({ fromRoom: state.room, arena });
    log(`hunting grounds: ${ROOMS[arena.id].name} (${arena.id}) — species: ${[...new Set(ROOMS[arena.id].spawns)].map(nounOf).join(', ')}`);
    send({ t: 'scripts_put', name: SCRIPT_NAME, body: state.huntSrc });
    log(`saved "${SCRIPT_NAME}" to ${CHAR_NAME}'s account (${state.huntSrc.split('\n').length} lines)`);
    await sleep(400);
    send({ t: 'scripts_put', name: SCRIPT_NAME + 'circle', body: state.circleSrc });
    log(`saved "${SCRIPT_NAME}circle" too (${state.circleSrc.split('\n').length} lines)`);
  }

  // Survival interlock outside the script: never let the barb die stupidly.
  function supervisor() {
    if (state.done || !state.maxhp || state.hp <= 0 || !state.inCombat) return;
    const frac = state.hp / state.maxhp;
    if (frac < 0.28 && Date.now() - state.lastFleeAt > 6000) {
      state.lastFleeAt = Date.now();
      log(`interlock: HP ${state.hp}/${state.maxhp} — fleeing`);
      cmd('flee');
    }
  }

  // Heartbeat + watchdog: keep script vitals fresh AND kick pause timers
  // even when nothing changes (mirrors the browser client's 500ms tick).
  // Alternates the account's script library: hunt until a few kills land or
  // 4 minutes pass, then run the circle-trip script once, then resume.
  setInterval(() => {
    if (state.done) return;
    try { state.runner?.feed('', false); } catch {}
    injectState();
    if (state.phase !== 'playing' || !state.curSrc) return;
    const hunting = state.curName === SCRIPT_NAME;
    if (hunting && !state.inCombat && state.runner?.running
      && (state.kills - state.killsAtVisit >= 3 || Date.now() - state.lastHallAt > 4 * 60000)) {
      log(`heading to the guild hall (${state.kills - state.killsAtVisit} kills since last visit)`);
      state.killsAtVisit = state.kills;
      refreshCycleScripts(); // path starts from HERE, not from world entry
      startCycle(state.circleSrc, SCRIPT_NAME + 'circle');
      return;
    }
    if (!state.runner || !state.runner.running) {
      if (Date.now() - state.lastSendAt > 2500) {
        if (!hunting) log('circle trip done — back to hunting');
        refreshCycleScripts();
        startCycle(state.huntSrc, SCRIPT_NAME);
      }
      return;
    }
    if (Date.now() - state.lastSendAt > 90000) {
      log('watchdog: cycle stalled — restarting');
      state.runner.stop();
      refreshCycleScripts();
      startCycle(state.curSrc, state.curName);
    }
  }, 1000);

  setTimeout(() => finish(`--minutes ${MINUTES} elapsed`), MINUTES * 60000);
  process.on('SIGINT', () => finish('interrupted'));
}

await main();
