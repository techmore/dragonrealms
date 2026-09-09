// Browser-launched sim agents: register over WebSocket, walk the WS
// chargen handshake, apply boost, then run an event-driven hunt loop
// with world-graph pathing toward creature spawns.
// Used by /sims.html (launch form + rerun). Renders into #agstate/#agroster/
// #aglog on whatever page hosts it; render.js polling is optional.
import { agentHealth } from './agent-health.js';
import { createAgentScript } from './agent-script.js';
import { AG_RACES, AG_GUILDS, AG_STATUS_LABELS, validateAgentConfig } from './agent-config.js';
import { $, esc, trim, S, cssVar, fmtDur, toast, gm } from './core.js';

/* ================= launch agent ================= */
// Browser launcher uses the normal WebSocket registration and
// chargen handshake (register -> authed ->
// charcreate -> charalloc -> enter), boosts, then plays a simple
// event-driven hunt loop. Uses only existing wire messages — nothing
// server-side is added. The character shows up in the Online players
// roster as an ordinary session.

const AG_MAGIC_GUILDS = new Set(['bard', 'cleric', 'empath', 'moonmage', 'necromancer', 'warmage']);

const AG = { agents: [] };

// Persist last-known agent state so a tab reload doesn't amnesia the sim
// list — formerly active rows become interrupted; finished outcomes remain visible.
function agPersist() {
  try {
    const rows = AG.agents.slice(-40).map((a) => ({
      char: a.char, race: a.race, guild: a.guild, circleTarget: a.circleTarget,
      boost: a.boost, circle: a.v?.circle ?? 1,
      hp: a.v?.hp ?? 0, maxhp: a.v?.maxhp ?? 0,
      fleePct: a.fleePct, tickMs: a.tickMs,
      minutesLeft: a.ws && a.deadline ? Math.max(0, Math.round((a.deadline - Date.now()) / 60000)) : null,
      runId: a.runId, mode: a.mode, initialConfig: a.initialConfig,
      startedAt: a.startedAt, endedAt: a.endedAt, deadline: a.deadline,
      status: a.status, reason: a.reason,
      live: Boolean(a.ws || a.starting), at: Date.now(),
    }));
    localStorage.setItem('dr_admin_agents', JSON.stringify(rows));
  } catch {}
}
function agRestore() {
  try {
    const rows = JSON.parse(localStorage.getItem('dr_admin_agents') || '[]');
    for (const r of rows) {
      if (AG.agents.some((a) => a.runId === r.runId && r.runId)) continue;
      // Only resurrect rows from the last hour, marked as dead.
      if (Date.now() - (r.at || 0) > 36e5) continue;
      AG.agents.push({ char: r.char, race: r.race, guild: r.guild,
        runId: r.runId, mode: r.mode, initialConfig: r.initialConfig,
        startedAt: r.startedAt, endedAt: r.endedAt, deadline: r.deadline,
        status: r.live ? 'interrupted' : r.status || 'cancelled',
        reason: r.live ? 'This tab no longer owns the previous run.' : r.reason,
        stopping: true,
        circleTarget: r.circleTarget, boost: r.boost, ws: null,
        v: { hp: r.hp, maxhp: r.maxhp, circle: r.circle }, restored: true });
    }
  } catch {}
}

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function agSuggestName() {
  const g = $('ag-guild').value, r = $('ag-race').value;
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(5)), n => String.fromCharCode(97 + n % 26)).join('');
  $('ag-name').value = ('Sw' + cap(g) + cap(r)).slice(0, 15) + suffix;
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
  const live = AG.agents.filter((a) => a.ws || a.starting);
  const running = live.filter(a => a.status === 'running').length;
  // Running sims sort to the top of the roster.
  const ordered = [...AG.agents].sort((a, b) => (b.ws ? 1 : 0) - (a.ws ? 1 : 0));
  if (!AG.agents.length) { el.innerHTML = '&#9675; none running'; return; }
  el.innerHTML = live.length ? `&#9679; ${running} running · ${live.length - running} starting` : '&#9675; none running';
  el.style.color = live.length ? 'var(--green)' : 'var(--dim)';
  // Per-agent rows: name, guild, circle, HP bar, room state, Stop button.
  const host = $('agroster');
  if (host) {
    const template = document.createElement('template');
    template.innerHTML = ordered.map((a) => {
      const v = a.v || {};
      const f = v.maxhp > 0 ? Math.max(0, Math.min(1, v.hp / v.maxhp)) : null;
      const col = f == null ? 'var(--dim)' : f > 0.6 ? 'var(--green)' : f > 0.3 ? 'var(--amber)' : 'var(--red)';
      return `<div class="row${a.ws ? ' ag-live' : ''}" data-run="${esc(a.runId || a.char)}" data-ag="${esc(a.char)}"${a.ws ? ' style="outline:1px solid var(--green);border-radius:6px;padding:2px 6px;background:rgba(60,200,120,.06)"' : ''}>
        <span class="nm">${esc(a.char)}</span>
        <span class="cl">${esc(a.guild || '')} · c${v.circle ?? '?'}${a.circleTarget ? ` → c${esc(a.circleTarget)}` : ''}${v.room ? ` · ${esc(v.room)}` : ''}</span>
        <span class="hpbar" ${f == null ? 'hidden' : ''} title="${v.hp}/${v.maxhp} HP"><i style="width:${Math.round((f || 0) * 100)}%;background:${col}"></i></span>
        <span class="badge${a.status === 'running' ? ' live' : ''}" title="${esc(a.reason || a.runId || '')}">${esc(AG_STATUS_LABELS[a.status] || 'stopped')}</span>
        <span class="sub ag-health" role="status">${esc(a.reason || agentHealth(a))}</span>
        <button class="watch" data-agwatch="${esc(a.char)}" title="open a live spectate view in a new tab">&#128065; watch</button>
        <button class="watch" data-agstop="${esc(a.runId || a.char)}" aria-label="Stop ${esc(a.char)}" ${(a.ws || a.starting) ? '' : 'disabled'}>&#9208; stop</button>
      </div>`;
    }).join('');
    // Keep row/button identity through frequent vitals updates. Replacing a
    // pressed or focused control can swallow clicks and reset keyboard focus.
    const existing = new Map([...host.querySelectorAll(':scope > .row')].map(row => [row.dataset.run, row]));
    const wanted = [...template.content.children];
    for (let i = 0; i < wanted.length; i++) {
      const next = wanted[i];
      const row = existing.get(next.dataset.run);
      if (row) {
        row.className = next.className;
        row.style.cssText = next.style.cssText;
        [...next.children].forEach((child, index) => {
          const current = row.children[index];
          if (current?.tagName === 'BUTTON' && child.tagName === 'BUTTON') {
            current.disabled = child.disabled;
          } else if (current?.outerHTML !== child.outerHTML) {
            current.replaceWith(child.cloneNode(true));
          }
        });
        const at = host.querySelectorAll(':scope > .row')[i];
        if (at !== row) host.insertBefore(row, at || null);
        existing.delete(next.dataset.run);
      } else host.insertBefore(next, host.querySelectorAll(':scope > .row')[i] || null);
    }
    for (const row of existing.values()) row.remove();
    host.querySelectorAll('[data-agstop]').forEach((b) => { b.onclick = () => {
      const a = AG.agents.find((x) => (x.runId || x.char) === b.dataset.agstop);
      if (a) stopAgent(a, 'stopped by GM');
    }; });
    host.querySelectorAll('[data-agwatch]').forEach((b) => { b.onclick = () => {
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
    }; });
  }
  agPersist();
  if (AG.onRendered) { try { AG.onRendered(); } catch {} }
}

