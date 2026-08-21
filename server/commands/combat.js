// Combat commands: engagement, maneuvers, stances, PvP, barbarian/thief arts.
import { KHRI, khriById, concentrationPool, khriConcentrationUsed, KHRI_TICKS } from '../../data/khri.js';
import { barbarianAbilityById, barbarianAbilitiesFor, barbarianSlots, ABILITY_PATHS, VOICE_POOL } from '../../data/abilities.js';
import { roomById } from '../../data/world.js';
import { gainSkillExp, skillRank, stancePoints, STANCES, STANCE_COSTS, setRoundtime } from '../player.js';
import { weaponReach } from '../combat.js';
import { pad } from './util.js';
import { skinCreature } from './skin.js';
import { learnSpell } from './magic.js';

const STANCE_DESC = {
  aggressive: 'You strike harder, but guard worse.',
  defensive: 'You guard well, at the cost of your own blows.',
  guarded: 'You take a sturdy guard, turning aside a little extra harm.',
};

function stanceDesc(name) {
  return STANCE_DESC[name] || 'You fight without a fixed stance.';
}

// ---------------- engagement ----------------
function khri(ctx) {
  const { p, arg1, emit } = ctx;
  if (p.guild.id !== 'thief') return emit('Only thieves weave khri.');
  if (!arg1) {
    const active = Object.entries(p.khri || {}).filter(([, t]) => t > 0).map(([id]) => KHRI[id]?.name || id);
    const lines = Object.values(KHRI).map((k) => `  ${pad(k.name, 12)} ${k.cost} concentration — ${k.desc}`);
    return emit(`\nKhri: ${active.length ? active.join(', ') : 'none active'} (${khriConcentrationUsed(p)}/${concentrationPool(p)} concentration)\n${lines.join('\n')}\nSay "khri <name>" to focus it.`);
  }
  const name = arg1.toLowerCase();
  const def = khriById(name) || Object.values(KHRI).find((k) => k.name.toLowerCase() === name);
  if (!def) return emit('Unknown khri. Try "khri" for the list.');
  if (khriConcentrationUsed(p) + def.cost > concentrationPool(p)) {
    return emit(`That khri needs ${def.cost} concentration; you have ${concentrationPool(p) - khriConcentrationUsed(p)} free. (Pool: ${concentrationPool(p)} — raise Stealth or circle for more.)`);
  }
  p.khri = p.khri || {};
  if ((p.khri[def.id] || 0) > 0) return emit(`Khri ${def.name} is already active.`);
  p.khri[def.id] = KHRI_TICKS;
  gainSkillExp(p, 'stealth', 4);
  emit(`You focus Khri ${def.name}. (${khriConcentrationUsed(p)}/${concentrationPool(p)} concentration)`);
}

function target(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (!arg1 || arg1 === 'none' || arg1 === 'off') {
    p.targetId = null;
    return emit('You are no longer targeting anything.');
  }
  const n = arg1.toLowerCase();
  const creature = game.findCreature(p.room, n);
  if (creature) {
    p.targetId = `creature:${creature.uid}`;
    return emit(`You set your gaze on ${creature.def.name}. Use "attack" or "cast" with no target to strike it.`);
  }
  const player = [...game.players.values()].find((o) => o !== p && o.room === p.room && o.name.toLowerCase() === n);
  if (player) {
    p.targetId = `player:${player.charId}`;
    return emit(`You set your gaze on ${player.name}.`);
  }
  return emit('There is no such creature or adventurer here.');
}

function hide(ctx) {
  const { game, p, emit } = ctx;
  if (!game.isWild(p.room)) return emit('There is nowhere to hide in town.');
  if (p.combatId && p.guild.id !== 'thief') return emit('Only thieves can vanish into the chaos of a fight.');
  const thief = p.guild.id === 'thief' ? 2 : 1;
  const leveled = gainSkillExp(p, 'hiding', 5 * thief);
  const leveled2 = gainSkillExp(p, 'stealth', 5 * thief);
  p.hidden = true;
  setRoundtime(p, 3);
  emit(`You melt into the shadows of the ${game.zoneName(p.room)}.${p.combatId ? ' Your foes lose sight of you...' : ''}${leveled ? ' Your Hiding improved!' : ''}${leveled2 ? ' Your Stealth improved!' : ''}`);
}

