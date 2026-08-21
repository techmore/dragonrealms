// Right dock: room/target/chat panes, info panels (inventory/score/skills/
// spells/exp/info), scripts panel.
import { $, escapeHtml } from './util.js';
import { send } from './net.js';
import { ansiToHtml } from './terminal.js';
import { pressEnter, isPlaying, focusInput } from './input.js';
import { settings, isMobile } from './settings.js';
import { macros, timers, triggers, onScriptsChange, removeScript, saveMacros, saveTriggers, renderMacros } from './automation.js';
import { listScripts, saveScript, runScript, stopScript, isScriptRunning, deleteScript, DEFAULT_SCRIPTS, onScriptsLibraryChange } from './scripts.js';
import { revealWindow, setWindowVisible } from './windows.js';

const PANELS = {
  inv: { title: 'INVENTORY', cmd: 'inventory' },
  score: { title: 'SCORE', cmd: 'score' },
  exp: { title: 'EXPERIENCE', cmd: 'exp' },
  info: { title: 'INFO', cmd: 'info' },
  skills: { title: 'SKILLS', cmd: 'skills' },
  spells: { title: 'SPELLS', cmd: 'spells' },
  scripts: { title: 'SCRIPTS', cmd: null },
};

let activePanel = null;
const panelCapture = { active: false, timer: null };

export function isPanelOpen() { return activePanel !== null; }
export function isDockOpen() { return document.body.classList.contains('dock-open'); }

// Conversations pane (DR local chat): say/emote/shout route here.
let chatOpen = false;
export function toggleChat() {
  chatOpen = !chatOpen;
  setWindowVisible('chat-widget', chatOpen, true);
  syncToolbar();
  return chatOpen;
}
export function appendChat(msg) {
  setWindowVisible('chat-widget', true, false);
  chatOpen = true;
  revealWindow('chat-widget');
  const row = $('chat-row');
  const div = document.createElement('div');
  div.className = 'block chat-line ch-' + (msg.channel || 'say');
  div.textContent = msg.msg;
  row.appendChild(div);
  while (row.children.length > 80) row.removeChild(row.firstChild);
  row.scrollTop = row.scrollHeight;
}

export function openPanel(key, sendCmd = true) {
  const panel = PANELS[key];
  if (!panel) return;
  activePanel = key;
  $('dock').hidden = false;
  document.body.classList.add('panel-open');
  if (isMobile()) document.body.classList.add('dock-open');
  $('panel-wrap').hidden = false;
  $('panel-title').textContent = panel.title;
  const body = $('panel-body');
  syncToolbar();
  if (isMobile()) requestAnimationFrame(() => $('panel-close').focus());
  if (panel.cmd === null) {
    renderScriptsPanel();
    return;
  }
  if (!isPlaying()) {
    body.innerHTML = '<span class="panel-empty">Enter the world first to use this panel.</span>';
    return;
  }
  body.innerHTML = '<span class="panel-empty">Requesting\u2026</span>';
  if (sendCmd) {
    panelCapture.active = true;
    clearTimeout(panelCapture.timer);
    panelCapture.timer = setTimeout(() => { panelCapture.active = false; }, 2000);
    send({ t: 'input', line: panel.cmd });
  }
}

export function capture(msg, isError = false) {
  if (!panelCapture.active) return false;
  const body = $('panel-body');
  if (body.innerHTML.trim() === '<span class="panel-empty">Requesting\u2026</span>') body.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'block' + (isError ? ' ch-error' : ' ch-msg');
  div.innerHTML = ansiToHtml(msg);
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  clearTimeout(panelCapture.timer);
  panelCapture.timer = setTimeout(() => { panelCapture.active = false; }, 200);
  return true;
}

export function closePanel() {
  activePanel = null;
  panelCapture.active = false;
  clearTimeout(panelCapture.timer);
  $('panel-wrap').hidden = true;
  document.body.classList.remove('dock-open');
  document.body.classList.remove('panel-open');
  if (!$('set-exits').checked) $('dock').hidden = true;
  syncDock();
  focusInput();
}

export function closeDock() {
  if (activePanel !== null) { closePanel(); return; }
  document.body.classList.remove('dock-open');
  document.body.classList.remove('panel-open');
  syncDock();
  focusInput();
}

function syncToolbar() {
  for (const key of Object.keys(PANELS)) {
    const button = $('btn-' + key);
    const on = activePanel === key;
    button.classList.toggle('on', on);
    button.setAttribute('aria-controls', 'panel-wrap');
    button.setAttribute('aria-expanded', String(on));
  }
  const exitsOpen = isMobile() ? isDockOpen() && activePanel === null : !$('dock').hidden;
  $('btn-exits').classList.toggle('on', exitsOpen);
  $('btn-exits').setAttribute('aria-expanded', String(exitsOpen));
  $('btn-chat').classList.toggle('on', chatOpen);
  $('btn-chat').setAttribute('aria-expanded', String(isMobile() ? isDockOpen() && chatOpen : chatOpen));
}

export function applyVisibility() {
  syncDock();
}

