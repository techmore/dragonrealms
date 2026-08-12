// World commands: exploration, wilds skills, rest, NPC dialogue, social, meta.
import { DIR_ALIASES } from './dirs.js';
import { guildById, circleRequirements, circleRequirementSummary, guildTrainedSkills } from '../../data/guilds.js';
import { roomById } from '../../data/world.js';
import { creatureById } from '../../data/creatures.js';
import { npcById } from '../../data/npcs.js';
import { barbarianAbilityById, FORGET_COOLDOWN_MS } from '../../data/abilities.js';
import { gainSkillExp } from '../player.js';
import { setAlias, removeAlias } from '../player.js';
import { pad, matchSkill, findNpcByName, findInventoryItem, broadcastRoom, gameTime } from './util.js';

const HELP = `
\x1b[1mDragon Realms — quick help\x1b[0m
  Movement:  n, s, e, w, ne, nw, se, sw, u, d  |  go north  |  look (l)
  Combat:    attack <creature>  |  cast [spell] [target]  |  retreat  |  skin <creature>
  Magic:     spells  (lists what your guild teaches)  |  perceive  (sense room mana)  |  harness  (gather mana)  |  prepare <spell> [pct]  (then "cast"; overchanneling risks backlash)  |  charge/invoke <cambrinth>  (store and release energy)
  Powers:    berserk (Barbarian)  |  form/roar/meditate <ability>  (barbarian)  |  whirlwind/stomp/choke/analyze (barbarian)  |  backstab (Thief)  |  khri <name> (Thief concentration buffs)
  Abilities: abilities  (list barbarian arts)  |  learn <ability>  (at the barbarian hall)  |  ask <leader> about forgetting <ability>
  Items:     get <item>  |  drop <item>  |  inventory (i)  |  wear/wield <item>  |  remove <item>  |  use <item>
  Death:     die in battle and you awaken at the temple — your gear lies with your corpse; search <corpse>, get <item> from corpse
  Shops:     list  |  buy <item> [qty]  |  sell <item> [qty]  |  deposit/withdraw <silvers>
  Training:  train <skill>  (pay silvers to advance guild skills)  |  circle  (at your guild hall)
  TDPs:      tdp  |  train <stat> twice  (at the Fane of Training, east of Temple Row)  |  tdptrain <skill>
  Combat:    attack [target] | target <creature> | ambush <creature> (from hiding) | cast [spell] [target] | retreat | skin <creature>
  PvP:       duel <player> [blood|blow|pain] | accept/decline <player> | surrender | pvp stance open|guarded|closed  (wilds only)
  Magic:     spells  |  slots  (spell-slot budget) |  prepare <spell> [pct]
  Stances:   stance aggressive | defensive | guarded | balanced  (costs stance points)
  Quests:    quest  |  claim  (work for the town crier)
  Scripting: alias <name> <command>  |  use ";" to chain commands  (client: macro / timer)
  Wilds:     forage  (gather herbs)  |  hunt  (scan for prey)  |  ladder  (rank bands)  |  track  (read the signs)  |  hide  |  rest  (recover)
  Skills:    perform  (practice performance)  |  appraise  (study an item or creature)
  Crime:     steal <npc>  (lift coin, town)  |  pick <strongbox>  (work the lock on looted boxes)
  NPCs:      ask <npc> <topic>  (try "ask crier help")
  Character: score  |  skills  |  exp  |  alloc <stat> <amount>
  Social:    say <text>  |  emote <text>  |  shout <text>  |  who  |  time
  Misc:      help  |  save  |  quit
`.trim();

