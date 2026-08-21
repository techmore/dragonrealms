// Item commands: inventory, gear, consumables, corpses, crime, crafting.
import { roomById } from '../../data/world.js';
import { ITEMS, itemById } from '../../data/items.js';
import { RECIPES, recipeById } from '../../data/recipes.js';
import { FORGE_RECIPES, forgeRecipeById, ENGINEER_RECIPES, engineerRecipeById, OUTFIT_RECIPES, outfittingRecipeById, qualityRoll } from '../../data/forging.js';
import { npcById } from '../../data/npcs.js';
import {
  skillRank, gainSkillExp, addItem, removeItem, removeItemInstances,
  equipItem, unequipItem, countItems, unlockAchievement, setRoundtime,
} from '../player.js';
import { pad, findInventoryItem, findSlotByItem, findNpcByName } from './util.js';

// Guild crafting affiliations (DR: free technique slots per discipline).
// A guild's crafters hold a natural edge in their traditional trades.
const CRAFT_AFFINITY = {
  forge: { barbarian: 3 },  // Weaponsmithing
  shape: { trader: 2 },     // Engineering
  tailor: { paladin: 3, ranger: 2 }, // Armorsmithing, Tailoring
  craft: { empath: 2 },     // Remedies
};

function craftAffinity(guildId, craft) {
  return (CRAFT_AFFINITY[craft] && CRAFT_AFFINITY[craft][guildId]) || 0;
}