// Recompute whether the right dock is visible based on the Exits setting, an
// open panel, or any dock window that's currently showing. Called by the
// window manager when a dock pane is hidden/shown.
export function syncDock() {
  const dock = $('dock');
  if (!dock) return;
  const visibleWindows = [...document.querySelectorAll('#dock .dwin')]
    .filter((el) => !el.hasAttribute('data-whidden'));
  const roomVisible = visibleWindows.some((el) => el.id === 'room-panel');
  const contextualWindowVisible = visibleWindows.some((el) => el.id !== 'room-panel');
  if (activePanel && !$('panel-wrap').hidden) {
    dock.hidden = false;
  } else if (contextualWindowVisible || (settings.exits && roomVisible)) {
    dock.hidden = false;
  } else {
    dock.hidden = true;
  }
  dock.setAttribute('aria-hidden', String(dock.hidden || (isMobile() && !isDockOpen())));
  if (dock.hidden) document.body.classList.remove('dock-open', 'panel-open');
  if (!isMobile()) document.body.classList.remove('dock-open');
  syncToolbar();
}

function renderScriptsPanel() {
  const body = $('panel-body');
  let html = '';
  const macroKeys = Object.keys(macros);
  html += macroKeys.length
    ? macroKeys.map((k) => `<div class="script-row"><span class="script-kind">MACRO</span><span class="script-text" title="${escapeHtml(macros[k])}">${escapeHtml(k)} \u2192 ${escapeHtml(macros[k])}</span><button data-edit="macro:${escapeHtml(k)}" title="Edit">\u270e</button><button data-remove="macro:${escapeHtml(k)}">\u2715</button></div>`).join('')
    : '';
  html += timers.length
    ? timers.map((t, i) => `<div class="script-row"><span class="script-kind">TIMER</span><span class="script-text">every ${t.sec}s \u2192 ${escapeHtml(t.cmd)}</span><button data-remove="timer:${i}">\u2715</button></div>`).join('')
    : '';
  html += triggers.length
    ? triggers.map((t) => `<div class="script-row"><span class="script-kind">TRIGGER</span><span class="script-text" title="${escapeHtml(t.command)}">${escapeHtml(t.pattern)} \u2192 ${escapeHtml(t.command)}</span><button data-edit="trigger:${t.id}" title="Edit">\u270e</button><button data-remove="trigger:${t.id}">\u2715</button></div>`).join('')
    : '';
  if (!html) html = '<span class="panel-empty">No scripts yet. Define macros, timers, or triggers below.</span>';
  html += `<div class="script-add">
    <select id="script-kind">
      <option value="macro">Macro (label + command)</option>
      <option value="timer">Timer (every Ns + command)</option>
      <option value="trigger">Trigger (text + command)</option>
      <option value="script">DR script (run with .name)</option>
    </select>
    <input id="script-a" placeholder="label / seconds / trigger text / script name" autocomplete="off">
    <input id="script-b" placeholder="command / script body (one command per line)" autocomplete="off">
    <button id="script-addbtn">Add script</button>
  </div>`;
  html += `<div class="script-block">
    <div class="script-kind">DR SCRIPTS <button id="scripts-stop" class="dock-btn">stop</button></div>
    <div class="script-rows">${listScripts().map((n) => `<div class="script-name-row"><span class="script-kind">SCRIPT</span><span class="script-text">.${n}</span><button data-run="${n}">run</button>${DEFAULT_SCRIPTS[n] ? '' : `<button data-del-script="${n}" title="Delete (syncs to server)">\u2715</button>`}</div>`).join('')}</div>
  </div>`;
  html += `<div class="script-block">
    <div class="script-kind">CONFIG BACKUP</div>
    <textarea id="config-io" class="config-io" rows="4" placeholder="Export copies your client config here as JSON — paste JSON and press Import to restore it on any machine." spellcheck="false"></textarea>
    <div class="config-btns">
      <button id="config-export">Export</button>
      <button id="config-import">Import</button>
    </div>
  </div>`;
  body.innerHTML = html;
  body.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeScript(btn.dataset.remove));
  });
  body.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => editScriptRow(btn.dataset.edit));
  });
  body.querySelectorAll('[data-run]').forEach((btn) => {
    btn.addEventListener('click', () => runScript(btn.dataset.run));
  });
  body.querySelectorAll('[data-del-script]').forEach((btn) => {
    btn.addEventListener('click', () => deleteScript(btn.dataset.delScript));
  });
  $('scripts-stop').addEventListener('click', stopScript);
  $('config-export').addEventListener('click', exportConfig);
  $('config-import').addEventListener('click', importConfig);
  $('script-addbtn').addEventListener('click', () => {
    const kind = $('script-kind').value;
    const a = $('script-a').value.trim();
    const b = $('script-b').value.trim();
    if (!a || !b) return;
    if (kind === 'macro') pressEnter(`macro ${a} ${b}`);
    else if (kind === 'timer') pressEnter(`timer ${a} ${b}`);
    else if (kind === 'trigger') pressEnter(`trigger ${a} ${b}`);
    else { saveScript(a.toLowerCase(), b); renderScriptsPanel(); }
    if (kind !== 'script') renderScriptsPanel();
  });
}

