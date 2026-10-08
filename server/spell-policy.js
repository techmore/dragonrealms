// Casting and holding follow curriculum circle + forgotten state. The roster
// is a derived compatibility view, never a second source of permission.
import { spellSlotCost, spellSlotsTotal } from '../data/guilds.js';

export const forgottenSpellIds = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string'))] : [];

export function heldSpellIds(guild, circle, forgotten) {
  if (!guild?.magic) return [];
  const excluded = new Set(forgottenSpellIds(forgotten));
  return (guild.spells || []).filter(spell => spell.minCircle <= circle && !excluded.has(spell.id)).map(spell => spell.id);
}

export function isSpellHeld(p, spell) {
  return Boolean(spell && spell.minCircle <= p.circle && !forgottenSpellIds(p.spellsForgotten).includes(spell.id));
}

export function heldSpells(p) {
  const ids = new Set(heldSpellIds(p.guild, p.circle, p.spellsForgotten));
  return (p.guild?.spells || []).filter(spell => ids.has(spell.id));
}

export function circleSpellPlan(guild, fromCircle, toCircle, forgotten) {
  const excluded = forgottenSpellIds(forgotten);
  const held = new Set(heldSpellIds(guild, fromCircle, excluded));
  let used = (guild?.spells || []).filter(spell => held.has(spell.id)).reduce((sum, spell) => sum + spellSlotCost(spell), 0);
  const total = spellSlotsTotal(guild, toCircle);
  const granted = [], rejected = [];
  if (guild?.magic) {
    for (const spell of guild.spells || []) {
      if (spell.minCircle <= fromCircle || spell.minCircle > toCircle || excluded.includes(spell.id)) continue;
      const cost = spellSlotCost(spell);
      if (used + cost <= total) {
        used += cost; held.add(spell.id); granted.push(spell);
      } else {
        excluded.push(spell.id); rejected.push(spell);
      }
    }
  }
  return { granted, rejected, forgotten: excluded, held: heldSpellIds(guild, toCircle, excluded), used, total };
}
