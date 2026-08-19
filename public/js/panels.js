// Right dock: room/target/chat panes, info panels (inventory/score/skills/
// spells/exp/info), scripts panel.
import { $, escapeHtml } from './util.js';
import { send } from './net.js';
import { ansiToHtml } from './terminal.js';
import { pressEnter, isPlaying, focusInput } from './input.js';
import { settings, isMobile } from './settings.js';
import { macros, timers, triggers, onScriptsChange, removeScript } from './automation.js';
import { listScripts, saveScript, runScript, stopScript, isScriptRunning } from './scripts.js';
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
  if (isMobile()) document.body.classList.add('dock-open');
  $('panel-wrap').hidden = false;
  $('panel-title').textContent = panel.title;
  const body = $('panel-body');
  if (panel.cmd === null) {
    renderScriptsPanel();
    syncToolbar();
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
  syncToolbar();
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
  if (!$('set-exits').checked) $('dock').hidden = true;
  syncToolbar();
  focusInput();
}

function syncToolbar() {
  for (const key of Object.keys(PANELS)) {
    $('btn-' + key).classList.toggle('on', activePanel === key);
  }
  $('btn-exits').classList.toggle('on', !$('dock').hidden);
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
  let anyDockVisible = false;
  document.querySelectorAll('#dock .dwin').forEach((el) => {
    if (!el.hasAttribute('data-whidden')) anyDockVisible = true;
  });
  if (activePanel && !$('panel-wrap').hidden) {
    dock.hidden = false;
  } else if (settings.exits && anyDockVisible) {
    dock.hidden = false;
  } else if (anyDockVisible) {
    dock.hidden = false;
  } else {
    dock.hidden = true;
  }
  syncToolbar();
}

function renderScriptsPanel() {
  const body = $('panel-body');
  let html = '';
  const macroKeys = Object.keys(macros);
  html += macroKeys.length
    ? macroKeys.map((k) => `<div class="script-row"><span class="script-kind">MACRO</span><span class="script-text" title="${escapeHtml(macros[k])}">${escapeHtml(k)} \u2192 ${escapeHtml(macros[k])}</span><button data-remove="macro:${escapeHtml(k)}">\u2715</button></div>`).join('')
    : '';
  html += timers.length
    ? timers.map((t, i) => `<div class="script-row"><span class="script-kind">TIMER</span><span class="script-text">every ${t.sec}s \u2192 ${escapeHtml(t.cmd)}</span><button data-remove="timer:${i}">\u2715</button></div>`).join('')
    : '';
  html += triggers.length
    ? triggers.map((t) => `<div class="script-row"><span class="script-kind">TRIGGER</span><span class="script-text" title="${escapeHtml(t.command)}">${escapeHtml(t.pattern)} \u2192 ${escapeHtml(t.command)}</span><button data-remove="trigger:${t.id}">\u2715</button></div>`).join('')
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
    <div class="script-rows">${listScripts().map((n) => `<div class="script-name-row"><span class="script-kind">SCRIPT</span><span class="script-text">.${n}</span><button data-run="${n}">run</button></div>`).join('')}</div>
  </div>`;
  body.innerHTML = html;
  body.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeScript(btn.dataset.remove));
  });
  body.querySelectorAll('[data-run]').forEach((btn) => {
    btn.addEventListener('click', () => runScript(btn.dataset.run));
  });
  $('scripts-stop').addEventListener('click', stopScript);
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

onScriptsChange(() => { if (activePanel === 'scripts') renderScriptsPanel(); });

$('btn-exits').addEventListener('click', () => {
  const show = $('dock').hidden;
  if (show) $('dock').hidden = false;
  else closePanel();
  syncToolbar();
  if (show) focusInput();
});
$('btn-chat').addEventListener('click', () => {
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
$('panel-refresh').addEventListener('click', () => {
  if (!activePanel || activePanel === 'scripts') return;
  openPanel(activePanel);
});
