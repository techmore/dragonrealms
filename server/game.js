// Runtime world manager: player presence, creature spawns, movement, look,
// combat wiring, and the combat manager ticker. Domain logic (shops, wilds,
// quests, status) lives in server/economy.js, server/wilds.js,
// server/quests.js, and server/status.js — this class delegates to them.
import { roomById, ROOMS, ZONES } from '../data/world.js';
import { DIR_NAMES, cap } from './util.js';
import { say, sayRaw } from './player.js';
import { db } from './db.js';
import { npcById } from '../data/npcs.js';
import { creatureById, RARES } from '../data/creatures.js';
import { itemById } from '../data/items.js';
import { bankRexp, pulseExp, unlockAchievement } from './player.js';
import { manaRegenRate } from '../data/mana.js';
import { VOICE_POOL } from '../data/abilities.js';
import {
  savePlayer, addItem, removeItemInstances, isStackableItem,
  instanceMetadata, skillRank, gainSkillExp,
} from './player.js';
import { CombatManager } from './combat-manager.js';
import { economy } from './economy.js';
import { wilds } from './wilds.js';
import { quests } from './quests.js';
import { status as statusView } from './status.js';
import * as pvp from './pvp.js';
import * as weather from './weather.js';
import * as corpses from './corpses.js';

const RESPAWN_MS = 25 * 1000;
// DR_SPAWN_MULT: optional spawn-density multiplier for test/sweep windows
// (e.g. DR_SPAWN_MULT=2 doubles creature instances per room at init). Purely
// additive — unset/1 keeps production behavior identical.
const SPAWN_MULT = Math.max(1, Number(process.env.DR_SPAWN_MULT) || 1);
const MANA_PULSE_MS = 6 * 1000;

// Weather kinds and their weightings by season — see server/weather.js.
const DIRS = DIR_NAMES;

import { vitalityLabel } from './combat.js';

function resolveExit(room, dir) {
  if (room.exits[dir]) return room.exits[dir];
  const canonical = { u: 'up', d: 'down' }[dir];
  return canonical ? room.exits[canonical] : null;
}

const creatureUid = () => `crt_${Math.random().toString(36).slice(2, 10)}`;

export class Game {
  constructor() {
    this.players = new Map();      // charId -> player runtime
    this.roomCreatures = new Map(); // roomId -> [{uid, def, hp, maxHp, alive, respawnAt}]
    this.floorItems = new Map();    // roomId -> [{uid, item, qty}]
    this.pendingDuels = new Map();  // `${initiator}|${target}` -> {initiator, target, createdAt}
    this.combat = new CombatManager(this);
    this.respawnTicker = null;
    // Weather drifts every few game-hours; seasons follow the real calendar.
    this.weather = { kind: 'fair', until: Date.now() + 5 * 60 * 1000 };
    this.weatherTicker = null;
    this.uptimeAt = Date.now(); // surfaced read-only via /api/gm/admin/status
  }

  // ---------- Weather (delegates to server/weather.js) ----------
  rollWeather() { this.weather = weather.roll(this.weather); return this.weather; }
  weatherNow() { return weather.now(this.weather); }
  weatherLuckMod() { return weather.luckMod(this); }
  weatherManaMod() { return weather.manaMod(this); }
  weatherLabel() { return weather.label(this); }

