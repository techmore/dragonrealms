// Spell planning uses the shared curriculum/holding policy. The compatibility
// roster remains available in snapshots for internal diagnostics.
import { spellTierFor, SPELL_TIER_RANKS, spellSlotCost, spellSlotsTotal, spellSlotsUsed } from '../data/guilds.js';
import { SKILLS } from '../data/skills.js';
import { ROOMS } from '../data/world.js';
import { isSpellHeld, forgottenSpellIds } from './spell-policy.js';

const normalize = value => String(value || '').toLowerCase().replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
const MAX_RESULTS = 8;

export function spellbookSnapshot(p, input = '') {
  const guild = p.guild;
  if (!guild) return { reason: 'guildless', entries: [], total: 0 };
  if (!guild.magic) return { reason: 'nonmagical', guild: guild.name, entries: [], total: 0 };
  const forgotten = forgottenSpellIds(p.spellsForgotten);
  const recorded = Array.isArray(p.spellsKnown) ? p.spellsKnown : [];
  const used = spellSlotsUsed(guild, p.circle, forgotten);
  const totalSlots = spellSlotsTotal(guild, p.circle);
  const halls = [`hall_${guild.id}`, 'rh_guilds'].filter(id => ROOMS[id]).map(roomId => ({ roomId, name: ROOMS[roomId].name }));
  const query = normalize(input);
  const terms = query.split(' ').filter(Boolean);
  const entries = (guild.spells || []).map(spell => {
    const circleReached = spell.minCircle <= p.circle;
    const isForgotten = forgotten.includes(spell.id);
    const held = isSpellHeld(p, spell);
    const state = !circleReached ? 'future' : isForgotten ? 'forgotten' : 'held';
    const tier = spellTierFor(spell.minCircle);
    const slots = spellSlotCost(spell);
    const rank = p.skills?.[spell.skill]?.rank || 0;
    const masteryRank = SPELL_TIER_RANKS[tier];
    return {
      id: spell.id, name: spell.name, description: spell.desc, kind: spell.kind,
      state, held, forgotten: isForgotten, circleReached, minCircle: spell.minCircle,
      recordedKnown: recorded.includes(spell.id), rosterMismatch: recorded.includes(spell.id) !== held,
      slots, baseMana: spell.mana, tier, skill: spell.skill, skillName: SKILLS[spell.skill]?.name || spell.skill,
      rank, masteryRank, masteryGap: Math.max(0, masteryRank - rank),
      canRelearn: circleReached && isForgotten && used + slots <= totalSlots,
      atLearningHall: halls.some(hall => hall.roomId === p.room),
      exact: [spell.id, spell.name].some(value => normalize(value) === query),
    };
  }).filter(spell => terms.every(term => normalize(`${spell.id} ${spell.name} ${spell.description} ${spell.state} ${spell.skillName} ${spell.kind}`).includes(term)));
  const priority = { held: 0, forgotten: 1, future: 2 };
  entries.sort((a, b) => Number(b.exact) - Number(a.exact) || priority[a.state] - priority[b.state] || a.minCircle - b.minCircle || a.id.localeCompare(b.id));
  return { guild: guild.name, reason: null, query, total: entries.length, entries: entries.slice(0, MAX_RESULTS), halls, usedSlots: used, totalSlots, freeSlots: Math.max(0, totalSlots - used), overBudget: used > totalSlots };
}

export function formatSpellbook(p, input = '') {
  const book = spellbookSnapshot(p, input);
  if (book.reason === 'guildless') return 'You have no guild. Use "dir list guilds", then join at a hall before planning spells.';
  if (book.reason === 'nonmagical') return 'Your guild forswears spellcasting. Consult your guild arts instead.';
  const lines = [`\nSpellbook — ${book.guild}`, `Slots: ${book.usedSlots}/${book.totalSlots} used; ${book.freeSlots} free.`, `Learning halls: ${book.halls.map(hall => `${hall.name} [${hall.roomId}]`).join(', ') || 'unavailable'}.`];
  if (book.overBudget) lines.push('Your current holding exceeds the slot budget. Casting still follows circle and forgotten status; this view does not change your spells.');
  if (!book.total) lines.push(`No spells match "${book.query}". Try "spellbook" or search by spell ID, name, skill or state.`);
  for (const spell of book.entries) {
    lines.push(`\n  ${spell.name} [${spell.id}] — ${spell.state === 'held' ? 'Held by current casting rules' : spell.state === 'forgotten' ? 'Forgotten; relearn at a hall' : `Future — circle ${spell.minCircle}`}`);
    lines.push(`    ${spell.description}`);
    lines.push(`    Circle ${spell.minCircle}; ${spell.slots} slots; ${spell.baseMana} base mana; ${spell.tier} tier.`);
    lines.push(`    ${spell.skillName}: ${spell.rank}/${spell.masteryRank} ranks — soft mastery reference${spell.masteryGap ? ` (${spell.masteryGap} more ranks for that reference; weaker casts can still be attempted)` : ' met'}.`);
    if (spell.state === 'held') lines.push(`    "prepare ${spell.id}" or "cast ${spell.id}" can attempt this spell; mana, targets and normal casting restrictions still apply.`);
    else if (spell.state === 'forgotten') lines.push(spell.canRelearn
      ? `    ${spell.atLearningHall ? 'You are at a learning hall.' : 'Visit a learning hall.'} "learn ${spell.id}" fits your current slot budget.`
      : `    "learn ${spell.id}" needs ${spell.slots} free slots; you currently have ${book.freeSlots}. "forget <spell>" can release a held spell.`);
    else lines.push(`    Reach circle ${spell.minCircle}; future slot capacity and circle grants determine your holding then.`);
  }
  if (book.total > book.entries.length) lines.push(`\nShowing ${book.entries.length} of ${book.total} spells; narrow "spellbook <query>" to see more.`);
  lines.push('\nAn already prepared spell takes priority over "cast <id>". Use "prepare <id>" first to replace it with your chosen spell.');
  lines.push('Mastery ranks affect strength, never permission to attempt. Base mana changes with preparation, moon phases, insight and techniques. Reading the spellbook does not learn, forget, prepare or cast.');
  return lines.join('\n');
}
