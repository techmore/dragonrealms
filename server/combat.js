// Async immersive combat engine.
// Combats resolve on a server-side ticker; players issue commands between ticks
// (attack, cast, retreat, berserk, backstab) and read the running narrative.
// The per-fight state machine lives here; lifecycle/duels/ticker live in
// server/combat-manager.js.
import { roomById } from '../data/world.js';
import { SKILLS, CATEGORIES } from '../data/skills.js';
import {
  weaponOf, skillRank, effectiveRank, totalArmor, gainSkillExp, defenseSkillOf,
  countItems, removeItem, addItem, totalBurden, maxStaminaEff, conditionMult, qualityMult,
  wearCondition, setRoundtime, MASTERY_SETS,
} from './player.js';
import { itemById } from '../data/items.js';

const { MELEE_WEAPONS, RANGED_WEAPONS } = MASTERY_SETS;

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

// DR weapon classes -> roundtime table (minimums from Elanthipedia Roundtime,
// base a touch higher, reduced by Effective Strength toward the minimum).
const WEAPON_CLASS = {
  small_edged: 'light', blunt: 'light', offhand: 'light', brawling: 'brawling',
  medium_edged: 'medium',
  large_edged: 'heavy',
  twohanded_edged: 'twohanded', twohanded_blunt: 'twohanded', polearm: 'twohanded', staff: 'twohanded',
  thrown: 'thrown', heavy_thrown: 'thrown',
  bow: 'ranged', crossbow: 'ranged', slings: 'ranged',
};
// DR roundtime minimums (Elanthipedia) — base a touch higher so Effective
// Strength can shave toward the table value.
const RT_TABLE = {
  light: { base: 3, min: 2 },
  medium: { base: 3, min: 3 },
  heavy: { base: 4, min: 4 },
  twohanded: { base: 4, min: 4 },
  brawling: { base: 3, min: 2 },
  thrown: { base: 3, min: 2 },
  ranged: { base: 4, min: 3 },
};
// DR combat ranges; a weapon's reach decides which it can engage.
const RANGES = ['missile', 'pole', 'melee'];
export function weaponRT(p) {
  const w = weaponOf(p);
  const cls = w ? (WEAPON_CLASS[w.skill] || 'brawling') : 'brawling';
  const { base, min } = RT_TABLE[cls] || RT_TABLE.brawling;
  const effStr = (p.stats.str + p.stats.agi) / 2;
  const reduce = Math.floor(effStr / 45);
  return Math.max(min, base - reduce);
}
export function weaponReach(p) {
  const w = weaponOf(p);
  const cls = w ? (WEAPON_CLASS[w.skill] || 'brawling') : 'brawling';
  if (cls === 'ranged') return ['missile', 'pole'];
  if (w && (w.skill === 'polearm' || w.skill === 'staff')) return ['pole', 'melee'];
  return ['melee'];
}
// DR vitality ladder (Elanthipedia Combat page).
export function vitalityLabel(hp, max) {
  const pct = hp / Math.max(1, max);
  if (pct >= 0.99) return 'in good shape';
  if (pct >= 0.9) return 'bruised';
  if (pct >= 0.8) return 'hurt';
  if (pct >= 0.7) return 'battered';
  if (pct >= 0.6) return 'beat up';
  if (pct >= 0.5) return 'very beat up';
  if (pct >= 0.4) return 'badly hurt';
  if (pct >= 0.3) return 'very badly hurt';
  if (pct >= 0.2) return 'smashed up';
  if (pct >= 0.1) return 'terribly wounded';
  if (pct >= 0.01) return 'near death';
  return "in death's grasp";
}

