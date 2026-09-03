// Game Master console: read-only inspection of the world, the DB, live
// players, and (via the existing WS spectate relay) a live read-only stream
// of any individual player. Mutating changes belong to /api/debug; this page
// only ever queries.
//
// S1: every server-derived value (player names, room text, DB cells, error
// strings) is HTML-escaped before touching innerHTML. DB cells hold arbitrary
// player-authored text (aliases, script bodies), so unescaped rendering was a
// stored-XSS path into the privileged GM origin and its localStorage token.
import { $, escapeHtml as esc } from './util.js';
import { harvestGmTokenFromFragment } from './gm-token.js';

const API = '/api/gm';
const LS_TOKEN = 'dr_gm_token';

// Trusted-launcher handoff: the menu-bar app opens gm.html#gm=<token>; store
// it once and strip the fragment so it never lingers in the address bar.
harvestGmTokenFromFragment();

function token() { try { return localStorage.getItem(LS_TOKEN) || ''; } catch { return ''; } }
function saveToken(t) { try { localStorage.setItem(LS_TOKEN, t); } catch {} }

async function api(path) {
  const r = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
  });
  if ([401, 403, 503].includes(r.status)) {
    const el = $('gm-token');
    if (el) { el.style.borderColor = 'var(--red)'; }
    const detail = await r.json().catch(() => null);
    throw new Error(detail?.error || 'unauthorized — enter the dedicated DR_GM_TOKEN');
  }
  return r.json();
}

let selectedPlayer = null;

async function loadSummary() {
  const s = await api('/summary');
  const el = $('gm-summary');
  if (!s.ok || !el) return;
  el.innerHTML = `
    <div><b>${s.rooms}</b> rooms · <b>${s.zones}</b> zones</div>
    <div><b>${s.creatures}</b> creatures · <b>${s.npcs}</b> NPCs · <b>${s.items}</b> items</div>
    <div><b>${s.guilds}</b> guilds · <b>${s.races}</b> races · <b>${s.skills}</b> skills · <b>${s.khri}</b> khri</div>
    <div><b>${s.accounts}</b> accounts · <b>${s.characters}</b> characters</div>
    <div><b>${s.playersOnline}</b> online now</div>
  `;
  renderOnline(s.online || []);
}

function renderOnline(online) {
  const list = $('gm-online');
  if (!list) return;
  list.innerHTML = online.map((p) => `
    <button class="gm-pip" data-name="${esc(p.name)}">
      ${esc(p.name)} <span class="gm-dim">(${esc(p.guild)}·${esc(p.circle)}) ${esc(p.room)}${p.inCombat ? ' ⚔' : ''}</span>
    </button>
  `).join('') || '<div class="gm-dim">no players online</div>';
  list.querySelectorAll('[data-name]').forEach((b) => {
    b.addEventListener('click', () => { selectedPlayer = b.dataset.name; loadPlayerView(); });
  });
}

async function loadWorld() {
  const el = $('gm-world');
  const w = await api('/world');
  if (!w.ok || !el) return;
  el.innerHTML = w.zones.map((z) => `
    <div class="gm-zone">
      <div class="gm-zone-name">${esc(z.name)} <span class="gm-dim">(${z.rooms.length})</span></div>
      <div class="gm-rooms">${z.rooms.map((r) => `
        <button class="gm-room" data-id="${esc(r.id)}" title="${esc(r.address || r.id)}">${esc(r.name)}</button>
      `).join('')}</div>
    </div>
  `).join('');
  el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => loadRoom(b.dataset.id)));
}

async function loadRoom(id) {
  const el = $('gm-room-detail');
  const r = await api('/room/' + encodeURIComponent(id));
  if (!r.ok || !el) return;
  el.innerHTML = `
    <div class="gm-t">[[${esc(r.room.name)}, ${esc(r.zone.name)}]]</div>
    <div class="gm-desc">${esc(r.room.desc)}</div>
    <div class="gm-meta">address: ${esc(r.room.address || r.room.id)}</div>
    <div class="gm-meta">exits: ${esc(Object.keys(r.room.exits || {}).join(', ')) || 'none'}</div>
    <div class="gm-meta">creatures: ${r.creatures.length ? esc(r.creatures.map((c) => `${c.name} (${c.hp}/${c.maxHp})`).join(', ')) : 'none'}</div>
    <div class="gm-meta">players: ${r.players.length ? esc(r.players.join(', ')) : 'none'}</div>
    <div class="gm-meta">ground: ${r.floor.length ? esc(r.floor.join(', ')) : 'none'}</div>
  `;
}

