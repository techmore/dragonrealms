// WebSocket session handling: login, chargen, and game command routing.
import { WebSocketServer } from 'ws';
import {
  registerAccount, loginAccount, validateSession, logoutSession, pruneExpiredSessions,
} from './auth.js';
import { MAX_CHARS, putScript, delScript, charsFor } from './player.js';
import { pushStarterScripts } from './starter-scripts.js';
import { raceById } from '../data/races.js';
import { guildById } from '../data/guilds.js';
import { handleCommand, readPanel } from './commands/index.js';
import { sendChargenMenu, allocPanel, doCharSelect, doCharCreate, doAlloc, doEnter } from './chargen.js';
import { subscribe, unsubscribe, subscribeWorld, forward, forwardCommand } from './spectate.js';
import { isGmToken } from './http-auth.js';
import { handleGmPlayMessage } from './gm-play.js';
import { handleBoostMessage } from './boost.js';

const INPUT_MAX = 20; // commands per second
const AUTH_MAX = 5;   // login/register/token messages per second

export function attachWebSocket(httpServer, game, { gmToken } = {}) {
  // maxPayload must clear the largest LEGITIMATE frame a client can send.
  // The biggest one is {t:'scripts_put'}: putScript() accepts bodies up to
  // SCRIPT_MAX_BODY (8000 chars), so a 4096-byte frame cap rejected scripts
  // the game layer considers valid — and `ws` surfaces an over-cap frame as
  // an 'error' EVENT, not a close, so with no error listener Node rethrew it
  // as an unhandled 'error' and killed the whole world process
  // (WS_ERR_UNSUPPORTED_MESSAGE_LENGTH / RangeError: Max payload size
  // exceeded). 64KB leaves headroom over the 8000-char body limit plus JSON
  // escaping; oversized bodies are still rejected politely by putScript.
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 65536 });

  wss.on('connection', (socket, req) => {
    // Bots self-identify at connect time (?bot=1) so status surfaces can
    // distinguish them from human adventurers.
    const isBot = /^\?bot=1/.test(req.url.split('?')[1] ? '?' + req.url.split('?')[1] : '');
    const session = {
      socket,
      state: 'login',       // login | charselect | charcreate | charcreate_playing | playing
      token: null,
      accountId: null,
      username: null,
      player: null,
      gmToken,              // the world's resolved GM credential for this server
      isBot,
      charCreate: null,     // {name, race, guild, stats, pool}
      cmdTimestamps: [],
      authGeneration: 0,    // bumped by every auth action/logout; stale completions discard themselves
      gmAuthorized: false,
      stateBeforeSpectate: null,
      game,
    };
    // Wrap the socket's send so any message the player emits (rooms, combat,
    // prompts — all sent via p.ws.send) also mirrors to spectators.
    const origSend = socket.send.bind(socket);
    socket.send = (data) => {
      origSend(data);
      if (session.player && session.state === 'playing') {
        try {
          forward(session.player, typeof data === 'string' ? JSON.parse(data) : data);
        } catch {}
      }
    };
    session.send = (obj) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
    };

    session.send({ t: 'notice', msg: '\n\x1b[1mDRAGON REALMS\x1b[0m — enter the Crossing.\nType "login" or "register" (username + password) to begin.\n' });
    session.send({ t: 'login_prompt', msg: 'login/register', features: ['panels-v1'] });

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return session.send({ t: 'error', msg: 'Bad request.' }); }
      try {
        route(session, msg);
      } catch (e) {
        console.error('session error', e);
        session.send({ t: 'error', msg: 'Something went wrong. (See server log.)' });
      }
    });

    socket.on('close', () => {
      unsubscribe(session);
      // A dropped network connection is not an explicit logout. Keep the
      // account token valid so the reconnecting client can resume it. Also
      // avoid an old socket evicting a newer connection for the same player.
      if (session.player && game.players.get(session.player.charId) === session.player) {
        game.removePlayer(session.player);
      }
    });

    // Socket-level failures (over-cap frames, protocol violations, resets)
    // arrive as an 'error' EVENT. With no listener, `ws` re-emits it as an
    // unhandled 'error' and Node tears down the ENTIRE world process — one
    // misbehaving client killed every other player's session. Log it and let
    // the paired 'close' handler do the normal per-session cleanup.
    socket.on('error', (err) => {
      console.error('socket error', err?.code || err?.message || err);
      try { socket.close(); } catch {}
    });
  });

  // Same guard one level up: a WSS-level error must not be fatal either.
  wss.on('error', (err) => {
    console.error('wss error', err?.code || err?.message || err);
  });

  const pruneTimer = setInterval(pruneExpiredSessions, 60 * 60 * 1000);
  pruneTimer.unref();
  wss.once('close', () => clearInterval(pruneTimer));
  return wss;
}

