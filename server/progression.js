// Read-only guidance uses the same requirements and trainer curriculum as
// circling. Nth-skill suggestions are choices, not extra mandatory skills.
import { circleRequirements, circleRequirementNeeds, trainableSkills } from '../data/guilds.js';
import { SKILLS } from '../data/skills.js';
import { roomById } from '../data/world.js';
import { skillLessonCost } from './training-policy.js';

const nameOf = (id) => SKILLS[id]?.name || id;

export function guildDirectionCommand(p) {
  // Riverhaven's shared row is where every guild can train and circle.
  // Its individual halls are landmarks, not interchangeable circle locations.
  return roomById(p.room)?.zone === 'riverhaven' ? 'dir guilds' : `dir ${p.guild?.id || 'list guilds'}`;
}

export function progressionPlan(p) {
  if (!p.guild) return null;
  const target = p.circle + 1;
  const requirements = circleRequirements(p.guild, p.skills, target);
  const teachable = new Set(trainableSkills(p.guild));
  const choices = new Map();
  for (const row of circleRequirementNeeds(p.guild, p.skills, target)) {
    const previous = choices.get(row.skill);
    if (!previous || previous.need < row.need) choices.set(row.skill, row);
  }
  const suggestions = [...choices.values()].map((row) => {
    const have = p.skills[row.skill]?.rank || 0;
    return {
      ...row, have, gap: row.need - have,
      name: nameOf(row.skill),
      held: Math.floor(p.expPools?.[row.skill] || 0),
      training: trainingHint(p.guild.id, row.skill),
      hallCost: teachable.has(row.skill) ? skillLessonCost(have) : null,
    };
  }).sort((a, b) => a.gap - b.gap || a.skill.localeCompare(b.skill));
  const soulBlocked = p.guild.id === 'paladin' && (p.soul ?? 50) < 20;
  return { target, rows: requirements.rows || [], suggestions, soulBlocked, ready: requirements.ok && !soulBlocked };
}

function trainingHint(guildId, skill) {
  if (guildId === 'barbarian' && ['augmentation', 'debilitation', 'warding_magic'].includes(skill)) {
    return 'Use learned Barbarian abilities in battle; "abilities" lists your arts. Learn one with "learn <ability>" at your hall.';
  }
  if (guildId === 'thief' && ['primary_magic', 'augmentation', 'debilitation', 'utility_magic', 'warding_magic'].includes(skill)) {
    return 'Use Khri; "khri" lists your arts. Thieves train these through Khri rather than spells.';
  }
  return SKILLS[skill]?.training || 'Ask your guild leader about training this skill.';
}

export function formatProgression(p, { all = false } = {}) {
  const plan = progressionPlan(p);
  if (!plan) return 'You have no guild yet. Use "dir list guilds", visit a hall, and "join <guild>" before planning your advancement.';
  const met = plan.rows.filter((row) => row.have >= row.need).length;
  const lines = [`\nAdvancement to circle ${plan.target} — ${p.guild.name}`, `Requirements met: ${met}/${plan.rows.length}`];
  for (const row of plan.rows) {
    const gap = Math.max(0, row.need - row.have);
    lines.push(`  ${gap ? 'NEED' : 'MET '} ${nameOf(row.label)}${row.hard ? ' (hard)' : ''}: ${row.have}/${row.need}${gap ? ` — ${gap} more ranks` : ''}`);
  }
  if (plan.soulBlocked) lines.push(`Your soul is too dim to advance (${p.soul}/20). Pray at the temple, or restore your honor by slaying the undead.`);
  if (plan.ready) {
    lines.push(`\nYou are ready. Use "${guildDirectionCommand(p)}", visit your guild hall, and type "circle".`);
  } else if (plan.suggestions.length) {
    lines.push('\nPractice choices (nearest rank goals first):');
    const shown = all ? plan.suggestions : plan.suggestions.slice(0, 6);
    for (const suggestion of shown) {
      lines.push(`  ${suggestion.name}: rank ${suggestion.have} → ${suggestion.need}${suggestion.set ? ` (one choice for ${suggestion.set})` : ''}`);
      lines.push(`    ${suggestion.training}`);
      lines.push(suggestion.hallCost === null
        ? '    Your guild hall does not teach this skill.'
        : `    Hall option: "train ${suggestion.skill}" — ${suggestion.hallCost} silvers per lesson${p.silver < suggestion.hallCost ? ' (more than you carry)' : ''}.`);
      if (suggestion.held) lines.push(`    ${suggestion.held} field EXP held; it must drain before it counts as ranks.`);
      if (suggestion.candidates) {
        lines.push(`    Eligible alternatives: ${suggestion.candidates.filter((id) => id !== suggestion.skill).map(nameOf).join(', ')}.`);
      }
    }
    if (shown.length < plan.suggestions.length) lines.push(`  ${plan.suggestions.length - shown.length} more practice choices — "progress all" shows them.`);
    lines.push('Nth requirements count distinct eligible skills. Suggestions may share goals; check "progress" again as ranks change.');
  }
  return lines.join('\n');
}
