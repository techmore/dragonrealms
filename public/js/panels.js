// Right dock: room/target/chat panes, info panels (inventory/score/skills/
// spells/exp/info), scripts panel.
import { $, escapeHtml } from './util.js';
import { send } from './net.js';
import { ansiToHtml } from './terminal.js';
import { pressEnter, isPlaying, focusInput } from './input.js';
import { settings, isMobile } from './settings.js';
import { macros, timers, triggers, onScriptsChange, removeScript, saveMacros, saveTriggers, renderMacros } from './automation.js';
import { listScripts, readScript, browserScripts, ownsScript, scriptLibraryReady, saveScript, runScript, stopScript, isScriptRunning, deleteScript, onScriptsLibraryChange } from './scripts.js';
import { revealWindow, setWindowVisible, isWindowVisible, clearWindowSeen } from './windows.js';
import { gameState } from './state.js';
import { CONFIG_KEYS, parseConfig, restoreConfig } from './config.js';

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
const newScriptDraft = () => ({ kind: 'macro', name: '', body: '', editing: false, dirty: false, pending: false, message: '' });
let scriptDraft = newScriptDraft();
let requestSequence = 0;
let pendingRequest = null;
let requestTimer = null;
let protocolSupported = false;
export function setProtocolSupported(supported) { protocolSupported = supported; }

function cancelRequest() {
  pendingRequest = null;
  clearTimeout(requestTimer);
  requestTimer = null;
}

export function isPanelOpen() { return activePanel !== null; }
export function isDockOpen() { return document.body.classList.contains('dock-open'); }

// Conversations pane (DR local chat): say/emote/shout route here.
const chatOpen = () => isWindowVisible('chat-widget');
export function toggleChat() {
  const visible = !chatOpen();
  setWindowVisible('chat-widget', visible, true);
  syncToolbar();
  return visible;
}
export function appendChat(msg) {
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
  cancelRequest();
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
  if (!isPlaying() || gameState.spectating) {
    body.innerHTML = '<span class="panel-empty">Enter the world first to use this panel.</span>';
    return;
  }
  body.innerHTML = '<span class="panel-empty">Requesting\u2026</span>';
  if (sendCmd) {
    if (!protocolSupported) {
      body.textContent = 'This connection displays the response in the story.';
      send({ t: 'input', line: panel.cmd });
      return;
    }
    pendingRequest = `panel-${++requestSequence}`;
    requestTimer = setTimeout(() => {
      cancelRequest();
      body.textContent = 'No response received. Use Refresh to try again.';
    }, 5000);
    if (!send({ t: 'panel_request', requestId: pendingRequest, panel: panel.cmd })) {
      cancelRequest();
      body.textContent = 'Connection lost. Reconnect to refresh this panel.';
    }
  }
}

export function receivePanel(msg) {
  if (!pendingRequest || msg.requestId !== pendingRequest) return;
  cancelRequest();
  const body = $('panel-body');
  body.textContent = '';
  for (const line of msg.ok ? (msg.lines || []) : [msg.error || 'Could not load this panel.']) {
    const div = document.createElement('div');
    div.className = 'block' + (msg.ok ? ' ch-msg' : ' ch-error');
    div.innerHTML = ansiToHtml(line);
    body.appendChild(div);
  }
  if (!body.children.length) body.textContent = 'Nothing to show.';
}

export function closePanel(returnFocus = true) {
  activePanel = null;
  cancelRequest();
  $('panel-wrap').hidden = true;
  document.body.classList.remove('dock-open');
  document.body.classList.remove('panel-open');
  if (!$('set-exits').checked) $('dock').hidden = true;
  syncDock();
  if (returnFocus) focusInput();
}

