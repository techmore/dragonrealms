// Player characters: creation, persistence, skills, inventory, equipment.
import { db } from './db.js';
import { raceById } from '../data/races.js';
import { guildById } from '../data/guilds.js';
import { SKILLS, expToNextRank } from '../data/skills.js';
import { itemById } from '../data/items.js';

export const BASE_STAT = 35;
export const STAT_POOL = 30;
export const MAX_STAT = 100;
export const MAX_CHARS = 5;
export const STAT_NAMES = ['str', 'con', 'ref', 'agi', 'cha', 'dis', 'wis', 'int'];

export function validName(name) {
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 16) return false;
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

export function createCharacter(accountId, { name, race, guild }) {
  const clean = String(name || '').trim();
  if (!validName(clean)) throw new Error('Name must be 2-16 letters.');
  const existing = db.prepare('SELECT COUNT(*) AS c FROM characters WHERE account_id = ?').get(accountId).c;
  if (existing >= MAX_CHARS) throw new Error(`This account already has ${MAX_CHARS} characters. Delete one to create another.`);
  const stats = baseStatsFor(race);
  const g = guildById(guild);
  if (!raceById(race) || !g) throw new Error('Invalid race or guild.');

  const statsObj = { ...stats, unspent: STAT_POOL };
  const maxHp = 40 + stats.con * 2 + stats.str;
  const startMana = g.magic ? Math.floor(20 + stats.wis * 2 + stats.int + stats.dis) : 0;
  const startRoom = 'square';
  const info = db.prepare(`
    INSERT INTO characters
      (account_id, name, race, guild, circle, str, con, ref, agi, cha, dis, wis, int,
       unspent_stat, mana, tdp, silver, bank, room, hp, max_hp, created_at)
    VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    accountId, clean, race, guild,
    statsObj.str, statsObj.con, statsObj.ref, statsObj.agi, statsObj.cha,
    statsObj.dis, statsObj.wis, statsObj.int,
    statsObj.unspent, startMana, 600, 150, 0, startRoom, maxHp, maxHp, Date.now()
  );
  const charId = Number(info.lastInsertRowid);

  // Initialize every skill to rank 0.
  const ins = db.prepare('INSERT INTO skills (character_id, skill_id, rank, exp) VALUES (?,?,0,0)');
  for (const skillId of Object.keys(SKILLS)) ins.run(charId, skillId);

  return charId;
}

export function loadPlayer(charId) {
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(charId);
  if (!row) return null;

  const player = {
    charId: row.id,
    accountId: row.account_id,
    name: row.name,
    race: raceById(row.race),
    guild: guildById(row.guild),
    circle: row.circle,
    stats: {
      str: row.str, con: row.con, ref: row.ref, agi: row.agi,
      cha: row.cha, dis: row.dis, wis: row.wis, int: row.int,
    },
    unspentStat: row.unspent_stat,
    mana: row.mana,
    tdp: row.tdp || 0,
    tdpPool: row.tdp_pool || 0,
    stance: row.stance || 'balanced',
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
    buffs: {},
    // runtime
    online: false,
    ws: null,
    state: 'playing',
    combatId: null,
    caster: false,
    heldMana: 0,
    cambrinth: null,
    prepared: null,
    innerFire: 100,
    maxInnerFire: 100,
    voice: 40,
    abilities: [],
    lastForgetAt: 0,
    warhornAt: 0,
  };

  const q = db.prepare('SELECT creature_id, count, done FROM character_quest WHERE character_id = ?').get(charId);
  if (q) player.quest = { creatureId: q.creature_id, count: q.count, done: Boolean(q.done) };
  for (const a of db.prepare('SELECT name, command FROM aliases WHERE character_id = ?').all(charId)) {
    player.aliases[a.name] = a.command;
  }

  for (const s of db.prepare('SELECT skill_id, rank, exp FROM skills WHERE character_id = ?').all(charId)) {
    player.skills[s.skill_id] = { rank: s.rank, exp: s.exp };
  }
  for (const inv of db.prepare('SELECT id, item_id, qty FROM inventory WHERE character_id = ?').all(charId)) {
    const item = itemById(inv.item_id);
    if (item) player.inventory.push({ id: inv.id, item, qty: inv.qty });
  }
  for (const eq of db.prepare('SELECT slot, item_id FROM equipment WHERE character_id = ?').all(charId)) {
    const item = itemById(eq.item_id);
    if (item) player.equipment[eq.slot] = item;
  }

  return player;
}

export function savePlayer(p) {
  db.prepare(`
    UPDATE characters SET
      circle=?, str=?, con=?, ref=?, agi=?, cha=?, dis=?, wis=?, int=?,
      unspent_stat=?, mana=?, tdp=?, tdp_pool=?, stance=?, silver=?, bank=?, room=?, hp=?, max_hp=?
    WHERE id=?
  `).run(
    p.circle, p.stats.str, p.stats.con, p.stats.ref, p.stats.agi, p.stats.cha,
    p.stats.dis, p.stats.wis, p.stats.int, p.unspentStat, p.mana, p.tdp || 0,
    p.tdpPool || 0, p.stance || 'balanced', p.silver, p.bank, p.room, p.hp, p.maxHp, p.charId
  );
  const ins = db.prepare(`
    INSERT INTO skills (character_id, skill_id, rank, exp) VALUES (?,?,?,?)
    ON CONFLICT(character_id, skill_id) DO UPDATE SET rank=excluded.rank, exp=excluded.exp
  `);
  for (const [skillId, s] of Object.entries(p.skills)) ins.run(p.charId, skillId, s.rank, s.exp);

  if (p.quest) {
    db.prepare(`
      INSERT INTO character_quest (character_id, creature_id, count, done) VALUES (?,?,?,?)
      ON CONFLICT(character_id) DO UPDATE SET creature_id=excluded.creature_id, count=excluded.count, done=excluded.done
    `).run(p.charId, p.quest.creatureId, p.quest.count, p.quest.done ? 1 : 0);
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
  'twohanded_blunt', 'staff', 'polearm', 'brawling',
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

// Intelligence, Wisdom and Discipline improve how fast you learn.
export function learningMultiplier(p) {
  return 1 + (p.stats.int - 20) * 0.004 + (p.stats.wis - 20) * 0.004 + (p.stats.dis - 20) * 0.002;
}

// TDPs awarded when a skill reaches a new rank.
// Authentic model: each rank-up adds `rank` points to a shared hidden pool;
// every 200 pool points convert into one TDP (quadratic in rank, like DR).
export function tdpGainFor(rank) {
  return rank;
}

export const TDP_POOL_CONVERSION = 200;

// Skills can't out-rank your circle too far (circle 10 -> rank 40 cap).
export function maxRankFor(circle) {
  return circle * 4;
}

// Gain experience in a skill; auto-rank-up when enough accumulates.
// Rank-ups feed the TDP pool (mirrors the source game).
export function gainSkillExp(p, skillId, amount) {
  if (!SKILLS[skillId]) return 0;
  const s = p.skills[skillId] || (p.skills[skillId] = { rank: 0, exp: 0 });
  s.exp += Math.max(0, Math.floor(amount * learningMultiplier(p)));
  let leveled = 0;
  const cap = maxRankFor(p.circle);
  while (s.exp >= expToNextRank(s.rank) && s.rank < cap) {
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

export function addItem(p, itemId, qty = 1) {
  const item = itemById(itemId);
  if (!item) return false;
  const existing = p.inventory.find((i) => i.item.id === itemId);
  if (existing) {
    existing.qty += qty;
    db.prepare('UPDATE inventory SET qty=? WHERE id=?').run(existing.qty, existing.id);
  } else {
    const info = db.prepare('INSERT INTO inventory (character_id, item_id, qty) VALUES (?,?,?)')
      .run(p.charId, itemId, qty);
    p.inventory.push({ id: Number(info.lastInsertRowid), item, qty });
  }
  return true;
}

export function removeItem(p, itemId, qty = 1) {
  const inv = p.inventory.find((i) => i.item.id === itemId);
  if (!inv) return false;
  inv.qty -= qty;
  if (inv.qty <= 0) {
    db.prepare('DELETE FROM inventory WHERE id=?').run(inv.id);
    p.inventory = p.inventory.filter((i) => i.id !== inv.id);
  } else {
    db.prepare('UPDATE inventory SET qty=? WHERE id=?').run(inv.qty, inv.id);
  }
  return true;
}

export function countItems(p, itemId) {
  const inv = p.inventory.find((i) => i.item.id === itemId);
  return inv ? inv.qty : 0;
}

export function equipItem(p, invEntry) {
  const item = invEntry.item;
  if (item.type === 'consumable') return { ok: false, error: 'You cannot wear that.' };
  if (item.req && p.circle < item.req) {
    return { ok: false, error: `That requires at least circle ${item.req}; you are circle ${p.circle}.` };
  }
  const slot = item.slot;
  if (!slot) return { ok: false, error: 'That cannot be equipped.' };
  const existing = p.equipment[slot];
  if (existing && existing.id !== item.id) {
    delete p.equipment[slot];
    db.prepare('DELETE FROM equipment WHERE character_id=? AND slot=?').run(p.charId, slot);
    addItem(p, existing.id, 1);
  }
  p.equipment[slot] = item;
  removeItem(p, item.id, 1);
  db.prepare('INSERT INTO equipment (character_id, slot, item_id) VALUES (?,?,?)')
    .run(p.charId, slot, item.id);
  return { ok: true, slot };
}

export function unequipItem(p, slot) {
  const item = p.equipment[slot];
  if (!item) return { ok: false, error: 'Nothing equipped there.' };
  delete p.equipment[slot];
  db.prepare('DELETE FROM equipment WHERE character_id=? AND slot=?').run(p.charId, slot);
  addItem(p, item.id, 1);
  return { ok: true, item };
}

export function weaponOf(p) {
  return p.equipment.hand && p.equipment.hand.type === 'weapon' ? p.equipment.hand : null;
}

export function totalArmor(p) {
  let total = 0;
  for (const item of Object.values(p.equipment)) {
    if (item.type === 'armor') total += item.armor;
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
