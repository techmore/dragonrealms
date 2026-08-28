// Skinning loot from corpses (used by the combat command module).
import { skillRank, effectiveRank, gainSkillExp, addItem } from '../player.js';
import { itemByIdName } from './util.js';
import { pruneCorpses } from '../combat.js';

// Skin difficulty scales with the creature's circle; a fresh hunter can still
// dress a rat, but a dire wolf needs trained hands.
function skinChance(p, corpse) {
  const diff = (corpse.def.circle || 1) * 6;
  const rank = effectiveRank(p, 'skinning');
  return Math.min(0.99, Math.max(0.2, 1.05 - 0.07 * Math.max(0, diff - rank)));
}

export function skinCreature(game, p, name, say, emit) {
  if (!name) return emit('Skin what?');
  pruneCorpses(p);
  const n = name.toLowerCase();
  const idx = (p.corpses || []).findIndex((c) =>
    c.def.id === n || c.def.name.includes(n) || c.def.name.replace(/^a /, '').split(' ')[0] === n);
  if (idx === -1) return emit('There is no such corpse here.');
  const corpse = p.corpses[idx];
  // Skill check: clumsy cuts teach even when they fail, and the corpse
  // remains so you can steady your hands and try again.
  const leveledTry = gainSkillExp(p, 'skinning', Math.ceil(corpse.def.circle * 1.5));
  if (Math.random() > skinChance(p, corpse)) {
    emit(`You fumble the cut and ruin your work on ${corpse.def.name} — it will take another careful attempt.${leveledTry ? ' Your Skinning improved!' : ''}`);
    return;
  }
  const loot = corpse.def.loot || [];
  // Butchery ritual: the dead give twice while it holds.
  const butchered = p.ritualButcheryUntil && Date.now() < p.ritualButcheryUntil;
  let gained = '';
  for (const itemId of loot) {
    addItem(p, itemId, 1);
    gained += ` ${itemByIdName(itemId)},`;
    if (butchered) {
      addItem(p, itemId, 1);
      gained += ` ${itemByIdName(itemId)},`;
    }
  }
  p.corpses.splice(idx, 1);
  const sk = skillRank(p, 'skinning');
  const leveled = gainSkillExp(p, 'skinning', corpse.def.circle * 4 + 5);
  if (game && game.questSkin) game.questSkin(p);
  emit(`You carefully skin ${corpse.def.name} and add ${gained || 'nothing'} to your pack.${leveled ? ' Your Skinning improved!' : ''}`);
}