export const commands = {
  inventory(ctx) { showInventory(ctx); },
  inv: showInventory,
  i: showInventory,

  get: getItem,
  take: getItem,

  search(ctx) {
    const { game, p, emit } = ctx;
    const res = game.searchCorpse(p);
    emit(res.msg);
  },

  drop(ctx) {
    const { game, p, arg1, arg2, emit } = ctx;
    if (!arg1) return emit('Drop what?');
    const qty = parseInt(arg2, 10) || 1;
    const item = findInventoryItem(p, arg1);
    if (!item) return emit('You do not have that.');
    const n = Math.min(qty, countItems(p, item.item.id));
    const instances = removeItemInstances(p, item.item.id, n, item);
    game.dropFloor(p.room, item.item.id, n, instances);
    emit(`You drop ${n > 1 ? `${n}x ` : ''}${item.item.name}.`);
  },

  wear: wearItem,
  wield: wearItem,

  repair(ctx) {
    const { p, arg1, emit } = ctx;
    if (p.room !== 'forge' && p.room !== 'tailor_shop') {
      return emit('Repair work happens at the Ember Forge or the Needle & Thread.');
    }
    const slot = findSlotByItem(p, arg1 || '');
    if (!slot) return emit('You must be wearing or wielding the piece to have it repaired.');
    const item = p.equipment[slot];
    const cond = item.condition ?? 100;
    if (cond >= 100) return emit(`${item.name} is in perfect condition — nothing to mend.`);
    const missing = 100 - cond;
    const cost = Math.max(5, Math.floor(missing * item.value / 100 * 2));
    if (p.silver < cost) return emit(`Repairing ${item.name} costs ${cost} silvers; you have ${p.silver}.`);
    p.silver -= cost;
    item.condition = 100;
    gainSkillExp(p, slot === 'hand' ? 'forging' : 'outfitting', 8);
    setRoundtime(p, 6);
    emit(`The ${slot === 'hand' ? 'hammer' : 'needle'} works over ${item.name} — it is as good as new (${cost} silvers).`);
  },

  remove(ctx) {
    const { p, arg1, emit } = ctx;
    const slot = findSlotByItem(p, arg1 || '');
    if (!slot) return emit('You are not wearing that.');
    const res = unequipItem(p, slot);
    if (res.ok) emit(`You remove ${res.item.name}.`);
  },

  use(ctx) { consume(ctx); },
  eat: consume,
  drink: consume,

  steal(ctx) {
    const { game, p, arg1, emit } = ctx;
    if (!arg1) return emit('Steal from whom?');
    const npc = findNpcByName(p, arg1);
    if (!npc) return emit('There is no such person here to steal from.');
    const risky = npc.id === 'guard';
    const skill = skillRank(p, 'thievery');
    const chance = Math.max(0.05, Math.min(0.85, 0.35 + skill * 0.02 + p.stats.agi * 0.005 - (risky ? 0.2 : 0)));
    setRoundtime(p, 4);
    if (Math.random() < chance) {
      const coins = 5 + Math.floor(Math.random() * (5 + p.circle * 3));
      p.silver += coins;
      const leveled = gainSkillExp(p, 'thievery', 8);
      // Justice zones: lawless wilds keep no ledger; the Guild District's
      // clerks write everything down twice.
      const zone = game.justiceZone(p);
      if (zone !== 'none') p.crimeHeat = (p.crimeHeat || 0) + (zone === 'strict' ? 2 : 1);
      // Paladins: thieving stains the soul (code of honor).
      if (p.guild.id === 'paladin') {
        p.soul = Math.max(0, (p.soul ?? 50) - 10);
        emit('A voice in your heart cries out — your oath wavers. (-10 soul)');
      }
      // A guard may spot the theft (justice: arrest -> jail -> plead).
      if (game.guardInRoom(p) && Math.random() < Math.min(0.6, 0.2 + p.crimeHeat * 0.1)) {
        return game.arrest(p);
      }
      // Crime flags you: your PvP stance is forced OPEN (DR justice).
      if (p.pvpStance !== 'open') {
        p.pvpStance = 'open';
        emit(`Your hand darts out and you lift ${coins} silvers from ${npc.name} unnoticed.${leveled ? ' Your Thievery improved!' : ''}\nWitnesses saw you! Your PvP stance is forced OPEN.`);
      } else {
        emit(`Your hand darts out and you lift ${coins} silvers from ${npc.name} unnoticed.${leveled ? ' Your Thievery improved!' : ''}`);
      }
    } else {
      const fine = Math.min(25, Math.floor(p.silver * (risky ? 0.15 : 0.05)));
      p.silver -= fine;
      gainSkillExp(p, 'thievery', 2);
      emit(risky
        ? `The guard's hand closes around your wrist! "Try that again and it's the stocks for you." You part with ${fine} silvers.`
        : `${npc.name.charAt(0).toUpperCase() + npc.name.slice(1)} catches your hand mid-reach! You stammer an apology and slip away, lighter by ${fine} silvers.`);
    }
  },

  pick: unlock,
  unlock,

  forge(ctx) {
    const { p, arg1, emit } = ctx;
    if (p.room !== 'forge') return emit('The hammer rings only at the Ember Forge, east of the brewery.');
    if (!arg1) {
      const rows = Object.values(FORGE_RECIPES).map((r) => `  ${pad(r.name, 24)} ${r.desc}`);
      return emit(`\nBram can teach you to forge:\n${rows.join('\n')}\n\nSay "forge <recipe>" — ore and materials are consumed on the attempt. Better Forging skill forges better steel.`);
    }
    const recipe = forgeRecipeById(arg1.toLowerCase()) || Object.values(FORGE_RECIPES).find((r) => r.name.toLowerCase().includes(arg1.toLowerCase()));
    if (!recipe) return emit('He does not know that recipe. Try "forge" for the list.');
    const forgeSkill = skillRank(p, 'forging');
    if (forgeSkill < recipe.minSkill) return emit(`That work needs ${recipe.minSkill} Forging skill; you have ${forgeSkill}. Practice on simpler pieces first.`);
    const missing = Object.entries(recipe.ingredients).filter(([ing, qty]) => countItems(p, ing) < qty);
    if (missing.length) {
      return emit(`You lack materials: ${missing.map(([ing, qty]) => `${qty}x ${ing.replace(/_/g, ' ')}`).join(', ')}. Ore drops from trolls, bandits, and the blackwood dead.`);
    }
    for (const [ing, qty] of Object.entries(recipe.ingredients)) removeItem(p, ing, qty);
    // Weaponsmithing affinity: barbarians wield the forge with a natural edge
    // (DR: 3 free technique slots in the Weaponsmithing discipline).
    const q = qualityRoll(forgeSkill + craftAffinity(p.guild.id, 'forge'));
    const leveled = gainSkillExp(p, 'forging', 12);
    const base = itemById(recipe.item);
    // Quality belongs to this concrete item, not every copy of its type.
    addItem(p, recipe.item, 1, { quality: q.mult, condition: 100 });
    // Keep the legacy map as a last-crafted compatibility view for scripts
    // and old saves; combat reads the equipped instance directly.
    p.forgedQuality = p.forgedQuality || {};
    p.forgedQuality[recipe.item] = q.mult;
    if (q.mult >= 1.3) unlockAchievement(p, 'master_crafter');
    setRoundtime(p, 6);
    emit(`You work the metal at the anvil and produce ${q.name} ${base.name}.${leveled ? ' Your Forging improved!' : ''} (${Math.round(q.roll * 100)}% mastery)`);
  },

  shape(ctx) {
    const { p, arg1, emit } = ctx;
    if (p.room !== 'forge') return emit('The workbench stands at the Ember Forge, east of the brewery.');
    if (!arg1) {
      const rows = Object.values(ENGINEER_RECIPES).map((r) => `  ${pad(r.name, 24)} ${r.desc}`);
      return emit(`\nBram can teach you to shape:\n${rows.join('\n')}\n\nSay "shape <recipe>" — materials are consumed on the attempt. Better Engineering shapes better wood and steel.`);
    }
    const recipe = engineerRecipeById(arg1.toLowerCase()) || Object.values(ENGINEER_RECIPES).find((r) => r.name.toLowerCase().includes(arg1.toLowerCase()));
    if (!recipe) return emit('He does not know that pattern. Try "shape" for the list.');
    const skill = skillRank(p, 'engineering');
    if (skill < recipe.minSkill) return emit(`That work needs ${recipe.minSkill} Engineering skill; you have ${skill}. Practice on simpler pieces first.`);
    const missing = Object.entries(recipe.ingredients).filter(([ing, qty]) => countItems(p, ing) < qty);
    if (missing.length) {
      return emit(`You lack materials: ${missing.map(([ing, qty]) => `${qty}x ${ing.replace(/_/g, ' ')}`).join(', ')}. Ore and scale drop in the wilds.`);
    }
    for (const [ing, qty] of Object.entries(recipe.ingredients)) removeItem(p, ing, qty);
    const q = qualityRoll(skill + craftAffinity(p.guild.id, 'shape'));
    const leveled = gainSkillExp(p, 'engineering', 12);
    const base = itemById(recipe.item);
    addItem(p, recipe.item, 1, { quality: q.mult, condition: 100 });
    p.forgedQuality = p.forgedQuality || {};
    p.forgedQuality[recipe.item] = q.mult;
    if (q.mult >= 1.3) unlockAchievement(p, 'master_crafter');
    setRoundtime(p, 6);
    emit(`You shape the materials into ${q.name} ${base.name}.${leveled ? ' Your Engineering improved!' : ''} (${Math.round(q.roll * 100)}% mastery)`);
  },

  tailor(ctx) {
    const { p, arg1, emit } = ctx;
    if (p.room !== 'tailor_shop') return emit('The cutting table stands at the Needle & Thread, off the West Road.');
    if (!arg1) {
      const rows = Object.values(OUTFIT_RECIPES).map((r) => `  ${pad(r.name, 24)} ${r.desc}`);
      return emit(`\nMara can teach you to tailor:\n${rows.join('\n')}\n\nSay "tailor <recipe>" — hides are consumed on the attempt. Better Outfitting cuts better leather.`);
    }
    const recipe = outfittingRecipeById(arg1.toLowerCase()) || Object.values(OUTFIT_RECIPES).find((r) => r.name.toLowerCase().includes(arg1.toLowerCase()));
    if (!recipe) return emit('She does not know that pattern. Try "tailor" for the list.');
    const skill = skillRank(p, 'outfitting');
    if (skill < recipe.minSkill) return emit(`That work needs ${recipe.minSkill} Outfitting skill; you have ${skill}. Practice on simpler pieces first.`);
    const missing = Object.entries(recipe.ingredients).filter(([ing, qty]) => countItems(p, ing) < qty);
    if (missing.length) {
      return emit(`You lack materials: ${missing.map(([ing, qty]) => `${qty}x ${ing.replace(/_/g, ' ')}`).join(', ')}. Pelts come from the hunt.`);
    }
    for (const [ing, qty] of Object.entries(recipe.ingredients)) removeItem(p, ing, qty);
    const q = qualityRoll(skill + craftAffinity(p.guild.id, 'tailor'));
    const leveled = gainSkillExp(p, 'outfitting', 12);
    const base = itemById(recipe.item);
    addItem(p, recipe.item, 1, { quality: q.mult, condition: 100 });
    p.forgedQuality = p.forgedQuality || {};
    p.forgedQuality[recipe.item] = q.mult;
    if (q.mult >= 1.3) unlockAchievement(p, 'master_crafter');
    setRoundtime(p, 6);
    emit(`You cut and stitch ${q.name} ${base.name}.${leveled ? ' Your Outfitting improved!' : ''} (${Math.round(q.roll * 100)}% mastery)`);
  },

  craft(ctx) {
    const { p, arg1, emit } = ctx;
    const room = roomById(p.room);
    const alchemist = (room.npcs || []).map(npcById).find((n) => n && n.role === 'craft');
    if (!alchemist) return emit('There is no alchemist here. Try the Tilted Retort, north of Market Way.');
    if (!arg1) {
      const rows = Object.values(RECIPES).map((r) => `  ${pad(r.name, 18)} ${r.desc}`);
      return emit(`\n${alchemist.name} can craft:\n${rows.join('\n')}\n\nSay "craft <recipe>" — ingredients are consumed on the attempt.`);
    }
    const recipe = recipeById(arg1.toLowerCase()) || Object.values(RECIPES).find((r) => r.name.toLowerCase().includes(arg1.toLowerCase()));
    if (!recipe) return emit('He does not know that recipe. Try "craft" for the list.');
    const missing = Object.entries(recipe.ingredients).filter(([ing, qty]) => countItems(p, ing) < qty);
    if (missing.length) {
      return emit(`You lack ingredients: ${missing.map(([ing, qty]) => `${qty}x ${ing.replace(/_/g, ' ')}`).join(', ')}.`);
    }
    for (const [ing, qty] of Object.entries(recipe.ingredients)) removeItem(p, ing, qty);
    const skill = skillRank(p, 'alchemy');
    const chance = Math.min(0.95, 0.5 + (skill + craftAffinity(p.guild.id, 'craft')) * 0.03 + p.stats.wis * 0.003);
    const leveled = gainSkillExp(p, 'alchemy', 10);
    setRoundtime(p, 6);
    if (Math.random() < chance) {
      addItem(p, recipe.item, 1);
      emit(`You carefully combine the ingredients and produce ${itemById(recipe.item).name}!${leveled ? ' Your Alchemy improved!' : ''}`);
    } else {
      emit(`The mixture boils over, ruined.${leveled ? ' Still, your Alchemy improved!' : ''}`);
    }
  },
};

