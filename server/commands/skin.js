// Skinning loot from corpses (used by the combat command module).
import { skillRank, gainSkillExp, addItem } from '../player.js';
import { itemByIdName } from './util.js';

export function skinCreature(game, p, name, say, emit) {
  if (!name) return emit('Skin what?');
  const n = name.toLowerCase();
  const idx = (p.corpses || []).findIndex((c) =>
    c.def.id === n || c.def.name.includes(n) || c.def.name.replace(/^a /, '').split(' ')[0] === n);
  if (idx === -1) return emit('There is no such corpse here.');
  const corpse = p.corpses[idx];
  const loot = corpse.def.loot || [];
  let gained = '';
  for (const itemId of loot) {
    addItem(p, itemId, 1);
    gained += ` ${itemByIdName(itemId)},`;
  }
  p.corpses.splice(idx, 1);
  const sk = skillRank(p, 'skinning');
  const leveled = gainSkillExp(p, 'skinning', corpse.def.circle * 4 + 5);
  emit(`You carefully skin ${corpse.def.name} and add ${gained || 'nothing'} to your pack.${leveled ? ' Your Skinning improved!' : ''}`);
}
