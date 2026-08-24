// Polling loop and all dashboard rendering: health/status/summary
// fetches, vitals + sparklines, roster, zones drill-down, high scores.
import { $, esc, trim, S, cssVar, fmtDur, fmtBytes, toast, gm } from './core.js';
import { listJobs } from './jobs.js';

/* ================= high scores ================= */
const HS = { page: 1, perPage: 25, sort: 'circle' };
export async function loadHighScores() {
  const r = await gm(`highscores?page=${HS.page}&perPage=${HS.perPage}&sort=${HS.sort}`);
  if (!r.ok || !r.d?.characters) return;
  const { characters, total, page, perPage } = r.d;
  const pages = Math.max(1, Math.ceil(total / perPage));
  $('hs-page').textContent = `${page} / ${pages}`;
  $('hs-prev').disabled = page <= 1;
  $('hs-next').disabled = page >= pages;
  $('hssum').textContent = `${total} characters`;
  $('hs-rows').innerHTML = characters.map((c, i) => `
    <tr>
      <td class="sub">${(page - 1) * perPage + i + 1}</td>
      <td><b>${c.name}</b> <span class="sub">${c.username}</span></td>
      <td>${c.race}</td>
      <td>${c.guild}</td>
      <td><b>${c.circle}</b></td>
      <td>${c.ranks}</td>
      <td>${c.silver}</td>
    </tr>`).join('');
}
// High-scores wiring is optional: the section may be absent from the page
// (removed in a UI pass). Guard so a missing element can't throw and kill
// the whole init script — that took the whole dash down as "OFFLINE".
if ($('hs-prev')) $('hs-prev').onclick = () => { if (HS.page > 1) { HS.page--; loadHighScores(); } };
if ($('hs-next')) $('hs-next').onclick = () => { HS.page++; loadHighScores(); };
if ($('hs-sort')) $('hs-sort').onchange = () => { HS.sort = $('hs-sort').value; HS.page = 1; loadHighScores(); };

/* ================= polling ================= */

let hsLast = 0;
export async function tick(manual = false) {
  if (S.gm === 'ok' && Date.now() - hsLast > 30000) { hsLast = Date.now(); loadHighScores().catch(() => {}); }

  if (S.paused && !manual) return;

  // public health — always available, also feeds latency + population history
  try {
    const t0 = performance.now();
    const r = await fetch('/api/health', { cache: 'no-store' });
    const h = await r.json();
    S.lat.push(Math.max(1, Math.round(performance.now() - t0)));
    trim(S.lat, 180);
    S.up = true;
    S.base = {};
    for (const p of (h.online || [])) S.base[p.name] = p;
  } catch { S.up = false; }

  // GM side
  if (!S.token) { S.gm = 'off'; }
  else {
    const [st, sm] = await Promise.all([gm('admin/status'), gm('summary')]);
    if (st.code === 200 && st.ok) {
      const proc = st.d.proc;
      if (proc) {
        const at = Date.now();
        if (S.cpu) {
          const wallUs = Math.max(1, at - S.cpu.at) * 1000;
          S.cpuPct = Math.max(0, ((proc.cpuUserUs - S.cpu.user) + (proc.cpuSystemUs - S.cpu.system)) / wallUs * 100);
        }
        S.cpu = { user: proc.cpuUserUs, system: proc.cpuSystemUs, at };
      }
      S.status = st.d;
      S.statusAt = Date.now();
      S.gm = 'ok';
      if (!S.world) loadWorld();
    } else if (st.code === 401 || st.code === 403) {
      S.gm = 'locked';
      // Keep the stored token. A 401 here is usually a world restart or a
      // brief unavailability, not a revoked credential — wiping storage
      // logs the operator out of every GM surface for no reason. The dash
      // shows 'locked' and retries; the token proves itself on recovery.
    }
    else if (st.code === 503) S.gm = 'notconf';
    else S.gm = 'err';
    if (sm.code === 200 && sm.ok) S.summary = sm.d;
  }

  listJobs();
  renderAll();
}

export async function loadWorld() {
  const [w, n] = await Promise.all([gm('world'), gm('npcs')]);
  if (w.code === 200 && w.ok) S.world = w.d;
  if (n.code === 200 && n.ok) {
    S.npcNames = {};
    for (const x of n.d.npcs) S.npcNames[x.id] = x.name;
  }
  renderZones();
}

/* ================= render ================= */