function showInventory(ctx) {
  const { p, say } = ctx;
  const lines = p.inventory.map((e) => `${e.qty > 1 ? `${e.qty}x ` : ''}${e.item.name}`);
  const worn = Object.values(p.equipment).map((i) => i.name);
  const out = [
    `\nYou are carrying:${lines.length ? '\n  ' + lines.join('\n  ') : ' nothing.'}`,
    `Worn: ${worn.length ? worn.join(', ') : 'nothing'}.`,
    `Silvers: ${p.silver}.`,
  ].join('\n');
  say(out);
}

function getItem(ctx) {
  const { game, p, arg1, arg2, rest, emit } = ctx;
  if (!arg1) return emit('Get what?');
  const from = rest.toLowerCase().indexOf(' from ');
  if (from >= 0) {
    const itemName = rest.slice(0, from).trim();
    const res = game.retrieveFromCorpse(p, itemName);
    emit(res.msg);
    return;
  }
  const qty = parseInt(arg2, 10) || 1;
  const floor = game.findFloorItem(p.room, rest.replace(/^(all )?/, ''));
  if (!floor) return emit('There is no such thing here.');
  if (floor.corpse) return emit(`That is ${floor.name} — search it for belongings.`);
  const take = Math.min(qty, floor.qty);
  const metadata = floor.instances
    ? floor.instances.splice(0, take)
    : { condition: floor.condition, quality: floor.quality };
  addItem(p, floor.item.id, take, metadata);
  floor.qty -= take;
  if (floor.qty <= 0) {
    game.floorItems.get(p.room).splice(game.floorItems.get(p.room).indexOf(floor), 1);
  }
  emit(`You pick up ${take > 1 ? `${take}x ` : ''}${floor.item.name}.`);
}