async function loadCharacters() {
  const el = $('gm-chars');
  const c = await api('/characters');
  if (!c.ok || !el) return;
  el.innerHTML = c.characters.map((ch) => `
    <button class="gm-ch" data-name="${esc(ch.name)}">${esc(ch.name)}</button>
  `).join('') || '<div class="gm-dim">no characters</div>';
  el.querySelectorAll('[data-name]').forEach((b) => b.addEventListener('click', () => { selectedPlayer = b.dataset.name; loadPlayerView(); }));
}

async function loadPlayerView() {
  const detail = $('gm-player-detail');
  const stream = $('gm-player-stream');
  const p = selectedPlayer && await api('/player/' + encodeURIComponent(selectedPlayer));
  if (!p || !p.ok || !detail) { if (detail) detail.innerHTML = '<div class="gm-dim">select a player</div>'; return; }
  const pl = p.player;
  const skills = Object.entries(p.skills).slice(0, 15).map(([id, s]) => `${id}:${s.rank}`).join(' · ');
  detail.innerHTML = `
    <div class="gm-t">${esc(pl.name)} <span class="gm-dim">(${esc(pl.race)} ${esc(pl.guild)}, circle ${esc(pl.circle)}${p.offline ? ' — OFFLINE' : ''})</span></div>
    <div class="gm-meta">hp ${esc(pl.hp)}/${esc(pl.maxHp)} · mana ${esc(pl.mana||0)}/${esc(pl.maxMana||0)} · stamina ${esc(pl.stamina||0)}/${esc(pl.maxStamina||0)}</div>
    <div class="gm-meta">silver ${esc(pl.silver)} · bank ${esc(pl.bank)} · tdp ${esc(pl.tdp)} (pool ${esc(pl.tdpPool)})</div>
    <div class="gm-meta">room: ${esc(pl.room)} · stance ${esc(pl.stance)} · hidden ${!!pl.hidden} · resting ${!!pl.resting}</div>
    <div class="gm-meta">abilities: ${esc((pl.abilities||[]).join(', '))||'none'} ${pl.combat ? '· ⚔ in combat' : ''}</div>
    <div class="gm-meta">weapon: ${esc(p.equipment.hand||'fists')}</div>
    <div class="gm-skills">${esc(skills || 'no skills')}</div>
  `;
  if (stream) {
    if (!p.offline && stream.dataset.watching !== selectedPlayer) {
      stream.dataset.watching = selectedPlayer;
      watchLive(selectedPlayer);
    } else if (p.offline) { stream.innerHTML = '<div class="gm-dim">offline — no live stream (snapshot above)</div>'; }
  }
}

function watchLive(name) {
  const out = $('gm-player-stream');
  out.innerHTML = `<div class="gm-dim">— live stream: ${esc(name)} —</div>`;
  // O13: close the previous spectator socket before opening another — rapid
  // player switching used to stack live streams (server load + interleaved
  // output from stale sessions).
  if (watchLive.ws) { try { watchLive.ws.close(); } catch {} }
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws');
  watchLive.ws = ws;
  ws.onopen = () => { if (watchLive.ws === ws) ws.send(JSON.stringify({ t: 'spectate', name, gmToken: token() })); };
  ws.onmessage = (ev) => {
    if (watchLive.ws !== ws) return; // stale socket — ignore entirely
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'command') { appendStream(`> ${m.line}`, 'gm-cmd'); return; }
    if (['room','msg','combat','notice','error','hands','targets'].includes(m.t)) {
      const txt = m.msg || (m.t === 'hands' ? `hand: ${m.hand || 'empty'}, worn: ${(m.worn||[]).join(',') || 'none'}` : m.t);
      appendStream(txt, 'gm-' + m.t);
    }
  };
  ws.onclose = () => { if (watchLive.ws === ws) { watchLive.ws = null; appendStream('— stream closed —', 'gm-dim'); } };
}

