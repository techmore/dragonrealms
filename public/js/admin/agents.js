// Browser-launched sim agents: register/login over HTTP, walk the WS
// chargen handshake, apply boost, then run an event-driven hunt loop
// with world-graph pathing toward creature spawns.
// Used by /sims.html (launch form + rerun). Renders into #agstate/#agroster/
// #aglog on whatever page hosts it; render.js polling is optional.
import { $, esc, trim, S, cssVar, fmtDur, toast, gm } from './core.js';

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
      fleePct: a.fleePct, tickMs: a.tickMs,
      minutesLeft: a.ws && a.deadline ? Math.max(0, Math.round((a.deadline - Date.now()) / 60000)) : null,
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
  // Running sims sort to the top of the roster.
  const ordered = [...AG.agents].sort((a, b) => (b.ws ? 1 : 0) - (a.ws ? 1 : 0));
  if (!AG.agents.length) { el.innerHTML = '&#9675; none running'; return; }
  el.innerHTML = live.length ? `&#9679; ${live.length} running` : '&#9675; none running';
  el.style.color = live.length ? 'var(--green)' : 'var(--dim)';
  // Per-agent rows: name, guild, circle, HP bar, room state, Stop button.
  const host = $('agroster');
  if (host) {
    host.innerHTML = ordered.map((a) => {
      const v = a.v || {};
      const f = v.maxhp > 0 ? Math.max(0, Math.min(1, v.hp / v.maxhp)) : null;
      const col = f == null ? 'var(--dim)' : f > 0.6 ? 'var(--green)' : f > 0.3 ? 'var(--amber)' : 'var(--red)';
      return `<div class="row${a.ws ? ' ag-live' : ''}" data-ag="${esc(a.char)}"${a.ws ? ' style="outline:1px solid var(--green);border-radius:6px;padding:2px 6px;background:rgba(60,200,120,.06)"' : ''}>
        <span class="nm">${esc(a.char)}</span>
        <span class="cl">${esc(a.guild || '')} · c${v.circle ?? '?'}${a.circleTarget ? ` → c${esc(a.circleTarget)}` : ''}${v.room ? ` · ${esc(v.room)}` : ''}</span>
        ${f == null ? '' : `<span class="hpbar" title="${v.hp}/${v.maxhp} HP"><i style="width:${Math.round(f * 100)}%;background:${col}"></i></span>`}
        ${a.ws ? '<span class="badge live">&#9679; running</span>'
          : a.restored ? '<span class="badge" title="this tab was reloaded — the socket is gone">(tab closed)</span>'
          : '<span class="badge">stopped</span>'}
        <button class="watch" data-agwatch="${esc(a.char)}" title="open a live spectate view in a new tab">&#128065; watch</button>
        <button class="watch" data-agstop="${esc(a.char)}" ${a.ws ? '' : 'disabled'}>&#9208; stop</button>
      </div>`;
    }).join('');
    host.querySelectorAll('[data-agstop]').forEach((b) => b.addEventListener('click', () => {
      const a = AG.agents.find((x) => x.char === b.dataset.agstop);
      if (a) stopAgent(a, 'stopped by GM');
    }));
    host.querySelectorAll('[data-agwatch]').forEach((b) => b.addEventListener('click', () => {
      // Spectate needs the GM token in localStorage; carry it via fragment
      // too for fresh tabs with cold storage.
      let frag = '';
      try {
        const t = localStorage.getItem('dr_gm_token');
        if (t) frag = '#gm=' + encodeURIComponent(t);
      } catch {}
      // No credential anywhere -> the tab would dead-end at the GM prompt.
      // Say so instead of opening something that cannot work.
      if (!frag) {
        try { window.parent.postMessage({ t: 'gm-toast', text: 'Live watch needs your DR_GM_TOKEN — enter it on the Admin dash first.' }, '*'); } catch {}
        return;
      }
      window.open('/?spectate=' + encodeURIComponent(b.dataset.agwatch) + frag, '_blank');
    }));
  }
  agPersist();
  if (AG.onRendered) { try { AG.onRendered(); } catch {} }
}