export const commands = {
  look(ctx) { look(ctx); },
  l: look,

  quest(ctx) { quest(ctx); },
  claim(ctx) { claim(ctx); },

  plead(ctx) {
    const { game, p, emit } = ctx;
    if (p.room !== 'jail') return emit('You are not in jail.');
    const remaining = game.timeLeftInJail(p);
    const plea = (ctx.arg1 || '').toLowerCase();
    if (!plea || !['guilty', 'innocent'].includes(plea)) {
      return emit(`The jailer looks up. "Guilty or innocent, thief?${remaining ? ` (${remaining}s left if you wait)` : ''}"`);
    }
    if (plea === 'guilty') {
      const fine = 5 + p.circle * 5;
      const paid = Math.min(p.silver, fine);
      p.silver -= paid;
      p.jailUntil = 0;
      p.room = 'square';
      emit(`You plead guilty. The fine is ${fine} silvers — you pay ${paid}${paid < fine ? ' (the rest from your debts)' : ''}. Jailer Grum unlocks the door: "Mind your hands."`);
      game.look(p);
    } else {
      if (remaining > 60) return emit('The judge has already heard you once. Wait out your sentence.');
      p.jailUntil = Date.now() + 60 * 1000;
      emit('You plead innocent. Jailer Grum shrugs: "The judge will see you in a minute. Sit tight."');
    }
  },

  forage(ctx) {
    const { game, p, emit } = ctx;
    const res = game.forage(p);
    emit(res.msg);
  },

  track(ctx) {
    const { game, p, emit } = ctx;
    const res = game.track(p);
    emit(res.msg);
  },

  hunt(ctx) {
    const { game, p, emit } = ctx;
    const res = game.hunt(p);
    emit(res.msg);
  },

  ladder(ctx) {
    const { game, p, emit } = ctx;
    emit(game.ladder());
  },

  rest(ctx) {
    const { game, p, emit } = ctx;
    const res = game.startRest(p);
    emit(res.msg);
  },

  stand: standUp,
  wake: standUp,

  study(ctx) {
    const { p, emit } = ctx;
    if (p.room !== 'temple' && p.room !== 'temple_row') return emit('You need books. The Temple of the Pantheon keeps a library.');
    const leveled = gainSkillExp(p, 'scholarship', 10);
    const leveled2 = gainSkillExp(p, 'appraisal', 2);
    emit(`You pore over a dusty tome of lore.${leveled ? ' Your Scholarship improved!' : ''}${leveled2 ? ' Your Appraisal improved!' : ''}`);
  },

  perform(ctx) { perform(ctx); },
  sing: perform,

  appraise(ctx) { appraise(ctx); },
  appr: appraise,

  ask(ctx) {
    const { game, p, arg1, arg2, rest, say, emit } = ctx;
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
  },

  save(ctx) {
    const { game, p, emit } = ctx;
    game.persistPlayer(p);
    emit('Progress saved.');
  },

  quit(ctx) {
    const { game, p, say } = ctx;
    say('Thanks for playing Dragon Realms. Farewell!');
    game.removePlayer(p);
    setTimeout(() => { try { p.ws.close(); } catch {} }, 50);
  },

  time(ctx) {
    const { say } = ctx;
    say(gameTime());
  },

  who(ctx) {
    const { game, p, say } = ctx;
    const list = game.who();
    say(`\nOnline (${list.length}):\n${list.join('\n') || '(nobody else is connected)'}`);
  },

  help(ctx) {
    const { say } = ctx;
    say(`\n${HELP}`);
  },

  say(ctx) {
    const { game, p, rest, emit } = ctx;
    if (!rest) return emit('Say what?');
    broadcastRoom(game, p, `You say, "${rest}"`, `${p.name} says, "${rest}"`);
  },

  emote(ctx) {
    const { game, p, rest, emit } = ctx;
    if (!rest) return emit('Emote what?');
    broadcastRoom(game, p, `You ${rest}`, `${p.name} ${rest}`);
  },

  shout(ctx) {
    const { game, p, rest, emit } = ctx;
    if (!rest) return emit('Shout what?');
    for (const o of game.players.values()) {
      o.ws.send(JSON.stringify({ t: 'msg', msg: `${p.name} shouts, "${rest.toUpperCase()}!"` }));
    }
  },

  alias(ctx) {
    const { p, arg1, arg2, args, rest, emit } = ctx;
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
  },

  unalias(ctx) {
    const { p, arg1, emit } = ctx;
    const res = removeAlias(p, arg1 || '');
    emit(res.ok ? `Alias "${arg1}" removed.` : res.error);
  },
};

