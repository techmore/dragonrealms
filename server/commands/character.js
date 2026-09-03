// Character commands: stats, skills, TDPs, training, circling, khri, slots.
import { guildById, circleRequirements, circleRequirementSummary, guildTrainedSkills, trainableSkills, spellsFor, guildTitle, capstoneFor, spellSlotCost, spellSlotsTotal, spellSlotsUsed, guildMagicTier } from '../../data/guilds.js';
import { SKILLS, CATEGORIES, totalRanks, expToNextRank, mindstate, skillTier } from '../../data/skills.js';
import { manaTypeFor } from '../../data/mana.js';
import { roomById } from '../../data/world.js';
import { db } from '../db.js';
import {
  skillRank, gainSkillExp, applyExpToSkill, weaponOf, totalArmor, STAT_NAMES, MAX_STAT,
  statRaiseCost, tdpAwardFor, baseStatsFor, ACHIEVEMENTS, unlockAchievement, poolCap,
} from '../player.js';
import { pad, matchSkill, recalcDerived, rankExp, SLOT_RATES, STAT_FULL } from './util.js';

export const commands = {
  score(ctx) { showScore(ctx); },
  stats: showScore,

  skills(ctx) { showSkills(ctx); },

  exp(ctx) { showExp(ctx); },
  experience: showExp,
  info: showScore,
  health(ctx) { showHealth(ctx); },

  // Effects panel: every active buff with its remaining duration (DR-style
  // effect display — also how scripted agents verify their boost draughts).
  effects(ctx) {
    const { p, emit } = ctx;
    const entries = Object.entries(p.buffs || {}).filter(([, v]) => v > 0);
    if (!entries.length) return emit('No special effects are acting on you right now.');
    const NAMES = {
      frenzy: 'Frenzy (+30% damage)', ironhide: 'Ironhide (blunts blows)',
      shadow: 'Shadow Veil (+15% defense)', omen: "Omen's Edge (+10% defense)",
      wind: 'Windborne (quicker strikes)', warpaint: 'Warpaint (+15% damage)',
      glyph_ward: 'Glyph of Warding (+10% armor)', glyph_valor: 'Glyph of Valor (+15% damage)',
      glyph_shield: 'Glyph of Shielding (absorbs hits)', keen: 'Keen Mind (+50% learning)',
      vigor: 'Vigor (reduced fatigue costs)', sun: 'Sun Blessing',
    };
    const lines = entries.map(([k, v]) => `  ${NAMES[k] || k} — ${v} tick${v === 1 ? '' : 's'} remaining`);
    emit(`\nActive effects:\n${lines.join('\n')}`);
  },

  alloc(ctx) {
    const { p, arg1, arg2, emit } = ctx;
    if (!arg1 || !arg2) {
      return emit(`Unspent points: ${p.unspentStat}. Usage: alloc <stat> <amount>. Stats: ${STAT_NAMES.join(', ')}`);
    }
    const stat = STAT_NAMES.includes(arg1.toLowerCase()) ? arg1.toLowerCase() : null;
    if (!stat) return emit('Unknown stat.');
    let amt = parseInt(arg2, 10);
    if (!amt || amt < 1) return emit('Amount must be a positive number.');
    if (p.unspentStat < amt) return emit(`You only have ${p.unspentStat} unspent points.`);
    const space = MAX_STAT - p.stats[stat];
    if (space < amt) {
      p.unspentStat -= space;
      p.stats[stat] = MAX_STAT;
      return emit(`You raise ${STAT_FULL[stat]} by ${space} (maxed). ${p.unspentStat} points remain.`);
    }
    p.unspentStat -= amt;
    p.stats[stat] += amt;
    recalcDerived(p);
    emit(`You raise ${STAT_FULL[stat]} to ${p.stats[stat]}. ${p.unspentStat} points remain.`);
  },

  tdp(ctx) {
    const { p, say } = ctx;
    const pool = p.tdpPool || 0;
    say(`\n\x1b[1mTraining Points (TDPs)\x1b[0m: ${p.tdp}  (pool ${pool}/200 toward the next)\nEarn TDPs as your skills rise in rank and from circling. Spend them on:\n  raise <stat>      permanently raise an INFO attribute at the Fane`);
  },

  raise(ctx) {
    const { p, arg1, emit } = ctx;
    if (p.room !== 'fane') {
      return emit('TDPs are spent at the Fane of Training, south of Temple Row. Type "train <stat>" twice there to commit.');
    }
    if (!arg1) return emit('Usage: train <stat> (twice) — spends TDPs to permanently raise a stat.');
    const stat = STAT_NAMES.includes(arg1.toLowerCase()) ? arg1.toLowerCase() : null;
    if (!stat) return emit('Unknown stat. Choose: ' + STAT_NAMES.join(', '));
    if (p.stats[stat] >= MAX_STAT) return emit('That stat is already at maximum.');
    const cost = statRaiseCost(p.stats[stat]);
    if (p.tdp < cost) return emit(`Raising ${STAT_FULL[stat]} costs ${cost} TDPs; you have ${p.tdp}.`);
    p.tdp -= cost;
    p.stats[stat] += 1;
    recalcDerived(p);
    emit(`You spend ${cost} TDPs and raise ${STAT_FULL[stat]} to ${p.stats[stat]}. ${p.tdp} TDPs remain.`);
  },

  tdptrain(ctx) {
    const { emit } = ctx;
    return emit('TDPs cannot be spent on skill experience. Use combat, field work, or guild training to advance skills; use raise <stat> at the Fane for attributes.');
  },

  circle(ctx) { circleUp(ctx); },

  train(ctx) {
    const { game, p, arg1, arg2, emit } = ctx;
    if (!arg1) return emit('Train what? Usage: train <skill> or, in the Fane of Training, train <stat> (twice).');
    // Stat training at the Fane of Training (DR: TRAIN twice to confirm).
    const statArg = STAT_NAMES.includes(arg1.toLowerCase()) ? arg1.toLowerCase() : null;
    if (statArg) {
      if (p.room !== 'fane') return emit('Stat training happens at the Fane of Training, south of Temple Row.');
      if (p.stats[statArg] >= MAX_STAT) return emit('That stat is already at maximum.');
      if (p.trainPending !== statArg) {
        p.trainPending = statArg;
        return emit(`You steel yourself in the ${STAT_FULL[statArg]} alcove. Type "train ${arg1}" again to commit ${statRaiseCost(p.stats[statArg])} TDPs.`);
      }
      p.trainPending = null;
      const cost = statRaiseCost(p.stats[statArg]);
      if (p.tdp < cost) return emit(`Raising ${STAT_FULL[statArg]} costs ${cost} TDPs; you have ${p.tdp}.`);
      p.tdp -= cost;
      p.stats[statArg] += 1;
      recalcDerived(p);
      return emit(`You commit and raise ${STAT_FULL[statArg]} to ${p.stats[statArg]}. ${p.tdp} TDPs remain.`);
    }
    p.trainPending = null;
    const skillId = matchSkill(arg1);
    if (!skillId) return emit('I do not know that skill. See "skills" for the list.');
    const trainer = game.guildTrainer(p);
    if (!trainer) return emit('Your guild trainer is not here. Go to your guild hall in the Guild District.');
    if (!trainableSkills(p.guild).includes(skillId)) {
      return emit(`${trainer.name} does not teach that skill. Your guild trains: ${trainableSkills(p.guild).join(', ')}.`);
    }
    const rank = skillRank(p, skillId);
    const cost = 40 + rank * 20;
    if (p.silver < cost) return emit(`Training ${SKILLS[skillId].name} costs ${cost} silvers, and you have ${p.silver}. Go hunt!`);
    p.silver -= cost;
    applyExpToSkill(p, p.skills[skillId], Math.floor(expToNextRank(rank) * 0.4));
    emit(`${trainer.name} drills you in ${SKILLS[skillId].name}. You make progress toward rank ${skillRank(p, skillId) + 1} (${cost} silvers).`);
  },

  slots(ctx) {
    const { p, say, emit } = ctx;
    const guild = p.guild;
    if (!guild.magic) return emit('Your guild forswears magic.');
    const forgotten = Array.isArray(p.spellsForgotten) ? p.spellsForgotten : [];
    const total = spellSlotsTotal(guild, p.circle);
    const used = spellSlotsUsed(guild, p.circle, forgotten);
    const feat = p.circle >= 2 ? 2 : 0;
    let msg = `\nSpell slots: ${used} of ${total} used (${guildMagicTier(guild)}-magic tier)${feat ? ' — includes your +2 circle-2 feat' : ''}.`;
    const held = (guild.spells || []).filter((s) => s.minCircle <= p.circle && !forgotten.includes(s.id));
    msg += held.length
      ? '\nHeld:\n' + held.map((s) => `  ${s.name} — ${spellSlotCost(s)} slots, ${s.mana} mana`).join('\n')
      : '\nYou hold no spells — learn one at your guild hall.';
    // Forgotten or over-budget unlocks: relearnable at the hall when room allows.
    const awaiting = (guild.spells || []).filter((s) => s.minCircle <= p.circle && forgotten.includes(s.id));
    if (awaiting.length) {
      msg += '\nAwaiting at your guild hall:';
      for (const s of awaiting) {
        const fits = used + spellSlotCost(s) <= total;
        msg += `\n  ${s.name} — ${spellSlotCost(s)} slots${fits ? ' — "learn ' + s.name.toLowerCase() + '"' : ' — no room; forget something smaller first'}`;
      }
    }
    const later = (guild.spells || []).filter((s) => s.minCircle > p.circle);
    if (later.length) msg += `\nYou will reach: ${later.map((s) => `${s.name} (circle ${s.minCircle})`).join(', ')}.`;
    say(msg);
  },

  rexp(ctx) {
    const { p, say } = ctx;
    say(`\nRested experience: ${Math.floor(p.rexp || 0)} minute(s) banked (cap 120).\nBank it by logging out (2 minutes away = 1 minute of rest) or by resting deeply. While active, drained field experience is worth three times the ranks.`);
  },

  achievements(ctx) {
    const { p, emit } = ctx;
    const earned = (p.achievements || []).map((id) => ACHIEVEMENTS[id]).filter(Boolean);
    const total = Object.keys(ACHIEVEMENTS).length;
    if (!earned.length) return emit(`No achievements yet (0/${total}). Keep an eye out — the realm remembers great deeds.`);
    const lines = earned.map((a) => `  \x1b[1m${a.name}\x1b[0m — ${a.desc}`);
    emit(`\nAchievements (${earned.length}/${total}):\n${lines.join('\n')}`);
  },

  respec(ctx) {
    const { p, emit } = ctx;
    if (p.room !== 'fane') return emit('Respecs are granted at the Fane of Training, south of Temple Row.');
    const base = baseStatsFor(p.race.id);
    const spent = STAT_NAMES.reduce((s, n) => s + (p.stats[n] - base[n]), 0);
    if (spent <= 0) return emit('You have not spent any stat points yet — nothing to reroll.');
    const cost = 150 + p.circle * 50;
    if (p.silver < cost) return emit(`Rerolling your attributes costs ${cost} silvers; you have ${p.silver}.`);
    p.silver -= cost;
    for (const n of STAT_NAMES) p.stats[n] = base[n];
    p.unspentStat = (p.unspentStat || 0) + spent;
    recalcDerived(p);
    p.hp = p.maxHp;
    emit(`The fane keeper burns a candle of return and your body unspools to its first shape. ${spent} spent point(s) return to your pool. (${p.unspentStat} unspent)`);
  },

  deletechar(ctx) {
    const { game, p, arg1, emit } = ctx;
    if (!arg1) return emit('Usage: deletechar <name> — deletes one of your OTHER characters. This cannot be undone.');
    const rows = db.prepare('SELECT id, name FROM characters WHERE account_id = ? AND id != ?')
      .all(p.accountId, p.charId);
    const target = rows.find((r) => r.name.toLowerCase() === arg1.toLowerCase());
    if (!target) return emit(`You have no other character named "${arg1}".`);
    const online = [...game.players.values()].some((o) => o.charId === target.id);
    if (online) return emit('That character is currently online and cannot be deleted.');
    db.prepare('DELETE FROM characters WHERE id = ?').run(target.id);
    emit(`Character "${target.name}" has been deleted forever. You have ${rows.length - 1} character slot(s) free.`);
  },
};

