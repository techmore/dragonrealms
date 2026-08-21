// DR gag engine: pattern rules that DROP matching lines from the story
// stream at render time — the inverse of highlights (a Genie/Lich staple).
// Like channels and highlights, gags are render-time only: triggers and
// scripts are fed from the message router before this point, so automation
// still sees gagged lines. Storage is per-browser (localStorage).
const LS = 'dr_gags_v1';

function load() {
  try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(LS, JSON.stringify(list)); } catch {}
}

let gags = load();

export function getGags() { return gags; }

export function addGag(pattern) {
  const p = String(pattern || '').trim();
  if (!p) return;
  gags.push({ id: 'g' + Date.now(), pattern: p });
  save(gags);
}

export function removeGag(id) {
  gags = gags.filter((g) => g.id !== id);
  save(gags);
}

// True when the line matches any gag rule (invalid patterns never match).
export function isGagged(text) {
  const t = String(text);
  for (const g of gags) {
    if (!g.pattern) continue;
    let re;
    try { re = new RegExp(g.pattern, 'i'); } catch { continue; }
    if (re.test(t)) return true;
  }
  return false;
}

export function renderGagPanel() {
  const wrap = document.getElementById('gag-rules');
  if (!wrap) return;
  wrap.innerHTML = gags.map((g) =>
    `<div class="script-name-row"><span class="script-kind">GAG</span><span class="script-text">${g.pattern}</span><button data-del-gag="${g.id}">\u2715</button></div>`
  ).join('') || '<div class="fe-empty">No gag rules.</div>';
  wrap.querySelectorAll('[data-del-gag]').forEach((b) => {
    b.addEventListener('click', () => { removeGag(b.dataset.delGag); renderGagPanel(); });
  });
}

export function bindGagPanel() {
  renderGagPanel();
  const btn = document.getElementById('gag-add');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const p = document.getElementById('gag-pattern');
    if (!p || !p.value.trim()) return;
    addGag(p.value);
    p.value = '';
    renderGagPanel();
  });
}
