// Passive training plans from the same curricula, prices and authored trainers
// the production commands use. No player/DB imports or state writes.
import { trainableSkills } from '../data/guilds.js';
import { SKILLS, expToNextRank } from '../data/skills.js';
import { ROOMS } from '../data/world.js';
import { npcById } from '../data/npcs.js';
import { MAX_STAT, RANK_CAP, STAT_NAMES, statRaiseCost, skillLessonCost, skillLessonExp } from './training-policy.js';

const STAT_FULL = { str: 'Strength', con: 'Constitution', ref: 'Reflex', agi: 'Agility', cha: 'Charisma', dis: 'Discipline', wis: 'Wisdom', int: 'Intelligence' };
const normalize = value => String(value || '').toLowerCase().replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
const MAX_RESULTS = 8;
function matching(entries, query) {
  if (!query) return entries;
  const exact = entries.filter(entry => normalize(entry.id) === query);
  if (exact.length) return exact;
  const terms = query.split(' ');
  return entries.filter(entry => terms.every(term => normalize(`${entry.id} ${entry.name}`).includes(term)));
}

export function trainingSnapshot(p, input = '') {
  const words = normalize(input).split(' ').filter(Boolean);
  const mode = ['skills', 'stats'].includes(words[0]) ? words.shift() : 'all';
  const query = words.join(' ');
  const teachable = new Set(p.guild ? trainableSkills(p.guild) : []);
  const trainers = Object.values(ROOMS).filter(room => (room.npcs || []).some(id => {
    const npc = npcById(id);
    return p.guild && npc?.role === 'guild' && npc.guild === p.guild.id;
  })).map(room => ({ roomId: room.id, name: room.name }));
  const skillCandidates = Object.values(SKILLS).map(skill => {
    const rank = p.skills?.[skill.id]?.rank || 0;
    const cost = skillLessonCost(rank);
    return { id: skill.id, name: skill.name, rank, teachable: teachable.has(skill.id), cost,
      affordable: (p.silver || 0) >= cost, lessonExp: skillLessonExp(rank),
      currentExp: p.skills?.[skill.id]?.exp || 0, nextRankExp: expToNextRank(rank), atRankCap: rank >= RANK_CAP };
  });
  const skills = mode === 'stats' ? [] : matching(query ? skillCandidates : skillCandidates.filter(s => s.teachable), query);
  const stats = mode === 'skills' ? [] : matching(STAT_NAMES.map(id => {
    const value = p.stats?.[id];
    const current = Number.isFinite(value) && value >= 0 ? value : null;
    const cost = current === null ? null : statRaiseCost(current);
    return { id, name: STAT_FULL[id], current, max: MAX_STAT, cost,
      atMaximum: current !== null && current >= MAX_STAT, affordable: cost !== null && (p.tdp || 0) >= cost };
  }), query);
  return { mode, query, guild: p.guild?.name || null, silver: p.silver || 0, tdp: p.tdp || 0,
    trainers, atTrainer: trainers.some(room => room.roomId === p.room), atFane: p.room === 'fane',
    skills: skills.slice(0, MAX_RESULTS), skillCount: skills.length,
    stats: stats.slice(0, MAX_RESULTS), statCount: stats.length };
}

export function formatTraining(p, input = '') {
  const plan = trainingSnapshot(p, input);
  const lines = [`Training plan — ${plan.silver} silvers; ${plan.tdp} TDPs.`];
  if (plan.mode !== 'stats') {
    if (!plan.guild) lines.push('Skills: you have no guild. Join a guild at its leader before buying lessons; field practice remains available.');
    else {
      lines.push(`Guild skill lessons: ${plan.guild}. ${plan.atTrainer ? 'Your trainer is here.' : 'Travel to a matching guild trainer.'}`);
      lines.push(`Trainers: ${plan.trainers.map(room => `${room.name} [${room.roomId}]`).join('; ') || 'No authored matching trainer.'}`);
    }
    for (const skill of plan.skills) {
      if (!skill.teachable) { lines.push(`  ${skill.name} [${skill.id}] — rank ${skill.rank}; your guild does not teach this skill. Practice it in the field.`); continue; }
      const progress = skill.atRankCap ? `${skill.currentExp} stored experience` : `${skill.currentExp}/${skill.nextRankExp} toward next rank`;
      lines.push(`  ${skill.name} [${skill.id}] — rank ${skill.rank}; ${skill.cost} silvers (${skill.affordable ? 'affordable' : 'insufficient silvers'}); +${skill.lessonExp} direct experience; current ${progress}. "train ${skill.id}".`);
      if (skill.atRankCap) lines.push(`    Rank cap ${RANK_CAP} reached: a paid lesson still costs silvers and adds experience, but cannot raise this rank.`);
    }
    if (plan.skillCount > plan.skills.length) lines.push(`Showing ${plan.skills.length} of ${plan.skillCount} skills. Narrow with "training skills <id|name>".`);
    if (plan.skills.some(s => s.teachable)) lines.push('A lesson adds 40% of the current rank requirement, rounded down, directly to experience. It does not guarantee a full rank; existing progress can complete one.');
  }
  if (plan.mode !== 'skills') {
    lines.push(`Stat training: Fane of Training [fane]${plan.atFane ? ' — you are here' : ''}; maximum ${MAX_STAT}.`);
    for (const stat of plan.stats) lines.push(stat.current === null
      ? `  ${stat.name} [${stat.id}] — current value unavailable; raise cost unknown.`
      : `  ${stat.name} [${stat.id}] — ${stat.current}/${stat.max}; ${stat.atMaximum ? 'already at maximum' : `${stat.cost} TDPs for +1 (${stat.affordable ? 'affordable' : 'insufficient TDPs'})`}.`);
    lines.push('At the Fane, "train <stat>" twice confirms and spends TDPs; "raise <stat>" spends immediately. Use exact stat IDs above.');
  }
  if (plan.query && !plan.skillCount && !plan.statCount) lines.push(`No training matches "${plan.query}". Try "training skills" or "training stats", then an exact ID or name.`);
  return lines.join('\n');
}
