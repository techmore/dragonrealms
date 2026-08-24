// Browser-launched sim agents: register/login over HTTP, walk the WS
// chargen handshake, apply boost, then run an event-driven hunt loop
// with world-graph pathing toward creature spawns.
import { $, esc, trim, S, cssVar, fmtDur, toast, gm } from './core.js';
import { tick } from './render.js';

/* ================= launch agent ================= */
// Browser twin of scripts/race-guild-sweep.mjs: registers/logs in over
// HTTP, walks the WS chargen handshake (token -> charselect ->
// charcreate -> charalloc -> enter), boosts, then plays a simple
// event-driven hunt loop. Uses only existing wire messages — nothing
// server-side is added. The character shows up in the Online players
// roster as an ordinary session.

const AG_MAGIC_GUILDS = new Set(['bard', 'cleric', 'empath', 'moonmage', 'necromancer', 'warmage']);
const AG_PASS = 'AdminRun1!';

const AG = { agents: [] };

// Persist last-known agent state so a tab reload doesn't amnesia the sim
// list — reloaded rows render as "(tab closed)" until their sockets die
// server-side or a new run with the same name starts.
function agPersist() {
  try {
    const rows = AG.agents.slice(-40).map((a) => ({
      char: a.char, race: a.race, guild: a.guild, circleTarget: a.circleTarget,
      boost: a.boost, circle: a.v?.circle ?? 1,
      hp: a.v?.hp ?? 0, maxhp: a.v?.maxhp ?? 0,
      live: Boolean(a.ws), at: Date.now(),
    }));
    localStorage.setItem('dr_admin_agents', JSON.stringify(rows));
  } catch {}
}
function agRestore() {
  try {
    const rows = JSON.parse(localStorage.getItem('dr_admin_agents') || '[]');
    for (const r of rows) {
      if (!r.live || AG.agents.some((a) => a.char === r.char)) continue;
      // Only resurrect rows from the last hour, marked as dead.
      if (Date.now() - (r.at || 0) > 36e5) continue;
      AG.agents.push({ char: r.char, race: r.race, guild: r.guild,
        circleTarget: r.circleTarget, boost: r.boost, ws: null,
        v: { hp: r.hp, maxhp: r.maxhp, circle: r.circle }, restored: true });
    }
  } catch {}
}

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const AG_RACES = ['human', 'dwarf', 'elf', 'elothean', 'gnome', 'gortog',
  'halfling', 'skra', 'giantman'];
const AG_GUILDS = ['barbarian', 'bard', 'cleric', 'empath', 'moonmage',
  'necromancer', 'paladin', 'ranger', 'thief', 'trader', 'warrior mage', 'warmage'];
function agSuggestName() {
  const g = $('ag-guild').value, r = $('ag-race').value;
  const full = 'Sw' + cap(g) + cap(r);
  if (full.length > 20) {
    // Keep the Sw prefix + guild whole, clip the race so suggestions
    // always fit the 20-letter cap.
    const guildPart = 'Sw' + cap(g);
    const raceBudget = Math.max(3, 20 - guildPart.length);
    $('ag-name').value = guildPart + cap(r).slice(0, raceBudget);
  } else {
    $('ag-name').value = full;
  }
}

