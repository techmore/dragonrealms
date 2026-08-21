// Command input: history, tab completion, local command routing, D-pad, gamepad.
import { $ } from './util.js';
import { send } from './net.js';
import { append, searchWith, endScroll } from './terminal.js';
import { handleAutomation } from './automation.js';
import { settings, saveSettings, applySettings } from './settings.js';
import { gameState } from './state.js';
import { routeTypedCommand } from './welcome.js';

const cmdInput = $('cmd');
const dpad = $('dpad');

const STATS = ['str', 'con', 'ref', 'agi', 'cha', 'dis', 'wis', 'int'];
const DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd'];

const history = [];
let histIndex = -1;
let tabMatches = [];
let tabIndex = -1;
let lastTabLine = '';
let completionTimer = null;

// ---------------- Public helpers ----------------
export function isPlaying() {
  return gameState.value === 'playing' || gameState.value === 'charcreate_playing';
}

export function pressEnter(line) {
  cmdInput.value = line;
  cmdInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

export function focusInput() {
  cmdInput.focus();
}

export function blockInput(blocked) {
  cmdInput.disabled = blocked;
  document.body.classList.toggle('input-blocked', blocked);
  if (!blocked) cmdInput.focus();
}

export function setDpadVisible(visible) {
  dpad.hidden = !visible;
}

// ---------------- Command routing ----------------
export function handleLocalCommand(line) {
  if (handleAutomation(line)) return;
  const parts = line.split(/\s+/);

  // DR run prefix: ".scriptname arg1 arg2" starts a saved script.
  if (/^\.[A-Za-z]/.test(line)) {
    const name = line.slice(1).split(/\s+/)[0].toLowerCase();
    const args = line.split(/\s+/).slice(1);
    import('./scripts.js').then((s) => s.runScript(name, args));
    return;
  }
  // Script control: `script <name> [args]` runs, `script stop` halts.
  if (parts[0].toLowerCase() === 'script') {
    import('./scripts.js').then((s) => {
      const sub = parts[1] ? parts[1].toLowerCase() : '';
      if (sub === 'stop') { s.stopScript(); return; }
      if (sub === 'list') { append(`Scripts: ${s.listScripts().join(', ')}`, 'ch-msg'); return; }
      if (sub) s.runScript(sub, parts.slice(2));
      else append('Use: .name [args]  or  script <name> [args]  |  script stop', 'ch-msg');
    });
    return;
  }

  // Spectate another player's live stream (works from any state).
  if (parts[0].toLowerCase() === 'spectate' && parts[1]) {
    import('./spectate-mode.js').then((m) => m.enterSpectate(parts[1]));
    return;
  }
  if (parts[0].toLowerCase() === 'unspectate') {
    import('./spectate-mode.js').then((m) => m.leaveSpectate());
    return;
  }

  if (parts[0].toLowerCase() === 'search' && parts[1]) {
    searchWith(parts.slice(1).join(' '));
    return;
  }

  // Keyboard shortcuts overlay (also F1).
  if (parts[0].toLowerCase() === 'keys') {
    import('./keys.js').then((k) => k.toggleKeys());
    return;
  }

  if (gameState.inChargen && gameState.value === 'charcreate') {
    if (routeTypedCommand(line)) return;
    send({ t: 'input', line });
    return;
  }

  if (gameState.value === 'login') {
    if (parts[0] === 'login' && parts[1] && parts[2]) {
      send({ t: 'login', u: parts[1], p: parts[2] });
    } else if (parts[0] === 'register' && parts[1] && parts[2]) {
      send({ t: 'register', u: parts[1], p: parts[2] });
    } else {
      append('Use: login <username> <password>  or  register <username> <password>', 'ch-msg');
    }
    return;
  }

  if (gameState.value === 'charselect') {
    send({ t: 'charselect', id: line });
    return;
  }

  send({ t: 'input', line });
}

// ---------------- Tab completion ----------------
const COMMANDS = [
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd',
  'go', 'look', 'l', 'attack', 'cast', 'retreat', 'skin', 'disarm', 'trip', 'bash',
  'stance', 'spells', 'berserk', 'backstab', 'get', 'drop', 'inventory', 'i',
  'wear', 'wield', 'remove', 'use', 'list', 'buy', 'sell', 'deposit', 'withdraw',
  'train', 'circle', 'tdp', 'raise', 'tdptrain', 'quest', 'claim', 'craft',
  'alias', 'macro', 'timer', 'trigger', 'macros', 'timers', 'triggers',
  'ask', 'score', 'skills', 'exp', 'info', 'health', 'alloc', 'say', 'emote', 'shout', 'who', 'time',
  'help', 'save', 'quit', 'rest', 'forage', 'hunt', 'track', 'steal', 'pick',
  'perform', 'appraise', 'duel', 'accept', 'decline', 'script', 'scripts', 'keys',
];
const CONTEXT_ARGS = {
  alloc: STATS, raise: STATS,
  stance: ['aggressive', 'defensive', 'guarded', 'balanced'],
  go: DIRECTIONS,
};

function setCompletion(text) {
  const el = $('completion');
  el.textContent = text;
  clearTimeout(completionTimer);
  if (text) completionTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}

function completeTab(line) {
  const caret = cmdInput.selectionStart ?? line.length;
  const before = line.slice(0, caret);
  const tokens = before.split(/\s+/);
  const isFirst = tokens.length === 1;
  const word = tokens[tokens.length - 1];
  if (!word) { setCompletion(''); return; }
  const dict = isFirst ? COMMANDS : (CONTEXT_ARGS[tokens[0].toLowerCase()] || []);
  if (!dict.length) return;
  if (tabMatches.length === 0 || word.toLowerCase() !== tabMatches[0].slice(0, word.length).toLowerCase() || !line.startsWith(lastTabLine)) {
    tabMatches = dict.filter((c) => c.toLowerCase().startsWith(word.toLowerCase()));
    tabIndex = 0;
    lastTabLine = line;
  } else {
    tabIndex = (tabIndex + 1) % tabMatches.length;
  }
  if (tabMatches.length === 0) { setCompletion(''); return; }
  const choice = tabMatches[tabIndex];
  const prefix = tokens.slice(0, -1).join(' ');
  cmdInput.value = (prefix ? prefix + ' ' : '') + choice + ' ';
  cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length);
  if (tabMatches.length > 1) {
    setCompletion(`${tabMatches.slice(0, 8).join('  ')}${tabMatches.length > 8 ? ' \u2026' : ''}`);
  } else {
    setCompletion('');
  }
}

