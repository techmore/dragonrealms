// Command parsing and handlers.
import { roomById } from '../data/world.js';
import { guildById, circleRequirements, circleRequirementSummary, guildTrainedSkills, trainableSkills, spellsFor, spellById, guildTitle, capstoneFor } from '../data/guilds.js';
import { SKILLS, CATEGORIES, totalRanks, expToNextRank, mindstate } from '../data/skills.js';
import { manaTypeFor, manaCycle, roomManaLevel, manaDescriptor, safeOverchannelPct, backfireChance } from '../data/mana.js';
import { barbarianAbilityById, barbarianAbilitiesFor, barbarianSlots, ABILITY_PATHS, VOICE_POOL, FORGET_COOLDOWN_MS } from '../data/abilities.js';
import { ITEMS, itemById } from '../data/items.js';
import { RECIPES, recipeById } from '../data/recipes.js';
import { npcById } from '../data/npcs.js';
import { creatureById } from '../data/creatures.js';
import { db } from './db.js';
import {
  skillRank, gainSkillExp, addItem, removeItem, equipItem, unequipItem,
  weaponOf, totalArmor, countItems, STAT_NAMES, MAX_STAT, defenseSkillOf,
  STANCES, STANCE_COSTS, stancePoints, statRaiseCost, tdpTrainCost, tdpAwardFor, setAlias, removeAlias,
} from './player.js';

const DIR_ALIASES = {
  n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e', w: 'w', west: 'w',
  ne: 'ne', northeast: 'ne', nw: 'nw', northwest: 'nw', se: 'se', southeast: 'se',
  sw: 'sw', southwest: 'sw', u: 'u', up: 'u', d: 'd', down: 'd',
};

const HELP = `
\x1b[1mDragon Realms — quick help\x1b[0m
  Movement:  n, s, e, w, ne, nw, se, sw, u, d  |  go north  |  look (l)
  Combat:    attack <creature>  |  cast [spell] [target]  |  retreat  |  skin <creature>
  Magic:     spells  (lists what your guild teaches)  |  perceive  (sense room mana)  |  harness  (gather mana)  |  prepare <spell> [pct]  (then "cast"; overchanneling risks backlash)  |  charge/invoke <cambrinth>  (store and release energy)
  Powers:    berserk (Barbarian)  |  form/roar/meditate <ability>  (barbarian)  |  whirlwind/stomp/choke/analyze (barbarian)  |  backstab (Thief)
  Abilities: abilities  (list barbarian arts)  |  learn <ability>  (at the barbarian hall)  |  ask <leader> about forgetting <ability>
  Items:     get <item>  |  drop <item>  |  inventory (i)  |  wear/wield <item>  |  remove <item>  |  use <item>
  Death:     die in battle and you awaken at the temple — your gear lies with your corpse; search <corpse>, get <item> from corpse
  Shops:     list  |  buy <item> [qty]  |  sell <item> [qty]  |  deposit/withdraw <silvers>
  Training:  train <skill>  (pay silvers to advance guild skills)  |  circle  (at your guild hall)
  TDPs:      tdp  |  raise <stat>  |  tdptrain <skill>  (training points from rank-ups)
  Combat:    attack <creature> | ambush <creature> (from hiding) | cast [spell] [target] | retreat | skin <creature>
  Stances:   stance aggressive | defensive | guarded | balanced  (costs stance points)
  Quests:    quest  |  claim  (work for the town crier)
  PvP:       duel <player>  |  accept/decline <player>  (wilds only)
  Scripting: alias <name> <command>  |  use ";" to chain commands  (client: macro / timer)
  Wilds:     forage  (gather herbs)  |  hunt  (scan for prey)  |  ladder  (rank bands)  |  track  (read the signs)  |  hide  |  rest  (recover)
  Skills:    perform  (practice performance)  |  appraise  (study an item or creature)
  Crime:     steal <npc>  (lift coin, town)  |  pick <strongbox>  (work the lock on looted boxes)
  NPCs:      ask <npc> <topic>  (try "ask crier help")
  Character: score  |  skills  |  exp  |  alloc <stat> <amount>
  Social:    say <text>  |  emote <text>  |  shout <text>  |  who  |  time
  Misc:      help  |  save  |  quit
`.trim();

const STAT_FULL = {
  str: 'Strength', con: 'Constitution', ref: 'Reflex', agi: 'Agility',
  cha: 'Charisma', dis: 'Discipline', wis: 'Wisdom', int: 'Intelligence',
};

export function handleCommand(game, p, input, depth = 0) {
  if (depth > 4) return;
  let line = String(input || '').trim();
  if (!line) return;

  // Multi-command strings: "cast fire; retreat" executes in sequence.
  if (line.includes(';')) {
    const parts = line.split(';').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) handleCommand(game, p, part, depth + 1);
      return;
    }
  }

  // Alias expansion.
  const first = line.split(/\s+/)[0].toLowerCase();
  if (first !== 'alias' && first !== 'unalias' && p.aliases && p.aliases[first]) {
    const rest = line.slice(first.length).trim();
    const restParts = rest.split(/\s+/).filter(Boolean);
    let cmd = p.aliases[first];
    let usedArg = false;
    for (let i = 1; i <= 9; i++) {
      const next = cmd.replace(new RegExp('\\$' + i, 'g'), restParts[i - 1] || '');
      if (next !== cmd) usedArg = true;
      cmd = next;
    }
    if (!usedArg && rest) cmd = `${cmd} ${rest}`;
    handleCommand(game, p, cmd, depth + 1);
    return;
  }

  const args = line.split(/\s+/);
  const cmd = args[0].toLowerCase();
  const rest = args.slice(1).join(' ');
  const arg1 = args[1];
  const arg2 = args[2];

  const say = (msg) => p.ws.send(JSON.stringify({ t: 'msg', msg }));
  const emit = (msg) => { say(msg); game.status(p); };

  switch (cmd) {
    // ---- Movement ----
    case 'go': {
      const dir = DIR_ALIASES[arg1 && arg1.toLowerCase()];
      if (!dir) return emit('Go where? Try a direction (n, s, e, w, u, d).');
      const res = game.move(p, dir);
      if (!res.ok) emit(res.msg);
      break;
    }
    default: {
      const dir = DIR_ALIASES[cmd];
      if (dir) {
        const res = game.move(p, dir);
        if (!res.ok) emit(res.msg);
        break;
      }
      // fall through to other commands
      handleOther(game, p, cmd, arg1, arg2, rest, args, say, emit);
    }
  }
}

