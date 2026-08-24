// Dashboard wiring: form listeners, GM quick-play buttons, the embedded
// player view, and boot. Imported last — everything is already defined.
import { $, esc, S, cssVar, fmtDur, toast, gm } from './core.js';
import { tick, renderAll, renderHeader } from './render.js';
import { pollJob, listJobs } from './jobs.js';
import { launchAgent, stopAgent, agents, initAgentForm, AG_RACES, AG_GUILDS, cap } from './agents.js';

initAgentForm();

// "Rerun" handoff from /sims.html: prefill the launch form with a past
// run's params (sessionStorage dr_rerun, set by the Sims runs table).
try {
  const rerun = JSON.parse(sessionStorage.getItem('dr_rerun') || 'null');
  if (rerun?.name) {
    $('ag-name').value = rerun.name;
    if (rerun.race) $('ag-race').value = rerun.race;
    // Guild option values are lowercase ids ("warrior mage"); match loosely.
    const g = String(rerun.guild || '').toLowerCase();
    for (const opt of $('ag-guild').options) {
      if (opt.value === g || g.includes(opt.value)) { $('ag-guild').value = opt.value; break; }
    }
    toast(`Prefilled launch form from run "${rerun.name}" — adjust minutes/circle, then Launch.`);
  }
  sessionStorage.removeItem('dr_rerun');
} catch {}

$('ag-launch').addEventListener('click', () => {
  let name = $('ag-name').value.trim();
  if (!/^[A-Za-z]{2,20}$/.test(name)) {
    // Auto-trim overlong composite names (Sw<Guild><Race> can exceed 20)
    // rather than bouncing the launch — surface what we did.
    const trimmed = name.replace(/[^A-Za-z]/g, '').slice(0, 20);
    if (trimmed.length >= 2) {
      toast(`Name too long (server max 20) — launching as "${trimmed}".`);
      name = trimmed;
      $('ag-name').value = trimmed;
    } else {
      toast('Agent name must be 2-20 letters.');
      return;
    }
  }
  if (agents.some((a) => a.char === name && a.ws)) { toast(`${name} is already running.`); return; }
  launchAgent({
    name,
    race: $('ag-race').value,
    guild: $('ag-guild').value,
    minutes: Math.max(1, Number($('ag-minutes').value) || 10),
    circleTarget: Math.max(2, Number($('ag-circle').value) || 2),
    boost: Number($('ag-boost').value) || 0,
  });
});
$('ag-stop').addEventListener('click', () => {
  const live = agents.filter((a) => a.ws);
  if (!live.length) { toast('No running agents.'); return; }
  for (const a of live) stopAgent(a, 'stopped by GM');
});

/* ---- GM quick-play: one click into a boosted character ---- */
for (const r of AG_RACES) $('qp-race').insertAdjacentHTML('beforeend', `<option value="${r}">${cap(r)}</option>`);
for (const g of AG_GUILDS) {
  $('qp-guilds').insertAdjacentHTML('beforeend',
    `<button class="watch" data-guild="${g}" title="quick-play a boosted ${cap(g)}">${cap(g)}</button>`);
}
$('qp-guilds').querySelectorAll('[data-guild]').forEach((b) => b.addEventListener('click', () => {
  if (!S.token) { toast('GM quick-play needs DR_GM_TOKEN first.'); tokenEl.focus(); return; }
  const race = $('qp-race').value;
  const boost = Math.max(0, Number($('qp-boost').value) || 0);
  const url = `/?play=${encodeURIComponent(b.dataset.guild)},${race}` +
    (boost > 1 ? `&boost=${boost}` : '') + '#gm=' + encodeURIComponent(S.token);
  window.open(url, '_blank');
}));

/* ================= wiring ================= */

function startMaster() {
  clearInterval(S.timers.master);
  S.timers.master = setInterval(tick, S.every);
}