// ---------------- Key handling ----------------
cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const line = cmdInput.value.trim();
    cmdInput.value = '';
    tabMatches = [];
    setCompletion('');
    if (!line) return;
    append(`> ${line}`, 'ch-echo');
    if (line.toLowerCase() !== 'quit') {
      history.push(line);
      if (history.length > 500) history.shift();
    }
    histIndex = -1;
    handleLocalCommand(line);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (history.length) {
      histIndex = histIndex < 0 ? history.length - 1 : Math.max(0, histIndex - 1);
      cmdInput.value = history[histIndex];
      cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length);
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (histIndex >= 0) {
      histIndex += 1;
      cmdInput.value = histIndex < history.length ? history[histIndex] : '';
      if (histIndex >= history.length) histIndex = -1;
      cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length);
    }
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    completeTab(cmdInput.value);
    return;
  }
});

cmdInput.addEventListener('input', () => { tabMatches = []; setCompletion(''); });

document.addEventListener('keydown', (e) => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' && e.target !== cmdInput) return;
  if (e.key === 'F1') {
    e.preventDefault();
    import('./keys.js').then((k) => k.toggleKeys());
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    searchWith('');
    return;
  }
  // Quick font size: Ctrl/Cmd +/- step, Ctrl/Cmd 0 resets to 14.
  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
    e.preventDefault();
    const step = e.key === '0' ? 0 : (e.key === '-' ? -1 : 1);
    settings.font = Math.max(11, Math.min(20, step ? settings.font + step : 14));
    saveSettings();
    applySettings();
    return;
  }
  if (e.key === 'End' && tag === 'INPUT') {
    endScroll();
    return;
  }
});

// ---------------- D-pad ----------------
dpad.querySelectorAll('.dbtn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (settings.haptics && navigator.vibrate) navigator.vibrate(10);
    pressEnter(`go ${btn.dataset.dir}`);
  });
});

// ---------------- Gamepad ----------------
const GAMEPAD_DIRS = { 12: 'n', 13: 's', 14: 'w', 15: 'e' };
const GAMEPAD_ACTIONS = { 0: 'attack', 1: 'retreat', 2: 'look', 3: 'cast' };
const prevPad = {};

window.addEventListener('gamepadconnected', (e) => {
  append(`Controller connected: ${e.gamepad.id}`, 'ch-msg');
});
window.addEventListener('gamepaddisconnected', () => {
  append('Controller disconnected.', 'ch-msg');
});

setInterval(() => {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find((g) => g && g.connected);
  if (!gp) return;

  for (const [idx, dir] of Object.entries(GAMEPAD_DIRS)) {
    const pressed = Boolean(gp.buttons[idx] && gp.buttons[idx].pressed);
    if (pressed && !prevPad['d' + idx]) pressEnter(`go ${dir}`);
    prevPad['d' + idx] = pressed;
  }
  for (const [idx, action] of Object.entries(GAMEPAD_ACTIONS)) {
    const pressed = Boolean(gp.buttons[idx] && gp.buttons[idx].pressed);
    if (pressed && !prevPad['b' + idx]) pressEnter(action);
    prevPad['b' + idx] = pressed;
  }

  const ax = gp.axes && gp.axes[0];
  const ay = gp.axes && gp.axes[1];
  const stickDir = ay < -0.5 ? 'n' : ay > 0.5 ? 's' : ax < -0.5 ? 'w' : ax > 0.5 ? 'e' : null;
  if (stickDir && !prevPad.stick) pressEnter(`go ${stickDir}`);
  prevPad.stick = stickDir;
}, 150);
