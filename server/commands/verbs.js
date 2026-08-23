// Shared command verbs routed across domain modules. Extracted so the
// command modules don't chain imports (combat -> magic -> items ->
// character): each verb lives here with its own dependencies, and the
// per-module registries import from this one file.
import { roomById } from '../../data/world.js';
import { npcById } from '../../data/npcs.js';
import {
  spellById, spellSlotCost, spellSlotsTotal, spellSlotsUsed,
} from '../../data/guilds.js';
import {
  CRAFT_TECHNIQUES, craftSlotsFor,
} from '../../data/forging.js';
import { pad } from '../util.js';
import { skillRank, totalBurden, netBurden, carryAllowance } from '../player.js';

export function loadWord(p) {
  const total = totalBurden(p);
  const allow = carryAllowance(p);
  const frac = allow > 0 ? total / allow : total > 0 ? Infinity : 0;
  if (total <= 0) return 'unburdened';
  if (netBurden(p) >= 6) return 'overloaded';
  if (frac >= 1.25) return 'heavily laden';
  if (frac >= 1) return 'laden';
  if (frac >= 0.6) return 'burdened';
  return 'lightly loaded';
}

const VERB_SKILL = { forge: 'forging', shape: 'engineering', tailor: 'outfitting', craft: 'alchemy', enchant: 'enchanting' };

// Guild crafting affiliations (DR: free technique slots per discipline).
const CRAFT_AFFINITY = {
  forge: { barbarian: 3 },  // Weaponsmithing
  shape: { trader: 2 },     // Engineering
  tailor: { paladin: 3, ranger: 2 }, // Armorsmithing, Tailoring
  craft: { empath: 2 },     // Remedies
  enchant: { warmage: 2, moonmage: 2 }, // Artificing/Binding
};

const CRAFT_TECH_COST = 75;
const ORDER_VERBS = {
  forge: { npc: 'the forge-master' },
  shape: { npc: 'the engineer' },
  tailor: { npc: 'the outfitter' },
  craft: { npc: 'the herbalist' },
  enchant: { npc: 'the artificer' },
};

function craftAffinity(guildId, craft) {
  return (CRAFT_AFFINITY[craft] && CRAFT_AFFINITY[craft][guildId]) || 0;
}

function knownCraftTechs(p, skill) {
  return ((p.craftTechs || {})[skill]) || [];
}

export function stationVerbs(p) {
  if (p.room === 'forge') return ['forge'];
  if (p.room === 'tailor_shop') return ['tailor'];
  const room = roomById(p.room);
  return (room && (room.npcs || []).some((id) => npcById(id)?.role === 'craft')) ? ['craft'] : [];
}

// Spell learning for magic guilds, routed from combat.js's `learn` verb
// (barbarians keep it for abilities). Teaches a circle-reached spell at the
// guild hall while the slot budget allows.
export function learnSpell(ctx) {
  const { game, p, arg1, emit } = ctx;
  const guild = p.guild;
  if (!guild.magic) return emit('Your guild forswears magic.');
  const spell = spellById(guild, arg1);
  if (!spell) {
    const names = (guild.spells || []).map((s) => s.name.toLowerCase()).join(', ');
    return emit(`Your guild teaches: ${names}. ("slots" shows your budget.)`);
  }
  const room = roomById(p.room);
  if (!room || !(room.id === `hall_${guild.id}` || room.id === 'rh_guilds')) {
    return emit('You must stand in your own guild hall to learn spells.');
  }
  if (spell.minCircle > p.circle) return emit(`Your masters will not teach ${spell.name} until circle ${spell.minCircle}.`);
  const forgotten = Array.isArray(p.spellsForgotten) ? p.spellsForgotten : [];
  if (!forgotten.includes(spell.id)) return emit(`You already hold ${spell.name}.`);
  const total = spellSlotsTotal(guild, p.circle);
  const used = spellSlotsUsed(guild, p.circle, forgotten);
  const cost = spellSlotCost(spell);
  if (used + cost > total) {
    return emit(`No room in your mind: ${spell.name} needs ${cost} slots, you have ${total - used} free. Forget a spell first ("forget <spell>").`);
  }
  p.spellsForgotten = forgotten.filter((id) => id !== spell.id);
  if (!p.spellsKnown.includes(spell.id)) p.spellsKnown.push(spell.id);
  game.persistPlayer(p);
  emit(`Your masters walk you through the forms. \x1b[1m${spell.name}\x1b[0m is yours (${used + cost}/${total} spell slots).`);
}

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
