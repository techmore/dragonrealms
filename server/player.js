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

export const CITIES = { crossing: 'square', riverhaven: 'rh_square' };

export function createCharacter(accountId, { name, race, guild, city = 'crossing' }) {
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
    pvpStance: row.pvp_stance || 'guarded',
    rexp: row.rexp || 0,
    stamina: row.stamina || 0,
    warrant: (() => { try { return row.warrant ? JSON.parse(row.warrant) : null; } catch { return null; } })(),
    patron: row.patron || null,
    element: row.element || null,
    caravan: (() => { try { return row.caravan ? JSON.parse(row.caravan) : null; } catch { return null; } })(),
    achievements: (() => { try { return JSON.parse(row.achievements || '[]'); } catch { return []; } })(),
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

  // Stamina is derived from Con and Fitness, then capped by what you carry.
  player.maxStamina = maxStaminaFor(player);
  player.maxStaminaEff = maxStaminaEff(player);
  if (!(row.stamina > 0)) player.stamina = player.maxStaminaEff;

  return player;
}

// Stamina pool: Constitution and Fitness define the frame.
export function maxStaminaFor(p) {
  const fit = p.skills && p.skills.fitness ? p.skills.fitness.rank : 0;
  return Math.max(30, Math.floor(40 + p.stats.con * 2 + fit * 0.5));
}

// Burden: the total weight class of everything you carry and wear.
// Heavy gear shrinks the pool and slows recovery (DR encumbrance feel).
export function totalBurden(p) {
  let b = 0;
  for (const item of Object.values(p.equipment || {})) b += item.burden || 0;
  return b;
}

// Effective stamina pool after burden: each burden point costs 2 pool.
export function maxStaminaEff(p) {
  return Math.max(20, maxStaminaFor(p) - totalBurden(p) * 2);
}

export function savePlayer(p) {
  db.prepare(`
    UPDATE characters SET
      circle=?, str=?, con=?, ref=?, agi=?, cha=?, dis=?, wis=?, int=?,
      unspent_stat=?, mana=?, tdp=?, tdp_pool=?, stance=?, pvp_stance=?, rexp=?,
      soul=?, empathic_stain=?, devotion=?, exp_pools=?, home_city=?, silver=?, bank=?, room=?, hp=?, max_hp=?, warrant=?, patron=?, element=?, caravan=?, achievements=?
    WHERE id=?
  `).run(
    p.circle, p.stats.str, p.stats.con, p.stats.ref, p.stats.agi, p.stats.cha,
    p.stats.dis, p.stats.wis, p.stats.int, p.unspentStat, p.mana, p.tdp || 0,
    p.tdpPool || 0, p.stance || 'balanced', p.pvpStance || 'guarded', p.rexp || 0,
    p.soul ?? 50, p.empathicStain || 0, p.devotion ?? 30,
    JSON.stringify(p.expPools || {}), p.homeCity || 'crossing',
    p.silver, p.bank, p.room, p.hp, p.maxHp, p.warrant ? JSON.stringify(p.warrant) : null,
    p.patron || null, p.element || null, p.caravan ? JSON.stringify(p.caravan) : null,
    JSON.stringify(p.achievements || []), p.charId
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
    `).run(p.charId, p.quest.creatureId || '', p.quest.count || 0, p.quest.done ? 1 : 0);
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
  if (p.ws && typeof p.ws.send === 'function') {
    p.ws.send(JSON.stringify({ t: 'msg', msg: `\n\x1b[1mAchievement unlocked: ${ACHIEVEMENTS[id].name}!\x1b[0m (${ACHIEVEMENTS[id].desc})` }));
  }
  return true;
}

// Rested Experience (REXP): banks while logged out (2 offline minutes -> 1
// REXP) and while resting; while active it doubles exp drain (DR-authentic).
export const REXP_CAP = 120;

// Skills can't out-rank your circle too far (circle 10 -> rank 40 cap).
export function maxRankFor(circle) {
  return circle * 4;
}

export function bankRexp(p, offlineMs) {
  const gained = Math.floor(offlineMs / 120000);
  if (gained > 0) {
    p.rexp = Math.min(REXP_CAP, (p.rexp || 0) + gained);
    return gained;
  }
  return 0;
}

// Gain experience in a skill; auto-rank-up when enough accumulates.
// DR-authentic field model: ~70% converts at once, ~30% banks in a field
// pool that pulses into ranks on the server ticker (retention feel).
// Rapid rank-ups trigger a learning lockout: the skill dims for a while
// (DR debt/lock feel — no one masters a skill by staring at one foe).
export function gainSkillExp(p, skillId, amount) {
  if (!SKILLS[skillId]) return 0;
  const s = p.skills[skillId] || (p.skills[skillId] = { rank: 0, exp: 0 });
  let gained = Math.max(0, Math.floor(amount * learningMultiplier(p)));
  // Learning lock: 3+ rank-ups in one skill inside 5 minutes halves further
  // learning for 2 minutes (fresh rank-ups may extend it).
  const now = Date.now();
  if (p.expLocks) {
    const lock = p.expLocks[skillId];
    if (lock && lock.until > now) gained = Math.floor(gained * 0.5);
  }
  if (p.rexp > 0) {
    gained *= 2;
    p.rexp -= 1;
  }
  const immediate = Math.max(gained > 0 ? 1 : 0, Math.floor(gained * 0.7));
  const banked = gained - immediate;
  let leveled = applyExpToSkill(p, s, immediate);
  if (leveled > 0) {
    p.expLocks = p.expLocks || {};
    const lock = p.expLocks[skillId] || { count: 0, until: 0 };
    if (lock.until > now) {
      lock.count += 1;
      if (lock.count >= 3) lock.until = now + 2 * 60 * 1000;
    } else {
      lock.count = 1;
      lock.until = now + 5 * 60 * 1000;
    }
    p.expLocks[skillId] = lock;
  }
  if (banked > 0) {
    p.expPools = p.expPools || {};
    const cap = expToNextRank(s.rank) * 2;
    p.expPools[skillId] = Math.min(cap, (p.expPools[skillId] || 0) + banked);
  }
  return leveled;
}

// Apply raw exp to a skill's rank ladder (with circle caps + TDP pool).
export function applyExpToSkill(p, s, amount) {
  s.exp += Math.max(0, Math.floor(amount));
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

// The server pulse: drains every field pool into ranks.
export function pulseExp(p) {
  if (!p.expPools) return 0;
  let pulsed = 0;
  for (const [skillId, pool] of Object.entries(p.expPools)) {
    if (pool <= 0) { delete p.expPools[skillId]; continue; }
    const s = p.skills[skillId];
    if (!s) { delete p.expPools[skillId]; continue; }
    const drain = Math.min(pool, expToNextRank(s.rank) * 2);
    p.expPools[skillId] = pool - drain;
    if (p.expPools[skillId] <= 0) delete p.expPools[skillId];
    pulsed += drain;
    applyExpToSkill(p, s, drain);
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
