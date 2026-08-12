// Runtime world manager: player presence, creature spawns, movement, look,
// combat wiring, and the combat manager ticker. Domain logic (shops, wilds,
// quests, status) lives in server/economy.js, server/wilds.js,
// server/quests.js, and server/status.js — this class delegates to them.
import { ROOMS, ZONES, roomById } from '../data/world.js';
import { npcById } from '../data/npcs.js';
import { creatureById, RARES } from '../data/creatures.js';
import { itemById } from '../data/items.js';
import { bankRexp, pulseExp, unlockAchievement } from './player.js';
import { manaRegenRate } from '../data/mana.js';
import { VOICE_POOL } from '../data/abilities.js';
import {
  savePlayer, addItem, removeItem, unequipItem, skillRank, gainSkillExp,
} from './player.js';
import { CombatManager } from './combat-manager.js';
import { economy } from './economy.js';
import { wilds } from './wilds.js';
import { quests } from './quests.js';
import { status as statusView } from './status.js';

const RESPAWN_MS = 25 * 1000;
const MANA_PULSE_MS = 6 * 1000;
const WEATHER_MS = 10 * 60 * 1000;

// Weather kinds and their weightings by season.
const WEATHER_POOL = {
  spring: ['clear', 'fair', 'rain', 'fog', 'storm'],
  summer: ['clear', 'fair', 'fair', 'storm', 'fog'],
  autumn: ['clear', 'rain', 'rain', 'fog', 'fair'],
  winter: ['clear', 'snow', 'snow', 'fog', 'storm'],
};

function seasonFor(date) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}
const DIRS = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down', up: 'up', down: 'down',
};

function resolveExit(room, dir) {
  if (room.exits[dir]) return room.exits[dir];
  const canonical = { u: 'up', d: 'down' }[dir];
  return canonical ? room.exits[canonical] : null;
}

