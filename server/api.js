// Secure HTTP API for automated testing / analysis.
// Enabled with DR_ENABLE_API=1. Reuses the game's scrypt auth + session
// tokens (Authorization: Bearer <token>). JSON in, JSON out, rate-limited,
// body-size-capped, per-account scoped. Unauthenticated routes are limited to
// service health and account bootstrap; all world/player state requires a token.
import { registerAccount, loginAccount, validateSession, logoutSession } from './auth.js';
import { createCharacter, loadPlayer, addItem, MAX_CHARS, charsFor, roundtimeLeft } from './player.js';
import { raceById } from '../data/races.js';
import { roomById } from '../data/world.js';
import { itemById } from '../data/items.js';
import { expToNextRank } from '../data/skills.js';
import { circleRequirements } from '../data/guilds.js';
import { db } from './db.js';
import { handleCommand } from './commands/index.js';
import { bearerToken, headerToken, secretMatches } from './http-auth.js';
import { consumeCommandBudget, COMMANDS_PER_SECOND } from './command-budget.js';
import { registerRuntimeCleanup } from './runtime-resources.js';

const COMMANDS_PER_SEC = COMMANDS_PER_SECOND;
export const API_SESSION_IDLE_MS = 15 * 60 * 1000;
export const API_MESSAGE_LIMIT = 512;
const MAX_BODY = 16 * 1024;
const API_VERSION = 1;

// API runtime sessions belong to a specific Game instance. Keeping them in a
// per-game map prevents a token used by a test/secondary server from retaining
// or controlling a Player object owned by another world.
const apiSessionsByGame = new WeakMap();

function sessionsFor(game) {
  let sessions = apiSessionsByGame.get(game);
  if (!sessions) {
    sessions = new Map();
    apiSessionsByGame.set(game, sessions);
    const timer = setInterval(() => reapApiSessions(game), 60_000);
    timer.unref();
    registerRuntimeCleanup(game, () => {
      clearInterval(timer);
      sessions.clear();
      apiSessionsByGame.delete(game);
    });
  }
  return sessions;
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    const finish = (value) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      resolve(value);
    };
    req.on('data', (c) => {
      if (settled) return;
      size += c.length;
      if (size > MAX_BODY) {
        finish(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        finish(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        finish(null);
      }
    });
    req.on('aborted', () => finish(null));
    req.on('error', () => finish(null));
    req.on('close', () => { if (!settled) finish(null); });
  });
}

function ownsPlayer(game, s) {
  return Boolean(s.player && game.players.get(s.player.charId) === s.player);
}

function releasePlayer(game, s) {
  const p = s.player;
  s.player = null;
  if (!p || game.players.get(p.charId) !== p) return false;
  return game.removePlayer(p);
}

export function reapApiSessions(game, now = Date.now(), currentToken = null) {
  const sessions = apiSessionsByGame.get(game);
  if (!sessions) return;
  for (const [token, s] of sessions) {
    if (token === currentToken) continue;
    try {
      if (now - s.lastSeen < API_SESSION_IDLE_MS && validateSession(token)) continue;
      try { releasePlayer(game, s); } finally { sessions.delete(token); }
    } catch (error) { console.error('API session cleanup failed', error); }
  }
}

function apiSession(req, game) {
  const token = bearerToken(req);
  if (!token) return null;
  const sessions = sessionsFor(game);
  // Request-time checks complement the independent idle/expiry timer.
  reapApiSessions(game, Date.now(), token);
  const v = validateSession(token);
  if (!v) {
    const stale = sessions.get(token);
    if (stale) releasePlayer(game, stale);
    sessions.delete(token);
    return null;
  }
  let s = sessions.get(token);
  if (!s) {
    s = { token, accountId: v.accountId, username: v.username, player: null, cmdTimes: [] };
    sessions.set(token, s);
  }
  s.lastSeen = Date.now();
  return s;
}

function rateLimit(s) {
  const now = Date.now();
  s.cmdTimes = s.cmdTimes.filter((t) => now - t < 1000);
  if (s.cmdTimes.length >= COMMANDS_PER_SEC) return false;
  s.cmdTimes.push(now);
  return true;
}

