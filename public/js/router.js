// Message-type → handler table. Each entry receives the raw server message;
// main.js keeps only boot/wiring, so adding a wire message means adding a row
// here, not growing a switch.
import * as terminal from './terminal.js';
import * as status from './status.js';
import * as panels from './panels.js';
import * as welcome from './welcome.js';
import * as input from './input.js';
import { gameState } from './state.js';
import { mergeServerScripts, runScript, stopScript, resetScriptLibrary, receiveScriptResult } from './scripts.js';
import { stopTimers } from './automation.js';
import { setAutomationPaused } from './automation-control.js';
import { setToken, setStatusOverride } from './net.js';
import { hasStoredGmToken, storedGmToken, harvestGmTokenFromFragment } from './gm-token.js';

// "?spectate=Name" deep-link: watch that player once a GM credential is stored.
const autoSpectate = new URLSearchParams(location.search).get('spectate') || '';
// "?play=barbarian" (optionally "empath,elf") + "&boost=20": GM quick-play —
// jump straight into an auto-provisioned boosted character with no signup or
// chargen screens. Requires the #gm=<token> fragment or a stored credential.
const autoPlay = (() => {
  const raw = new URLSearchParams(location.search).get('play') || '';
  if (!raw) return null;
  const [guild, race] = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  if (!guild) return null;
  const boost = Number(new URLSearchParams(location.search).get('boost')) || 0;
  return { guild, race: race || 'human', boost };
})();
// A #gm=<token> fragment may carry the credential itself (dash Watch links).
harvestGmTokenFromFragment();
// True once a spectate handoff has been kicked off — set synchronously so
// follow-up server messages (charselect etc.) don't race the dynamic import
// and flash the welcome modal over the stream.
let spectatePending = false;
let autoSpectateDismissed = false;

export function resetSession(nextState = 'login') {
  if (gameState.value === 'playing' || gameState.value === 'charcreate_playing') setAutomationPaused(true);
  stopScript({ silent: true });
  resetScriptLibrary();
  stopTimers();
  gameState.value = nextState;
  gameState.inChargen = false;
  gameState.spectating = false;
  gameState.gmPlay = null;
  spectatePending = false;
  welcome.hideAll();
  status.markDisconnected();
  panels.resetPanels();
}
function maybeSpectate() {
  if (gameState.spectating || spectatePending) return true;
  if (autoSpectate && !autoSpectateDismissed && hasStoredGmToken()) {
    spectatePending = true;
    gameState.spectating = true; // claim the state now; enterSpectate confirms
    import('./spectate-mode.js').then((m) => m.enterSpectate(autoSpectate));
    return true;
  }
  return autoSpectate && !autoSpectateDismissed ? 'warn' : false;
}

// GM quick-play launcher: send gm_play the moment the socket is usable.
// Called from login_prompt / charselect / charcreate handlers — whichever
// server message lands first after connect — and from net's reconnect path.
let playSent = false;
export function maybeGmPlay() {
  if (!autoPlay || playSent) return false;
  if (!hasStoredGmToken()) return 'warn';
  playSent = true;
  gameState.gmPlay = autoPlay;
  welcome.hideAll();
  terminal.clear();
  terminal.append(`\x1b[1m— GM quick-play: ${autoPlay.guild}${autoPlay.race ? ' ' + autoPlay.race : ''}${autoPlay.boost > 1 ? ` · boost x${autoPlay.boost}` : ''} —\x1b[0m`, 'ch-notice');
  import('./net.js').then(({ send }) => {
    let gmToken = '';
    try { gmToken = storedGmToken(); } catch {}
    send({
      t: 'gm_play', gmToken,
      guild: autoPlay.guild, race: autoPlay.race,
      ...(autoPlay.name ? { name: autoPlay.name } : {}),
      ...(autoPlay.boost > 1 ? { boost: autoPlay.boost } : {}),
    });
  });
  return true;
}

