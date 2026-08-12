// Async immersive combat engine.
// Combats resolve on a server-side ticker; players issue commands between ticks
// (attack, cast, retreat, berserk, backstab) and read the running narrative.
import { creatureById } from '../data/creatures.js';
import { roomById } from '../data/world.js';
import { SKILLS, CATEGORIES } from '../data/skills.js';
import {
  weaponOf, skillRank, effectiveRank, totalArmor, gainSkillExp, defenseSkillOf,
  countItems, removeItem, MASTERY_SETS,
} from './player.js';

const { MELEE_WEAPONS, RANGED_WEAPONS } = MASTERY_SETS;

const TICK_MS = 1000;
const AMMO = { bow: 'arrows', crossbow: 'bolts' };

const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const HIT_VERBS = {
  player: ['lash out at', 'strike', 'slice at', 'drive at', 'swing at', 'pummel'],
  creature: ['lunges at', 'snaps at', 'tears at', 'rakes', 'bashes', 'claws at'],
};
const BODY = ['shoulder', 'ribs', 'side', 'thigh', 'chest', 'leg', 'arm', 'flank', 'head'];
const CREATURE_HIT = [
  'lands a solid blow on your',
  'catches you across the',
  'jabs at your',
  'clips your',
  'slams into your',
];

export class Combat {
  constructor(id, player, enemies, opts = {}) {
    this.id = id;
    this.player = player;
    this.enemies = enemies;
    this.playerTimer = 0;
    this.berserk = false;
    this.backstabCooldown = 0;
    this.onEnd = opts.onEnd || null;
    this.game = opts.game || null;
    this.defender = opts.defender || null; // the other live player in a duel
    this.duel = Boolean(this.defender);
    this.mark = null;       // {uid, rounds, bonus}
    this.ward = null;       // {rounds, amount}
    this.maneuverCd = { disarm: 0, trip: 0, bash: 0 };
    this.playerTarget = enemies.length ? enemies[0].uid : null;
    this.startedAt = Date.now();
    // Barbarian ability state
    this.wildfire = false;
    this.dragonTicks = 0;
    this.tenacityTicks = 0;
    this.rageTicks = 0;
    this.specialCd = { whirlwind: 0, stomp: 0, choke: 0, analyze: 0 };
    this.analyzeCombo = 0;
    this.analyzeTicks = 0;
  }

  get aliveEnemies() {
    return this.enemies.filter((e) => !e.dead);
  }

  say(msg) {
    const targets = [this.player, this.defender].filter((t) => t && t.online && t.ws);
    if (typeof msg === 'string') {
      for (const t of targets) t.ws.send(JSON.stringify({ t: 'combat', msg }));
      return;
    }
    for (const t of targets) {
      const text = t === this.player ? msg.initiator : msg.defender;
      t.ws.send(JSON.stringify({ t: 'combat', msg: text }));
    }
  }

  // Narrate an action from both perspectives in a duel, or broadcast in PvE.
  announce(initiatorText, defenderText) {
    if (this.defender) {
      this.say({ initiator: initiatorText, defender: defenderText });
    } else {
      this.say(initiatorText);
    }
  }

  // --- Player actions ---
  setTarget(uid) {
    const e = this.enemies.find((x) => x.uid === uid && !x.dead);
    if (e) { this.playerTarget = uid; return true; }
    return false;
  }

  startAttack() {
    this.playerTimer = Math.max(this.playerTimer, this.attackSpeed());
  }

  attackSpeed() {
    const w = weaponOf(this.player);
    const base = w ? w.speed : 4;
    const agiBonus = Math.floor(this.player.stats.agi / 20);
    return Math.max(2, base - agiBonus - (this.wildfire ? 1 : 0));
  }

  playerAttack() {
    const target = this.enemies.find((e) => e.uid === this.playerTarget && !e.dead);
    if (!target) return;

    const w = weaponOf(this.player);
    const skillId = w ? w.skill : 'brawling';
    const dualLoad = w && w.skill === 'bow' && this.player.guild.id === 'barbarian' && (this.player.abilities || []).includes('dual_load');

    // Ranged weapons require ammunition.
    if (w) {
      const ammoId = AMMO[w.skill];
      if (ammoId) {
        const need = dualLoad ? 2 : 1;
        if (countItems(this.player, ammoId) < need) {
          this.say(`You draw your ${w.name.replace(/^a /, '')}, but you have no ${ammoId}!`);
          return;
        }
        removeItem(this.player, ammoId, need);
      }
    }

    const skill = effectiveRank(this.player, skillId);
    const atk = skill + this.player.stats.str * 0.06 + this.player.stats.agi * 0.04;
    const def = target.def.defense + target.def.stats.ref * 0.03;
    const hit = Math.random() < clamp(0.5 + (atk - def) * 0.012, 0.15, 0.95);

    // Mastery skills grow alongside the weapons they govern.
    const masterySkill = MELEE_WEAPONS.has(skillId) ? 'melee_mastery' : RANGED_WEAPONS.has(skillId) ? 'missile_mastery' : null;
    if (masterySkill) gainSkillExp(this.player, masterySkill, 2);

    if (!hit) {
      const weaponName = w ? w.name.replace(/^a /, '') : 'fists';
      this.announce(
        `You swing your ${weaponName} at ${target.def.name}, but ${missVerb(target.def)}.`,
        `${this.player.name} swings at you, but you slip the blow.`
      );
      gainSkillExp(this.player, skillId, Math.floor(target.def.circle * 5 * teachingFactor(effectiveRank(this.player, skillId), target.def)));
      return;
    }

    let dmg;
    if (w) dmg = rand(w.dmg[0], w.dmg[1]) + Math.floor(this.player.stats.str * 0.12);
    else dmg = rand(2, 5) + Math.floor(this.player.stats.str * 0.1);
    if (dualLoad) dmg = Math.floor(dmg * 1.5);

    if (this.berserk) dmg = Math.floor(dmg * 1.5);
    if (this.dragonTicks > 0) dmg = Math.floor(dmg * 1.25);
    if (this.rageTicks > 0) dmg = Math.floor(dmg * 1.25);
    if (this.analyzeTicks > 0) dmg = Math.floor(dmg * 1.25);
    if (this.mark && this.mark.uid === target.uid && this.mark.rounds > 0) {
      this.mark.rounds -= 1;
      dmg += this.mark.bonus;
      this.say('Your guided blows strike true, adding to the damage!');
    }
    const stance = this.player.stance || 'balanced';
    if (stance === 'aggressive') dmg = Math.floor(dmg * 1.25);
    else if (stance === 'defensive' || stance === 'guarded') dmg = Math.floor(dmg * 0.85);
    if (this.player.buffs && this.player.buffs.frenzy > 0) dmg = Math.floor(dmg * 1.3);
    if (capstoneActive(this.player, 'necromancer')) {
      const steal = Math.max(1, Math.floor(dmg * 0.1));
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + steal);
      this.say('Your Death Pact drinks in stolen life!');
    }

