// Spectate mode: watch another player's live stream inside the full DR
// interface. Rooms, combat, prompts, and the watched player's commands all
// render in the terminal; the status strip shows their vitals. Type
// `unspectate` to return. Live streams are GM-only because they include the
// watched player's typed commands; the GM console stores the required token.
import { $ } from './util.js';
import { send } from './net.js';
import * as terminal from './terminal.js';
import * as welcome from './welcome.js';
import { blockInput, focusInput } from './input.js';
import { gameState } from './state.js';

let watchedName = null;

export function enterSpectate(name) {
  watchedName = String(name || '').trim();
  if (!watchedName) {
    terminal.append('Spectate whom? Provide a player name.', 'ch-error');
    return;
  }
  // Trusted-launcher/dash handoff: #gm=<token> in the URL is stored once and
  // stripped, so Watch links work even when localStorage wasn't pre-seeded.
  try {
    const m = location.hash.match(/^#gm=([A-Za-z0-9%]+)$/);
    if (m) {
      localStorage.setItem('dr_gm_token', decodeURIComponent(m[1]));
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch {}
  let gmToken = '';
  try { gmToken = localStorage.getItem('dr_gm_token') || ''; } catch {}
  if (!gmToken) {
    watchedName = null;
    terminal.append('Live watch is GM-only. Enter DR_GM_TOKEN in the GM console first.', 'ch-error');
    return;
  }
  gameState.spectating = true;
  welcome.hideAll();
  terminal.clear();
  terminal.append(`\x1b[1m— watching ${watchedName} —\x1b[0m  (type \x1b[1munspectate\x1b[0m to return)`, 'ch-notice');
  send({ t: 'spectate', name: watchedName, gmToken });
  blockInput(false);
}

export function leaveSpectate() {
  if (!gameState.spectating) {
    terminal.append('You are not spectating anyone.', 'ch-error');
    return;
  }
  gameState.spectating = false;
  watchedName = null;
  send({ t: 'unspectate' });
  terminal.append('No longer spectating.', 'ch-notice');
  // Return to whatever flow the session was in.
  if (gameState.value === 'login' || gameState.value === 'logged') {
    welcome.showWelcome('login');
  }
  focusInput();
}