export function launchAgent({ name, race, guild, minutes, circleTarget, boost, fleePct, tickMs }) {
  const agent = {
    char: name, race, guild, circleTarget, boost,
    fleePct: Number.isFinite(Number(fleePct)) && Number(fleePct) > 0 ? Number(fleePct) : 0.35,
    tickMs: Number.isFinite(Number(tickMs)) && Number(tickMs) >= 500 ? Number(tickMs) : 1500,
    user: `admin_${guild}_${race}`,
    ws: null, token: null, knownCharId: null,
    lastCmdAt: 0, rtUntil: 0, deadline: 0, stopping: false,
    v: { hp: 0, maxhp: 0, mana: 0, maxmana: 0, circle: 1, rt: 0, inCombat: false, resting: false, room: null },
    target: null, lastLookAt: 0, kills: 0,
  };
  AG.agents.push(agent);
  agLog(agent, `launching as ${agent.user} (${race} ${guild}, ${minutes || '?'}m, circle ${circleTarget}, boost x${boost || 'off'}, flee ${Math.round(agent.fleePct * 100)}%)`);
  agRenderState();
  loadWorldGraph().catch((e) => agLog(agent, `world graph unavailable: ${e.message}`, 'bad'));
  agHttpLogin(agent)
    .then(() => { agConnect(agent, minutes); })
    .catch((e) => { agLog(agent, `FAILED: ${e.message}`, 'bad'); agent.ws = null; agRenderState(); });
  return agent;
}

// Mid-run tweaks (per-sim panel): all safe to call on a live agent.
export function tweakBoost(agent, mult) {
  const m = Math.max(0, Math.min(100, Math.floor(Number(mult) || 0)));
  if (!agent.ws) return false;
  agent.boost = m > 1 ? m : (m === 1 ? 1 : 0);
  // Server semantics: {t:'boost', mult:<=0} disengages; >=1 sets. Send as-is.
  agSend(agent, { t: 'boost', mult: m });
  agLog(agent, `boost set to x${m || 'off'}`, 'ok');
  return true;
}

export function extendTimer(agent, minutes) {
  const add = Math.max(1, Math.min(240, Math.floor(Number(minutes) || 0)));
  if (!agent.deadline) agent.deadline = Date.now();
  const wasPast = Date.now() > agent.deadline;
  agent.deadline += add * 60000;
  // A stopped-for-time-up agent has no socket; only a live one can resume.
  if (wasPast && !agent.ws) {
    agLog(agent, `timer extended ${add}m but the run already ended — relaunch to resume`, 'bad');
    return false;
  }
  agLog(agent, `timer extended +${add}m (ends ~${new Date(agent.deadline).toLocaleTimeString()})`, 'ok');
  return true;
}

export function setFleePct(agent, pct) {
  const p = Math.max(5, Math.min(95, Math.round(Number(pct))));
  if (!Number.isFinite(p)) return false;
  agent.fleePct = p / 100;
  agLog(agent, `flee threshold set to ${p}% HP`);
  return true;
}

export function setTickMs(agent, ms) {
  const t = Math.max(500, Math.min(10000, Math.floor(Number(ms) || 0)));
  if (!Number.isFinite(t)) return false;
  agent.tickMs = t;
  agLog(agent, `tick loop interval set to ${t}ms`);
  return true;
}

// Type an arbitrary command into a running sim's session.
export async function simCommand(agent, line) {
  const cmd = String(line || '').trim();
  if (!cmd || !agent.ws) return false;
  await agCmd(agent, cmd);
  agLog(agent, `> ${cmd}`);
  return true;
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
  const chars = r.characters || [];
  const known = chars.find((c) => c.name === agent.char);
  agent.knownCharId = known ? known.charId : null;
  // Slot-cap fallback: remember existing char ids so a full account can
  // reuse one instead of failing creation.
  agent.existingIds = chars.map((c) => c.charId);
  agent.existingNames = chars.map((c) => c.name);
  if (!agent.knownCharId && agent.existingIds.length) {
    // Name not on this account but the account has chars: at cap, the
    // newest existing char is the best reuse candidate.
    agent.fallbackCharId = agent.existingIds[agent.existingIds.length - 1];
    agent.fallbackName = agent.existingNames[agent.existingNames.length - 1];
  }
  agLog(agent, `authed as ${agent.user} (${known ? 'existing' : 'new'} char${!known && agent.existingIds.length ? `, ${agent.existingIds.length} reusable` : ''})`, 'ok');
}

