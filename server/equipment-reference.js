// Inspect actual equipped instances. Missing historical metadata is labelled;
// catalog facts are never substituted for unknown instance values.
import { ROOMS } from '../data/world.js';
import { SKILLS } from '../data/skills.js';
import { armorContribution, finiteQuality, repairCost } from './equipment-policy.js';

const normalize = value => String(value || '').toLowerCase().replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
const MAX_RESULTS = 8;
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function equipmentSnapshot(p, input = '') {
  const pieces = Object.entries(p.equipment || {}).map(([slot, item]) => {
    if (!item || typeof item !== 'object') return { slot, id: null, name: 'Unknown equipped piece', unknown: true, armor: null, type: null };
    const conditionRecorded = item.condition !== undefined && item.condition !== null;
    const condition = !conditionRecorded ? 100 : finite(item.condition) ? item.condition : null;
    const quality = finiteQuality(item.quality);
    const contribution = item.type === 'armor' ? armorContribution(item) : 0;
    const price = condition !== null && condition < 100 ? repairCost(item) : condition === null ? null : 0;
    return { slot, id: typeof item.id === 'string' ? item.id : null,
      name: typeof item.name === 'string' ? item.name : 'Unknown equipped piece', type: item.type || null,
      condition, conditionRecorded, quality, qualityMultiplier: quality || 1,
      maker: typeof item.maker === 'string' && item.maker.trim() ? item.maker : null,
      skill: typeof item.skill === 'string' ? item.skill : null,
      baseDamage: Array.isArray(item.dmg) && item.dmg.length === 2 && item.dmg.every(finite) ? [...item.dmg] : null,
      baseArmor: finite(item.armor) ? item.armor : null,
      armor: Number.isFinite(contribution) ? contribution : null,
      repairPrice: Number.isFinite(price) ? price : null,
      repairAffordable: Number.isFinite(price) && (p.silver || 0) >= price };
  });
  const query = normalize(input);
  const exact = pieces.filter(piece => normalize(piece.id) === query || normalize(piece.slot) === query);
  const terms = query.split(' ').filter(Boolean);
  const matching = query ? exact.length ? exact : pieces.filter(piece => terms.every(term => normalize(`${piece.id || ''} ${piece.slot} ${piece.name}`).includes(term))) : pieces;
  const armorPieces = pieces.filter(piece => piece.type === 'armor' || !piece.type);
  const totalArmor = armorPieces.some(piece => piece.armor === null || !piece.type) ? null : armorPieces.reduce((sum, piece) => sum + piece.armor, 0);
  return { query, pieces: matching.slice(0, MAX_RESULTS), count: matching.length, equippedCount: pieces.length,
    totalArmor, silver: p.silver || 0, atRepairShop: ['forge', 'tailor_shop'].includes(p.room),
    repairShops: ['forge', 'tailor_shop'].map(roomId => ({ roomId, name: ROOMS[roomId]?.name || roomId })) };
}

export function formatEquipment(p, input = '') {
  const plan = equipmentSnapshot(p, input);
  const lines = [`Equipment report — ${plan.equippedCount} equipped pieces; ${plan.silver} silvers.`,
    `Effective armor total (all equipped armor): ${plan.totalArmor === null ? 'unknown: incomplete legacy metadata' : plan.totalArmor}.`,
    `Repair shops: ${plan.repairShops.map(room => `${room.name} [${room.roomId}]`).join('; ')}${plan.atRepairShop ? ' — repairs available here' : ''}. Repairs require the piece to remain equipped.`];
  if (!plan.equippedCount) lines.push('You have nothing equipped. "inventory" lists carried possessions.');
  if (plan.query && !plan.count) lines.push(`No equipped piece matches "${plan.query}". Try an exact item ID, name or equipped slot.`);
  for (const piece of plan.pieces) {
    lines.push(`  ${piece.slot}: ${piece.name} [${piece.id || 'ID unknown'}]`);
    if (piece.unknown) { lines.push('    Legacy instance metadata unavailable; armor and repair price unknown.'); continue; }
    lines.push(`    Condition: ${piece.condition === null ? 'unknown' : `${piece.condition}/100${piece.conditionRecorded ? '' : ' (unrecorded; engine default)'}`}; quality: ${piece.quality === null ? 'unrecorded/invalid; engine multiplier 1' : `multiplier ${piece.quality}`}; maker: ${piece.maker || 'unknown'}.`);
    if (piece.type === 'weapon') lines.push(`    Weapon skill: ${piece.skill ? `${SKILLS[piece.skill]?.name || piece.skill} [${piece.skill}]` : 'unknown'}; base damage: ${piece.baseDamage ? piece.baseDamage.join('–') : 'unknown'}. Actual combat damage also depends on combat state and character abilities.`);
    if (piece.type === 'armor') lines.push(`    Armor skill: ${piece.skill ? `${SKILLS[piece.skill]?.name || piece.skill} [${piece.skill}]` : 'unknown'}; base armor: ${piece.baseArmor ?? 'unknown'}; effective contribution: ${piece.armor ?? 'unknown'} (condition and quality included; each piece rounded down).`);
    if (!piece.type) lines.push('    Item type unknown; armor contribution cannot be identified.');
    lines.push(`    Repair: ${piece.repairPrice === null ? 'price unknown: incomplete legacy metadata' : piece.repairPrice === 0 ? 'nothing to mend' : `${piece.repairPrice} silvers (${piece.repairAffordable ? 'affordable' : 'insufficient silvers'})`}${piece.id ? `. "repair ${piece.id}" at either repair shop` : ''}.`);
  }
  if (plan.count > plan.pieces.length) lines.push(`Showing ${plan.pieces.length} of ${plan.count} matches. Narrow with "equipment <id|name|slot>".`);
  return lines.join('\n');
}