// Message routing. Exported for tests (audit C17 generation-guard spec).
export function route(session, msg) {
  if (session.game.shuttingDown) return;
  switch (msg.t) {
    case 'login':
    case 'register':
      // Auth message types get their own tighter budget (separate from the
      // command budget): one socket can no longer pin the 2-worker scrypt
      // queue with unlimited login/register spam.
      rateLimit(session, AUTH_MAX);
      if (msg.t === 'login') doLogin(session, msg.u, msg.p);
      else doRegister(session, msg.u, msg.p);
      break;
    case 'token':
      rateLimit(session, AUTH_MAX);
      doTokenLogin(session, msg.token);
      break;
    case 'charselect':
      doCharSelect(session, msg.id);
      break;
    case 'charcreate':
      doCharCreate(session, msg.name, msg.race, msg.guild, msg.city);
      break;
    case 'alloc':
      doAlloc(session, msg.stat, msg.amt);
      break;
    case 'enter':
      doEnter(session);
      // Tag after entry so status surfaces (health, GM console) can flag bots.
      if (session.player && session.isBot) session.player.isBot = true;
      break;
    case 'spectate': {
      if (!authorizeGmStream(session, msg.gmToken)) {
        session.send({ t: 'error', code: 'SPECTATE_FAILED', msg: 'GM authorization is required to watch a live player stream.' });
        return restoreAfterSpectate(session);
      }
      const res = subscribe(session, msg.name);
      if (!res.ok) {
        session.send({ t: 'error', code: 'SPECTATE_FAILED', msg: res.msg });
        return restoreAfterSpectate(session);
      }
      enterSpectatingState(session);
      session.send({ t: 'notice', msg: res.msg });
      break;
    }
    case 'worldwatch': {
      if (!authorizeGmStream(session, msg.gmToken)) {
        return session.send({ t: 'error', msg: 'GM authorization is required to watch the world feed.' });
      }
      const res = subscribeWorld(session);
      if (!res.ok) return session.send({ t: 'error', msg: res.msg });
      enterSpectatingState(session);
      session.send({ t: 'notice', msg: res.msg });
      break;
    }
    case 'unspectate':
      restoreAfterSpectate(session);
      break;
    case 'logout':
      doLogout(session);
      break;
    case 'panel_request': {
      rateLimit(session);
      if (typeof msg.requestId !== 'string' || msg.requestId.length > 80) return;
      const p = session.player;
      const result = session.state === 'playing' && p && session.game.players.get(p.charId) === p
        ? readPanel(session.game, p, msg.panel)
        : { ok: false, error: 'Enter the world to view this character panel.' };
      session.send({ t: 'panel_response', requestId: msg.requestId, ...result });
      break;
    }
    case 'input':
      rateLimit(session);
      // During the post-creation alloc phase, plain text "alloc"/"enter" are
      // protocol verbs, not game commands — the modal flow uses them too.
      if (session.state === 'charcreate_playing' && !session.player?.online) {
        const parts = String(msg.line || '').trim().split(/\s+/);
        if (parts[0] === 'enter') { doEnter(session); break; }
        if (parts[0] === 'alloc') { doAlloc(session, parts[1], parts[2]); break; }
      }
      if (session.state === 'playing' && session.player &&
          session.game.players.get(session.player.charId) === session.player) {
        forwardCommand(session.player, msg.line);
        handleCommand(session.game, session.player, msg.line, 0, { applyRT: true });
      } else if (session.state === 'playing') {
        session.send({ t: 'error', msg: 'This character is no longer active in this session.' });
      }
      break;
    case 'ping':
      session.send({ t: 'pong' });
      break;
    case 'gen_starter': {
      // Simulated players: generate the starter circling library from live
      // geography, save it on this character, and auto-run it client-side.
      rateLimit(session);
      const p = session.player;
      if (session.state !== 'playing' || !p) break;
      // Runtime ownership (audit C6): a superseded socket can still sit at
      // state 'playing' while another session owns the character — same
      // predicate as the input path below.
      if (session.game.players.get(p.charId) !== p) {
        session.send({ t: 'error', msg: 'This character is no longer active in this session.' });
        break;
      }
      const ok = pushStarterScripts(session, p);
      if (!ok) session.send({ t: 'error', msg: 'Could not generate a starter script here (no hunting area reachable).' });
      break;
    }
    case 'scripts_put':
    case 'scripts_del': {
      rateLimit(session);
      const p = session.player;
      const requestId = typeof msg.requestId === 'string' && msg.requestId.length <= 80 ? msg.requestId : undefined;
      let result;
      if (session.state !== 'playing' || !p) result = { ok: false, error: 'Enter the world before changing scripts.' };
      else if (session.game.players.get(p.charId) !== p) result = { ok: false, error: 'This character is no longer active in this session.' };
      else {
        try { result = msg.t === 'scripts_put' ? putScript(p, msg.name, msg.body) : delScript(p, msg.name); }
        catch { result = { ok: false, error: 'The script could not be saved. Please try again.' }; }
      }
      if (result.ok) session.send({ t: 'scripts', scripts: p.scripts || {} });
      else session.send({ t: 'error', msg: result.error });
      session.send({ t: 'script_result', requestId, ...result });
      break;
    }
    case 'boost':
      rateLimit(session);
      handleBoostMessage(session, msg);
      break;
    case 'gm_play': {
      rateLimit(session);
      handleGmPlayMessage(session, msg);
      break;
    }
    default:
      session.send({ t: 'error', msg: 'Unknown message type.' });
  }
}