export class Combat {
  constructor(id, player, enemies, opts = {}) {
    this.id = id;
    this.player = player;
    this.enemies = enemies.map((e) => ({ range: 'melee', ...e }));
    this.playerTimer = 0;
    this.berserk = false;
    this.backstabCooldown = 0;
    this.onEnd = opts.onEnd || null;
    this.game = opts.game || null;
    this.defender = opts.defender || null; // the other live player in a duel
    this.duel = Boolean(this.defender);
    this.duelEnd = opts.duelEnd || 'blood'; // blood | blow | pain
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
    this.serenityTicks = 0;
    this.magesLash = false;
    this.roarHelm = false;
    this.specialCd = { whirlwind: 0, stomp: 0, choke: 0, analyze: 0, impede: 0 };
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

  // Stamina gate: big efforts need wind; burden makes them pricier.
  spendStamina(amount) {
    const p = this.player;
    const burden = totalBurden(p);
    const cost = amount + (burden >= 3 ? 3 : burden >= 1 ? 1 : 0);
    if ((p.stamina ?? 0) < cost) {
      this.say(burden > 0
        ? 'Your load drags at you — you are too winded to give it your all! (Lighten your gear or catch your breath.)'
        : 'You are too winded for that! Catch your breath before pressing on.');
      return false;
    }
    p.stamina -= cost;
    return true;
  }

  startAttack() {
    this.playerTimer = Math.max(this.playerTimer, this.attackSpeed());
  }

  attackSpeed() {
    const nimble = this.player.khri && this.player.khri.nimbleness > 0 ? 1 : 0;
    const swift = this.player.khri && this.player.khri.swiftness > 0 ? 1 : 0;
    const wind = this.player.buffs && this.player.buffs.wind > 0 ? 1 : 0;
    return Math.max(2, weaponRT(this.player) - nimble - swift - wind);
  }

  playerAttack() {
    const target = this.enemies.find((e) => e.uid === this.playerTarget && !e.dead) || this.aliveEnemies[0];
    if (!target) return;
    this.playerTarget = target.uid; // retarget if the mark fell

    // Ranged weapons require ammunition; out of arrows, you fall back to your
    // fists rather than standing helpless (DR: switch weapons).
    let w = weaponOf(this.player);
    const skillIdRaw = w ? w.skill : 'brawling';
    const dualLoad = w && w.skill === 'bow' && this.player.guild.id === 'barbarian' && (this.player.abilities || []).includes('dual_load');
    if (w) {
      const ammoId = AMMO[w.skill];
      if (ammoId) {
        const need = dualLoad ? 2 : 1;
        if (countItems(this.player, ammoId) < need) {
          this.say(`Your ${ammoId} run out — you fall back to your fists!`);
          w = null;
        } else {
          removeItem(this.player, ammoId, need);
        }
      }
    }
    const skillId = w ? w.skill : 'brawling';
    const weaponNameFor = w ? w.name.replace(/^a /, '') : 'fists';

    const skill = effectiveRank(this.player, skillId);
    const focus = this.player.khri && this.player.khri.focus > 0 ? 4 : 0;
    const sight = this.player.khri && this.player.khri.sight > 0 ? 6 : 0;
    const atk = skill + focus + sight + this.player.stats.str * 0.06 + this.player.stats.agi * 0.04;
    const def = target.def.defense + target.def.stats.ref * 0.03;
    const hit = Math.random() < clamp(0.5 + (atk - def) * 0.012, 0.15, 0.95);

    // Mastery skills grow alongside the weapons they govern.
    const masterySkill = MELEE_WEAPONS.has(skillId) ? 'melee_mastery' : RANGED_WEAPONS.has(skillId) ? 'missile_mastery' : null;
    if (masterySkill) gainSkillExp(this.player, masterySkill, 2);

    if (!hit) {
      this.announce(
        `You swing your ${weaponNameFor} at ${target.def.name}, but ${missVerb(target.def)}.`,
        `${this.player.name} swings at you, but you slip the blow.`
      );
      gainSkillExp(this.player, skillId, Math.floor(target.def.circle * 5 * teachingFactor(effectiveRank(this.player, skillId), target.def)));
      return;
    }

    let dmg;
    if (w) {
      dmg = rand(w.dmg[0], w.dmg[1]) + Math.floor(this.player.stats.str * 0.12);
      dmg = Math.floor(dmg * qualityMult(w));
      // A worn blade bites less (durability).
      dmg = Math.floor(dmg * conditionMult(w));
      wearCondition(this.player, 'hand', 0.012);
    } else {
      dmg = rand(2, 5) + Math.floor(this.player.stats.str * 0.1);
    }
    if (dualLoad) dmg = Math.floor(dmg * 1.5);

    if (this.berserk) dmg = Math.floor(dmg * 1.5);
    if (this.dragonTicks > 0) dmg = Math.floor(dmg * 1.25);
    if (this.rageTicks > 0) dmg = Math.floor(dmg * (this.roarHelm ? 1.4 : 1.25));
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
    if (this.player.buffs && this.player.buffs.glyph_valor > 0) dmg = Math.floor(dmg * 1.15);
    if (this.player.buffs && this.player.buffs.warpaint > 0) dmg = Math.floor(dmg * 1.15);
    if (this.player.khri && this.player.khri.strike > 0) dmg = Math.floor(dmg * 1.25);
    if (this.player.cyclic && this.player.cyclic.song === 'war' && this.player.cyclic.ticks > 0) dmg = Math.floor(dmg * 1.1);
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
    if (!this._ended) this.checkDuelEnd('player');
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
    // Empath: taking a living life leaves an empathic stain (DR-authentic).
    if (this.player.guild.id === 'empath') {
      const cap = Math.max(5, Math.floor(this.player.maxHp * 0.1));
      if (this.player.empathicStain < cap) {
        this.player.empathicStain += 1;
        this.say('A cold wash of empathic shock runs through you — taking that life has left a stain. (Healing capacity reduced.)');
      }
    }
    // Paladin: slaying the undead restores the soul.
    if (this.player.guild.id === 'paladin') {
      const undead = ['wraith', 'revenant', 'dread_knight', 'shadowpaw'];
      if (undead.includes(target.def.id)) {
        const gained = Math.min(5, 100 - (this.player.soul ?? 50));
        this.player.soul = (this.player.soul ?? 50) + gained;
        this.say(`Smiting the undead strengthens your soul (+${gained}).`);
      }
    }
    // Ranger: a wolf may bond with you.
    if (this.player.guild.id === 'ranger' && target.def.id === 'wolf' && !this.player.companion) {
      if (Math.random() < 0.25 + skillRank(this.player, 'perception') * 0.01) {
        const hp = 30 + this.player.circle * 4;
        this.player.companion = { kind: 'wolf', name: 'a bonded wolf', hp, maxHp: hp, alive: true };
        this.say('The wolf\'s spirit lingers — it bonds with you as a companion!');
      }
    }
    this.say(`You fell ${target.def.name}! Its corpse slumps to the ground. Type "skin ${target.def.name.replace(/^a /, '').split(' ')[0]}" to harvest it.`);
    const coins = target.def.circle * (2 + Math.floor(Math.random() * 4));
    this.player.silver += coins;
    this.say(`You pry ${coins} silvers from the corpse.`);
    // Gems: flagged creatures carry stones worth a visit to the quartermaster.
    if (target.def.gems && target.def.gems.length && Math.random() < 0.45) {
      const gemId = target.def.gems[Math.floor(Math.random() * target.def.gems.length)];
      const gem = itemById(gemId);
      if (gem) {
        addItem(this.player, gemId, 1);
        this.say(`A ${gem.name.replace(/^a /, '')} glints among the remains — you claim it.`);
      }
    }
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
    if (this.player.buffs && this.player.buffs.omen > 0) def = Math.floor(def * 1.1);
    if (this.player.khri && this.player.khri.elusion > 0) def = Math.floor(def * 1.2);
    if (this.player.cyclic && this.player.cyclic.song === 'bravery' && this.player.cyclic.ticks > 0) def = Math.floor(def * 1.1);
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
    const isMagic = weaponDef && weaponDef.cat === CATEGORIES.MAGIC;
    // Barbarian magic resistance: a premier anti-magic edge. The base ward
    // scales with Defending ranks; Serenity halves what gets through; Mage's
    // Lash flings the spell back at its caster.
    if (isMagic && this.player.guild.id === 'barbarian') {
      const defending = skillRank(this.player, 'defending');
      const resist = clamp(0.6 - defending * 0.002, 0.35, 0.6);
      dmg = Math.max(1, Math.floor(dmg * resist));
      if (this.serenityTicks > 0) dmg = Math.max(1, Math.floor(dmg * 0.5));
      if (this.magesLash && e.hp > 0) {
        const reflect = Math.max(1, Math.floor(dmg * 0.6));
        e.hp -= reflect;
        this.say(`Mage's Lash! The spell recoils — ${cap(e.def.name)} takes ${reflect} damage!`);
        gainSkillExp(this.player, 'inner_fire', 6);
        if (e.hp <= 0) {
          this.killCreature(e);
          return;
        }
      }
    }
    // Khri Clarity: a still mind turns hostile magic aside.
    if (isMagic && this.player.khri && this.player.khri.clarity > 0) {
      dmg = Math.max(1, Math.floor(dmg * 0.75));
    }
    if (e.dispelledTicks > 0) {
      e.dispelledTicks -= 1;
      dmg = Math.max(1, Math.floor(dmg * (isMagic ? 0.3 : 0.75)));
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
    // Armor is condition-scaled: worn gear guards less (durability).
    const armor = Object.entries(this.player.equipment)
      .filter(([, piece]) => piece.type === 'armor')
      .reduce((tot, [, piece]) => tot + Math.floor(piece.armor * conditionMult(piece) * qualityMult(piece)), 0);
    // Glyph of Faith: the ward stiffens what you wear while it holds.
    const effArmor = this.player.buffs && this.player.buffs.glyph_ward > 0 ? Math.floor(armor * 1.1) : armor;
    dmg = Math.max(1, Math.floor(dmg * (1 - effArmor / (effArmor + 80))));
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
    if (this.player.buffs && this.player.buffs.glyph_shield > 0) {
      dmg = Math.max(1, dmg - 4);
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
    if (this.player.khri && Object.values(this.player.khri).some((t) => t > 0)) {
      this.player.khri = {};
      this.say('The blow shatters your concentration — your khri drop away!');
    }
    gainSkillExp(this.player, 'evasion', 12);
    gainSkillExp(this.player, 'fitness', 6);
    gainSkillExp(this.player, 'defending', Math.floor(e.def.circle * 3));
    gainSkillExp(this.player, 'parry', Math.floor(e.def.circle * 3));
    // Armor takes wear with every blow that lands (durability).
    for (const [slot, piece] of Object.entries(this.player.equipment)) {
      if (piece.type === 'armor') {
        wearCondition(this.player, slot, 0.01);
        gainSkillExp(this.player, piece.skill, Math.floor(e.def.circle * 3 + piece.armor / 8));
      }
    }
    this.player.hp -= dmg;
    if (!this._ended) this.checkDuelEnd('defender');
    if (this.player.hp <= 0) { this.player.hp = 0; this.killPlayer(); }
  }

  killPlayer() {
    this.say('You are overcome, and the world goes dark around you...');
    this.end(false, true);
  }

  // --- Ambush from hiding: a preemptive strike that breaks concealment ---
  ambushAttack(targetUid) {
    const p = this.player;
    if (!this.spendStamina(10)) return;
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
    if (w) {
      dmg = rand(w.dmg[0], w.dmg[1]) + Math.floor(p.stats.str * 0.12);
      dmg = Math.floor(dmg * qualityMult(w));
      dmg = Math.floor(dmg * conditionMult(w));
      wearCondition(p, 'hand', 0.012);
    } else {
      dmg = rand(3, 7) + Math.floor(p.stats.str * 0.1);
    }
    dmg = Math.floor(dmg * (1.5 + stealth * 0.02));
    if (p.khri && p.khri.dampen > 0) dmg = Math.floor(dmg * 1.3);
    if (p.khri && p.khri.stealth > 0) dmg = Math.floor(dmg * 1.25);
    if (p.khri && p.khri.sight > 0) dmg = Math.floor(dmg * 1.15);
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

  // --- Snipe from hiding: a ranger's long shot ---
  snipeAttack(targetUid) {
    const p = this.player;
    const w = weaponOf(p);
    if (!w || !RANGED_WEAPONS.has(w.skill)) {
      this.say('Snipe needs a bow or crossbow in hand.');
      return;
    }
    const target = this.enemies.find((e) => e.uid === targetUid && !e.dead);
    if (!target) { this.say('Your shot finds no target.'); p.hidden = false; return; }
    const ammoId = AMMO[w.skill];
    if (ammoId && countItems(p, ammoId) < 1) {
      this.say(`You nock a shot, but you have no ${ammoId}!`);
      return;
    }
    if (ammoId) removeItem(p, ammoId, 1);
    if (!this.spendStamina(10)) return;

    const skill = effectiveRank(p, w.skill);
    const stealth = skillRank(p, 'hiding') + skillRank(p, 'stealth');
    const atk = skill + stealth * 0.5 + p.stats.ref * 0.05 + p.stats.agi * 0.05;
    const def = target.def.defense + target.def.stats.ref * 0.03;
    const hit = Math.random() < clamp(0.55 + (atk - def) * 0.012, 0.2, 0.97);
    p.hidden = false;

    if (!hit) {
      this.announce(
        `You loose a shaft from the shadows, but ${target.def.name} darts clear of the shot!`,
        `${p.name} looses a shaft at you from the shadows — you throw yourself aside!`
      );
      gainSkillExp(p, w.skill, 4);
      return;
    }
    let dmg = rand(w.dmg[0], w.dmg[1]) + Math.floor(p.stats.str * 0.1);
    dmg = Math.floor(dmg * (2 + stealth * 0.02));
    if (p.khri && p.khri.stealth > 0) dmg = Math.floor(dmg * 1.2);
    this.announce(
      `You draw a bead and loose — the shaft thuds home in ${target.def.name} for ${dmg} damage!`,
      `${p.name} steps from cover and the bowstring snaps — ${dmg} damage!`
    );
    gainSkillExp(p, w.skill, 12);
    gainSkillExp(p, 'hiding', 8);
    gainSkillExp(p, 'stealth', 6);
    gainSkillExp(p, 'missile_mastery', 3);
    target.hp -= dmg;
    if (target.hp <= 0) {
      if (target.def.controller) this.defenderDefeated();
      else this.killCreature(target);
    }
  }

  // --- Spells ---
  cast(spell, targetUid, casting = 1) {
    const p = this.player;
    // Command casts may carry a mana cost altered by lunar conditions or a
    // technique. Keep that charge separate from the power multiplier so a
    // discount never flattens an overchannelled spell back to 100% power.
    // The numeric form remains supported for direct engine callers.
    const options = casting && typeof casting === 'object' ? casting : null;
    const mult = options ? (options.powerMult ?? 1) : casting;
    let cost = options?.manaCost ?? Math.ceil(spell.mana * mult);
    // Dim devotion makes holy magic thirstier.
    if (p.guild.id === 'cleric' && spell.skill === 'holy_magic' && (p.devotion ?? 30) < 20) {
      cost = Math.ceil(cost * 1.25);
    }
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
    if (spell.kind === 'buff') {
      p.buffs = p.buffs || {};
      p.buffs[spell.buff.key] = (p.buffs[spell.buff.key] || 0) + spell.buff.ticks;
      this.say(`You cast ${spell.name}! ${buffDesc(spell.buff.key)}`);
      afterCast();
      return;
    }

    const target = this.enemies.find((e) => e.uid === targetUid && !e.dead);
    if (!target) { this.say('Your spell fizzles without a target.'); return; }
    // Contested spells (DR SvS): the weave rolls against the target's
    // defense like any attack — a warded or swift foe may slip the spell.
    const atk = skill + power * 0.15 + this.player.stats.wis * 0.05;
    const def = target.def.defense + target.def.stats.ref * 0.03;
    const hit = Math.random() < clamp(0.55 + (atk - def) * 0.012, 0.15, 0.97);
    if (!hit) { this.say(`You weave ${spell.name}, but ${target.def.name} resists it.`); afterCast(); return; }

    switch (spell.kind) {
      case 'damage': {
        let dmg = Math.round((rand(4, 6) + Math.floor(power * 0.9) + spell.base + p.circle * 2) * mult) + heldBonus;
        if (capstoneActive(p, 'cleric') || capstoneActive(p, 'warmage')) dmg = Math.floor(dmg * 1.3);
        // Cleric devotion scales holy magic (neglect dims it).
        if (p.guild.id === 'cleric' && spell.skill === 'holy_magic') {
          dmg = Math.floor(dmg * (0.8 + (p.devotion ?? 30) / 100));
        }
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
  // Warrior mage impedance: bind a foe with clinging earth (DR ADMITTANCE/
  // IMPEDANCE v1) — the target's attacks freeze while the bind holds.
  impede(targetUid) {
    const p = this.player;
    if (p.guild.id !== 'warmage') return { ok: false, msg: 'Only warrior mages bind the elements.' };
    if (this.specialCd.impede > 0) return { ok: false, msg: 'The elements are still settling from your last bind.' };
    const target = this.enemies.find((e) => e.uid === targetUid && !e.dead);
    if (!target) return { ok: false, msg: 'There is nothing in reach to impede.' };
    if (p.mana < 10) return { ok: false, msg: 'You need 10 mana to bind the elements.' };
    p.mana -= 10;
    this.specialCd.impede = 25;
    const skill = effectiveRank(p, 'war_magic');
    const chance = clamp(0.5 + skill * 0.01 - target.def.defense * 0.01, 0.2, 0.9);
    if (Math.random() < chance) {
      target.impededTicks = 5;
      this.announce(
        `You lash ${target.def.name} with clinging earth — its limbs move like stone!`,
        `${p.name} lashes you with clinging earth — you can barely move!`
      );
    } else {
      this.say(`You lash ${target.def.name} with clinging earth, but it shrugs the magic off.`);
    }
    gainSkillExp(p, 'war_magic', 8);
    return { ok: true, msg: '' };
  }

  whirlwind() {
    const p = this.player;
    const w = weaponOf(p);
    if (!w) return { ok: false, msg: 'Whirlwind needs a weapon in hand.' };
    if (this.specialCd.whirlwind > 0) return { ok: false, msg: 'You are still recovering from your last whirlwind.' };
    if ((p.innerFire || 0) < 10) return { ok: false, msg: 'Not enough inner fire (10).' };
    if (!this.aliveEnemies.length) return { ok: false, msg: 'There is nothing to whirl through.' };
    if (!this.spendStamina(10)) return { ok: false, msg: '' };
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
    if (!this.spendStamina(10)) return { ok: false, msg: '' };
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
    if (!this.spendStamina(6)) return { ok: false, msg: '' };
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
        const hasHelm = Object.values(p.equipment).some((i) => i.id === 'roar_helm');
        const cost = hasHelm ? 5 : 10;
        if ((p.voice || 0) < cost) return { ok: false, msg: `Your voice is spent (${cost} voice needed).` };
        p.voice -= cost;
        this.rageTicks = 12;
        this.roarHelm = hasHelm;
        gainSkillExp(p, 'inner_fire', 6);
        return msg(hasHelm ? 'Your roar helm bellows! Everild\'s Rage sets your blood ablaze!' : 'You roar a battle cry — Everild\'s Rage sets your blood ablaze!');
      }
      case 'screech': {
        const hasHelm = Object.values(p.equipment).some((i) => i.id === 'roar_helm');
        const cost = hasHelm ? 6 : 12;
        if ((p.voice || 0) < cost) return { ok: false, msg: `Your voice is spent (${cost} voice needed).` };
        const target = this.enemies.find((e) => e.uid === targetUid && !e.dead);
        if (!target) return { ok: false, msg: 'Your screech needs a foe to lash.' };
        p.voice -= cost;
        target.timer += target.def.weapon.speed * (hasHelm ? 2.5 : 1.5);
        gainSkillExp(p, 'inner_fire', 6);
        this.announce(
          `You shriek! ${cap(target.def.name)} staggers, clutching its ears!`,
          `${this.player.name} shrieks — you stagger, ears ringing!`
        );
        return msg('');
      }
      case 'serenity': {
        if (this.serenityTicks > 0) return { ok: false, msg: 'A Serenity ward already enfolds you.' };
        const hasChakrel = Object.values(p.equipment).some((i) => i.id === 'chakrel_1');
        const cost = hasChakrel ? 15 : 20;
        if ((p.innerFire || 0) < cost) return { ok: false, msg: `Not enough inner fire (${cost}).` };
        p.innerFire -= cost;
        this.serenityTicks = 30;
        // Purge corruption: any lingering negative buffs are cleansed.
        for (const [k, v] of Object.entries(p.buffs || {})) {
          if (v < 0) delete p.buffs[k];
        }
        gainSkillExp(p, 'inner_fire', 8);
        return msg('You settle your mind mid-fury — corruption washes away and a calm ward rises against hostile magic.');
      }
      case 'dispel': {
        if ((p.innerFire || 0) < 15) return { ok: false, msg: 'Not enough inner fire (15).' };
        const target = this.enemies.find((e) => e.uid === targetUid && !e.dead);
        if (!target) return { ok: false, msg: 'Dispel needs a foe to strike.' };
        p.innerFire -= 15;
        target.dispelledTicks = 5;
        gainSkillExp(p, 'inner_fire', 8);
        this.announce(
          `You thrust your will through ${cap(target.def.name)}'s aether — its magic sputters and dies!`,
          `${this.player.name} severs your aether — your spells gutter out!`
        );
        return msg('');
      }
      case 'mages_lash': {
        if (this.magesLash) {
          this.magesLash = false;
          return msg('Mage\'s Lash subsides — your fury turns back inward.');
        }
        const cost = 10;
        if ((p.innerFire || 0) < cost) return { ok: false, msg: `Not enough inner fire (${cost}).` };
        p.innerFire -= cost;
        this.magesLash = true;
        gainSkillExp(p, 'inner_fire', 8);
        return msg('Mage\'s Lash ignites! Spells hurled at you will recoil upon their caster!');
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
    if (!this.spendStamina(8)) return;

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
    if (!this.spendStamina(8)) return;
    const skill = skillRank(this.player, 'small_edged') + skillRank(this.player, 'stealth');
    let dmg = rand(10, 16) + skill * 2 + this.player.circle * 3;
    if (this.player.khri && this.player.khri.stealth > 0) dmg = Math.floor(dmg * 1.5);
    this.say(`You slip behind ${target.def.name} and bury your blade deep — ${dmg} damage!`);
    gainSkillExp(this.player, 'stealth', 8);
    gainSkillExp(this.player, 'small_edged', 8);
    if (this.player.guild.guildSkill) gainSkillExp(this.player, this.player.guild.guildSkill, 4);
    target.hp -= dmg;
    this.backstabCooldown = capstoneActive(this.player, 'thief') ? 6 : 12;
    if (target.hp <= 0) this.killCreature(target);
  }

  // --- Combat ranges (DR): missile -> pole -> melee ---
  advanceCreature(e) {
    if (e.range === 'melee' || e.dead) return;
    const order = ['missile', 'pole', 'melee'];
    e.range = order[order.indexOf(e.range) + 1] || 'melee';
    this.say(`${cap(e.def.name)} closes to ${e.range} range!`);
  }

  advance() {
    const e = this.aliveEnemies.find((x) => x.uid === this.playerTarget) || this.aliveEnemies[0];
    if (!e) return { ok: false, msg: 'There is nothing to advance on.' };
    if (e.range === 'melee') return { ok: false, msg: `You are already at melee range with ${e.def.name}.` };
    this.advanceCreature(e);
    setRoundtime(this.player, 2);
    return { ok: true, msg: '' };
  }

  retreat() {
    const e = this.aliveEnemies.find((x) => x.uid === this.playerTarget) || this.aliveEnemies[0];
    if (!e) return { ok: false, msg: 'There is nothing to retreat from.' };
    if (e.range === 'missile') return this.disengage();
    const order = ['melee', 'pole', 'missile'];
    e.range = order[order.indexOf(e.range) + 1] || 'missile';
    this.say(`You fall back — ${e.def.name} is now at ${e.range} range.`);
    setRoundtime(this.player, 2);
    return { ok: true, msg: '' };
  }

  disengage() {
    const evade = skillRank(this.player, 'evasion') + this.player.stats.agi * 0.05;
    const swift = this.player.khri && this.player.khri.swiftness > 0 ? 15 : 0;
    const pursuit = this.aliveEnemies.reduce((s, e) => s + e.def.circle * 2, 0);
    const chance = clamp(0.4 + (evade - pursuit) * 0.03 + swift * 0.01, 0.15, 0.9);
    if (Math.random() < chance) {
      this.say('You break away and sprint for safety!');
      this.end(false, false, true);
      return { ok: true, msg: '' };
    }
    this.say('You try to flee, but your foes block your path!');
    gainSkillExp(this.player, 'evasion', 3);
    return { ok: false, msg: '' };
  }

  assess() {
    const rows = this.aliveEnemies.map((e) => {
      const bal = e.def.aggressive ? 'solidly balanced' : 'slightly off balance';
      return `  ${cap(e.def.name)} is facing you at ${e.range} range (${bal}).`;
    });
    const w = weaponOf(this.player);
    const reach = weaponReach(this.player);
    return {
      ok: true,
      msg: `\nYou assess your combat situation...\n${rows.join('\n')}\nYour ${w ? w.name : 'fists'} can reach: ${reach.join(', ')}.`,
    };
  }

  defenderRetreat() {
    this.say({
      initiator: `${this.defender.name} steps back, yielding the duel.`,
      defender: 'You step back, yielding the duel.',
    });
    this.end(false, false, false, null, { conceded: true });
  }

  surrender(side) {
    const loser = side === 'defender' ? this.defender : this.player;
    const winner = side === 'defender' ? this.player : this.defender;
    this.say({
      initiator: side === 'defender' ? `${loser.name} surrenders!` : `You raise your hand — you surrender to ${winner.name}.`,
      defender: side === 'defender' ? 'You raise your hand — you surrender.' : `${loser.name} surrenders!`,
    });
    this.end(false, false, false, null, { duelResolved: side === 'defender' ? 'player' : 'defender', duelEnd: 'surrender' });
  }

  // Resolve non-blood duel end conditions (blow / pain).
  checkDuelEnd(hitSide) {
    if (!this.duel || this._ended) return;
    if (this.duelEnd === 'blow' && hitSide) {
      this.end(false, false, false, null, { duelResolved: hitSide === 'player' ? 'player' : 'defender', duelEnd: 'blow' });
      return;
    }
    if (this.duelEnd === 'pain') {
      if (this.player.hp < this.player.maxHp * 0.25) {
        this.end(false, false, false, null, { duelResolved: 'defender', duelEnd: 'pain' });
      } else if (this.defender.hp < this.defender.maxHp * 0.25) {
        this.end(false, false, false, null, { duelResolved: 'player', duelEnd: 'pain' });
      }
    }
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
      // Impeded: clinging earth holds the foe — no attacks while bound.
      if (e.impededTicks > 0) {
        e.impededTicks -= 1;
        if (e.impededTicks <= 0) this.say(`${cap(e.def.name)} shakes free of the clinging earth!`);
      }
    }
    if (this.player.buffs && this.player.buffs.frenzy > 0) this.player.buffs.frenzy -= 1;
    if (this.player.buffs && this.player.buffs.ironhide > 0) this.player.buffs.ironhide -= 1;
    if (this.player.buffs && this.player.buffs.shadow > 0) this.player.buffs.shadow -= 1;
    if (this.player.buffs && this.player.buffs.omen > 0) this.player.buffs.omen -= 1;
    if (this.player.buffs && this.player.buffs.wind > 0) this.player.buffs.wind -= 1;
    if (this.player.buffs && this.player.buffs.warpaint > 0) this.player.buffs.warpaint -= 1;
    if (this.player.buffs && this.player.buffs.glyph_ward > 0) this.player.buffs.glyph_ward -= 1;
    if (this.player.buffs && this.player.buffs.glyph_valor > 0) this.player.buffs.glyph_valor -= 1;
    if (this.player.buffs && this.player.buffs.glyph_shield > 0) this.player.buffs.glyph_shield -= 1;
    if (this.serenityTicks > 0) {
      this.serenityTicks -= 1;
      if (this.serenityTicks <= 0) this.say('Your Serenity ward fades.');
    }
    if (this.player.buffs && this.player.buffs.sun > 0) {
      this.player.buffs.sun -= 1;
      if (this.player.hp < this.player.maxHp) this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
    }
    // Bard enchante: upkeep + renewal.
    const cyc = this.player.cyclic;
    if (cyc && cyc.ticks > 0) {
      cyc.tickCount = (cyc.tickCount || 0) + 1;
      cyc.ticks -= 1;
      if (cyc.tickCount % 10 === 0) {
        if (this.player.mana < cyc.upkeep) {
          this.player.cyclic = null;
          this.say('Your enchante falters — the song dies for lack of mana.');
        } else {
          this.player.mana -= cyc.upkeep;
        }
      }
      if (cyc.song === 'regen' && this.player.hp < this.player.maxHp) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
      }
    }
    if (this.player.khri) {
      for (const k of Object.keys(this.player.khri)) {
        if (this.player.khri[k] > 0) this.player.khri[k] -= 1;
      }
    }
    // A bound familiar, companion, or risen minion fights alongside.
    const ally = this.player.familiar || this.player.companion || this.player.risen;
    if (ally && ally.alive && this.aliveEnemies.length) {
      this._famTick = (this._famTick || 0) + 1;
      if (this._famTick % 3 === 0) {
        const target = this.aliveEnemies[0];
        let allySkill;
        let skillId;
        if (this.player.familiar) { allySkill = skillRank(this.player, 'summoning'); skillId = 'summoning'; }
        else if (this.player.companion) { allySkill = skillRank(this.player, 'tracking'); skillId = 'tracking'; }
        else { allySkill = skillRank(this.player, 'necromancy'); skillId = 'necromancy'; }
        const dmg = Math.max(1, 3 + this.player.circle * 2 + Math.floor(allySkill / 10));
        target.hp -= dmg;
        if (target.def.controller) target.def.controller.hp = Math.max(0, target.hp);
        this.say(`Your ${this.player.familiar ? `familiar ${ally.name}` : ally.name} strikes ${target.def.name} for ${dmg} damage!`);
        gainSkillExp(this.player, skillId, 2);
        if (target.hp <= 0) {
          if (target.def.controller) this.defenderDefeated();
          else this.killCreature(target);
        }
      }
    }
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
    // Wind catches: burden slows recovery (heavy gear fights hard to wind you).
    const burd = totalBurden(this.player);
    const staminaCap = maxStaminaEff(this.player);
    this.player.stamina = Math.min(staminaCap, (this.player.stamina ?? staminaCap) + (burd >= 2 ? 1 : 2));
    if (this.player.hp <= 0) return;

    // Player action: swing only when the target is within weapon reach
    // (DR ranges). Out of range, pressing in closes the gap one range.
    this.playerTimer -= 1;
    if (this.playerTimer <= 0) {
      const target = this.enemies.find((e) => e.uid === this.playerTarget && !e.dead) || this.aliveEnemies[0];
      const reach = weaponReach(this.player);
      if (target && !reach.includes(target.range)) {
        const ranged = reach.includes('missile');
        if (ranged && target.range === 'melee') {
          // Bows need room: back up a range to gain line of fire.
          target.range = 'pole';
          this.say(`You back up to gain range for your ${weaponOf(this.player) ? weaponOf(this.player).name.replace(/^a /, '') : 'weapon'}.`);
        } else if (target.range !== 'melee') {
          target.range = RANGES[RANGES.indexOf(target.range) + 1] || 'melee';
          this.say(`You press in on ${target.def.name} — ${target.range} range.`);
        } else {
          this.say(`You cannot reach ${target.def.name} at point-blank range.`);
        }
        this.playerTimer = 1;
      } else {
        this.playerAttack();
        this.playerTimer = this.attackSpeed();
        setRoundtime(this.player, this.attackSpeed());
      }
    }
    if (this._ended) return;

    // Enemy actions: melee creatures must be at melee range to strike; magic
    // attackers reach across the field. Only aggressive creatures close in on
    // their own — docile ones hold ground until the player advances.
    for (const e of this.aliveEnemies) {
      if (e.dead || this._ended) continue;
      if (e.impededTicks > 0) continue; // bound by clinging earth
      const magicAtk = SKILLS[e.def.weapon.skill] && SKILLS[e.def.weapon.skill].cat === CATEGORIES.MAGIC;
      if (e.range !== 'melee' && !magicAtk) {
        if (e.def.aggressive) this.advanceCreature(e);
        continue;
      }
      e.timer -= 1;
      if (e.timer <= 0) {
        this.creatureAttack(e);
        e.timer = e.def.weapon.speed;
      }
    }
    if (this._ended || !this.player.online || !this.player.ws) return;
    // Status prompt each tick so the client's gauges stay live mid-fight and
    // scripted players can react to their own wounds between swings.
    this.game.status(this.player);
    this.sendTargets();
  }

  // Structured combat snapshot for the client's Target window (DR combat pane).
  sendTargets() {
    const enemies = this.aliveEnemies.map((e) => ({
      name: cap(e.def.name),
      hp: e.hp,
      maxHp: e.maxHp || e.hp,
      range: e.range,
      circle: e.def.circle,
    }));
    this.player.ws.send(JSON.stringify({ t: 'targets', enemies }));
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