function look(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (arg1 && arg1 !== 'around' && arg1 !== 'at') {
    const dir = DIR_ALIASES[arg1.toLowerCase()];
    if (dir) {
      const res = game.lookDirection(p, dir);
      emit(res.msg);
    } else {
      lookAt(game, p, arg1, ctx.say);
    }
  } else {
    game.look(p);
  }
}

function standUp(ctx) {
  const { game, p, emit } = ctx;
  game.stopRest(p);
  emit('You rise to your feet.');
}

function perform(ctx) {
  const { p, emit } = ctx;
  const n = p.guild.id === 'bard' ? 2 : 1;
  const leveled = gainSkillExp(p, 'performance', 5 * n);
  const flavor = ['a somber dirge', 'a bawdy tavern tune', 'an old war ballad', 'a wordless hum'][Math.floor(Math.random() * 4)];
  emit(`You perform ${flavor} for a moment, filling the air with your voice.${leveled ? ' Your Performance improved!' : ''}`);
}

function appraise(ctx) {
  const { game, p, arg1, emit } = ctx;
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
}

function quest(ctx) {
  const { game, p, say, emit } = ctx;
  if (!game.hasCrier(p) && !p.quest) {
    return emit('Ask the town crier for work — he stands in the town square.');
  }
  if (!p.quest) {
    const q = game.assignQuest(p);
    const def = creatureById(q.creatureId);
    say(`\nThe crier nods. "The town's overrun with ${def.plural}. Slay ${q.count} ${def.plural} and I'll see you paid."`);
    return;
  }
  if (p.quest.done) {
    const res = game.questClaim(p);
    emit(res.msg);
    return;
  }
  const def = creatureById(p.quest.creatureId);
  say(`\nQuest: slay ${p.quest.count} more ${def.plural}. Return to the crier when done.`);
}

function claim(ctx) {
  const { game, p, emit } = ctx;
  const res = game.questClaim(p);
  emit(res.msg);
}

function askResponse(game, p, npc, topic) {
  switch (npc.role) {
    case 'shop':
      return `\n${npc.greeting}\nBrowse my wares with "list", buy with "buy <item>", and sell hides with "sell <item>".`;
    case 'healer':
      return `\n${npc.greeting}\nIf you are hurt, say "heal" and I will tend you for a small offering.`;
    case 'craft':
      if (npc.id === 'forge_master') {
        return `\n${npc.greeting}\nSay "forge" to see my recipes. Iron ore drops from trolls, bandits, and the blackwood dead; cinder scales come from the cavern drakes.`;
      }
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
      if (topic === 'task') {
        if (p.quest && p.quest.source === 'leader' && !p.quest.done) {
          const def = creatureById(p.quest.creatureId);
          return `\nFinish what you started: slay ${p.quest.count} more ${def.plural} and claim your reward.`;
        }
        if (p.quest && p.quest.done) return `\nYour task is done! Say "claim" for your reward.`;
        const q = game.assignQuest(p, 'leader');
        const def = creatureById(q.creatureId);
        return `\n"${p.name}. The guild needs ${def.plural} thinned. Slay ${q.count} and I'll see you paid — and taught."`;
      }
      if (topic === 'claim') {
        const res = game.questClaim(p);
        return `\n${res.msg}`;
      }
      return `\n"${npc.name}? I am ${npc.desc}" ${npc.greeting}\nAsk me about "circle", "train", or "task" to learn how I can help you advance.`;
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
