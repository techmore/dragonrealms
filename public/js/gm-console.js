// Game Master console: read-only inspection of the world, the DB, live
// players, and (via the existing WS spectate relay) a live read-only stream
// of any individual player. Mutating changes belong to /api/debug; this page
// only ever queries.
import { $ } from './util.js';

const API = '/api/gm';

async function api(path) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' } });
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
    <button class="gm-pip" data-name="${p.name}">
      ${p.name} <span class="gm-dim">(${p.guild}·${p.circle}) ${p.room}${p.inCombat ? ' ⚔' : ''}</span>
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
      <div class="gm-zone-name">${z.name} <span class="gm-dim">(${z.rooms.length})</span></div>
      <div class="gm-rooms">${z.rooms.map((r) => `
        <button class="gm-room" data-id="${r.id}">${r.name}</button>
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
    <div class="gm-t">[[${r.room.name}, ${r.zone.name}]]</div>
    <div class="gm-desc">${r.room.desc}</div>
    <div class="gm-meta">exits: ${Object.keys(r.room.exits || {}).join(', ') || 'none'}</div>
    <div class="gm-meta">creatures: ${r.creatures.length ? r.creatures.map((c) => `${c.name} (${c.hp}/${c.maxHp})`).join(', ') : 'none'}</div>
    <div class="gm-meta">players: ${r.players.length ? r.players.join(', ') : 'none'}</div>
    <div class="gm-meta">ground: ${r.floor.length ? r.floor.join(', ') : 'none'}</div>
  `;
}

async function loadCharacters() {
  const el = $('gm-chars');
  const c = await api('/characters');
  if (!c.ok || !el) return;
  el.innerHTML = c.characters.map((ch) => `
    <button class="gm-ch" data-name="${ch.name}">${ch.name}</button>
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
    <div class="gm-t">${pl.name} <span class="gm-dim">(${pl.race} ${pl.guild}, circle ${pl.circle}${p.offline ? ' — OFFLINE' : ''})</span></div>
    <div class="gm-meta">hp ${pl.hp}/${pl.maxHp} · mana ${pl.mana||0}/${pl.maxMana||0} · stamina ${pl.stamina||0}/${pl.maxStamina||0}</div>
    <div class="gm-meta">silver ${pl.silver} · bank ${pl.bank} · tdp ${pl.tdp} (pool ${pl.tdpPool})</div>
    <div class="gm-meta">room: ${pl.room} · stance ${pl.stance} · hidden ${!!pl.hidden} · resting ${!!pl.resting}</div>
    <div class="gm-meta">abilities: ${(pl.abilities||[]).join(', ')||'none'} ${pl.combat ? '· ⚔ in combat' : ''}</div>
    <div class="gm-meta">weapon: ${(p.equipment.hand||'fists')}</div>
    <div class="gm-skills">${skills || 'no skills'}</div>
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
  out.innerHTML = `<div class="gm-dim">— live stream: ${name} —</div>`;
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws');
  ws.onopen = () => ws.send(JSON.stringify({ t: 'spectate', name }));
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'command') { appendStream(`> ${m.line}`, 'gm-cmd'); return; }
    if (['room','msg','combat','notice','error','hands','targets'].includes(m.t)) {
      const txt = m.msg || (m.t === 'hands' ? `hand: ${m.hand || 'empty'}, worn: ${(m.worn||[]).join(',') || 'none'}` : m.t);
      appendStream(txt, 'gm-' + m.t);
    }
  };
  ws.onclose = () => appendStream('— stream closed —', 'gm-dim');
}

function appendStream(text, cls) {
  const out = $('gm-player-stream');
  const div = document.createElement('div');
  div.className = 'gm-line ' + (cls || '');
  div.textContent = text;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}

$('gm-refresh')?.addEventListener('click', () => { loadSummary(); loadWorld(); loadCharacters(); if (selectedPlayer) loadPlayerView(); });

loadSummary();
loadWorld();
loadCharacters();