function virtualSocket() {
  const sock = { readyState: 1, msgs: [], dropped: 0 };
  sock.send = (obj) => {
    if (sock.msgs.length >= API_MESSAGE_LIMIT) { sock.msgs.shift(); sock.dropped++; }
    sock.msgs.push(typeof obj === 'string' ? JSON.parse(obj) : obj);
  };
  return sock;
}

function drainMessages(sock) {
  const result = { messages: sock.msgs, messagesDropped: sock.dropped };
  sock.msgs = [];
  sock.dropped = 0;
  return result;
}

const rankExpTotals = [0];
function absorbedExp(skill) {
  while (rankExpTotals.length <= skill.rank) {
    const rank = rankExpTotals.length - 1;
    rankExpTotals.push(rankExpTotals[rank] + expToNextRank(rank));
  }
  return rankExpTotals[skill.rank] + skill.exp;
}

function apiState(game, p) {
  const room = roomById(p.room);
  const combat = game.combat.getFor(p);
  const skills = {};
  for (const [id, s] of Object.entries(p.skills)) skills[id] = {
    rank: s.rank, exp: s.exp, absorbedExp: absorbedExp(s),
    pooledExp: p.expPools?.[id] || 0, nextRankExp: expToNextRank(s.rank),
  };
  const nextCircle = (p.circle || 1) + 1;
  const req = p.guild ? circleRequirements(p.guild, p.skills, nextCircle) : null;
  return {
    player: {
      name: p.name, race: p.race.id, guild: p.guild ? p.guild.id : null, circle: p.circle,
      hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana,
      roundtimeSeconds: roundtimeLeft(p),
      abilities: p.abilities || [], innerFire: p.innerFire || 0,
      silver: p.silver, bank: p.bank, tdp: p.tdp || 0, stance: p.stance,
      wounds: (p.wounds || []).filter((w) => !w.resolved),
      room: p.room, heldMana: p.heldMana || 0, prepared: p.prepared || null,
      buffs: p.buffs || {}, unspentStat: p.unspentStat,
    },
    room: room
      ? { id: room.id, zone: room.zone, name: room.name, desc: room.desc, npcs: room.npcs || [], exits: room.exits }
      : null,
    inventory: p.inventory.map(({ item, qty }) => ({ id: item.id, name: item.name, qty })),
    skinnable: (p.corpses || []).filter(c => !c.decayedAt || c.decayedAt > Date.now())
      .map(c => ({ id: c.def.id, name: c.def.name })),
    shopStock: game.shopNpcsIn(p).flatMap(shop => Object.entries(shop.stock || {})
      .flatMap(([id, quantity]) => {
        const item = itemById(id);
        return item ? [{ id, quantity, price: item.value }] : [];
      })),
    equipment: Object.fromEntries(Object.entries(p.equipment).map(([slot, item]) => [slot, item.id])),
    floor: game.floorItemsIn(p.room).map((f) => (f.corpse
      ? { corpse: true, name: f.name, items: f.items.map((i) => ({ id: i.id, qty: i.qty })), equipment: f.equipment.map((e) => e.id) }
      : { item: f.item.id, name: f.item.name, qty: f.qty })),
    skills,
    experience: {
      absorbed: Object.values(skills).reduce((sum, s) => sum + s.absorbedExp, 0),
      pooled: Object.values(skills).reduce((sum, s) => sum + s.pooledExp, 0),
    },
    requirements: req ? { circle: nextCircle, ok: req.ok, rows: req.rows || [], missing: req.missing || [] } : null,
    combat: combat
      ? {
          enemies: combat.aliveEnemies.map((e) => ({ name: e.name, hp: e.hp, circle: e.def.circle, timer: e.timer })),
          playerTarget: combat.playerTarget || null,
          playerTimer: combat.playerTimer,
          dragonTicks: combat.dragonTicks || 0,
        }
      : null,
    quest: p.quest ? { creatureId: p.quest.creatureId, count: p.quest.count, done: p.quest.done } : null,
  };
}