function authorizeGmStream(session, suppliedToken) {
  if (session.gmAuthorized) return true;
  session.gmAuthorized = isGmToken(suppliedToken, session.gmToken);
  return session.gmAuthorized;
}
function enterSpectatingState(session) {
  if (session.state !== 'spectating') session.stateBeforeSpectate = session.state;
  session.state = 'spectating';
}

function doLogout(session) {
  unsubscribe(session);
  // Any in-flight login/register completion is now stale.
  session.authGeneration = (session.authGeneration || 0) + 1;
  if (session.player && session.game.players.get(session.player.charId) === session.player) {
    session.game.removePlayer(session.player);
  }
  if (session.token) logoutSession(session.token);
  session.state = 'login';
  session.token = null;
  session.accountId = null;
  session.username = null;
  session.player = null;
  session.charCreate = null;
  session.gmAuthorized = false;
  session.stateBeforeSpectate = null;
  session.send({ t: 'notice', msg: 'You have logged out.' });
  session.send({ t: 'login_prompt', msg: 'login/register', reason: 'logout', features: ['panels-v1'] });
}

async function doLogin(session, u, p) {
  // Generation guard (C17): async password work must not clobber a NEWER auth
  // action or resurrect a logged-out session. login -> logout -> slow login
  // resolving used to log the socket back in; two rapid logins raced, with
  // the last-to-RESOLVE (not last-SENT) winning.
  const gen = ++session.authGeneration;
  const res = await loginAccount(u, p);
  if (gen !== session.authGeneration) return; // stale auth completion — ignore
  if (!res.ok) return session.send({ t: 'error', code: 'AUTH_FAILED', msg: res.error });
  startAccountSession(session, res);
}