$('every').value = String(S.every);
$('every').addEventListener('change', () => {
  S.every = Number($('every').value);
  localStorage.setItem('dr_admin_every', String(S.every));
  startMaster();
});

$('pause').addEventListener('click', () => {
  S.paused = !S.paused;
  $('pause').innerHTML = S.paused ? '&#9654; resume' : '&#9208; pause';
  if (!S.paused) { tick(true); pollJob(); }
});

$('refresh').addEventListener('click', () => { tick(true); });

const tokenEl = $('gm-token');
tokenEl.value = S.token;
tokenEl.addEventListener('change', () => {
  S.token = tokenEl.value.trim();
  localStorage.setItem('dr_gm_token', S.token);
  S.gm = 'pending';
  S.cpu = null; S.cpuPct = null;
  S.world = null; S.zoneLive = {}; S.expanded.clear();
  renderAll();
  tick(true);
});

$('reload').addEventListener('click', async () => {
  if (!confirm('Respawn all room creature spawners?\nEvery online player is persisted first.')) return;
  const r = await gm('admin/reload');
  toast(r.ok ? `World reloaded — ${r.d?.reloaded ?? '?'} rooms respawned.` : `Reload failed (HTTP ${r.code}).`);
  tick(true);
});

/* ---- player view: embed the full client in watch mode ---- */

let pvName = null;
let pvOfflineNotified = false;

function openPlayerView(name, charId) {
  if (!S.token) {
    toast('Live watch is GM-only \u2014 enter DR_GM_TOKEN first.');
    tokenEl.focus();
    return;
  }
  localStorage.setItem('dr_gm_token', S.token); // the embedded client reads the same key
  pvName = name;
  pvOfflineNotified = false;
  $('pv-name').textContent = name;
  // Hand the token through the fragment too: the embedded client may load
  // before the storage write lands, and a fresh tab has no shared state.
  // The spectate target prefers the stable charId when the server knows it.
  const target = charId || name;
  const url = '/?spectate=' + encodeURIComponent(target) + '#gm=' + encodeURIComponent(S.token);
  $('pv-newtab').href = '/?spectate=' + encodeURIComponent(target);
  $('pv-frame').src = url;
  $('pv').hidden = false;
  renderPv();
}

function closePlayerView() {
  $('pv').hidden = true;
  $('pv-frame').src = 'about:blank'; // drops the spectator websocket
  pvName = null;
}

// Live summary line for the watched player, refreshed by the normal poll.
function renderPv() {
  const el = $('pv-vitals');
  if ($('pv').hidden || !pvName) return;
  const p = rosterList().find((x) => x.name === pvName);
  if (!p) {
    el.innerHTML = '<span class="badge fight">OFFLINE</span>';
    if (S.up && !pvOfflineNotified) {
      pvOfflineNotified = true;
      toast(`${pvName} is no longer online.`);
    }
    return;
  }
  el.innerHTML =
    `${esc(p.race ? p.race + ' \u00b7 ' : '')}${esc(p.guild || '?')} · circle ${esc(p.circle)}` +
    `${p.room != null ? ` · room ${esc(p.room)}` : ''} ` +
    hpBarHtml(p) +
    (p.inCombat ? ' <span class="badge fight">\u2694 FIGHT</span>' : '');
}

$('pv-close').addEventListener('click', closePlayerView);
// Keydowns inside the iframe never reach this document, so Escape here
// only ever fires while focus is on the admin chrome.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('pv').hidden) closePlayerView();
});

setInterval(() => {
  S.updatedAgo = S.statusAt ? Math.round((Date.now() - S.statusAt) / 1000) : null;
  renderHeader();
  renderPv();
}, 1000);

// Browsers throttle background-tab timers heavily; when the tab regains
// focus, poll immediately instead of waiting out the interval so a stale
// OFFLINE pill can't linger after the world comes back.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick(true);
});

startMaster();
setInterval(pollJob, 2000);
tick(true);
