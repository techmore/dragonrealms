// Game Master read-only inspector: world, DB, live players, and per-player
// streams. Mounted at /api/gm/* behind the existing API auth. All endpoints
// are READ-ONLY (GET) — they never mutate game state (there's already a
// /api/debug test fixture for changing things).
// Enable with the same DR_ENABLE_API=1 flag.

import { roomById, ZONES, ROOMS } from '../data/world.js';
import { NPCS, npcById } from '../data/npcs.js';
import { ITEMS } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { GUILDS } from '../data/guilds.js';
import { RACES } from '../data/races.js';
import { SKILLS } from '../data/skills.js';
import { KHRI } from '../data/khri.js';
import { db } from './db.js';
import { loadPlayer } from './player.js';
import { validateSession } from './auth.js';

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// GM access: a bearer token that is either the DR_GM_TOKEN secret or any
// valid game account session. Without it the console is closed.
function authorized(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!m) return false;
  const token = m[1];
  if (process.env.DR_GM_TOKEN && token === process.env.DR_GM_TOKEN) return true;
  return Boolean(validateSession(token));
}

export function gmRequest(req, res, game) {
  if (!authorized(req)) return json(res, 401, { ok: false, error: 'Unauthorized — set a GM token (DR_GM_TOKEN) or log in.' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.replace(/^\/api\/gm\/?/, '').split('/').filter(Boolean);
  const which = parts[0];

  switch (which) {
    case 'summary': return gmSummary(res, game);
    case 'world': return gmWorld(res, game);
    case 'room': return gmRoom(res, game, parts[1]);
    case 'creatures': return gmCreatures(res);
    case 'npcs': return gmNpcs(res);
    case 'items': return gmItems(res);
    case 'guilds': return gmGuilds(res);
    case 'races': return gmRaces(res);
    case 'skills': return gmSkills(res);
    case 'characters': return gmCharacters(res);
    case 'player': return gmPlayer(res, game, parts[1]);
    case 'players-online': return json(res, 200, { ok: true, players: onlineView(game) });
    case 'db': return gmDb(res, game, parts[1], url.searchParams.get('q'));
    default:
      return json(res, 404, { ok: false, error: 'Unknown GM endpoint. Try /api/gm/summary' });
  }
}

function grade(g) { return g && g.badge; }

function gmSummary(res, game) {
  const online = onlineView(game);
  return json(res, 200, {
    ok: true, game: 'dragonrealms',
    rooms: Object.keys(ROOMS).length,
    zones: Object.keys(ZONES).length,
    creatures: Object.keys(CREATURES).length,
    npcs: Object.keys(NPCS).length,
    items: Object.keys(ITEMS).length,
    guilds: Object.keys(GUILDS).length,
    races: Object.keys(RACES).length,
    skills: Object.keys(SKILLS).length,
    khri: Object.keys(KHRI).length,
    accounts: db.prepare('SELECT COUNT(*) c FROM accounts').get().c,
    characters: db.prepare('SELECT COUNT(*) c FROM characters').get().c,
    playersOnline: online.length,
    online,
  });
}

function gmWorld(res, game) {
  const zones = [];
  for (const [id, z] of Object.entries(ZONES)) {
    const rooms = Object.values(ROOMS).filter((r) => r.zone === id);
    zones.push({ id, name: z.name, rooms: rooms.map((r) => ({
      id: r.id, name: r.name, exits: r.exits,
      npcs: r.npcs || [], spawns: r.spawns || [], tavern: r.tavern,
    })) });
  }
  return json(res, 200, { ok: true, zones });
}

function gmRoom(res, game, id) {
  const room = id && roomById(id);
  if (!room) return json(res, 404, { ok: false, error: `No room "${id}"` });
  const creatures = game.roomCreatures.get(room.id) || [];
  const floor = game.floorItemsIn ? game.floorItemsIn(room.id) : [];
  const present = [...game.players.values()].filter((p) => p.room === room.id).map((p) => p.name);
  return json(res, 200, {
    ok: true, room,
    zone: ZONES[room.zone],
    creatures: creatures.map((c) => ({ name: c.def.name, hp: c.hp, maxHp: c.maxHp, aggressive: c.def.aggressive })),
    players: present,
    floor: floor.map((f) => (f.corpse ? `corpse:${f.name}` : `${f.item.name}${f.qty > 1 ? ' x' + f.qty : ''}`)),
  });
}

function gmCreatures(res) {
  return json(res, 200, { ok: true, creatures: Object.entries(CREATURES).map(([id, c]) => ({
    id, name: c.name, circle: c.circle, teaches: c.teaches, aggressive: c.aggressive,
    loot: c.loot || [], gems: c.gems || [], lootTags: c.lootTags || [],
    weapon: c.weapon.skill, speed: c.weapon.speed,
  })) });
}

function gmNpcs(res) {
  return json(res, 200, { ok: true, npcs: Object.values(NPCS).map((n) => ({ id: n.id, name: n.name, role: n.role, guild: n.guild })) });
}

function gmItems(res) {
  return json(res, 200, { ok: true, items: Object.entries(ITEMS).map(([id, it]) => ({
    id, name: it.name, type: it.type, slot: it.slot || null, skill: it.skill || null,
    req: it.req || 0, value: it.value, dmg: it.dmg || null, armor: it.armor || null,
  })) });
}

function gmGuilds(res) {
  return json(res, 200, { ok: true, guilds: Object.entries(GUILDS).map(([id, g]) => ({
    id, name: g.name, magic: Boolean(g.magic), guildSkill: g.guildSkill || null,
    primary: g.primary, secondary: g.secondary, spells: (g.spells || []).length,
  })) });
}

function gmRaces(res) {
  return json(res, 200, { ok: true, races: Object.entries(RACES).map(([id, r]) => ({ id, name: r.name, stats: r.stats })) });
}

function gmSkills(res) {
  return json(res, 200, { ok: true, skills: Object.entries(SKILLS).map(([id, s]) => ({ id, name: s.name, cat: s.cat, guildSkill: s.guildSkill || null })) });
}

// Read-only DB browser: list tables, dump a table, or run a sandboxed SELECT
// (single statement, must have LIMIT, no write keywords).
function gmDb(res, game, table, q) {
  const known = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  if (!table && !q) return json(res, 200, { ok: true, tables: known });
  if (q) {
    const stmt = String(q).trim();
    if (!/^select\b/i.test(stmt)) return json(res, 400, { ok: false, error: 'Only SELECT queries are allowed.' });
    if (/;?\s*(insert|update|delete|drop|alter|attach|pragma|vacuum)\b/i.test(stmt)) {
      return json(res, 400, { ok: false, error: 'Write/DDL keywords are not allowed.' });
    }
    if (!/\blimit\s+\d+/i.test(stmt)) return json(res, 400, { ok: false, error: 'Queries must include a LIMIT.' });
    try {
      return json(res, 200, { ok: true, rows: db.prepare(stmt).all() });
    } catch (e) {
      return json(res, 400, { ok: false, error: String(e.message) });
    }
  }
  if (!known.includes(table)) return json(res, 400, { ok: false, error: `Unknown table "${table}".` });
  try {
    return json(res, 200, { ok: true, table, rows: db.prepare(`SELECT * FROM ${table} LIMIT 200`).all() });
  } catch (e) {
    return json(res, 400, { ok: false, error: String(e.message) });
  }
}

function gmCharacters(res) {
  const chars = db.prepare(`SELECT c.id, c.name, c.race, c.guild, c.circle, c.room, c.silver,
    c.hp, c.max_hp, a.username
    FROM characters c JOIN accounts a ON a.id = c.account_id ORDER BY c.created_at`)
    .all()
    .map((r) => ({ ...r }));
  return json(res, 200, { ok: true, characters: chars });
}

function gmPlayer(res, game, name) {
  if (!name) return json(res, 400, { ok: false, error: 'Provide a player name: /api/gm/player/<name>' });
  const row = db.prepare('SELECT id FROM characters WHERE lower(name)=lower(?)').get(name);
  if (!row) return json(res, 404, { ok: false, error: 'No character with that name (offline or deleted).' });
  let p = [...game.players.values()].find((x) => x.charId === row.id);
  const offline = !p;
  if (!p) p = loadPlayer(row.id);
  const combat = game.combat ? game.combat.getFor(p) : null;
  const skills = {};
  for (const [id, s] of Object.entries(p.skills)) skills[id] = { rank: s.rank, exp: s.exp };
  return json(res, 200, {
    ok: true, offline,
    player: {
      name: p.name, account: p.accountId, race: p.race && p.race.id, guild: p.guild && p.guild.id,
      circle: p.circle, hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana,
      innerFire: p.innerFire, stamina: p.stamina, maxStamina: p.maxStaminaEff,
      silver: p.silver, bank: p.bank, tdp: p.tdp || 0, tdpPool: p.tdpPool || 0,
      stance: p.stance, room: p.room, home: p.homeCity, hidden: p.hidden, resting: p.resting,
      abilities: p.abilities || [], techniques: p.techniques || [],
      soul: p.soul, crimeHeat: p.crimeHeat || 0,
    },
    inventory: p.inventory.map(({ item, qty }) => ({ id: item.id, name: item.name, qty })),
    equipment: Object.fromEntries(Object.entries(p.equipment).map(([s, it]) => [s, it.id])),
    skills,
    combat: combat ? { enemies: combat.aliveEnemies.map((e) => ({ name: e.def.name, hp: e.hp, range: e.range })) } : null,
  });
}

function onlineView(game) {
  return [...game.players.values()].map((p) => ({
    name: p.name, race: p.race.id, guild: p.guild.id, circle: p.circle,
    room: p.room, hp: p.hp, inCombat: Boolean(p.combatId),
  }));
}