export function renderAll() {
  renderHeader();
  renderVitals();
  renderLoad();
  renderRoster();
  renderZones();
  const flag = $('gmflag');
  flag.textContent = S.gm === 'ok' ? 'GM: connected'
    : S.gm === 'off' ? 'GM: no token'
    : S.gm === 'locked' ? 'GM: TOKEN REJECTED — paste fresh'
    : S.gm === 'notconf' ? 'GM: not configured on server'
    : 'GM: unreachable';
  flag.style.color = S.gm === 'ok' ? 'var(--green)' : 'var(--red)';
  $('worldref').disabled = !(S.gm === 'ok');
  $('reload').disabled = !(S.gm === 'ok');
}

export function renderHeader() {
  const pill = $('pill');
  pill.className = 'pill ' + (S.up ? 'up' : 'down');
  $('pilltxt').textContent = S.up ? 'WORLD ONLINE' : 'OFFLINE';
  const up = S.status?.uptimeMs != null
    ? S.status.uptimeMs + (Date.now() - S.statusAt)
    : null;
  $('uptime').textContent = '\u23F3 ' + (up != null ? fmtDur(up) : (S.up ? 'uptime n/a' : '—'));
  $('updated').textContent = S.updatedAgo == null ? '' : ('updated ' + S.updatedAgo + 's ago');
  const n = Object.keys(S.base).length;
  document.title = (n ? `(${n}) ` : '') + 'Dragon Realms — Admin';
}

function statCard(v, label, sub) {
  return `<div class="stat"><b>${esc(v)}</b><span>${esc(label)}</span>${sub ? `<em>${sub}</em>` : ''}</div>`;
}

function renderVitals() {
  const el = $('vitals');
  if (!S.up && !S.summary) {
    el.innerHTML = '<div class="note bad">server unreachable — start it with <code>npm start</code> or <code>systemctl start dragonrealms</code></div>';
    $('census').textContent = '';
    return;
  }
  const sum = S.summary;
  const online = Object.keys(S.base).length;
  const bots = Object.values(S.base).filter((p) => p.bot).length;
  const humans = online - bots;
  const fighting = (sum?.online || []).filter((p) => p.inCombat).length;

  let upSub = '';
  if (S.status?.uptimeMs != null) upSub = 'since boot ' + new Date(Date.now() - S.status.uptimeMs).toLocaleTimeString();

  el.innerHTML = [
    statCard(fmtDur(S.status?.uptimeMs != null ? S.status.uptimeMs + (Date.now() - S.statusAt) : NaN).replace(/^NaN.*$/, '—'), 'uptime', upSub),
    statCard(online, 'players online', `${humans} adventurer${humans === 1 ? '' : 's'} · ${bots} bot${bots === 1 ? '' : 's'}`),
    statCard(fighting, 'in combat', fighting ? '\u2694 engagements active' : 'peaceful'),
    statCard(sum ? sum.accounts : '—', 'accounts', sum ? sum.characters + ' characters' : ''),
    statCard(sum ? sum.rooms : (S.status?.rooms ?? '—'), 'rooms', sum ? sum.zones + ' zones' : ''),
    statCard(sum ? sum.npcs : '—', 'npc definitions'),
    statCard(sum ? sum.creatures : '—', 'creature species'),
    statCard(sum ? sum.items : '—', 'item definitions'),
  ].join('');

  $('vitalsrc').textContent = sum ? 'via /api/gm/summary' : (S.gm === 'ok' ? '' : 'public health only');

  $('census').innerHTML = sum
    ? ['guilds', 'races', 'skills', 'khri'].map((k) => `<b>${sum[k]}</b> ${k}`).join(' · ')
    : '';
}

const GM_NOTES = {
  off: 'GM panels need the dedicated <code>DR_GM_TOKEN</code> — paste it above.',
  pending: 'checking GM access…',
  locked: '<span class="bad">GM token rejected (401/403).</span> It must exactly match the server\u2019s <code>DR_GM_TOKEN</code>; ordinary game sessions are never sufficient.',
  notconf: '<span class="bad">GM API not configured on this server.</span> Set <code>DR_ENABLE_API=1</code> and <code>DR_GM_TOKEN</code>.',
  err: '<span class="bad">GM endpoints unreachable.</span>',
};