const creatureUid = () => `crt_${Math.random().toString(36).slice(2, 10)}`;

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
  }

  // Roll a fresh weather state when the current one lapses.
  rollWeather() {
    if (Date.now() < this.weather.until) return this.weather;
    const season = seasonFor(new Date());
    const pool = WEATHER_POOL[season];
    this.weather = {
      kind: pool[Math.floor(Math.random() * pool.length)],
      until: Date.now() + WEATHER_MS * (0.6 + Math.random() * 0.8),
      season,
    };
    return this.weather;
  }

  weatherNow() {
    return { ...this.weather, season: this.weather.season || seasonFor(new Date()) };
  }

  // Wilds fortune shifts with the sky: clear skies help, storms hinder.
  weatherLuckMod() {
    this.rollWeather();
    return { clear: 0.08, fair: 0.03, rain: -0.05, fog: -0.1, storm: -0.15, snow: -0.08 }[this.weather.kind] || 0;
  }

  // Mana flows with the weather: storms charge the aether, fog dulls it.
  weatherManaMod() {
    this.rollWeather();
    return { clear: 0.06, fair: 0, rain: 0.04, fog: -0.1, storm: 0.15, snow: -0.04 }[this.weather.kind] || 0;
  }

  weatherLabel() {
    this.rollWeather();
    const desc = {
      clear: 'the sky is clear and the air bright',
      fair: 'the weather is fair',
      rain: 'a steady rain is falling',
      fog: 'a thick fog has rolled in',
      storm: 'a thunderstorm rages overhead',
      snow: 'snow is falling softly',
    };
    return `${desc[this.weather.kind]}. ${cap(this.weather.season)}.`;
  }

  init() {
    for (const [roomId, room] of Object.entries(ROOMS)) {
      const spawns = [];
      for (const defId of room.spawns || []) {
        const base = creatureById(defId);
        if (!base) continue;
        const rare = RARES[room.zone];
        const def = rare && Math.random() < 0.08 ? rare : base;
        spawns.push(this.makeCreature(def));
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
    // Field-exp pulse: banked pool drains into ranks (DR pulse feel).
    this.pulseTicker = setInterval(() => {
      for (const p of this.players.values()) {
        try {
          if (pulseExp(p) > 0) savePlayer(p);
        } catch (e) { console.error('pulse error', e); }
      }
    }, 30 * 1000);
    this.pulseTicker.unref();
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
    if (recent.length < 14) return false;
    // Tell anyone camping this room once per throttle period.
    const key = `throttle_${roomId}`;
    if (!this.throttleNotices || this.throttleNotices.get(key) !== this.throttleEpoch) {
      this.throttleNotices = this.throttleNotices || new Map();
      this.throttleEpoch = (this.throttleEpoch || 0) + 1;
      this.throttleNotices.set(key, this.throttleEpoch);
      for (const o of this.players.values()) {
        if (o.room === roomId) {
          o.ws.send(JSON.stringify({ t: 'msg', msg: 'The hunting here has grown thin — the game has scattered. (Move on, and the ground will recover.)' }));
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

  dropFloor(roomId, itemId, qty = 1) {
    const item = itemById(itemId);
    if (!item) return;
    this.floorItems.get(roomId).push({ uid: creatureUid(), item, qty });
  }

  floorItemsIn(roomId) {
    return this.floorItems.get(roomId) || [];
  }

  findFloorItem(roomId, name) {
    const n = name.toLowerCase();
    return this.floorItemsIn(roomId).find((f) => f.item.name.includes(n) || f.item.id.includes(n));
  }

  // ---------- Player death: a corpse with your belongings stays where you fell ----------
  dropCorpse(p) {
    const items = p.inventory.map(({ item, qty }) => ({ id: item.id, qty }));
    const equipment = Object.keys(p.equipment).map((slot) => ({ slot, id: p.equipment[slot].id }));
    if (!items.length && !equipment.length) return null;
    for (const slot of Object.keys(p.equipment)) unequipItem(p, slot);
    for (const inv of [...p.inventory]) removeItem(p, inv.item.id, inv.qty);
    const corpse = {
      uid: creatureUid(), corpse: true, owner: p.name, ownerCharId: p.charId,
      name: `${p.name}'s corpse`, qty: 1,
      item: { id: `corpse_${p.charId}`, name: `${p.name}'s corpse`, type: 'corpse', value: 0, desc: 'A still body, belongings about it.' },
      items, equipment,
    };
    this.floorItems.get(p.room).push(corpse);
    return corpse;
  }

  corpseIn(p) {
    return this.floorItemsIn(p.room).find((f) => f && f.corpse);
  }

  searchCorpse(p) {
    const corpse = this.corpseIn(p);
    if (!corpse) return { ok: false, msg: 'There is no corpse here to search.' };
    const parts = [];
    if (corpse.items.length) parts.push(`carried: ${corpse.items.map((i) => `${itemById(i.id).name}${i.qty > 1 ? ` (x${i.qty})` : ''}`).join(', ')}`);
    if (corpse.equipment.length) parts.push(`worn: ${corpse.equipment.map((e) => itemById(e.id).name).join(', ')}`);
    return {
      ok: true,
      msg: `\nYou kneel by ${corpse.name} and search it:\n  ${parts.join('\n  ') || 'Nothing of worth remains.'}\nReclaim your gear with "get <item> from corpse".`,
    };
  }

  retrieveFromCorpse(p, itemName) {
    const corpse = this.corpseIn(p);
    if (!corpse) return { ok: false, msg: 'There is no corpse here to take from.' };
    const n = itemName.toLowerCase();
    const invIdx = corpse.items.findIndex((i) => itemById(i.id) && (itemById(i.id).name.toLowerCase().includes(n) || i.id.includes(n)));
    if (invIdx >= 0) {
      const it = corpse.items[invIdx];
      addItem(p, it.id, it.qty);
      corpse.items.splice(invIdx, 1);
      this.clearEmptyCorpse(p, corpse);
      return { ok: true, msg: `You take ${it.qty > 1 ? `${it.qty}x ` : ''}${itemById(it.id).name} from the corpse.` };
    }
    const eqIdx = corpse.equipment.findIndex((e) => itemById(e.id) && (itemById(e.id).name.toLowerCase().includes(n) || e.id.includes(n)));
    if (eqIdx >= 0) {
      const it = corpse.equipment[eqIdx];
      addItem(p, it.id, 1);
      corpse.equipment.splice(eqIdx, 1);
      this.clearEmptyCorpse(p, corpse);
      return { ok: true, msg: `You retrieve ${itemById(it.id).name} from the corpse.` };
    }
    return { ok: false, msg: 'It holds no such thing.' };
  }

  clearEmptyCorpse(p, corpse) {
    if (corpse.items.length || corpse.equipment.length) return;
    const floor = this.floorItemsIn(p.room);
    const idx = floor.indexOf(corpse);
    if (idx >= 0) floor.splice(idx, 1);
  }

  addPlayer(p) {
    this.players.set(p.charId, p);
    p.online = true;
    p.corpses = [];
    p.loginAt = Date.now();
  }

  removePlayer(p) {
    this.players.delete(p.charId);
    p.online = false;
    this.stopRest(p);
    if (p.loginAt) bankRexp(p, Date.now() - p.loginAt);
    this.combat.disconnect(p);
    this.persistPlayer(p);
  }

  persistPlayer(p) {
    savePlayer(p);
  }

  // ---------- Movement ----------
  move(p, dir) {
    const room = roomById(p.room);
    const target = room && resolveExit(room, dir);
    if (!target) return { ok: false, msg: 'You cannot go that way.' };
    if (p.combatId) return { ok: false, msg: 'You are in combat! Try "retreat" to flee.' };
    if (p.room === 'jail') {
      const left = this.timeLeftInJail(p);
      if (left > 0) return { ok: false, msg: `The cell door is barred. ${left}s until your sentence is served (or "plead guilty").` };
      // The judge's verdict: costs deducted on release (heat-scaled fine).
      const heat = p.crimeHeat || 0;
      const fine = 5 + heat * 5;
      const paid = Math.min(p.silver, fine);
      p.silver -= paid;
      const hadWarrant = Boolean(p.warrant);
      p.jailUntil = 0;
      p.crimeHeat = 0;
      p.warrant = null;
      p.ws.send(JSON.stringify({ t: 'msg', msg: `The judge's verdict is read: ${fine} silvers in town costs. You pay ${paid}${paid < fine ? ' (the rest from your debts)' : ''} and the cell door opens.${hadWarrant ? ' Your warrant is cleared.' : ''}` }));
    }
    this.stopRest(p);
    p.hidden = false;
    p.room = target;
    if (this.isWild(target)) gainSkillExp(p, 'athletics', 1);
    this.persistPlayer(p);
    this.enterRoom(p);
    // A wanted criminal walking past the guard is seized.
    this.pursueWarrant(p);
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
  canDuelHere(p) {
    const room = roomById(p.room);
    return Boolean(room && room.zone !== 'town' && room.zone !== 'riverhaven');
  }

  challengeDuel(p, targetName, end = 'blood') {
    if (!this.canDuelHere(p)) return { ok: false, msg: 'The town guards do not permit duels here. Take it to the wilds.' };
    if (p.combatId) return { ok: false, msg: 'You are already in combat.' };
    // Paladins may not strike first (code of honor).
    if (p.guild.id === 'paladin') {
      p.soul = Math.max(0, (p.soul ?? 50) - 5);
      p.ws.send(JSON.stringify({ t: 'msg', msg: 'Your oath forbids striking first. Your soul dims slightly. (-5 soul)' }));
    }
    const n = targetName.toLowerCase();
    const target = [...this.players.values()].find((o) => o !== p && o.room === p.room && o.name.toLowerCase() === n);
    if (!target) return { ok: false, msg: 'There is no such adventurer here.' };
    if (target.combatId) return { ok: false, msg: `${target.name} is already in combat.` };
    if (!['blood', 'blow', 'pain'].includes(end)) end = 'blood';
    const endLabel = { blood: 'first blood runs', blow: 'the first solid blow lands', pain: 'one side is badly hurt' }[end];

    if (target.pvpStance === 'closed') {
      return { ok: false, msg: `${target.name} stands CLOSED to all challenges.` };
    }
    if (target.pvpStance === 'open') {
      // OPEN: no consent needed — the duel begins at once.
      const res = this.combat.startDuel(p, target, end);
      if (!res.ok) return { ok: false, msg: res.error };
      res.combat.say(`\n\x1b[1mThe duel begins! ${p.name} faces ${target.name} (ends when ${endLabel}).\x1b[0m`);
      res.combat.startAttack();
      this.status(p);
      this.status(target);
      return { ok: true, msg: `${target.name} stands OPEN — the duel begins! (Ends when ${endLabel}.)` };
    }

    const key = `${p.charId}|${target.charId}`;
    this.pendingDuels.set(key, { initiator: p.charId, target: target.charId, createdAt: Date.now(), end });
    target.ws.send(JSON.stringify({ t: 'msg', msg: `\n\x1b[1m${p.name} challenges you to a duel!\x1b[0m (ends when ${endLabel}) Type "accept ${p.name}" or "decline ${p.name}".` }));
    return { ok: true, msg: `You challenge ${target.name} to a duel (ends when ${endLabel}). They must "accept" it to begin.` };
  }

  acceptDuel(p, initiatorName) {
    const n = initiatorName.toLowerCase();
    const initiator = [...this.players.values()].find((o) => o.name.toLowerCase() === n);
    if (!initiator) return { ok: false, msg: 'There is no such adventurer here.' };
    const key = `${initiator.charId}|${p.charId}`;
    const pending = this.pendingDuels.get(key);
    if (!pending) return { ok: false, msg: 'You have no pending duel with them.' };
    this.pendingDuels.delete(key);
    if (Date.now() - pending.createdAt > 60 * 1000) return { ok: false, msg: 'That duel offer has expired.' };
    if (initiator.room !== p.room) return { ok: false, msg: 'They are no longer in the room.' };
    if (initiator.combatId || p.combatId) return { ok: false, msg: 'Someone has already entered combat.' };
    if (!this.canDuelHere(p)) return { ok: false, msg: 'The town guards do not permit duels here.' };

    const res = this.combat.startDuel(initiator, p, pending.end || 'blood');
    if (!res.ok) return { ok: false, msg: res.error };
    const combat = res.combat;
    const endLabel = { blood: 'first blood runs', blow: 'the first solid blow lands', pain: 'one side is badly hurt' }[combat.duelEnd] || 'first blood runs';
    combat.say(`\n\x1b[1mThe duel begins! ${initiator.name} faces ${p.name} (ends when ${endLabel}).\x1b[0m`);
    combat.startAttack();
    this.status(initiator);
    this.status(p);
    return { ok: true, msg: `The duel begins! Fight with "stance" and "retreat" to yield.` };
  }

  declineDuel(p, initiatorName) {
    const n = initiatorName.toLowerCase();
    const initiator = [...this.players.values()].find((o) => o.name.toLowerCase() === n);
    if (!initiator) return { ok: false, msg: 'There is no such adventurer here.' };
    const key = `${initiator.charId}|${p.charId}`;
    if (!this.pendingDuels.delete(key)) return { ok: false, msg: 'You have no pending duel with them.' };
    initiator.ws.send(JSON.stringify({ t: 'msg', msg: `${p.name} declines your duel.` }));
    return { ok: true, msg: `You decline the duel.` };
  }

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
    p.ws.send(JSON.stringify({ t: 'msg', msg: `\n\x1b[1mMURDER!\x1b[0m The Crossing has issued a WARRANT for your arrest. Guards will seize you on sight. "recall warrant" to read it, or "surrender" to turn yourself in.` }));
    this.persistPlayer(p);
  }

  // A wanted player who walks past a guard is taken.
  pursueWarrant(p) {
    if (!p.warrant || !this.guardInRoom(p)) return;
    p.silver = Math.max(0, p.silver - Math.floor(p.silver * 0.3));
    p.jailUntil = Date.now() + 120 * 1000;
    p.room = 'jail';
    p.hidden = false;
    p.combatId = null;
    const combat = this.combat.getFor(p);
    if (combat) this.combat.disconnect(p);
    p.ws.send(JSON.stringify({ t: 'msg', msg: `\nA guard claps a hand on your shoulder. "${p.warrant.charge.toUpperCase()} — the warrant is read, the cell is ready."\nYou are dragged to the Town Cells, lighter by a third of your purse.` }));
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
    p.ws.send(JSON.stringify({ t: 'msg', msg: `\nYou raise your hands. A guard steps forward and reads the warrant — ${p.warrant.charge.toUpperCase()}. "Turned yourself in, eh? The judge will hear you soon enough."\nYou are taken to the Town Cells.` }));
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
      defender.ws.send(JSON.stringify({ t: 'combat', msg: `You have been defeated in a duel and wake in the Temple of the Pantheon, nursing your wounds.` }));
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
    let out = `\n\x1b[1m${room.name}\x1b[0m — ${zone.name}\n${room.desc}`;

    const npcs = (room.npcs || []).map(npcById).filter(Boolean);
    if (npcs.length) out += `\nHere: ${npcs.map((n) => n.name).join(', ')}.`;

    const creatures = this.creaturesIn(p.room);
    if (creatures.length) {
      const lines = creatures.map((c) => {
        const pct = c.hp / c.maxHp;
        const state = pct > 0.66 ? '' : pct > 0.33 ? ' — wounded' : ' — badly hurt';
        return `${cap(c.def.name)} is here${state}.`;
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
    if (exits.length) out += `\nObvious exits: ${exits.join(', ')}.`;

    p.ws.send(JSON.stringify({ t: 'room', msg: out, exits, roomId: p.room }));
  }

  // ---------- Justice ----------
  guardInRoom(p) {
    const room = roomById(p.room);
    return Boolean(room && room.npcs && room.npcs.includes('guard'));
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
    p.ws.send(JSON.stringify({ t: 'msg', msg: `\nA guard seizes your arm! "Caught red-handed, thief."\nYou are dragged to the Town Cells. ${taken} silvers are confiscated.\nType "plead guilty" to pay your fine, or "plead innocent" to wait for the judge.` }));
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
  partyInvite(p, targetName) {
    if (p.combatId) return { ok: false, msg: 'Not in the middle of a fight.' };
    const target = [...this.players.values()].find((o) => o !== p && o.room === p.room && o.name.toLowerCase() === (targetName || '').toLowerCase());
    if (!target) return { ok: false, msg: 'There is no such adventurer here.' };
    if (target.party) return { ok: false, msg: `${target.name} is already in a party.` };
    target.pendingParty = p.charId;
    target.ws.send(JSON.stringify({ t: 'msg', msg: `\n${p.name} asks you to join their party. Type "party join" to accept.` }));
    return { ok: true, msg: `${target.name} has been asked. They can "party join" to accept.` };
  }

  partyJoin(p) {
    const leaderId = p.pendingParty;
    if (!leaderId) return { ok: false, msg: 'You have no pending party invitation.' };
    const leader = this.players.get(leaderId);
    if (!leader || leader.party && leader.party.members.length >= 5) {
      return { ok: false, msg: 'The invitation has lapsed or the party is full.' };
    }
    const id = leader.party ? leader.party.id : `party_${leaderId}_${Date.now()}`;
    const members = leader.party ? [...leader.party.members] : [leaderId];
    if (members.length >= 5) return { ok: false, msg: 'The party is full (5).' };
    members.push(p.charId);
    const party = { id, leader: leaderId, members };
    leader.party = party;
    p.party = party;
    p.pendingParty = null;
    for (const mid of members) {
      const m = this.players.get(mid);
      if (m) m.party = party;
    }
    return { ok: true, msg: `You join ${leader.name}'s party. Hunt credit is shared in the same room.` };
  }

  partyLeave(p) {
    if (!p.party) return { ok: false, msg: 'You are not in a party.' };
    const id = p.party.id;
    const leader = this.players.get(p.party.leader);
    const members = (leader && leader.party && leader.party.id === id ? leader.party.members : []).filter((m) => m !== p.charId);
    if (leader && leader.party && leader.party.id === id) {
      if (members.length <= 1) leader.party = null;
      else leader.party = { id, leader: leader.charId, members };
    }
    p.party = null;
    for (const mid of members) {
      const m = this.players.get(mid);
      if (m) m.party = leader && leader.party ? leader.party : null;
    }
    return { ok: true, msg: 'You leave the party.' };
  }

  partyStatus(p) {
    if (!p.party) return { ok: false, msg: 'You are not in a party. "party <playername>" to invite, "party join" to accept.' };
    const names = p.party.members.map((mid) => {
      const m = this.players.get(mid);
      return m ? m.name : '?';
    });
    return { ok: true, msg: `\nParty (${names.length}/5): ${names.join(', ')}. Kill credit and quest progress are shared in the same room.` };
  }

  guildTrainer(p) { return statusView.guildTrainer(p); }
  status(p) { statusView.status(this, p); }
  who() { return statusView.who(this); }
}
