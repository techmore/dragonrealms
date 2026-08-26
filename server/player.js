// Player characters: creation, persistence, skills, inventory, equipment.
import { db } from './db.js';
import { raceById } from '../data/races.js';
import { guildById, spellsFor } from '../data/guilds.js';
import { SKILLS, expToNextRank, pulseGroupFor, mentalStatBonus } from '../data/skills.js';
import { itemById, itemWeight } from '../data/items.js';

export const BASE_STAT = 35;
export const STAT_POOL = 30;
export const MAX_STAT = 100;
export const MAX_CHARS = 5;
export const STAT_NAMES = ['str', 'con', 'ref', 'agi', 'cha', 'dis', 'wis', 'int'];

export function validName(name) {
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 20) return false;
  return /^[A-Za-z][A-Za-z' -]*$/.test(n);
}

export function baseStatsFor(raceId) {
  const race = raceById(raceId);
  const stats = {};
  for (const s of STAT_NAMES) {
    stats[s] = Math.min(MAX_STAT, Math.max(5, BASE_STAT + (race.stats[s] || 0)));
  }
  return stats;
}

export const CITIES = { crossing: 'square', riverhaven: 'rh_square' };

// Single transport seam: domain modules send player-facing lines through
// these instead of hand-building ws frames. Spectate mirroring and any
// future transport change then happen in one place. All tolerate a missing
// or closed socket (offline players, HTTP-only sessions).
export function say(p, msg, type = 'msg') {
  if (p && p.ws && typeof p.ws.send === 'function') {
    p.ws.send(JSON.stringify({ t: type, msg }));
  }
}

// Structured frames (e.g. `room` with exits/contents) that don't fit the
// {t, msg} shape. Same transport seam rules as say().
export function sayRaw(p, frame) {
  if (p && p.ws && typeof p.ws.send === 'function') {
    p.ws.send(JSON.stringify(frame));
  }
}

export function sayRoom(game, roomId, msg, exceptCharId = null) {
  for (const o of game.players.values()) {
    if (o.room === roomId && o.charId !== exceptCharId) say(o, msg);
  }
}

// Compact character summaries for char-select surfaces (WS + HTTP API).
export function charsFor(accountId) {
  return db.prepare('SELECT id, name, race, guild, circle FROM characters WHERE account_id=? ORDER BY created_at')
    .all(accountId)
    .map((c) => ({ id: c.id, charId: c.id, name: c.name, race: c.race, guild: c.guild, circle: c.circle }));
}


const PERSISTED_TIMESTAMPS = [
  'warhornAt', 'potionAt', 'scavengeAt', 'glyphAt', 'beseechAt',
  'sacrificeAt', 'telescopeAt', 'linkAt', 'slipAt', 'devoteAt',
];