function renderLoad() {
  const noteEl = $('loadnote');
  const grid = $('loadgrid');
  if (S.gm !== 'ok' || !S.status?.proc) {
    noteEl.hidden = false;
    noteEl.innerHTML = GM_NOTES[S.gm] || GM_NOTES.pending;
    grid.hidden = true;
    return;
  }
  noteEl.hidden = true;
  grid.hidden = false;

  const p = S.status.proc;
  const pct = S.cpuPct;
  $('cpuval').textContent = pct == null ? 'measuring…' : pct.toFixed(1) + '%';
  const cb = $('cpubar');
  cb.style.width = Math.min(100, pct || 0) + '%';
  cb.className = pct != null && pct > 80 ? 'hot' : '';

  const rss = p.rssBytes, heap = p.heapUsedBytes;
  $('memval').textContent = fmtBytes(rss) + ' RSS';
  $('heaplbl').textContent = `heap ${fmtBytes(heap)} of ${fmtBytes(rss)} RSS`;
  $('rssbar').style.width = Math.min(100, rss / (512 * 1048576) * 100) + '%';
  $('heapbar').style.width = Math.min(100, heap / Math.max(1, rss) * 100) + '%';

  $('procinfo').innerHTML = [
    `node ${esc(p.node)}`, esc(p.platform), `pid ${esc(p.pid)}`,
    `db ${fmtBytes(S.status.dbBytes)}`,
    S.lat.length ? `last api call ${S.lat[S.lat.length - 1]} ms` : '',
  ].filter(Boolean).join(' · ');

  drawSpark($('latcv'), S.lat, cssVar('--cyan', '#6acfd0'));
  drawSpark($('popcv'), S.pops, cssVar('--amber', '#dfb64f'));
}

