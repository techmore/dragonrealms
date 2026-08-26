// Dashboard wiring: GM quick-play buttons, the embedded player view, and
// boot. Sim launch lives on /sims.html now; the dashboard only shows a
// read-only "Sim players" roster block fed by render.js.
import { $, esc, S, cssVar, fmtDur, toast, gm } from './core.js';
import { tick, renderAll, renderHeader } from './render.js';
import { AG_RACES, AG_GUILDS, cap } from './agents.js';
// Player view (Watch overlay) lives in playerview.js, self-refreshing;
// render.js imports openPlayerView from there for the roster Watch buttons.

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
  if (!S.paused) tick(true);
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

/* ---- scripts tab ---- */
async function loadScripts() {
  const r = await gm('scripts');
  if (!r.ok || !r.d?.variants) {
    $('scriptsList').innerHTML = '<span class="note">no script data yet — run a benchmark first</span>';
    $('scriptsSum').textContent = '';
    return;
  }
  const { variants, scriptsDir, libDir } = r.d;
  $('scriptsSum').textContent = `${variants.length} variants`;
  if (!variants.length) {
    $('scriptsList').innerHTML = '<span class="note">no benchmark data — run --benchmark &lt;guild&gt; first</span>';
    return;
  }
  $('scriptsList').innerHTML = variants.map((v, i) => {
    const rank = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn';
    return `<div class="script-row">
      <div class="script-rank ${rank}">${i + 1}</div>
      <div class="nm">${esc(v.name)}</div>
      <div class="metric">runs <b>${v.runs}</b></div>
      <div class="metric">avg kills <b>${v.avgKills}</b></div>
      <div class="metric">avg ranks <b>${v.avgRanks ?? '—'}</b></div>
      <div class="metric">healthy <b>${v.healthyPct}%</b></div>
      <div class="spacer"></div>
      <button class="open-btn" data-variant="${esc(v.name)}" title="open scripts/lib/script-gen.mjs">view script</button>
    </div>`;
  }).join('');

  $('scriptsList').querySelectorAll('.open-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Open the script-gen file in a new tab — the variant logic lives there
      window.open('/admin.html#scriptsSection', '_blank');
    });
  });

  $('openScriptsFolder').addEventListener('click', () => {
    // Tell the server to open the scripts folder in Finder
    fetch('/api/gm/scripts?open=1').catch(() => {});
    toast('Opening scripts/ in Finder…');
  });
}

/* ---- player view lives in playerview.js ---- */

setInterval(() => {
  S.updatedAgo = S.statusAt ? Math.round((Date.now() - S.statusAt) / 1000) : null;
  renderHeader();
}, 1000);

// Browsers throttle background-tab timers heavily; when the tab regains
// focus, poll immediately instead of waiting out the interval so a stale
// OFFLINE pill can't linger after the world comes back.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick(true);
});

startMaster();
tick(true);
loadScripts();
