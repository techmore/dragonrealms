// Message-type → handler table. Each entry receives the raw server message;
// main.js keeps only boot/wiring, so adding a wire message means adding a row
// here, not growing a switch.
import * as terminal from './terminal.js';
import * as status from './status.js';
import * as panels from './panels.js';
import * as welcome from './welcome.js';
import * as input from './input.js';
import { gameState } from './state.js';
import { mergeServerScripts } from './scripts.js';
import { setToken } from './net.js';

// "?spectate=Name" deep-link: watch that player once a GM credential is stored.
const autoSpectate = new URLSearchParams(location.search).get('spectate') || '';
function hasStoredGmToken() {
  try { return Boolean(localStorage.getItem('dr_gm_token')); } catch { return false; }
}
function maybeSpectate() {
  if (gameState.spectating) return true;
  if (autoSpectate && hasStoredGmToken()) {
    import('./spectate-mode.js').then((m) => m.enterSpectate(autoSpectate));
    return true;
  }
  return autoSpectate ? 'warn' : false;
}

export const handlers = {
  room(msg) {
    terminal.appendRoom(msg.msg);
    status.setLastRoom({ name: status.roomNameOf(msg.msg), area: status.roomAreaOf(msg.msg), exits: msg.exits || [] });
    status.renderRoomPanel(msg);
    status.renderRoomContents(msg.contents);
    status.renderStatusStrip();
    if (msg.exits && msg.exits.length) terminal.appendExitBar(msg.exits);
  },
  msg(msg) {
    if (panels.capture(msg.msg)) return;
    if (msg.channel) panels.appendChat(msg);
    terminal.append(msg.msg, msg.channel ? 'ch-' + msg.channel : 'ch-msg');
  },
  combat(msg) {
    terminal.appendCombat(msg.msg);
  },
  notice(msg) {
    if (panels.capture(msg.msg)) return;
    terminal.append(msg.msg, 'ch-notice');
  },
  error(msg) {
    if (panels.capture(msg.msg, true)) return;
    terminal.append(msg.msg, 'ch-error');
    if (gameState.spectating && /GM authorization is required/.test(msg.msg)) {
      import('./spectate-mode.js').then((m) => m.leaveSpectate());
    }
  },
  prompt(msg) {
    // DR clients never echo the raw vitals line into the story window —
    // the gauges in the status strip carry it. Keep parsing, skip printing.
    status.parsePrompt(msg.msg);
    return { feedScripts: msg.msg };
  },
  hands(msg) {
    status.renderHands(msg);
  },
  targets(msg) {
    status.renderTargets(msg);
  },
  mindstate(msg) {
    status.renderFe(msg);
  },
  quest(msg) {
    status.renderQuest(msg);
  },
  scripts(msg) {
    // Server snapshot of this character's saved DR script library.
    mergeServerScripts(msg.scripts);
  },
  command(msg) {
    // The watched player typed a command: echo it like their own typing.
    terminal.append(`> ${msg.line}`, 'ch-echo');
  },
  login_prompt() {
    const spec = maybeSpectate();
    if (spec === true) return;
    status.hideRoomPanel();
    if (spec === 'warn') terminal.append('That live-watch link requires DR_GM_TOKEN from the GM console.', 'ch-error');
    terminal.append('(type: login <username> <password>  or  register <username> <password>)', 'ch-msg');
    welcome.showWelcome('login');
    input.blockInput(false);
  },
  authed(msg) {
    setToken(msg.token);
    localStorage.setItem('dr_token', msg.token);
    gameState.value = 'logged';
  },
  charselect(msg) {
    if (maybeSpectate() === true) return;
    gameState.value = 'charselect';
    terminal.append(msg.msg, 'ch-notice');
    welcome.showWelcome('charselect', msg.msg);
    input.blockInput(false);
  },
  charcreate(msg) {
    if (maybeSpectate() === true) return;
    gameState.value = 'charcreate';
    gameState.inChargen = true;
    welcome.enterChargen(msg);
    terminal.append(msg.msg, 'ch-notice');
  },
  charalloc(msg) {
    welcome.showAlloc(msg.msg);
  },
  enter() {
    gameState.value = 'playing';
    gameState.inChargen = false;
    welcome.hideAll();
    // Fresh session: start the story at the room you wake in.
    terminal.clear();
    return { applyPanels: true };
  },
  pong() {},
};

// Story-bearing types that also feed triggers + scripts.
export const SCRIPT_TYPES = ['room', 'msg', 'combat', 'notice', 'error'];
