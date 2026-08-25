// Admin console shared core: DOM/format helpers, the mutable S state
// object, the gm() fetch wrapper, and toasts. Every admin module imports
// from here — S is intentionally shared mutable state (single dashboard).
'use strict';

'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const trim = (a, n) => { while (a.length > n) a.shift(); };

const S = {
  paused: false,
  every: Number(localStorage.getItem('dr_admin_every')) || 5000,
  token: (() => {
    // Trusted-launcher handoff: #gm=<token> from the menu-bar app is
    // stored once and stripped so it never lingers in the address bar.
    // Regex must match gm-token.js (includes % for URL-encoded tokens).
    try {
      const m = location.hash.match(/^#gm=([A-Za-z0-9_%-]+)$/);
      if (m) {
        localStorage.setItem('dr_gm_token', decodeURIComponent(m[1]));
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch {}
    return localStorage.getItem('dr_gm_token') || '';
  })(),
  up: null,               // last /api/health result
  gm: 'pending',          // pending|off|locked|notconf|err|ok
  status: null, statusAt: 0,
  summary: null,
  base: {},               // name -> health entry (bot flag source)
  lat: [], pops: [],      // sparkline histories
  cpu: null, cpuPct: null,
  world: null, npcNames: {},
  expanded: new Set(), zoneLive: {},
  job: null, jobs: [], jobLen: -1,
  timers: {},
};

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function fmtDur(ms) {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5),
    m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
function fmtBytes(n) {
  if (n == null) return '—';
  if (n > 1048576 * 1024) return (n / 1073741824).toFixed(2) + ' GiB';
  if (n > 1024) return (n / 1048576).toFixed(1) + ' MiB';
  return n + ' B';
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}
// Sims-page agent panels (js/admin/agents.js) may ask this page to surface
// a message (e.g. "live watch needs DR_GM_TOKEN") instead of opening a tab.
window.addEventListener('message', (e) => {
  if (e.data && e.data.t === 'gm-toast' && e.data.text) toast(String(e.data.text));
});

async function gm(path) {
  const headers = S.token ? { Authorization: 'Bearer ' + S.token } : {};
  try {
    const r = await fetch('/api/gm/' + path, { cache: 'no-store', headers });
    let d = null;
    try { d = await r.json(); } catch {}
    return { code: r.status, ok: !!r.ok && d?.ok !== false, d };
  } catch { return { code: 0, ok: false, d: null }; }
}

export { $, esc, trim, S, cssVar, fmtDur, fmtBytes, toast, gm };