function ambush(ctx) {
  const { game, p, arg1, emit } = ctx;
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
  setRoundtime(p, 4);
  game.status(p);
}

function snipe(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (p.guild.id !== 'ranger') return emit('Only rangers know how to put a shaft through the heart.');
  if (!p.hidden) return emit('You must be hiding to snipe. Try "hide" first.');
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
      return emit('There is nothing to snipe here. Try "attack <creature>" first.');
    }
  }
  combat.snipeAttack(uid);
  setRoundtime(p, 5);
  game.status(p);
}

const SLIP_COOLDOWN_MS = 60 * 1000;

function slip(ctx) {
  const { game, p, emit } = ctx;
  if (p.guild.id !== 'ranger') return emit('Only rangers know how to slip away.');
  if (p.slipAt && Date.now() - p.slipAt < SLIP_COOLDOWN_MS) {
    const secs = Math.ceil((SLIP_COOLDOWN_MS - (Date.now() - p.slipAt)) / 1000);
    return emit(`You cannot vanish again so soon (${secs}s).`);
  }
  const combat = game.combat.getFor(p);
  if (combat && combat.defender === p) return emit('You are locked in an automatic duel.');
  setRoundtime(p, 4);
  const chance = 0.5 + skillRank(p, 'hiding') * 0.01 + skillRank(p, 'evasion') * 0.01;
  if (combat) {
    if (Math.random() >= chance) {
      p.slipAt = Date.now();
      return emit('You try to melt into the foliage, but your foes press too close!');
    }
    p.slipAt = Date.now();
    gainSkillExp(p, 'hiding', 8);
    gainSkillExp(p, 'evasion', 6);
    combat.end(false, false, true, null);
    return;
  }
  p.slipAt = Date.now();
  const leveled = gainSkillExp(p, 'hiding', 6);
  emit(`You slip through the ${game.zoneName(p.room)} like water through fingers.${leveled ? ' Your Hiding improved!' : ''}`);
}

function attack(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (!arg1) {
    if (p.targetId) {
      const [, uid] = p.targetId.split(':');
      const combat = game.combat.getFor(p);
      if (combat && combat.setTarget(uid)) {
        if (p.hidden) combat.ambushAttack(uid);
        return emit(`You focus your attack on your marked target.`);
      }
      return emit('Your mark is not in reach here.');
    }
    return emit('Attack what?');
  }
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
        // Commit to closing: melee weapons advance to the target's range so
        // the swing can land (DR no longer auto-charges, but ATTACK implies
        // pressing in; the retreat/advance dance still governs spacing).
        const enemy = combat.aliveEnemies.find((e) => e.uid === creature.uid);
        if (enemy && !weaponReach(p).includes(enemy.range)) combat.advanceCreature(enemy);
        emit(`You focus your attack on ${creature.def.name}.`);
      }
    }
  } else {
    game.startCombat(p, [creature.def]);
    const c2 = game.combat.getFor(p);
    if (c2) {
      const enemy = c2.aliveEnemies.find((e) => e.uid === c2.playerTarget);
      if (enemy && !weaponReach(p).includes(enemy.range)) c2.advanceCreature(enemy);
      if (p.hidden) c2.ambushAttack(c2.playerTarget);
    }
  }
}

function retreat(ctx) {
  const { game, p, emit } = ctx;
  const combat = game.combat.getFor(p);
  if (!combat) return emit('You are not in combat.');
  if (combat.defender === p) { combat.defenderRetreat(); return; }
  const res = combat.retreat();
  if (res && res.msg) emit(res.msg);
}

function flee(ctx) {
  const { game, p, emit } = ctx;
  const combat = game.combat.getFor(p);
  if (!combat) return emit('You are not in combat.');
  if (combat.defender === p) { combat.defenderRetreat(); return; }
  const res = combat.disengage();
  if (res && res.msg) emit(res.msg);
}