function drawSpark(cv, data, color) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || cv.parentElement.clientWidth || 300;
  const h = cv.clientHeight || 56;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = cssVar('--line', '#292d23');
  ctx.beginPath();
  ctx.moveTo(0, h - 1); ctx.lineTo(w, h - 1);
  ctx.stroke();
  if (!data.length) return;
  const max = Math.max(...data), min = Math.min(...data);
  const span = (max - min) || 1;
  const X = (i) => (data.length === 1 ? w : (i / (data.length - 1)) * (w - 2) + 1);
  const Y = (v) => h - 3 - ((v - min) / span) * (h - 10);
  ctx.beginPath();
  data.forEach((v, i) => { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineTo(X(data.length - 1), h - 1);
  ctx.lineTo(X(0), h - 1);
  ctx.closePath();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function hpBarHtml(p) {
  if (typeof p.hp !== 'number') return '';
  const max = typeof p.maxHp === 'number' && p.maxHp > 0 ? p.maxHp : null;
  if (!max) return `<span class="badge" title="HP">HP ${esc(p.hp)}</span>`;
  const f = Math.max(0, Math.min(1, p.hp / max));
  const col = f > 0.6 ? 'var(--green)' : f > 0.3 ? 'var(--amber)' : 'var(--red)';
  return `<span class="hpbar" title="${esc(p.hp)}/${esc(max)} HP"><i style="width:${Math.round(f * 100)}%;background:${col}"></i></span>`;
}

function rosterList() {
  const out = [];
  if (S.gm === 'ok' && S.summary) {
    for (const o of S.summary.online) out.push({ ...o, bot: Boolean(S.base[o.name]?.bot), gmToon: Boolean(S.base[o.name]?.gmToon) });
  } else {
    for (const p of Object.values(S.base)) {
      out.push({ name: p.name, guild: p.guild, circle: p.circle, bot: p.bot, gmToon: p.gmToon });
    }
  }
  out.sort((a, b) => (a.bot - b.bot) || String(a.name).localeCompare(String(b.name)));
  return out;
}

function renderRoster() {
  const el = $('roster');
  const list = rosterList();
  const bots = list.filter((p) => p.bot).length;
  $('rostersum').textContent = list.length
    ? `${list.length} connected · ${bots} bot${bots === 1 ? '' : 's'}`
    : '';
  if (!list.length) {
    el.innerHTML = '<div class="note">' + (S.up ? 'nobody connected' : GM_NOTES.err) + '</div>';
    return;
  }
  el.innerHTML = list.map((p) => `
    <div class="row">
      <span class="nm">${esc(p.name)}${p.gmToon ? ' <span class="badge gm">GM</span>' : p.bot ? ' <span class="badge bot">BOT</span>' : ''}</span>
      <span class="cl">${esc(p.race ? p.race + ' · ' : '')}${esc(p.guild || '?')} · circle ${esc(p.circle)}${p.room != null ? ` · room ${esc(p.room)}` : ''}</span>
      ${hpBarHtml(p)}
      ${p.scripting ? '<span class="badge bot" title="running starter circling script">\\u25B6 SCRIPT</span>' : ''}
      ${p.inCombat ? '<span class="badge fight">\u2694 FIGHT</span>' : ''}
      <button class="watch" data-name="${esc(p.name)}" data-charid="${esc(p.charId || '')}" title="watch their live interface here">\u{1F441} Watch</button>
      <button class="watch tab" data-name="${esc(p.name)}" title="open the full client in a new tab">\u2197</button>
    </div>`).join('');
  el.querySelectorAll('.watch:not(.tab)').forEach((b) => b.addEventListener('click', () => openPlayerView(b.dataset.name, b.dataset.charId)));
  el.querySelectorAll('.watch.tab').forEach((b) => b.addEventListener('click', () => {
    window.open('/?spectate=' + encodeURIComponent(b.dataset.name), '_blank');
  }));
}

/* ================= zones ================= */

function zoneStats(z) {
  let npcs = 0, spawns = 0;
  for (const r of z.rooms) { npcs += (r.npcs || []).length; spawns += (r.spawns || []).length; }
  return { npcs, spawns };
}

function renderZones() {
  const el = $('zones');
  if (!S.world) {
    if (el.children.length) el.innerHTML = '';
    $('worldnote').innerHTML = S.gm === 'ok'
      ? 'loading world…'
      : (GM_NOTES[S.gm] || 'needs GM token — shows static NPC/spawn placement per zone; expanding queries live rooms');
    return;
  }
  $('worldnote').innerHTML = 'click a zone to query its rooms live (<code>/api/gm/room/&lt;id&gt;</code>)';
  el.innerHTML = S.world.zones.map((z) => {
    const s = zoneStats(z);
    const open = S.expanded.has(z.id);
    return `
    <div class="zone${open ? ' open' : ''}" data-z="${esc(z.id)}">
      <div class="zhead">
        <span class="tw">\u25B8</span>
        <span class="zname">${esc(z.name)}</span>
        <span class="znum"><b>${z.rooms.length}</b> rooms</span>
        <span class="znum"><b>${s.npcs}</b> NPCs</span>
        <span class="znum"><b>${s.spawns}</b> spawn slots</span>
      </div>
      <div class="zdet" id="zdet-${esc(z.id)}">${open ? zoneDetailHtml(z) : ''}</div>
    </div>`;
  }).join('');
  el.querySelectorAll('.zhead').forEach((h) => h.addEventListener('click', () => toggleZone(h.parentElement)));
  $('worldref').onclick = () => { S.world = null; S.zoneLive = {}; loadWorld(); };
}

function zoneDetailHtml(z) {
  const liveMap = S.zoneLive[z.id];
  if (!liveMap) return '<div class="note">querying rooms…</div>';
  const lines = [];
  let quiet = 0;
  for (const r of z.rooms) {
    const live = liveMap.get(r.id);
    const bits = [];
    if ((r.npcs || []).length) bits.push(`<span class="tag">\u{1F464} ${r.npcs.map((id) => esc(S.npcNames[id] || id)).join(', ')}</span>`);
    if ((r.spawns || []).length) bits.push(`<span class="mob">\u{1F43A} spawns: ${r.spawns.map(esc).join(', ')}</span>`);
    if (live) {
      const alive = live.creatures.filter((c) => c.hp > 0);
      if (alive.length) bits.push(`<span class="mob">\u2694 ${alive.length} alive: ${alive.map((c) => esc(c.name)).join(', ')}</span>`);
      if (live.players.length) bits.push(`<span class="who">\u{1F3AE} ${live.players.map(esc).join(', ')}</span>`);
      if (live.floor.length) bits.push(`<span class="empty">\u{1F4E6} floor: ${live.floor.map(esc).join(', ')}</span>`);
    }
    if (!bits.length) { quiet += 1; continue; }
    bits.unshift(`<span class="rid" title="${esc(r.address || '')}">#${esc(r.id)} ${esc(r.name)}${r.tavern ? ' \u{1F37A}' : ''}</span>`);
    lines.push(`<div class="rline">${bits.join(' ')}</div>`);
  }
  return (lines.join('\n') || '<div class="note">all rooms quiet</div>')
    + (quiet ? `\n<div class="note" style="margin-top:6px">+ ${quiet} unremarkable room${quiet === 1 ? '' : 's'}</div>` : '');
}

async function toggleZone(zEl) {
  const zid = zEl.dataset.z;
  if (S.expanded.has(zid)) {
    S.expanded.delete(zid);
  } else {
    S.expanded.add(zid);
    if (!S.zoneLive[zid]) {
      const z = S.world.zones.find((x) => x.id === zid);
      const results = await Promise.all(z.rooms.map((r) => gm('room/' + encodeURIComponent(r.id))));
      const map = new Map();
      results.forEach((res, i) => map.set(z.rooms[i].id, res.ok && res.d ? res.d : { creatures: [], players: [], floor: [] }));
      S.zoneLive[zid] = map;
    }
  }
  renderZones();
}