export function launchAgent(input) {
  const config = validateAgentConfig(input);
  const { name, race, guild, minutes, circleTarget, boost, fleePct, tickMs } = config;
  if (AG.agents.some(a => (a.ws || a.starting) && a.char.toLowerCase() === name.toLowerCase())) throw new Error(`${name} already has an active launch.`);
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const startedAt = Date.now();
  const runId = startedAt.toString(36) + '-' + random.slice(0, 8);
  const agent = {
    char: name, race, guild, circleTarget, boost, fleePct, tickMs,
    runId, startedAt, initialConfig: Object.freeze({ ...config }), mode: 'fresh',
    status: 'connecting', reason: null, endedAt: null,
    user: 'sim_' + runId, password: random,
    ws: null, token: null, starting: true,
    lastCmdAt: 0, rtUntil: 0, deadline: startedAt + minutes * 60000, stopping: false,
    v: { hp: 0, maxhp: 0, mana: 0, maxmana: 0, circle: 1, rt: 0, inCombat: false, resting: false, room: null },
    target: null, lastLookAt: 0, kills: 0,
  };
  agent.script = createAgentScript({
    send: line => { agent.lastScriptCommandAt = Date.now(); agSend(agent, { t: 'input', line }); },
    say: text => agLog(agent, text),
    roomNow: () => agent.v.room,
    onDone: () => stopAgent(agent, 'starter script finished', 'script_finished'),
  });
  agent.startTimer = setTimeout(() => stopAgent(agent, 'startup timed out', 'failed'), 15000);
  armDeadline(agent);
  AG.agents.push(agent);
  agLog(agent, `launching as ${agent.user} (${race} ${guild}, ${minutes || '?'}m, circle ${circleTarget}, boost x${boost || 'off'}, flee ${Math.round(agent.fleePct * 100)}%)`);
  agRenderState();
  loadWorldGraph().catch((e) => agLog(agent, `world graph unavailable: ${e.message}`, 'bad'));
  try { agConnect(agent); }
  catch (error) { stopAgent(agent, error.message, 'failed'); }
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

function armDeadline(agent) {
  clearTimeout(agent.deadlineTimer);
  agent.deadlineTimer = setTimeout(() => stopAgent(agent, 'time limit reached', 'time_limit'), Math.max(0, agent.deadline - Date.now()));
}
export function extendTimer(agent, minutes) {
  const add = Number(minutes);
  if (agent.stopping || !agent.ws || Date.now() >= agent.deadline || !Number.isFinite(add) || add < 1 || add > 240) return false;
  agent.deadline = Math.min(agent.startedAt + 720 * 60000, agent.deadline + add * 60000);
  armDeadline(agent);
  agLog(agent, `timer extended (ends ~${new Date(agent.deadline).toLocaleTimeString()})`, 'ok');
  agPersist();
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

function agConnect(agent) {
  if (agent.stopping) return;
  // ?bot=1: self-identify as a sim so rosters/status can tag these
  // characters (same convention as the wire-level sweep agents' cousins).
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?bot=1';
  const ws = new WebSocket(url);
  agent.ws = ws;
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } agOnMessage(agent, m); };
  ws.onclose = () => {
    if (agent.stopping) return;
    agLog(agent, 'socket closed', 'bad');
    stopAgent(agent, 'connection closed before the run ended', 'failed');
  };
}

