// Justice domain: warrants, arrests, jail sentences, town fines, guard
// presence. Extracted from server/game.js (modularity audit finding #1) —
// Game holds one-line delegating methods; functions here take `game` first
// when they need world state (look/status/persist/combat).
import { roomById } from '../data/world.js';
import { say } from './player.js';

export function guardInRoom(game, p) {
  const room = roomById(p.room);
  return Boolean(room && room.npcs && room.npcs.includes('guard'));
}

// Justice zones (DR-flavored, compressed): lawless wilds have no law to
// break; the Guild District judges harshly; everywhere settled is standard.
export function justiceZone(game, p) {
  const room = roomById(p.room);
  if (!room) return 'none';
  if (game.isWild(room.id)) return 'none';
  if (room.zone !== 'town' && room.zone !== 'riverhaven') return 'none';
  if (room.id === 'guild_district') return 'strict';
  return 'standard';
}

export function timeLeftInJail(game, p) {
  if (!p.jailUntil) return 0;
  return Math.max(0, Math.ceil((p.jailUntil - Date.now()) / 1000));
}

// Jail release on walking out: the judge's verdict costs deducted on release
// (heat-scaled fine, harsher in strict zones). Unpaid costs become town debt.
export function releaseFromJail(game, p) {
  const heat = p.crimeHeat || 0;
  const zoneMult = justiceZone(game, p) === 'strict' ? 1.5 : 1;
  const fine = Math.round((5 + heat * 5) * zoneMult);
  const paid = Math.min(p.silver, fine);
  p.silver -= paid;
  if (paid < fine) p.debt = (p.debt || 0) + (fine - paid);
  const hadWarrant = Boolean(p.warrant);
  p.jailUntil = 0;
  p.crimeHeat = 0;
  p.warrant = null;
  say(p, `The judge's verdict is read: ${fine} silvers in town costs. You pay ${paid}${paid < fine ? ` — the remaining ${fine - paid} silvers stand as town debt` : ''} and the cell door opens.${hadWarrant ? ' Your warrant is cleared.' : ''}`);
}

// A killing in town sets the law against you.
export function chargeMurder(game, p) {
  p.warrant = { charge: 'murder', issuedAt: Date.now() };
  p.pvpStance = 'open';
  say(p, `\n\x1b[1mMURDER!\x1b[0m The Crossing has issued a WARRANT for your arrest. Guards will seize you on sight. "recall warrant" to read it, or "surrender" to turn yourself in.`);
  game.persistPlayer(p);
}

// A wanted player who walks past a guard is taken. Debtors are garnished.
export function pursueWarrant(game, p) {
  if (guardInRoom(game, p)) {
    const debt = p.debt || 0;
    if (!p.warrant && debt > 0) {
      const take = Math.min(p.silver, Math.ceil(debt * 0.25));
      if (take > 0) {
        p.silver -= take;
        p.debt = debt - take;
        say(p, `A guard eyes you at the guardhouse ledger. "You still owe the town ${p.debt} silvers." He takes ${take} from your purse toward it.`);
        game.persistPlayer(p);
      }
    }
  }
  if (!p.warrant || !guardInRoom(game, p)) return;
  seizeWanted(game, p);
}

// The actual arrest: fine, cell, warrant stands until the plea.
export function seizeWanted(game, p) {
  if (!p.warrant) return; // debtor walk-by: garnish only, no arrest
  p.silver = Math.max(0, p.silver - Math.floor(p.silver * 0.3));
  p.jailUntil = Date.now() + 120 * 1000;
  p.room = 'jail';
  p.hidden = false;
  p.combatId = null;
  const combat = game.combat.getFor(p);
  if (combat) game.combat.disconnect(p);
  say(p, `\nA guard claps a hand on your shoulder. "${p.warrant.charge.toUpperCase()} — the warrant is read, the cell is ready."\nYou are dragged to the Town Cells, lighter by a third of your purse.`);
  game.look(p);
  game.status(p);
  game.persistPlayer(p);
}

export function surrenderToGuards(game, p) {
  if (!p.warrant) return { ok: false, msg: 'You have no warrant outstanding.' };
  p.room = 'jail';
  p.jailUntil = Date.now() + 120 * 1000;
  p.hidden = false;
  const combat = game.combat.getFor(p);
  if (combat) game.combat.disconnect(p);
  say(p, `\nYou raise your hands. A guard steps forward and reads the warrant — ${p.warrant.charge.toUpperCase()}. "Turned yourself in, eh? The judge will hear you soon enough."\nYou are taken to the Town Cells.`);
  game.look(p);
  game.status(p);
  game.persistPlayer(p);
  return { ok: true, msg: 'You surrender to the law.' };
}

// A guard spots the theft: jail, confiscation, and a pending plea.
export function arrest(game, p) {
  const taken = Math.floor(p.silver * 0.25);
  p.silver -= taken;
  p.crimeHeat = 0;
  p.jailUntil = Date.now() + 90 * 1000;
  p.room = 'jail';
  p.hidden = false;
  p.combatId = null;
  const combat = game.combat.getFor(p);
  if (combat) game.combat.disconnect(p);
  say(p, `\nA guard seizes your arm! "Caught red-handed, thief."\nYou are dragged to the Town Cells. ${taken} silvers are confiscated.\nType "plead guilty" to pay your fine, or "plead innocent" to wait for the judge.`);
  game.look(p);
  game.status(p);
  game.persistPlayer(p);
}