  init() {
    for (const [roomId, room] of Object.entries(ROOMS)) {
      const spawns = [];
      for (const defId of room.spawns || []) {
        // Spawn-density multiplier (sweep windows): repeat each entry N times.
        for (let i = 0; i < SPAWN_MULT; i++) {
          const base = creatureById(defId);
          if (!base) continue;
          const rare = RARES[room.zone];
          const def = rare && Math.random() < 0.08 ? rare : base;
          spawns.push(this.makeCreature(def));
        }
      }
      this.roomCreatures.set(roomId, spawns);
      this.floorItems.set(roomId, []);
    }
    this.combat.startTicker();
    this.respawnTicker = setInterval(() => this.respawnTick(), RESPAWN_MS);
    this.manaTicker = setInterval(() => this.manaPulse(), MANA_PULSE_MS);
    this.manaTicker.unref();
    this.weatherTicker = setInterval(() => this.rollWeather(), 60 * 1000);
    this.weatherTicker.unref();
    this.autosaveTicker = setInterval(() => {
      for (const p of this.players.values()) {
        try { savePlayer(p); } catch (e) { console.error('autosave error', e); }
      }
    }, 60 * 1000);
    this.autosaveTicker.unref();
    // Field-exp pulse: banked pools drain into ranks on DR's staggered group
    // schedule — ten fixed groups, one per 20-second phase, full cycle 200 s.
    // Wall-clock tick keeps phases stable across restarts.
    this.pulseTicker = setInterval(() => {
      const tick = Math.floor(Date.now() / (20 * 1000));
      for (const p of this.players.values()) {
        try {
          if (pulseExp(p, tick) > 0) savePlayer(p);
        } catch (e) { console.error('pulse error', e); }
      }
    }, 20 * 1000);
    this.pulseTicker.unref();
  }

  // Stop every background system as one idempotent lifecycle operation.
  // Production shutdown and tests share this so no timer is forgotten when a
  // new recurring subsystem is added.
  stop() {
    this.combat.stopTicker();
    for (const key of ['respawnTicker', 'manaTicker', 'weatherTicker', 'autosaveTicker', 'pulseTicker']) {
      if (this[key]) clearInterval(this[key]);
      this[key] = null;
    }
  }

  // Attunement pulses: magic guilds regenerate mana in steady pulses, faster
  // for primary-magic guilds, slower for tertiaries, scaling with attunement.
  // Barbarians instead regen inner fire: freely toward 100% in combat, but
  // capped at a passive ceiling out of combat that grows with the skill.
  manaPulse() {
    for (const p of this.players.values()) {
      if (p.guild.id === 'barbarian') {
        const inCombat = Boolean(p.combatId);
        const duelist = (p.abilities || []).includes('duelist');
        const cap = inCombat ? 100 : Math.min(100, 30 + skillRank(p, 'inner_fire') * 0.7 + (duelist ? 25 : 0));
        const rate = (inCombat ? 6 : 4) + skillRank(p, 'inner_fire') * 0.12;
        if ((p.innerFire || 0) < cap) {
          p.innerFire = Math.min(cap, (p.innerFire || 0) + Math.max(1, Math.floor(rate)));
        }
        if ((p.voice || 0) < VOICE_POOL) p.voice = Math.min(VOICE_POOL, (p.voice || 0) + 4);
        continue;
      }
      if (!p.guild.magic || p.mana >= p.maxMana) continue;
      let rate = manaRegenRate(p.guild.id) * Math.min(2.5, 0.5 + skillRank(p, 'attunement') * 0.005);
      // Water-attuned warrior mages renew like the tide; the Meditation
      // technique steadies any magic guild's renewal.
      if (p.guild.id === 'warmage' && p.element === 'water') rate *= 1.25;
      if ((p.techniques || []).includes('meditation')) rate *= 1.2;
      const gain = Math.max(1, Math.floor(p.maxMana * rate));
      p.mana = Math.min(p.maxMana, p.mana + gain);
    }
  }

  makeCreature(def) {
    const maxHp = def.circle * 14 + def.stats.con * 3 + 20;
    return { uid: creatureUid(), def, hp: maxHp, maxHp, alive: true, respawnAt: 0 };
  }

  respawnTick() {
    const now = Date.now();
    for (const [roomId, insts] of this.roomCreatures) {
      for (const c of insts) {
        if (!c.alive && c.respawnAt && c.respawnAt <= now) {
          // Anti-camp throttle: a room that keeps churning kills slows its
          // respawns, so no one can grind a single spot forever.
          if (this.campThrottled(roomId, now)) {
            c.respawnAt = now + 120 * 1000;
            continue;
          }
          this.logRespawn(roomId, now);
          c.alive = true;
          c.hp = c.maxHp;
          c.respawnAt = 0;
        }
      }
    }
  }

