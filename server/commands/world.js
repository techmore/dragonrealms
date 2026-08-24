// World commands: exploration, wilds skills, rest, NPC dialogue, social, meta.
import { DIR_ALIASES } from './dirs.js';
import { guildById, circleRequirements, circleRequirementSummary, guildTrainedSkills } from '../../data/guilds.js';
import { roomById, ROOMS } from '../../data/world.js';
import { creatureById } from '../../data/creatures.js';
import { QUALITY_LADDER } from '../../data/forging.js';
import { npcById } from '../../data/npcs.js';
import { barbarianAbilityById, FORGET_COOLDOWN_MS } from '../../data/abilities.js';
import { gainSkillExp, addItem, skillRank } from '../player.js';
import { itemById } from '../../data/items.js';
import { setAlias, removeAlias, setRoundtime } from '../player.js';
import { pad, matchSkill, findNpcByName, findInventoryItem, broadcastRoom, gameTime } from './util.js';

// Thief Passages: chalk-sign ways out of the Dark Knot (name -> destination).
// The hub remembers every bolt-hole that leads in; each way out is named for
// where it surfaces.
const PASSAGE_WAYS_OUT = {
  ravens: 'passage_ravens',   // Raven's Court, by the West Road
  swithens: 'passage_swithen', // Swithen's Court ruins, by the Sand Spit
};

const HELP = `
\x1b[1mDragon Realms — quick help\x1b[0m
  Movement:  n, s, e, w, ne, nw, se, sw, u, d  |  go north  |  look (l)
   Combat:    attack <creature>  |  target <creature>  |  cast [spell] [target]  |  retreat/flee  |  skin <creature>
   Magic:     spells  |  slots  |  technique [learn <name>]  |  prepare <spell> [pct] (then "cast"; overchanneling risks backlash)  |  perceive  |  harness  |  charge/invoke/focus <cambrinth>
   Powers:    berserk (Barbarian)  |  form/roar/meditate <ability>  |  whirlwind/stomp/choke/analyze (barbarian)  |  backstab (Thief)  |  khri <name> (Thief)
              smite (Paladin)  |  glyph <name> (Paladin, soul-fueled wards)  |  impede <creature> (Warrior Mage)  |  mend/touch/scar/link <player> (Empath)  |  predict + observe sky + telescope + moon gate <city> (Moon Mage)  |  summon familiar (Warrior Mage)  |  animate <corpse> + ritual <name> (Necromancer)
              enchante war|bravery|regen (Bard)  |  devotion (Cleric)  |  beseech wind|sun + companion (Ranger)  |  snipe/slip (Ranger)
  Abilities: abilities  (list barbarian arts)  |  learn <ability>  (at the barbarian hall)  |  ask <leader> about forgetting <ability>
  Items:     get <item>  |  drop <item>  |  inventory (i)  |  wear/wield <item>  |  remove <item>  |  use <item>  |  repair <item>  (gear wears with use)
  Death:     die in battle and you awaken at the temple — your gear lies with your corpse; search <corpse>, get <item> from corpse
  Shops:     list  |  buy <item> [qty]  |  sell <item> [qty]  |  deposit/withdraw <silvers>  |  vault/store/retrieve  |  pit  |  heal  |  auction offer/buy  (Auction Hall, north of the pit)
  Training:  train <skill>  (pay silvers to advance guild skills)  |  train <stat> twice (Fane of Training, south of Temple Row)  |  circle
  TDPs:      tdp  |  raise <stat>  |  tdptrain <skill>
  Quests:    quest  |  claim  |  deliver  |  ask <leader> task
  Stances:   stance aggressive | defensive | guarded | balanced  (costs stance points)
  PvP:       duel <player> [blood|blow|pain] [reason] | accept/decline <player> | surrender | assault <player> (OPEN targets only) | recall warrant | pvp stance open|guarded|closed  (duels wilds only)
  Wilds:     forage  |  hunt  |  track  |  ladder [undead|skins|boxes...]  |  hide  |  ambush <creature>  |  rest  (recover)
  Travel:    ferry  (Crossing docks <-> Riverhaven landing, 20 silvers)
  Skills:    perform  |  appraise <item>  |  study  (temple library)
   Crafting:  craft <recipe>  (Tilted Retort)  |  forge <recipe>  (Ember Forge)  |  shape <recipe>  (Ember Forge, Engineering)  |  tailor <recipe>  (Needle & Thread, off West Road)
  Crime:     steal <npc>  (lift coin, town)  |  pick <strongbox>  |  plead guilty|innocent  (if jailed)
  Scripting: alias <name> <command>  |  use ";" to chain commands  (client: macro / timer)
  NPCs:      ask <npc> <topic>  (try "ask crier help")
  Character: score  |  skills  |  exp  |  health  |  info  |  alloc <stat> <amount>  |  rexp  |  achievements  |  respec (Fane)
  Party:     party <player>  (invite)  |  party join  |  party leave  |  party  (status)
  Social:    say <text>  |  emote <text>  |  shout <text>  |  who  |  time
  Misc:      help  |  save  |  report <what happened>  |  quit
`.trim();