export const handlers = {
  session_restore(msg) {
    autoSpectateDismissed = true;
    resetSession(msg.state);
    setStatusOverride(null);
  },
  room(msg) {
    terminal.appendRoom(msg.msg);
    status.setLastRoom({ name: status.roomNameOf(msg.msg), area: status.roomAreaOf(msg.msg), exits: msg.exits || [] });
    status.renderRoomPanel(msg);
    status.renderRoomContents(msg.contents);
    status.renderStatusStrip();
    if (msg.exits && msg.exits.length) terminal.appendExitBar(msg.exits);
  },
  msg(msg) {
    if (msg.channel) panels.appendChat(msg);
    terminal.append(msg.msg, msg.channel ? 'ch-' + msg.channel : 'ch-msg');
  },
  combat(msg) {
    terminal.appendCombat(msg.msg);
  },
  notice(msg) {
    if (gameState.spectating && /^You are now watching/.test(msg.msg)) {
      const name = msg.msg.replace(/^You are now watching\s+/, '').split(' ')[0];
      import('./net.js').then(({ setStatusOverride }) => setStatusOverride('watching ' + name, 'conn-on'));
    }
    terminal.append(msg.msg, 'ch-notice');
  },
  error(msg) {
    if (msg.code === 'SESSION_EXPIRED') {
      setToken(null);
      resetSession();
      welcome.showWelcome('login');
      input.blockInput(false);
    }
    welcome.showAuthError(msg.msg);
    welcome.showCreationError(msg.msg);
    terminal.append(msg.msg, 'ch-error');
    if (gameState.spectating && msg.code !== 'SPECTATE_FAILED') {
      import('./spectate-mode.js').then(async (m) => {
        if (/GM authorization is required/.test(msg.msg)) {
          m.leaveSpectate();
        } else if (/no adventurer named/i.test(msg.msg)) {
          // Watch target offline/gone — make the chip honest instead of a
          // misleading "connected" (the raw socket IS up, but nothing streams).
          const { setStatusOverride } = await import('./net.js');
          setStatusOverride('not watching', 'conn-off');
        }
      });
    }
  },
  panel_response(msg) { panels.receivePanel(msg); },
  prompt(msg) {
    // DR clients never echo the raw vitals line into the story window —
    // the gauges in the status strip carry it. Keep parsing, skip printing.
    status.parsePrompt(msg.msg, msg);
    if (msg.requirements) status.renderExpBlips(msg.requirements);
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
  script_result(msg) { receiveScriptResult(msg); },
  scripts(msg) {
    // Server snapshot of this character's saved DR script library.
    mergeServerScripts(msg.scripts);
  },
  autorun(msg) {
    // Server asked this client to start a saved script (quick-play sims get
    // their starter circling library pushed + autorun on entry).
    if (msg.name && typeof msg.name === 'string') runScript(msg.name);
  },
  command(msg) {
    // The watched player typed a command: echo it like their own typing.
    terminal.append(`> ${msg.line}`, 'ch-echo');
  },
  login_prompt(msg) {
    if (msg.reason === 'logout') setToken(null);
    resetSession();
    panels.setProtocolSupported(Boolean(msg.features?.includes('panels-v1')));
    const play = maybeGmPlay();
    if (play === true) return;
    if (play === 'warn') terminal.append('GM quick-play needs DR_GM_TOKEN — open the link with #gm=<token>.', 'ch-error');
    const spec = maybeSpectate();
    if (spec === true) return;
    status.hideRoomPanel();
    if (spec === 'warn') terminal.append('That live-watch link requires DR_GM_TOKEN from the GM console.', 'ch-error');
    terminal.append('(type: login <username> <password>  or  register <username> <password>)', 'ch-msg');
    welcome.showWelcome('login');
    setStatusOverride('connected · sign in', 'conn-on');
    input.blockInput(false);
  },
  authed(msg) {
    setToken(msg.token);
    if (!gameState.spectating) resetSession('logged');
    gameState.value = 'logged';
  },
  charselect(msg) {
    if (maybeGmPlay() === true || maybeSpectate() === true) return;
    gameState.value = 'charselect';
    gameState.inChargen = false;
    terminal.append(msg.msg, 'ch-notice');
    welcome.showWelcome('charselect', msg.msg);
    setStatusOverride('connected · choose character', 'conn-on');
    input.blockInput(false);
  },
  charcreate(msg) {
    if (maybeSpectate() === true) return;
    gameState.value = 'charcreate';
    gameState.inChargen = true;
    welcome.enterChargen(msg);
    setStatusOverride('connected · create character', 'conn-on');
    terminal.append(msg.msg, 'ch-notice');
  },
  charalloc(msg) {
    // Creation succeeded — we're now in the alloc phase (server state
    // charcreate_playing). Keep the modal as a live stat sheet.
    gameState.value = 'charcreate_playing';
    welcome.showAlloc(msg.msg);
  },
  enter() {
    gameState.value = 'playing';
    gameState.inChargen = false;
    welcome.hideAll();
    if (!gameState.spectating) setStatusOverride('playing', 'conn-on');
    input.blockInput(false);
    if (!gameState.spectating) input.focusInput();
    // Fresh session: start the story at the room you wake in.
    terminal.clear();
    return { applyPanels: true };
  },
  pong() {},
};

// Story-bearing types that also feed triggers + scripts.
export const SCRIPT_TYPES = ['room', 'msg', 'combat', 'notice', 'error'];