function wearItem(ctx) {
  const { p, arg1, emit } = ctx;
  const entry = findInventoryItem(p, arg1 || '');
  if (!entry) return emit('You do not have that.');
  const res = equipItem(p, entry);
  if (!res.ok) return emit(res.error);
  emit(`You equip ${entry.item.name}.`);
}

function unlock(ctx) {
  const { p, arg1, emit } = ctx;
  const entry = findInventoryItem(p, arg1 || '');
  if (!entry || entry.item.id !== 'strongbox') return emit('Pick what? You need a locked strongbox — check the loot of kobolds and bandits.');
  removeItem(p, 'strongbox', 1);
  const skill = skillRank(p, 'lockpicking');
  const chance = Math.max(0.1, Math.min(0.9, 0.4 + skill * 0.03 + p.stats.agi * 0.005));
  setRoundtime(p, 5);
  if (Math.random() < chance) {
    const coins = 20 + p.circle * 5 + Math.floor(Math.random() * 20);
    p.silver += coins;
    const leveled = gainSkillExp(p, 'lockpicking', 10);
    emit(`You work the lock and the box springs open, revealing ${coins} silvers!${leveled ? ' Your Locksmithing improved!' : ''}`);
  } else {
    const leveled = gainSkillExp(p, 'lockpicking', 4);
    emit(`The lock defies your picks.${leveled ? ' Still, your Locksmithing improved!' : ''}`);
  }
}

