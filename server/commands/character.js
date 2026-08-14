// Character commands: stats, skills, TDPs, training, circling, khri, slots.
import { guildById, circleRequirements, circleRequirementSummary, guildTrainedSkills, trainableSkills, spellsFor, guildTitle, capstoneFor } from '../../data/guilds.js';
import { SKILLS, CATEGORIES, totalRanks, expToNextRank, mindstate, skillTier } from '../../data/skills.js';
import { manaTypeFor } from '../../data/mana.js';
import { roomById } from '../../data/world.js';
import { db } from '../db.js';
import {
  skillRank, gainSkillExp, applyExpToSkill, weaponOf, totalArmor, STAT_NAMES, MAX_STAT,
  statRaiseCost, tdpTrainCost, tdpAwardFor, baseStatsFor, ACHIEVEMENTS, unlockAchievement,
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
    say(`\n\x1b[1mTraining Points (TDPs)\x1b[0m: ${p.tdp}  (pool ${pool}/200 toward the next)\nEarn TDPs as your skills rise in rank and from circling. Spend them on:\n  raise <stat>      permanently raise a stat\n  tdptrain <skill>  train any skill directly`);
  },

  raise(ctx) {
    const { p, arg1, emit } = ctx;
    if (p.room !== 'fane') {
      return emit('TDPs are spent at the Fane of Training, east of Temple Row. Type "train <stat>" twice there to commit.');
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
    const { p, arg1, emit } = ctx;
    if (!arg1) return emit('Usage: tdptrain <skill> — spends TDPs to train any skill.');
    const skillId = matchSkill(arg1);
    if (!skillId) return emit('I do not know that skill. See "skills".');
    const rank = skillRank(p, skillId);
    const cost = tdpTrainCost(rank);
    if (p.tdp < cost) return emit(`Training ${SKILLS[skillId].name} costs ${cost} TDPs; you have ${p.tdp}.`);
    p.tdp -= cost;
    applyExpToSkill(p, p.skills[skillId], expToNextRank(rank));
    emit(`You invest ${cost} TDPs in ${SKILLS[skillId].name} — it now sits at rank ${skillRank(p, skillId)}.`);
  },

  circle(ctx) { circleUp(ctx); },

  train(ctx) {
    const { game, p, arg1, arg2, emit } = ctx;
    if (!arg1) return emit('Train what? Usage: train <skill> or, in the Fane of Training, train <stat> (twice).');
    // Stat training at the Fane of Training (DR: TRAIN twice to confirm).
    const statArg = STAT_NAMES.includes(arg1.toLowerCase()) ? arg1.toLowerCase() : null;
    if (statArg) {
      if (p.room !== 'fane') return emit('Stat training happens at the Fane of Training, east of Temple Row.');
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
    const rate = SLOT_RATES[guild.id] || 60;
    const used = spellsFor(guild, p.circle).length;
    const total = Math.max(3, Math.floor(rate * p.circle / 12));
    const later = (guild.spells || []).filter((s) => s.minCircle > p.circle).length;
    say(`\nSpell slots: ${used} of ${total} filled (${rate} slot rate @150 circles, ${guild.name} tier).\n${later ? `You will learn ${later} more by circle 10.` : 'All your spells are known.'}`);
  },

  rexp(ctx) {
    const { p, say } = ctx;
    say(`\nRested experience: ${p.rexp || 0} minute(s) banked (cap 120).\nBank it by logging out (2 minutes away = 1 minute of rest) or by resting deeply. While active it doubles your learning.`);
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
    if (p.room !== 'fane') return emit('Respecs are granted at the Fane of Training, east of Temple Row.');
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
function showHealth(ctx) {
  const { p, say } = ctx;
  const cond = vitalityLabel(p.hp, p.maxHp);
  const stam = p.maxStaminaEff ? (p.stamina / p.maxStaminaEff >= 0.5 ? 'Your wind holds steady.' : 'You are winded and short of breath.') : '';
  const res = p.guild.magic
    ? `Mana ${p.mana}/${p.maxMana}`
    : p.guild.id === 'barbarian' ? `Inner Fire ${p.innerFire}/${p.maxInnerFire}` : '';
  say(`\nYou are ${cond}.\nHealth ${p.hp}/${p.maxHp}  ${res ? res + '  ' : ''}Stamina ${p.stamina}/${p.maxStaminaEff}\n${stam}`);
}

function showScore(ctx) {
  const { p, say } = ctx;
  const w = weaponOf(p);
  const armor = totalArmor(p);
  const lines = [
    `\n\x1b[1m${p.name}\x1b[0m — ${p.race.name} ${p.guild.name} (${guildTitle(p.guild, p.circle)})`,
    `Circle ${p.circle}  |  Health ${p.hp}/${p.maxHp}  |  Stamina ${p.stamina ?? 0}/${p.maxStaminaEff ?? 0}  |  ${p.guild.magic ? `Mana ${p.mana}/${p.maxMana} (${manaTypeFor(p.guild).def.name})` : p.guild.id === 'barbarian' ? `Inner Fire ${p.innerFire}/${p.maxInnerFire}` : ''}`,
    `Attributes:  Str ${p.stats.str}  Con ${p.stats.con}  Ref ${p.stats.ref}  Agi ${p.stats.agi}`,
    `             Cha ${p.stats.cha}  Dis ${p.stats.dis}  Wis ${p.stats.wis}  Int ${p.stats.int}`,
    `Unspent points: ${p.unspentStat}`,
    `Weapon: ${w ? `${w.name} (${w.dmg[0]}-${w.dmg[1]})` : 'your fists'}`,
    `Armor: ${armor}`,
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
    const pct = Math.floor(((s.exp + pool) / need) * 100);
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
  if (target >= 10) {
    const cap = capstoneFor(p.guild);
    if (cap) msg += `\n\n\x1b[1mYou have attained your guild capstone: ${cap.name}!\x1b[0m\n${cap.desc}`;
  }
  say(msg);
  game.status(p);
  game.persistPlayer(p);
}