function advance(ctx) {
  const { game, p, emit } = ctx;
  const combat = game.combat.getFor(p);
  if (!combat) return emit('There is nothing to advance on.');
  if (combat.defender === p) return emit('You are locked in an automatic duel.');
  const res = combat.advance();
  if (res && res.msg) emit(res.msg);
}

function assess(ctx) {
  const { game, p, emit } = ctx;
  const combat = game.combat.getFor(p);
  if (!combat) return emit('You assess your situation... and nothing is here to fight.');
  const res = combat.assess();
  emit(res.msg);
}

function stance(ctx) {
  const { game, p, arg1, emit } = ctx;
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
}

function maneuver(ctx, kind) {
  const { game, p, arg1, emit } = ctx;
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
}

function skin(ctx) {
  const { game, p, arg1, say, emit } = ctx;
  skinCreature(game, p, arg1, say, emit);
}

function berserk(ctx) {
  const { game, p, emit } = ctx;
  if (p.guild.id !== 'barbarian') return emit('Only barbarians know the fury.');
  const combat = game.combat.getFor(p);
  if (!combat) return emit('The fury stirs only in battle.');
  combat.toggleBerserk();
  setRoundtime(p, 3);
  gainSkillExp(p, 'expertise', 4);
}

// ---------------- barbarian arts ----------------
function abilities(ctx) {
  const { p, say, emit } = ctx;
  if (p.guild.id !== 'barbarian') return emit('Only barbarians wield inner fire abilities.');
  const slots = barbarianSlots(p.circle);
  const used = (p.abilities || []).length;
  const rows = barbarianAbilitiesFor(p).map((a) => {
    const state = a.learned ? 'known' : a.learnable ? 'learnable' : a.known ? 'free' : `needs ${a.req} ${ABILITY_PATHS[a.path]} path`;
    return `  ${pad(a.name, 22)} [${a.kind}] ${a.path ? `${ABILITY_PATHS[a.path]} · ` : ''}${state} — ${a.desc}`;
  });
  say(`\n\x1b[1mBarbarian abilities\x1b[0m (${used}/${slots} slots)\nVoice: ${p.voice}/${VOICE_POOL}\n${rows.join('\n')}\n\nLearn new abilities at the barbarian hall: "learn <ability>".`);
}

function learn(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (p.guild.magic) return learnSpell(ctx);
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
}

function barbarianAbility(ctx, kind) {
  const { game, p, arg1, arg2, cmd, emit } = ctx;
  if (p.guild.id !== 'barbarian') return emit('Only barbarians know these arts.');
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
  setRoundtime(p, kind === 'meditation' ? 8 : kind === 'form' ? 5 : 3);
  if (!res.ok) emit(res.msg);
}

function barbarianTech(ctx, abilityId) {
  const { game, p, emit } = ctx;
  if (p.guild.id !== 'barbarian') return emit('Only barbarians know this art.');
  const combat = game.combat.getFor(p);
  if (!combat) return emit('That takes battle around you.');
  const def = barbarianAbilityById(abilityId);
  if (!(p.abilities || []).includes(def.id)) return emit(`You have not learned ${def.name}.`);
  if (p.circle < def.minCircle) return emit(`${def.name} unlocks at circle ${def.minCircle}.`);
  const res = abilityId === 'whirlwind' ? combat.whirlwind() : abilityId === 'war_stomp' ? combat.warStomp() : combat.choke();
  setRoundtime(p, 6);
  if (!res.ok) emit(res.msg);
}

// Use an ability that resolves through the unified useAbility path (dispel,
// mage's lash): works in combat, may need a named target.
function barbarianUse(ctx, abilityId) {
  const { game, p, arg1, emit } = ctx;
  if (p.guild.id !== 'barbarian') return emit('Only barbarians know this art.');
  const combat = game.combat.getFor(p);
  if (!combat) return emit('That takes battle around you.');
  const def = barbarianAbilityById(abilityId);
  if (!(p.abilities || []).includes(def.id)) return emit(`You have not learned ${def.name}.`);
  let uid = combat.playerTarget;
  if (arg1) {
    const n = arg1.toLowerCase();
    const foe = combat.aliveEnemies.find((e) =>
      e.def.id === n || e.def.name.includes(n) || e.def.plural.includes(n));
    if (foe) uid = foe.uid;
    else return emit(`There is no such foe engaged to target.`);
  }
  const res = combat.useAbility(def, uid);
  setRoundtime(p, 4);
  if (!res.ok) emit(res.msg);
}

