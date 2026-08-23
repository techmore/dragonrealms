// Combat lifecycle: spawns, teardown, duels, death/flee, the ticker.
// The per-fight state machine lives in Combat (server/combat.js).
import { Combat } from './combat.js';
import { weaponOf, totalArmor, defenseSkillOf, say, sayRaw } from './player.js';
import { roomById } from '../data/world.js';

const TICK_MS = 1000;
// DR combat ranges: indoors fights start at pole range, outdoors at missile.
const INDOOR_ZONES = new Set(['sewers', 'cinder', 'blackwood']);
function initialRange(zone) {
  if (INDOOR_ZONES.has(zone)) return 'pole';
  if (zone === 'town' || zone === 'riverhaven') return 'melee';
  return 'missile';
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
      maxHp: def.circle * 14 + def.stats.con * 3 + 20,
      timer: def.weapon.speed,
      range: initialRange(roomById(player.room)?.zone),
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
    // Clear the client's target window.
    sayRaw(player, { t: 'targets', enemies: [] });
    if (result.win) {
say(player, '\nVictory! You stand over your fallen foes.', 'combat');
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
  startDuel(player, defender, end = 'blood') {
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
      range: 'melee',
      dead: false,
    }];
    const combat = new Combat(`duel_${player.charId}_${Date.now()}`, player, enemies, {
      onEnd: (c, result) => this.endDuel(player, defender, c, result),
      game: this.game,
      defender,
      duelEnd: end,
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
      if (target && target.online) say(target, msg, 'combat');
    };
    if (result.conceded) {
      sayTo(player, `\n${defender.name} yields — the duel ends. You win by forfeit.`);
      sayTo(defender, '\nYou yield, stepping back. The duel is over.');
    } else if (result.duelResolved) {
      // Non-blood duels (blow / pain / surrender): the loser is beaten, not dead.
      const winner = result.duelResolved === 'player' ? player : defender;
      const loser = result.duelResolved === 'player' ? defender : player;
      sayTo(winner, `\nVictory! The duel ends — ${loser.name} is beaten.`);
      sayTo(loser, `\nThe duel ends. ${winner.name} has beaten you.`);
      if (result.duelEnd !== 'surrender') {
        loser.hp = Math.max(1, loser.hp - Math.floor(loser.hp * 0.1));
      }
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

  // ---------------- Assaults (open PvP, warrants) ----------------
  // Anyone may strike a pvpStance-OPEN adventurer. A killing in town is
  // murder: the attacker earns a warrant and guards hunt them.
  startAssault(player, target) {
    if (this.combats.has(player.charId) || this.combats.has(target.charId)) {
      return { ok: false, error: 'One of you is already in combat.' };
    }
    const def = derivePlayerDef(target);
    const enemies = [{
      uid: `assault_${target.charId}`,
      def,
      name: target.name,
      hp: target.hp,
      maxHp: target.maxHp,
      timer: def.weapon.speed,
      dead: false,
    }];
    const combat = new Combat(`assault_${player.charId}_${Date.now()}`, player, enemies, {
      onEnd: (c, result) => this.endAssault(player, target, c, result),
      game: this.game,
      defender: target,
      duelEnd: 'blood',
    });
    // Assault metadata rides on the combat object (no duel machinery changes).
    combat.assault = true;
    combat.townKill = this.game.isTownRoom ? this.game.isTownRoom(target.room) : true;
    this.combats.set(player.charId, combat);
    this.combats.set(target.charId, combat);
    player.combatId = combat.id;
    target.combatId = combat.id;
    return { ok: true, combat };
  }

  endAssault(player, target, combat, result) {
    this.endDuel(player, target, combat, result);
    // A town killing draws the noose: murder warrant on the attacker.
    if (result.win && combat.assault && combat.townKill && this.game.chargeMurder) {
      this.game.chargeMurder(player);
    }
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
say(other, `${player.name} vanished from the fight. You stand alone.`, 'combat');
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
    const deathRoom = player.room;
    const corpse = this.game.dropCorpse(player);
    player.hp = Math.floor(player.maxHp * 0.5);
    player.room = 'temple';
    player.corpses = [];
    player.heldMana = 0;
    player.prepared = null;
    // Rite of Departure anchor: one item may be drawn from this corpse later.
    player.lastCorpse = corpse ? { uid: corpse.uid, room: deathRoom } : null;
    const belongings = corpse
      ? ' Your belongings lie with your corpse where you fell — return to reclaim them.'
      : ' You were carrying nothing of worth.';
say(player, `You awaken in the Temple of the Pantheon, a healer dabbing your brow. You feel hollowed out — some of your hard-won experience has slipped away.${belongings}`, 'combat');
    this.game.look(player);
    this.game.status(player);
  }

  handleFled(player, fleeTo) {
    player.hp = Math.max(1, player.hp - Math.floor(player.hp * 0.1));
    if (fleeTo) player.room = fleeTo;
    player.corpses = [];
say(player, fleeTo ? 'You stagger back through the gate, breathing hard.' : 'You break free and slip away, heart hammering.', 'combat');
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