function handleOther(game, p, cmd, arg1, arg2, rest, args, say, emit) {
  switch (cmd) {
    // ---- Look / inspect ----
    case 'look': case 'l': {
      if (arg1 && arg1 !== 'around' && arg1 !== 'at') {
        const dir = DIR_ALIASES[arg1.toLowerCase()];
        if (dir) {
          const res = game.lookDirection(p, dir);
          emit(res.msg);
        } else {
          lookAt(game, p, arg1, say);
        }
      } else {
        game.look(p);
      }
      break;
    }
    case 'quest': case 'claim': {
      if (!game.hasCrier(p) && cmd === 'quest' && !p.quest) {
        return emit('Ask the town crier for work — he stands in the town square.');
      }
      if (cmd === 'claim') {
        const res = game.questClaim(p);
        emit(res.msg);
        break;
      }
      if (!p.quest) {
        const q = game.assignQuest(p);
        const def = creatureById(q.creatureId);
        say(`\nThe crier nods. "The town's overrun with ${def.plural}. Slay ${q.count} ${def.plural} and I'll see you paid."`);
        break;
      }
      if (p.quest.done) {
        const res = game.questClaim(p);
        emit(res.msg);
        break;
      }
      const def = creatureById(p.quest.creatureId);
      say(`\nQuest: slay ${p.quest.count} more ${def.plural}. Return to the crier when done.`);
      break;
    }
    case 'forage': {
      const res = game.forage(p);
      emit(res.msg);
      break;
    }
    case 'track': {
      const res = game.track(p);
      emit(res.msg);
      break;
    }
    case 'hunt': {
      const res = game.hunt(p);
      emit(res.msg);
      break;
    }
    case 'ladder': {
      emit(game.ladder());
      break;
    }
    case 'hide': {
      if (!game.isWild(p.room)) return emit('There is nowhere to hide in town.');
      if (p.combatId && p.guild.id !== 'thief') return emit('Only thieves can vanish into the chaos of a fight.');
      const thief = p.guild.id === 'thief' ? 2 : 1;
      const leveled = gainSkillExp(p, 'hiding', 5 * thief);
      const leveled2 = gainSkillExp(p, 'stealth', 5 * thief);
      p.hidden = true;
      emit(`You melt into the shadows of the ${game.zoneName(p.room)}.${p.combatId ? ' Your foes lose sight of you...' : ''}${leveled ? ' Your Hiding improved!' : ''}${leveled2 ? ' Your Stealth improved!' : ''}`);
      break;
    }
    case 'ambush': {
      if (!p.hidden) return emit('You must be hiding to ambush. Try "hide" first.');
      let combat = game.combat.getFor(p);
      if (combat && combat.defender === p) return emit('You are locked in an automatic duel.');
      let uid = combat ? combat.playerTarget : null;
      if (!combat) {
        const creature = arg1 ? game.findCreature(p.room, arg1) : null;
        if (creature) {
          game.startCombat(p, [creature.def]);
          combat = game.combat.getFor(p);
          uid = combat.playerTarget;
        } else {
          return emit('There is nothing to ambush here. Try "attack <creature>" first.');
        }
      }
      combat.ambushAttack(uid);
      game.status(p);
      break;
    }
    case 'study': {
      if (p.room !== 'temple' && p.room !== 'temple_row') return emit('You need books. The Temple of the Pantheon keeps a library.');
      const leveled = gainSkillExp(p, 'scholarship', 10);
      const leveled2 = gainSkillExp(p, 'appraisal', 2);
      emit(`You pore over a dusty tome of lore.${leveled ? ' Your Scholarship improved!' : ''}${leveled2 ? ' Your Appraisal improved!' : ''}`);
      break;
    }
    case 'perform': case 'sing': {
      const n = p.guild.id === 'bard' ? 2 : 1;
      const leveled = gainSkillExp(p, 'performance', 5 * n);
      const flavor = ['a somber dirge', 'a bawdy tavern tune', 'an old war ballad', 'a wordless hum'][Math.floor(Math.random() * 4)];
      emit(`You perform ${flavor} for a moment, filling the air with your voice.${leveled ? ' Your Performance improved!' : ''}`);
      break;
    }
    case 'appraise': case 'appr': {
      if (!arg1) return emit('Appraise what? Look around, name an item you carry, or a creature here.');
      const n = arg1.toLowerCase();
      const inv = findInventoryItem(p, n);
      const eq = Object.values(p.equipment).find((i) => i.name.includes(n));
      const creature = game.findCreature(p.room, n);
      const leveled = gainSkillExp(p, 'appraisal', 4);
      let target;
      if (inv) target = `${inv.item.name} (worth about ${inv.item.value} silvers)`;
      else if (eq) target = `${eq.name} (worth about ${eq.value} silvers)`;
      else if (creature) target = `${creature.def.name.charAt(0).toUpperCase() + creature.def.name.slice(1)} — looks like it could be skinned for a few silvers`;
      else return emit('You cannot appraise that.');
      emit(`You appraise ${target}.${leveled ? ' Your Appraisal improved!' : ''}`);
      break;
    }
    case 'rest': {
      const res = game.startRest(p);
      emit(res.msg);
      break;
    }
    case 'stand': case 'wake': {
      game.stopRest(p);
      emit('You rise to your feet.');
      break;
    }

    // ---- Inventory / items ----
    case 'inventory': case 'inv': case 'i': {
      showInventory(p, say);
      break;
    }
    case 'get': case 'take': {
      if (!arg1) return emit('Get what?');
      const from = rest.toLowerCase().indexOf(' from ');
      if (from >= 0) {
        const itemName = rest.slice(0, from).trim();
        const res = game.retrieveFromCorpse(p, itemName);
        emit(res.msg);
        break;
      }
      const qty = parseInt(arg2, 10) || 1;
      const floor = game.findFloorItem(p.room, rest.replace(/^(all )?/, ''));
      if (!floor) return emit('There is no such thing here.');
      if (floor.corpse) return emit(`That is ${floor.name} — search it for belongings.`);
      const take = Math.min(qty, floor.qty);
      addItem(p, floor.item.id, take);
      floor.qty -= take;
      if (floor.qty <= 0) {
        game.floorItems.get(p.room).splice(game.floorItems.get(p.room).indexOf(floor), 1);
      }
      emit(`You pick up ${take > 1 ? `${take}x ` : ''}${floor.item.name}.`);
      break;
    }
    case 'search': {
      const res = game.searchCorpse(p);
      emit(res.msg);
      break;
    }
    case 'drop': {
      if (!arg1) return emit('Drop what?');
      const qty = parseInt(arg2, 10) || 1;
      const item = findInventoryItem(p, arg1);
      if (!item) return emit('You do not have that.');
      const n = Math.min(qty, item.qty);
      removeItem(p, item.item.id, n);
      game.dropFloor(p.room, item.item.id, n);
      emit(`You drop ${n > 1 ? `${n}x ` : ''}${item.item.name}.`);
      break;
    }
    case 'wear': case 'wield': {
      const entry = findInventoryItem(p, arg1 || '');
      if (!entry) return emit('You do not have that.');
      const res = equipItem(p, entry);
      if (!res.ok) return emit(res.error);
      emit(`You equip ${entry.item.name}.`);
      break;
    }
    case 'remove': {
      const slot = findSlotByItem(p, arg1 || '');
      if (!slot) return emit('You are not wearing that.');
      const res = unequipItem(p, slot);
      if (res.ok) emit(`You remove ${res.item.name}.`);
      break;
    }
    case 'use': case 'eat': case 'drink': {
      const entry = findInventoryItem(p, arg1 || '');
      if (!entry) return emit('You do not have that.');
      if (entry.item.id === 'warhorn') {
        const res = game.warhorn(p);
        emit(res.msg);
        break;
      }
      if (entry.item.type !== 'consumable') return emit('You cannot use that.');
      removeItem(p, entry.item.id, 1);
      if (entry.item.buff) {
        for (const [k, v] of Object.entries(entry.item.buff)) p.buffs[k] = v;
        emit(`You drink ${entry.item.name}. A wave of power washes over you!`);
        break;
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
      break;
    }
    case 'craft': {
      const room = roomById(p.room);
      const alchemist = (room.npcs || []).map(npcById).find((n) => n && n.role === 'craft');
      if (!alchemist) return emit('There is no alchemist here. Try the Tilted Retort, east of Market Way.');
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
      const chance = Math.min(0.95, 0.5 + skill * 0.03 + p.stats.wis * 0.003);
      const leveled = gainSkillExp(p, 'alchemy', 10);
      if (Math.random() < chance) {
        addItem(p, recipe.item, 1);
        emit(`You carefully combine the ingredients and produce ${itemById(recipe.item).name}!${leveled ? ' Your Alchemy improved!' : ''}`);
      } else {
        emit(`The mixture boils over, ruined.${leveled ? ' Still, your Alchemy improved!' : ''}`);
      }
      break;
    }

    // ---- Combat ----
    case 'attack': case 'kill': {
      if (!arg1) return emit('Attack what?');
      const combat = game.combat.getFor(p);
      if (combat && combat.defender === p) {
        return emit('You are locked in an automatic duel. Type "retreat" to yield.');
      }
      const creature = game.findCreature(p.room, arg1);
      if (!creature) return emit('There is no such creature here.');
      if (combat) {
        if (combat.setTarget(creature.uid)) {
          if (p.hidden) {
            combat.ambushAttack(creature.uid);
          } else {
            emit(`You focus your attack on ${creature.def.name}.`);
          }
        }
      } else {
        game.startCombat(p, [creature.def]);
        if (p.hidden) {
          const c2 = game.combat.getFor(p);
          if (c2) c2.ambushAttack(c2.playerTarget);
        }
      }
      break;
    }
    case 'prepare': {
      const guild = p.guild;
      if (!guild.magic || !guild.spells || !guild.spells.length) return emit('Your guild forswears magic.');
      const resolved = spellById(guild, arg1);
      const spell = resolved || spellsFor(guild, p.circle)[0];
      if (!spell) return emit('You do not know any spells yet.');
      if (spell.minCircle > p.circle) return emit(`You learn ${spell.name} at circle ${spell.minCircle}.`);
      const pct = Math.min(300, Math.max(100, parseInt(arg2, 10) || 100));
      p.prepared = { spellId: spell.id, pct };
      const safe = safeOverchannelPct(skillRank(p, 'primary_magic'));
      const risk = backfireChance(pct, safe) > 0 ? ' — overchanneling risks backlash!' : '';
      const leveled = gainSkillExp(p, 'primary_magic', 4);
      emit(`You begin preparing ${spell.name} at ${pct}% power (${Math.ceil(spell.mana * pct / 100)} mana).${risk}${leveled ? ' Your Primary Magic improved!' : ''} Say "cast" to release it.`);
      break;
    }
    case 'cast': {
      const guild = p.guild;
      if (!guild.magic || !guild.spells || !guild.spells.length) return emit('You do not know any spells.');
      const combatNow = game.combat.getFor(p);
      if (combatNow && combatNow.defender === p) {
        return emit('You are locked in an automatic duel and cannot cast. Type "retreat" to yield.');
      }
      const prepared = p.prepared;
      const resolved = spellById(guild, arg1);
      const spell = prepared
        ? spellById(guild, prepared.spellId)
        : (resolved || spellsFor(guild, p.circle)[0]);
      const pct = prepared ? prepared.pct : 100;
      const targetName = prepared ? arg1 : (resolved ? arg2 : arg1);
      if (!spell) return emit('You do not know any spells yet.');
      if (spell.minCircle > p.circle) return emit(`You learn ${spell.name} at circle ${spell.minCircle}.`);
      const cost = Math.ceil(spell.mana * pct / 100);
      if (p.mana < cost) return emit(`You need ${cost} mana to cast ${spell.name}.`);
      const safe = safeOverchannelPct(skillRank(p, 'primary_magic'));
      if (backfireChance(pct, safe) > 0 && Math.random() < backfireChance(pct, safe)) {
        p.mana -= Math.floor(cost * 0.6);
        p.prepared = null;
        const dmg = Math.max(1, Math.floor((pct - safe) / 5));
        p.hp = Math.max(1, p.hp - dmg);
        gainSkillExp(p, 'primary_magic', 4);
        emit(`Your spell pattern tears apart mid-weave! You suffer arcane backlash for ${dmg} damage.`);
        game.status(p);
        break;
      }
      if (prepared) p.prepared = null;
      const mult = pct / 100;

      // Self-cast spells work without a target.
      if (['heal', 'flee', 'teleport', 'buff'].includes(spell.kind)) {
        const combat = game.combat.getFor(p);
        if (combat) {
          combat.cast(spell, null, mult);
          game.status(p);
        } else if (spell.kind === 'heal') {
          const skill = skillRank(p, spell.skill);
          let amount = Math.round((spell.base + skill * 3) * mult);
          if ((p.heldMana || 0) > 0) {
            amount += Math.min(spell.base || 8, Math.floor(p.heldMana * 0.2));
            p.heldMana = 0;
            emit('Your held mana floods the spell, empowering it!');
          }
          const before = p.hp;
          p.hp = Math.min(p.maxHp, p.hp + amount);
          p.mana -= cost;
          gainSkillExp(p, spell.skill, 8);
          gainSkillExp(p, 'attunement', 3);
          gainSkillExp(p, 'primary_magic', 5);
          if (p.guild.guildSkill) gainSkillExp(p, p.guild.guildSkill, 5);
          emit(`You cast ${spell.name} and mend yourself for ${p.hp - before} health.`);
        } else if (spell.kind === 'buff') {
          p.mana -= cost;
          p.buffs = p.buffs || {};
          p.buffs[spell.buff.key] = (p.buffs[spell.buff.key] || 0) + spell.buff.ticks;
          gainSkillExp(p, spell.skill, 14);
          gainSkillExp(p, 'attunement', 8);
          gainSkillExp(p, 'primary_magic', 5);
          if (p.guild.guildSkill) gainSkillExp(p, p.guild.guildSkill, 5);
          emit(`You cast ${spell.name}! ${spell.buff.key === 'frenzy' ? 'Your blood boils.' : 'A shroud settles over you.'}`);
        } else {
          emit('You are not in combat to use that spell now.');
        }
        break;
      }

      let combat = game.combat.getFor(p);
      let uid = combat ? combat.playerTarget : null;
      if (!combat) {
        const creature = targetName ? game.findCreature(p.room, targetName) : null;
        if (creature) {
          game.startCombat(p, [creature.def]);
          combat = game.combat.getFor(p);
          uid = combat.playerTarget;
        } else {
          return emit('There is nothing to cast at. Try "attack <creature>" first.');
        }
      }
      combat.cast(spell, uid, mult);
      game.status(p);
      break;
    }
    case 'spells': {
      const guild = p.guild;
      if (!guild.magic) return emit('Your guild forswears magic.');
      const known = spellsFor(guild, p.circle);
      const later = (guild.spells || []).filter((s) => s.minCircle > p.circle);
      let msg = `\nSpells known at circle ${p.circle}:`;
      msg += known.length
        ? '\n' + known.map((s) => `  ${s.name} — ${s.mana} mana (${s.desc})`).join('\n')
        : '  none yet.';
      if (later.length) msg += `\nYou will learn: ${later.map((s) => `${s.name} (circle ${s.minCircle})`).join(', ')}.`;
      say(msg);
      break;
    }
    case 'perceive': {
      const { type, def } = manaTypeFor(p.guild);
      if (type === 'none') {
        return emit('You close your eyes and feel nothing — no mana stirs for your kind. The wild power of your own blood is all you need.');
      }
      const room = roomById(p.room);
      const zone = room ? room.zone : 'town';
      const level = roomManaLevel(p.guild, zone);
      const bonus = Math.min(0.3, skillRank(p, 'attunement') * 0.002);
      const tide = manaCycle(type) > 0.62 ? ' waxing' : manaCycle(type) < 0.38 ? ' waning' : '';
      const leveled = gainSkillExp(p, 'attunement', 3);
      emit(`You reach out with your senses... ${def.desc} The ${def.name.toLowerCase()} mana here flows ${manaDescriptor(level + bonus)}${tide} (${Math.floor(level * 100)}% base).${leveled ? ' Your Attunement improved!' : ''}`);
      break;
    }
    case 'harness': {
      const { type, def } = manaTypeFor(p.guild);
      if (type === 'none') {
        return emit('Harness what? Your guild commands no mana.');
      }
      const room = roomById(p.room);
      const zone = room ? room.zone : 'town';
      const level = roomManaLevel(p.guild, zone);
      if (level < 0.12) return emit('The mana here is too thin to harness.');
      const cap = 10 + skillRank(p, 'attunement') * 2;
      const before = p.heldMana || 0;
      const gain = Math.floor(8 + level * 10 + skillRank(p, 'attunement') * 0.4);
      p.heldMana = Math.min(cap, before + gain);
      const leveled = gainSkillExp(p, 'attunement', 6);
      emit(`You draw ${p.heldMana - before} points of ${def.name.toLowerCase()} mana into your grasp (holding ${p.heldMana}/${cap}).${leveled ? ' Your Attunement improved!' : ''}`);
      break;
    }

    // ---- Cambrinth devices ----
    case 'charge': case 'invoke': case 'focus': {
      const entry = findInventoryItem(p, arg1 || '');
      if (!entry || entry.item.type !== 'cambrinth') {
        return emit(cmd === 'charge' ? 'Charge what? You need a cambrinth device.' : cmd === 'invoke' ? 'Invoke what? You need a cambrinth device.' : 'Focus on what?');
      }
      const { type, def } = manaTypeFor(p.guild);
      if (type === 'none') return emit('You cannot work cambrinth — your guild commands no mana.');
      if (p.cambrinth && p.cambrinth.itemId === entry.item.id && Date.now() - p.cambrinth.updatedAt > 500000) {
        const leaked = Math.floor(p.cambrinth.charge / 8);
        if (leaked > 0) {
          p.cambrinth.charge -= leaked;
          p.cambrinth.updatedAt = Date.now();
          emit(`Stored energy seeps from ${entry.item.name} over time (${leaked} points lost).`);
        }
      }

      if (cmd === 'focus') {
        if (!p.cambrinth || p.cambrinth.itemId !== entry.item.id || p.cambrinth.charge <= 0) {
          return emit('It sits inert — no energy stored.');
        }
        emit(`You focus on ${entry.item.name}: it holds ${p.cambrinth.charge}/${p.cambrinth.capacity} points of ${p.cambrinth.manaType} energy.`);
        break;
      }

      if (cmd === 'invoke') {
        if (!p.cambrinth || p.cambrinth.itemId !== entry.item.id || p.cambrinth.charge <= 0) {
          return emit('It holds no stored energy. Charge it first.');
        }
        const cap = 10 + skillRank(p, 'attunement') * 2;
        const space = cap - (p.heldMana || 0);
        if (space <= 0) return emit('You cannot hold any more mana right now.');
        const gain = Math.min(space, p.cambrinth.charge);
        p.heldMana = (p.heldMana || 0) + gain;
        p.cambrinth.charge -= gain;
        const manaType = p.cambrinth.manaType;
        if (p.cambrinth.charge <= 0) p.cambrinth = null;
        const leveled = gainSkillExp(p, 'arcana', 6);
        emit(`You invoke ${entry.item.name}, drawing ${gain} points of ${manaType} energy into your grasp (holding ${p.heldMana}/${cap}).${leveled ? ' Your Arcana improved!' : ''}`);
        break;
      }

      // charge
      const oldType = p.cambrinth && p.cambrinth.itemId === entry.item.id ? p.cambrinth.manaType : null;
      if (oldType && oldType !== type) {
        const old = oldType;
        removeItem(p, entry.item.id, 1);
        p.cambrinth = null;
        const dmg = Math.floor(p.maxHp * 0.2);
        p.hp = Math.max(1, p.hp - dmg);
        emit(`The ${entry.item.name} shrieks and EXPLODES — it was attuned to ${old} mana, not ${type}! You take ${dmg} damage.`);
        break;
      }
      if (p.mana < 5) return emit('You do not have enough mana to charge it.');
      const cap = entry.item.capacity;
      const current = p.cambrinth && p.cambrinth.itemId === entry.item.id ? p.cambrinth.charge : 0;
      const space = cap - current;
      if (space <= 0) return emit('It is already brimming with stored energy.');
      const efficiency = Math.min(1, 0.5 + skillRank(p, 'arcana') * 0.0025);
      const spend = Math.min(p.mana, Math.floor(space / Math.max(0.1, efficiency)));
      const stored = Math.floor(spend * efficiency);
      p.mana -= spend;
      p.cambrinth = { itemId: entry.item.id, charge: Math.min(cap, current + stored), capacity: cap, manaType: type, updatedAt: Date.now() };
      const leveled = gainSkillExp(p, 'arcana', 8);
      emit(`You charge ${entry.item.name} with ${stored} points of ${def.name.toLowerCase()} mana (${p.cambrinth.charge}/${cap}).${leveled ? ' Your Arcana improved!' : ''}`);
      break;
    }
    case 'retreat': case 'flee': {
      const combat = game.combat.getFor(p);
      if (!combat) return emit('You are not in combat.');
      if (combat.defender === p) combat.defenderRetreat();
      else combat.retreat();
      break;
    }
    case 'duel': {
      if (!arg1) return emit('Usage: duel <playername> — challenges them to a duel (wilds only).');
      const res = game.challengeDuel(p, arg1);
      emit(res.msg);
      break;
    }
    case 'accept': {
      if (!arg1) return emit('Usage: accept <playername>');
      const res = game.acceptDuel(p, arg1);
      emit(res.msg);
      break;
    }
    case 'decline': {
      if (!arg1) return emit('Usage: decline <playername>');
      const res = game.declineDuel(p, arg1);
      emit(res.msg);
      break;
    }
    case 'berserk': {
      if (p.guild.id !== 'barbarian') return emit('Only barbarians know the fury.');
      const combat = game.combat.getFor(p);
      if (!combat) return emit('The fury stirs only in battle.');
      combat.toggleBerserk();
      gainSkillExp(p, 'expertise', 4);
      break;
    }
    case 'abilities': case 'ability': {
      if (p.guild.id !== 'barbarian') return emit('Only barbarians wield inner fire abilities.');
      const slots = barbarianSlots(p.circle);
      const used = (p.abilities || []).length;
      const rows = barbarianAbilitiesFor(p).map((a) => {
        const state = a.learned ? 'known' : a.learnable ? 'learnable' : a.known ? 'free' : `needs ${a.req} ${ABILITY_PATHS[a.path]} path`;
        return `  ${pad(a.name, 22)} [${a.kind}] ${a.path ? `${ABILITY_PATHS[a.path]} · ` : ''}${state} — ${a.desc}`;
      });
      say(`\n\x1b[1mBarbarian abilities\x1b[0m (${used}/${slots} slots)\nVoice: ${p.voice}/${VOICE_POOL}\n${rows.join('\n')}\n\nLearn new abilities at the barbarian hall: "learn <ability>".`);
      break;
    }
    case 'learn': {
      if (p.guild.id !== 'barbarian') return emit('Only barbarians learn inner fire abilities.');
      if (roomById(p.room).id !== 'hall_barbarian') return emit('Abilities are taught at the barbarian guildhall.');
      if (!arg1) return emit('Learn what? See "abilities".');
      const def = barbarianAbilityById(arg1.toLowerCase());
      if (!def) return emit('No such barbarian ability.');
      if (def.known || (p.abilities || []).includes(def.id)) return emit(`You already know ${def.name}.`);
      if (game.combat.getFor(p)) return emit('Not while in combat.');
      const slots = barbarianSlots(p.circle);
      if ((p.abilities || []).length >= slots) {
        return emit(`You have no free ability slots (${(p.abilities || []).length}/${slots}). Circle higher to earn more.`);
      }
      const inPath = (p.abilities || []).filter((id) => {
        const a = barbarianAbilityById(id);
        return a && a.path === def.path;
      }).length;
      if (inPath < def.req) {
        return emit(`${def.name} requires ${def.req} ${def.path ? ABILITY_PATHS[def.path] : 'Flame'} path abilit${def.req === 1 ? 'y' : 'ies'} known first.`);
      }
      p.abilities = [...(p.abilities || []), def.id];
      emit(`You focus on the rage within and master \x1b[1m${def.name}\x1b[0m. (${(p.abilities || []).length}/${slots} slots)`);
      break;
    }
    case 'form': case 'roar': case 'meditate': {
      if (p.guild.id !== 'barbarian') return emit('Only barbarians know these arts.');
      const kind = cmd === 'meditate' ? 'meditation' : cmd;
      const def = arg1 ? barbarianAbilityById(arg1.toLowerCase()) : null;
      if (!def || def.kind !== kind) return emit(`Usage: ${cmd} <ability>. See "abilities".`);
      if (!(p.abilities || []).includes(def.id)) return emit(`You have not learned ${def.name}.`);
      const combat = game.combat.getFor(p);
      if (!combat) return emit('That takes battle around you.');
      const targetName = (arg2 || '').toLowerCase();
      const target = combat.aliveEnemies.find((e) =>
        e.def.id === targetName || e.def.name.includes(targetName) || e.def.plural.includes(targetName)
      )?.uid;
      const res = combat.useAbility(def, target);
      if (!res.ok) emit(res.msg);
      break;
    }
    case 'whirlwind': case 'stomp': case 'choke': case 'analyze': {
      if (p.guild.id !== 'barbarian') return emit('Only barbarians know this art.');
      const combat = game.combat.getFor(p);
      if (!combat) return emit('That takes battle around you.');
      let res;
      if (cmd === 'whirlwind') {
        const def = barbarianAbilityById('whirlwind');
        if (!(p.abilities || []).includes(def.id)) return emit(`You have not learned ${def.name}.`);
        if (p.circle < def.minCircle) return emit(`${def.name} unlocks at circle ${def.minCircle}.`);
        res = combat.whirlwind();
      } else if (cmd === 'stomp') {
        const def = barbarianAbilityById('war_stomp');
        if (!(p.abilities || []).includes(def.id)) return emit(`You have not learned ${def.name}.`);
        if (p.circle < def.minCircle) return emit(`${def.name} unlocks at circle ${def.minCircle}.`);
        res = combat.warStomp();
      } else if (cmd === 'choke') {
        const def = barbarianAbilityById('choke');
        if (!(p.abilities || []).includes(def.id)) return emit(`You have not learned ${def.name}.`);
        if (p.circle < def.minCircle) return emit(`${def.name} unlocks at circle ${def.minCircle}.`);
        res = combat.choke();
      } else {
        const kind = (arg1 || 'flame').toLowerCase();
        if (!['flame', 'accuracy', 'damage'].includes(kind)) return emit('Analyze what? Try "analyze flame", "analyze accuracy", or "analyze damage".');
        res = combat.analyze(kind);
      }
      if (!res.ok) emit(res.msg);
      break;
    }
    case 'belch': {
      if (p.guild.id === 'barbarian') {
        emit(['You let out a belch that echoes off the walls, deep and satisfied.', 'A mighty belch rumbles out of you. The warchief would be proud.', 'You belch. Somewhere, a goblin takes it as a challenge.'][Math.floor(Math.random() * 3)]);
      } else {
        emit('You burp quietly and mumble an apology.');
      }
      break;
    }
    case 'shake': case 'shakehand': {
      if (p.guild.id === 'barbarian' && arg1) {
        emit(`You seize ${arg1}'s hand in a grip like iron and grind it once, firmly. A proper barbarian greeting.`);
      } else if (p.guild.id === 'barbarian') {
        emit('You shake your own hand, practicing the proper barbarian grip. It feels right.');
      } else {
        emit(arg1 ? `You shake hands with ${arg1}.` : 'You shake hands with the air. Perhaps greet someone first.');
      }
      break;
    }
    case 'backstab': {
      if (p.guild.id !== 'thief') return emit('Only thieves know this art.');
      const combat = game.combat.getFor(p);
      if (!combat) return emit('You need a target in combat.');
      combat.backstab();
      break;
    }
    case 'disarm': case 'trip': case 'bash': case 'shield-bash': {
      const kind = (cmd === 'bash' || cmd === 'shield-bash') ? 'bash' : cmd;
      let combat = game.combat.getFor(p);
      if (combat && combat.defender === p) return emit('You are locked in an automatic duel.');
      let uid = combat ? combat.playerTarget : null;
      if (!combat) {
        const creature = arg1 ? game.findCreature(p.room, arg1) : null;
        if (creature) {
          game.startCombat(p, [creature.def]);
          combat = game.combat.getFor(p);
          uid = combat.playerTarget;
        } else {
          return emit(`There is nothing to ${kind} here. Try "attack <creature>" first.`);
        }
      }
      combat.maneuver(kind, uid);
      break;
    }
    case 'skin': {
      skinCreature(game, p, arg1, say, emit);
      break;
    }

    // ---- Shops / services ----
    case 'list': {
      const res = game.listShop(p);
      emit(res.msg);
      break;
    }
    case 'buy': {
      if (!arg1) return emit('Buy what?');
      const qty = parseInt(arg2, 10) || 1;
      const res = game.buy(p, arg1, qty);
      emit(res.msg);
      break;
    }
    case 'sell': {
      if (!arg1) return emit('Sell what?');
      const qty = parseInt(arg2, 10) || 1;
      const res = game.sell(p, arg1, qty);
      emit(res.msg);
      break;
    }
    case 'deposit': {
      const amt = parseInt(arg1, 10);
      if (!amt) return emit('Deposit how many silvers?');
      const res = game.deposit(p, amt);
      emit(res.msg);
      break;
    }
    case 'withdraw': {
      const amt = parseInt(arg1, 10);
      if (!amt) return emit('Withdraw how many silvers?');
      const res = game.withdraw(p, amt);
      emit(res.msg);
      break;
    }
    case 'heal': {
      const res = game.heal(p);
      emit(res.msg);
      break;
    }

    // ---- Training / circles ----
    case 'circle': case 'train': {
      if (cmd === 'circle') return circleUp(game, p, say, emit);
      if (!arg1) return emit('Train what? Usage: train <skill>. See "skills" for your list.');
      const skillId = matchSkill(arg1);
      if (!skillId) return emit('I do not know that skill. See "skills" for the list.');
      const trainer = game.guildTrainer(p);
      if (!trainer) return emit('Your guild trainer is not here. Go to your guild hall in the Guild District.');
      if (!trainableSkills(p.guild).includes(skillId)) {
        return emit(`${trainer.name} does not teach that skill. Your guild trains: ${trainableSkills(p.guild).join(', ')}.`);
      }
      const rank = skillRank(p, skillId);
      const cost = 40 + rank * 20;
      if (p.silver < cost) return emit(`Training ${SKILLS[skillId].name} costs ${cost} silvers, and you have ${p.silver}. Go hunt!`);
      p.silver -= cost;
      gainSkillExp(p, skillId, Math.floor(expToNextRank(rank) * 0.4));
      emit(`${trainer.name} drills you in ${SKILLS[skillId].name}. You make progress toward rank ${skillRank(p, skillId) + 1} (${cost} silvers).`);
      break;
    }
    case 'tdp': {
      const pool = p.tdpPool || 0;
      say(`\n\x1b[1mTraining Points (TDPs)\x1b[0m: ${p.tdp}  (pool ${pool}/200 toward the next)\nEarn TDPs as your skills rise in rank and from circling. Spend them on:\n  raise <stat>      permanently raise a stat\n  tdptrain <skill>  train any skill directly`);
      break;
    }
    case 'raise': {
      if (!arg1) return emit('Usage: raise <stat> — spends TDPs to permanently raise a stat.');
      const stat = STAT_NAMES.includes(arg1.toLowerCase()) ? arg1.toLowerCase() : null;
      if (!stat) return emit('Unknown stat. Choose: ' + STAT_NAMES.join(', '));
      if (p.stats[stat] >= MAX_STAT) return emit('That stat is already at maximum.');
      const cost = statRaiseCost(p.stats[stat]);
      if (p.tdp < cost) return emit(`Raising ${STAT_FULL[stat]} costs ${cost} TDPs; you have ${p.tdp}.`);
      p.tdp -= cost;
      p.stats[stat] += 1;
      recalcDerived(p);
      emit(`You spend ${cost} TDPs and raise ${STAT_FULL[stat]} to ${p.stats[stat]}. ${p.tdp} TDPs remain.`);
      break;
    }
    case 'tdptrain': {
      if (!arg1) return emit('Usage: tdptrain <skill> — spends TDPs to train any skill.');
      const skillId = matchSkill(arg1);
      if (!skillId) return emit('I do not know that skill. See "skills".');
      const rank = skillRank(p, skillId);
      const cost = tdpTrainCost(rank);
      if (p.tdp < cost) return emit(`Training ${SKILLS[skillId].name} costs ${cost} TDPs; you have ${p.tdp}.`);
      p.tdp -= cost;
      gainSkillExp(p, skillId, expToNextRank(rank));
      emit(`You invest ${cost} TDPs in ${SKILLS[skillId].name} — it now sits at rank ${skillRank(p, skillId)}.`);
      break;
    }
    case 'stance': {
      const pts = stancePoints(p);
      if (!arg1) {
        const current = p.stance;
        return emit(`Current stance: ${current} (cost ${STANCE_COSTS[current] || 0}; you have ${pts} points). Usage: stance aggressive | defensive | guarded | balanced`);
      }
      const name = arg1.toLowerCase();
      if (!STANCES.includes(name)) return emit('Valid stances: aggressive, defensive, guarded, balanced.');
      const cost = STANCE_COSTS[name] || 0;
      if (cost > pts) return emit(`You need ${cost} stance points for ${name}; you have ${pts}.${p.guild.id === 'barbarian' ? ' Barbarians gain +1 point per 60 Defending ranks.' : p.guild.id === 'ranger' ? ' Rangers gain points from their defense skills.' : ''}`);
      p.stance = name;
      game.persistPlayer(p);
      emit(`You adopt a ${name} stance (${cost} point${cost === 1 ? '' : 's'}; ${pts - cost} remain). ${stanceDesc(name)}`);
      break;
    }
    case 'ask': {
      if (!arg1) return emit('Ask whom?');
      const npc = findNpcByName(p, arg1);
      if (!npc) return emit('There is no such person here.');
      if (npc.role === 'info' && arg2) gainSkillExp(p, 'scholarship', 2);
      if (/forgetting/i.test(rest)) {
        if (p.guild.id !== 'barbarian') return emit('Only barbarian leaders teach the forgetting of inner fire arts.');
        if (roomById(p.room).id !== 'hall_barbarian') return emit('Your guild leader can do that at the barbarian hall.');
        const name = rest.replace(/.*forgetting\s+/i, '').trim();
        const def = barbarianAbilityById(name.toLowerCase());
        if (!def) return emit('No such barbarian ability.');
        if (!(p.abilities || []).includes(def.id)) return emit(`You have not learned ${def.name}.`);
        if (p.lastForgetAt && Date.now() - p.lastForgetAt < FORGET_COOLDOWN_MS) {
          const days = Math.ceil((FORGET_COOLDOWN_MS - (Date.now() - p.lastForgetAt)) / 86400000);
          return emit(`You may forget another ability in about ${days} day(s).`);
        }
        p.abilities = (p.abilities || []).filter((a) => a !== def.id);
        p.lastForgetAt = Date.now();
        return emit(`The warchief nods slowly. "${def.name}" slips from your memory, its slot freed.`);
      }
      say(askResponse(game, p, npc, (arg2 || '').toLowerCase()));
      break;
    }

    // ---- Crime ----
    case 'steal': {
      if (!arg1) return emit('Steal from whom?');
      const npc = findNpcByName(p, arg1);
      if (!npc) return emit('There is no such person here to steal from.');
      const risky = npc.id === 'guard';
      const skill = skillRank(p, 'thievery');
      const chance = Math.max(0.05, Math.min(0.85, 0.35 + skill * 0.02 + p.stats.agi * 0.005 - (risky ? 0.2 : 0)));
      if (Math.random() < chance) {
        const coins = 5 + Math.floor(Math.random() * (5 + p.circle * 3));
        p.silver += coins;
        const leveled = gainSkillExp(p, 'thievery', 8);
        emit(`Your hand darts out and you lift ${coins} silvers from ${npc.name} unnoticed.${leveled ? ' Your Thievery improved!' : ''}`);
      } else {
        const fine = Math.min(25, Math.floor(p.silver * (risky ? 0.15 : 0.05)));
        p.silver -= fine;
        gainSkillExp(p, 'thievery', 2);
        emit(risky
          ? `The guard's hand closes around your wrist! "Try that again and it's the stocks for you." You part with ${fine} silvers.`
          : `${npc.name.charAt(0).toUpperCase() + npc.name.slice(1)} catches your hand mid-reach! You stammer an apology and slip away, lighter by ${fine} silvers.`);
      }
      break;
    }
    case 'pick': case 'unlock': {
      const entry = findInventoryItem(p, arg1 || '');
      if (!entry || entry.item.id !== 'strongbox') return emit('Pick what? You need a locked strongbox — check the loot of kobolds and bandits.');
      removeItem(p, 'strongbox', 1);
      const skill = skillRank(p, 'lockpicking');
      const chance = Math.max(0.1, Math.min(0.9, 0.4 + skill * 0.03 + p.stats.agi * 0.005));
      if (Math.random() < chance) {
        const coins = 20 + p.circle * 5 + Math.floor(Math.random() * 20);
        p.silver += coins;
        const leveled = gainSkillExp(p, 'lockpicking', 10);
        emit(`You work the lock and the box springs open, revealing ${coins} silvers!${leveled ? ' Your Locksmithing improved!' : ''}`);
      } else {
        const leveled = gainSkillExp(p, 'lockpicking', 4);
        emit(`The lock defies your picks.${leveled ? ' Still, your Locksmithing improved!' : ''}`);
      }
      break;
    }

    // ---- Character ----
    case 'score': case 'stats': {
      showScore(p, say);
      break;
    }
    case 'skills': {
      showSkills(p, say);
      break;
    }
    case 'exp': {
      showExp(p, say);
      break;
    }
    case 'alloc': {
      if (!arg1 || !arg2) {
        return emit(`Unspent points: ${p.unspentStat}. Usage: alloc <stat> <amount>. Stats: ${STAT_NAMES.join(', ')}`);
      }
      const stat = STAT_NAMES.includes(arg1.toLowerCase()) ? arg1.toLowerCase() : null;
      if (!stat) return emit('Unknown stat.');
      let amt = parseInt(arg2, 10);
      if (!amt || amt < 1) return emit('Amount must be a positive number.');
      if (p.unspentStat < amt) return emit(`You only have ${p.unspentStat} unspent points.`);
      const space = MAX_STAT - p.stats[stat];
      if (space < amt) {
        p.unspentStat -= space;
        p.stats[stat] = MAX_STAT;
        return emit(`You raise ${STAT_FULL[stat]} by ${space} (maxed). ${p.unspentStat} points remain.`);
      }
      p.unspentStat -= amt;
      p.stats[stat] += amt;
      recalcDerived(p);
      emit(`You raise ${STAT_FULL[stat]} to ${p.stats[stat]}. ${p.unspentStat} points remain.`);
      break;
    }

    // ---- Social ----
    case 'say': {
      if (!rest) return emit('Say what?');
      broadcastRoom(game, p, `You say, "${rest}"`, `${p.name} says, "${rest}"`);
      break;
    }
    case 'emote': {
      if (!rest) return emit('Emote what?');
      broadcastRoom(game, p, `You ${rest}`, `${p.name} ${rest}`);
      break;
    }
    case 'shout': {
      if (!rest) return emit('Shout what?');
      for (const o of game.players.values()) {
        o.ws.send(JSON.stringify({ t: 'msg', msg: `${p.name} shouts, "${rest.toUpperCase()}!"` }));
      }
      break;
    }
    case 'who': {
      const list = game.who();
      say(`\nOnline (${list.length}):\n${list.join('\n') || '(nobody else is connected)'}`);
      break;
    }
    case 'time': {
      say(gameTime());
      break;
    }
    case 'help': {
      say(`\n${HELP}`);
      break;
    }
    case 'save': {
      game.persistPlayer(p);
      emit('Progress saved.');
      break;
    }
    case 'alias': {
      if (!arg1) {
        const entries = Object.entries(p.aliases || {});
        return emit(entries.length
          ? `\nAliases:\n${entries.map(([n, c]) => `  ${pad(n, 16)} -> ${c}`).join('\n')}`
          : 'You have no aliases. Usage: alias <name> <command> (supports $1..$9)');
      }
      if (arg1 === 'remove' || arg1 === 'delete') {
        const res = removeAlias(p, arg2 || '');
        return emit(res.ok ? `Alias "${arg2}" removed.` : res.error);
      }
      if (!rest.trim()) return emit('Usage: alias <name> <command>');
      const res = setAlias(p, arg1, args.slice(2).join(' '));
      emit(res.ok ? `Alias "${arg1.toLowerCase()}" -> ${p.aliases[arg1.toLowerCase()]}` : res.error);
      break;
    }
    case 'unalias': {
      const res = removeAlias(p, arg1 || '');
      emit(res.ok ? `Alias "${arg1}" removed.` : res.error);
      break;
    }
    case 'deletechar': {
      if (!arg1) return emit('Usage: deletechar <name> — deletes one of your OTHER characters. This cannot be undone.');
      const rows = db.prepare('SELECT id, name FROM characters WHERE account_id = ? AND id != ?')
        .all(p.accountId, p.charId);
      const target = rows.find((r) => r.name.toLowerCase() === arg1.toLowerCase());
      if (!target) return emit(`You have no other character named "${arg1}".`);
      const online = [...game.players.values()].some((o) => o.charId === target.id);
      if (online) return emit('That character is currently online and cannot be deleted.');
      db.prepare('DELETE FROM characters WHERE id = ?').run(target.id);
      emit(`Character "${target.name}" has been deleted forever. You have ${rows.length - 1} character slot(s) free.`);
      break;
    }
    case 'quit': {
      say('Thanks for playing Dragon Realms. Farewell!');
      game.removePlayer(p);
      setTimeout(() => { try { p.ws.close(); } catch {} }, 50);
      break;
    }
    default:
      emit(`Hmm? I do not know the command "${cmd}". Type "help" for a list.`);
  }
}

// ---------------- helpers ----------------

function stanceDesc(name) {
  switch (name) {
    case 'aggressive': return 'You strike harder, but guard worse.';
    case 'defensive': return 'You guard well, at the cost of your own blows.';
    case 'guarded': return 'You take a sturdy guard, turning aside a little extra harm.';
    default: return 'You fight without a fixed stance.';
  }
}

function matchSkill(name) {
  const n = String(name).toLowerCase();
  const direct = SKILLS[n];
  if (direct) return n;
  const found = Object.entries(SKILLS).find(([id, def]) =>
    def.name.toLowerCase() === n || def.name.toLowerCase().includes(n));
  return found ? found[0] : null;
}

function findNpcByName(p, name) {
  const room = roomById(p.room);
  const n = name.toLowerCase();
  return (room.npcs || []).map(npcById).find((x) => x && (x.id === n || x.name.toLowerCase().includes(n)));
}

function askResponse(game, p, npc, topic) {
  const room = roomById(p.room);
  const zoneName = room ? room.name : '';
  switch (npc.role) {
    case 'shop':
      return `\n${npc.greeting}\nBrowse my wares with "list", buy with "buy <item>", and sell hides with "sell <item>".`;
    case 'healer':
      return `\n${npc.greeting}\nIf you are hurt, say "heal" and I will tend you for a small offering.`;
    case 'craft':
      return `\n${npc.greeting}\nSay "craft" to see my recipes. Herbs can be foraged in the wilds, and wisp motes drop from marsh wisps.`;
    case 'bank':
      return `\n${npc.greeting}\nUse "deposit <amount>" and "withdraw <amount>" to keep your silvers safe.`;
    case 'guild': {
      const g = p.guild.id === npc.guild ? p.guild : guildById(npc.guild);
      const next = p.circle + 1;
      const req = circleRequirements(p.guild, p.skills, next);
      if (topic === 'circle') {
        let msg = `\nTo circle to ${next}, you must have:\n  ${circleRequirementSummary(p.guild, next).join('\n  ')}`;
        if (req.ok) msg += `\nYou are ready — say "circle"!`;
        return msg;
      }
      if (topic === 'train') {
        return `\n${npc.name} trains you in ${guildTrainedSkills(g).join(', ')}. Say "train <skill>" and pay in silvers.`;
      }
      return `\n"${npc.name}? I am ${npc.desc}" ${npc.greeting}\nAsk me about "circle" or "train" to learn how I can help you advance.`;
    }
    case 'info': {
      if (topic === 'quest') {
        if (p.quest && p.quest.done) return `\nYour pest-control work is done! Say "claim" and I'll pay you.`;
        if (p.quest) {
          const def = creatureById(p.quest.creatureId);
          return `\nSlay ${p.quest.count} more ${def.plural} and return to claim your reward.`;
        }
        return `\nI've got pest-control work, if you want it. Say "quest" and I'll mark your target.`;
      }
      if (topic === 'help') return `\nType "help" for a list of commands. Ask me about "areas", "hunting", "guilds", "skills", or "quest".`;
      if (topic === 'areas' || topic === 'hunting') {
        return `\nThe Crossing has four hunting grounds:\n  Old Sewers (down from Temple Row) — rats and kobolds\n  Old Woods (west gate) — goblins and wolves\n  Whispering Marsh (east gate) — wisps\n  Deep Wilds (north from the woods) — forest trolls\nHunt what you can handle, and sell the hides in the market.`;
      }
      if (topic === 'guilds') {
        return `\nEleven guilds have halls in the Guild District (east of the square). Visit your own hall to train skills and circle up.`;
      }
      if (topic === 'skills') {
        return `\nSkills grow through use — fight to learn weapons and defense, cast to learn magic, and skin your kills to learn skinning. Use "skills" and "exp" to track progress.`;
      }
      return `\n${npc.greeting}\nAsk me about "areas", "hunting", "guilds", "skills", or "help".`;
    }
    default:
      return `\n${npc.desc}`;
  }
}

function lookAt(game, p, name, say) {
  const n = name.toLowerCase();
  const room = roomById(p.room);
  const npc = (room.npcs || []).map(npcById).find((x) => x && (x.name.toLowerCase().includes(n) || x.id.includes(n)));
  if (npc) {
    say(`${npc.name} — ${npc.desc} ${npc.greeting}`);
    return;
  }
  const creature = game.findCreature(p.room, n);
  if (creature) {
    const state = creature.hp / creature.maxHp > 0.66 ? '' : ' It looks wounded.';
    say(`${creature.def.desc}${state}`);
    return;
  }
  const corpse = game.corpseIn(p);
  if (corpse && (corpse.name.toLowerCase().includes(n) || n.includes('corpse'))) {
    say(`It is ${corpse.name}. Search it with "search" — its belongings lie with it.`);
    return;
  }
  const inv = findInventoryItem(p, n);
  if (inv) { say(inv.item.desc); return; }
  const eq = Object.values(p.equipment).find((i) => i.name.includes(n));
  if (eq) { say(eq.desc); return; }
  say('You see nothing special there.');
}

function findInventoryItem(p, name) {
  const n = name.toLowerCase();
  return p.inventory.find((e) => e.item.id === n || e.item.name.includes(n));
}

function findSlotByItem(p, name) {
  const n = name.toLowerCase();
  return Object.entries(p.equipment).find(([slot, item]) => item.id === n || item.name.includes(n))?.[0];
}

function showInventory(p, say) {
  const lines = p.inventory.map((e) => `${e.qty > 1 ? `${e.qty}x ` : ''}${e.item.name}`);
  const worn = Object.values(p.equipment).map((i) => i.name);
  const out = [
    `\nYou are carrying:${lines.length ? '\n  ' + lines.join('\n  ') : ' nothing.'}`,
    `Worn: ${worn.length ? worn.join(', ') : 'nothing'}.`,
    `Silvers: ${p.silver}.`,
  ].join('\n');
  say(out);
}

function showScore(p, say) {
  const w = weaponOf(p);
  const armor = totalArmor(p);
  const lines = [
    `\n\x1b[1m${p.name}\x1b[0m — ${p.race.name} ${p.guild.name} (${guildTitle(p.guild, p.circle)})`,
    `Circle ${p.circle}  |  Health ${p.hp}/${p.maxHp}  |  ${p.guild.magic ? `Mana ${p.mana}/${p.maxMana} (${manaTypeFor(p.guild).def.name})` : p.guild.id === 'barbarian' ? `Inner Fire ${p.innerFire}/${p.maxInnerFire}` : ''}`,
    `Attributes:  Str ${p.stats.str}  Con ${p.stats.con}  Ref ${p.stats.ref}  Agi ${p.stats.agi}`,
    `             Cha ${p.stats.cha}  Dis ${p.stats.dis}  Wis ${p.stats.wis}  Int ${p.stats.int}`,
    `Unspent points: ${p.unspentStat}`,
    `Weapon: ${w ? `${w.name} (${w.dmg[0]}-${w.dmg[1]})` : 'your fists'}`,
    `Armor: ${armor}`,
    `Total skill ranks: ${totalRanks(p.skills)}`,
    `Silver: ${p.silver}  Bank: ${p.bank}`,
  ];
  if (p.circle >= 10) {
    const cap = capstoneFor(p.guild);
    if (cap) lines.push(`\n\x1b[1mCapstone: ${cap.name}\x1b[0m — ${cap.desc}`);
  }
  say(lines.join('\n'));
}

function showSkills(p, say) {
  const byCat = {};
  for (const [id, def] of Object.entries(SKILLS)) {
    (byCat[def.cat] ||= []).push([def, p.skills[id]?.rank || 0]);
  }
  const out = [];
  out.push(`\n\x1b[1mSkills\x1b[0m (total ranks: ${totalRanks(p.skills)})`);
  for (const cat of Object.values(CATEGORIES)) {
    if (!byCat[cat]) continue;
    out.push(`\n\x1b[1m${cat}\x1b[0m`);
    for (const [def, rank] of byCat[cat]) {
      out.push(`  ${pad(def.name, 24)} ${rank}`);
    }
  }
  say(out.join('\n'));
}

function showExp(p, say) {
  const lines = ['\n\x1b[1mExperience\x1b[0m'];
  for (const [id, s] of Object.entries(p.skills)) {
    const def = SKILLS[id];
    const need = rankExp(s.rank);
    const pct = Math.floor((s.exp / need) * 100);
    if (s.rank > 0 || s.exp > 0) {
      lines.push(`  ${pad(def.name, 24)} rank ${s.rank}  ${pad(`${pct}%`, 4)} ${mindstate(pct)}`);
    }
  }
  lines.push(`\nGuild circle progress (next: ${p.circle + 1}):`);
  const req = circleRequirements(p.guild, p.skills, p.circle + 1);
  if (req.ok) lines.push('  You are ready to circle! Visit your guild hall and type "circle".');
  else for (const m of req.missing.slice(0, 8)) lines.push(`  - ${m}`);
  say(lines.join('\n'));
}

function rankExp(rank) {
  return Math.floor(40 + rank * 28 + rank * rank * 1.5);
}

function circleUp(game, p, say, emit) {
  const room = roomById(p.room);
  const isOwnHall = room.id === `hall_${p.guild.id}`;
  if (!isOwnHall) return emit('You must stand in your own guild hall to circle. (Look for your guild\'s hall in the Guild District.)');
  const target = p.circle + 1;
  const req = circleRequirements(p.guild, p.skills, target);
  if (!req.ok) {
    return emit(`You are not yet ready to circle to ${target}. Missing:\n  ${req.missing.join('\n  ')}`);
  }
  const oldMax = p.maxHp;
  p.circle = target;
  recalcDerived(p);
  p.hp = Math.min(p.hp + (p.maxHp - oldMax), p.maxHp);
  p.mana = p.maxMana;
  const gained = tdpAwardFor(target);
  p.tdp += gained;
  let msg = `\nThe guild leader nods slowly. "Rise, ${p.name}. You are now a ${guildTitle(p.guild, target)}."\nYour vitality grows with your station. You gain ${gained} \x1b[1mTDPs\x1b[0m (${target >= 10 ? '100 base' : '50 base'} + circle bonus).`;
  if (target >= 10) {
    const cap = capstoneFor(p.guild);
    if (cap) msg += `\n\n\x1b[1mYou have attained your guild capstone: ${cap.name}!\x1b[0m\n${cap.desc}`;
  }
  say(msg);
  game.status(p);
  game.persistPlayer(p);
}

function recalcDerived(p) {
  p.maxHp = Math.floor((40 + p.stats.con * 2 + p.stats.str) * (1 + (p.circle - 1) * 0.08));
  if (p.guild.magic) p.maxMana = Math.floor((20 + p.stats.wis * 2 + p.stats.int + p.stats.dis) * (1 + (p.circle - 1) * 0.06));
  else p.maxMana = 0;
}

function skinCreature(game, p, name, say, emit) {
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

function itemByIdName(id) {
  return ITEMS[id] ? ITEMS[id].name : id;
}

function broadcastRoom(game, p, selfMsg, otherMsg) {
  for (const o of game.players.values()) {
    if (o.room === p.room) {
      o.ws.send(JSON.stringify({ t: 'msg', msg: o === p ? selfMsg : otherMsg }));
    }
  }
  game.status(p);
}

function gameTime() {
  const now = new Date();
  const hour = now.getHours();
  const period = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const year = 5 + Math.floor(now.getFullYear() - 2026);
  const day = now.getDate();
  const month = now.toLocaleString('en-US', { month: 'long' });
  return `It is ${period} of the ${ordinal(day)} of ${month}, in the Year ${year} of the Seventh Age.`;
}

function ordinal(d) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