function agSend(agent, obj) {
  if (!agent.stopping && Date.now() >= agent.deadline) { stopAgent(agent, 'time limit reached', 'time_limit'); return; }
  if (!agent.stopping && agent.ws && agent.ws.readyState === WebSocket.OPEN) agent.ws.send(JSON.stringify(obj));
}

async function agCmd(agent, line) {
  const wait = 200 - (Date.now() - agent.lastCmdAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  agent.lastCmdAt = Date.now();
  agSend(agent, { t: 'input', line });
}

const stripAnsi = (s) => String(s ?? '').replace(/\x1b\[\d+m/g, '');

function agOnMessage(agent, m) {
  if (agent.stopping) return;
  const v = agent.v;
  switch (m.t) {
    case 'login_prompt':
      if (agent.authSent) break;
      agent.authSent = true;
      agent.status = 'registering';
      agSend(agent, { t: 'register', u: agent.user, p: agent.password });
      agRenderState();
      break;
    case 'authed':
      agent.token = m.token;
      agent.password = null;
      break;
    case 'charselect':
      stopAgent(agent, 'Fresh-run registration unexpectedly returned an existing account. No character was reused.', 'failed');
      break;
    case 'charcreate':
      agent.status = 'creating';
      agSend(agent, { t: 'charcreate', name: agent.char, race: agent.race, guild: agent.guild, city: 'crossing' });
      break;
    case 'charalloc':
      agSend(agent, { t: 'enter' });
      break;
    case 'enter':
      clearTimeout(agent.startTimer);
      clearTimeout(agent.tickTimer);
      agent.entered = true;
      agent.starting = false;
      agent.waitingForScript = true;
      agent.status = 'loading_scripts';
      agent.startTimer = setTimeout(() => stopAgent(agent, 'starter library timed out', 'failed'), 15000);
      agLog(agent, `entered the world${agent.boost > 1 ? ` — boost x${agent.boost}` : ''}`, 'ok');
      if (agent.boost > 1) agSend(agent, { t: 'boost', mult: agent.boost });
      // Immediate circling-on-launch: ask the server to generate the
      // starter hunt/circle/mega library and auto-run it. The tick loop
      // stays as a watchdog (flee/heal) underneath the script.
      agSend(agent, { t: 'gen_starter' });
      agTickLoop(agent);
      break;
    case 'scripts':
      agent.script.setLibrary(m.scripts);
      break;
    case 'autorun':
      clearTimeout(agent.startTimer);
      agent.waitingForScript = false;
      agent.status = 'running';
      agent.scriptStartedAt = Date.now();
      if (!agent.script.start(m.name)) { stopAgent(agent, `starter script unavailable: ${m.name}`, 'failed'); break; }
      agent.scripting = agent.script.running;
      if (agent.scripting) agLog(agent, `starter circling script running: ${m.name}`, 'ok');
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
      agent.lastError = stripAnsi(m.msg);
      if (!agent.entered || agent.waitingForScript) stopAgent(agent, agent.lastError, 'failed');
      break;
  }
  if (!agent.stopping) agent.script.feed(m);
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
  if (Date.now() > agent.deadline) { stopAgent(agent, 'time limit reached', 'time_limit'); return; }
  if (v.circle >= agent.circleTarget && v.circle > 1) { stopAgent(agent, `circle target ${agent.circleTarget} reached`, 'completed'); return; }
  agent.script.tick();
  if (agent.stopping) return;

  // While the starter circling script runs, it owns combat/movement; the
  // tick loop only watches vitals and bails out if things go wrong.
  if (agent.scripting || agent.waitingForScript) {
    const hurtNow = v.maxhp > 0 && v.hp / v.maxhp < agent.fleePct * 0.6;
    if (hurtNow && !agent.waitingForScript) void agCmd(agent, 'flee');
    agRenderState();
    agent.tickTimer = setTimeout(() => agTickLoop(agent), agent.tickMs);
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
  agent.tickTimer = setTimeout(() => agTickLoop(agent), agent.tickMs);
}

export function stopAgent(agent, why, outcome = 'cancelled') {
  if (agent.stopping) return;
  agent.stopping = true;
  agent.starting = false;
  agent.status = outcome;
  agent.reason = why || 'stopped by GM';
  agent.endedAt = Date.now();
  agent.password = null;
  agent.token = null;
  clearTimeout(agent.deadlineTimer);
  clearTimeout(agent.startTimer);
  clearTimeout(agent.tickTimer);
  agent.script?.stop();
  agent.scripting = false;
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
  // Reloaded tab: preserve outcomes and mark formerly active runs interrupted.
  agRestore();
  agRenderState();
  setInterval(agRenderState, 3000); // HP bars move even between prompts
}

export { AG_RACES, AG_GUILDS };
