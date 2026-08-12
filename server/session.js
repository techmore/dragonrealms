// WebSocket session handling: login, chargen, and game command routing.
import { WebSocketServer } from 'ws';
import {
  registerAccount, loginAccount, validateSession, logoutSession, pruneExpiredSessions, normalizeName,
} from './auth.js';
import { createCharacter, loadPlayer, STAT_NAMES, MAX_STAT, MAX_CHARS } from './player.js';
import { RACES, raceById } from '../data/races.js';
import { GUILDS, guildById } from '../data/guilds.js';
import { db } from './db.js';
import { handleCommand } from './commands.js';

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

function doCharSelect(session, id) {
  if (session.state !== 'charselect') return;
  if (String(id).toLowerCase() === 'new') {
    session.state = 'charcreate';
    return sendChargenMenu(session);
  }
  const idNum = parseInt(id, 10);
  const row = db.prepare('SELECT id FROM characters WHERE id=? AND account_id=?').get(idNum, session.accountId);
  if (!row) return session.send({ t: 'error', msg: 'Not a valid character.' });
  enterWorld(session, row.id);
}

function sendChargenMenu(session) {
  const races = Object.values(RACES).map((r) => `${r.id} - ${r.name}: ${r.desc}`).join('\n');
  const guilds = Object.values(GUILDS).map((g) => `${g.id} - ${g.name}: ${g.desc}`).join('\n');
  session.send({
    t: 'charcreate',
    msg: `\nYou are a new soul in the Crossing.\n\n\x1b[1mChoose a race:\x1b[0m\n${races}\n\n\x1b[1mChoose a guild:\x1b[0m\n${guilds}\n\nName, race, and guild can be sent as: charcreate {name, race, guild}.`,
  });
}

function doCharCreate(session, name, race, guild) {
  if (session.state !== 'charcreate') return;
  const g = guildById(guild);
  const r = raceById(race);
  if (!r) return session.send({ t: 'error', msg: 'Unknown race. Try: human, dwarf, elf, elothean, gnome, gortog, giantman, halfling, kaldar, prydaen, rakash, skra.' });
  if (!g) return session.send({ t: 'error', msg: `Unknown guild. Try: ${Object.keys(GUILDS).join(', ')}` });

  let charId;
  try {
    charId = createCharacter(session.accountId, { name, race, guild });
  } catch (e) {
    return session.send({ t: 'error', msg: e.message });
  }

  const p = loadPlayer(charId);
  p.online = true;
  p.ws = session.socket;
  session.player = p;
  session.state = 'charcreate_playing';
  session.send({ t: 'notice', msg: `\nCharacter "${p.name}" created. You have ${p.unspentStat} unspent attribute points (base 35 per stat + racial bonuses). Allocate them now with "alloc <stat> <amount>", or type "enter" to begin with what you have.` });
  session.send({ t: 'charalloc', msg: allocPanel(p) });
}

function doAlloc(session, stat, amt) {
  if (session.state !== 'playing' && session.state !== 'charcreate_playing') return;
  const p = session.player;
  if (!p) return;
  const s = String(stat || '').toLowerCase();
  if (!STAT_NAMES.includes(s)) return session.send({ t: 'error', msg: `Unknown stat. Choose: ${STAT_NAMES.join(', ')}` });
  let n = parseInt(amt, 10);
  if (!n || n < 1) return session.send({ t: 'error', msg: 'Amount must be a positive number.' });
  if (p.unspentStat < n) return session.send({ t: 'error', msg: `You only have ${p.unspentStat} unspent points.` });
  const space = MAX_STAT - p.stats[s];
  const spend = Math.min(n, space);
  p.unspentStat -= spend;
  p.stats[s] += spend;
  if (session.state === 'charcreate_playing') session.send({ t: 'charalloc', msg: allocPanel(p) });
}

function allocPanel(p) {
  return `\n${p.name} — ${p.race.name} ${p.guild.name}\n` +
    STAT_NAMES.map((s) => `  ${pad(s.toUpperCase(), 3)} ${p.stats[s]}`).join('\n') +
    `\nUnspent points: ${p.unspentStat}\nSend "alloc <stat> <amount>" to spend, or "enter" to begin.`;
}

function doEnter(session) {
  if (session.state !== 'charcreate_playing') return;
  const p = session.player;
  if (p.unspentStat > 0) {
    session.send({ t: 'notice', msg: `Note: ${p.unspentStat} unspent point(s) remain. You can allocate them later with "alloc".` });
  }
  session.state = 'playing';
  enterWorld(session, p.charId);
}

function enterWorld(session, charId) {
  const p = loadPlayer(charId);
  p.online = true;
  p.ws = session.socket;
  p.corpses = [];
  session.player = p;
  session.state = 'playing';
  session.game.addPlayer(p);

  const r = raceById(p.race.id);
  session.send({
    t: 'enter',
    msg: `\nYou are ${p.name}, a ${r.name} of the ${p.guild.name} guild.\nThe Crossing stretches before you. Type "help" for commands.`,
  });
  session.game.look(p);
  session.game.status(p);
}

function rateLimit(session) {
  const now = Date.now();
  session.cmdTimestamps = session.cmdTimestamps.filter((t) => now - t < 1000);
  if (session.cmdTimestamps.length >= INPUT_MAX) {
    throw new Error('Input rate limit exceeded.');
  }
  session.cmdTimestamps.push(now);
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
