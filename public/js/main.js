// Boot + message routing. Wires the client modules together.
import { $ } from './util.js';
import { connect, onServerMessage, onDisconnect, setToken } from './net.js';
import * as terminal from './terminal.js';
import * as status from './status.js';
import * as panels from './panels.js';
import * as automation from './automation.js';
import * as welcome from './welcome.js';
import * as input from './input.js';
import { settings, applySettings, onSettingsChange } from './settings.js';
import { gameState } from './state.js';

// Cross-module wiring.
automation.setRunner(input.pressEnter);
terminal.setExitRunner(input.pressEnter);
terminal.setFocusRunner(input.focusInput);

onSettingsChange(() => {
  terminal.setAutoScroll(settings.autoscroll);
  input.setDpadVisible(settings.dpad);
  panels.applyVisibility();
  automation.renderMacros();
  status.renderStatusStrip();
});

onDisconnect(() => input.blockInput(true));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('searchbar').hidden) { terminal.closeSearch(); return; }
  if (panels.isPanelOpen()) { panels.closePanel(); return; }
  if (!$('settings-panel').hidden) { $('settings-panel').hidden = true; }
});

// ---------------- Message routing ----------------
function onMessage(msg) {
  if (['room', 'msg', 'combat', 'notice', 'error'].includes(msg.t) && msg.msg) {
    automation.runTriggers(msg.msg);
  }
  switch (msg.t) {
    case 'room': {
      terminal.appendRoom(msg.msg);
      status.setLastRoom({ name: status.roomNameOf(msg.msg), exits: msg.exits || [] });
      panels.renderExitsWidget();
      status.renderStatusStrip();
      if (msg.exits && msg.exits.length) terminal.appendExitBar(msg.exits);
      break;
    }
    case 'msg':
      if (panels.capture(msg.msg)) break;
      terminal.append(msg.msg, 'ch-msg');
      break;
    case 'combat':
      terminal.appendCombat(msg.msg);
      break;
    case 'notice':
      if (panels.capture(msg.msg)) break;
      terminal.append(msg.msg, 'ch-notice');
      break;
    case 'error':
      if (panels.capture(msg.msg, true)) break;
      terminal.append(msg.msg, 'ch-error');
      break;
    case 'prompt':
      terminal.append(msg.msg, 'ch-prompt');
      status.parsePrompt(msg.msg);
      input.blockInput(false);
      break;
    case 'command':
      // The watched player typed a command: echo it like their own typing.
      terminal.append(`> ${msg.line}`, 'ch-echo');
      break;
    case 'login_prompt':
      if (gameState.spectating) break;
      terminal.append('(type: login <username> <password>  or  register <username> <password>)', 'ch-msg');
      welcome.showWelcome('login');
      break;
    case 'authed':
      setToken(msg.token);
      localStorage.setItem('dr_token', msg.token);
      gameState.value = 'logged';
      break;
    case 'charselect':
      if (gameState.spectating) break;
      gameState.value = 'charselect';
      terminal.append(msg.msg, 'ch-notice');
      welcome.showWelcome('charselect', msg.msg);
      input.blockInput(false);
      break;
    case 'charcreate':
      if (gameState.spectating) break;
      gameState.value = 'charcreate';
      gameState.inChargen = true;
      welcome.enterChargen(msg.msg);
      terminal.append(msg.msg, 'ch-notice');
      break;
    case 'charalloc':
      welcome.showAlloc(msg.msg);
      break;
    case 'enter':
      gameState.value = 'playing';
      gameState.inChargen = false;
      welcome.hideAll();
      terminal.append(msg.msg, 'ch-notice');
      break;
    case 'pong':
      break;
  }
}

onServerMessage(onMessage);

applySettings();
automation.renderMacros();
connect();
