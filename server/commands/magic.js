// Magic commands: casting, preparation, mana, cambrinth, familiars.
import { roomById } from '../../data/world.js';
import { spellsFor, spellById, spellTierFor, SPELL_TIER_RANKS } from '../../data/guilds.js';
import { SKILLS } from '../../data/skills.js';
import { manaTypeFor, manaCycle, roomManaLevel, manaDescriptor, safeOverchannelPct, backfireChance } from '../../data/mana.js';
import { gainSkillExp, skillRank, removeItem, addItem } from '../player.js';
import { db } from '../db.js';
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
    // Spell difficulty tiers (DR): command the skill before the spell obeys.
    const tier = spellTierFor(spell.minCircle);
    const req = SPELL_TIER_RANKS[tier];
    const castSkill = skillRank(p, spell.skill);
    if (castSkill < req) {
      return emit(`${spell.name} is ${tier} magic — you need ${req} ranks of ${SKILLS[spell.skill].name} to command it (you have ${castSkill}).`);
    }
    let cost = Math.ceil(spell.mana * pct / 100);
    const lunar = p.lunarUntil && Date.now() < p.lunarUntil;
    if (lunar) cost = Math.max(1, Math.ceil(cost * 0.9));
    if (p.mana < cost) return emit(`You need ${cost} mana to cast ${spell.name}.`);
    if (lunar) emit('Your lunar insight eases the weave (10% less mana).');
    // Foreign-mana backlash (DR SvS-lite): some ground rejects some magic.
    const zone = roomById(p.room)?.zone || 'town';
    const dark = spell.skill === 'necromancy' || spell.skill === 'sorcery';
    const sacred = zone === 'town' && (p.room === 'high_temple' || p.room === 'temple');
    if (dark && sacred) {
      const chance = 0.4;
      if (Math.random() < chance) {
        p.mana -= Math.floor(cost * 0.5);
        p.prepared = null;
        const dmg = Math.max(1, Math.floor(p.maxHp * 0.12));
        p.hp = Math.max(1, p.hp - dmg);
        gainSkillExp(p, 'arcana', 4);
        emit(`The holy ground burns against your ${dark ? 'dark' : 'foreign'} magic! Your spell unravels and the backlash scores you for ${dmg} damage.`);
        game.status(p);
        return;
      }
    }
    if (spell.skill === 'holy_magic' && zone === 'blackwood') {
      const chance = 0.3;
      if (Math.random() < chance) {
        p.mana -= Math.floor(cost * 0.5);
        p.prepared = null;
        const dmg = Math.max(1, Math.floor(p.maxHp * 0.08));
        p.hp = Math.max(1, p.hp - dmg);
        gainSkillExp(p, 'arcana', 4);
        emit(`The blackwood drinks your holy light — the spell gouts out and the cold bites you for ${dmg} damage.`);
        game.status(p);
        return;
      }
    }
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
        // Patron of the Lady of Life: mending comes easier to her faithful.
        if (p.patron === 'life') amount = Math.round(amount * 1.25);
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
    const { game, p, emit } = ctx;
    const { type, def } = manaTypeFor(p.guild);
    if (type === 'none') {
      return emit('You close your eyes and feel nothing — no mana stirs for your kind. The wild power of your own blood is all you need.');
    }
    const room = roomById(p.room);
    const zone = room ? room.zone : 'town';
    let level = roomManaLevel(p.guild, zone);
    const weather = game.weatherManaMod ? game.weatherManaMod() : 0;
    if (weather !== 0) level = Math.max(0, Math.min(1, level + weather));
    const bonus = Math.min(0.3, skillRank(p, 'attunement') * 0.002);
    const tide = manaCycle(type) > 0.62 ? ' waxing' : manaCycle(type) < 0.38 ? ' waning' : '';
    const sky = weather > 0 ? ' The storm-charged aether surges!' : weather < 0 ? ' The fog dims the flow.' : '';
    const leveled = gainSkillExp(p, 'attunement', 3);
    emit(`You reach out with your senses... ${def.desc} The ${def.name.toLowerCase()} mana here flows ${manaDescriptor(level + bonus)}${tide} (${Math.floor(level * 100)}% base).${sky}${leveled ? ' Your Attunement improved!' : ''}`);
  },

  harness(ctx) {
    const { game, p, emit } = ctx;
    const { type, def } = manaTypeFor(p.guild);
    if (type === 'none') {
      return emit('Harness what? Your guild commands no mana.');
    }
    const room = roomById(p.room);
    const zone = room ? room.zone : 'town';
    let level = roomManaLevel(p.guild, zone);
    const weather = game.weatherManaMod ? game.weatherManaMod() : 0;
    if (weather !== 0) level = Math.max(0, Math.min(1, level + weather));
    if (level < 0.12) return emit('The mana here is too thin to harness.');
    const cap = 10 + skillRank(p, 'attunement') * 2;
    const before = p.heldMana || 0;
    let gain = Math.floor(8 + level * 10 + skillRank(p, 'attunement') * 0.4);
    if (p.element === 'fire') gain = Math.floor(gain * 1.25);
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

  // The three moons of the Seventh Age, clean-room analog: the great Xibar
  // (slow cycle), the lesser Yavash (day cycle), and the dark Katamba.
  observe(ctx) {
    const { p, arg1, emit } = ctx;
    if ((arg1 || '').toLowerCase() !== 'sky') return emit('Observe what? Try "observe sky".');
    observeMoon(ctx);
  },
  telescope(ctx) { telescope(ctx); },
  moon(ctx) {
    const { p, arg1, emit } = ctx;
    if ((arg1 || '').toLowerCase() !== 'gate') return emit('Moon what? Try "moon gate <city>".');
    moonGate({ ...ctx, arg1: ctx.arg2 });
  },

  summon(ctx) { summonCommand(ctx); },
  familiar(ctx) { familiar(ctx); },
  dismiss(ctx) {
    const { p, arg1, emit } = ctx;
    if (arg1 === 'familiar' || arg1 === 'companion' || arg1 === 'risen') {
      const slot = arg1 === 'familiar' ? 'familiar' : arg1 === 'companion' ? 'companion' : 'risen';
      if (!p[slot]) return emit(`You have no ${slot} to dismiss.`);
      p[slot] = null;
      return emit(slot === 'risen' ? 'The risen shambles back into the earth.' : slot === 'companion' ? 'You release your companion back to the wild.' : 'You release the aetherial thread. Your familiar fades into the air.');
    }
    return emit('Usage: dismiss familiar | companion | risen');
  },

  animate(ctx) {
    const { game, p, arg1, emit } = ctx;
    if (p.guild.id !== 'necromancer') return emit('Only necromancers speak with the dead.');
    if (p.risen) return emit(`Your risen, ${p.risen.name}, already serves you. Dismiss it first.`);
    const corpse = (p.corpses || []).find((c) => c.def.name.replace(/^a /, '').split(' ')[0].includes((arg1 || '').toLowerCase()) || c.def.id === (arg1 || '').toLowerCase());
    if (!corpse) return emit('There is no suitable corpse here. Slay something first.');
    const def = corpse.def;
    let hp = 20 + p.circle * 4 + def.circle * 5;
    let preserved = '';
    // Ritual Preserve: a preserved corpse rises harder (DR Preserve).
    if (p.ritualPreserveUntil && Date.now() < p.ritualPreserveUntil) {
      hp = Math.floor(hp * 1.5);
      preserved = ' The Preserve ritual holds — it rises tougher than it fell!';
    }
    p.risen = {
      name: `a risen ${def.name.replace(/^a /, '')}`,
      hp, maxHp: hp, alive: true,
    };
    p.ritualPreserveUntil = null;
    p.corpses = p.corpses.filter((c) => c !== corpse);
    const leveled = gainSkillExp(p, 'thanatology', 10);
    emit(`You trace cold sigils over ${def.name} and it rises, hollow-eyed, to serve.${preserved}${leveled ? ' Your Thanatology improved!' : ''}`);
  },
  risen(ctx) {
    const { p, emit } = ctx;
    const r = p.risen;
    if (!r) return emit('No risen servant walks at your side. Animate a corpse to raise one.');
    emit(`Your risen, ${r.name}, ${r.alive ? `shambles beside you (${r.hp}/${r.maxHp})` : 'lies dormant.'}`);
  },

  ritual(ctx) { ritual(ctx); },

  mend(ctx) {
    const { game, p, arg1, emit } = ctx;
    if (p.guild.id !== 'empath') return emit('Only empaths feel the wounds of others.');
    if (!arg1) return emit('Mend whom?');
    const n = arg1.toLowerCase();
    let target = [...game.players.values()].find((o) => o !== p && o.room === p.room && o.name.toLowerCase() === n);
    let viaLink = '';
    // A living Link lets the empath reach across rooms (DR: link sustains).
    if (!target && p.empathLink && Date.now() < p.empathLink.until) {
      target = [...game.players.values()].find((o) => o !== p && o.charId === p.empathLink.charId);
      if (target) viaLink = ' You reach through the silver thread of your link and find them.';
    }
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
    target.ws.send(JSON.stringify({ t: 'msg', msg: `${p.name} lays hands on you — warmth floods the wound and it closes. (+${amount} health)${viaLink ? ' You feel the touch across the distance.' : ''}` }));
    emit(`You take ${target.name}'s wound into yourself, mending ${amount} health${viaLink ? ' from afar' : ''} — and feel ${selfCost} of it yourself.${viaLink}`);
    game.status(target);
  },

  link(ctx) {
    const { game, p, arg1, emit } = ctx;
    if (p.guild.id !== 'empath') return emit('Only empaths spin links.');
    if (!arg1) return emit('Link whom?');
    const target = [...game.players.values()].find((o) => o !== p && o.room === p.room && o.name.toLowerCase() === arg1.toLowerCase());
    if (!target) return emit('There is no such adventurer here to link with.');
    if (p.linkAt && Date.now() - p.linkAt < 5 * 60 * 1000) {
      const mins = Math.ceil((5 * 60 * 1000 - (Date.now() - p.linkAt)) / 60000);
      return emit(`Your spirit is still weary from the last link (${mins} min).`);
    }
    p.linkAt = Date.now();
    const until = Date.now() + 10 * 60 * 1000;
    p.empathLink = { charId: target.charId, until };
    target.empathLink = { charId: p.charId, until };
    const leveled = gainSkillExp(p, 'empathy', 10);
    target.ws.send(JSON.stringify({ t: 'msg', msg: `${p.name} reaches out and a silver thread settles around your heart — an empath link.` }));
    emit(`You spin a link of silver light between you and ${target.name}. You may "mend" them from any distance for ten minutes.${leveled ? ' Your Empathy improved!' : ''}`);
  },

  touch(ctx) {
    const { game, p, arg1, emit } = ctx;
    if (p.guild.id !== 'empath') return emit('Only empaths read the living.');
    if (!arg1) return emit('Touch whom?');
    const target = [...game.players.values()].find((o) => o !== p && o.room === p.room && o.name.toLowerCase() === arg1.toLowerCase());
    if (!target) return emit('There is no such adventurer here.');
    const pct = Math.floor((target.hp / target.maxHp) * 100);
    const state = pct > 90 ? 'hale and whole' : pct > 70 ? 'lightly worn' : pct > 50 ? 'hurt, but fighting fit' : pct > 25 ? 'badly wounded' : 'near death';
    const leveled = gainSkillExp(p, 'empathy', 6);
    emit(`You lay your palm on ${target.name}'s brow and feel the shape of their wounds: ${state} (${target.hp}/${target.maxHp}).${leveled ? ' Your Empathy improved!' : ''}`);
  },

  scar(ctx) {
    const { p, emit } = ctx;
    if (p.guild.id !== 'empath') return emit('Only empaths carry the scar tax.');
    const stain = p.empathicStain || 0;
    const cap = Math.max(5, Math.floor(p.maxHp * 0.1));
    const state = stain === 0 ? 'clear' : stain >= cap ? 'heavy' : stain > cap / 2 ? 'worn' : 'light';
    emit(`The scar tax: you carry ${stain}/${cap} empathic stains.${stain > 0 ? ' Each life you take darkens it and shrinks your own health — it lifts slowly with time.' : ' A clean ledger — you have taken no lives.'} (${state})`);
  },

  pray(ctx) {
    const { p, emit } = ctx;
    const atHighTemple = p.room === 'high_temple';
    if (p.room !== 'temple' && p.room !== 'temple_row' && !atHighTemple) {
      return emit('You can pray at the Temple of the Pantheon — or in the High Temple, behind the altar.');
    }
    if (p.guild.id === 'cleric') {
      if (p.devoteAt && Date.now() - p.devoteAt < 10 * 60 * 1000) {
        const mins = Math.ceil((10 * 60 * 1000 - (Date.now() - p.devoteAt)) / 60000);
        return emit(`Your devotion is still warm from the last ritual. Wait ${mins} min.`);
      }
      p.devoteAt = Date.now();
      const gained = Math.min(atHighTemple ? 10 : 5, 100 - (p.devotion ?? 30));
      p.devotion = (p.devotion ?? 30) + gained;
      gainSkillExp(p, 'theurgy', 8);
      return emit(atHighTemple
        ? `You kneel before the great altar and give yourself to the silence. The gods answer — your faith deepens (+${gained} devotion; ${p.devotion}/100).`
        : `You kneel and perform a quiet devotion. Your faith deepens (+${gained} devotion; ${p.devotion}/100).\nHigh devotion empowers your holy magic; neglect dims it.`);
    }
    if (p.guild.id === 'paladin') {
      const gained = Math.min(atHighTemple ? 4 : 2, 100 - (p.soul ?? 50));
      p.soul = (p.soul ?? 50) + gained;
      gainSkillExp(p, 'conviction', 4);
      return emit(atHighTemple
        ? `You pray before the High Temple's altar, and light settles on your shoulders. Your soul brightens (+${gained}).`
        : `You kneel in the quiet and pray. Your soul brightens (+${gained}).`);
    }
    const gained = Math.round((atHighTemple ? 4 : 2) * (p.patron === 'knowledge' ? 1.5 : 1));
    gainSkillExp(p, 'scholarship', gained);
    emit(atHighTemple
      ? 'You stand a long while in the great hall, and the weight of centuries steadies you. A moment of peace steadies you.'
      : 'You kneel in the quiet and pray. A moment of peace steadies you.');
  },
  enchant(ctx) {
    const { p, arg1, emit } = ctx;
    if (p.guild.id !== 'bard') return emit('Only bards weave enchantes.');
    if (!arg1 || arg1 === 'off' || arg1 === 'stop') {
      p.cyclic = null;
      return emit('The song fades from the air.');
    }
    const song = arg1.toLowerCase();
    if (!['war', 'bravery', 'regen'].includes(song)) return emit('You know three enchantes: enchant war (fury), enchant bravery (ward), enchant regen (renewal).');
    if (p.cyclic) return emit(`You are already singing an enchante. "enchant off" to end it.`);
    const cost = song === 'regen' ? 5 : 4;
    p.cyclic = { song, ticks: 60, tickCount: 0, upkeep: cost };
    gainSkillExp(p, 'illusion', 6);
    gainSkillExp(p, 'performance', 6);
    emit(`You begin an enchante — ${song === 'war' ? 'a driving war march' : song === 'bravery' ? 'a steady ballad of bravery' : 'a gentle hymn of renewal'}. It costs ${cost} mana every few beats to sustain.`);
  },
  enchante(ctx) { /* alias */ const { p, emit } = ctx; const c = p.cyclic; emit(c ? `Enchante active: ${c.song} (${c.ticks} beats left)` : 'No enchante is playing.'); },
  devotion(ctx) {
    const { p, emit } = ctx;
    if (p.guild.id !== 'cleric') return emit('Only clerics keep devotion.');
    const d = p.devotion ?? 30;
    const state = d >= 70 ? 'incandescent' : d >= 40 ? 'steady' : d >= 20 ? 'flickering' : 'dim';
    emit(`Your devotion is ${d}/100 — ${state}. Devotions at the temple deepen it; holy magic burns brighter with it.`);
  },

  commune(ctx) { commune(ctx); },
  sacrifice(ctx) { sacrifice(ctx); },
  element(ctx) { element(ctx); },

  glyph(ctx) { glyph(ctx); },

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

// Paladin glyphs: soul-fueled wards traced in light (DR: glyphs of the
// Light-Bearer). Each glyph costs soul and mana, and hangs on a cooldown.
const GLYPHS = {
  faith: {
    id: 'faith', name: 'Ward of Faith', soul: 10, mana: 8, ticks: 60,
    desc: 'Trace the ward of faith — armor hardens while it holds.',
  },
  valor: {
    id: 'valor', name: 'Glyph of Valor', soul: 12, mana: 8, ticks: 60,
    desc: 'Trace the glyph of valor — blows land with greater force.',
  },
  protection: {
    id: 'protection', name: 'Glyph of Protection', soul: 12, mana: 8, ticks: 60,
    desc: 'Trace the glyph of protection — harm slides off you.',
  },
};
const GLYPH_COOLDOWN_MS = 2 * 60 * 1000;

function glyph(ctx) {
  const { p, arg1, emit } = ctx;
  if (p.guild.id !== 'paladin') return emit('Only paladins trace glyphs.');
  if (p.circle < 2) return emit(`Glyphs are taught at circle 2; you are circle ${p.circle}.`);
  if (!arg1) {
    const lines = Object.values(GLYPHS).map((g) => `  ${g.name} — ${g.soul} soul, ${g.mana} mana — ${g.desc}`);
    return emit(`\nGlyphs you may trace:\n${lines.join('\n')}\nSay "glyph <name>" — each needs ${Math.round(GLYPH_COOLDOWN_MS / 60000)} min between tracings.`);
  }
  const def = GLYPHS[arg1.toLowerCase()] || Object.values(GLYPHS).find((g) => g.name.toLowerCase().includes(arg1.toLowerCase()));
  if (!def) return emit('You know no such glyph. Try "glyph" for the list.');
  const soul = p.soul ?? 50;
  if (soul < def.soul) return emit(`Your soul is too dim to trace ${def.name} (${soul}/${def.soul}). Pray at the temple or slay the undead.`);
  if (p.mana < def.mana) return emit(`You need ${def.mana} mana to trace ${def.name}.`);
  if (p.glyphAt && Date.now() - p.glyphAt < GLYPH_COOLDOWN_MS) {
    const mins = Math.ceil((GLYPH_COOLDOWN_MS - (Date.now() - p.glyphAt)) / 60000);
    return emit(`Your aura is still settling from the last glyph (${mins} min).`);
  }
  p.soul = soul - def.soul;
  p.mana -= def.mana;
  p.glyphAt = Date.now();
  const key = { faith: 'glyph_ward', valor: 'glyph_valor', protection: 'glyph_shield' }[def.id];
  p.buffs = p.buffs || {};
  p.buffs[key] = def.ticks;
  gainSkillExp(p, 'conviction', 8);
  gainSkillExp(p, 'holy_magic', 6);
  emit(`You trace ${def.name} in the air — light sears where your finger passes and settles around you. (${p.soul} soul remains)`);
}

const RITUAL_TICKS_MS = 10 * 60 * 1000;

// The three moons: Xibar the great (72h), Yavash the lesser (24h),
// Katamba the dark (48h). Each returns a 0..1 fullness.
export function moonPhases() {
  const hours = Date.now() / 3600000;
  const wave = (periodHours, phase = 0) => 0.5 + 0.5 * Math.sin((hours / periodHours) * Math.PI * 2 + phase);
  return { xibar: wave(72), yavash: wave(24), katamba: wave(48, 2.1) };
}

function moonPhaseName(v) {
  if (v > 0.85) return 'full';
  if (v > 0.6) return 'waxing';
  if (v > 0.35) return 'waning';
  return 'dark';
}

const SKY_CD_MS = 5 * 60 * 1000;

function observeMoon(ctx) {
  const { p, emit } = ctx;
  if (p.guild.id !== 'moonmage') return emit('Only moon mages read the moons.');
  if (skillRank(p, 'astrology') < 1) return emit('You need Astrology to read the sky. Train it at your guild hall.');
  const cost = 5;
  if (p.mana < cost) return emit(`You need ${cost} mana to read the sky.`);
  p.mana -= cost;
  const { xibar, yavash, katamba } = moonPhases();
  const leveled = gainSkillExp(p, 'astrology', 8);
  gainSkillExp(p, 'scholarship', 2);
  p.buffs = p.buffs || {};
  // Lunar insight: the next spells cost a little less while it holds.
  p.lunarUntil = Date.now() + (60 + skillRank(p, 'astrology')) * 1000;
  emit(`You lift your eyes to the night:\n  Xibar, the great moon, rides ${moonPhaseName(xibar)} (${Math.round(xibar * 100)}%)\n  Yavash, the lesser, is ${moonPhaseName(yavash)} (${Math.round(yavash * 100)}%)\n  Katamba, the dark moon, shows ${moonPhaseName(katamba)} (${Math.round(katamba * 100)}%)\nLunar insight settles over you — your magic flows more easily.${leveled ? ' Your Astrology improved!' : ''}`);
}

function telescope(ctx) {
  const { p, emit } = ctx;
  if (p.guild.id !== 'moonmage') return emit('Only moon mages keep telescopes.');
  if (p.room !== 'hall_moonmage') return emit('The great telescope stands in the Moon Mage guildhall, beneath the domed roof.');
  if (p.telescopeAt && Date.now() - p.telescopeAt < SKY_CD_MS) {
    const mins = Math.ceil((SKY_CD_MS - (Date.now() - p.telescopeAt)) / 60000);
    return emit(`The telescope is still cooling from your last observation (${mins} min).`);
  }
  p.telescopeAt = Date.now();
  const { xibar, yavash, katamba } = moonPhases();
  const leveled = gainSkillExp(p, 'astrology', 18);
  p.buffs = p.buffs || {};
  p.lunarUntil = Date.now() + (90 + skillRank(p, 'astrology') * 2) * 1000;
  emit(`You swing the great telescope to the sky and study the moons for a long while. Charts fill with new annotations — Xibar ${moonPhaseName(xibar)}, Yavash ${moonPhaseName(yavash)}, Katamba ${moonPhaseName(katamba)}. Lunar insight burns bright in you.${leveled ? ' Your Astrology improved!' : ''}`);
}

function moonGate(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (p.guild.id !== 'moonmage') return emit('Only moon mages weave moon gates.');
  if (!arg1) return emit('Moon gate where? Try "moon gate crossing" or "moon gate riverhaven".');
  const dest = { crossing: 'square', riverhaven: 'rh_square' }[arg1.toLowerCase()];
  if (!dest) return emit('The moons can carry you to crossing or riverhaven.');
  if (p.room === dest) return emit('You are already there.');
  const cost = 15;
  if (p.mana < cost) return emit(`A moon gate needs ${cost} mana.`);
  const { xibar } = moonPhases();
  // Xibar must be waxing enough to bridge the distance; Astrology widens
  // the window (DR moon-gating is gated on the moons).
  const window = 0.5 - skillRank(p, 'astrology') * 0.004;
  if (xibar < window) {
    return emit(`Xibar stands only ${Math.round(xibar * 100)}% and the gate will not hold. The great moon must be fuller to bridge the distance.`);
  }
  p.mana -= cost;
  p.buffs = p.buffs || {};
  p.lunarUntil = Date.now() + 30 * 1000;
  gainSkillExp(p, 'astrology', 12);
  gainSkillExp(p, 'moon_magic', 10);
  const roomName = dest === 'square' ? 'the Crossing' : 'Riverhaven';
  game.moveTo(p, dest);
  emit(`You trace the moon's path in silver light — the gate yawns, folds of space turn, and you step through into ${roomName}.`);
  game.status(p);
}

// Necromancer rituals (DR Thanatology): work the dead for profit and power.
function ritual(ctx) {
  const { p, arg1, emit } = ctx;
  if (p.guild.id !== 'necromancer') return emit('Only necromancers know the rituals of the grave.');
  if (!arg1) {
    const lines = [
      '  butchery  — your next harvests of the dead run twice (10 min)',
      '  consume   — devour a corpse to steal back its vitality',
      '  dissect   — cut a corpse for salable organs',
      '  preserve  — the next corpse you raise rises harder (10 min)',
    ];
    const active = [];
    if (p.ritualButcheryUntil && Date.now() < p.ritualButcheryUntil) active.push(`Butchery (${Math.ceil((p.ritualButcheryUntil - Date.now()) / 60000)}m)`);
    if (p.ritualPreserveUntil && Date.now() < p.ritualPreserveUntil) active.push('Preserve (ready)');
    return emit(`\nRituals of Thanatology${active.length ? ` — active: ${active.join(', ')}` : ''}:\n${lines.join('\n')}\n\nSay "ritual <name>".`);
  }
  const name = arg1.toLowerCase();
  if (name === 'butchery') {
    p.ritualButcheryUntil = Date.now() + RITUAL_TICKS_MS;
    gainSkillExp(p, 'thanatology', 6);
    return emit('You speak the ritual of Butchery over your hands — the dead will give twice while it holds.');
  }
  if (name === 'preserve') {
    p.ritualPreserveUntil = Date.now() + RITUAL_TICKS_MS;
    gainSkillExp(p, 'thanatology', 6);
    return emit('You ward yourself against the rot — the next corpse you raise will rise harder.');
  }
  if (name === 'consume') {
    if (!(p.corpses || []).length) return emit('There is no corpse here to devour.');
    const corpse = p.corpses.pop();
    const heal = Math.min(p.maxHp - p.hp, 15 + p.circle * 3);
    p.hp += heal;
    p.mana = Math.min(p.maxMana, p.mana + 20);
    const leveled = gainSkillExp(p, 'thanatology', 12);
    emit(`You draw the last vigour from ${corpse.def.name} — ${heal} health and a rush of ${p.guild.magic ? 'mana' : 'power'} settle into your bones.${leveled ? ' Your Thanatology improved!' : ''}`);
    return;
  }
  if (name === 'dissect') {
    if (!(p.corpses || []).length) return emit('There is no corpse here to dissect.');
    const corpse = p.corpses.pop();
    addItem(p, 'organ_vial', 1);
    const leveled = gainSkillExp(p, 'thanatology', 12);
    const leveled2 = gainSkillExp(p, 'appraisal', 4);
    emit(`You open ${corpse.def.name} with precise cuts and jar what is worth keeping.${leveled ? ' Your Thanatology improved!' : ''}${leveled2 ? ' Your Appraisal improved!' : ''}`);
    return;
  }
  return emit('You know no such ritual. Try "ritual" for the list.');
}

// The Immortals of the Seventh Age (clean-room): a cleric communes with one
// patron; faith earns favor, favor buys miracles.
const PATRONS = {
  war: {
    id: 'war', name: 'the Warmaster', desc: 'The god of battle — his faithful are sturdier of frame (+8% health).',
  },
  life: {
    id: 'life', name: 'the Lady of Life', desc: 'The goddess of healing — her faithful mend flesh more easily (+25% mending).',
  },
  fortune: {
    id: 'fortune', name: 'the Merchant of Fate', desc: 'The god of luck — his faithful find more coin in the world (better scavenging and games).',
  },
  knowledge: {
    id: 'knowledge', name: 'the Scholar of Secrets', desc: 'The god of wisdom — his faithful learn faster at shrine and study (+50% prayer scholarship).',
  },
};

function commune(ctx) {
  const { p, arg1, emit } = ctx;
  if (p.guild.id !== 'cleric') return emit('Only clerics commune with the Immortals.');
  if (p.room !== 'hall_cleric' && p.room !== 'temple' && p.room !== 'high_temple') {
    return emit('Communion happens at the cleric guildhall or the temples.');
  }
  if ((p.devotion ?? 0) < 10) return emit(`Your faith is too dim to commune (${p.devotion ?? 0} devotion). Pray first.`);
  if (!arg1) {
    const lines = Object.values(PATRONS).map((g) => `  ${g.name} — ${g.desc}`);
    return emit(`\nThe Immortals watch the faithful. Commune with one (you hold ${p.devotion ?? 0} devotion):\n${lines.join('\n')}\n\nSay "commune <name>" — your patron's favor is with you while you serve.`);
  }
  const def = Object.values(PATRONS).find((g) => g.name.toLowerCase().includes(arg1.toLowerCase()) || g.id === arg1.toLowerCase());
  if (!def) return emit('The Immortals know no such name. Try "commune" for the pantheon.');
  if (p.patron === def.id) return emit(`You already walk with ${def.name}.`);
  p.patron = def.id;
  gainSkillExp(p, 'theurgy', 8);
  emit(`You kneel and open your heart — ${def.name} answers. ${def.desc} Your patron is set.`);
}

// Favor-spending: burn devotion at the altar for a miracle.
const SACRIFICE_CD_MS = 10 * 60 * 1000;

function sacrifice(ctx) {
  const { p, emit } = ctx;
  if (p.guild.id !== 'cleric') return emit('Only clerics offer sacrifice.');
  if (p.room !== 'temple' && p.room !== 'high_temple') return emit('Sacrifice is offered at the temples.');
  if ((p.devotion ?? 0) < 15) return emit(`The altar demands 15 devotion; you hold ${p.devotion ?? 0}. Pray to deepen your faith.`);
  if (p.sacrificeAt && Date.now() - p.sacrificeAt < SACRIFICE_CD_MS) {
    const mins = Math.ceil((SACRIFICE_CD_MS - (Date.now() - p.sacrificeAt)) / 60000);
    return emit(`The altar is still warm from your last offering (${mins} min).`);
  }
  p.sacrificeAt = Date.now();
  p.devotion = (p.devotion ?? 30) - 15;
  p.hp = p.maxHp;
  p.mana = p.maxMana;
  const leveled = gainSkillExp(p, 'theurgy', 10);
  emit(`You lay your faith on the altar and it burns away in white light — the Immortals answer: you are made whole.${leveled ? ' Your Theurgy improved!' : ''} (${p.devotion} devotion remains)`);
}

// Warrior Mage elements (DR elements & pathways v1): an active element
// tints the mage's aether with a passive boon.
const ELEMENTS = {
  fire: { id: 'fire', name: 'Fire', desc: 'Your harness runs hot — you gather +25% more mana.' },
  air: { id: 'air', name: 'Air', desc: 'The wind is your ally — you read the wilds more easily (+5% forage/hunt/track).' },
  earth: { id: 'earth', name: 'Earth', desc: 'The deep earth steadies you — rest comes +25% faster.' },
  water: { id: 'water', name: 'Water', desc: 'The tide is your blood — mana renews +25% faster.' },
};

function element(ctx) {
  const { p, arg1, emit } = ctx;
  if (p.guild.id !== 'warmage') return emit('Only warrior mages attune an element.');
  if (!arg1) {
    const lines = Object.values(ELEMENTS).map((e) => `  ${e.name} — ${e.desc}`);
    return emit(`\nThe four elements await your attunement${p.element ? ` — you are currently attuned to ${ELEMENTS[p.element]?.name || p.element}` : ''}:\n${lines.join('\n')}\n\nSay "element <name>".`);
  }
  const def = Object.values(ELEMENTS).find((e) => e.id === arg1.toLowerCase() || e.name.toLowerCase() === arg1.toLowerCase());
  if (!def) return emit('The elements are fire, air, earth, and water.');
  p.element = def.id;
  gainSkillExp(p, 'attunement', 4);
  emit(`You attune yourself to ${def.name}. ${def.desc}`);
}

// Summoned weapon: a blade of aether that holds ten minutes (DR SUMMON WEAPON).
const CONJURE_MS = 10 * 60 * 1000;

function summonCommand(ctx) {
  const { p, arg1, emit } = ctx;
  if (arg1 === 'familiar' || !arg1) return familiar(ctx);
  if (arg1 !== 'weapon') return emit('Summon what? Try "summon familiar" or "summon weapon".');
  if (p.guild.id !== 'warmage') return emit('Only warrior mages conjure weapons.');
  if (p.room !== 'hall_warmage') return emit('Conjuring a weapon takes the focus of the Warrior Mage guildhall.');
  if (p.inventory.some((i) => i.item.id === 'conjured_blade')) return emit('A conjured blade already waits in your pack.');
  if (p.mana < 10) return emit('You need 10 mana to conjure.');
  p.mana -= 10;
  addItem(p, 'conjured_blade', 1);
  const leveled = gainSkillExp(p, 'summoning', 8);
  emit(`You summon a blade of white-hot aether — it will hold for ten minutes.${leveled ? ' Your Summoning improved!' : ''}`);
  setTimeout(() => {
    // The conjuration lapses: clear the DB row and any live copy.
    try {
      db.prepare('DELETE FROM inventory WHERE character_id=? AND item_id=?').run(p.charId, 'conjured_blade');
    } catch { /* server closing */ }
    const live = p.online ? p : null;
    if (live) {
      live.inventory = live.inventory.filter((i) => i.item.id !== 'conjured_blade');
      if (live.ws) live.ws.send(JSON.stringify({ t: 'msg', msg: 'Your conjured blade dissolves into a wisp of aether.' }));
    }
  }, CONJURE_MS).unref();
}

function familiar(ctx) {
  const { p, cmd, arg1, emit } = ctx;
  if (p.guild.id !== 'warmage') return emit('Only warrior mages bind familiars.');  if (cmd === 'familiar' || !arg1) {
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