// DR HEALTH: wounds and afflictions. We track a single HP pool, so the
// condition reads off its fraction with DR's vitality ladder.
import { vitalityLabel } from '../combat.js';
// DR encumbrance word for the current load vs your carry allowance.
import { loadWord } from './verbs.js';
import { totalBurden, netBurden, carryAllowance } from '../player.js';
import { bleedInfo } from '../wounds.js';


function showHealth(ctx) {
  const { p, say } = ctx;
  const cond = vitalityLabel(p.hp, p.maxHp);
  const stam = p.maxStaminaEff ? (p.stamina / p.maxStaminaEff >= 0.5 ? 'Your wind holds steady.' : 'You are winded and short of breath.') : '';
  const res = p.guild.magic
    ? `Mana ${p.mana}/${p.maxMana}`
    : p.guild.id === 'barbarian' ? `Inner Fire ${p.innerFire}/${p.maxInnerFire}` : '';
  const open = (p.wounds || []).filter((w) => !w.resolved);
  const woundLine = open.length
    ? `\nBleeding: ${open.map((w) => `${w.part} (${bleedInfo(w.level).name}${w.tended ? ', tended' : ''})`).join(', ')}${open.some((w) => !w.tended) ? ' — "tend <part>" to bandage.' : ''}`
    : '\nNo bleeding wounds.';
  say(`\nYou are ${cond} and ${loadWord(p)}.\nHealth ${p.hp}/${p.maxHp}  ${res ? res + '  ' : ''}Stamina ${p.stamina}/${p.maxStaminaEff}\n${stam}${woundLine}`);
}