function analyze(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (p.guild.id !== 'barbarian') return emit('Only barbarians know this art.');
  const combat = game.combat.getFor(p);
  if (!combat) return emit('That takes battle around you.');
  const kind = (arg1 || 'flame').toLowerCase();
  if (!['flame', 'accuracy', 'damage'].includes(kind)) return emit('Analyze what? Try "analyze flame", "analyze accuracy", or "analyze damage".');
  const res = combat.analyze(kind);
  if (!res.ok) emit(res.msg);
}

function belch(ctx) {
  const { p, emit } = ctx;
  if (p.guild.id === 'barbarian') {
    emit(['You let out a belch that echoes off the walls, deep and satisfied.', 'A mighty belch rumbles out of you. The warchief would be proud.', 'You belch. Somewhere, a goblin takes it as a challenge.'][Math.floor(Math.random() * 3)]);
  } else {
    emit('You burp quietly and mumble an apology.');
  }
}

function shakeHand(ctx) {
  const { p, arg1, emit } = ctx;
  if (p.guild.id === 'barbarian' && arg1) {
    emit(`You seize ${arg1}'s hand in a grip like iron and grind it once, firmly. A proper barbarian greeting.`);
  } else if (p.guild.id === 'barbarian') {
    emit('You shake your own hand, practicing the proper barbarian grip. It feels right.');
  } else {
    emit(arg1 ? `You shake hands with ${arg1}.` : 'You shake hands with the air. Perhaps greet someone first.');
  }
}

function backstab(ctx) {
  const { game, p, emit } = ctx;
  if (p.guild.id !== 'thief') return emit('Only thieves know this art.');
  const combat = game.combat.getFor(p);
  if (!combat) return emit('You need a target in combat.');
  combat.backstab();
  setRoundtime(p, 4);
}

function smite(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (p.guild.id !== 'paladin') return emit('Only paladins smite.');
  const soul = p.soul ?? 50;
  if (soul < 15) return emit(`Your soul is too dim to smite (${soul}). Pray at the temple or slay the undead to restore it.`);
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
      return emit('There is nothing to smite here.');
    }
  }
  const target = combat.aliveEnemies.find((e) => e.uid === uid);
  if (!target) return emit('There is nothing to smite here.');
  const skill = skillRank(p, 'holy_magic');
  const highSoul = soul >= 80 ? 1.5 : 1;
  const dmg = Math.floor((20 + soul * 0.8 + skill * 2 + p.circle * 2) * highSoul);
  p.soul = Math.max(0, soul - 15);
  target.hp -= dmg;
  combat.say(`\x1b[1mYou smite ${target.def.name} with radiant fury for ${dmg} damage!\x1b[0m`);
  setRoundtime(p, 4);
  gainSkillExp(p, 'holy_magic', 10);
  gainSkillExp(p, 'conviction', 6);
  if (target.hp <= 0) {
    if (target.def.controller) combat.defenderDefeated();
    else combat.killCreature(target);
  }
  game.status(p);
}

function impede(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (p.guild.id !== 'warmage') return emit('Only warrior mages bind the elements.');
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
      return emit('There is nothing to impede here. Try "attack <creature>" first.');
    }
  }
  const res = combat.impede(uid);
  setRoundtime(p, 4);
  if (!res.ok) emit(res.msg);
  game.status(p);
}

// ---------------- PvP ----------------
function duel(ctx) {
  const { game, p, arg1, arg2, rest, emit } = ctx;
  if (!arg1) return emit('Usage: duel <playername> [blood|blow|pain] [reason...] — challenges them to a duel (wilds only).');
  const end = (arg2 || 'blood').toLowerCase();
  const reason = (rest || '').split(/\s+/).slice(2).join(' ');
  const res = game.challengeDuel(p, arg1, end, reason);
  emit(res.msg);
}

