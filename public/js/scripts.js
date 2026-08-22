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
}

export function stopScript() {
  if (active) {
    active.runner.stop();
    terminal.append(`[script] "${active.name}" stopped`, 'ch-notice');
    active = null;
  } else {
    terminal.append('[script] nothing is running', 'ch-error');
  }
}

export function isScriptRunning() { return Boolean(active); }

// Feed every incoming server line to the active runner.
export function feedScripts(line, isPrompt = false) {
  if (active && active.runner.running) active.runner.feed(line, isPrompt);
}

// A 500ms heartbeat so `pause` timers resume even without server traffic.
setInterval(() => {
  if (active && active.runner.running) active.runner.feed('');
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
  match done You fell
  matchre retry /wait \\d+ second/
  put attack %1
  matchwait
  goto hunt
retry:
  goto hunt
done:
  echo The %1 fell. Harvest it with "skin %1".
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

export function readScript(name) {
  const store = loadStore();
  return store[name] || DEFAULT_SCRIPTS[name] || null;
}

function playing() {
  return gameState.value === 'playing' || gameState.value === 'charcreate_playing';
}

export function saveScript(name, text) {
  const store = loadStore();
  store[name] = text;
  try { localStorage.setItem(LS, JSON.stringify(store)); } catch {}
  // Mirror to the server so saved scripts follow the character across
  // browsers and machines (best-effort when offline/spectating).
  if (playing()) send({ t: 'scripts_put', name, body: text });
}

export function deleteScript(name) {
  const store = loadStore();
  delete store[name];
  try { localStorage.setItem(LS, JSON.stringify(store)); } catch {}
  if (playing()) send({ t: 'scripts_del', name });
}

// Server snapshot of this character's script library: server entries win over
// same-name local copies; local-only scripts are kept.
export function mergeServerScripts(scripts) {
  if (!scripts || typeof scripts !== 'object') return;
  const store = loadStore();
  let changed = false;
  for (const [name, body] of Object.entries(scripts)) {
    if (typeof body !== 'string') continue;
    if (store[name] !== body) { store[name] = body; changed = true; }
  }
  if (changed) {
    try { localStorage.setItem(LS, JSON.stringify(store)); } catch {}
    if (typeof scriptsDirtyNotify === 'function') scriptsDirtyNotify();
  }
}
let scriptsDirtyNotify = null;
export function onScriptsLibraryChange(fn) { scriptsDirtyNotify = fn; }

export function listScripts() {
  const store = loadStore();
  return [...new Set([...Object.keys(DEFAULT_SCRIPTS), ...Object.keys(store)])].sort();
}

function loadStore() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; }
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