function showScore(ctx) {
  const { p, say } = ctx;
  const w = weaponOf(p);
  const armor = totalArmor(p);
  // DR policy: your own condition reads as prose everywhere; the raw pool
  // numbers live only in `health`.
  const cond = vitalityLabel(p.hp, p.maxHp);
  const lines = [
    `\n\x1b[1m${p.name}\x1b[0m — ${p.race.name} ${p.guild.name} (${guildTitle(p.guild, p.circle)})`,
    `Circle ${p.circle}  |  You are ${cond}  |  Stamina ${p.stamina ?? 0}/${p.maxStaminaEff ?? 0}  |  ${p.guild.magic ? `Mana ${p.mana}/${p.maxMana} (${manaTypeFor(p.guild).def.name})` : p.guild.id === 'barbarian' ? `Inner Fire ${p.innerFire}/${p.maxInnerFire}` : ''}`,
    `Attributes:  Str ${p.stats.str}  Con ${p.stats.con}  Ref ${p.stats.ref}  Agi ${p.stats.agi}`,
    `             Cha ${p.stats.cha}  Dis ${p.stats.dis}  Wis ${p.stats.wis}  Int ${p.stats.int}`,
    `Unspent points: ${p.unspentStat}`,
    `Weapon: ${w ? `${w.name} (${w.dmg[0]}-${w.dmg[1]})` : 'your fists'}`,
    `Armor: ${armor}`,
    `Load: ${loadWord(p)} (carry allowance ${carryAllowance(p)}, hauling ${Math.round(totalBurden(p) * 10) / 10})`,
    `Total skill ranks: ${totalRanks(p.skills)}`,
    `Silver: ${p.silver}  Bank: ${p.bank}`,
  ];
  if (p.circle >= 10) {
    const cap = capstoneFor(p.guild);
    if (cap) lines.push(`\n\x1b[1mCapstone: ${cap.name}\x1b[0m — ${cap.desc}`);
  }
  say(lines.join('\n'));
}