function enterWorld(game, s, charId) {
  const active = game.players.get(charId);
  if (active && active !== s.player) {
    return {
      ok: false,
      error: 'That character is already active in another session. Log it out before trying again.',
    };
  }

  if (active === s.player) {
    active.ws.msgs = [];
    return { ok: true, player: active };
  }

  // Availability is checked before releasing the old character, so a failed
  // switch leaves the caller's current character intact.
  releasePlayer(game, s);
  const p = loadPlayer(charId);
  p.ws = virtualSocket();
  if (!game.addPlayer(p)) {
    return {
      ok: false,
      error: 'That character is already active in another session. Log it out before trying again.',
    };
  }
  s.player = p;
  const r = raceById(p.race.id);
  p.ws.msgs.push({
    t: 'enter',
    msg: p.guild
      ? `\nYou are ${p.name}, a ${r.name} of the ${p.guild.name} guild.`
      : `\nYou are ${p.name}, a ${r.name} guildless. Find a calling before a hall's leader ("dir list guilds", "dir barbarian", then "join barbarian" at the hall).`,
  });
  game.look(p);
  game.status(p);
  return { ok: true, player: p };
}

export async function apiRequest(req, res, game, {
  debugApiEnabled = process.env.DR_ENABLE_DEBUG_API === '1',
  debugToken = process.env.DR_DEBUG_TOKEN,
} = {}) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, '') || '/api';
  const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
  if (body === null) return json(res, 400, { ok: false, error: 'Malformed JSON body (max 16KB).' });

  // ---- Public endpoints ----
  // Health intentionally exposes service metadata only. Roster details belong
  // behind the authenticated API/GM surfaces, not on an unauthenticated URL.
  if (path === '/api/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'dragonrealms-test-api',
      apiVersion: API_VERSION,
      uptimeMs: Math.max(0, Date.now() - (game.uptimeAt || Date.now())),
    });
  }
  if (path === '/api/register' && req.method === 'POST') {
    const reg = await registerAccount(String(body.user || ''), String(body.pass || ''));
    if (!reg.ok) return json(res, 200, { ok: false, error: reg.error });
    const login = await loginAccount(String(body.user), String(body.pass));
    if (!login.ok) return json(res, 200, { ok: false, error: 'Account created, but login failed.' });
    return json(res, 200, { ok: true, token: login.token, username: login.username, characters: charsFor(login.accountId) });
  }
  if (path === '/api/login' && req.method === 'POST') {
    const login = await loginAccount(String(body.user || ''), String(body.pass || ''));
    if (!login.ok) return json(res, 200, { ok: false, error: login.error });
    return json(res, 200, { ok: true, token: login.token, username: login.username, characters: charsFor(login.accountId) });
  }

  // ---- Authenticated endpoints ----
  const s = apiSession(req, game);
  if (!s) return json(res, 401, { ok: false, error: 'Missing or invalid token.' });

  switch (`${req.method} ${path}`) {
    case 'POST /api/logout': {
      // A failed character save must not skip credential revocation.
      try { releasePlayer(game, s); }
      finally {
        try { logoutSession(s.token); }
        finally { sessionsFor(game).delete(s.token); }
      }
      return json(res, 200, { ok: true });
    }
    case 'GET /api/characters': {
      return json(res, 200, { ok: true, characters: charsFor(s.accountId), maxCharacters: MAX_CHARS });
    }
    case 'POST /api/characters': {
      let charId;
      try {
        charId = createCharacter(s.accountId, { name: body.name, race: body.race, guild: body.guild, city: body.city });
      } catch (e) {
        return json(res, 200, { ok: false, error: e.message });
      }
      const p = loadPlayer(charId);
      return json(res, 200, {
        ok: true, charId,
        character: { name: p.name, race: p.race.id, guild: p.guild ? p.guild.id : null, circle: p.circle, unspentStat: p.unspentStat },
      });
    }
    case 'POST /api/enter': {
      const row = db.prepare('SELECT id FROM characters WHERE id=? AND account_id=?').get(Number(body.charId), s.accountId);
      if (!row) return json(res, 404, { ok: false, error: 'Not a valid character for this account.' });
      const entered = enterWorld(game, s, row.id);
      if (!entered.ok) return json(res, 409, entered);
      const p = entered.player;
      return json(res, 200, { ok: true, ...drainMessages(p.ws), state: apiState(game, p) });
    }
    case 'POST /api/command': {
      if (!ownsPlayer(game, s)) {
        return json(res, 200, { ok: false, error: 'No active character. POST /api/enter first.' });
      }
      if (!rateLimit(s)) return json(res, 429, { ok: false, error: 'Rate limit exceeded (20 commands/sec).' });
      const p = s.player;
      // Preserve pending asynchronous messages; the bounded inbox drains once
      // with this response instead of silently dropping them before dispatch.
      // HTTP drivers are real player sessions too; enforce the same
      // roundtime policy as WebSocket input.
      handleCommand(game, p, String(body.command || ''), 0, {
        applyRT: true, consumeCommand: () => consumeCommandBudget(s),
      });
      return json(res, 200, { ok: true, ...drainMessages(p.ws), state: apiState(game, p) });
    }
    case 'GET /api/state': {
      if (!ownsPlayer(game, s)) {
        return json(res, 200, { ok: false, error: 'No active character. POST /api/enter first.' });
      }
      return json(res, 200, { ok: true, ...drainMessages(s.player.ws), state: apiState(game, s.player) });
    }
    case 'POST /api/debug': {
      // Test-only fixture endpoint. It requires both a game-account session
      // (validated above) and a distinct debug service secret.
      if (!debugApiEnabled) return json(res, 404, { ok: false, error: 'Unknown API endpoint.' });
      if (typeof debugToken !== 'string' || debugToken.length === 0) {
        return json(res, 503, { ok: false, error: 'Debug API is enabled but DR_DEBUG_TOKEN is not configured.' });
      }
      if (!secretMatches(headerToken(req, 'x-dr-debug-token'), debugToken)) {
        return json(res, 403, { ok: false, error: 'A valid debug credential is required.' });
      }
      // Fixture effects must reach the character even when it is bound to a
      // WS session rather than this HTTP session (mapper/bot drivers). Find
      // the account's active player anywhere in the game.
      let p = s.player && ownsPlayer(game, s) ? s.player : null;
      if (!p) {
        for (const cand of game.players.values()) {
          if (cand.accountId === s.accountId) { p = cand; break; }
        }
      }
      if (!p) {
        return json(res, 200, { ok: false, error: 'No active character. POST /api/enter first.' });
      }
      const d = body || {};
      if (typeof d.hp === 'number') p.hp = Math.max(0, Math.min(d.hp, p.maxHp));
      if (typeof d.mana === 'number') p.mana = Math.max(0, Math.min(d.mana, p.maxMana));
      if (typeof d.silver === 'number') p.silver = Math.max(0, Math.floor(d.silver));
      if (typeof d.bank === 'number') p.bank = Math.max(0, Math.floor(d.bank));
      if (d.room && roomById(d.room)) p.room = d.room;
      if (Array.isArray(d.addItems)) {
        for (const it of d.addItems) addItem(p, String(it.id), Math.max(1, Math.floor(Number(it.qty) || 1)));
      }
      if (d.setSkills && typeof d.setSkills === 'object') {
        for (const [id, rank] of Object.entries(d.setSkills)) {
          if (p.skills[id]) p.skills[id].rank = Math.max(0, Math.floor(Number(rank) || 0));
        }
      }
      if (d.clearCombat && game.combat.getFor(p)) {
        game.combat.end(p, game.combat.getFor(p), { win: false, fled: true });
      }
      if (d.die) {
        game.combat.handleDeath(p);
      }
      game.persistPlayer(p); // fixture effects must survive re-entry
      return json(res, 200, { ok: true, state: apiState(game, p) });
    }
    default:
      return json(res, 404, { ok: false, error: 'Unknown API endpoint.' });
  }
}