function pvp(ctx) {
  const { game, p, arg1, arg2, emit } = ctx;
  const stance = (arg2 || arg1 || '').toLowerCase();
  if (!stance || !['open', 'guarded', 'closed'].includes(stance)) {
    return emit(`Your PvP stance is ${(p.pvpStance || 'guarded').toUpperCase()}. Usage: pvp stance open | guarded | closed\n  OPEN — anyone may attack you without challenge\n  GUARDED — attacks require your accept\n  CLOSED — you decline all challenges\nStealing or committing a crime forces your stance OPEN.`);
  }
  p.pvpStance = stance;
  game.persistPlayer(p);
  emit(`Your PvP stance is now ${stance.toUpperCase()}. ${stance === 'open' ? 'Others may attack you freely.' : stance === 'closed' ? 'All challenges are declined.' : 'Challenges require your consent.'}`);
}

function surrender(ctx) {
  const { game, p, emit } = ctx;
  if (p.warrant) {
    const res = game.surrenderToGuards(p);
    if (!res.ok) emit(res.msg);
    return;
  }
  const combat = game.combat.getFor(p);
  if (!combat || !combat.duel) return emit('You are not in a duel.');
  combat.surrender(p === combat.defender ? 'defender' : 'player');
}

function assault(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (!arg1) return emit('Assault whom? Only adventurers standing OPEN to attack can be struck.');
  const res = game.startAssault(p, arg1);
  emit(res.msg);
}

function recall(ctx) {
  const { game, p, arg1, emit } = ctx;
  if ((arg1 || '').toLowerCase() !== 'warrant') return emit('Usage: recall warrant — read the law\'s charge against you.');
  if (!p.warrant) return emit('You have no warrant outstanding. Your name is clean.');
  const mins = Math.max(1, Math.ceil((Date.now() - p.warrant.issuedAt) / 60000));
  emit(`\n\x1b[1mWarrant of the Crossing\x1b[0m\n  Charge: ${p.warrant.charge.toUpperCase()}\n  Issued: ${mins} minute(s) ago\n\nGuards will seize you on sight. Say "surrender" to give yourself up and clear it.`);
}

function accept(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (!arg1) return emit('Usage: accept <playername>');
  const res = game.acceptDuel(p, arg1);
  emit(res.msg);
}

function decline(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (!arg1) return emit('Usage: decline <playername>');
  const res = game.declineDuel(p, arg1);
  emit(res.msg);
}

export const commands = {
  khri,
  target,
  hide,
  ambush,
  snipe,
  slip,
  attack,
  kill: attack,
  retreat,
  flee,
  advance,
  assess,
  stance,
  disarm: (ctx) => maneuver(ctx, 'disarm'),
  trip: (ctx) => maneuver(ctx, 'trip'),
  bash: (ctx) => maneuver(ctx, 'bash'),
  'shield-bash': (ctx) => maneuver(ctx, 'bash'),
  skin,
  berserk,
  abilities,
  ability: abilities,
  learn,
  form: (ctx) => barbarianAbility(ctx, 'form'),
  roar: (ctx) => barbarianAbility(ctx, 'roar'),
  meditate: (ctx) => barbarianAbility(ctx, 'meditation'),
  whirlwind: (ctx) => barbarianTech(ctx, 'whirlwind'),
  stomp: (ctx) => barbarianTech(ctx, 'war_stomp'),
  choke: (ctx) => barbarianTech(ctx, 'choke'),
  dispel: (ctx) => barbarianUse(ctx, 'dispel'),
  mageslash: (ctx) => barbarianUse(ctx, 'mages_lash'),
  analyze,
  belch,
  shake: shakeHand,
  shakehand: shakeHand,
  backstab,
  smite,
  impede,
  duel,
  assault,
  recall,
  pvp,
  surrender,
  accept,
  decline,
};