function agConnect(agent, minutes) {
  // ?bot=1: self-identify as a sim so rosters/status can tag these
  // characters (same convention as the wire-level sweep agents' cousins).
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?bot=1';
  const ws = new WebSocket(url);
  agent.ws = ws;
  agent.deadline = Date.now() + Number(minutes || $('ag-minutes').value || 10) * 60000;
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
      if (agent.pendingSelectId) {
        // Slot-cap recovery: select the reused char immediately.
        const id = agent.pendingSelectId;
        agent.pendingSelectId = null;
        agSend(agent, { t: 'charselect', id });
        break;
      }
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
        // Cross-account name collision (sims share a global unique name
        // space). Retry once with a numbered suffix instead of dying —
        // this is exactly what "rerun" from a saved run hits when the
        // original sweep still owns the name.
        if (!agent.retriedName) {
          agent.retriedName = true;
          // Names are letters-only server-side (validName), so the suffix
          // must be a letter, not a digit. Clip to 19 so base+letter fits
          // even at the 20-char cap.
          const base = agent.char.replace(/[A-Z]$/, '').slice(0, 19);
          const suffix = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
          agent.char = `${base}${suffix}`;
          agLog(agent, `name taken — retrying as "${agent.char}"`, 'ok');
          // Session is stuck in charcreate after the failed create; re-token
          // to get back to charselect, which re-walks the creation path.
          agSend(agent, { t: 'token', token: agent.token });
        } else {
          stopAgent(agent, 'name collision after retry');
        }
      } else if (/not a valid character|no such character/i.test(String(m.msg))) {
        agSend(agent, { t: 'charselect', id: 'new' });
      } else if (/already has \d+ characters/i.test(String(m.msg))) {
        // Account slot cap: reuse an existing char instead of failing —
        // sims are disposable by design. Prefer the exact-name char, then
        // the newest existing one. The session is in 'charcreate' state
        // after a failed creation, and doCharSelect only runs from
        // 'charselect' — re-token to get back there first.
        const fallback = agent.knownCharId || agent.fallbackCharId;
        if (fallback) {
          agLog(agent, `slot cap hit — reusing char "${agent.fallbackName || agent.char}" (id ${fallback})`, 'ok');
          agent.knownCharId = fallback;
          agent.char = agent.fallbackName || agent.char;
          agent.reused = true;
          agSend(agent, { t: 'token', token: agent.token }); // resets state to charselect
          agent.pendingSelectId = fallback;
        } else {
          stopAgent(agent, 'account at character cap and no reusable char');
        }
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
    const hurtNow = v.maxhp > 0 && v.hp / v.maxhp < agent.fleePct * 0.6;
    if (hurtNow) void agCmd(agent, 'flee');
    agRenderState();
    setTimeout(() => agTickLoop(agent), agent.tickMs);
    return;
  }

  const rtBound = Date.now() < agent.rtUntil;
  const hurt = v.maxhp > 0 && v.hp / v.maxhp < agent.fleePct;
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
  setTimeout(() => agTickLoop(agent), agent.tickMs);
}

export function stopAgent(agent, why) {
  agent.stopping = true;
  try { agent.ws?.close(); } catch {}
  agent.ws = null;
  agLog(agent, `stopped — ${why || 'stopped by GM'}`);
  agRenderState();
}

export const agents = AG.agents;

// Classic-script bridge: /sims.html loads this file as an ES module via
// <script type="module"> and reads the API off window.DRSims.
// onRendered: optional host hook — called after every roster render so the
// page can re-pin its per-sim panel (see sims.html bindSims).
AG.onRendered = null;

if (typeof window !== 'undefined') {
  window.DRSims = {
    initAgentForm, launchAgent, stopAgent, agents,
    tweakBoost, extendTimer, setFleePct, setTickMs, simCommand,
    find: (name) => AG.agents.find((a) => a.char === name),
    set onRendered(fn) { AG.onRendered = typeof fn === 'function' ? fn : null; },
    renderRoster: () => agRenderState(),
  };
}

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