const CHUG_TIMER_MS = 30 * 1000;

function consume(ctx) {
  const { game, p, arg1, emit } = ctx;
  const entry = findInventoryItem(p, arg1 || '');
  if (!entry) return emit('You do not have that.');
  if (entry.item.id === 'warhorn') {
    const res = game.warhorn(p);
    emit(res.msg);
    return;
  }
  if (entry.item.type !== 'consumable') return emit('You cannot use that.');
  // Battlefield healing: no drinking in the middle of a fight (DR).
  if (p.combatId) return emit('You cannot drink or eat in the middle of a fight!');
  // Chug timer: gulping down draughts back-to-back upsets the stomach (DR).
  if (p.potionAt && Date.now() - p.potionAt < CHUG_TIMER_MS) {
    const secs = Math.ceil((CHUG_TIMER_MS - (Date.now() - p.potionAt)) / 1000);
    return emit(`Your stomach is still settling from the last draught (${secs}s).`);
  }
  p.potionAt = Date.now();
  setRoundtime(p, 3);
  removeItem(p, entry.item.id, 1);
  if (entry.item.buff) {
    for (const [k, v] of Object.entries(entry.item.buff)) p.buffs[k] = v;
    emit(`You drink ${entry.item.name}. A wave of power washes over you!`);
    return;
  }
  const before = p.hp;
  if (entry.item.restore) p.hp = Math.min(p.maxHp, p.hp + entry.item.restore);
  const healed = p.hp - before;
  const manaBefore = p.mana;
  if (entry.item.restoreMana) p.mana = Math.min(p.maxMana, p.mana + entry.item.restoreMana);
  const manaGained = p.mana - manaBefore;
  emit(`You use ${entry.item.name}${healed ? ` and restore ${healed} health` : ''}${manaGained ? ` and ${manaGained} mana` : ''}.`);
  gainSkillExp(p, 'first_aid', 2);
  if (/potion|draught|tonic/i.test(entry.item.name)) gainSkillExp(p, 'arcana', 3);
}