  // Respawn ledger: roomId -> recent respawn timestamps (rolling 5-min window).
  logRespawn(roomId, now) {
    if (!this.spawnLog) this.spawnLog = new Map();
    const t = this.spawnLog.get(roomId) || [];
    t.push(now);
    this.spawnLog.set(roomId, t.filter((x) => now - x < 5 * 60 * 1000));
  }

  campThrottled(roomId, now) {
    if (!this.spawnLog) return false;
    const t = this.spawnLog.get(roomId) || [];
    const recent = t.filter((x) => now - x < 5 * 60 * 1000);
    if (recent.length < 14 * SPAWN_MULT) return false;
    // Tell anyone camping this room once per throttle period.
    const key = `throttle_${roomId}`;
    if (!this.throttleNotices || this.throttleNotices.get(key) !== this.throttleEpoch) {
      this.throttleNotices = this.throttleNotices || new Map();
      this.throttleEpoch = (this.throttleEpoch || 0) + 1;
      this.throttleNotices.set(key, this.throttleEpoch);
      for (const o of this.players.values()) {
        if (o.room === roomId) {
          say(o, 'The hunting here has grown thin — the game has scattered. (Move on, and the ground will recover.)');
        }
      }
    }
    return true;
  }

  creaturesIn(roomId) {
    return (this.roomCreatures.get(roomId) || []).filter((c) => c.alive);
  }

  findCreature(roomId, name) {
    const n = name.toLowerCase();
    return this.creaturesIn(roomId).find((c) =>
      c.def.name.includes(n) || c.def.plural.includes(n) || c.def.id === n || c.def.name.replace(/^a /, '').includes(n)
    );
  }

  dropFloor(roomId, itemId, qty = 1, transferred = null) { return corpses.dropFloor(this, roomId, itemId, qty, transferred); }

  floorItemsIn(roomId) {
    return this.floorItems.get(roomId) || [];
  }

  findFloorItem(roomId, name) {
    const n = name.toLowerCase();
    return this.floorItemsIn(roomId).find((f) => f.item.name.includes(n) || f.item.id.includes(n));
  }

  // ---------- Player death: a corpse with your belongings stays where you fell ----------
  dropCorpse(p) { return corpses.dropCorpse(this, p); }

  corpseIn(p) {
    return this.floorItemsIn(p.room).find((f) => f && f.corpse);
  }

  searchCorpse(p) { return corpses.searchCorpse(this, p); }
  retrieveFromCorpse(p, itemName) { return corpses.retrieveFromCorpse(this, p, itemName); }

  clearEmptyCorpse(p, corpse) { corpses.clearEmptyCorpse(this, p, corpse); }

  addPlayer(p) {
    const owner = this.players.get(p.charId);
    if (owner === p) return true;
    if (owner) return false;
    this.players.set(p.charId, p);
    p.online = true;
    p.corpses = [];
    p.loginAt = Date.now();
    return true;
  }

  removePlayer(p) {
    // A delayed close from an older socket must never evict or save over the
    // runtime that currently owns this character.
    if (this.players.get(p.charId) !== p) return false;
    p.online = false;
    this.stopRest(p);
    if (p.loginAt) bankRexp(p, Date.now() - p.loginAt);
    this.combat.disconnect(p);
    try {
      this.persistPlayer(p);
    } finally {
      this.players.delete(p.charId);
    }
    return true;
  }

  persistPlayer(p) {
    // Persistence is an owner operation. In particular, a stale HTTP/WS
    // session retaining an older Player object cannot overwrite live state.
    if (this.players.get(p.charId) !== p) return false;
    savePlayer(p);
    return true;
  }

