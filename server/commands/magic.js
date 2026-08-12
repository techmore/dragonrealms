// Magic commands: casting, preparation, mana, cambrinth, familiars.
import { roomById } from '../../data/world.js';
import { spellsFor, spellById } from '../../data/guilds.js';
import { manaTypeFor, manaCycle, roomManaLevel, manaDescriptor, safeOverchannelPct, backfireChance } from '../../data/mana.js';
import { gainSkillExp, skillRank, removeItem } from '../player.js';
import { findInventoryItem } from './util.js';

export const commands = {
  prepare(ctx) {
    const { p, arg1, arg2, emit } = ctx;
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
  },

  cast(ctx) {
    const { game, p, arg1, arg2, emit } = ctx;
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
      return;
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
      return;
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
  },

  spells(ctx) {
    const { p, say, emit } = ctx;
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
  },

  perceive(ctx) {
    const { p, emit } = ctx;
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
  },

  harness(ctx) {
    const { p, emit } = ctx;
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
  },

  charge(ctx) { cambrinth(ctx, 'charge'); },
  invoke(ctx) { cambrinth(ctx, 'invoke'); },
  focus(ctx) { cambrinth(ctx, 'focus'); },

  predict(ctx) {
    const { p, emit } = ctx;
    if (p.guild.id !== 'moonmage') return emit('Only moon mages read the stars.');
    if (skillRank(p, 'astrology') < 1) return emit('You need Astrology to read the sky. Train it at your guild hall.');
    const cost = 10;
    if (p.mana < cost) return emit(`You need ${cost} mana to cast your gaze skyward.`);
    p.mana -= cost;
    const skill = skillRank(p, 'astrology');
    p.buffs = p.buffs || {};
    p.buffs.omen = Math.min(120, 60 + skill * 2);
    const leveled = gainSkillExp(p, 'astrology', 8);
    gainSkillExp(p, 'scholarship', 4);
    emit(`You read the turn of the moons and glimpse the pattern of things to come. An omen settles over you — the stars will guide your step.${leveled ? ' Your Astrology improved!' : ''}`);
  },

  summon(ctx) { familiar(ctx); },
  familiar(ctx) { familiar(ctx); },
  dismiss(ctx) {
    const { p, arg1, emit } = ctx;
    if (arg1 !== 'familiar') return emit('Usage: dismiss familiar');
    if (!p.familiar) return emit('You have no familiar to dismiss.');
    p.familiar = null;
    emit('You release the aetherial thread. Your familiar fades into the air.');
  },

  mend(ctx) {
    const { game, p, arg1, emit } = ctx;
    if (p.guild.id !== 'empath') return emit('Only empaths feel the wounds of others.');
    if (!arg1) return emit('Mend whom?');
    const n = arg1.toLowerCase();
    const target = [...game.players.values()].find((o) => o !== p && o.room === p.room && o.name.toLowerCase() === n);
    if (!target) return emit('There is no such adventurer here.');
    if (target.hp >= target.maxHp) return emit(`${target.name} is already whole.`);
    const skill = skillRank(p, 'healing_magic');
    const amount = Math.min(target.maxHp - target.hp, 10 + skill * 3 + p.circle * 2);
    target.hp += amount;
    // The wound passes into the empath (DR wound-taking).
    const selfCost = Math.max(1, Math.floor(amount * 0.5));
    p.hp = Math.max(1, p.hp - selfCost);
    gainSkillExp(p, 'empathy', 6);
    gainSkillExp(p, 'healing_magic', 8);
    target.ws.send(JSON.stringify({ t: 'msg', msg: `${p.name} lays hands on you — warmth floods the wound and it closes. (+${amount} health)` }));
    emit(`You take ${target.name}'s wound into yourself, mending ${amount} health — and feel ${selfCost} of it yourself.`);
    game.status(target);
  },

  pray(ctx) {
    const { p, emit } = ctx;
    if (p.room !== 'temple' && p.room !== 'temple_row') return emit('You can pray at the Temple of the Pantheon.');
    if (p.guild.id === 'paladin') {
      const gained = Math.min(2, 100 - (p.soul ?? 50));
      p.soul = (p.soul ?? 50) + gained;
      gainSkillExp(p, 'conviction', 4);
      emit(`You kneel in the quiet and pray. Your soul brightens (+${gained}).`);
    } else {
      gainSkillExp(p, 'scholarship', 2);
      emit('You kneel in the quiet and pray. A moment of peace steadies you.');
    }
  },

  companion(ctx) { companion(ctx); },
  call: companion,
  release(ctx) {
    const { p, emit } = ctx;
    if (p.guild.id !== 'ranger') return emit('Only rangers walk with companions.');
    p.companion = null;
    emit('You release your companion back to the wild.');
  },

  beseech(ctx) {
    const { p, arg1, emit } = ctx;
    if (p.guild.id !== 'ranger') return emit('Only rangers beseech the wilds.');
    const kind = (arg1 || '').toLowerCase();
    if (!['wind', 'sun'].includes(kind)) return emit('The wilds answer two calls: beseech wind (swiftness) or beseech sun (renewal).');
    if (p.beseechAt && Date.now() - p.beseechAt < 5 * 60 * 1000) {
      const mins = Math.ceil((5 * 60 * 1000 - (Date.now() - p.beseechAt)) / 60000);
      return emit(`The wilds grow wary of your calls — beseech again in ${mins} min.`);
    }
    p.beseechAt = Date.now();
    p.buffs = p.buffs || {};
    if (kind === 'wind') p.buffs.wind = 60;
    else p.buffs.sun = 60;
    gainSkillExp(p, 'foraging', 6);
    gainSkillExp(p, 'primary_magic', 3);
    emit(kind === 'wind'
      ? 'You beseech the wind — it wraps around you, quickening your step.'
      : 'You beseech the sun — its warmth seeps into your bones, mending you as you fight.');
  },
};