// GM world feed: every online player's messages, tagged by source.
let worldWs = null;
function toggleWorldFeed() {
  const btn = $('gm-world-btn');
  const out = $('gm-world-stream');
  if (!btn || !out) return;
  if (worldWs) { worldWs.close(); worldWs = null; btn.textContent = 'start'; out.innerHTML = ''; return; }
  btn.textContent = 'stop';
  out.innerHTML = '<div class="gm-dim">— world feed —</div>';
  worldWs = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws');
  worldWs.onopen = () => worldWs.send(JSON.stringify({ t: 'worldwatch', gmToken: token() }));
  worldWs.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'notice') return;
    const who = m._player ? `[${m._player}] ` : '';
    const txt = m.t === 'command' ? `> ${m.line}` : (m.msg || m.t);
    const div = document.createElement('div');
    div.className = 'gm-line gm-wf';
    div.textContent = who + String(txt).replace(/\x1b\[\d+m/g, '');
    out.appendChild(div);
    while (out.children.length > 400) out.removeChild(out.firstChild);
    out.scrollTop = out.scrollHeight;
  };
  worldWs.onclose = () => { worldWs = null; if (btn) btn.textContent = 'start'; };
}
$('gm-world-btn')?.addEventListener('click', toggleWorldFeed);

function appendStream(text, cls) {
  const out = $('gm-player-stream');
  const div = document.createElement('div');
  div.className = 'gm-line ' + (cls || '');
  div.textContent = text;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}

async function loadDb() {
  const tablesEl = $('gm-db-tables');
  const out = $('gm-db-out');
  try {
    const d = await api('/db');
    if (!d.ok || !tablesEl) return;
    tablesEl.innerHTML = d.tables.map((t) => `<button class="gm-ch" data-tbl="${esc(t)}">${esc(t)}</button>`).join('');
    tablesEl.querySelectorAll('[data-tbl]').forEach((b) => b.addEventListener('click', async () => {
      const r = await api('/db/' + b.dataset.tbl);
      renderDbRows(out, r);
    }));
    // O13: bind the query listener ONCE (a dataset guard) — every refresh
    // used to stack another Enter listener, multiplying DB queries per press.
    const q = $('gm-db-q');
    if (q && !q.dataset.dbBound) {
      q.dataset.dbBound = '1';
      q.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const r = await api('/db?q=' + encodeURIComponent(q.value.trim()));
        renderDbRows(out, r);
      });
    }
  } catch (e) { if (out) out.innerHTML = '<div class="gm-dim">' + esc(e.message) + '</div>'; }
}

function renderDbRows(out, r) {
  if (!out) return;
  if (!r.ok) { out.innerHTML = '<div class="gm-dim">' + esc(r.error || 'error') + '</div>'; return; }
  const rows = r.rows || [];
  if (!rows.length) { out.innerHTML = '<div class="gm-dim">0 rows</div>'; return; }
  const cols = Object.keys(rows[0]);
  // S1 core fix: DB cells carry arbitrary player-authored text (aliases,
  // script bodies, names). Nothing from the database reaches innerHTML raw.
  const html = `<table class="gm-table"><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>` +
    rows.map((row) => `<tr>${cols.map((c) => `<td>${esc(JSON.stringify(row[c]) ?? '')}</td>`).join('')}</tr>`).join('') + '</table>';
  out.innerHTML = html;
}

const goBtn = $('gm-token-go');
const tokIn = $('gm-token');
if (tokIn) tokIn.value = token();
if (goBtn) {
  goBtn.addEventListener('click', () => { saveToken(tokIn.value.trim()); loadAll(); });
  tokIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') goBtn.click(); });
}

async function loadAll() {
  const results = await Promise.allSettled([loadSummary(), loadWorld(), loadCharacters(), loadDb()]);
  if (results.some((r) => r.status === 'rejected')) {
    const el = $('gm-summary');
    if (el && !el.innerHTML) el.innerHTML = '<div class="gm-dim">Enter the dedicated DR_GM_TOKEN above. Game session tokens are not accepted.</div>';
  }
}

$('gm-refresh')?.addEventListener('click', loadAll);

loadAll();