function showSkills(ctx) {
  const { p, say } = ctx;
  const byCat = {};
  for (const [id, def] of Object.entries(SKILLS)) {
    (byCat[def.cat] ||= []).push([def, p.skills[id]?.rank || 0]);
  }
  const out = [];
  out.push(`\n\x1b[1mSkills\x1b[0m (total ranks: ${totalRanks(p.skills)})`);
  for (const cat of Object.values(CATEGORIES)) {
    if (!byCat[cat]) continue;
    out.push(`\n\x1b[1m${cat}\x1b[0m`);
    for (const [def, rank] of byCat[cat]) {
      const t = skillTier(rank);
      out.push(`  ${pad(def.name, 24)} ${pad(String(rank), 4)} ${t.label}`);
    }
  }
  say(out.join('\n'));
}

function showExp(ctx) {
  const { p, say } = ctx;
  const lines = ['\n\x1b[1mExperience\x1b[0m'];
  for (const [id, s] of Object.entries(p.skills)) {
    const def = SKILLS[id];
    const need = rankExp(s.rank);
    const pool = (p.expPools && p.expPools[id]) || 0;
    // Mindstate reads pool fullness (DR); skills with only trainer-taught
    // residual bits fall back to rank progress.
    const pct = pool > 0
      ? Math.min(100, Math.floor((pool / Math.max(1, poolCap(p, id))) * 100))
      : Math.floor((s.exp / need) * 100);
    if (s.rank > 0 || s.exp > 0 || pool > 0) {
      lines.push(`  ${pad(def.name, 24)} rank ${s.rank}  ${pad(`${pct}%`, 4)} ${mindstate(pct)}${pool > 0 ? `  [${Math.floor(pool)} held]` : ''}`);
    }
  }
  lines.push(`\nGuild circle progress (next: ${p.circle + 1}):`);
  const req = circleRequirements(p.guild, p.skills, p.circle + 1);
  if (req.ok) lines.push('  You are ready to circle! Visit your guild hall and type "circle".');
  else for (const m of req.missing.slice(0, 8)) lines.push(`  - ${m}`);
  say(lines.join('\n'));
}

