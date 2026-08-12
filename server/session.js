// WebSocket session handling: login, chargen, and game command routing.
import { WebSocketServer } from 'ws';
import {
  registerAccount, loginAccount, validateSession, logoutSession, pruneExpiredSessions,
} from './auth.js';
import { MAX_CHARS } from './player.js';
import { raceById } from '../data/races.js';
import { guildById } from '../data/guilds.js';
import { db } from './db.js';
import { handleCommand } from './commands.js';
import { sendChargenMenu, doCharSelect, doCharCreate, doAlloc, doEnter } from './chargen.js';

const INPUT_MAX = 20; // commands per second

export function attachWebSocket(httpServer, game) {
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 4096 });

  wss.on('connection', (socket, req) => {
    const session = {
      socket,
      state: 'login',       // login | charselect | charcreate | charcreate_playing | playing
      token: null,
      accountId: null,
      username: null,
      player: null,
      charCreate: null,     // {name, race, guild, stats, pool}
      cmdTimestamps: [],
      game,
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
      if (session.player) game.removePlayer(session.player);
      if (session.token) logoutSession(session.token);
    });
  });

  setInterval(pruneExpiredSessions, 60 * 60 * 1000).unref();
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
      doCharCreate(session, msg.name, msg.race, msg.guild);
      break;
    case 'alloc':
      doAlloc(session, msg.stat, msg.amt);
      break;
    case 'enter':
      doEnter(session);
      break;
    case 'input':
      rateLimit(session);
      if (session.state === 'playing' && session.player) {
        handleCommand(session.game, session.player, msg.line);
      }
      break;
    case 'ping':
      session.send({ t: 'pong' });
      break;
    default:
      session.send({ t: 'error', msg: 'Unknown message type.' });
  }
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
