// Item commands: inventory, gear, consumables, corpses, crime, crafting.
import { roomById } from '../../data/world.js';
import { db } from '../db.js';
import { ITEMS, itemById } from '../../data/items.js';
import { RECIPES, recipeById } from '../../data/recipes.js';
import { FORGE_RECIPES, forgeRecipeById, ENGINEER_RECIPES, engineerRecipeById, OUTFIT_RECIPES, outfittingRecipeById, qualityRoll, QUALITY_LADDER, CRAFT_TECHNIQUES, craftSlotsFor } from '../../data/forging.js';
import { ENCHANT_RECIPES, enchantRecipeById } from '../../data/enchanting.js';

// ---- Work orders (P26): craft NPCs post piecework; quality matters. ----
const ORDER_VERBS = {
  forge: { npc: 'Bram', skill: 'forging', recipes: FORGE_RECIPES },
  shape: { npc: 'Bram', skill: 'engineering', recipes: ENGINEER_RECIPES },
  tailor: { npc: 'Mara', skill: 'outfitting', recipes: OUTFIT_RECIPES },
  craft: { npc: 'Fennel', skill: 'alchemy', recipes: RECIPES },
};
const ROOM_VERBS = {
  forge: ['forge', 'shape'],
  tailor_shop: ['tailor'],
};

function stationVerbs(p) {
  if (p.room === 'forge') return ROOM_VERBS.forge;
  if (p.room === 'tailor_shop') return ROOM_VERBS.tailor_shop;
  const room = roomById(p.room);
  return (room && (room.npcs || []).some((id) => npcById(id)?.role === 'craft')) ? ['craft'] : [];
}
export { stationVerbs };

function qualityNameFor(mult) {
  return (QUALITY_LADDER.find((q) => Math.abs(q.mult - mult) < 0.001) || {}).name || 'serviceable';
}

// Called after a successful craft: consumes the output into an active work
// order when verb/recipe/quality all match. Returns a message or null.
function completeOrderStep(p, verb, recipeId, qMult) {
  const o = p.workOrder;
  if (!o || o.done || o.verb !== verb || o.recipeId !== recipeId) return null;
  if (o.qualMult && qMult != null && qMult < o.qualMult) return null;
  o.done = true;
  return `You set it aside for ${o.npc}'s order — "order claim" collects your ${o.pay} silvers.`;
}
import { npcById } from '../../data/npcs.js';
import {
  skillRank, gainSkillExp, addItem, removeItem, removeItemInstances,
  equipItem, unequipItem, countItems, unlockAchievement, setRoundtime,
  isStackableItem,
} from '../player.js';
import { pad, findInventoryItem, findSlotByItem, findNpcByName } from './util.js';
import { loadWord } from './character.js';

// Guild crafting affiliations (DR: free technique slots per discipline).
// A guild's crafters hold a natural edge in their traditional trades.
const CRAFT_AFFINITY = {
  forge: { barbarian: 3 },  // Weaponsmithing
  shape: { trader: 2 },     // Engineering
  tailor: { paladin: 3, ranger: 2 }, // Armorsmithing, Tailoring
  craft: { empath: 2 },     // Remedies
  enchant: { warmage: 2, moonmage: 2 }, // Artificing/Binding
};

function craftAffinity(guildId, craft) {
  return (CRAFT_AFFINITY[craft] && CRAFT_AFFINITY[craft][guildId]) || 0;
}

// Loose hides, pelts, and shells can be bundled for easier carrying.
const BUNDLEABLE = new Set([
  'rat_pelt', 'crab_shell', 'reed_skin', 'kobold_skin', 'hog_hide', 'goblin_skin',
  'wolf_pelt', 'troll_hide', 'cinder_scale', 'iron_ore',
]);
function isBundleable(item) {
  return item && BUNDLEABLE.has(item.id);
}

// ---- Crafting techniques (P26) ----
const CRAFT_TECH_COST = 75;
const VERB_SKILL = { forge: 'forging', shape: 'engineering', tailor: 'outfitting', craft: 'alchemy', enchant: 'enchanting' };

function knownCraftTechs(p, skill) {
  return ((p.craftTechs || {})[skill]) || [];
}

function hasCraftTech(p, techId) {
  const def = CRAFT_TECHNIQUES[techId];
  return def ? knownCraftTechs(p, def.skill).includes(techId) : false;
}

