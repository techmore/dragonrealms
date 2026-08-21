// Boot + message routing. Wires the client modules together.
import { $ } from './util.js';
import { connect, onServerMessage, onDisconnect, setToken } from './net.js';import * as terminal from './terminal.js';
import * as status from './status.js';
import * as panels from './panels.js';
import * as automation from './automation.js';
import * as welcome from './welcome.js';
import * as input from './input.js';
import { settings, applySettings, onSettingsChange, closeSettings } from './settings.js';
import { gameState } from './state.js';
import { feedScripts, mergeServerScripts } from './scripts.js';
import { bindHighlightPanel } from './highlights.js';
import { bindGagPanel } from './gags.js';
import { bindWindows } from './windows.js';

// Cross-module wiring.
automation.setRunner(input.pressEnter);
terminal.setExitRunner(input.pressEnter);
terminal.setFocusRunner(input.focusInput);

// GM URL deep-link: "?spectate=Name" watches that player when the configured
// GM credential has already been stored by the GM console.
const autoSpectate = new URLSearchParams(location.search).get('spectate') || '';
function hasStoredGmToken() {
  try { return Boolean(localStorage.getItem('dr_gm_token')); } catch { return false; }
}

onSettingsChange(() => {
  terminal.setAutoScroll(settings.autoscroll);
  input.setDpadVisible(settings.dpad);
  panels.applyVisibility();
  automation.renderMacros();
  status.renderStatusStrip();
});

onDisconnect(() => {
  input.blockInput(true);
  status.hideRoomPanel();
  status.hideHands();
  status.markDisconnected();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('keys-overlay').hidden) { import('./keys.js').then((k) => k.toggleKeys(false)); return; }
  if (!$('searchbar').hidden) { terminal.closeSearch(); return; }
  if (!$('settings-panel').hidden) { closeSettings(true); return; }
  if (panels.isPanelOpen()) { panels.closePanel(); return; }
  if (panels.isDockOpen()) panels.closeDock();
});

// ---------------- Message routing ----------------
function onMessage(msg) {
  if (['room', 'msg', 'combat', 'notice', 'error'].includes(msg.t) && msg.msg) {
    automation.runTriggers(msg.msg);
    feedScripts(msg.msg, msg.t);
  }
  switch (msg.t) {
    case 'room': {
      terminal.appendRoom(msg.msg);
      status.setLastRoom({ name: status.roomNameOf(msg.msg), area: status.roomAreaOf(msg.msg), exits: msg.exits || [] });
      status.renderRoomPanel(msg);
      status.renderRoomContents(msg.contents);
      status.renderStatusStrip();
      if (msg.exits && msg.exits.length) terminal.appendExitBar(msg.exits);
      break;
    }
    case 'msg':
      if (panels.capture(msg.msg)) break;
      if (msg.channel) panels.appendChat(msg);
      terminal.append(msg.msg, msg.channel ? 'ch-' + msg.channel : 'ch-msg');
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
      if (gameState.spectating && /GM authorization is required/.test(msg.msg)) {
        import('./spectate-mode.js').then((m) => m.leaveSpectate());
      }
      break;
    case 'prompt':
      // DR clients never echo the raw vitals line into the story window —
      // the gauges in the status strip carry it. Keep parsing, skip printing.
      status.parsePrompt(msg.msg);
      feedScripts(msg.msg, true);
      input.blockInput(false);
      break;
    case 'hands':
      status.renderHands(msg);
      break;
    case 'targets':
      status.renderTargets(msg);
      break;
    case 'mindstate':
      status.renderFe(msg);
      break;
    case 'quest':
      status.renderQuest(msg);
      break;
    case 'scripts':
      // Server snapshot of this character's saved DR script library.
      mergeServerScripts(msg.scripts);
      break;
    case 'command':
      // The watched player typed a command: echo it like their own typing.
      terminal.append(`> ${msg.line}`, 'ch-echo');
      break;
    case 'login_prompt':
      if (gameState.spectating) break;
      if (autoSpectate && hasStoredGmToken()) {
        import('./spectate-mode.js').then((m) => m.enterSpectate(autoSpectate));
        break;
      }
      status.hideRoomPanel();
      if (autoSpectate) terminal.append('That live-watch link requires DR_GM_TOKEN from the GM console.', 'ch-error');
      terminal.append('(type: login <username> <password>  or  register <username> <password>)', 'ch-msg');
      welcome.showWelcome('login');
      input.blockInput(false);
      break;
    case 'authed':
      setToken(msg.token);
      localStorage.setItem('dr_token', msg.token);
      gameState.value = 'logged';
      break;
    case 'charselect':
      if (gameState.spectating) break;
      // Deep-linked spectate must survive session resume: a stored game
      // token skips login_prompt entirely, landing straight here.
      if (autoSpectate && hasStoredGmToken()) {
        import('./spectate-mode.js').then((m) => m.enterSpectate(autoSpectate));
        break;
      }
      gameState.value = 'charselect';
      terminal.append(msg.msg, 'ch-notice');
      welcome.showWelcome('charselect', msg.msg);
      input.blockInput(false);
      break;
    case 'charcreate':
      if (gameState.spectating) break;
      if (autoSpectate && hasStoredGmToken()) {
        import('./spectate-mode.js').then((m) => m.enterSpectate(autoSpectate));
        break;
      }
      gameState.value = 'charcreate';
      gameState.inChargen = true;
      welcome.enterChargen(msg);
      terminal.append(msg.msg, 'ch-notice');
      break;
    case 'charalloc':
      welcome.showAlloc(msg.msg);
      break;
    case 'enter':
      gameState.value = 'playing';
      gameState.inChargen = false;
      welcome.hideAll();
      // Fresh session: start the story at the room you wake in.
      terminal.clear();
      panels.applyVisibility();
      break;
    case 'pong':
      break;
  }
}

onServerMessage(onMessage);

applySettings();
automation.renderMacros();
bindHighlightPanel();
bindGagPanel();
bindWindows();
window.__panelReady = true;
panels.applyVisibility();
connect();
