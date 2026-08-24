// DR-style window manager: each dock/rail pane is an independent, collapsible,
// showable/hideable "window" (modeled on the DR webclient / Genie window
// surface). Visibility + collapse persist per-browser so a player's layout
// survives reloads.
import { $ } from './util.js';

const LS = 'dr_windows_v1';

// Which dock/rail panes are controllable "windows", and where they live.
export const WINDOWS = [
  { id: 'status-strip', label: 'Vitals',  rail: true, empty: false },
  { id: 'hands-bar',    label: 'Hands',   rail: true, empty: true },
  { id: 'fe-tracker',   label: 'Exp / Thoughts', rail: true, empty: true },
  { id: 'buffs',        label: 'Buffs',   rail: true, empty: true },
  { id: 'room-panel',   label: 'Room',    rail: false, empty: true },
  { id: 'target-widget',label: 'Combat / Targets', rail: false, empty: true },
  { id: 'chat-widget',  label: 'Conversations', rail: false, empty: true },
  { id: 'quest-widget', label: 'Journal (quest)', rail: false, empty: true },
];

// The outer (collapsible) element id differs from the window id: the window
// id is the dwin-body; the outer section is <id>-container or <id>-sec.
const outerOf = (id) =>
  $(id + '-container') || $(id + '-sec') || document.querySelector(`[data-window="${id}"]`);

// Which panes are currently actually showing content (so an empty Hands or
// Combat window can hide itself until there's data).
const contentsSeen = {};
export function markWindowSeen(id) { contentsSeen[id] = true; }

// Called when a pane receives real data: remember it and re-apply visibility.
export function revealWindow(id) {
  markWindowSeen(id);
  applyWindow(id);
}

// Forget a pane's data (e.g. a room clears on login) so it hides if empty.
export function clearWindowSeen(id) {
  delete contentsSeen[id];
  applyWindow(id);
}

function load() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; }
}
function save(s) {
  try { localStorage.setItem(LS, JSON.stringify(s)); } catch {}
}

const state = Object.assign({ hidden: {}, collapsed: {} }, load());

export function windowState() { return state; }
export function isWindowVisible(id) { return !state.hidden[id]; }
export function isWindowCollapsed(id) { return Boolean(state.collapsed[id]); }
function persist() { save(state); }

// Apply show/hide + collapse to one pane based on saved state.
export function applyWindow(id) {
  const entry = WINDOWS.find((w) => w.id === id);
  if (!entry) return;
  const outer = outerOf(id);
  if (!outer) return;

  const visible = isWindowVisible(id) || Boolean(state.force && state.force[id]);
  // An empty window (no data yet) collapses/hides itself unless force-shown.
  const emptyNow = entry.empty && !contentsSeen[id] && !(state.force && state.force[id]);
  if (!visible || emptyNow) outer.setAttribute('data-whidden', '1');
  else outer.removeAttribute('data-whidden');

  const collapsed = isWindowCollapsed(id);
  outer.classList.toggle('collapsed', collapsed);
  const collapseButton = outer.querySelector(`[data-collapse="${id}"]`);
  if (collapseButton) {
    collapseButton.setAttribute('aria-controls', id);
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    collapseButton.innerHTML = collapsed ? '&#9654;' : '&#9660;';
  }
  refreshDockVisibility();
}

export function refreshDockVisibility() {
  if (!window.__panelReady) return;
  import('./panels.js').then((p) => p.syncDock());
}

// Toggle visibility from the Windows menu. `force` lets a player reveal an
// empty window (e.g. Hands before gearing) on purpose.
export function setWindowVisible(id, visible, fromMenu = false) {
  state.force = state.force || {};
  if (visible && fromMenu) state.force[id] = true;
  else if (!visible) { delete state.hidden[id]; state.hidden[id] = true; }
  else delete state.hidden[id];
  persist();
  applyWindow(id);
}

export function toggleCollapse(id) {
  state.collapsed[id] = !isWindowCollapsed(id);
  persist();
  applyWindow(id);
}

// ---- Windows menu ----
export function renderWindowsMenu() {
  const menu = $('windows-menu');
  if (!menu) return;
  menu.innerHTML = WINDOWS.map((w) => {
    const on = isWindowVisible(w.id) || Boolean(w.rail && (state.force && state.force[w.id]));
    const col = isWindowCollapsed(w.id);
    return `<label class="wmenu-row" data-w="${w.id}">
      <input type="checkbox" class="wmenu-vis" ${on ? 'checked' : ''}> ${w.label}
      <button class="wmenu-col" data-col="${w.id}" title="Collapse/expand">${col ? '&#9656;' : '&#9662;'}</button>
    </label>`;
  }).join('');
  menu.querySelectorAll('.wmenu-vis').forEach((cb) => {
    cb.addEventListener('change', () => {
      const row = cb.closest('.wmenu-row');
      setWindowVisible(row.dataset.w, cb.checked, true);
      renderWindowsMenu();
    });
  });
  menu.querySelectorAll('.wmenu-col').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleCollapse(btn.dataset.col);
      renderWindowsMenu();
    });
  });
}

export function bindWindows() {
  $('windows-btn').addEventListener('click', () => {
    const menu = $('windows-menu');
    menu.hidden = !menu.hidden;
    $('windows-btn').setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) renderWindowsMenu();
  });
  document.querySelectorAll('.dwin-collapse').forEach((btn) => {
    btn.addEventListener('click', () => toggleCollapse(btn.dataset.collapse));
  });
  document.addEventListener('click', (e) => {
    const menu = $('windows-menu');
    if (menu && !menu.hidden && !e.target.closest('#btn-windows')) {
      menu.hidden = true;
      $('windows-btn').setAttribute('aria-expanded', 'false');
    }
  });
  WINDOWS.forEach(({ id }) => applyWindow(id));
}