function circleUp(ctx) {
  const { game, p, say, emit } = ctx;
  const room = roomById(p.room);
  const isOwnHall = room.id === `hall_${p.guild.id}` || room.id === 'rh_guilds';
  if (!isOwnHall) return emit('You must stand in your own guild hall to circle. (Look for your guild\'s hall in the Guild District.)');
  if (p.guild.id === 'paladin' && (p.soul ?? 50) < 20) {
    return emit(`Your soul is too dim to advance (${p.soul}). Pray at the temple, or restore your honor by slaying the undead.`);
  }
  const target = p.circle + 1;
  const req = circleRequirements(p.guild, p.skills, target);
  if (!req.ok) {
    return emit(`You are not yet ready to circle to ${target}. Missing:\n  ${req.missing.join('\n  ')}`);
  }
  const oldMax = p.maxHp;
  p.circle = target;
  recalcDerived(p);
  p.hp = Math.min(p.hp + (p.maxHp - oldMax), p.maxHp);
  p.mana = p.maxMana;
  unlockAchievement(p, target === 5 ? 'circle_5' : target === 10 ? 'circle_10' : null);
  const gained = tdpAwardFor(target);
  p.tdp += gained;
  let msg = `\nThe guild leader nods slowly. "Rise, ${p.name}. You are now a ${guildTitle(p.guild, target)}."\nYour vitality grows with your station. You gain ${gained} \x1b[1mTDPs\x1b[0m (${target >= 10 ? '100 base' : '50 base'} + circle bonus).`;
  // Spell-slot economy: curriculum spells auto-grant while they fit the
  // budget; otherwise they wait as learnable at the hall ("learn <spell>").
  if (p.guild.magic) {
    const forgotten = Array.isArray(p.spellsForgotten) ? p.spellsForgotten : [];
    for (const s of p.guild.spells || []) {
      if (s.minCircle > target || forgotten.includes(s.id)) continue;
      const used = spellSlotsUsed(p.guild, target, forgotten) + spellSlotCost(s);
      if (used <= spellSlotsTotal(p.guild, target)) {
        msg += `\n\n\x1b[1m${s.name}\x1b[0m is now yours ("slots" shows your budget).`;
      } else {
        if (!Array.isArray(p.spellsForgotten)) p.spellsForgotten = [];
        p.spellsForgotten.push(s.id);
        msg += `\n\nYour spell slots are full — ${s.name} awaits at your guild hall ("learn ${s.name.toLowerCase()}").`;
      }
    }
    p.spellsKnown = spellsFor(p.guild, target).filter((s) => !p.spellsForgotten.includes(s.id)).map((s) => s.id);
  }
  if (target >= 10) {
    const cap = capstoneFor(p.guild);
    if (cap) msg += `\n\n\x1b[1mYou have attained your guild capstone: ${cap.name}!\x1b[0m\n${cap.desc}`;
  }
  say(msg);
  game.status(p);
  game.persistPlayer(p);
}