// Sum of learned quality-effect magnitudes for a crafting skill.
function craftQualityBonus(p, skill) {
  let bonus = 0;
  for (const id of knownCraftTechs(p, skill)) {
    const t = CRAFT_TECHNIQUES[id];
    if (t && t.effect.kind === 'quality') bonus += t.effect.mag;
  }
  return bonus;
}

// Work-order pay multiplier from learned order-effect techniques.
function craftOrderMultiplier(p, skill) {
  let mult = 1;
  for (const id of knownCraftTechs(p, skill)) {
    const t = CRAFT_TECHNIQUES[id];
    if (t && t.effect.kind === 'order') mult += t.effect.mag;
  }
  return mult;
}

function craftBrewBonus(p) {
  let bonus = 0;
  for (const id of knownCraftTechs(p, 'alchemy')) {
    const t = CRAFT_TECHNIQUES[id];
    if (t && t.effect.kind === 'brew') bonus += t.effect.mag;
  }
  return bonus;
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

  // bundle <item> [qty]: wrap loose goods (pelts, hides, ore) into one compact
  // bale. Bundled weight is a fraction of loose — the DR pack-rat ritual.
  bundle(ctx) {
    const { p, arg1, arg2, emit } = ctx;
    if (!arg1) return emit('Bundle what? ("bundle <item> [qty]" — pelts and hides only)');
    const entry = findInventoryItem(p, arg1);
    if (!entry || !isBundleable(entry.item)) {
      return emit('Only loose skins, pelts, and hides can be bundled.');
    }
    if (entry.bundle) return emit('That is already a tidy bundle.');
    const have = countItems(p, entry.item.id);
    const n = Math.max(1, Math.min(parseInt(arg2, 10) || have, have));
    removeItem(p, entry.item.id, n);
    addItem(p, entry.item.id, n, { bundle: { bundled: n } });
    emit(`You fold and tie ${n > 1 ? `${n}x ` : ''}${entry.item.name}${n > 1 ? 's' : ''} into one compact bundle. Much easier to carry.`);
  },

  unbundle(ctx) {
    const { p, arg1, emit } = ctx;
    const entry = findInventoryItem(p, arg1 || '');
    if (!entry || !entry.bundle) return emit('You are carrying no such bundle.');
    entry.bundle = null; // cut the ties: weight returns
    db.prepare('UPDATE inventory SET bundle=NULL WHERE id=?').run(entry.id);
    emit(`You cut the ties on the ${entry.item.name.replace(/^a /, '')} bundle — it sprawls back to full bulk.`);
  },

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

  // Work orders (P26): take piecework from the craft NPC at this station,
  // fill it with a qualifying craft, claim the pay.
  order(ctx) {
    const { game, p, arg1, arg2, emit } = ctx;
    const sub = (arg1 || '').toLowerCase();
    const verbs = stationVerbs(p);
    if (!verbs.length) return emit('No craft station here. Work orders post at the Ember Forge, the Needle & Thread, and the Tilted Retort.');

    if (sub === 'abandon') {
      if (!p.workOrder) return emit('You carry no work order.');
      p.workOrder = null;
      game.persistPlayer(p);
      return emit('You set the work order aside. No coin for unfinished work.');
    }

    if (sub === 'claim') {
      const o = p.workOrder;
      if (!o) return emit('You carry no work order.');
      if (!verbs.includes(o.verb)) return emit(`That order posts at ${o.npc}'s station.`);
      if (!o.done) {
        const def = ORDER_VERBS[o.verb].recipes[o.recipeId];
        const need = o.qualMult ? `${o.qualName} or better` : 'any serviceable batch';
        return emit(`Not yet filled: ${def ? def.name : o.recipeId}, ${need}. ${o.pay} silvers on delivery.`);
      }
      const pay = Math.round(o.pay * craftOrderMultiplier(p, ORDER_VERBS[o.verb].skill));
      p.silver += pay;
      gainSkillExp(p, ORDER_VERBS[o.verb].skill, 18);
      p.workOrder = null;
      game.persistPlayer(p);
      return emit(`${o.npc} inspects the work, nods once, and counts out \x1b[1m${pay} silvers\x1b[0m. "Good hands. Come back when you're hungry."`);
    }

    // Take an order (or show the active one).
    const o = p.workOrder;
    if (o) {
      const def = ORDER_VERBS[o.verb].recipes[o.recipeId];
      if (o.done) return emit(`Filled and waiting: ${def ? def.name : o.recipeId} for ${o.npc} — "order claim" at their station (${o.pay} silvers).`);
      const need = o.qualMult ? `${o.qualName} or better` : 'any serviceable batch';
      return emit(`Active order: ${def ? def.name : o.recipeId} (${need}) for ${o.npc} — ${o.pay} silvers on delivery. "order abandon" to drop it.`);
    }
    // Build candidates across this station's verbs, reachable within +4 skill.
    const candidates = [];
    for (const verb of verbs) {
      const { skill, recipes } = ORDER_VERBS[verb];
      const rank = skillRank(p, skill);
      for (const r of Object.values(recipes)) {
        if (r.minSkill <= rank + 4) candidates.push({ verb, recipe: r, rank });
      }
    }
    if (!candidates.length) return emit('Nothing posts here that you could yet craft. Practice your trade and return.');
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const req = pick.rank < 8 ? QUALITY_LADDER[2] : pick.rank < 20 ? QUALITY_LADDER[3] : QUALITY_LADDER[4]; // average / well-crafted / masterfully
    const alchemy = pick.verb === 'craft';
    const pay = Math.round((25 + pick.recipe.minSkill * 3) * (alchemy ? 1 : req.mult) * 1.15);
    p.workOrder = {
      verb: pick.verb,
      recipeId: pick.recipe.id,
      qualMult: alchemy ? null : req.mult,
      qualName: alchemy ? 'serviceable' : req.name,
      pay,
      npc: ORDER_VERBS[pick.verb].npc,
      done: false,
    };
    game.persistPlayer(p);
    emit(p.workOrder.qualMult
      ? `\n${p.workOrder.npc} posts a work order: "\x1b[1m${pick.recipe.name}\x1b[0m — ${p.workOrder.qualName} or better. ${pay} silvers on delivery." Craft it here, then "order claim".`
      : `\n${p.workOrder.npc} posts a work order: "\x1b[1m${pick.recipe.name}\x1b[0m — a serviceable batch. ${pay} silvers on delivery." Brew it here, then "order claim".`);
  },

  forge(ctx) {
    const { p, rest, emit } = ctx;
    const arg1 = rest || '';
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
    const q = qualityRoll(forgeSkill + craftAffinity(p.guild.id, 'forge') + craftQualityBonus(p, 'forging'));
    const leveled = gainSkillExp(p, 'forging', 12);
    const base = itemById(recipe.item);
    // Quality belongs to this concrete item, not every copy of its type.
    const orderMsg = completeOrderStep(p, 'forge', recipe.id, q.mult);
    if (!orderMsg) addItem(p, recipe.item, 1, { quality: q.mult, condition: 100, maker: p.name });
    // Keep the legacy map as a last-crafted compatibility view for scripts
    // and old saves; combat reads the equipped instance directly.
    p.forgedQuality = p.forgedQuality || {};
    p.forgedQuality[recipe.item] = q.mult;
    if (q.mult >= 1.3) unlockAchievement(p, 'master_crafter');
    setRoundtime(p, 6);
    emit(`You work the metal at the anvil and produce ${q.name} ${base.name}.${leveled ? ' Your Forging improved!' : ''} (${Math.round(q.roll * 100)}% mastery)${orderMsg ? `\n${orderMsg}` : ''}`);
  },

  shape(ctx) {
    const { p, rest, emit } = ctx;
    const arg1 = rest || '';
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
    const q = qualityRoll(skill + craftAffinity(p.guild.id, 'shape') + craftQualityBonus(p, 'engineering'));
    const leveled = gainSkillExp(p, 'engineering', 12);
    const base = itemById(recipe.item);
    const orderMsg = completeOrderStep(p, 'shape', recipe.id, q.mult);
    if (!orderMsg) addItem(p, recipe.item, 1, { quality: q.mult, condition: 100, maker: p.name });
    p.forgedQuality = p.forgedQuality || {};
    p.forgedQuality[recipe.item] = q.mult;
    if (q.mult >= 1.3) unlockAchievement(p, 'master_crafter');
    setRoundtime(p, 6);
    emit(`You shape the materials into ${q.name} ${base.name}.${leveled ? ' Your Engineering improved!' : ''} (${Math.round(q.roll * 100)}% mastery)${orderMsg ? `\n${orderMsg}` : ''}`);
  },

  tailor(ctx) {
    const { p, rest, emit } = ctx;
    const arg1 = rest || '';
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
    const q = qualityRoll(skill + craftAffinity(p.guild.id, 'tailor') + craftQualityBonus(p, 'outfitting'));
    const leveled = gainSkillExp(p, 'outfitting', 12);
    const base = itemById(recipe.item);
    const orderMsg = completeOrderStep(p, 'tailor', recipe.id, q.mult);
    if (!orderMsg) addItem(p, recipe.item, 1, { quality: q.mult, condition: 100, maker: p.name });
    p.forgedQuality = p.forgedQuality || {};
    p.forgedQuality[recipe.item] = q.mult;
    if (q.mult >= 1.3) unlockAchievement(p, 'master_crafter');
    setRoundtime(p, 6);
    emit(`You cut and stitch ${q.name} ${base.name}.${leveled ? ' Your Outfitting improved!' : ''} (${Math.round(q.roll * 100)}% mastery)${orderMsg ? `\n${orderMsg}` : ''}`);
  },

  // Enchanting (P26, last discipline): bind raw magic (wisp motes) into a
  // crafted base piece at the Enchanting Society. Output carries a magicEdge.
  imbue(ctx) {
    const { p, rest, emit } = ctx;
    const arg1 = rest || '';
    if (p.room !== 'enchanting_soc') return emit('The binding circle stands in the Enchanting Society, west of the Northeast Gate.');
    if (!arg1) {
      const rows = Object.values(ENCHANT_RECIPES).map((r) => `  ${pad(r.name, 24)} ${r.desc}`);
      return emit(`\nThe Society's binding circle can enspell:\n${rows.join('\n')}\n\nSay "enchant <recipe>" — the base piece and motes are consumed on the attempt. Better Enchanting holds a stronger edge.`);
    }
    const recipe = enchantRecipeById(arg1.toLowerCase()) || Object.values(ENCHANT_RECIPES).find((r) => r.name.toLowerCase().includes(arg1.toLowerCase()));
    if (!recipe) return emit('The circle will not take that form. Try "enchant" for the list.');
    const skill = skillRank(p, 'enchanting');
    if (skill < recipe.minSkill) return emit(`That binding needs ${recipe.minSkill} Enchanting skill; you have ${skill}. Study simpler bindings first.`);
    const missing = Object.entries(recipe.ingredients).filter(([ing, qty]) => countItems(p, ing) < qty);
    if (missing.length) {
      return emit(`You lack materials: ${missing.map(([ing, qty]) => `${qty}x ${ing.replace(/_/g, ' ')}`).join(', ')}. Craft the base piece and gather motes from the wilds.`);
    }
    for (const [ing, qty] of Object.entries(recipe.ingredients)) removeItem(p, ing, qty);
    const q = qualityRoll(skill + craftAffinity(p.guild.id, 'enchant') + craftQualityBonus(p, 'enchanting'));
    const leveled = gainSkillExp(p, 'enchanting', 12);
    const base = itemById(recipe.item);
    // Quality sharpens the magic edge as well as the base stats.
    addItem(p, recipe.item, 1, { quality: q.mult, condition: 100, maker: p.name });
    p.forgedQuality = p.forgedQuality || {};
    p.forgedQuality[recipe.item] = q.mult;
    setRoundtime(p, 6);
    emit(`Chalk flares; the mote unravels into ${base.name}, bound with a ${q.name} edge.${leveled ? ' Your Enchanting improved!' : ''} (${Math.round(q.roll * 100)}% mastery)`);
  },

  craft(ctx) {
    const { p, rest, emit } = ctx;
    const arg1 = rest || '';
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
    const chance = Math.min(0.95, 0.5 + (skill + craftAffinity(p.guild.id, 'craft')) * 0.03 + p.stats.wis * 0.003 + craftBrewBonus(p));
    const leveled = gainSkillExp(p, 'alchemy', 10);
    setRoundtime(p, 6);
    if (Math.random() < chance) {
      const orderMsg = completeOrderStep(p, 'craft', recipe.id, null);
      if (!orderMsg) addItem(p, recipe.item, 1, { maker: p.name });
      emit(`You carefully combine the ingredients and produce ${itemById(recipe.item).name}!${leveled ? ' Your Alchemy improved!' : ''}${orderMsg ? `\n${orderMsg}` : ''}`);
    } else {
      emit(`The mixture boils over, ruined.${leveled ? ' Still, your Alchemy improved!' : ''}`);
    }
  },
};