function agLog(agent, text, cls) {
  const el = $('aglog');
  const at = new Date().toISOString().slice(11, 19);
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = `${at} [${agent.char}] ${text}`;
  el.appendChild(line);
  while (el.children.length > 300) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

function agRenderState() {
  const el = $('agstate');
  const live = AG.agents.filter((a) => a.ws);
  if (!AG.agents.length) { el.innerHTML = '&#9675; none running'; return; }
  // Per-agent rows: name, guild, circle, HP bar, room state, Stop button.
  const host = $('agroster');
  if (host) {
    host.innerHTML = AG.agents.map((a) => {
      const v = a.v || {};
      const f = v.maxhp > 0 ? Math.max(0, Math.min(1, v.hp / v.maxhp)) : null;
      const col = f == null ? 'var(--dim)' : f > 0.6 ? 'var(--green)' : f > 0.3 ? 'var(--amber)' : 'var(--red)';
      return `<div class="row" data-ag="${esc(a.char)}">
        <span class="nm">${esc(a.char)}</span>
        <span class="cl">${esc(a.guild || '')} · c${v.circle ?? '?'}${a.circleTarget ? ` → c${esc(a.circleTarget)}` : ''}</span>
        ${f == null ? '' : `<span class="hpbar" title="${v.hp}/${v.maxhp} HP"><i style="width:${Math.round(f * 100)}%;background:${col}"></i></span>`}
        ${a.ws ? '<span class="badge live">&#9679; running</span>'
          : a.restored ? '<span class="badge" title="this tab was reloaded — the socket is gone">(tab closed)</span>'
          : '<span class="badge">stopped</span>'}
        <button class="watch" data-agstop="${esc(a.char)}" ${a.ws ? '' : 'disabled'}>&#9208; stop</button>
      </div>`;
    }).join('');
    host.querySelectorAll('[data-agstop]').forEach((b) => b.addEventListener('click', () => {
      const a = AG.agents.find((x) => x.char === b.dataset.agstop);
      if (a) stopAgent(a, 'stopped by GM');
    }));
  }
  const bits = AG.agents.map((a) =>
    `${a.char} c${a.v?.circle ?? '?'}${a.ws ? '' : ' (stopped)'}`);
  el.innerHTML = live.length ? `&#9679; ${live.length} running` : '&#9675; stopped';
  el.style.color = live.length ? 'var(--green)' : 'var(--dim)';
  el.title = bits.join(' · ');
  agPersist();
}

export function launchAgent({ name, race, guild, minutes, circleTarget, boost }) {
  const agent = {
    char: name, race, guild, circleTarget, boost,
    user: `admin_${guild}_${race}`,
    ws: null, token: null, knownCharId: null,
    lastCmdAt: 0, rtUntil: 0, deadline: 0, stopping: false,
    v: { hp: 0, maxhp: 0, mana: 0, maxmana: 0, circle: 1, rt: 0, inCombat: false, resting: false, room: null },
    target: null, lastLookAt: 0, kills: 0,
  };
  AG.agents.push(agent);
  agLog(agent, `launching as ${agent.user} (${race} ${guild}, ${minutes}m, circle ${circleTarget}, boost x${boost || 'off'})`);
  agRenderState();
  loadWorldGraph().catch((e) => agLog(agent, `world graph unavailable: ${e.message}`, 'bad'));
  agHttpLogin(agent)
    .then(() => agConnect(agent))
    .catch((e) => { agLog(agent, `FAILED: ${e.message}`, 'bad'); agent.ws = null; agRenderState(); });
  return agent;
}

// register-or-login, mirroring WireSession.httpLogin
async function agHttpLogin(agent) {
  let r = await fetch('/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: agent.user, pass: AG_PASS }),
  }).then((x) => x.json());
  if (!r.ok) {
    r = await fetch('/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: agent.user, pass: AG_PASS }),
    }).then((x) => x.json());
  }
  if (!r.ok) throw new Error(r.error || 'account setup failed');
  agent.token = r.token;
  const known = (r.characters || []).find((c) => c.name === agent.char);
  agent.knownCharId = known ? known.charId : null;
  agLog(agent, `authed as ${agent.user} (${known ? 'existing' : 'new'} char)`, 'ok');
}

function agConnect(agent) {
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  const ws = new WebSocket(url);
  agent.ws = ws;
  agent.deadline = Date.now() + Number($('ag-minutes').value || 10) * 60000;
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } agOnMessage(agent, m); };
  ws.onclose = () => {
    if (agent.stopping) return;
    agLog(agent, 'socket closed', 'bad');
    agent.ws = null;
    agRenderState();
  };
}

function agSend(agent, obj) {
  if (agent.ws && agent.ws.readyState === WebSocket.OPEN) agent.ws.send(JSON.stringify(obj));
}