function cambrinth(ctx, action) {
  const { p, cmd, arg1, emit } = ctx;
  const entry = findInventoryItem(p, arg1 || '');
  if (!entry || entry.item.type !== 'cambrinth') {
    return emit(action === 'charge' ? 'Charge what? You need a cambrinth device.' : action === 'invoke' ? 'Invoke what? You need a cambrinth device.' : 'Focus on what?');
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

  if (action === 'focus') {
    if (!p.cambrinth || p.cambrinth.itemId !== entry.item.id || p.cambrinth.charge <= 0) {
      return emit('It sits inert — no energy stored.');
    }
    emit(`You focus on ${entry.item.name}: it holds ${p.cambrinth.charge}/${p.cambrinth.capacity} points of ${p.cambrinth.manaType} energy.`);
    return;
  }

  if (action === 'invoke') {
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
    return;
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
    return;
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
}

function familiar(ctx) {
  const { p, cmd, arg1, emit } = ctx;
  if (p.guild.id !== 'warmage') return emit('Only warrior mages bind familiars.');
  if (cmd === 'familiar' || !arg1) {
    const f = p.familiar;
    if (!f) return emit('You have no familiar bound. At your guild hall, say "summon familiar".');
    return emit(`Your familiar ${f.name} is ${f.alive ? `with you (${f.hp}/${f.maxHp} health)` : 'drained of spirit — it needs time to recover.'}`);
  }
  if (arg1 !== 'familiar') return emit('Usage: summon familiar | familiar | dismiss familiar');
  if (p.room !== 'hall_warmage') return emit('Familiars are bound at the Warrior Mage guildhall.');
  if (skillRank(p, 'summoning') < 1) return emit('You need Summoning skill to bind a familiar. Train it first.');
  if (p.familiar && p.familiar.alive) return emit(`${p.familiar.name} is already bound to you.`);
  const names = ['Sparx', 'Nimbus', 'Flick', 'Ember', 'Zephyr', 'Pyre'];
  const hp = 30 + p.circle * 5;
  p.familiar = {
    name: names[Math.floor(Math.random() * names.length)],
    hp, maxHp: hp, alive: true,
  };
  gainSkillExp(p, 'summoning', 8);
  emit(`You bind a thread of aether to ${p.familiar.name}, a small spirit of crackling light. It will fight beside you.`);
}

function companion(ctx) {
  const { p, emit } = ctx;
  if (p.guild.id !== 'ranger') return emit('Only rangers walk with companions.');
  const c = p.companion;
  if (!c) return emit('You have no companion. Slay a wolf and its spirit may bond with you.');
  emit(`Your companion, ${c.name}, is ${c.alive ? `at your side (${c.hp}/${c.maxHp})` : 'spent — it needs time to recover.'}`);
}