// Edit-in-place for one macro/trigger row: swap the text for inputs.
function editScriptRow(which) {
  const [kind, id] = which.split(':');
  const row = [...document.querySelectorAll('#panel-body .script-row')]
    .find((r) => r.querySelector(`[data-edit="${which}"]`));
  if (!row) return;
  let a; let b;
  if (kind === 'macro') { a = id; b = macros[id] || ''; }
  else {
    const t = triggers.find((x) => String(x.id) === id);
    if (!t) return;
    a = t.pattern; b = t.command;
  }
  row.innerHTML = `<span class="script-kind">${kind.toUpperCase()}</span>
    <input class="edit-a" value="${escapeHtml(a)}" autocomplete="off">
    <input class="edit-b" value="${escapeHtml(b)}" autocomplete="off">
    <button data-save="${which}" title="Save">\u2713</button>
    <button data-cancel="1" title="Cancel">\u2715</button>`;
  row.querySelector('[data-save]').addEventListener('click', () => {
    const na = row.querySelector('.edit-a').value.trim();
    const nb = row.querySelector('.edit-b').value.trim();
    if (!na || !nb) return;
    if (kind === 'macro') {
      if (na !== id) delete macros[id];
      macros[na] = nb;
      saveMacros(); renderMacros();
    } else {
      const t = triggers.find((x) => String(x.id) === id);
      if (t) { t.pattern = na; t.command = nb; saveTriggers(); }
    }
    renderScriptsPanel();
  });
  row.querySelector('[data-cancel]').addEventListener('click', renderScriptsPanel);
  row.querySelector('.edit-a').focus();
}

// ---- Config backup: everything the client persists, as one JSON blob ----
const CONFIG_KEYS = ['dr_settings', 'dr_macros', 'dr_triggers', 'dr_highlights_v1', 'dr_scripts_v1', 'dr_windows_v1'];

function exportConfig() {
  const blob = {};
  for (const key of CONFIG_KEYS) {
    try { const v = localStorage.getItem(key); if (v) blob[key] = JSON.parse(v); } catch {}
  }
  const json = JSON.stringify(blob, null, 2);
  const ta = $('config-io');
  ta.value = json;
  ta.select();
  try { navigator.clipboard.writeText(json); } catch {}
}

function importConfig() {
  const ta = $('config-io');
  let blob;
  try { blob = JSON.parse(ta.value); } catch { alert('Import failed: the text is not valid JSON.'); return; }
  let applied = 0;
  for (const key of CONFIG_KEYS) {
    if (blob[key] !== undefined) {
      try { localStorage.setItem(key, JSON.stringify(blob[key])); applied++; } catch {}
    }
  }
  if (!applied) { alert('Nothing to import: no known config keys found.'); return; }
  location.reload();
}

onScriptsChange(() => { if (activePanel === 'scripts') renderScriptsPanel(); });
onScriptsLibraryChange(() => { if (activePanel === 'scripts') renderScriptsPanel(); });

$('btn-exits').addEventListener('click', () => {
  if (isMobile()) {
    if (isDockOpen() && activePanel === null) { closeDock(); return; }
    activePanel = null;
    panelCapture.active = false;
    clearTimeout(panelCapture.timer);
    $('panel-wrap').hidden = true;
    $('dock').hidden = false;
    document.body.classList.remove('panel-open');
    document.body.classList.add('dock-open');
    $('dock').setAttribute('aria-hidden', 'false');
    syncToolbar();
    requestAnimationFrame(() => $('dock-close').focus());
    return;
  }
  const show = $('dock').hidden;
  if (show) $('dock').hidden = false;
  else closePanel();
  syncToolbar();
  if (show) focusInput();
});
$('btn-chat').addEventListener('click', () => {
  if (isMobile()) {
    if (!chatOpen) toggleChat();
    $('dock').hidden = false;
    document.body.classList.remove('panel-open');
    document.body.classList.add('dock-open');
    $('dock').setAttribute('aria-hidden', 'false');
    syncToolbar();
    requestAnimationFrame(() => $('dock-close').focus());
    return;
  }
  const show = $('dock').hidden;
  if (show) $('dock').hidden = false;
  toggleChat();
  syncToolbar();
  focusInput();
});
$('btn-inv').addEventListener('click', () => openPanel('inv'));
$('btn-score').addEventListener('click', () => openPanel('score'));
$('btn-exp').addEventListener('click', () => openPanel('exp'));
$('btn-info').addEventListener('click', () => openPanel('info'));
$('btn-skills').addEventListener('click', () => openPanel('skills'));
$('btn-spells').addEventListener('click', () => openPanel('spells'));
$('btn-scripts').addEventListener('click', () => openPanel('scripts', false));
$('panel-close').addEventListener('click', closePanel);
$('dock-close').addEventListener('click', closeDock);
$('panel-refresh').addEventListener('click', () => {
  if (!activePanel || activePanel === 'scripts') return;
  openPanel(activePanel);
});