    // A live duel opponent guards by their own stance and fury.
    if (target.def.controller) {
      const d = target.def.controller;
      const dst = d.stance || 'balanced';
      if (dst === 'defensive') dmg = Math.floor(dmg * 0.85);
      else if (dst === 'guarded') dmg = Math.max(1, dmg - 3);
      if (d.berserk === true || (d.powerState && d.powerState.berserk)) dmg = Math.floor(dmg * 1.25);
      gainSkillExp(d, 'evasion', 6);
      gainSkillExp(d, 'fitness', 3);
    }

    const verb = HIT_VERBS.player[rand(0, HIT_VERBS.player.length - 1)];
    const body = BODY[rand(0, BODY.length - 1)];
    const weaponName = w ? w.name.replace(/^a /, '') : 'fists';
    this.announce(
      `You ${verb} ${target.def.name} in the ${body}${w ? ` with your ${weaponName}` : ''} for ${dmg} damage!`,
      `${this.player.name} ${thirdPerson(verb)} you in the ${body}${w ? ` with their ${weaponName}` : ''} for ${dmg} damage!`
    );
    gainSkillExp(this.player, skillId, Math.floor((target.def.circle * 10 + 12) * teachingFactor(effectiveRank(this.player, skillId), target.def)));

    target.hp -= dmg;
    if (target.def.controller) target.def.controller.hp = Math.max(0, target.hp);
    if (target.hp <= 0) {
      if (target.def.controller) this.defenderDefeated();
      else this.killCreature(target);
    }
  }

  defenderDefeated() {
    const defender = this.defender;
    if (!defender) return;
    this.say({
      initiator: `\x1b[1mYou fell ${defender.name}!\x1b[0m They crumple to the ground, the duel decided.`,
      defender: `\x1b[1mYou are overcome!\x1b[0m You crumple to the ground, the duel decided.`,
    });
    if (this.game && this.game.defenderDefeated) this.game.defenderDefeated(defender, this.player);
    this.end(true, false, false, null);
  }

  killCreature(target) {
    target.dead = true;
    if (!this.player.corpses) this.player.corpses = [];
    this.player.corpses.push({ uid: target.uid, def: target.def });
    this.say(`You fell ${target.def.name}! Its corpse slumps to the ground. Type "skin ${target.def.name.replace(/^a /, '').split(' ')[0]}" to harvest it.`);
    const coins = target.def.circle * (2 + Math.floor(Math.random() * 4));
    this.player.silver += coins;
    this.say(`You pry ${coins} silvers from the corpse.`);
    gainSkillExp(this.player, 'fitness', target.def.circle * 10);
    gainSkillExp(this.player, 'endurance', target.def.circle * 8);
    gainSkillExp(this.player, 'hunting', target.def.circle * 4);
    if (this.player.guild.id === 'barbarian') {
      const gain = 12 + target.def.circle * 4;
      this.player.innerFire = Math.min(this.player.maxInnerFire || 100, (this.player.innerFire || 0) + gain);
      this.say(`The kill kindles your inner fire (+${gain}).`);
    }
    this.rewardExp(target.def);
    if (this.game && this.game.questKill) this.game.questKill(this.player, target.def.id);

    if (!this.aliveEnemies.length) this.end(true);
  }

  rewardExp(def) {
    gainSkillExp(this.player, 'fitness', def.circle * 6);
    gainSkillExp(this.player, 'evasion', def.circle * 4);
  }

  creatureAttack(e) {
    if (e.dead) return;
    const target = this.player;
    const controller = e.def.controller || null;
    let atk = e.def.circle * 4 + e.def.stats.str * 0.06 + e.def.stats.ref * 0.05;
    let def = defenseSkillOf(this.player) + this.player.stats.ref * 0.05;
    const stance = this.player.stance || 'balanced';
    if (stance === 'defensive') def = Math.floor(def * 1.2);
    else if (stance === 'guarded') def = Math.floor(def * 1.1);
    else if (stance === 'aggressive') def = Math.floor(def * 0.8);
    if (capstoneActive(this.player, 'moonmage')) def = Math.floor(def * 1.2);
    if (this.player.buffs && this.player.buffs.shadow > 0) def = Math.floor(def * 1.15);
    if (capstoneActive(this.player, 'ranger') && this.game && this.game.isWild(this.player.room)) def = Math.floor(def * 1.2);
    const hit = Math.random() < clamp(0.45 + (atk - def) * 0.012, 0.15, 0.95);

    if (!hit) {
      this.announce(
        `${cap(e.def.name)} misses you.`,
        `You swing at ${this.player.name}, but they dodge aside.`
      );
      gainSkillExp(this.player, 'evasion', 9);
      if (controller) gainSkillExp(controller, e.def.weapon.skill, 4);
      return;
    }

    let dmg = rand(e.def.weapon.dmg[0], e.def.weapon.dmg[1]) + Math.floor(e.def.stats.str * 0.12);
    const weaponDef = SKILLS[e.def.weapon.skill];
    if (weaponDef && weaponDef.cat === CATEGORIES.MAGIC && this.player.guild.id === 'barbarian') {
      dmg = Math.max(1, Math.floor(dmg * 0.6));
    }
    if (e.disarmedTicks > 0) {
      e.disarmedTicks -= 1;
      dmg = Math.floor(dmg * 0.5);
    }
    if (controller) {
      const dst = controller.stance || 'balanced';
      if (dst === 'aggressive') dmg = Math.floor(dmg * 1.25);
      else if (dst === 'defensive' || dst === 'guarded') dmg = Math.floor(dmg * 0.85);
      if (controller.berserk === true) dmg = Math.floor(dmg * 1.5);
      gainSkillExp(controller, e.def.weapon.skill, 8);
    }
    const armor = totalArmor(this.player);
    dmg = Math.max(1, Math.floor(dmg * (1 - armor / (armor + 80))));
    if (this.berserk && !capstoneActive(this.player, 'barbarian')) dmg = Math.floor(dmg * 1.25);
    if (this.player.buffs && this.player.buffs.ironhide > 0) dmg = Math.max(1, dmg - 6);
    if (capstoneActive(this.player, 'paladin') && Math.random() < 0.15) {
      dmg = 0;
      this.say('Your Aegis of Faith turns aside the blow — no damage!');
    }
    if (this.ward && this.ward.rounds > 0) {
      this.ward.rounds -= 1;
      const reduced = Math.max(1, dmg - this.ward.amount);
      const absorbed = dmg - reduced;
      dmg = reduced;
      this.say(`Your ward flashes, absorbing ${absorbed} damage!`);
    }
    if (this.tenacityTicks > 0) dmg = Math.max(1, dmg - 3);
    if (this.player.guild.id === 'barbarian' && (this.player.abilities || []).includes('juggernaut')) {
      dmg = Math.max(1, Math.floor(dmg * 0.9));
    }
    if (e.chokedTicks > 0) dmg = Math.max(1, Math.floor(dmg * 0.5));
    if (stance === 'guarded') dmg = Math.max(1, dmg - 3);

    const hitPhrase = CREATURE_HIT[rand(0, CREATURE_HIT.length - 1)];
    const body = BODY[rand(0, BODY.length - 1)];
    if (controller) {
      this.announce(
        `${cap(e.def.name)} ${hitPhrase} ${body} for ${dmg} damage.`,
        `You hit ${this.player.name} in the ${body} for ${dmg} damage.`
      );
    } else {
      this.say(`${cap(e.def.name)} ${hitPhrase} ${body} for ${dmg} damage.`);
    }
    if (this.player.hidden) {
      this.player.hidden = false;
      this.say('The blow tears you out of hiding — you are revealed!');
    }
    gainSkillExp(this.player, 'evasion', 12);
    gainSkillExp(this.player, 'fitness', 6);
    gainSkillExp(this.player, 'defending', Math.floor(e.def.circle * 3));
    gainSkillExp(this.player, 'parry', Math.floor(e.def.circle * 3));
    for (const piece of Object.values(this.player.equipment)) {
      if (piece.type === 'armor') {
        gainSkillExp(this.player, piece.skill, Math.floor(e.def.circle * 3 + piece.armor / 8));
      }
    }
    this.player.hp -= dmg;
    if (this.player.hp <= 0) { this.player.hp = 0; this.killPlayer(); }
  }

  killPlayer() {
    this.say('You are overcome, and the world goes dark around you...');
    this.end(false, true);
  }

  // --- Ambush from hiding: a preemptive strike that breaks concealment ---
  ambushAttack(targetUid) {
    const p = this.player;
    const target = this.enemies.find((e) => e.uid === targetUid && !e.dead);
    if (!target) { this.say('Your ambush finds no target.'); p.hidden = false; return; }
    const w = weaponOf(p);
    const skillId = w ? w.skill : 'brawling';
    const skill = effectiveRank(p, skillId);
    const stealth = skillRank(p, 'stealth') + skillRank(p, 'hiding');
    const atk = skill + stealth * 0.6 + p.stats.agi * 0.06 + p.stats.str * 0.04;
    const def = target.def.defense + target.def.stats.ref * 0.03;
    const hit = Math.random() < clamp(0.6 + (atk - def) * 0.012, 0.2, 0.97);

    p.hidden = false;
    if (!hit) {
      this.announce(
        `You spring from hiding at ${target.def.name}, but it twists away!`,
        `${p.name} bursts from hiding at you, but you twist away!`
      );
      gainSkillExp(p, skillId, 4);
      return;
    }
    let dmg;
    if (w) dmg = rand(w.dmg[0], w.dmg[1]) + Math.floor(p.stats.str * 0.12);
    else dmg = rand(3, 7) + Math.floor(p.stats.str * 0.1);
    dmg = Math.floor(dmg * (1.5 + stealth * 0.02));
    this.announce(
      `You burst from hiding and strike ${target.def.name} for ${dmg} damage!`,
      `${p.name} bursts from hiding and strikes you for ${dmg} damage!`
    );
    gainSkillExp(p, skillId, 10);
    gainSkillExp(p, 'stealth', 8);
    gainSkillExp(p, 'hiding', 8);
    if (p.guild.guildSkill) gainSkillExp(p, p.guild.guildSkill, 4);
    target.hp -= dmg;
    if (target.hp <= 0) {
      if (target.def.controller) this.defenderDefeated();
      else this.killCreature(target);
    }
  }

  // --- Spells ---
  cast(spell, targetUid, mult = 1) {
    const p = this.player;
    const cost = Math.ceil(spell.mana * mult);
    if (p.mana < cost) { this.say('You do not have enough mana.'); return; }
    p.mana -= cost;
    const skill = effectiveRank(p, spell.skill);
    const power = 6 + skill * 2 + p.circle;

    // Held mana (from "harness") floods damage and healing spells once.
    let heldBonus = 0;
    if ((p.heldMana || 0) > 0 && (spell.kind === 'damage' || spell.kind === 'heal' || spell.kind === 'drain')) {
      heldBonus = Math.min(spell.base || 8, Math.floor(p.heldMana * 0.2));
      p.heldMana = 0;
      this.say('Your held mana floods the spell, empowering it!');
    }

    // Skill gains: the spell's skill, its magic kind, attunement, primary
    // magic, and the guild skill all grow with casting.
    const magicKind = {
      damage: 'targeted_magic', heal: 'healing_magic', sleep: 'debilitation',
      drain: 'targeted_magic', mark: 'targeted_magic', ward: 'warding_magic',
      buff: 'augmentation', teleport: 'utility_magic', flee: 'utility_magic',
    }[spell.kind];
    const afterCast = () => {
      gainSkillExp(p, spell.skill, 14);
      gainSkillExp(p, 'attunement', 8);
      gainSkillExp(p, 'primary_magic', 5);
      if (magicKind) gainSkillExp(p, magicKind, 12);
      // A gentle broad trickle keeps every magic pool trainable by casting.
      gainSkillExp(p, 'arcana', 2);
      gainSkillExp(p, 'augmentation', 2);
      gainSkillExp(p, 'debilitation', 2);
      gainSkillExp(p, 'utility_magic', 2);
      gainSkillExp(p, 'warding_magic', 2);
      if (p.guild.guildSkill) gainSkillExp(p, p.guild.guildSkill, 5);
    };

    // Self/utility spells that need no combat target.
    if (spell.kind === 'heal') {
      const amount = Math.round((spell.base + skill * 3) * mult) + heldBonus;
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + amount);
      this.say(`You cast ${spell.name} and mend yourself for ${p.hp - before} health.`);
      afterCast();
      return;
    }
    if (spell.kind === 'flee') {
      this.say(`You cast ${spell.name} and melt into the surroundings, breaking away!`);
      afterCast();
      this.end(false, false, true, null);
      return;
    }
    if (spell.kind === 'teleport') {
      afterCast();
      this.teleportSpell();
      return;
    }

    const target = this.enemies.find((e) => e.uid === targetUid && !e.dead);
    if (!target) { this.say('Your spell fizzles without a target.'); return; }
    const hit = Math.random() < 0.8 + skill * 0.005;
    if (!hit) { this.say(`You weave ${spell.name}, but ${target.def.name} resists it.`); afterCast(); return; }

    switch (spell.kind) {
      case 'damage': {
        let dmg = Math.round((rand(4, 6) + Math.floor(power * 0.9) + spell.base + p.circle * 2) * mult) + heldBonus;
        if (capstoneActive(p, 'cleric') || capstoneActive(p, 'warmage')) dmg = Math.floor(dmg * 1.3);
        this.say(`You cast ${spell.name}! ${cap(target.def.name)} is engulfed for ${dmg} damage!`);
        if (capstoneActive(p, 'necromancer')) {
          const steal = Math.max(1, Math.floor(dmg * 0.1));
          p.hp = Math.min(p.maxHp, p.hp + steal);
          this.say('Your Death Pact drinks in stolen life!');
        }
        target.hp -= dmg;
        break;
      }
      case 'drain': {
        const dmg = Math.round((rand(8, 12) + Math.floor(power * 1.1) + spell.base + p.circle * 2) * mult);
        const steal = Math.floor(dmg * 0.4);
        p.hp = Math.min(p.maxHp, p.hp + steal);
        this.say(`You cast ${spell.name}! ${cap(target.def.name)} is drained for ${dmg} damage and you drink ${steal} life!`);
        target.hp -= dmg;
        break;
      }
      case 'buff': {
        p.buffs = p.buffs || {};
        p.buffs[spell.buff.key] = (p.buffs[spell.buff.key] || 0) + spell.buff.ticks;
        this.say(`You cast ${spell.name}! ${buffDesc(spell.buff.key)}`);
        break;
      }
      case 'sleep': {
        const dmg = Math.round((rand(2, 4) + Math.floor(skill * 1.5)) * mult);
        target.timer += target.def.weapon.speed;
        this.say(`You cast ${spell.name}! ${cap(target.def.name)} sways, its eyes heavy, its attacks slowed (${dmg} damage).`);
        target.hp -= dmg;
        break;
      }
      case 'mark': {
        this.mark = { uid: target.uid, rounds: 4, bonus: Math.round(spell.base * mult) };
        this.say(`You cast ${spell.name}! ${cap(target.def.name)} is marked — your blows will find it true.`);
        break;
      }
      case 'ward': {
        this.ward = { rounds: 4, amount: Math.round(spell.base * mult) };
        this.say(`You cast ${spell.name}! A shimmering barrier wraps around you, turning aside blows.`);
        break;
      }
      default:
        return;
    }
    afterCast();
    if (target.hp <= 0) this.killCreature(target);
  }

  teleportSpell() {
    if (this.game) {
      const room = roomById(this.player.room);
      const exits = room ? Object.keys(room.exits) : [];
      if (exits.length) {
        const dir = exits[Math.floor(Math.random() * exits.length)];
        this.say('You slip through the shadows, folding space around you...');
        this.game.move(this.player, dir);
      }
    }
    this.end(false, false, true, null);
  }

  // --- Powers ---
  whirlwind() {
    const p = this.player;
    const w = weaponOf(p);
    if (!w) return { ok: false, msg: 'Whirlwind needs a weapon in hand.' };
    if (this.specialCd.whirlwind > 0) return { ok: false, msg: 'You are still recovering from your last whirlwind.' };
    if ((p.innerFire || 0) < 10) return { ok: false, msg: 'Not enough inner fire (10).' };
    if (!this.aliveEnemies.length) return { ok: false, msg: 'There is nothing to whirl through.' };
    p.innerFire -= 10;
    this.specialCd.whirlwind = 30;
    let total = 0;
    for (const e of this.aliveEnemies) {
      const dmg = Math.max(1, Math.floor((rand(w.dmg[0], w.dmg[1]) + p.stats.str * 0.1) * 0.6));
      e.hp -= dmg;
      total += dmg;
      if (e.hp <= 0) this.killCreature(e);
    }
    gainSkillExp(p, 'inner_fire', 8);
    gainSkillExp(p, w.skill, 10);
    this.say(`You spin in a blazing arc of steel, shredding your foes for ${total} damage!`);
    if (this._ended) return { ok: true, msg: '' };
    return { ok: true, msg: '' };
  }

  warStomp() {
    const p = this.player;
    if (this.specialCd.stomp > 0) return { ok: false, msg: 'The ground has not yet settled from your last stomp.' };
    if ((p.innerFire || 0) < 15) return { ok: false, msg: 'Not enough inner fire (15).' };
    if (!this.aliveEnemies.length) return { ok: false, msg: 'There is nothing to shake here.' };
    p.innerFire -= 15;
    this.specialCd.stomp = 40;
    let shaken = 0;
    for (const e of this.aliveEnemies) {
      e.timer += e.def.weapon.speed;
      const dmg = Math.max(1, Math.floor(p.stats.str * 0.2));
      e.hp -= dmg;
      shaken += 1;
      if (e.hp <= 0) this.killCreature(e);
    }
    gainSkillExp(p, 'inner_fire', 8);
    this.say(`You stomp the ground — the earth shivers and ${shaken} foe${shaken === 1 ? '' : 's'} stagger, off-balance!`);
    if (this._ended) return { ok: true, msg: '' };
    return { ok: true, msg: '' };
  }

  choke() {
    const p = this.player;
    if (this.specialCd.choke > 0) return { ok: false, msg: 'You cannot get a fresh grip yet.' };
    const target = this.enemies.find((e) => e.uid === this.playerTarget && !e.dead);
    if (!target) return { ok: false, msg: 'There is nothing in reach to choke.' };
    if ((p.innerFire || 0) < 10) return { ok: false, msg: 'Not enough inner fire (10).' };
    p.innerFire -= 10;
    this.specialCd.choke = 25;
    target.chokedTicks = 5;
    gainSkillExp(p, 'inner_fire', 8);
    gainSkillExp(p, 'brawling', 8);
    this.announce(
      `You seize ${target.def.name} by the throat! Its blows falter!`,
      `${this.player.name} seizes you by the throat — you cannot strike true!`
    );
    return { ok: true, msg: '' };
  }

  analyze(kind) {
    const p = this.player;
    if (this.specialCd.analyze > 0) return { ok: false, msg: 'You need a moment to study your foe.' };
    if (!this.aliveEnemies.length) return { ok: false, msg: 'There is nothing engaged to analyze.' };
    this.specialCd.analyze = 5;
    this.analyzeCombo = Math.min(3, this.analyzeCombo + 1);
    const leveled = gainSkillExp(p, 'expertise', 10);
    if (this.analyzeCombo >= 3) {
      this.analyzeCombo = 0;
      this.analyzeTicks = 10;
      this.say(`You finish your ${kind} combo — with expert skill you end the attack and maneuver into a better position! Your blows will strike truer!`);
    } else {
      this.say(`You study the flow of battle (${kind} combo ${this.analyzeCombo}/3).${leveled ? ' Your Expertise improved!' : ''}`);
    }
    return { ok: true, msg: '' };
  }

  useAbility(def, targetUid) {
    const p = this.player;
    const msg = (s) => ({ ok: true, msg: s });
    switch (def.id) {
      case 'wildfire': {
        if (this.wildfire) return { ok: false, msg: 'Wildfire already races through you.' };
        if ((p.innerFire || 0) < 12) return { ok: false, msg: 'Not enough inner fire (12).' };
        p.innerFire -= 12;
        this.wildfire = true;
        gainSkillExp(p, 'inner_fire', 8);
        return msg('Wildfire ignites! Your limbs blur — you attack faster!');
      }
      case 'dragon': {
        if (this.dragonTicks > 0) return { ok: false, msg: 'The Dragon Form already enfolds you.' };
        if ((p.innerFire || 0) < 20) return { ok: false, msg: 'Not enough inner fire (20).' };
        p.innerFire -= 20;
        this.dragonTicks = 30;
        gainSkillExp(p, 'inner_fire', 8);
        return msg('The Dragon Form settles over you — your blows will land heavier!');
      }
      case 'tenacity': {
        if (this.tenacityTicks > 0) return { ok: false, msg: 'Your flesh is already hardened.' };
        const hasChakrel = Object.values(p.equipment).some((i) => i.id === 'chakrel_1');
        const cost = hasChakrel ? 20 : 25;
        if ((p.innerFire || 0) < cost) return { ok: false, msg: `Not enough inner fire (${cost}).` };
        p.innerFire -= cost;
        this.tenacityTicks = 40;
        gainSkillExp(p, 'inner_fire', 8);
        return msg(hasChakrel ? 'Your chakrel quickens the rite — you harden your flesh with the Tenacity Meditation.' : 'You harden your flesh with the Tenacity Meditation.');
      }
      case 'everilds_rage': {
        if (this.rageTicks > 0) return { ok: false, msg: 'The rage already burns in you.' };
        if ((p.voice || 0) < 10) return { ok: false, msg: 'Your voice is spent (10 voice needed).' };
        p.voice -= 10;
        this.rageTicks = 12;
        gainSkillExp(p, 'inner_fire', 6);
        return msg('You roar a battle cry — Everild\'s Rage sets your blood ablaze!');
      }
      case 'screech': {
        if ((p.voice || 0) < 12) return { ok: false, msg: 'Your voice is spent (12 voice needed).' };
        const target = this.enemies.find((e) => e.uid === targetUid && !e.dead);
        if (!target) return { ok: false, msg: 'Your screech needs a foe to lash.' };
        p.voice -= 12;
        target.timer += target.def.weapon.speed * 1.5;
        gainSkillExp(p, 'inner_fire', 6);
        this.announce(
          `You shriek! ${cap(target.def.name)} staggers, clutching its ears!`,
          `${this.player.name} shrieks — you stagger, ears ringing!`
        );
        return msg('');
      }
      default:
        return { ok: false, msg: 'That ability cannot be used here.' };
    }
  }

  toggleBerserk() {
    const p = this.player;
    if (this.berserk) {
      this.berserk = false;
      this.say('The fury subsides. You breathe again.');
      return;
    }
    const cost = Math.max(5, 15 - Math.floor(skillRank(p, 'inner_fire') * 0.1));
    if ((p.innerFire || 0) < cost) {
      this.say(`You are too spent to rouse the fury (need ${cost} inner fire).`);
      return;
    }
    p.innerFire -= cost;
    this.berserk = true;
    gainSkillExp(p, 'inner_fire', 8);
    this.say(`Your blood boils! FURY takes you — you strike harder but guard worse! (${cost} inner fire)`);
  }

  // --- Maneuvers (disarm / trip / shield-bash) ---
  maneuver(kind, targetUid) {
    const p = this.player;
    if ((this.maneuverCd[kind] || 0) > 0) { this.say('You are not ready for that maneuver yet.'); return; }
    const target = this.enemies.find((e) => e.uid === targetUid && !e.dead);
    if (!target) { this.say('Your maneuver fizzles without a target.'); return; }

    if (kind === 'bash' && !this.player.equipment.shield) {
      this.say('You need a shield equipped to bash!');
      return;
    }
    const def = target.def;
    let skill = 0;
    let skillId = 'brawling';
    if (kind === 'disarm') {
      const w = weaponOf(p);
      skillId = w ? w.skill : 'brawling';
      skill = skillRank(p, skillId);
    } else if (kind === 'trip') {
      skill = skillRank(p, 'brawling') + p.stats.agi * 0.05;
    } else {
      skillId = 'shield_usage';
      skill = skillRank(p, 'shield_usage');
    }
    const chance = clamp(0.25 + skill * 0.02 - def.defense * 0.01, 0.15, 0.8);
    this.maneuverCd[kind] = 8;
    gainSkillExp(p, skillId, 6);
    gainSkillExp(p, 'tactics', 4);
    gainSkillExp(p, 'tactics', 8);

    if (Math.random() >= chance) {
      this.announce(
        `You try to ${kind} ${target.def.name}, but it resists.`,
        `You dodge ${this.player.name}'s attempt to ${kind} you.`
      );
      return;
    }

    switch (kind) {
      case 'disarm':
        target.disarmedTicks = 4;
        this.announce(
          `You disarm ${target.def.name}! Its blows will falter.`,
          `${this.player.name} knocks your weapon aside — your blows falter!`
        );
        break;
      case 'trip':
        target.timer += target.def.weapon.speed;
        this.announce(
          `You trip ${target.def.name}! It stumbles, off-balance.`,
          `${this.player.name} trips you! You stumble, off-balance.`
        );
        break;
      case 'bash': {
        const bashDmg = 4 + Math.floor(p.stats.str / 10);
        target.hp -= bashDmg;
        target.timer += target.def.weapon.speed * 2;
        this.announce(
          `You slam ${target.def.name} with your shield for ${bashDmg} damage!`,
          `${this.player.name} slams you with a shield for ${bashDmg} damage!`
        );
        if (target.hp <= 0) {
          if (target.def.controller) this.defenderDefeated();
          else this.killCreature(target);
        }
        break;
      }
    }
  }

  backstab() {
    if (this.backstabCooldown > 0) { this.say('You are not yet poised to strike again.'); return; }
    const target = this.enemies.find((e) => e.uid === this.playerTarget && !e.dead);
    if (!target) { this.say('There is nothing to backstab.'); return; }
    const skill = skillRank(this.player, 'small_edged') + skillRank(this.player, 'stealth');
    const dmg = rand(10, 16) + skill * 2 + this.player.circle * 3;
    this.say(`You slip behind ${target.def.name} and bury your blade deep — ${dmg} damage!`);
    gainSkillExp(this.player, 'stealth', 8);
    gainSkillExp(this.player, 'small_edged', 8);
    if (this.player.guild.guildSkill) gainSkillExp(this.player, this.player.guild.guildSkill, 4);
    target.hp -= dmg;
    this.backstabCooldown = capstoneActive(this.player, 'thief') ? 6 : 12;
    if (target.hp <= 0) this.killCreature(target);
  }

  // --- Retreat ---
  retreat() {
    const evade = skillRank(this.player, 'evasion') + this.player.stats.agi * 0.05;
    const pursuit = this.aliveEnemies.reduce((s, e) => s + e.def.circle * 2, 0);
    const chance = clamp(0.4 + (evade - pursuit) * 0.03, 0.15, 0.9);
    if (Math.random() < chance) {
      this.say('You break away and sprint for safety!');
      this.end(false, false, true);
      return true;
    }
    this.say('You try to flee, but your foes block your path!');
    gainSkillExp(this.player, 'evasion', 3);
    return false;
  }

  defenderRetreat() {
    this.say({
      initiator: `${this.defender.name} steps back, yielding the duel.`,
      defender: 'You step back, yielding the duel.',
    });
    this.end(false, false, false, null, { conceded: true });
  }

  end(win, dead = false, fled = false, fleeTo = 'west_gate', extra = {}) {
    if (this._ended) return;
    this._ended = true;
    if (this.onEnd) this.onEnd(this, { win, dead, fled, fleeTo, ...extra });
  }

  // --- Ticker ---
  tick() {
    if (this._ended) return;

    if (this.backstabCooldown > 0) this.backstabCooldown -= 1;
    for (const k of Object.keys(this.maneuverCd)) if (this.maneuverCd[k] > 0) this.maneuverCd[k] -= 1;
    for (const k of Object.keys(this.specialCd)) if (this.specialCd[k] > 0) this.specialCd[k] -= 1;
    if (this.analyzeTicks > 0) {
      this.analyzeTicks -= 1;
      if (this.analyzeTicks <= 0) this.say('Your analyzed advantage fades.');
    }
    for (const e of this.aliveEnemies) {
      if (e.chokedTicks > 0) {
        e.chokedTicks -= 1;
        if (e.chokedTicks <= 0) this.say(`${cap(e.def.name)} breaks free of your grip!`);
      }
    }
    if (this.player.buffs && this.player.buffs.frenzy > 0) this.player.buffs.frenzy -= 1;
    if (this.player.buffs && this.player.buffs.ironhide > 0) this.player.buffs.ironhide -= 1;
    if (this.player.buffs && this.player.buffs.shadow > 0) this.player.buffs.shadow -= 1;
    if (capstoneActive(this.player, 'empath') && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 3);
    }
    if (capstoneActive(this.player, 'bard')) {
      this.player.mana = Math.min(this.player.maxMana, this.player.mana + 2);
    }
    if (this.berserk) {
      this.player.innerFire = (this.player.innerFire || 0) - 2;
      if (this.player.innerFire <= 0) {
        this.player.innerFire = 0;
        this.berserk = false;
        this.say('The fury burns out — your blood runs cold.');
      }
    }
    if (this.dragonTicks > 0) {
      this.dragonTicks -= 1;
      this.player.innerFire = (this.player.innerFire || 0) - 1;
      if (this.player.innerFire <= 0 || this.dragonTicks <= 0) {
        this.player.innerFire = Math.max(0, this.player.innerFire);
        this.dragonTicks = 0;
        this.say('The Dragon Form fades.');
      }
    }
    if (this.tenacityTicks > 0) {
      this.tenacityTicks -= 1;
      if (this.tenacityTicks <= 0) this.say('The Tenacity Meditation wears off.');
    }
    if (this.rageTicks > 0) {
      this.rageTicks -= 1;
      if (this.rageTicks <= 0) this.say('The rage fades from your blood.');
    }
    if (this.player.hp <= 0) return;

    // Player action
    this.playerTimer -= 1;
    if (this.playerTimer <= 0) {
      this.playerAttack();
      this.playerTimer = this.attackSpeed();
    }
    if (this._ended) return;

    // Enemy actions
    for (const e of this.aliveEnemies) {
      if (e.dead || this._ended) continue;
      e.timer -= 1;
      if (e.timer <= 0) {
        this.creatureAttack(e);
        e.timer = e.def.weapon.speed;
      }
    }
  }
}

