// Game Master read-only inspector: world, DB, live players, and per-player
// streams. Mounted at /api/gm/* behind a dedicated GM secret. A normal game
// session is deliberately never sufficient. Enable with DR_ENABLE_API=1 and
// configure DR_GM_TOKEN.

import { roomById, ZONES, ROOMS } from '../data/world.js';
import { addressOf } from '../data/grid.js';
import { NPCS, npcById } from '../data/npcs.js';
import { ITEMS } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { GUILDS } from '../data/guilds.js';
import { RACES } from '../data/races.js';
import { SKILLS } from '../data/skills.js';
import { KHRI } from '../data/khri.js';
import { db } from './db.js';
import { loadPlayer } from './player.js';
import { bearerToken, secretMatches } from './http-auth.js';

const SENSITIVE_DB_TABLES = new Set(['accounts', 'sessions']);
const SENSITIVE_DB_IDENTIFIERS = new Set(['accounts', 'sessions', 'pass_hash', 'salt', 'token']);
const MAX_DB_ROWS = 500;

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

export function isGmToken(token, configuredToken = process.env.DR_GM_TOKEN) {
  return secretMatches(token, configuredToken);
}

export function gmRequest(req, res, game, { gmToken = process.env.DR_GM_TOKEN } = {}) {
  const supplied = bearerToken(req);
  if (!supplied) return json(res, 401, { ok: false, error: 'Missing GM bearer token.' });
  if (typeof gmToken !== 'string' || gmToken.length === 0) {
    return json(res, 503, { ok: false, error: 'GM access is not configured.' });
  }
  if (!isGmToken(supplied, gmToken)) {
    return json(res, 403, { ok: false, error: 'This credential is not authorized for GM access.' });
  }
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
    case 'characters-delete': return gmCharactersDelete(req, res, game);
    case 'highscores': return gmHighScores(res, url);
    case 'player': return gmPlayer(res, game, parts[1]);
    case 'players-online': return json(res, 200, { ok: true, players: onlineView(game) });
    case 'admin': return gmAdmin(res, game, parts[1]);
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
      id: r.id, name: r.name, exits: r.exits, address: addressOf(r.id),
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
    ok: true, room, address: addressOf(room.id),
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

// Read-only DB browser: authentication tables are absent from both the table
// browser and the deliberately conservative SELECT surface. Queries may read
// normal game tables, but may not use CTEs, subqueries, compound SELECTs,
// SQLite internals, or more than MAX_DB_ROWS rows.
function gmDb(res, game, table, q) {
  const known = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map((r) => r.name);
  const browsable = known.filter((name) => !SENSITIVE_DB_TABLES.has(name.toLowerCase()));
  if (!table && !q) return json(res, 200, { ok: true, tables: browsable });
  if (q) {
    const stmt = String(q).trim();
    const validation = validateSelect(stmt, new Set(browsable.map((name) => name.toLowerCase())));
    if (!validation.ok) return json(res, validation.forbidden ? 403 : 400, { ok: false, error: validation.error });
    try {
      return json(res, 200, { ok: true, rows: db.prepare(stmt).all() });
    } catch (e) {
      return json(res, 400, { ok: false, error: String(e.message) });
    }
  }
  if (SENSITIVE_DB_TABLES.has(String(table).toLowerCase())) {
    return json(res, 403, { ok: false, error: 'That table contains authentication secrets and cannot be browsed.' });
  }
  if (!browsable.includes(table)) return json(res, 400, { ok: false, error: `Unknown table "${table}".` });
  try {
    const identifier = `"${table.replaceAll('"', '""')}"`;
    return json(res, 200, { ok: true, table, rows: db.prepare(`SELECT * FROM ${identifier} LIMIT 200`).all() });
  } catch (e) {
    return json(res, 400, { ok: false, error: String(e.message) });
  }
}

function validateSelect(sql, allowedTables) {
  let tokens;
  try {
    tokens = sqlTokens(sql);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const words = tokens.filter((t) => t.type === 'word').map((t) => t.value.toLowerCase());
  if (words[0] !== 'select') return { ok: false, error: 'Only SELECT queries are allowed.' };
  if (tokens.some((t) => t.value === ';')) return { ok: false, error: 'Queries must contain exactly one statement.' };
  if (words.filter((word) => word === 'select').length !== 1 || words.some((word) => ['with', 'union', 'intersect', 'except'].includes(word))) {
    return { ok: false, error: 'CTEs, subqueries, and compound SELECTs are not allowed.' };
  }
  if (words.some((word) => ['insert', 'update', 'delete', 'drop', 'alter', 'attach', 'detach', 'pragma', 'vacuum', 'reindex', 'analyze'].includes(word))) {
    return { ok: false, error: 'Write, DDL, and PRAGMA keywords are not allowed.' };
  }
  if (words.some((word) => SENSITIVE_DB_IDENTIFIERS.has(word))) {
    return { ok: false, forbidden: true, error: 'Authentication tables and secret columns cannot be queried.' };
  }
  if (words.some((word) => word.startsWith('sqlite_') || word.startsWith('pragma_'))) {
    return { ok: false, forbidden: true, error: 'SQLite internals cannot be queried.' };
  }

  const relationIndexes = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type === 'word' && ['from', 'join'].includes(tokens[i].value.toLowerCase())) relationIndexes.push(i + 1);
  }
  for (const index of relationIndexes) {
    const relation = relationAt(tokens, index);
    if (!relation || !allowedTables.has(relation)) {
      return { ok: false, forbidden: true, error: 'Queries may only read browsable game tables.' };
    }
  }

  // A top-level comma after FROM is an implicit join. Refuse it rather than
  // risk accepting a second relation that bypasses the explicit JOIN check.
  const fromIndex = tokens.findIndex((t) => t.type === 'word' && t.value.toLowerCase() === 'from');
  if (fromIndex >= 0) {
    let depth = 0;
    for (let i = fromIndex + 1; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.value === '(') depth += 1;
      if (token.value === ')') depth -= 1;
      if (depth === 0 && token.type === 'word' && ['where', 'group', 'order', 'having', 'limit'].includes(token.value.toLowerCase())) break;
      if (depth === 0 && token.value === ',') {
        return { ok: false, error: 'Use explicit JOIN syntax instead of comma joins.' };
      }
    }
  }

  const limitIndex = tokens.findLastIndex((t) => t.type === 'word' && t.value.toLowerCase() === 'limit');
  const limit = limitIndex >= 0 && tokens[limitIndex + 1]?.type === 'number'
    ? Number(tokens[limitIndex + 1].value) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 0) return { ok: false, error: 'Queries must include a numeric LIMIT.' };
  if (limit > MAX_DB_ROWS) return { ok: false, error: `LIMIT cannot exceed ${MAX_DB_ROWS}.` };
  const afterLimit = tokens.slice(limitIndex + 2);
  if (afterLimit.length && !(
    afterLimit.length === 2
    && afterLimit[0].type === 'word'
    && afterLimit[0].value.toLowerCase() === 'offset'
    && afterLimit[1].type === 'number'
  )) return { ok: false, error: 'LIMIT must be the final clause (optionally followed by a numeric OFFSET).' };
  return { ok: true };
}

