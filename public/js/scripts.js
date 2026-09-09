// DR-style script interpreter (client-side, sandboxed). Implements the
// classic DragonRealms script language: labels, ECHO/PUT/MOVE/WAIT/WAITFOR/
// WAITFORRE/MATCH/MATCHRE/MATCHWAIT/GOTO/PAUSE/NEXTROOM/EXIT/SETVARIABLE,
// %1..%9 run-args, %var variables, and IF_<n> conditionals.
//
// The engine is event-driven: `feed(line, isPrompt)` is called with every
// server line (rooms, combat, prompts), and the runner advances until it
// hits a blocking wait (prompt/room/text/match/timer).
import { $ } from './util.js';
import { send } from './net.js';
import * as terminal from './terminal.js';
import { gameState } from './state.js';
import { createRunner } from './script-engine.js';

// ---- active runner registry (one at a time, like DR) ----
let active = null;

export function runScript(name, args = []) {
  if (gameState.value !== 'playing' || gameState.spectating) {
    terminal.append('[script] Enter the world before running a script.', 'ch-error');
    return;
  }
  if (active && !active.runner.running) active = null;
  const src = readScript(name);
  if (!src) {
    terminal.append(`[script] no script named "${name}"`, 'ch-error');
    return;
  }
  if (active) { terminal.append(`[script] "${active.name}" is already running — stop it first (script stop)`, 'ch-error'); return; }
  const io = {
    send: (line) => send({ t: 'input', line }),
    say: (t) => terminal.append(t, 'ch-echo'),
    getScript: (name) => readScript(name),
  };
  const runner = createRunner(src, args, io);
  active = { name, runner, vars: args };
  terminal.append(`[script] running "${name}"${args.length ? ' ' + args.join(' ') : ''}`, 'ch-notice');
  runner.start();
  if (!runner.running) active = null;
}

export function stopScript({ silent = false } = {}) {
  if (active) {
    active.runner.stop();
    if (!silent) terminal.append(`[script] "${active.name}" stopped`, 'ch-notice');
    active = null;
  } else if (!silent) {
    terminal.append('[script] nothing is running', 'ch-error');
  }
}

export function isScriptRunning() { return Boolean(active?.runner.running); }

// Feed every incoming server line to the active runner.
export function feedScripts(line, isPrompt = false) {
  if (active && active.runner.running) active.runner.feed(line, isPrompt);
  if (active && !active.runner.running) active = null;
}

// A 500ms heartbeat so `pause` timers resume even without server traffic.
setInterval(() => {
  feedScripts('');
}, 500);

// ---- script storage (per-browser, like DR client script files) ----
const LS = 'dr_scripts_v1';
export const DEFAULT_SCRIPTS = {
  demo: `# A tiny script demo.
#   .demo
  echo * A DragonRealms script is running. *
  put look
  wait
  echo * And the world answered. *
  exit`,
  hunt: `# Swing on a creature until it falls (DR roundtime-aware).
#   .hunt sewer rat
hunt:
  match done lies still
  match done crumples
  match done is gone
  matchre retry /wait \\d+ second/
  put attack %1
  matchwait
  goto hunt
retry:
  goto hunt
done:
  echo The %1 lies still. Harvest it with "skin %1".
  exit`,
  rest: `# Rest until the recovery completes.
#   .rest
rest:
  match done You rise
  put rest
  matchwait
  goto rest
done:
  echo Rested.
  exit`,
  heal: `# Walk to the temple and get healed.
#   .heal
  put go s
  wait
  put heal
  wait
  echo Healed. Stop with "script stop".
  exit`,
};

// Character scripts are authoritative snapshots, never merged into the
// browser archive. The old store remains available for deliberate copying.
let characterScripts = Object.create(null);
let libraryReady = false;
let scriptsDirtyNotify = null;
let sequence = 0;
const pending = new Map();
export function onScriptsLibraryChange(fn) { scriptsDirtyNotify = fn; }
export function scriptLibraryReady() { return libraryReady && gameState.value === 'playing' && !gameState.spectating; }
export function resetScriptLibrary() {
  characterScripts = Object.create(null);
  libraryReady = false;
  for (const { resolve, timer } of pending.values()) {
    clearTimeout(timer);
    resolve({ ok: false, error: 'Session changed before the save was confirmed.' });
  }
  pending.clear();
}
export function browserScripts() {
  try {
    const value = JSON.parse(localStorage.getItem(LS));
    return Object.fromEntries(Object.entries(value || {}).filter(([name, body]) => /^[a-z0-9_]{1,24}$/.test(name) && typeof body === 'string'));
  } catch { return {}; }
}
export function ownsScript(name) { return Object.hasOwn(characterScripts, name); }
export function readScript(name) { return ownsScript(name) ? characterScripts[name] : Object.hasOwn(DEFAULT_SCRIPTS, name) ? DEFAULT_SCRIPTS[name] : null; }
export function listScripts() { return [...new Set([...Object.keys(DEFAULT_SCRIPTS), ...Object.keys(characterScripts)])].sort(); }

export function saveScript(name, text) {
  name = String(name || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(name)) return Promise.resolve({ ok: false, error: 'Use 1–24 letters, numbers or underscores for the name.' });
  if (typeof text !== 'string' || !text.trim()) return Promise.resolve({ ok: false, error: 'Add a script body before saving.' });
  if (text.length > 16000) return Promise.resolve({ ok: false, error: 'Script body must be at most 16,000 characters.' });
  return changeScript({ t: 'scripts_put', name, body: text });
}
export function deleteScript(name) { return changeScript({ t: 'scripts_del', name }); }
function changeScript(message) {
  if (!scriptLibraryReady()) return Promise.resolve({ ok: false, error: 'Enter your character before changing its scripts.' });
  const requestId = `script-${++sequence}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({ ok: false, error: 'Save not confirmed. Copy your draft before reconnecting, then check the character library.' });
    }, 5000);
    pending.set(requestId, { resolve, timer });
    if (!send({ ...message, requestId })) {
      clearTimeout(timer);
      pending.delete(requestId);
      resolve({ ok: false, error: 'Disconnected. Your draft has not been saved.' });
    }
  });
}
export function receiveScriptResult(msg) {
  const request = pending.get(msg.requestId);
  if (!request) return;
  clearTimeout(request.timer);
  pending.delete(msg.requestId);
  request.resolve({ ok: msg.ok === true, error: msg.error });
}
export function mergeServerScripts(scripts) {
  if (gameState.spectating || gameState.value !== 'playing' || !scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return;
  characterScripts = Object.fromEntries(Object.entries(scripts).filter(([, body]) => typeof body === 'string'));
  libraryReady = true;
  scriptsDirtyNotify?.();
}

export function attachScriptPanel() {
  const wrap = $('script-add');
  if (!wrap) return;
  const scriptSel = $('script-kind');
  if (scriptSel) {
    const opt = document.createElement('option');
    opt.value = 'script';
    opt.textContent = 'Script (DR .script)';
    scriptSel.appendChild(opt);
  }
}