  // ---------- Movement ----------
  move(p, dir) {
    const room = roomById(p.room);
    const target = room && resolveExit(room, dir);
    if (!target) return { ok: false, msg: 'You cannot go that way.' };
    if (p.combatId) {
      // DR: you may leave a room while foes are only at missile range; a
      // creature at pole or melee blocks the way.
      const combat = this.combat.getFor(p);
      const blocked = combat && combat.aliveEnemies.some((e) => e.range !== 'missile');
      if (blocked) return { ok: false, msg: 'Creatures block your path — flee, fall back, or fight on.' };
      if (combat) combat.end(false, false, true, null);
    }
    if (p.stocksUntil && Date.now() < p.stocksUntil) {
      const secs = Math.ceil((p.stocksUntil - Date.now()) / 1000);
      return { ok: false, msg: `You are in the stocks! A crowd pelts you with soft fruit (${secs}s).` };
    }
    if (p.room === 'jail') {
      const left = this.timeLeftInJail(p);
      if (left > 0) return { ok: false, msg: `The cell door is barred. ${left}s until your sentence is served (or "plead guilty").` };
      // The judge's verdict: costs deducted on release (heat-scaled fine,
      // harsher in strict zones). Unpaid costs become town debt.
      const heat = p.crimeHeat || 0;
      const zoneMult = this.justiceZone(p) === 'strict' ? 1.5 : 1;
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
    this.stopRest(p);
    p.hidden = false;
    // Seizure check runs on BOTH sides of the move: a criminal is taken if
    // they start next to a guard or end next to one (guards watch their
    // whole street, not just the cell they stand in).
    const watchedFrom = this.guardInRoom(p);
    p.room = target;
    if (this.isWild(target)) gainSkillExp(p, 'athletics', 1);
    this.persistPlayer(p);
    this.enterRoom(p);
    // A wanted criminal walking past the guard is seized.
    if (!watchedFrom) this.pursueWarrant(p); else this.seizeWanted(p);
    return { ok: true };
  }

  // Direct relocation (moon gate, travel magic): no combat allowed.
  moveTo(p, roomId) {
    if (p.combatId) return { ok: false, msg: 'You cannot do that in the middle of a fight.' };
    this.stopRest(p);
    p.hidden = false;
    p.room = roomId;
    if (this.isWild(roomId)) gainSkillExp(p, 'athletics', 1);
    this.persistPlayer(p);
    this.enterRoom(p);
    return { ok: true };
  }

  enterRoom(p) {
    this.look(p);
    // Aggressive creatures attack on sight.
    const aggressive = this.creaturesIn(p.room).filter((c) => c.def.aggressive);
    if (aggressive.length && !p.combatId) {
      this.startCombat(p, aggressive.map((c) => c.def));
    }
  }

  startCombat(p, defs) {
    this.stopRest(p);
    const res = this.combat.start(p, defs);
    if (res.ok) {
      res.combat.say(`\n${res.combat.enemies.map((e) => cap(e.def.name)).join(' and ')} turn${res.combat.enemies.length > 1 ? '' : 's'} to face you!\n`);
      res.combat.startAttack();
      this.status(p);
    }
  }

  // ---------- PvP duels ----------
  canDuelHere(p) { return pvp.canDuelHere(this, p); }

  challengeDuel(p, targetName, end = 'blood', reason = '') { return pvp.challengeDuel(this, p, targetName, end, reason); }

  acceptDuel(p, initiatorName) { return pvp.acceptDuel(this, p, initiatorName); }

  declineDuel(p, initiatorName) { return pvp.declineDuel(this, p, initiatorName); }

  // ---------- Assaults & warrants ----------
  isTownRoom(roomId) {
    const room = roomById(roomId);
    return Boolean(room && (room.zone === 'town' || room.zone === 'riverhaven'));
  }

  startAssault(p, targetName) {
    if (p.combatId) return { ok: false, msg: 'You are already in combat.' };
    const target = [...this.players.values()].find((o) => o !== p && o.room === p.room && o.name.toLowerCase() === (targetName || '').toLowerCase());
    if (!target) return { ok: false, msg: 'There is no such adventurer here.' };
    if (target.combatId) return { ok: false, msg: `${target.name} is already in combat.` };
    if (target.pvpStance !== 'open') {
      return { ok: false, msg: `${target.name} is not OPEN to attack. Challenge them to a duel instead.` };
    }
    // Anti-abuse: striking far weaker adventurers is refused (the guard
    // notices, and decency does too).
    if (target.circle < p.circle - 4) {
      return { ok: false, msg: `${target.name} is circle ${target.circle} to your ${p.circle}. Preying on the weak shames the Crossing.` };
    }
    const res = this.combat.startAssault(p, target);
    if (!res.ok) return { ok: false, msg: res.error };
    res.combat.say(`\n\x1b[1m${p.name} strikes at ${target.name} without warning!\x1b[0m`);
    res.combat.startAttack();
    this.status(p);
    this.status(target);
    return { ok: true, msg: `You attack ${target.name}!` };
  }

  // A killing in town sets the law against you.
  chargeMurder(p) {
    p.warrant = { charge: 'murder', issuedAt: Date.now() };
    p.pvpStance = 'open';
    say(p, `\n\x1b[1mMURDER!\x1b[0m The Crossing has issued a WARRANT for your arrest. Guards will seize you on sight. "recall warrant" to read it, or "surrender" to turn yourself in.`);
    this.persistPlayer(p);
  }

  // A wanted player who walks past a guard is taken. Debtors are garnished.
  pursueWarrant(p) {
    if (this.guardInRoom(p)) {
      const debt = p.debt || 0;
      if (!p.warrant && debt > 0) {
        const take = Math.min(p.silver, Math.ceil(debt * 0.25));
        if (take > 0) {
          p.silver -= take;
          p.debt = debt - take;
          say(p, `A guard eyes you at the guardhouse ledger. "You still owe the town ${p.debt} silvers." He takes ${take} from your purse toward it.`);
          this.persistPlayer(p);
        }
      }
    }
    if (!p.warrant || !this.guardInRoom(p)) return;
    this.seizeWanted(p);
  }

  // The actual arrest: fine, cell, warrant stands until the plea.
  seizeWanted(p) {
    if (!p.warrant) return; // debtor walk-by: garnish only, no arrest
    p.silver = Math.max(0, p.silver - Math.floor(p.silver * 0.3));
    p.jailUntil = Date.now() + 120 * 1000;
    p.room = 'jail';
    p.hidden = false;
    p.combatId = null;
    const combat = this.combat.getFor(p);
    if (combat) this.combat.disconnect(p);
    say(p, `\nA guard claps a hand on your shoulder. "${p.warrant.charge.toUpperCase()} — the warrant is read, the cell is ready."\nYou are dragged to the Town Cells, lighter by a third of your purse.`);
    this.look(p);
    this.status(p);
    this.persistPlayer(p);
  }

  surrenderToGuards(p) {
    if (!p.warrant) return { ok: false, msg: 'You have no warrant outstanding.' };
    const guards = this.guardInRoom(p);
    p.room = 'jail';
    p.jailUntil = Date.now() + 120 * 1000;
    p.hidden = false;
    const combat = this.combat.getFor(p);
    if (combat) this.combat.disconnect(p);
    say(p, `\nYou raise your hands. A guard steps forward and reads the warrant — ${p.warrant.charge.toUpperCase()}. "Turned yourself in, eh? The judge will hear you soon enough."\nYou are taken to the Town Cells.`);
    this.look(p);
    this.status(p);
    this.persistPlayer(p);
    return { ok: true, msg: 'You surrender to the law.' };
  }

  defenderDefeated(defender, winner) {
    for (const s of Object.values(defender.skills)) {
      if (s.exp > 0) s.exp = Math.max(0, s.exp - Math.floor(s.exp * 0.25));
    }
    defender.hp = Math.floor(defender.maxHp * 0.5);
    defender.room = 'temple';
    defender.corpses = [];
    if (defender.online && defender.ws) {
      say(defender, `You have been defeated in a duel and wake in the Temple of the Pantheon, nursing your wounds.`, 'combat');
      this.look(defender);
      this.status(defender);
    }
    this.persistPlayer(defender);
    this.persistPlayer(winner);
  }

  // ---------- Look ----------
  look(p, target) {
    const room = roomById(p.room);
    const zone = ZONES[room.zone];
    const indoor = room.zone === 'town' || room.zone === 'riverhaven';
    // DR room header: [[Room Name, Area]] — the area rides in the header.
    let out = `\n\x1b[1m[[${room.name}, ${zone.name}]]\x1b[0m\n${room.desc}`;

    const npcs = (room.npcs || []).map(npcById).filter(Boolean);
    if (npcs.length) out += `\nHere: ${npcs.map((n) => n.name).join(', ')}.`;

    const creatures = this.creaturesIn(p.room);
    if (creatures.length) {
      const lines = creatures.map((c) => {
        const v = vitalityLabel(c.hp, c.maxHp);
        const state = v === 'in good shape' ? '' : `, ${v}`;
        // Monsterbold: creature names stand out in the room (webclient feature).
        return `\x1b[1m${cap(c.def.name)}\x1b[0m is here${state}.`;
      });
      out += `\n${lines.join('\n')}`;
    }

    if (p.corpses && p.corpses.length) {
      out += `\n${p.corpses.map((c) => `the corpse of ${c.def.name}`).join(', ')} lie on the ground.`;
    }

    const floor = this.floorItemsIn(p.room);
    const corpses = floor.filter((f) => f.corpse);
    if (corpses.length) out += `\n${corpses.map((f) => `${f.name} lies here, belongings scattered about it.`).join(' ')}`;
    const loose = floor.filter((f) => !f.corpse);
    if (loose.length) out += `\nOn the ground: ${loose.map((f) => (f.qty > 1 ? `${f.qty}x ${f.item.name}` : f.item.name)).join(', ')}.`;

    const others = [...this.players.values()].filter((o) => o !== p && o.room === p.room);
    if (others.length) out += `\n${others.map((o) => o.name).join(', ')} ${others.length === 1 ? 'is' : 'are'} here.`;

    const exits = Object.entries(room.exits).map(([d]) => DIRS[d]).filter(Boolean);
    if (exits.length) out += `\n${indoor ? 'Obvious exits' : 'Obvious paths'}: ${exits.join(', ')}.`;

    // New-adventurer signpost: the crier on the Town Green points fresh
    // arrivals at their first steps (hunting grounds, guild hall, quest).
    if (p.circle === 1 && !p.flags?.seenCrierHint && (room.npcs || []).includes('towncrier')) {
      p.flags = p.flags || {};
      p.flags.seenCrierHint = true;
      out += `\n\x1b[3mThe crier catches your eye: "New steel in town? Ask me about \x1b[4mhunting\x1b[0m\x1b[3m for the gates' grounds, or see your guild master west of the green — and say 'quest' to me for honest coin work."`;
    }

    const contents = {
      npcs: (room.npcs || []).map(npcById).filter(Boolean).map((n) => n.name),
      creatures: creatures.map((c) => ({ name: cap(c.def.name), state: vitalityLabel(c.hp, c.maxHp) })),
      items: loose.map((f) => (f.qty > 1 ? `${f.qty}x ${f.item.name}` : f.item.name)),
      players: others.map((o) => o.name),
    };

    // Room messages carry structured exits/contents for the client panels.
    sayRaw(p, { t: 'room', msg: out, exits, roomId: p.room, contents });
  }

  // ---------- Justice ----------
  guardInRoom(p) {
    const room = roomById(p.room);
    return Boolean(room && room.npcs && room.npcs.includes('guard'));
  }

  // Justice zones (DR-flavored, compressed): lawless wilds have no law to
  // break; the Guild District judges harshly; everywhere settled is standard.
  justiceZone(p) {
    const room = roomById(p.room);
    if (!room) return 'none';
    if (this.isWild(room.id)) return 'none';
    if (room.zone !== 'town' && room.zone !== 'riverhaven') return 'none';
    if (room.id === 'guild_district') return 'strict';
    return 'standard';
  }

  // A guard spots the theft: jail, confiscation, and a pending plea.
  arrest(p) {
    const taken = Math.floor(p.silver * 0.25);
    p.silver -= taken;
    p.crimeHeat = 0;
    p.jailUntil = Date.now() + 90 * 1000;
    p.room = 'jail';
    p.hidden = false;
    p.combatId = null;
    const combat = this.combat.getFor(p);
    if (combat) this.combat.disconnect(p);
    say(p, `\nA guard seizes your arm! "Caught red-handed, thief."\nYou are dragged to the Town Cells. ${taken} silvers are confiscated.\nType "plead guilty" to pay your fine, or "plead innocent" to wait for the judge.`);
    this.look(p);
    this.status(p);
    this.persistPlayer(p);
  }

  timeLeftInJail(p) {
    if (!p.jailUntil) return 0;
    return Math.max(0, Math.ceil((p.jailUntil - Date.now()) / 1000));
  }

  // ---------- Domain delegates (economy / wilds / quests / status) ----------
  shopNpcsIn(p) { return economy.shopNpcsIn(p); }
  listShop(p) { return economy.listShop(p); }
  buy(p, itemName, qty) { return economy.buy(p, itemName, qty); }
  sell(p, itemName, qty) { return economy.sell(p, itemName, qty); }
  bankerIn(p) { return economy.bankerIn(p); }
  deposit(p, amt) { return economy.deposit(p, amt); }
  withdraw(p, amt) { return economy.withdraw(p, amt); }
  vaultList(p) { return economy.vaultList(p); }
  vaultStore(p, itemName, qty) { return economy.vaultStore(p, itemName, qty); }
  vaultRetrieve(p, itemName, qty) { return economy.vaultRetrieve(p, itemName, qty); }
  healerIn(p) { return economy.healerIn(p); }
  heal(p) { return economy.heal(p); }
  commodityBoard(p) { return economy.commodityBoard(p); }
  commodityTrade(p, side, name, qty) { return economy.commodityTrade(p, side, name, qty); }

  isWild(roomId) { return wilds.isWild(roomId); }
  zoneName(roomId) { return wilds.zoneName(roomId); }
  forage(p) { return wilds.forage(this, p); }
  scavenge(p) { return wilds.scavenge(this, p); }
  track(p) { return wilds.track(this, p); }
  hunt(p) { return wilds.hunt(this, p); }
  ladder(province) { return wilds.ladder(province); }
  warhorn(p) { return wilds.warhorn(this, p); }
  startRest(p) { return wilds.startRest(this, p); }
  stopRest(p) { wilds.stopRest(p); }
  lookDirection(p, dir) { return wilds.lookDirection(this, p, dir); }

  hasCrier(p) { return quests.hasCrier(p); }
  questCreatureFor(p) { return quests.questCreatureFor(p); }
  assignQuest(p, source) { return quests.assignQuest(this, p, source); }
  questKill(p, creatureId) {
    const res = quests.questKill(this, p, creatureId);
    // Hunt credit is shared: party-mates in the room share kills and quest
    // progress, and fell a dread knight anywhere and it is legend.
    if (creatureId === 'dread_knight' && p.online) unlockAchievement(p, 'slayer');
    if (p.party) {
      for (const mid of p.party.members) {
        if (mid === p.charId) continue;
        const m = this.players.get(mid);
        if (m && m.party && m.party.id === p.party.id && m.room === p.room) {
          quests.questKill(this, m, creatureId);
          gainSkillExp(m, 'hunting', 2);
        }
      }
    }
    return res;
  }
  questSkin(p) { return quests.questSkin(this, p); }
  questDeliver(p) { return quests.questDeliver(this, p); }
  questClaim(p) { return quests.questClaim(this, p); }
  questDescription(p) { return quests.questDescription(p); }

  // ---------- Parties (DR hunt credit) ----------
  partyInvite(p, targetName) { return pvp.partyInvite(this, p, targetName); }
  partyJoin(p) { return pvp.partyJoin(this, p); }
  partyLeave(p) { return pvp.partyLeave(this, p); }
  partyStatus(p) { return pvp.partyStatus(this, p); }

  // ---------- Auction house (player trading) ----------
  // Listings live in the auctions table (see db.js); prune/return-on-expiry
  // lives in pvp.js. These delegates keep the command surface unchanged.
  auctionPrune() { pvp.auctionPrune(); }

  auctionList(p) { return pvp.auctionList(this, p); }
  auctionOffer(p, itemName, qty, price) { return pvp.auctionOffer(this, p, itemName, qty, price); }
  auctionBuy(p, listingId) { return pvp.auctionBuy(this, p, listingId); }

  guildTrainer(p) { return statusView.guildTrainer(p); }
  status(p) { statusView.status(this, p); }
  who() { return statusView.who(this); }
}