function missVerb(def) {
  const verbs = ['it slips past harmlessly', 'it twists aside', 'it ducks away', 'it parries the blow', 'you miss by a hair'];
  return verbs[rand(0, verbs.length - 1)];
}

function buffDesc(key) {
  return key === 'frenzy' ? 'Your blood boils — blows land with killing force.' : 'A shroud of iron settles over you — incoming blows are blunted.';
}

function thirdPerson(v) {
  const map = {
    'lash out at': 'lashes out at', strike: 'strikes', 'slice at': 'slices at',
    'drive at': 'drives at', 'swing at': 'swings at', pummel: 'pummels',
  };
  return map[v] || v + 's';
}

// Circle-10 guild capstone check.
function capstoneActive(p, guildId) {
  return Boolean(p && p.guild && p.guild.id === guildId && p.circle >= 10);
}

// Hunting ladder: creatures teach well within their rank band; skills far
// above the band gain sharply reduced experience (DR-authentic anti-grind).
function teachingFactor(playerSkill, def) {
  const hi = def.teaches ? def.teaches[1] : def.circle * 3;
  if (playerSkill <= hi) return 1;
  const over = playerSkill - hi;
  return Math.max(0.15, 1 - over / (hi + 40));
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class CombatManager {
  constructor(game) {
    this.game = game;
    this.combats = new Map();
    this.timer = null;
  }

  start(player, creatureDefs) {
    if (this.combats.has(player.charId)) return { ok: false, error: 'You are already in combat!' };
    if (player.hp <= 0) return { ok: false, error: 'You cannot fight in your condition.' };
    const enemies = creatureDefs.map((def, i) => ({
      uid: `c${player.charId}_${i}_${Math.floor(Math.random() * 1e6)}`,
      def,
      name: def.name,
      hp: def.circle * 14 + def.stats.con * 3 + 20,
      timer: def.weapon.speed,
      dead: false,
    }));
    const combat = new Combat(`combat_${player.charId}_${Date.now()}`, player, enemies, {
      onEnd: (c, result) => this.end(player, c, result),
      game: this.game,
    });
    this.combats.set(player.charId, combat);
    player.combatId = combat.id;
    return { ok: true, combat };
  }

  getFor(player) {
    return this.combats.get(player.charId) || null;
  }

  end(player, combat, result) {
    this.combats.delete(player.charId);
    player.combatId = null;
    if (result.win) {
      player.ws.send(JSON.stringify({ t: 'combat', msg: '\nVictory! You stand over your fallen foes.' }));
      this.game.status(player);
    } else if (result.fled) {
      this.handleFled(player, result.fleeTo);
    } else if (result.dead) {
      this.handleDeath(player);
    }
    // Persist combat-relevant state
    if (this.game.persistPlayer) this.game.persistPlayer(player);
  }

  // ---------------- PvP duels ----------------
  startDuel(player, defender) {
    if (this.combats.has(player.charId) || this.combats.has(defender.charId)) {
      return { ok: false, error: 'One of you is already in combat.' };
    }
    const def = derivePlayerDef(defender);
    const enemies = [{
      uid: `duel_${defender.charId}`,
      def,
      name: defender.name,
      hp: defender.hp,
      maxHp: defender.maxHp,
      timer: def.weapon.speed,
      dead: false,
    }];
    const combat = new Combat(`duel_${player.charId}_${Date.now()}`, player, enemies, {
      onEnd: (c, result) => this.endDuel(player, defender, c, result),
      game: this.game,
      defender,
    });
    this.combats.set(player.charId, combat);
    this.combats.set(defender.charId, combat);
    player.combatId = combat.id;
    defender.combatId = combat.id;
    return { ok: true, combat };
  }

  endDuel(player, defender, combat, result) {
    this.combats.delete(player.charId);
    this.combats.delete(defender.charId);
    player.combatId = null;
    defender.combatId = null;
    const sayTo = (target, msg) => {
      if (target && target.online && target.ws) target.ws.send(JSON.stringify({ t: 'combat', msg }));
    };
    if (result.conceded) {
      sayTo(player, `\n${defender.name} yields — the duel ends. You win by forfeit.`);
      sayTo(defender, '\nYou yield, stepping back. The duel is over.');
    } else if (result.win) {
      sayTo(player, '\nVictory! The duel is yours.');
    } else if (result.dead) {
      this.handleDeath(player);
      sayTo(defender, `\nVictory! ${player.name} is overcome. The duel is yours.`);
    } else if (result.fled) {
      this.handleFled(player, result.fleeTo);
      sayTo(defender, `\n${player.name} fled! You win the duel by forfeit.`);
    }
    this.game.status(player);
    this.game.status(defender);
    this.game.persistPlayer(player);
    this.game.persistPlayer(defender);
  }

  disconnect(player) {
    const combat = this.combats.get(player.charId);
    if (!combat) return;
    combat._ended = true;
    const other = combat.defender === player ? combat.player : combat.defender;
    this.combats.delete(combat.player.charId);
    if (combat.defender) this.combats.delete(combat.defender.charId);
    combat.player.combatId = null;
    if (combat.defender) combat.defender.combatId = null;
    if (other && other.online && other.ws) {
      other.ws.send(JSON.stringify({ t: 'combat', msg: `${player.name} vanished from the fight. You stand alone.` }));
      this.game.status(other);
    }
  }

  handleDeath(player) {
    // Exp penalty: shave a little rank-progress across skills. The TDP pool
    // shares the loss (authentic DR: death reduces rank-points toward TDPs).
    for (const s of Object.values(player.skills)) {
      if (s.exp > 0) s.exp = Math.max(0, s.exp - Math.floor(s.exp * 0.25));
    }
    if (player.tdpPool > 0) player.tdpPool = Math.floor(player.tdpPool * 0.75);
    const corpse = this.game.dropCorpse(player);
    player.hp = Math.floor(player.maxHp * 0.5);
    player.room = 'temple';
    player.corpses = [];
    player.heldMana = 0;
    player.prepared = null;
    const belongings = corpse
      ? ' Your belongings lie with your corpse where you fell — return to reclaim them.'
      : ' You were carrying nothing of worth.';
    player.ws.send(JSON.stringify({ t: 'combat', msg: `You awaken in the Temple of the Pantheon, a healer dabbing your brow. You feel hollowed out — some of your hard-won experience has slipped away.${belongings}` }));
    this.game.look(player);
    this.game.status(player);
  }

  handleFled(player, fleeTo) {
    player.hp = Math.max(1, player.hp - Math.floor(player.hp * 0.1));
    if (fleeTo) player.room = fleeTo;
    player.corpses = [];
    player.ws.send(JSON.stringify({ t: 'combat', msg: fleeTo ? 'You stagger back through the gate, breathing hard.' : 'You break free and slip away, heart hammering.' }));
    this.game.look(player);
    this.game.status(player);
  }

  startTicker() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      for (const combat of [...this.combats.values()]) {
        try { combat.tick(); } catch (e) { console.error('combat tick error', e); }
      }
    }, TICK_MS);
  }

  stopTicker() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function spawnEnemies(defs) {
  return defs;
}

// Derive a "creature-like" definition from a live player for PvP duels.
function derivePlayerDef(p) {
  const w = weaponOf(p);
  return {
    id: `player_${p.charId}`,
    name: p.name,
    plural: p.name,
    circle: p.circle,
    stats: p.stats,
    weapon: w ? { skill: w.skill, dmg: w.dmg, speed: w.speed } : { skill: 'brawling', dmg: [3, 6], speed: 4 },
    armor: totalArmor(p),
    defense: defenseSkillOf(p),
    exp: 0,
    loot: [],
    aggressive: true,
    controller: p,
  };
}
