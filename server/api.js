// Secure HTTP API for automated testing / analysis.
// Enabled with DR_ENABLE_API=1. Reuses the game's scrypt auth + session
// tokens (Authorization: Bearer <token>). JSON in, JSON out, rate-limited,
// body-size-capped, per-account scoped. Never serves unauthenticated state.
import { registerAccount, loginAccount, validateSession, logoutSession } from './auth.js';
import { createCharacter, loadPlayer, addItem, MAX_CHARS } from './player.js';
import { raceById } from '../data/races.js';
import { guildById } from '../data/guilds.js';
import { roomById } from '../data/world.js';
import { db } from './db.js';
import { handleCommand } from './commands/index.js';

const COMMANDS_PER_SEC = 20;
const MAX_BODY = 16 * 1024;

const apiSessions = new Map(); // token -> {token, accountId, username, player, cmdTimes}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function bearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

function apiSession(req) {
  const token = bearer(req);
  if (!token) return null;
  const v = validateSession(token);
  if (!v) return null;
  let s = apiSessions.get(token);
  if (!s) {
    s = { token, accountId: v.accountId, username: v.username, player: null, cmdTimes: [] };
    apiSessions.set(token, s);
  }
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
  const sock = { readyState: 1, msgs: [] };
  sock.send = (obj) => sock.msgs.push(typeof obj === 'string' ? JSON.parse(obj) : obj);
  return sock;
}

function charsFor(accountId) {
  return db.prepare('SELECT id, name, race, guild, circle FROM characters WHERE account_id=? ORDER BY created_at')
    .all(accountId)
    .map((c) => ({
      charId: c.id, name: c.name, race: c.race, guild: c.guild, circle: c.circle,
    }));
}

function apiState(game, p) {
  const room = roomById(p.room);
  const combat = game.combat.getFor(p);
  const skills = {};
  for (const [id, s] of Object.entries(p.skills)) skills[id] = { rank: s.rank, exp: s.exp };
  return {
    player: {
      name: p.name, race: p.race.id, guild: p.guild.id, circle: p.circle,
      hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana,
      silver: p.silver, bank: p.bank, tdp: p.tdp || 0, stance: p.stance,
      room: p.room, heldMana: p.heldMana || 0, prepared: p.prepared || null,
      buffs: p.buffs || {}, unspentStat: p.unspentStat,
    },
    room: room
      ? { id: room.id, zone: room.zone, name: room.name, desc: room.desc, npcs: room.npcs || [], exits: room.exits }
      : null,
    inventory: p.inventory.map(({ item, qty }) => ({ id: item.id, name: item.name, qty })),
    equipment: Object.fromEntries(Object.entries(p.equipment).map(([slot, item]) => [slot, item.id])),
    floor: game.floorItemsIn(p.room).map((f) => (f.corpse
      ? { corpse: true, name: f.name, items: f.items.map((i) => ({ id: i.id, qty: i.qty })), equipment: f.equipment.map((e) => e.id) }
      : { item: f.item.id, name: f.item.name, qty: f.qty })),
    skills,
    combat: combat
      ? {
          enemies: combat.aliveEnemies.map((e) => ({ name: e.name, hp: e.hp, circle: e.def.circle, timer: e.timer })),
          playerTarget: combat.playerTarget || null,
          playerTimer: combat.playerTimer,
        }
      : null,
    quest: p.quest ? { creatureId: p.quest.creatureId, count: p.quest.count, done: p.quest.done } : null,
  };
}

function enterWorld(game, s, charId) {
  const p = loadPlayer(charId);
  p.online = true;
  p.ws = virtualSocket();
  p.corpses = [];
  s.player = p;
  game.addPlayer(p);
  const r = raceById(p.race.id);
  p.ws.msgs.push({ t: 'enter', msg: `\nYou are ${p.name}, a ${r.name} of the ${p.guild.name} guild.` });
  game.look(p);
  game.status(p);
  return p;
}

export async function apiRequest(req, res, game) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, '') || '/api';
  const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
  if (body === null) return json(res, 400, { ok: false, error: 'Malformed JSON body (max 16KB).' });

  // ---- Public endpoints ----
  if (path === '/api/health' && req.method === 'GET') {
    return json(res, 200, { ok: true, service: 'dragonrealms-test-api', players: game.players.size });
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
  const s = apiSession(req);
  if (!s) return json(res, 401, { ok: false, error: 'Missing or invalid token.' });

  switch (`${req.method} ${path}`) {
    case 'POST /api/logout': {
      logoutSession(s.token);
      apiSessions.delete(s.token);
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
        character: { name: p.name, race: p.race.id, guild: p.guild.id, circle: p.circle, unspentStat: p.unspentStat },
      });
    }
    case 'POST /api/enter': {
      const row = db.prepare('SELECT id FROM characters WHERE id=? AND account_id=?').get(Number(body.charId), s.accountId);
      if (!row) return json(res, 404, { ok: false, error: 'Not a valid character for this account.' });
      const p = enterWorld(game, s, row.id);
      return json(res, 200, { ok: true, messages: p.ws.msgs, state: apiState(game, p) });
    }
    case 'POST /api/command': {
      if (!s.player || !game.players.has(s.player.charId)) {
        return json(res, 200, { ok: false, error: 'No active character. POST /api/enter first.' });
      }
      if (!rateLimit(s)) return json(res, 429, { ok: false, error: 'Rate limit exceeded (20 commands/sec).' });
      const p = s.player;
      p.ws.msgs = [];
      handleCommand(game, p, String(body.command || ''));
      return json(res, 200, { ok: true, messages: p.ws.msgs, state: apiState(game, p) });
    }
    case 'GET /api/state': {
      if (!s.player || !game.players.has(s.player.charId)) {
        return json(res, 200, { ok: false, error: 'No active character. POST /api/enter first.' });
      }
      return json(res, 200, { ok: true, state: apiState(game, s.player) });
    }
    case 'POST /api/debug': {
      // Test-only fixture endpoint: arrange deterministic states for analysis.
      const p = s.player;
      if (!p || !game.players.has(p.charId)) {
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
      return json(res, 200, { ok: true, state: apiState(game, p) });
    }
    default:
      return json(res, 404, { ok: false, error: 'Unknown API endpoint.' });
  }
}