function parsePersistentState(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function persistentStateFor(p) {
  const cooldowns = {};
  for (const key of PERSISTED_TIMESTAMPS) {
    if (Number.isFinite(p[key]) && p[key] > 0) cooldowns[key] = p[key];
  }
  return {
    version: 1,
    abilities: Array.isArray(p.abilities) ? p.abilities : [],
    lastForgetAt: Number.isFinite(p.lastForgetAt) ? p.lastForgetAt : 0,
    forgedQuality: p.forgedQuality && typeof p.forgedQuality === 'object' ? p.forgedQuality : {},
    crimeHeat: Number.isFinite(p.crimeHeat) ? p.crimeHeat : 0,
    jailUntil: Number.isFinite(p.jailUntil) ? p.jailUntil : 0,
    stocksUntil: Number.isFinite(p.stocksUntil) ? p.stocksUntil : 0,
    innerFire: Number.isFinite(p.innerFire) ? p.innerFire : 100,
    voice: Number.isFinite(p.voice) ? p.voice : 40,
    companion: p.companion || null,
    familiar: p.familiar || null,
    cambrinth: p.cambrinth || null,
    chafferNext: Boolean(p.chafferNext),
    wounds: Array.isArray(p.wounds) ? p.wounds : [],
    flags: p.flags && typeof p.flags === 'object' ? p.flags : {},
    scripts: p.scripts && typeof p.scripts === 'object' ? p.scripts : {},
    spellsKnown: Array.isArray(p.spellsKnown) ? p.spellsKnown : [],
    spellsForgotten: Array.isArray(p.spellsForgotten) ? p.spellsForgotten : [],
    debt: Number.isFinite(p.debt) ? p.debt : 0,
    workOrder: p.workOrder && typeof p.workOrder === 'object' ? p.workOrder : null,
    craftTechs: p.craftTechs && typeof p.craftTechs === 'object' ? p.craftTechs : {},
    sleep: SLEEP_STATES.includes(p.sleep) ? p.sleep : 'awake',
    deepSleepSince: Number.isFinite(p.deepSleepSince) ? p.deepSleepSince : null,
    cooldowns,
  };
}

// Slotted gear is individually durable and therefore never stacks. Loose
// materials, ammunition, consumables, and commodities retain the compact
// quantity-row representation used by older databases and clients.
export function isStackableItem(item) {
  return Boolean(item) && !item.slot;
}

function finiteQuality(value) {
  const quality = Number(value);
  return Number.isFinite(quality) && quality > 0 ? quality : null;
}

function finiteCondition(value) {
  const condition = Number(value);
  return Number.isFinite(condition)
    ? Math.max(20, Math.min(100, Math.round(condition)))
    : 100;
}

export function instanceMetadata(value = {}) {
  return {
    condition: finiteCondition(value.condition),
    quality: finiteQuality(value.quality),
    maker: typeof value.maker === 'string' && value.maker.trim()
      ? value.maker.trim().slice(0, 20)
      : null,
  };
}

function withInstanceMetadata(item, value = {}) {
  const metadata = instanceMetadata(value);
  return {
    ...item,
    condition: metadata.condition,
    ...(metadata.quality === null ? {} : { quality: metadata.quality }),
    ...(metadata.maker ? { maker: metadata.maker } : {}),
  };
}

export function createCharacter(accountId, { name, race, guild, city = 'crossing' }) {
  const clean = String(name || '').trim();
  if (!validName(clean)) throw new Error('Name must be 2-20 letters.');
  const existing = db.prepare('SELECT COUNT(*) AS c FROM characters WHERE account_id = ?').get(accountId).c;
  if (existing >= MAX_CHARS) throw new Error(`This account already has ${MAX_CHARS} characters. Delete one to create another.`);
  const stats = baseStatsFor(race);
  const g = guildById(guild);
  if (!raceById(race) || !g) throw new Error('Invalid race or guild.');

  const statsObj = { ...stats, unspent: STAT_POOL };
  const maxHp = 40 + stats.con * 2 + stats.str;
  const startMana = g.magic ? Math.floor(20 + stats.wis * 2 + stats.int + stats.dis) : 0;
  const startRoom = CITIES[city] || CITIES.crossing;
  const homeCity = Object.keys(CITIES).find((k) => CITIES[k] === startRoom) || 'crossing';
  const info = db.prepare(`
    INSERT INTO characters
      (account_id, name, race, guild, circle, str, con, ref, agi, cha, dis, wis, int,
       unspent_stat, mana, tdp, silver, bank, room, home_city, hp, max_hp, created_at)
    VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    accountId, clean, race, guild,
    statsObj.str, statsObj.con, statsObj.ref, statsObj.agi, statsObj.cha,
    statsObj.dis, statsObj.wis, statsObj.int,
    statsObj.unspent, startMana, 600, 150, 0, startRoom, homeCity, maxHp, maxHp, Date.now()
  );
  const charId = Number(info.lastInsertRowid);
  // Stamina is derived at load: the row's 0 means "full for your frame".
  db.prepare('UPDATE characters SET stamina = ? WHERE id = ?').run(maxStaminaFor({ stats: statsObj, circle: 1 }), charId);

  // Initialize every skill to rank 0.
  const ins = db.prepare('INSERT INTO skills (character_id, skill_id, rank, exp) VALUES (?,?,0,0)');
  for (const skillId of Object.keys(SKILLS)) ins.run(charId, skillId);

  return charId;
}

export function loadPlayer(charId) {
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(charId);
  if (!row) return null;
  const persisted = parsePersistentState(row.persistent_state);
  const cooldowns = persisted.cooldowns && typeof persisted.cooldowns === 'object'
    ? persisted.cooldowns : {};

  const player = {
    charId: row.id,
    accountId: row.account_id,
    name: row.name,
    race: raceById(row.race),
    guild: guildById(row.guild),
    circle: row.circle,
    handsDirty: true,
    stats: {
      str: row.str, con: row.con, ref: row.ref, agi: row.agi,
      cha: row.cha, dis: row.dis, wis: row.wis, int: row.int,
    },
    unspentStat: row.unspent_stat,
    mana: row.mana,
    tdp: row.tdp || 0,
    tdpPool: row.tdp_pool || 0,
    stance: row.stance || 'balanced',
    pvpStance: row.pvp_stance || 'guarded',
    rexp: row.rexp || 0,
    stamina: row.stamina ?? 0,
    warrant: (() => { try { return row.warrant ? JSON.parse(row.warrant) : null; } catch { return null; } })(),
    patron: row.patron || null,
    element: row.element || null,
    caravan: (() => { try { return row.caravan ? JSON.parse(row.caravan) : null; } catch { return null; } })(),
    empathLink: (() => { try { const l = row.link ? JSON.parse(row.link) : null; return l && l.until > Date.now() ? l : null; } catch { return null; } })(),
    achievements: (() => { try { return JSON.parse(row.achievements || '[]'); } catch { return []; } })(),
    techniques: (() => { try { return JSON.parse(row.techniques || '[]'); } catch { return []; } })(),
    soul: row.soul ?? 50,    empathicStain: row.empathic_stain || 0,
    devotion: row.devotion ?? 30,
    homeCity: row.home_city || 'crossing',
    expPools: (() => { try { return JSON.parse(row.exp_pools || '{}'); } catch { return {}; } })(),
    maxMana: guildById(row.guild).magic ? 20 + row.wis * 2 + row.int + row.dis : 0,
    silver: row.silver,
    bank: row.bank,
    room: row.room,
    hp: row.hp,
    maxHp: row.max_hp,
    skills: {},
    inventory: [],
    equipment: {},
    quest: null,
    aliases: {},
    scripts: persisted.scripts && typeof persisted.scripts === 'object' ? persisted.scripts : {},
    // Learned-spell registry. Legacy characters (and new ones) derive their
    // circle curriculum on load; from there the slot economy governs grants.
    spellsKnown: guildById(row.guild).magic
      ? spellsFor(guildById(row.guild), row.circle).map((s) => s.id)
      : [],
    spellsForgotten: Array.isArray(persisted.spellsForgotten) ? persisted.spellsForgotten : [],
    debt: Number.isFinite(persisted.debt) ? persisted.debt : 0,
    workOrder: persisted.workOrder && typeof persisted.workOrder === 'object' ? persisted.workOrder : null,
    craftTechs: persisted.craftTechs && typeof persisted.craftTechs === 'object' ? persisted.craftTechs : {},
    buffs: {},
    // Sleep state persists across logins: a character who logged off in deep
    // sleep wakes in deep sleep, and their banked deep-sleep time survives.
    sleep: SLEEP_STATES.includes(persisted.sleep) ? persisted.sleep : 'awake',
    deepSleepSince: Number.isFinite(persisted.deepSleepSince) ? persisted.deepSleepSince : null,
    // runtime
    online: false,
    ws: null,
    state: 'playing',
    combatId: null,
    caster: false,
    heldMana: 0,
    cambrinth: null,
    prepared: null,
    innerFire: Number.isFinite(persisted.innerFire) ? persisted.innerFire : 100,
    maxInnerFire: 100,
    voice: Number.isFinite(persisted.voice) ? persisted.voice : 40,
    abilities: Array.isArray(persisted.abilities) ? persisted.abilities : [],
    lastForgetAt: Number.isFinite(persisted.lastForgetAt) ? persisted.lastForgetAt : 0,
    forgedQuality: persisted.forgedQuality && typeof persisted.forgedQuality === 'object' ? persisted.forgedQuality : {},
    crimeHeat: Number.isFinite(persisted.crimeHeat) ? persisted.crimeHeat : 0,
    jailUntil: Number.isFinite(persisted.jailUntil) ? persisted.jailUntil : 0,
    stocksUntil: Number.isFinite(persisted.stocksUntil) ? persisted.stocksUntil : 0,
    companion: persisted.companion || null,
    familiar: persisted.familiar || null,
    cambrinth: persisted.cambrinth || null,
    chafferNext: Boolean(persisted.chafferNext),
    wounds: Array.isArray(persisted.wounds) ? persisted.wounds : [],
    flags: persisted.flags && typeof persisted.flags === 'object' ? persisted.flags : {},
  };
  for (const key of PERSISTED_TIMESTAMPS) {
    player[key] = Number.isFinite(cooldowns[key]) ? cooldowns[key] : 0;
  }

  const q = db.prepare('SELECT creature_id, count, done, state FROM character_quest WHERE character_id = ?').get(charId);
  if (q) {
    try {
      const state = JSON.parse(q.state || '{}');
      player.quest = state && state.kind
        ? state
        : { kind: 'kill', source: 'crier', creatureId: q.creature_id, count: q.count, done: Boolean(q.done) };
    } catch {
      player.quest = { kind: 'kill', source: 'crier', creatureId: q.creature_id, count: q.count, done: Boolean(q.done) };
    }
  }
  for (const a of db.prepare('SELECT name, command FROM aliases WHERE character_id = ?').all(charId)) {
    player.aliases[a.name] = a.command;
  }

  for (const s of db.prepare('SELECT skill_id, rank, exp FROM skills WHERE character_id = ?').all(charId)) {
    player.skills[s.skill_id] = { rank: s.rank, exp: s.exp };
  }
  for (const inv of db.prepare('SELECT id, item_id, qty, condition, quality, maker, bundle FROM inventory WHERE character_id = ? ORDER BY id').all(charId)) {
    const item = itemById(inv.item_id);
    if (!item) continue;
    if (isStackableItem(item)) {
      player.inventory.push({ id: inv.id, item, qty: inv.qty, ...(inv.bundle ? { bundle: JSON.parse(inv.bundle) } : {}) });
      continue;
    }

    // Old saves could stack multiple copies of the same weapon/armor and kept
    // one type-wide forgedQuality value. Split those rows on first load and
    // seed each legacy copy with that value. New instances are independent.
    const metadata = instanceMetadata({
      condition: inv.condition,
      quality: inv.quality ?? persisted.forgedQuality?.[item.id],
      maker: inv.maker,
    });
    const copies = Math.max(1, inv.qty || 1);
    db.prepare('UPDATE inventory SET qty=1, condition=?, quality=?, maker=? WHERE id=?')
      .run(metadata.condition, metadata.quality, metadata.maker, inv.id);
    player.inventory.push({ id: inv.id, item, qty: 1, ...metadata });
    for (let copy = 1; copy < copies; copy += 1) {
      const info = db.prepare('INSERT INTO inventory (character_id, item_id, qty, condition, quality, maker) VALUES (?,?,1,?,?,?)')
        .run(charId, item.id, metadata.condition, metadata.quality, metadata.maker);
      player.inventory.push({ id: Number(info.lastInsertRowid), item, qty: 1, ...metadata });
    }
  }
  for (const eq of db.prepare('SELECT slot, item_id, condition, quality, maker FROM equipment WHERE character_id = ?').all(charId)) {
    const item = itemById(eq.item_id);
    if (item) {
      player.equipment[eq.slot] = withInstanceMetadata(item, {
        condition: eq.condition,
        quality: eq.quality ?? persisted.forgedQuality?.[item.id],
        maker: eq.maker,
      });
    }
  }

  // Stamina is derived from Con and Fitness, then capped by what you carry.
  player.maxStamina = maxStaminaFor(player);
  player.maxStaminaEff = maxStaminaEff(player);
  if (!persisted.version && !(row.stamina > 0)) player.stamina = player.maxStaminaEff;
  else player.stamina = Math.max(0, Math.min(player.maxStaminaEff, player.stamina));

  return player;
}

// Stamina pool: Constitution and Fitness define the frame.
export function maxStaminaFor(p) {
  const fit = p.skills && p.skills.fitness ? p.skills.fitness.rank : 0;
  return Math.max(30, Math.floor(40 + p.stats.con * 2 + fit * 0.5));
}

// Burden: the total weight class of everything you carry and wear.
// Slotted gear uses its declared burden; loose carried goods (pelts, ores,
// shells) each add a fraction of a point so a full hunting pack slows you
// down like DR encumbrance without counting every coin. Bundled goods are
// compressed and count only their bundle overhead.
export function totalBurden(p) {
  let b = 0;
  for (const item of Object.values(p.equipment || {})) b += item.burden || 0;
  for (const entry of p.inventory || []) {
    if (entry.bundle) continue; // bundled stacks travel as their own item
    b += itemWeight(entry.item) * (entry.qty || 1);
  }
  return b;
}

// Effective stamina pool after burden: each burden point costs 2 pool.
export function maxStaminaEff(p) {
  return Math.max(20, maxStaminaFor(p) - netBurden(p) * 2);
}

// Strength (and the Fitness skill) raise a carry allowance: burden within
// the allowance is free. Only the excess slows you down, so a strong back
// hauls a full skinning run without penalty (DR encumbrance feel).
export function carryAllowance(p) {
  return Math.floor((p.stats.str + p.stats.con * 0.5) / 10)
    + ((p.skills.fitness ? p.skills.fitness.rank : 0) >= 20 ? 1 : 0);
}
// Burden that actually bites: total minus the STR-backed allowance, floor 0.
export function netBurden(p) {
  return Math.max(0, totalBurden(p) - carryAllowance(p));
}

export function savePlayer(p) {
  db.prepare(`
    UPDATE characters SET
      circle=?, str=?, con=?, ref=?, agi=?, cha=?, dis=?, wis=?, int=?,
      unspent_stat=?, mana=?, tdp=?, tdp_pool=?, stance=?, pvp_stance=?, rexp=?,
      stamina=?, soul=?, empathic_stain=?, devotion=?, exp_pools=?, home_city=?, silver=?, bank=?, room=?, hp=?, max_hp=?, warrant=?, patron=?, element=?, caravan=?, link=?, achievements=?, techniques=?, persistent_state=?
    WHERE id=?
  `).run(
    p.circle, p.stats.str, p.stats.con, p.stats.ref, p.stats.agi, p.stats.cha,
    p.stats.dis, p.stats.wis, p.stats.int, p.unspentStat, p.mana, p.tdp || 0,
    p.tdpPool || 0, p.stance || 'balanced', p.pvpStance || 'guarded', p.rexp || 0,
    p.stamina ?? 0, p.soul ?? 50, p.empathicStain || 0, p.devotion ?? 30,
    JSON.stringify(p.expPools || {}), p.homeCity || 'crossing',
    p.silver, p.bank, p.room, p.hp, p.maxHp, p.warrant ? JSON.stringify(p.warrant) : null,
    p.patron || null, p.element || null, p.caravan ? JSON.stringify(p.caravan) : null,
    p.empathLink ? JSON.stringify(p.empathLink) : null,
    JSON.stringify(p.achievements || []), JSON.stringify(p.techniques || []),
    JSON.stringify(persistentStateFor(p)), p.charId
  );
  const ins = db.prepare(`
    INSERT INTO skills (character_id, skill_id, rank, exp) VALUES (?,?,?,?)
    ON CONFLICT(character_id, skill_id) DO UPDATE SET rank=excluded.rank, exp=excluded.exp
  `);
  for (const [skillId, s] of Object.entries(p.skills)) ins.run(p.charId, skillId, s.rank, s.exp);

  // Persist equipment condition (durability) alongside everything else.
  for (const [slot, item] of Object.entries(p.equipment || {})) {
    const metadata = instanceMetadata(item);
    db.prepare('UPDATE equipment SET condition=?, quality=?, maker=? WHERE character_id=? AND slot=?')
      .run(metadata.condition, metadata.quality, metadata.maker, p.charId, slot);
  }
  for (const entry of p.inventory || []) {
    if (isStackableItem(entry.item)) continue;
    const metadata = instanceMetadata(entry);
    db.prepare('UPDATE inventory SET condition=?, quality=?, maker=? WHERE id=? AND character_id=?')
      .run(metadata.condition, metadata.quality, metadata.maker, entry.id, p.charId);
  }

  if (p.quest) {
    db.prepare(`
      INSERT INTO character_quest (character_id, creature_id, count, done, state) VALUES (?,?,?,?,?)
      ON CONFLICT(character_id) DO UPDATE SET creature_id=excluded.creature_id, count=excluded.count, done=excluded.done, state=excluded.state
    `).run(p.charId, p.quest.creatureId || '', p.quest.count || 0, p.quest.done ? 1 : 0, JSON.stringify(p.quest));
  } else {
    db.prepare('DELETE FROM character_quest WHERE character_id=?').run(p.charId);
  }
}

export function skillRank(p, skillId) {
  const s = p.skills[skillId];
  return s ? s.rank : 0;
}

// Mastery skills boost any same-class skill ranked below them (DR-authentic):
// Melee Mastery -> melee weapons, Missile Mastery -> ranged weapons,
// Primary Magic -> magic skillset.
const MELEE_WEAPONS = new Set([
  'small_edged', 'medium_edged', 'large_edged', 'twohanded_edged', 'blunt',
  'large_blunt', 'twohanded_blunt', 'staff', 'polearm', 'brawling',
]);
const RANGED_WEAPONS = new Set(['bow', 'crossbow', 'slings', 'thrown', 'heavy_thrown']);
const MAGIC_SKILLS = new Set([
  'attunement', 'primary_magic', 'arcana', 'augmentation', 'debilitation',
  'targeted_magic', 'offensive_magic', 'defensive_magic', 'warding_magic',
  'utility_magic', 'healing_magic', 'holy_magic', 'moon_magic', 'war_magic',
  'illusion', 'necromancy', 'sorcery', 'summoning',
]);

// Effective rank including mastery boosts (mastery applies when it is higher).
export function effectiveRank(p, skillId) {
  const own = skillRank(p, skillId);
  let mastery = 0;
  if (MELEE_WEAPONS.has(skillId)) mastery = skillRank(p, 'melee_mastery');
  else if (RANGED_WEAPONS.has(skillId)) mastery = skillRank(p, 'missile_mastery');
  else if (MAGIC_SKILLS.has(skillId)) mastery = skillRank(p, 'primary_magic');
  return Math.max(own, mastery);
}

export const MASTERY_SETS = { MELEE_WEAPONS, RANGED_WEAPONS };

// TDPs awarded when a skill reaches a new rank.
// Authentic model: each rank-up adds `rank` points to a shared hidden pool;
// every 200 pool points convert into one TDP (quadratic in rank, like DR).
export function tdpGainFor(rank) {
  return rank;
}

export const TDP_POOL_CONVERSION = 200;

// ---------------- Achievements (milestone ledger) ----------------
export const ACHIEVEMENTS = {
  first_quest: { id: 'first_quest', name: 'Errand Runner', desc: 'Complete your first quest.' },
  circle_5: { id: 'circle_5', name: 'Established', desc: 'Reach circle 5.' },
  circle_10: { id: 'circle_10', name: 'Master of the Realm', desc: 'Reach circle 10.' },
  first_cast: { id: 'first_cast', name: 'First Words', desc: 'Cast your first spell.' },
  master_arcana: { id: 'master_arcana', name: 'Deep Weaver', desc: 'Cast a circle-7+ signature spell.' },
  master_crafter: { id: 'master_crafter', name: "The Master's Touch", desc: 'Craft a masterfully-crafted piece of gear.' },
  scavenger: { id: 'scavenger', name: 'Bone Picker', desc: 'Find salvage in the Middens.' },
  nest_egg: { id: 'nest_egg', name: 'A Nest Egg', desc: 'Hold 2,000 silvers in the bank.' },
  slayer: { id: 'slayer', name: 'Hunter of the Deep', desc: 'Fell a dread knight.' },
};

export function unlockAchievement(p, id) {
  if (!ACHIEVEMENTS[id]) return false;
  p.achievements = p.achievements || [];
  if (p.achievements.includes(id)) return false;
  p.achievements.push(id);
  say(p, `\n\x1b[1mAchievement unlocked: ${ACHIEVEMENTS[id].name}!\x1b[0m (${ACHIEVEMENTS[id].desc})`);
  return true;
}

// Rested Experience (REXP): banks while logged out (2 offline minutes -> 1
// REXP) and while resting; while active, drained field exp is worth 3x ranks
// (DR-authentic) and each converting group-pulse consumes 1/3 unit (20 s).
export const REXP_CAP = 120;

export function bankRexp(p, offlineMs) {
  const gained = Math.floor(offlineMs / 120000);
  if (gained > 0) {
    p.rexp = Math.min(REXP_CAP, (p.rexp || 0) + gained);
    return gained;
  }
  return 0;
}

// ---------------- Field-exp pools (DR model) ----------------
// All field experience banks into the skill's pool; only pulses convert it
// into ranks. Pool size follows the corpus formulas by skillset placement,
// scaled by Intelligence and Discipline; a full pool is "mind lock" —
// further field exp for that skill is lost until it drains.

function guildTier(p, skillId) {
  if (p.guild?.primary?.includes(skillId)) return 'primary';
  if (p.guild?.secondary?.includes(skillId)) return 'secondary';
  return 'tertiary';
}

// Base pool size before stat scaling (docs/elanthipedia/Experience.md).
const POOL_BASE = {
  primary: (x) => (15000 * x) / (x + 900) + 1000,
  secondary: (x) => (12750 * x) / (x + 900) + 850,
  tertiary: (x) => (10500 * x) / (x + 900) + 700,
};

// Maximum bankable field exp for a skill: base-by-tier x Int/Disc scaling.
export function poolCap(p, skillId) {
  const ranks = (p.skills[skillId] || {}).rank || 0;
  const base = POOL_BASE[guildTier(p, skillId)](ranks);
  const i = mentalStatBonus(p.stats?.int ?? 10, 'int');
  const d = mentalStatBonus(p.stats?.dis ?? 10, 'disc');
  return base * ((1000 + i + d) / 1000);
}

// Fraction of the current pool converted per pulse, by tier — derived from
// the documented mind-lock-to-clear drain times (primary 40-60 min,
// secondary 50-80, tertiary 70-100) over the 200 s cycle. Low-rank
// accelerator: secondary under 50 ranks drains like primary; tertiary under
// 25 like secondary. Wisdom scales the fraction on the shared mental-stat
// curve.
const PULSE_FRACTION = { primary: 1 / 15, secondary: 1 / 19, tertiary: 1 / 25 };

export function pulseFraction(p, skillId) {
  const tier = guildTier(p, skillId);
  const rank = (p.skills[skillId] || {}).rank || 0;
  let frac = PULSE_FRACTION[tier];
  if (tier === 'secondary' && rank < 50) frac = PULSE_FRACTION.primary;
  else if (tier === 'tertiary' && rank < 25) frac = PULSE_FRACTION.secondary;
  const wis = mentalStatBonus(p.stats?.wis ?? 10, 'int');
  return Math.min(1, frac * ((1000 + wis) / 1000));
}

// Gain field experience in a skill (DR model): everything banks up to the
// pool cap. Returns ranks gained immediately — always 0; ranks move on
// pulses. Trainers and TDP spending use applyExpToSkill directly instead.
export function gainSkillExp(p, skillId, amount) {
  if (!SKILLS[skillId]) return 0;
  // Sleep gates learning: light sleep holds the mind still (pools neither
  // grow nor gain new exp), deep sleep even more so. DR Experience.md.
  if (p.sleep === 'light' || p.sleep === 'deep') return 0;
  let amt = Math.max(0, Math.floor(amount));
  if (amt <= 0) return 0;
  // Keen (swiftness draught): alchemical learning aid — +50% skill experience
  // while the effect lasts (DR-style consumable boost).
  if (p.buffs && p.buffs.keen > 0) amt = Math.floor(amt * 1.5);
  // Agent boost: test-only speed multiplier set via {t:'boost', mult:N}.
  const bm = Number(p.boostMult) || 1;
  if (bm > 1) amt = Math.floor(amt * bm);
  p.expPools = p.expPools || {};
  const room = Math.max(0, poolCap(p, skillId) - (p.expPools[skillId] || 0));
  if (room <= 0) return 0; // mind lock: the pool is full
  p.expPools[skillId] = (p.expPools[skillId] || 0) + Math.min(room, amt);
  return 0;
}

// Roundtime (DR): the seconds you must wait after an action before you may
// act again. rtUntil is epoch ms; movement and passive reads stay free.
export function setRoundtime(p, secs) {
  p.rtUntil = Date.now() + Math.max(0, Math.round(secs) || 0) * 1000;
}

export function roundtimeLeft(p) {
  const left = Math.ceil(((p.rtUntil || 0) - Date.now()) / 1000);
  return left > 0 ? left : 0;
}

// Apply raw exp to a skill's rank ladder (with TDP pool feed).
// DR caps ranks flat at 1750 for every skill — circle requirements are
// minimums, never ceilings ("nothing prevents a character from training
// skills … in excess of circle requirements", Circle.md).
export const RANK_CAP = 1750;

export function applyExpToSkill(p, s, amount) {
  s.exp += Math.max(0, Math.floor(amount));
  let leveled = 0;
  while (s.exp >= expToNextRank(s.rank) && s.rank < RANK_CAP) {
    s.exp -= expToNextRank(s.rank);
    s.rank += 1;
    leveled += 1;
    p.tdpPool = (p.tdpPool || 0) + tdpGainFor(s.rank);
    while (p.tdpPool >= TDP_POOL_CONVERSION) {
      p.tdpPool -= TDP_POOL_CONVERSION;
      p.tdp = (p.tdp || 0) + 1;
    }
  }
  return leveled;
}

// Field-exp grouping: DR's ten fixed groups (data/skills.js PULSE_GROUPS),
// one group converting per 20-second phase — full cycle 200 seconds.
export function expGroupFor(skillId) {
  return pulseGroupFor(skillId);
}

// ---------------- Sleep (DR Experience.md, REXP section) ----------------
// `sleep` once = LIGHT: stop gaining new field exp, keep draining pools,
// REXP still consumed by pulses. `sleep` again = DEEP: no gaining AND no
// draining; REXP banks at the standard 2:1 while deep. `wake` exits.
export const SLEEP_STATES = ['awake', 'light', 'deep'];

export function setSleep(p, state) {
  p.sleep = SLEEP_STATES.includes(state) ? state : 'awake';
  return p.sleep;
}

// REXP accrual for time spent in deep sleep (2 minutes awake-equivalent per
// 1 minute banked — same 2:1 ratio as offline banking).
export function bankDeepSleepRexp(p, ms) {
  if (ms <= 0) return 0;
  const gained = Math.floor(ms / 120000);
  if (gained > 0) p.rexp = Math.min(REXP_CAP, (p.rexp || 0) + gained);
  return gained;
}

// The server pulse: on each phase, only the matching group converts a
// fraction of its pools into ranks. `tick` derives from wall clock
// (stateless across restarts). Omitting tick flushes every group immediately
// (logout/save paths). REXP makes drained bits worth 3x ranks while active.
export function pulseExp(p, tick) {
  if (!p.expPools) return 0;
  // Deep sleep suspends draining entirely (DR: no gain, no drain, REXP banks).
  if (p.sleep === 'deep') return 0;
  let pulsed = 0;
  const phase = tick === undefined ? null : ((tick % 10) + 10) % 10;
  for (const [skillId, pool] of Object.entries(p.expPools)) {
    if (pool <= 0) { delete p.expPools[skillId]; continue; }
    if (phase !== null && expGroupFor(skillId) !== phase) continue;
    const s = p.skills[skillId] || (p.skills[skillId] = { rank: 0, exp: 0 });
    const drain = Math.min(pool, Math.max(1, Math.round(pool * pulseFraction(p, skillId))));
    let value = drain;
    if (p.rexp > 0) {
      value = drain * 3;
      p.rexp = Math.max(0, p.rexp - 1 / 3);
    }
    // NOTE: agent boost is NOT applied here. It multiplies field exp exactly
    // once, at gain time (gainSkillExp), so rank velocity scales linearly
    // with the multiplier. Multiplying the converted value too compounded
    // the two passes (~x400 rank velocity at boost x20), which broke the
    // benchmarks' production-relative pacing.
    p.expPools[skillId] = pool - drain;
    if (p.expPools[skillId] <= 0) delete p.expPools[skillId];
    pulsed += drain;
    applyExpToSkill(p, s, value);
  }
  return pulsed;
}

export function setAlias(p, name, command) {
  const n = String(name || '').toLowerCase();
  if (!/^[a-z0-9_]{2,20}$/.test(n)) return { ok: false, error: 'Alias names must be 2-20 letters, numbers or underscores.' };
  if (!command || !String(command).trim()) return { ok: false, error: 'Alias needs a command.' };
  db.prepare(`
    INSERT INTO aliases (character_id, name, command) VALUES (?,?,?)
    ON CONFLICT(character_id, name) DO UPDATE SET command=excluded.command
  `).run(p.charId, n, String(command).trim());
  p.aliases[n] = String(command).trim();
  return { ok: true };
}

export function removeAlias(p, name) {
  const n = String(name || '').toLowerCase();
  if (!p.aliases[n]) return { ok: false, error: 'No such alias.' };
  db.prepare('DELETE FROM aliases WHERE character_id=? AND name=?').run(p.charId, n);
  delete p.aliases[n];
  return { ok: true };
}

// ---- Per-character DR scripts (client automation, server-persisted) ----
const SCRIPT_NAME_RE = /^[a-z0-9_]{1,24}$/;
const SCRIPT_MAX_BODY = 8000;
const SCRIPT_MAX_COUNT = 50;

function writeScriptsNow(p) {
  db.prepare('UPDATE characters SET persistent_state=? WHERE id=?')
    .run(JSON.stringify(persistentStateFor(p)), p.charId);
}

export function putScript(p, name, body) {
  const n = String(name || '').toLowerCase();
  if (!SCRIPT_NAME_RE.test(n)) return { ok: false, error: 'Script names must be 1-24 letters, numbers or underscores.' };
  const text = String(body || '');
  if (!text.trim()) return { ok: false, error: 'Script needs a body.' };
  if (text.length > SCRIPT_MAX_BODY) return { ok: false, error: `Script too large (max ${SCRIPT_MAX_BODY} characters).` };
  if (!p.scripts[n] && Object.keys(p.scripts).length >= SCRIPT_MAX_COUNT) {
    return { ok: false, error: `Too many saved scripts (max ${SCRIPT_MAX_COUNT}).` };
  }
  p.scripts[n] = text;
  writeScriptsNow(p);
  return { ok: true };
}

export function delScript(p, name) {
  const n = String(name || '').toLowerCase();
  if (!p.scripts[n]) return { ok: false, error: 'No such script.' };
  delete p.scripts[n];
  writeScriptsNow(p);
  return { ok: true };
}

export function addItem(p, itemId, qty = 1, metadata = null) {
  const item = itemById(itemId);
  if (!item) return false;
  p.handsDirty = true;
  qty = Math.max(1, Math.floor(Number(qty)) || 1);
  if (isStackableItem(item)) {
    // A bundle flag merges only into an identical bundle of the same goods.
    const bundleKey = metadata && typeof metadata === 'object' && !Array.isArray(metadata) && metadata.bundle
      ? JSON.stringify(metadata.bundle) : null;
    const existing = p.inventory.find((i) => i.item.id === itemId
      && (i.bundle ? JSON.stringify(i.bundle) : null) === bundleKey);
    if (existing) {
      existing.qty += qty;
      db.prepare('UPDATE inventory SET qty=? WHERE id=?').run(existing.qty, existing.id);
    } else {
      const info = db.prepare('INSERT INTO inventory (character_id, item_id, qty) VALUES (?,?,?)')
        .run(p.charId, itemId, qty);
      const entry = { id: Number(info.lastInsertRowid), item, qty };
      if (bundleKey) entry.bundle = JSON.parse(bundleKey);
      db.prepare('UPDATE inventory SET bundle=? WHERE id=?').run(bundleKey, entry.id);
      p.inventory.push(entry);
    }
    return true;
  }

  const metadataList = Array.isArray(metadata) ? metadata : null;
  for (let copy = 0; copy < qty; copy += 1) {
    const instance = instanceMetadata(metadataList ? metadataList[copy] : metadata || {});
    const info = db.prepare('INSERT INTO inventory (character_id, item_id, qty) VALUES (?,?,?)')
      .run(p.charId, itemId, 1);
    db.prepare('UPDATE inventory SET condition=?, quality=?, maker=? WHERE id=?')
      .run(instance.condition, instance.quality, instance.maker, Number(info.lastInsertRowid));
    p.inventory.push({ id: Number(info.lastInsertRowid), item, qty: 1, ...instance });
  }
  return true;
}

// Remove concrete inventory rows and return transfer-safe payloads. Callers
// that only consume/destroy items can keep using removeItem's boolean API.
export function removeItemInstances(p, itemId, qty = 1, preferredEntry = null) {
  qty = Math.max(1, Math.floor(Number(qty)) || 1);
  const matching = p.inventory.filter((entry) => entry.item.id === itemId);
  if (!matching.length) return [];
  if (preferredEntry && matching.includes(preferredEntry)) {
    matching.splice(matching.indexOf(preferredEntry), 1);
    matching.unshift(preferredEntry);
  }

  p.handsDirty = true;
  const removed = [];
  let remaining = qty;
  for (const inv of matching) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, inv.qty);
    const payload = { id: inv.item.id, qty: take };
    if (!isStackableItem(inv.item)) Object.assign(payload, instanceMetadata(inv));
    removed.push(payload);
    inv.qty -= take;
    remaining -= take;
    if (inv.qty <= 0) {
      db.prepare('DELETE FROM inventory WHERE id=?').run(inv.id);
      p.inventory = p.inventory.filter((i) => i.id !== inv.id);
    } else {
      db.prepare('UPDATE inventory SET qty=? WHERE id=?').run(inv.qty, inv.id);
    }
  }
  return removed;
}

export function removeItem(p, itemId, qty = 1) {
  return removeItemInstances(p, itemId, qty).length > 0;
}

export function countItems(p, itemId) {
  return p.inventory
    .filter((i) => i.item.id === itemId)
    .reduce((total, inv) => total + inv.qty, 0);
}

export function equipItem(p, invEntry) {
  const item = invEntry.item;
  if (item.type === 'consumable') return { ok: false, error: 'You cannot wear that.' };
  if (item.req && p.circle < item.req) {
    return { ok: false, error: `That requires at least circle ${item.req}; you are circle ${p.circle}.` };
  }
  const slot = item.slot;
  if (!slot) return { ok: false, error: 'That cannot be equipped.' };
  const metadata = instanceMetadata(invEntry);
  const existing = p.equipment[slot];
  if (existing) {
    delete p.equipment[slot];
    db.prepare('DELETE FROM equipment WHERE character_id=? AND slot=?').run(p.charId, slot);
    addItem(p, existing.id, 1, existing);
  }
  p.equipment[slot] = withInstanceMetadata(item, metadata);
  removeItemInstances(p, item.id, 1, invEntry);
  p.handsDirty = true;
  db.prepare('INSERT INTO equipment (character_id, slot, item_id, condition, quality) VALUES (?,?,?,?,?)')
    .run(p.charId, slot, item.id, metadata.condition, metadata.quality);
  return { ok: true, slot };
}

export function unequipItem(p, slot) {
  const item = p.equipment[slot];
  if (!item) return { ok: false, error: 'Nothing equipped there.' };
  delete p.equipment[slot];
  db.prepare('DELETE FROM equipment WHERE character_id=? AND slot=?').run(p.charId, slot);
  addItem(p, item.id, 1, item);
  p.handsDirty = true;
  return { ok: true, item };
}

export function weaponOf(p) {
  return p.equipment.hand && p.equipment.hand.type === 'weapon' ? p.equipment.hand : null;
}

// ---------------- Durability (wear and tear) ----------------
// Gear works at reduced power below full condition; repair restores it.
export function conditionMult(item) {
  return item ? 0.6 + 0.4 * ((item.condition ?? 100) / 100) : 1;
}

export function qualityMult(item) {
  return finiteQuality(item?.quality) || 1;
}

// A piece of equipped gear takes wear; it cannot fall below 20 ("well-worn").
export function wearCondition(p, slot, chance) {
  const item = p.equipment[slot];
  if (!item) return;
  if ((item.condition ?? 100) <= 20) return;
  if (Math.random() < chance) item.condition = (item.condition ?? 100) - 1;
}

export function totalArmor(p) {
  let total = 0;
  for (const item of Object.values(p.equipment)) {
    if (item.type === 'armor') total += Math.floor(item.armor * conditionMult(item) * qualityMult(item));
  }
  return total;
}

export function defenseSkillOf(p) {
  // Shield usage counts when a shield is equipped.
  const hasShield = Boolean(p.equipment.shield);
  const ev = skillRank(p, 'evasion');
  const sh = hasShield ? skillRank(p, 'shield_usage') : 0;
  return Math.floor(ev * 0.7 + sh * 0.3);
}

// ---------------- TDPs (Training Development Points) ----------------
export const STANCES = ['aggressive', 'balanced', 'defensive', 'guarded'];

// Stance points: stances cost points; armor-secondary guilds earn bonuses
// (DR-authentic: Barbarians +1 per 60 Defending ranks; Rangers gain defense
// scaling from their defense skills).
export const STANCE_COSTS = { aggressive: 2, balanced: 0, defensive: 1, guarded: 2 };

export function stancePoints(p) {
  let pts = 3;
  if (p.guild.id === 'barbarian') pts += Math.floor(skillRank(p, 'defending') / 60);
  if (p.guild.id === 'ranger') pts += Math.floor((skillRank(p, 'evasion') + skillRank(p, 'shield_usage')) / 60);
  // Exemplar mastery: a paragon of the wild commands an extra edge.
  if (p.guild.id === 'barbarian' && (p.abilities || []).includes('exemplar')) pts += 2;
  return pts;
}

// Authentic DR award on circling: base 50 below circle 10 (100 from circle 10
// on), plus a bonus equal to the circle just attained.
export function tdpAwardFor(circle) {
  return (circle >= 10 ? 100 : 50) + circle;
}

// TDP cost to raise a stat by one point.
export function statRaiseCost(current) {
  return Math.max(10, Math.floor(current * 0.6));
}

// TDP cost to bank one rank's worth of experience in a skill.
export function tdpTrainCost(rank) {
  return 4 + rank * 3;
}