// Crafting techniques: list and learn at the matching station. Routed from
// magic.js's `technique` verb when the player stands at a craft station.
export function craftTechnique(ctx) {
  const { game, p, arg1, arg2, emit } = ctx;
  const verbs = stationVerbs(p);
  const skills = [...new Set(verbs.map((v) => VERB_SKILL[v]))];
  const slotsFor = (skill) => craftSlotsFor(skillRank(p, skill), craftAffinity(p.guild.id, verbOfSkill(skill)) > 0);
  const verbOfSkill = (skill) => verbs.find((v) => VERB_SKILL[v] === skill);

  if (arg1 && arg1.toLowerCase() === 'learn') {
    const name = (arg2 || '').toLowerCase();
    const def = Object.values(CRAFT_TECHNIQUES).find((t) => skills.includes(t.skill) && (t.id === name || t.name.toLowerCase().includes(name)));
    if (!def) return emit('No such technique posts here. "technique" lists what this station teaches.');
    const skill = def.skill;
    const known = knownCraftTechs(p, skill);
    if (known.includes(def.id)) return emit(`You already practice ${def.name}.`);
    if (skillRank(p, skill) < def.minRank) return emit(`${def.name} requires ${def.minRank} ${skill} ranks; you have ${skillRank(p, skill)}.`);
    if (known.length >= slotsFor(skill)) return emit(`Your ${skill} slots are full (${known.length}/${slotsFor(skill)}). Higher ${skill} ranks open more.`);
    if (p.silver < CRAFT_TECH_COST) return emit(`Learning ${def.name} costs ${CRAFT_TECH_COST} silvers, and you are short.`);
    p.silver -= CRAFT_TECH_COST;
    p.craftTechs = p.craftTechs || {};
    p.craftTechs[skill] = known.concat(def.id);
    game.persistPlayer(p);
    const teacher = ORDER_VERBS[verbOfSkill(skill)].npc;
    return emit(`${teacher} watches your hands, adjusts your grip, and names it: \x1b[1m${def.name}\x1b[0m — ${def.desc} (${known.length + 1}/${slotsFor(skill)} ${skill} slots, ${p.silver} silvers left).`);
  }

  // List what this station offers.
  let out = '';
  for (const skill of skills) {
    const known = knownCraftTechs(p, skill);
    const rank = skillRank(p, skill);
    const lines = Object.values(CRAFT_TECHNIQUES)
      .filter((t) => t.skill === skill)
      .map((t) => `  ${pad(t.name, 20)} [rank ${t.minRank}] ${t.desc}${known.includes(t.id) ? '  \x1b[1m[known]\x1b[0m' : ''}`);
    out += `\n\x1b[1m${skill}\x1b[0m — ${known.length}/${slotsFor(skill)} slots (${rank} ranks):\n${lines.join('\n')}`;
  }
  emit(`\nTechniques of the trade:${out}\n\nSay "technique learn <name>" here (${CRAFT_TECH_COST} silvers each).`);
}