export const commands = {
  look(ctx) { look(ctx); },
  l: look,

  quest(ctx) { quest(ctx); },
  claim(ctx) { claim(ctx); },
  deliver(ctx) { deliver(ctx); },

  // The Rite of Departure: after death, the temple can draw one item from
  // your corpse to the altar for a fee (DR's DEPART ITEM, compressed).
  depart(ctx) {
    const { game, p, arg1, emit } = ctx;
    const fee = 10 * p.circle;
    if (!arg1) {
      return emit(`The priests offer the Rite of Departure: for ${fee} silvers they will draw one item from your last corpse to the temple altar. "depart <item>" — once per death.`);
    }
    if (p.room !== 'temple') return emit('The rite is performed only at the Temple of the Pantheon.');
    if (!p.lastCorpse) return emit('You have no recent death for the rite to reach.');
    const pile = game.floorItems.get(p.lastCorpse.room);
    const corpse = pile ? pile.find((f) => f.uid === p.lastCorpse.uid) : null;
    if (!corpse) return emit('Your old corpse is gone — scattered to the winds. The rite has nothing to reach.');
    if (corpse.departed) return emit('The rite has already been sung over this corpse.');
    if (p.silver < fee) return emit(`The rite demands ${fee} silvers, and you are short.`);
    const n = arg1.toLowerCase();
    const idx = corpse.items.findIndex((i) => itemById(i.id) && (itemById(i.id).name.toLowerCase().includes(n) || i.id.includes(n)));
    let moved = null;
    if (idx >= 0) {
      const it = corpse.items[idx];
      addItem(p, it.id, it.qty, it);
      corpse.items.splice(idx, 1);
      moved = itemById(it.id).name;
    } else {
      const eIdx = corpse.equipment.findIndex((e) => itemById(e.id) && (itemById(e.id).name.toLowerCase().includes(n) || e.id.includes(n)));
      if (eIdx >= 0) {
        const eq = corpse.equipment[eIdx];
        addItem(p, eq.id, 1, eq);
        corpse.equipment.splice(eIdx, 1);
        moved = itemById(eq.id).name;
      }
    }
    if (!moved) return emit(`The priests peer across the veil: no such thing lies on that corpse ("search" there will list it).`);
    p.silver -= fee;
    corpse.departed = true;
    game.persistPlayer(p);
    emit(`The priests chant, and the veil thins — ${moved} settles onto the altar, drawn from your fallen body. You pay ${fee} silvers and carry it off.`);
  },

  // Town debts: unpaid fines follow you; guards garnish on sight.
  debts(ctx) {
    const { p, emit } = ctx;
    const debt = p.debt || 0;
    if (!debt) return emit('You owe the town nothing. Your ledger is clean.');
    emit(`You owe the town ${debt} silvers in outstanding costs. Guards garnish a quarter of your purse on sight; clear it at the bank with "paydebt <amount>".`);
  },

  paydebt(ctx) {
    const { game, p, arg1, emit } = ctx;
    const debt = p.debt || 0;
    if (!debt) return emit('You owe the town nothing.');
    const room = roomById(p.room);
    if (!room || !room.npcs || !room.npcs.includes('banker')) return emit('Debts are settled at the bank, where the ledgers live.');
    const amt = Math.max(0, Math.min(Math.floor(parseInt(arg1, 10) || 0), debt, p.silver));
    if (!amt) return emit(`Usage: paydebt <amount> (you owe ${debt}; you carry ${p.silver}).`);
    p.silver -= amt;
    p.debt = debt - amt;
    game.persistPlayer(p);
    emit(p.debt === 0
      ? `You lay ${amt} silvers on the counter. The clerk stamps your ledger PAID. "Your name is clean again."`
      : `You pay ${amt} toward your debt. ${p.debt} silvers remain outstanding.`);
  },

  // Province travel: the river ferry links the Crossing docks to the
  // Riverhaven landing (DR: provinces are far apart; the boat is the road).
  ferry(ctx) {
    const { game, p, emit } = ctx;
    if (p.stocksUntil && Date.now() < p.stocksUntil) {
      return emit(`You are in the stocks! The ferryman will not wait for you.`);
    }
    if (game.combat.getFor(p)) return emit('Not while you are fighting — the ferryman casts off without you.');
    const FARE = 20;
    const routes = { docks: 'rh_ferry', rh_ferry: 'docks' };
    const dest = routes[p.room];
    if (!dest) return emit('No ferry landing here. The barge runs between the Crossing docks and the Riverhaven landing.');
    if (p.silver < FARE) return emit(`The crossing costs ${FARE} silvers, and Old Whit waves you off. "Coin first, passenger."`);
    p.silver -= FARE;
    const fromName = roomById(p.room).name;
    p.room = dest;
    setRoundtime(p, 10);
    game.persistPlayer(p);
    emit(dest === 'rh_ferry'
      ? `You pay ${FARE} silvers and board the barge. Old Whit poles off from ${fromName}, and the Crossing falls away behind you — an hour of grey water, gulls, and the far shore growing tall. The landing at \x1b[1mRiverhaven\x1b[0m rises to meet you.`
      : `You pay ${FARE} silvers and board the barge. The Riverhaven landing slips behind you as the river widens — a long hour of current and cloud. Smoke from a thousand chimneys marks \x1b[1mthe Crossing\x1b[0m, and the docks rise to meet you.`);
    game.enterRoom(p);
  },

  plead(ctx) {
    const { game, p, emit } = ctx;
    if (p.room !== 'jail') return emit('You are not in jail.');
    const remaining = game.timeLeftInJail(p);
    const plea = (ctx.arg1 || '').toLowerCase();
    if (!plea || !['guilty', 'innocent'].includes(plea)) {
      return emit(`The jailer looks up. "Guilty or innocent, thief?${remaining ? ` (${remaining}s left if you wait)` : ''}"`);
    }
    if (plea === 'guilty') {
      const zoneMult = game.justiceZone(p) === 'strict' ? 1.5 : 1;
      const fine = Math.round((5 + p.circle * 5 + (p.warrant ? p.circle * 10 : 0)) * zoneMult);
      const paid = Math.min(p.silver, fine);
      p.silver -= paid;
      if (paid < fine) p.debt = (p.debt || 0) + (fine - paid);
      p.jailUntil = 0;
      const stocks = p.warrant ? 10 : 0; // murder earns the stocks
      p.warrant = null;
      p.room = 'square';
      emit(`You plead guilty. The fine is ${fine} silvers — you pay ${paid}${paid < fine ? `, and the remaining ${fine - paid} silvers stand as town debt ("debts")` : ''}. Jailer Grum unlocks the door: "Mind your hands."`);
      if (stocks > 0) {
        p.stocksUntil = Date.now() + stocks * 1000;
        emit(`A crowd has gathered — for murder you are set in the stocks for ${stocks}s before you may move.`);
      }
      game.look(p);
    } else {
      if (remaining > 60) return emit('The judge has already heard you once. Wait out your sentence.');
      const heat = p.crimeHeat || 0;
      p.jailUntil = Date.now() + (30 + heat * 10) * 1000;
      emit(heat > 2
        ? `You plead innocent. A hard-eyed judge reviews your file — a long one. "Thirty days' reflection, and the town's costs." The sentence will cost you.`
        : `You plead innocent. The judge nods once: "The town's costs, then." Your sentence will carry a small fine.`);
    }
  },

  forage(ctx) {
    const { game, p, emit } = ctx;
    const res = game.forage(p);
    setRoundtime(p, 5);
    emit(res.msg);
  },

  scavenge(ctx) {
    const { game, p, emit } = ctx;
    const res = game.scavenge(p);
    setRoundtime(p, 5);
    emit(res.msg);
  },

  // PASSAGE — Thief Passages (DR clean-room). At a marked entrance
  // (PASSAGE_ENTRANCE room flag), guilded thieves slip inside; at the hub,
  // 'passage' lists the bolt-hole ways out and 'passage <name>' takes one.
  // High crime heat risks a mugging at the threshold (DR: worst reputation
  // means the guild turns on you).
  passage(ctx) {
    const { game, p, arg1, emit } = ctx;
    if (p.guild.id !== 'thief') return emit('You see nothing remarkable about this place. (Only thieves know the passages.)');
    const room = roomById(p.room);
    if (!room) return emit('There is no passage here.');
    if (room.PASSAGE_HUB) {
      const ways = Object.entries(PASSAGE_WAYS_OUT);
      if (!arg1) {
        return emit(`Chalked signs mark the ways out: ${ways.map(([k, v]) => `${k} (${ROOMS[v].name})`).join(', ')}. ("passage <name>")`);
      }
      const key = arg1.toLowerCase();
      const dest = PASSAGE_WAYS_OUT[key];
      if (!dest) return emit(`No chalk sign reads "${arg1}". Ways out: ${ways.map(([k]) => k).join(', ')}.`);
      game.moveTo(p, dest);
      return;
    }
    if (!room.PASSAGE_ENTRANCE) return emit('You see no passage here.');
    const heat = p.crimeHeat || 0;
    if (heat >= 8 && Math.random() < 0.5) {
      const dmg = Math.max(3, Math.floor(p.maxHp * 0.15));
      p.hp = Math.max(1, p.hp - dmg);
      p.wounds = p.wounds || [];
      p.wounds.push({ part: 'left arm', level: 2, tended: false, since: Date.now() });
      game.status(p);
      return emit(`You move to knock — and shadows peel off the wall. Your own guild leaves you bleeding in the gutter: your heat has shamed them. (${dmg} damage, a new wound.) Clear your name before you come back.`);
    }
    game.moveTo(p, room.PASSAGE_ENTRANCE);
  },

  play(ctx) {
    const { p, emit } = ctx;
    if (p.room !== 'pier') return emit('There are games only on the Amusement Pier, north of the docks.');
    if (p.silver < 5) return emit('The coin toss costs 5 silvers, and you are short.');
    p.silver -= 5;
    const win = Math.random() < 0.4 + p.circle * 0.01 + (p.patron === 'fortune' ? 0.1 : 0);
    if (win) {
      const winnings = 10 + Math.floor(Math.random() * (15 + p.circle * 3));
      p.silver += winnings;
      emit(`You toss the copper and the table man grins — the coin lands your way! You walk away with ${winnings} silvers.`);
    } else {
      emit('The coin spins, wobbles... and lands the house\'s way. The table man pockets your 5 silvers with a sympathetic shrug.');
    }
  },

  track(ctx) {
    const { game, p, emit } = ctx;
    const res = game.track(p);
    setRoundtime(p, 4);
    emit(res.msg);
  },

  hunt(ctx) {
    const { game, p, emit } = ctx;
    const res = game.hunt(p);
    setRoundtime(p, 5);
    emit(res.msg);
  },

  ladder(ctx) {
    const { game, p, arg1, emit } = ctx;
    const VALID = ['province', 'city', 'undead', 'construct', 'beast', 'humanoid', 'spirit', 'skins', 'boxes'];
    if (arg1 && !VALID.includes(arg1.toLowerCase())) {
      return emit('Usage: ladder — or "ladder province|city" to group, or "ladder undead|construct|beast|humanoid|spirit|skins|boxes" to specialize.');
    }
    emit(game.ladder(arg1 ? arg1.toLowerCase() : null));
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
    const atAcademy = p.room === 'academy';
    if (p.room !== 'temple' && p.room !== 'temple_row' && !atAcademy) return emit('You need books. The Temple of the Pantheon keeps a library, and Asemath Academy keeps a better one.');
    // Scholarship compounds: each rank speeds the mind's work at books
    // (DR: Scholarship governs all learning speed).
    const leveled = gainSkillExp(p, 'scholarship', 10 + skillRank(p, 'scholarship') * 0.5);
    const leveled2 = gainSkillExp(p, 'appraisal', (atAcademy ? 6 : 2) + skillRank(p, 'scholarship') * 0.2);
    setRoundtime(p, 4);
    emit(`${atAcademy ? 'You pore over the Academy\'s scrolls of appraisal and trade.' : 'You pore over a dusty tome of lore.'}${leveled ? ' Your Scholarship improved!' : ''}${leveled2 ? ' Your Appraisal improved!' : ''}`);
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

  report(ctx) {
    const { p, rest, emit } = ctx;
    if (!rest || !rest.trim()) return emit('Usage: report <what happened> — files a complaint with the town scribes.');
    const line = `${new Date().toISOString()} REPORT by ${p.name}: ${rest}`;
    // eslint-disable-next-line no-console
    console.log(line);
    emit('Your report has been filed with the scribes. The town takes these matters seriously.');
  },

  party(ctx) {
    const { game, p, arg1, emit } = ctx;
    if (!arg1) {
      const res = game.partyStatus(p);
      emit(res.msg);
      return;
    }
    const what = arg1.toLowerCase();
    if (what === 'join') {
      const res = game.partyJoin(p);
      emit(res.msg);
      return;
    }
    if (what === 'leave') {
      const res = game.partyLeave(p);
      emit(res.msg);
      return;
    }
    const res = game.partyInvite(p, arg1);
    emit(res.msg);
  },

  quit(ctx) {
    const { game, p, say } = ctx;
    say('Thanks for playing Dragon Realms. Farewell!');
    game.removePlayer(p);
    setTimeout(() => { try { p.ws.close(); } catch {} }, 50);
  },

  time(ctx) {
    const { game, say } = ctx;
    say(`${gameTime()}\nOverhead, ${game.weatherLabel ? game.weatherLabel() : 'the weather is fair.'}`);
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
    broadcastRoom(game, p, `You say, "${rest}"`, `${p.name} says, "${rest}"`, 'say');
  },

  emote(ctx) {
    const { game, p, rest, emit } = ctx;
    if (!rest) return emit('Emote what?');
    broadcastRoom(game, p, `You ${rest}`, `${p.name} ${rest}`, 'emote');
  },

  shout(ctx) {
    const { game, p, rest, emit } = ctx;
    if (!rest) return emit('Shout what?');
    for (const o of game.players.values()) {
      o.ws.send(JSON.stringify({ t: 'msg', msg: `${p.name} shouts, "${rest.toUpperCase()}!"`, channel: 'shout' }));
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
  const { game, p, emit } = ctx;
  const n = p.guild.id === 'bard' ? 2 : 1;
  const leveled = gainSkillExp(p, 'performance', 5 * n);
  setRoundtime(p, 5);
  // Performance rank draws coin: passers-by tip what pleases their ear.
  // Bards earn double; high ranks in any guild's hands fill the hat faster.
  const rank = skillRank(p, 'performance');
  const tip = Math.random() < Math.min(0.6, 0.15 + rank * 0.01)
    ? Math.ceil((2 + rank * 0.4) * n) : 0;
  if (tip) p.silver += tip;
  const flavor = ['a somber dirge', 'a bawdy tavern tune', 'an old war ballad', 'a wordless hum'][Math.floor(Math.random() * 4)];
  emit(`You perform ${flavor} for a moment, filling the air with your voice.${tip ? ` A listener tosses you ${tip} silvers.` : ''}${leveled ? ' Your Performance improved!' : ''}`);
}

function appraise(ctx) {
  const { game, p, arg1, emit } = ctx;
  const qualityNameFor = (mult) => (QUALITY_LADDER.find((q) => Math.abs(q.mult - mult) < 0.001) || {}).name;
  if (!arg1) return emit('Appraise what? Look around, name an item you carry, or a creature here.');
  const n = arg1.toLowerCase();
  const inv = findInventoryItem(p, n);
  const eq = Object.values(p.equipment).find((i) => i.name.includes(n));
  const creature = game.findCreature(p.room, n);
  const leveled = gainSkillExp(p, 'appraisal', 4);
  let target;
  if (inv) {
    target = `${inv.item.name} (worth about ${inv.item.value} silvers)`;
    if (inv.quality) target += `, ${qualityNameFor(inv.quality)}`;
    if (inv.maker) target += `, made by ${inv.maker}`;
  } else if (eq) {
    target = `${eq.name} (worth about ${eq.value} silvers)`;
    if (eq.quality) target += `, ${qualityNameFor(eq.quality)}`;
    if (eq.maker) target += `, made by ${eq.maker}`;
  } else if (creature) target = `${creature.def.name.charAt(0).toUpperCase() + creature.def.name.slice(1)} — looks like it could be skinned for a few silvers`;
  else return emit('You cannot appraise that.');
  setRoundtime(p, 4);
  emit(`You appraise ${target}.${leveled ? ' Your Appraisal improved!' : ''}`);
}

function quest(ctx) {
  const { game, p, say, emit } = ctx;
  if (!game.hasCrier(p) && !p.quest) {
    return emit('Ask the town crier for work — he stands in the town square.');
  }
  if (!p.quest) {
    const q = game.assignQuest(p);
    if (q.kind === 'kill') {
      const def = creatureById(q.creatureId);
      say(`\nThe crier nods. "The town's overrun with ${def.plural}. Slay ${q.count} ${def.plural} and I'll see you paid."`);
    } else if (q.kind === 'deliver') {
      say(`\nThe crier hands you a parcel. "Take ${q.target.parcel} to ${q.target.name} — ${q.target.topic} has need of it. Quick as you can."`);
    } else if (q.kind === 'recover') {
      say(`\nThe crier lowers his voice. "${q.trinket.name} was lost to the ${creatureById(q.creatureId).plural} down below. Find it, and it's yours to return."`);
    } else {
      say(`\nThe crier points to the tanner's. "Hides are worth coin today. Skin ${q.count} creatures and bring me the work."`);
    }
    return;
  }
  if (p.quest.done) {
    const res = game.questClaim(p);
    emit(res.msg);
    return;
  }
  say(`\nQuest: ${game.questDescription(p)}`);
}

function deliver(ctx) {
  const { game, p, emit } = ctx;
  const res = game.questDeliver(p);
  emit(res.msg);
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
        return `\nThe Crossing has five hunting grounds:\n  Old Sewers (down from Temple Row) — rats and kobolds\n  North Fields (through the North Gate) — hogs and worse along the trade road\n  Old Woods (west gate) — goblins and wolves\n  Whispering Marsh (east gate) — wisps\n  Deep Wilds (north from the woods) — forest trolls\nHunt what you can handle, and sell the hides in the market.`;
      }
      if (topic === 'guilds') {
        return `\nEleven guilds have halls in the Guild District (west of the green). Visit your own hall to train skills and circle up.`;
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