function relationAt(tokens, start) {
  const first = tokens[start];
  if (!first || first.type !== 'word') return null;
  if (tokens[start + 1]?.value === '.') {
    if (first.value.toLowerCase() !== 'main' || tokens[start + 2]?.type !== 'word') return null;
    return tokens[start + 2].value.toLowerCase();
  }
  return first.value.toLowerCase();
}

function sqlTokens(sql) {
  const tokens = [];
  for (let i = 0; i < sql.length;) {
    const ch = sql[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end < 0) throw new Error('Unterminated SQL comment.');
      i = end + 2;
      continue;
    }
    if (ch === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i += 1; break; }
        i += 1;
      }
      if (sql[i - 1] !== "'") throw new Error('Unterminated SQL string.');
      tokens.push({ type: 'string', value: '' });
      continue;
    }
    if (ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch;
      let value = '';
      i += 1;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === close) {
          if (close !== ']' && sql[i + 1] === close) { value += close; i += 2; continue; }
          i += 1;
          closed = true;
          break;
        }
        value += sql[i];
        i += 1;
      }
      if (!closed) throw new Error('Unterminated quoted SQL identifier.');
      tokens.push({ type: 'word', value });
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i));
    if (word) { tokens.push({ type: 'word', value: word[0] }); i += word[0].length; continue; }
    const number = /^\d+/.exec(sql.slice(i));
    if (number) { tokens.push({ type: 'number', value: number[0] }); i += number[0].length; continue; }
    tokens.push({ type: 'symbol', value: ch });
    i += 1;
  }
  return tokens;
}

function gmCharacters(res) {
  const chars = db.prepare(`SELECT c.id, c.name, c.race, c.guild, c.circle, c.room, c.silver,
    c.hp, c.max_hp, c.created_at, a.username
    FROM characters c JOIN accounts a ON a.id = c.account_id ORDER BY c.created_at`)
    .all()
    .map((r) => ({ ...r }));
  return json(res, 200, { ok: true, characters: chars });
}