function showInventory(ctx) {
  const { p, say } = ctx;
  const lines = p.inventory.map((e) =>
    `${e.qty > 1 ? `${e.qty}x ` : ''}${e.item.name}${e.bundle ? ' [bundled]' : ''}`);
  const worn = Object.values(p.equipment).map((i) => i.name);
  const out = [
    `\nYou are carrying:${lines.length ? '\n  ' + lines.join('\n  ') : ' nothing.'}`,
    `Worn: ${worn.length ? worn.join(', ') : 'nothing'}.`,
    `You are ${loadWord(p)}.`,
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
  // Crafted potency stacks with field training: First Aid ranks make every
  // draught and salve work better (DR: Field Medicine feel).
  const aidMult = 1 + Math.min(0.25, skillRank(p, 'first_aid') * 0.005);
  const potency = (hasCraftTech(p, 'potent_essence') ? 1 + CRAFT_TECHNIQUES.potent_essence.effect.mag : 1) * aidMult;
  const before = p.hp;
  if (entry.item.restore) p.hp = Math.min(p.maxHp, p.hp + Math.ceil(entry.item.restore * potency));
  const healed = p.hp - before;
  const manaBefore = p.mana;
  if (entry.item.restoreMana) p.mana = Math.min(p.maxMana, p.mana + Math.ceil(entry.item.restoreMana * potency));
  const manaGained = p.mana - manaBefore;
  emit(`You use ${entry.item.name}${healed ? ` and restore ${healed} health` : ''}${manaGained ? ` and ${manaGained} mana` : ''}.`);
  gainSkillExp(p, 'first_aid', 2);
  if (/potion|draught|tonic/i.test(entry.item.name)) gainSkillExp(p, 'arcana', 3);
}
