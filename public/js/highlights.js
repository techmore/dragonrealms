// DR highlight engine: pattern rules that color-code incoming game text
// (the webclient/Genie "color your world" feature). Rules match substrings
// and inject ANSI colors the terminal already renders.
// Storage is per-browser (localStorage), like DR client highlight files.

const LS = 'dr_highlights_v1';
const COLORS = {
  red: 31, green: 32, amber: 33, magenta: 35, cyan: 36, dim: 90, white: 37,
};

export const DEFAULT_HIGHLIGHTS = [
  { id: 'gems', pattern: 'emerald|sapphire|diamond|garnet', color: 'amber', bold: true },
  { id: 'wait', pattern: 'You must wait', color: 'red', bold: true },
  { id: 'paths', pattern: 'Obvious paths|Obvious exits', color: 'dim', bold: false },
  { id: 'fell', pattern: 'You fell |You are overcome|are defeated', color: 'red', bold: true },
  { id: 'mindlock', pattern: 'mind lock|nearly locked', color: 'amber', bold: true },
  { id: 'tdp', pattern: 'TDPs|gain \\d+ TDPs', color: 'green', bold: true },
];

function load() {
  try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(LS, JSON.stringify(list)); } catch {}
}
function seed() {
  let list = load();
  if (!list.length) { list = DEFAULT_HIGHLIGHTS.map((h) => ({ ...h })); save(list); }
  return list;
}

let highlights = seed();

export function getHighlights() { return highlights; }

export function addHighlight(pattern, color, bold) {
  const h = { id: 'h' + Date.now(), pattern: String(pattern || '').trim(), color: color || 'green', bold: Boolean(bold) };
  if (!h.pattern) return;
  highlights.push(h);
  save(highlights);
}

export function removeHighlight(id) {
  highlights = highlights.filter((h) => h.id !== id);
  save(highlights);
}

// Inject ANSI color codes around matched substrings. Patterns are plain-text
// regexes; codes use the client's existing ANSI color set.
export function applyHighlights(text) {
  let out = String(text);
  for (const h of highlights) {
    if (!h.pattern) continue;
    let re;
    try { re = new RegExp(h.pattern, 'gi'); } catch { continue; }
    const code = COLORS[h.color] || 33;
    out = out.replace(re, (m) => `\x1b[${code}m${h.bold ? '\x1b[1m' : ''}${m}\x1b[0m`);
  }
  return out;
}

// First highlight rule the text matches (for the optional audio alert).
export function highlightHit(text) {
  const t = String(text);
  for (const h of highlights) {
    if (!h.pattern) continue;
    let re;
    try { re = new RegExp(h.pattern, 'i'); } catch { continue; }
    if (re.test(t)) return h;
  }
  return null;
}

// Optional audio alert: a tiny WebAudio blip, no assets and no dependencies.
// The AudioContext is created lazily on first play (after user interaction,
// satisfying browser autoplay policies). `window.__alertBeeps` is an honest
// test hook counting plays.
let audioCtx = null;
export function playAlertBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
    window.__alertBeeps = (window.__alertBeeps || 0) + 1;
  } catch {}
}

export function renderHighlightPanel() {
  const wrap = document.getElementById('highlight-rules');
  if (!wrap) return;
  wrap.innerHTML = highlights.map((h) =>
    `<div class="script-name-row"><span class="script-kind">HL</span><span class="script-text" style="color:var(--${h.color || 'text'})">${h.pattern}</span><button data-del-hl="${h.id}">\u2715</button></div>`
  ).join('') || '<div class="fe-empty">No highlight rules.</div>';
  wrap.querySelectorAll('[data-del-hl]').forEach((b) => {
    b.addEventListener('click', () => { removeHighlight(b.dataset.delHl); renderHighlightPanel(); });
  });
}

export function bindHighlightPanel() {
  renderHighlightPanel();
  const btn = document.getElementById('hl-add');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const p = document.getElementById('hl-pattern');
    const c = document.getElementById('hl-color');
    const bold = document.getElementById('hl-bold');
    if (!p || !p.value.trim()) return;
    addHighlight(p.value, c ? c.value : 'green', bold ? bold.checked : false);
    p.value = '';
    renderHighlightPanel();
  });
}