// Bulk character deletion for GM housekeeping (sim/test toon cleanup). Refuses
// anything online — log it out first. Skills/inventory/equipment/etc. cascade
// via the schema's ON DELETE CASCADE foreign keys.
function gmCharactersDelete(req, res, game) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 16384) req.destroy();
  });
  req.on('end', () => {
    let ids;
    try { ids = JSON.parse(body).ids; } catch {}
    if (!Array.isArray(ids) || !ids.length || ids.some((n) => !Number.isInteger(n))) {
      return json(res, 400, { ok: false, error: 'Body must be {"ids":[<characterId,…]>}.' });
    }
    const online = new Set([...game.players.values()].map((p) => p.charId));
    const deletable = ids.filter((id) => !online.has(id));
    const skipped = ids.filter((id) => online.has(id));
    const del = db.prepare('DELETE FROM characters WHERE id = ?');
    let deleted = 0;
    for (const id of deletable) deleted += del.run(id).changes;
    console.log(`[gm] deleted ${deleted} character(s) [${deletable.join(',')}]` +
      (skipped.length ? ` (skipped online: ${skipped.join(',')})` : ''));
    return json(res, 200, { ok: true, deleted, skippedOnline: skipped });
  });
}

// High scores: characters ranked by circle, then total skill ranks. Supports
// ?page=N&perPage=M pagination and ?sort=skill for skill-rank ordering.
function gmHighScores(res, url) {
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
  const perPage = Math.min(100, Math.max(10, parseInt(url.searchParams.get('perPage'), 10) || 25));
  const sort = url.searchParams.get('sort') === 'skill' ? 'skill' : 'circle';
  const total = db.prepare('SELECT COUNT(*) c FROM characters').get().c;
  const order = sort === 'skill' ? 'ranks DESC, c.circle DESC' : 'c.circle DESC, ranks DESC';
  const rows = db.prepare(`
    SELECT c.id, c.name, c.race, c.guild, c.circle, c.silver, a.username,
      COALESCE((SELECT SUM(s.rank) FROM skills s WHERE s.character_id = c.id), 0) AS ranks
    FROM characters c JOIN accounts a ON a.id = c.account_id
    ORDER BY ${order}
    LIMIT ? OFFSET ?`).all(perPage, (page - 1) * perPage);
  return json(res, 200, { ok: true, page, perPage, total, sort, characters: rows });
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
    name: p.name, charId: p.charId, race: p.race.id, guild: p.guild.id, circle: p.circle,
    room: p.room, hp: p.hp, maxHp: p.maxHp, inCombat: Boolean(p.combatId),
  }));
}

// Admin ops surface: health/status now, plus a controlled world reload that
// persists all live players first. Mutations are intentionally minimal and
// still behind the same GM auth.
function gmAdmin(res, game, action) {
  switch (action) {
    case 'status': {
      const mem = process.memoryUsage();
      const cpu = process.cpuUsage();
      let dbBytes = null;
      try {
        const pc = db.prepare('PRAGMA page_count').get();
        const ps = db.prepare('PRAGMA page_size').get();
        if (pc && ps) dbBytes = Number(Object.values(pc)[0]) * Number(Object.values(ps)[0]);
      } catch {}
      return json(res, 200, {
        ok: true, online: true,
        players: game.players.size,
        rooms: Object.keys(ROOMS).length,
        uptimeMs: (game.uptimeAt ? Date.now() - game.uptimeAt : null),
        gmTokenConfigured: true,
        proc: {
          pid: process.pid,
          node: process.version,
          platform: `${process.platform}-${process.arch}`,
          rssBytes: mem.rss,
          heapUsedBytes: mem.heapUsed,
          cpuUserUs: cpu.user,
          cpuSystemUs: cpu.system,
        },
        dbBytes,
      });
    }
    case 'reload': {
      for (const p of [...game.players.values()]) {
        try { game.persistPlayer(p); } catch {}
      }
      let reloaded = 0;
      for (const [id, r] of Object.entries(ROOMS)) {
        game.roomCreatures.set(id, (r.spawns || []).map((sid) => {
          const def = CREATURES[sid];
          if (!def) return null;
          return { def, hp: def.circle * 14 + def.stats.con * 3 + 20, maxHp: def.circle * 14 + def.stats.con * 3 + 20, alive: true };
        }).filter(Boolean));
        reloaded += 1;
      }
      return json(res, 200, { ok: true, reloaded });
    }
    default:
      return json(res, 400, { ok: false, error: 'Unknown admin action: use status or reload.' });
  }
}