export function resetPanels() {
  scriptDraft = newScriptDraft();
  closePanel(false);
  $('panel-body').textContent = '';
  $('chat-row').textContent = '';
  clearWindowSeen('chat-widget');
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
  $('btn-chat').classList.toggle('on', chatOpen());
  $('btn-chat').setAttribute('aria-expanded', String(isMobile() ? isDockOpen() && chatOpen() : chatOpen()));
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
  const focused = body.contains(document.activeElement) ? document.activeElement : null;
  const selection = focused && ['script-a', 'script-b'].includes(focused.id) ? [focused.id, focused.selectionStart, focused.selectionEnd] : null;
  let html = '';
  const macroKeys = Object.keys(macros);
  html += macroKeys.length
    ? macroKeys.map((k) => `<div class="script-row"><span class="script-kind">MACRO</span><span class="script-text" title="${escapeHtml(macros[k])}">${escapeHtml(k)} \u2192 ${escapeHtml(macros[k])}</span><button data-edit="macro:${escapeHtml(k)}" title="Edit">\u270e</button><button data-remove="macro:${escapeHtml(k)}">\u2715</button></div>`).join('')
    : '';
  html += timers.length
    ? timers.map((t, i) => `<div class="script-row"><span class="script-kind">TIMER</span><span class="script-text">every ${t.sec}s \u2192 ${escapeHtml(t.cmd)}</span><button data-remove="timer:${i}">\u2715</button></div>`).join('')
    : '';
  html += triggers.length
    ? triggers.map((t) => `<div class="script-row"><span class="script-kind">TRIGGER</span><span class="script-text" title="${escapeHtml(t.command)}">${escapeHtml(t.pattern)} \u2192 ${escapeHtml(t.command)}</span><button data-edit="trigger:${escapeHtml(t.id)}" title="Edit">\u270e</button><button data-remove="trigger:${escapeHtml(t.id)}">\u2715</button></div>`).join('')
    : '';
  if (!html) html = '<span class="panel-empty">No scripts yet. Define macros, timers, or triggers below.</span>';
  html += `<div class="script-add">
    <label for="script-kind">Automation type</label><select id="script-kind">
      <option value="macro">Macro (label + command)</option>
      <option value="timer">Timer (every Ns + command)</option>
      <option value="trigger">Trigger (text + command)</option>
      <option value="script">DR script (run with .name)</option>
    </select>
    <label for="script-a">Name, interval or trigger text</label>
    <input id="script-a" placeholder="label / seconds / trigger text / script name" autocomplete="off">
    <label for="script-b">Commands / script body</label>
    <textarea id="script-b" rows="6" placeholder="One script instruction per line" spellcheck="false"></textarea>
    <p>DR scripts save to the character you are playing. Macros, timers and triggers belong to this browser.</p>
    <button id="script-addbtn">Save / add</button>
    <button id="script-cancel" type="button">Cancel changes</button>
    <p id="script-feedback" role="status" aria-live="polite"></p>
  </div>`;
  html += `<div class="script-block">
    <div class="script-kind">DR SCRIPTS <button id="scripts-stop" class="dock-btn">stop</button></div>
    <div class="script-rows">${listScripts().map((n) => `<div class="script-name-row"><span class="script-kind">SCRIPT</span><span class="script-text">.${escapeHtml(n)}</span><button data-run="${escapeHtml(n)}">run</button><button data-edit-script="${escapeHtml(n)}">${ownsScript(n) ? 'edit' : 'copy'}</button>${ownsScript(n) ? `<button data-del-script="${escapeHtml(n)}" title="Delete from this character">\u2715</button>` : ''}</div>`).join('')}</div>
  </div>`;
  const archived = browserScripts();
  if (Object.keys(archived).length) html += `<div class="script-block"><div class="script-kind">BROWSER SCRIPT ARCHIVE</div><p>Preserved from the old shared library. Copy a script to this character to use it; nothing here runs automatically.</p>${Object.keys(archived).map(n => `<div class="script-name-row"><span>${escapeHtml(n)}</span><button data-copy-browser="${escapeHtml(n)}">copy to character</button></div>`).join('')}</div>`;
  html += `<div class="script-block">
    <div class="script-kind">BROWSER CONFIG BACKUP</div>
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
  const beginEdit = (name, text, editing) => {
    if (scriptDraft.dirty) { scriptDraft.message = 'Save or cancel your current changes before opening another script.'; updateScriptFeedback(); return; }
    scriptDraft = { kind: 'script', name, body: text, editing, dirty: false, pending: false, message: editing ? 'Editing character script.' : 'Copy ready. Save to add it to this character.' };
    renderScriptsPanel();
    $('script-b').focus();
  };
  body.querySelectorAll('[data-edit-script]').forEach(btn => btn.addEventListener('click', () => {
    const name = btn.dataset.editScript;
    beginEdit(ownsScript(name) ? name : name + '_copy', readScript(name), ownsScript(name));
  }));
  body.querySelectorAll('[data-copy-browser]').forEach(btn => btn.addEventListener('click', () => {
    const name = btn.dataset.copyBrowser;
    beginEdit(ownsScript(name) ? name + '_copy' : name, archived[name], false);
  }));
  body.querySelectorAll('[data-del-script]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const draft = scriptDraft;
      const result = await deleteScript(btn.dataset.delScript);
      if (scriptDraft !== draft) return;
      scriptDraft.message = result.ok ? 'Deleted from this character.' : result.error;
      renderScriptsPanel();
    });
  });
  $('scripts-stop').addEventListener('click', stopScript);
  $('config-export').addEventListener('click', exportConfig);
  $('config-import').addEventListener('click', importConfig);
  $('script-kind').value = scriptDraft.kind;
  $('script-a').value = scriptDraft.name;
  $('script-b').value = scriptDraft.body;
  $('script-a').readOnly = scriptDraft.editing;
  $('script-kind').disabled = scriptDraft.editing || scriptDraft.pending;
  for (const id of ['script-a', 'script-b']) $(id).disabled = scriptDraft.pending;
  $('script-addbtn').disabled = scriptDraft.pending;
  $('script-cancel').disabled = scriptDraft.pending;
  updateScriptFeedback();
  const changed = () => {
    scriptDraft.kind = $('script-kind').value;
    scriptDraft.name = $('script-a').value;
    scriptDraft.body = $('script-b').value;
    scriptDraft.dirty = true;
    scriptDraft.message = 'Unsaved changes.';
    updateScriptFeedback();
  };
  for (const id of ['script-kind', 'script-a', 'script-b']) $(id).addEventListener('input', changed);
  $('script-cancel').addEventListener('click', () => { scriptDraft = newScriptDraft(); renderScriptsPanel(); });
  $('script-addbtn').addEventListener('click', async () => {
    const kind = $('script-kind').value;
    const a = $('script-a').value.trim();
    const b = $('script-b').value;
    changed();
    if (kind === 'script') {
      const draft = scriptDraft;
      draft.pending = true; draft.message = 'Saving to character…';
      renderScriptsPanel();
      const result = await saveScript(a.toLowerCase(), b);
      if (scriptDraft !== draft) return;
      draft.pending = false;
      draft.message = result.ok ? 'Saved to this character.' : result.error;
      if (result.ok) { draft.dirty = false; draft.editing = true; draft.name = a.toLowerCase(); }
      renderScriptsPanel();
    } else {
      if (!a || !b.trim()) { scriptDraft.message = 'Enter a name/interval and command first.'; updateScriptFeedback(); return; }
      if (kind === 'macro') pressEnter(`macro ${a} ${b.trim()}`);
      else if (kind === 'timer') pressEnter(`timer ${a} ${b.trim()}`);
      else pressEnter(`trigger ${a} ${b.trim()}`);
      scriptDraft = newScriptDraft();
      renderScriptsPanel();
    }
  });
  if (selection && !$(selection[0]).disabled) { $(selection[0]).focus(); $(selection[0]).setSelectionRange(selection[1], selection[2]); }
}

function updateScriptFeedback() {
  const feedback = $('script-feedback');
  if (feedback) feedback.textContent = scriptDraft.message || (scriptLibraryReady() ? 'Character library ready.' : 'Enter a character to save DR scripts.');
}

// Edit-in-place for one macro/trigger row: swap the text for inputs.
function editScriptRow(which) {
  const [kind, id] = which.split(':');
  const row = [...document.querySelectorAll('#panel-body .script-row')]
    .find((r) => r.querySelector('[data-edit]')?.dataset.edit === which);
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
    <button data-save="${escapeHtml(which)}" title="Save">\u2713</button>
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

function exportConfig() {
  const blob = {};
  for (const key of CONFIG_KEYS) {
    try { const v = localStorage.getItem(key); if (v) blob[key] = JSON.parse(v); } catch {}
  }
  const json = JSON.stringify({ version: 1, config: blob }, null, 2);
  const ta = $('config-io');
  ta.value = json;
  ta.select();
  try { navigator.clipboard.writeText(json); } catch {}
}

function importConfig() {
  const ta = $('config-io');
  try {
    restoreConfig(localStorage, parseConfig(ta.value));
  } catch (error) {
    alert(`Import failed: ${error.message}`);
    return;
  }
  location.reload();
}

onScriptsChange(() => { if (activePanel === 'scripts') renderScriptsPanel(); });
onScriptsLibraryChange(() => { if (activePanel === 'scripts') renderScriptsPanel(); });

$('btn-exits').addEventListener('click', () => {
  if (isMobile()) {
    if (isDockOpen() && activePanel === null) { closeDock(); return; }
    activePanel = null;
    cancelRequest();
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
    if (!chatOpen()) toggleChat();
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