async function doRegister(session, u, p) {
  const gen = ++session.authGeneration;
  const res = await registerAccount(u, p);
  if (gen !== session.authGeneration) return; // stale auth completion — ignore
  if (!res.ok) return session.send({ t: 'error', code: 'AUTH_FAILED', msg: res.error });
  const login = await loginAccount(u, p);
  if (gen !== session.authGeneration) return; // stale after second await too
  if (!login.ok) return session.send({ t: 'error', code: 'AUTH_FAILED', msg: 'Account created, but login failed. Try again.' });
  startAccountSession(session, login);
}

function doTokenLogin(session, token) {
  // Sync but still an auth action: bump the generation so an in-flight
  // login/register resolves as stale and cannot clobber this session.
  session.authGeneration = (session.authGeneration || 0) + 1;
  const v = validateSession(token);
  if (!v) return session.send({ t: 'error', code: 'SESSION_EXPIRED', msg: 'Session expired. Please log in.' });
  startAccountSession(session, { accountId: v.accountId, username: v.username, token });
}

function startAccountSession(session, info) {
  if (session.game.shuttingDown) return;
  // Re-authenticating on an existing socket is also a character switch. Drop
  // only this session's owned runtime before presenting the new account menu.
  if (session.player && session.game.players.get(session.player.charId) === session.player) {
    session.game.removePlayer(session.player);
  }
  session.player = null;
  session.token = info.token;
  session.accountId = info.accountId;
  session.username = info.username;
  session.send({ t: 'authed', token: info.token });

  const chars = charsFor(info.accountId);
  if (chars.length === 0) {
    session.state = 'charcreate';
    sendChargenMenu(session);
  } else {
    session.state = 'charselect';
    sendCharacterSelection(session, chars);
  }
}

function sendCharacterSelection(session, chars = charsFor(session.accountId)) {
    const rows = chars.map((c) => `${c.id}) ${c.name} — ${raceById(c.race).name} ${c.guild ? guildById(c.guild).name : 'guildless'}, circle ${c.circle}`);
    const slots = `(${chars.length}/${MAX_CHARS} slots used${chars.length < MAX_CHARS ? ` — "new" to create another` : ''})`;
    session.send({ t: 'charselect', msg: `\nWelcome back, ${session.username}. ${slots}\nChoose a character:\n${rows.join('\n')}\n(Type the number to enter the world.)` });
}

// Restore the existing session without re-entering the world or replacing its
// allocation draft. Re-entry would reset runtime state such as corpses.
function restoreAfterSpectate(session) {
  const state = session.state === 'spectating' ? session.stateBeforeSpectate : session.state;
  unsubscribe(session);
  session.state = state || (session.accountId ? 'charselect' : 'login');
  session.stateBeforeSpectate = null;
  session.send({ t: 'session_restore', state: session.state });
  if (session.state === 'playing' && session.player) {
    session.send({ t: 'enter', resumed: true });
    session.game.look(session.player);
    session.player.handsDirty = true;
    session.game.status(session.player);
    session.send({ t: 'scripts', scripts: session.player.scripts || {} });
  } else if (session.state === 'charcreate_playing' && session.player) {
    sendChargenMenu(session);
    session.send({ t: 'charalloc', msg: allocPanel(session.player) });
  } else if (session.state === 'charcreate') {
    sendChargenMenu(session);
  } else if (session.state === 'charselect') {
    sendCharacterSelection(session);
  } else {
    session.send({ t: 'login_prompt', msg: 'login/register', features: ['panels-v1'] });
  }
}

function rateLimit(session, max = INPUT_MAX) {
  const now = Date.now();
  session.cmdTimestamps = session.cmdTimestamps.filter((t) => now - t < 1000);
  if (session.cmdTimestamps.length >= max) {
    throw new Error('Input rate limit exceeded.');
  }
  session.cmdTimestamps.push(now);
}
