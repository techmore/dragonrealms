// WebSocket session handling: login, chargen, and game command routing.
import { WebSocketServer } from 'ws';
import {
  registerAccount, loginAccount, validateSession, logoutSession, pruneExpiredSessions,
} from './auth.js';
import { MAX_CHARS, putScript, delScript } from './player.js';
import { raceById } from '../data/races.js';
import { guildById } from '../data/guilds.js';
import { db } from './db.js';
import { handleCommand } from './commands/index.js';
import { sendChargenMenu, doCharSelect, doCharCreate, doAlloc, doEnter } from './chargen.js';
import { subscribe, unsubscribe, subscribeWorld, forward, forwardCommand } from './spectate.js';
import { isGmToken } from './gm.js';
import { handleGmPlayMessage } from './gm-play.js';
import { handleBoostMessage } from './boost.js';

const INPUT_MAX = 20; // commands per second

export function attachWebSocket(httpServer, game, { gmToken } = {}) {
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 4096 });

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
    session.send({ t: 'login_prompt', msg: 'login/register' });

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
  });

  const pruneTimer = setInterval(pruneExpiredSessions, 60 * 60 * 1000);
  pruneTimer.unref();
  wss.once('close', () => clearInterval(pruneTimer));
  return wss;
}

function route(session, msg) {
  switch (msg.t) {
    case 'login':
      doLogin(session, msg.u, msg.p);
      break;
    case 'register':
      doRegister(session, msg.u, msg.p);
      break;
    case 'token':
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
        return session.send({ t: 'error', msg: 'GM authorization is required to watch a live player stream.' });
      }
      const res = subscribe(session, msg.name);
      if (!res.ok) return session.send({ t: 'error', msg: res.msg });
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
    case 'unspectate': {
      if (session.state !== 'spectating') {
        return session.send({ t: 'notice', msg: 'You are not spectating anyone.' });
      }
      unsubscribe(session);
      session.state = session.stateBeforeSpectate || (session.accountId ? 'charselect' : 'login');
      session.stateBeforeSpectate = null;
      session.send({ t: 'notice', msg: 'You are no longer spectating.' });
      break;
    }
    case 'logout':
      doLogout(session);
      break;
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
    case 'scripts_put': {
      rateLimit(session);
      const p = session.player;
      if (session.state !== 'playing' || !p) break;
      const res = putScript(p, msg.name, msg.body);
      if (!res.ok) session.send({ t: 'error', msg: res.error });
      session.send({ t: 'scripts', scripts: p.scripts || {} });
      break;
    }
    case 'scripts_del': {
      rateLimit(session);
      const p = session.player;
      if (session.state !== 'playing' || !p) break;
      delScript(p, msg.name);
      session.send({ t: 'scripts', scripts: p.scripts || {} });
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
  session.send({ t: 'login_prompt', msg: 'login/register' });
}

async function doLogin(session, u, p) {
  const res = await loginAccount(u, p);
  if (!res.ok) return session.send({ t: 'error', msg: res.error });
  startAccountSession(session, res);
}

async function doRegister(session, u, p) {
  const res = await registerAccount(u, p);
  if (!res.ok) return session.send({ t: 'error', msg: res.error });
  const login = await loginAccount(u, p);
  if (!login.ok) return session.send({ t: 'error', msg: 'Account created, but login failed. Try again.' });
  startAccountSession(session, login);
}

function doTokenLogin(session, token) {
  const v = validateSession(token);
  if (!v) return session.send({ t: 'error', msg: 'Session expired. Please log in.' });
  startAccountSession(session, { accountId: v.accountId, username: v.username, token });
}

function startAccountSession(session, info) {
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

  const chars = db.prepare('SELECT id, name, race, guild, circle FROM characters WHERE account_id=? ORDER BY created_at').all(info.accountId);
  if (chars.length === 0) {
    session.state = 'charcreate';
    sendChargenMenu(session);
  } else {
    session.state = 'charselect';
    const rows = chars.map((c) => `${c.id}) ${c.name} — ${raceById(c.race).name} ${guildById(c.guild).name}, circle ${c.circle}`);
    const slots = `(${chars.length}/${MAX_CHARS} slots used${chars.length < MAX_CHARS ? ` — "new" to create another` : ''})`;
    session.send({ t: 'charselect', msg: `\nWelcome back, ${info.username}. ${slots}\nChoose a character:\n${rows.join('\n')}\n(Type the number to enter the world.)` });
  }
}

function rateLimit(session) {
  const now = Date.now();
  session.cmdTimestamps = session.cmdTimestamps.filter((t) => now - t < 1000);
  if (session.cmdTimestamps.length >= INPUT_MAX) {
    throw new Error('Input rate limit exceeded.');
  }
  session.cmdTimestamps.push(now);
}