async function agCmd(agent, line) {
  const wait = 200 - (Date.now() - agent.lastCmdAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  agent.lastCmdAt = Date.now();
  agSend(agent, { t: 'input', line });
}

const stripAnsi = (s) => String(s ?? '').replace(/\x1b\[\d+m/g, '');

function agOnMessage(agent, m) {
  const v = agent.v;
  switch (m.t) {
    case 'login_prompt':
      agSend(agent, { t: 'token', token: agent.token });
      break;
    case 'charselect':
      agLog(agent, `chargen: ${agent.knownCharId ? 'selecting ' + agent.char : 'creating new char'}`);
      agSend(agent, { t: 'charselect', id: agent.knownCharId || 'new' });
      break;
    case 'charcreate':
      agSend(agent, { t: 'charcreate', name: agent.char, race: agent.race, guild: agent.guild, city: 'crossing' });
      break;
    case 'charalloc':
      agSend(agent, { t: 'enter' });
      break;
    case 'enter':
      agLog(agent, `entered the world${agent.boost > 1 ? ` — boost x${agent.boost}` : ''}`, 'ok');
      if (agent.boost > 1) agSend(agent, { t: 'boost', mult: agent.boost });
      // Immediate circling-on-launch: ask the server to generate the
      // starter hunt/circle/mega library and auto-run it. The tick loop
      // stays as a watchdog (flee/heal) underneath the script.
      agSend(agent, { t: 'gen_starter' });
      agent.deadline = Date.now() + Number($('ag-minutes').value || 10) * 60000;
      agTickLoop(agent);
      break;
    case 'autorun':
      agent.scripting = true;
      agLog(agent, `starter circling script running: ${m.name}`, 'ok');
      break;
    case 'room': {
      v.room = m.roomId;
      // Creature detection from room prose: "a gray wolf is here, ..."
      agent.target = null;
      const hit = /(?:^|\.\s+|\n)an?\s+([a-z][a-z' ]*?)\s+is here/i.exec(stripAnsi(m.msg));
      if (hit) agent.target = hit[1].trim();
      break;
    }
    case 'prompt': {
      const plain = stripAnsi(m.msg);
      const hp = /HP:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
      if (hp) { v.hp = Number(hp[1]); v.maxhp = Number(hp[2]); }
      const mana = /Mana:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
      if (mana) { v.mana = Number(mana[1]); v.maxmana = Number(mana[2]); }
      const c = /Circle\s*(\d+)/.exec(plain);
      if (c && Number(c[1]) !== v.circle) { v.circle = Number(c[1]); agLog(agent, `now circle ${v.circle}`, 'ok'); }
      const rt = /RT:\s*(\d+)/.exec(plain);
      if (rt) agent.rtUntil = Date.now() + Number(rt[1]) * 1000;
      else if (Date.now() >= agent.rtUntil) agent.rtUntil = 0;
      v.inCombat = /\[COMBAT\]/.test(plain);
      v.resting = /\[Resting\]/.test(plain);
      agRenderState();
      break;
    }
    case 'msg': case 'combat': case 'notice': {
      const text = stripAnsi(m.msg);
      const restHp = /hp (\d+)\/(\d+)/i.exec(text);
      if (restHp) { v.hp = Number(restHp[1]); v.maxhp = Number(restHp[2]); }
      if (/dies|slumps|lifeless|stops moving|collapses/.test(text)) {
        agent.kills += 1;
        agent.target = null;
        agLog(agent, `kill #${agent.kills}`);
      }
      if (/You awaken in the Temple/.test(text)) {
        agent.target = null;
        agLog(agent, 'died — respawning in the Temple', 'bad');
      }
      if (/Rise, /.test(text) && /now a /.test(text)) agLog(agent, `CIRCLE-UP -> circle ${v.circle}`, 'ok');
      break;
    }
    case 'error':
      agLog(agent, `server: ${stripAnsi(m.msg)}`, 'bad');
      if (/UNIQUE constraint failed: characters\.name/i.test(String(m.msg))) {
        agLog(agent, 'character name already exists on another account — pick a new name and relaunch', 'bad');
        stopAgent(agent, 'name collision');
      } else if (/not a valid character|no such character/i.test(String(m.msg))) {
        agSend(agent, { t: 'charselect', id: 'new' });
      }
      break;
  }
}

// Event-driven hunt loop: rest when hurt, re-look when quiet, attack the
// creature last seen in the room once roundtime clears. Wall-clock
// deadlines (not prompt counters) gate everything — prompts are sparse.
// World graph for agent pathing: fetched once (GM API), used to walk
// agents toward rooms with creature spawns when no target is present.
let WORLD_GRAPH = null; // { adj: Map<roomId, {dir,room}[]>, spawns: Set<roomId> }
async function loadWorldGraph() {
  if (WORLD_GRAPH) return WORLD_GRAPH;
  const r = await gm('world');
  if (!r.ok || !r.d?.zones) throw new Error('world data unavailable');
  const adj = new Map();
  const spawns = new Set();
  for (const z of r.d.zones) {
    for (const room of z.rooms) {
      const exits = Object.entries(room.exits || {}).map(([dir, to]) => ({ dir, room: to }));
      adj.set(room.id, exits);
      if ((room.spawns || []).length) spawns.add(room.id);
    }
  }
  WORLD_GRAPH = { adj, spawns };
  return WORLD_GRAPH;
}

// BFS from `from` to the nearest spawn room; returns the first move step.
function nextStepTowardSpawns(from) {
  if (!WORLD_GRAPH) return null;
  const { adj, spawns } = WORLD_GRAPH;
  if (!adj.has(from)) return null;
  if (spawns.has(from)) return null; // already in a hunting ground
  const visited = new Set([from]);
  let frontier = [{ room: from, step: null }];
  while (frontier.length) {
    const next = [];
    for (const node of frontier) {
      for (const edge of (adj.get(node.room) || [])) {
        if (visited.has(edge.room)) continue;
        visited.add(edge.room);
        const step = node.step || edge;
        if (spawns.has(edge.room)) return step;
        next.push({ room: edge.room, step });
      }
    }
    frontier = next;
  }
  return null;
}

function agTickLoop(agent) {
  if (agent.stopping || !agent.ws) return;
  const v = agent.v;
  if (Date.now() > agent.deadline) { stopAgent(agent, 'time up'); return; }
  if (v.circle >= agent.circleTarget && v.circle > 1) { stopAgent(agent, `circle target ${agent.circleTarget} reached`); return; }

  // While the starter circling script runs, it owns combat/movement; the
  // tick loop only watches vitals and bails out if things go wrong.
  if (agent.scripting) {
    const hurtNow = v.maxhp > 0 && v.hp / v.maxhp < 0.2;
    if (hurtNow) void agCmd(agent, 'flee');
    agRenderState();
    setTimeout(() => agTickLoop(agent), 1500);
    return;
  }

  const rtBound = Date.now() < agent.rtUntil;
  const hurt = v.maxhp > 0 && v.hp / v.maxhp < 0.35;
  if (hurt && !v.resting) {
    void agCmd(agent, 'flee');
  } else if (v.resting && !hurt) {
    void agCmd(agent, 'stand');
  } else if (!rtBound && !v.resting) {
    if (agent.target) {
      void agCmd(agent, AG_MAGIC_GUILDS.has(agent.guild) ? `cast ${agent.target}` : `attack ${agent.target}`);
    } else if (agent.movePath && Date.now() - agent.lastMoveAt > 1200) {
      // Walking toward hunting grounds: one step per ~1.2s.
      agent.lastMoveAt = Date.now();
      void agCmd(agent, agent.movePath.dir).then(() => { agent.movePath = null; });
    } else if (Date.now() - agent.lastLookAt > 4000) {
      agent.lastLookAt = Date.now();
      // No creature here — if we're not in a spawn room, start walking.
      const step = v.room ? nextStepTowardSpawns(v.room) : null;
      if (step) {
        agent.movePath = step;
        agLog(agent, `heading to hunting grounds via ${step.dir}`);
        void agCmd(agent, step.dir);
      } else {
        void agCmd(agent, 'look');
      }
    }
  }
  agRenderState();
  setTimeout(() => agTickLoop(agent), 1500);
}

export function stopAgent(agent, why) {
  agent.stopping = true;
  try { agent.ws?.close(); } catch {}
  agent.ws = null;
  agLog(agent, `stopped — ${why || 'stopped by GM'}`);
  agRenderState();
}

export const agents = AG.agents;

// Populate the launch form once on boot (races/guilds + name suggestion).
export function initAgentForm() {
  for (const r of AG_RACES) $('ag-race').insertAdjacentHTML('beforeend', `<option value="${r}">${cap(r)}</option>`);
  for (const g of AG_GUILDS) $('ag-guild').insertAdjacentHTML('beforeend', `<option value="${g}">${cap(g)}</option>`);
  $('ag-race').addEventListener('change', agSuggestName);
  $('ag-guild').addEventListener('change', agSuggestName);
  agSuggestName();
  // Reloaded tab: show previously-running agents as "(tab closed)" rows.
  agRestore();
  agRenderState();
  setInterval(agRenderState, 3000); // HP bars move even between prompts
}

export { AG_RACES, AG_GUILDS };
