// Runtime world manager: player presence, creature spawns, movement, look,
// shops, banking, healing, and the combat manager ticker.
import { ROOMS, ZONES, roomById } from '../data/world.js';
import { npcById } from '../data/npcs.js';
import { creatureById, RARES } from '../data/creatures.js';
import { guildById } from '../data/guilds.js';
import { ITEMS, itemById } from '../data/items.js';
import { SKILLS } from '../data/skills.js';
import { bankRexp } from './player.js';
import { manaRegenRate } from '../data/mana.js';
import { VOICE_POOL } from '../data/abilities.js';
import {
  savePlayer, addItem, removeItem, unequipItem, skillRank, gainSkillExp, weaponOf, countItems,
} from './player.js';
import { CombatManager } from './combat.js';

const RESPAWN_MS = 25 * 1000;
const MANA_PULSE_MS = 6 * 1000;
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

export class Game {
  constructor() {
    this.players = new Map();      // charId -> player runtime
    this.roomCreatures = new Map(); // roomId -> [{uid, def, hp, maxHp, alive, respawnAt}]
    this.floorItems = new Map();    // roomId -> [{uid, item, qty}]
    this.pendingDuels = new Map();  // `${initiator}|${target}` -> {initiator, target, createdAt}
    this.combat = new CombatManager(this);
    this.respawnTicker = null;
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
    this.autosaveTicker = setInterval(() => {
      for (const p of this.players.values()) {
        try { savePlayer(p); } catch (e) { console.error('autosave error', e); }
      }
    }, 60 * 1000);
    this.autosaveTicker.unref();
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
      const rate = manaRegenRate(p.guild.id) * Math.min(2.5, 0.5 + skillRank(p, 'attunement') * 0.005);
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
    for (const insts of this.roomCreatures.values()) {
      for (const c of insts) {
        if (!c.alive && c.respawnAt && c.respawnAt <= now) {
          c.alive = true;
          c.hp = c.maxHp;
          c.respawnAt = 0;
        }
      }
    }
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
      p.jailUntil = 0;
    }
    this.stopRest(p);
    p.hidden = false;
    p.room = target;
    if (this.isWild(target)) gainSkillExp(p, 'athletics', 1);
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
    return Boolean(room && room.zone !== 'town');
  }

  challengeDuel(p, targetName, end = 'blood') {
    if (!this.canDuelHere(p)) return { ok: false, msg: 'The town guards do not permit duels here. Take it to the wilds.' };
    if (p.combatId) return { ok: false, msg: 'You are already in combat.' };
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

  // ---------- Shops ----------
  shopNpcsIn(p) {
    const room = roomById(p.room);
    return (room.npcs || []).map(npcById).filter((n) => n && n.role === 'shop');
  }

  listShop(p) {
    const shops = this.shopNpcsIn(p);
    if (!shops.length) return { ok: false, msg: 'There is no shopkeeper here.' };
    const blocks = shops.map((shop) => {
      const rows = Object.entries(shop.stock).map(([id, qty]) => {
        const it = itemById(id);
        if (!it) return null;
        return `${pad(it.name, 30)} ${pad(weaponString(it), 8)} ${pad(`${it.value} silvers`, 14)} ${qty} in stock`;
      }).filter(Boolean);
      return `${shop.name}\n${rows.join('\n')}`;
    });
    return { ok: true, msg: `\n${blocks.join('\n\n')}\n\nSay "buy <item>" to purchase. Some vendors also buy hides and skins.` };
  }

  buy(p, itemName, qty = 1) {
    qty = Math.max(1, Math.min(100, Math.floor(qty) || 1));
    const shops = this.shopNpcsIn(p);
    if (!shops.length) return { ok: false, msg: 'There is no shopkeeper here.' };
    const target = shops
      .flatMap((shop) => Object.entries(shop.stock).map(([id, q]) => ({ shop, item: itemById(id), q })))
      .find((e) => e.item && (e.item.id === itemName || e.item.name.includes(itemName)));
    if (!target) return { ok: false, msg: 'They do not sell that here.' };
    if (target.q < qty) return { ok: false, msg: 'They do not have that many in stock.' };
    const cost = target.item.value * qty;
    if (p.silver < cost) return { ok: false, msg: `You cannot afford ${cost} silvers.` };
    p.silver -= cost;
    addItem(p, target.item.id, qty);
    target.q -= qty;
    return { ok: true, msg: `You buy ${qty > 1 ? `${qty}x ` : ''}${target.item.name} for ${cost} silvers.` };
  }

  sell(p, itemName, qty = 1) {
    qty = Math.max(1, Math.min(100, Math.floor(qty) || 1));
    const shops = this.shopNpcsIn(p);
    if (!shops.length) return { ok: false, msg: 'There is no shopkeeper here.' };
    const item = itemById(itemName) || Object.values(ITEMS).find((i) => i.name.includes(itemName));
    if (!item) return { ok: false, msg: 'You do not have that.' };
    const willing = shops.find((shop) => shop.buys.includes(item.id));
    if (!willing) return { ok: false, msg: 'No one here is interested in buying that.' };
    const have = countItems(p, item.id);
    if (have < qty) return { ok: false, msg: 'You do not have that many.' };
    const mult = p.circle >= 10 && p.guild.id === 'trader' ? 1.25 : 1;
    const price = Math.floor(item.value * 0.5 * mult) * qty;
    removeItem(p, item.id, qty);
    p.silver += price;
    gainSkillExp(p, 'trading', 4);
    return { ok: true, msg: `You sell ${qty > 1 ? `${qty}x ` : ''}${item.name} to ${willing.name} for ${price} silvers.${mult > 1 ? ' (Golden Touch!)' : ''}` };
  }

  // ---------- Bank ----------
  bankerIn(p) {
    const room = roomById(p.room);
    return (room.npcs || []).map(npcById).find((n) => n && n.role === 'bank');
  }

  deposit(p, amt) {
    if (!this.bankerIn(p)) return { ok: false, msg: 'There is no banker here.' };
    amt = Math.max(1, Math.floor(amt));
    if (p.silver < amt) return { ok: false, msg: 'You do not have that many silvers.' };
    p.silver -= amt;
    p.bank += amt;
    return { ok: true, msg: `You deposit ${amt} silvers. Your bank holds ${p.bank}.` };
  }

  withdraw(p, amt) {
    if (!this.bankerIn(p)) return { ok: false, msg: 'There is no banker here.' };
    amt = Math.max(1, Math.floor(amt));
    if (p.bank < amt) return { ok: false, msg: 'Your bank does not hold that much.' };
    p.bank -= amt;
    p.silver += amt;
    return { ok: true, msg: `You withdraw ${amt} silvers.` };
  }

  // ---------- Healer ----------
  healerIn(p) {
    const room = roomById(p.room);
    return (room.npcs || []).map(npcById).find((n) => n && n.role === 'healer');
  }

  heal(p) {
    if (!this.healerIn(p)) return { ok: false, msg: 'There is no healer here.' };
    const cost = Math.max(5, Math.floor((p.maxHp - p.hp) * 0.1));
    if (p.silver < cost) return { ok: false, msg: `The healer wants ${cost} silvers and you have ${p.silver}.` };
    if (p.hp >= p.maxHp) return { ok: false, msg: 'You are already in full health.' };
    p.silver -= cost;
    p.hp = p.maxHp;
    if (p.guild.magic) p.mana = p.maxMana;
    return { ok: true, msg: `Sister Cora closes her eyes and channels warmth through your body. You are restored for ${cost} silvers.` };
  }

  // ---------- World skills ----------
  WILD_ZONES = new Set(['woods', 'marsh', 'deepwoods', 'camp', 'sewers']);

  isWild(roomId) {
    const room = roomById(roomId);
    return room ? this.WILD_ZONES.has(room.zone) : false;
  }

  zoneName(roomId) {
    const room = roomById(roomId);
    return room && ZONES[room.zone] ? ZONES[room.zone].name : 'wilds';
  }

  forage(p) {
    if (!this.isWild(p.room)) return { ok: false, msg: 'You find nothing worth foraging here. Try the wilds.' };
    const skill = skillRank(p, 'foraging');
    const chance = 0.35 + skill * 0.03 + p.stats.wis * 0.004;
    if (Math.random() >= chance) {
      const leveled = gainSkillExp(p, 'foraging', 3);
      return { ok: true, msg: `You comb the ground but find nothing useful.${leveled ? ' Your Foraging improved!' : ''}` };
    }
    const pool = ['herb_mint', 'herb_mint', 'herb_root', 'herb_root', 'potion_heal'];
    const roll = Math.random();
    const itemId = roll < 0.02 ? 'potion_heal' : pool[Math.floor(Math.random() * 3)];
    addItem(p, itemId, 1);
    const leveled = gainSkillExp(p, 'foraging', 8);
    const item = itemById(itemId);
    return { ok: true, msg: `You find ${item.name} growing here and tuck it into your pack.${leveled ? ' Your Foraging improved!' : ''}` };
  }

  track(p) {
    if (!this.isWild(p.room)) return { ok: false, msg: 'There is nothing to track in town.' };
    if (p.guild.id === 'ranger') gainSkillExp(p, 'scouting', 4);
    const skill = skillRank(p, 'tracking');
    const room = roomById(p.room);
    const chance = 0.4 + skill * 0.04;
    if (Math.random() >= chance) {
      gainSkillExp(p, 'tracking', 3);
      return { ok: true, msg: 'You study the ground but the signs are too faint to follow.' };
    }
    const lines = [];
    for (const [rid, r] of Object.entries(ROOMS)) {
      if (r.zone !== room.zone) continue;
      const creatures = this.creaturesIn(rid);
      if (!creatures.length) continue;
      const desc = creatures.map((c) => cap(c.def.name)).join(', ');
      lines.push(`  ${r.name}: ${desc}`);
    }
    const leveled = gainSkillExp(p, 'tracking', 6);
    if (!lines.length) return { ok: true, msg: `The ${ZONES[room.zone].name} is quiet. No tracks to follow.` };
    return { ok: true, msg: `\nYou read the signs of the ${ZONES[room.zone].name}:\n${lines.join('\n')}${leveled ? '\nYour Tracking improved!' : ''}` };
  }

  hunt(p) {
    if (!this.isWild(p.room)) return { ok: false, msg: 'There is nothing to hunt in town. Try the wilds.' };
    if (p.guild.id === 'ranger') gainSkillExp(p, 'scouting', 4);
    const skill = skillRank(p, 'perception');
    const room = roomById(p.room);
    const chance = 0.4 + skill * 0.04;
    if (Math.random() >= chance) {
      const leveled = gainSkillExp(p, 'perception', 3);
      return { ok: true, msg: `You scan the wilds but catch no sign of prey.${leveled ? ' Your Perception improved!' : ''}` };
    }
    const lines = [];
    for (const [rid, r] of Object.entries(ROOMS)) {
      if (r.zone !== room.zone) continue;
      const creatures = this.creaturesIn(rid);
      if (!creatures.length) continue;
      const desc = creatures.map((c) => cap(c.def.name)).join(', ');
      lines.push(`  ${r.name}: ${desc}`);
    }
    const leveled = gainSkillExp(p, 'perception', 6);
    if (!lines.length) return { ok: true, msg: `The ${ZONES[room.zone].name} is quiet. Nothing moves.` };
    return { ok: true, msg: `\nYou hunt the ${ZONES[room.zone].name} and catch the signs:\n${lines.join('\n')}${leveled ? '\nYour Perception improved!' : ''}` };
  }

  // Hunting ladder: every creature teaches within a rank band; the zones are
  // ordered by that band so you can see where to move next.
  ladder() {
    const rows = [];
    for (const [zoneId, zone] of Object.entries(ZONES)) {
      const creatures = {};
      for (const room of Object.values(ROOMS)) {
        if (room.zone !== zoneId) continue;
        for (const defId of room.spawns || []) {
          const def = creatureById(defId);
          if (def && !creatures[def.id]) {
            creatures[def.id] = def.teaches ? `teaches ${def.teaches[0]}–${def.teaches[1]}` : `circle ${def.circle}`;
          }
        }
      }
      const entries = Object.entries(creatures);
      if (entries.length) {
        rows.push(`\x1b[1m${zone.name}\x1b[0m`);
        for (const [id, t] of entries) rows.push(`  ${pad(creatureById(id).name.replace(/^a /, ''), 24)} ${t}`);
      }
    }
    return rows.length ? `\nHunting ladder (skill ranks a creature teaches best):\n${rows.join('\n')}` : 'The hunting grounds are empty.';
  }

  // Blowing a warhorn calls beasts to the room (15-minute timer).
  warhorn(p) {
    const cd = 15 * 60 * 1000;
    if (p.warhornAt && Date.now() - p.warhornAt < cd) {
      const mins = Math.ceil((cd - (Date.now() - p.warhornAt)) / 60000);
      return { ok: false, msg: `The warhorn echoes are still settling (${mins} min).` };
    }
    const room = roomById(p.room);
    if (!room || !room.spawns || !room.spawns.length) {
      return { ok: false, msg: 'The warhorn bellows uselessly — no beasts stir here.' };
    }
    p.warhornAt = Date.now();
    const insts = this.roomCreatures.get(p.room) || [];
    for (const defId of room.spawns.slice(0, 2)) {
      const def = creatureById(defId);
      if (def) insts.push(this.makeCreature(def));
    }
    return { ok: true, msg: 'You raise the warhorn — a deep, hungry bellow rolls across the land, and beasts answer it!' };
  }

  startRest(p) {    if (p.combatId) return { ok: false, msg: 'You cannot rest in the middle of a fight!' };
    if (p.restTimer) return { ok: false, msg: 'You are already resting.' };
    let ticks = 0;
    p.resting = true;
    p.restTimer = setInterval(() => {
      ticks += 1;
      if (p.combatId || p.room !== p.restRoom) { this.stopRest(p); return; }
      const hpGain = Math.max(2, Math.floor(p.maxHp * 0.025));
      p.hp = Math.min(p.maxHp, p.hp + hpGain);
      if (p.guild.magic) p.mana = Math.min(p.maxMana, p.mana + Math.max(2, Math.floor(p.maxMana * 0.04)));
      gainSkillExp(p, 'athletics', 2);
      if (ticks % 10 === 0) p.rexp = Math.min(120, (p.rexp || 0) + 1);
      p.ws.send(JSON.stringify({ t: 'msg', msg: `You rest... hp ${p.hp}/${p.maxHp}${p.guild.magic ? `, mana ${p.mana}/${p.maxMana}` : ''}` }));
      if (p.hp >= p.maxHp && (!p.guild.magic || p.mana >= p.maxMana)) this.stopRest(p);
      if (ticks >= 20) this.stopRest(p);
    }, 2000);
    p.restTimer.unref();
    p.restRoom = p.room;
    return { ok: true, msg: 'You settle down to rest and recover.' };
  }

  stopRest(p) {
    if (p.restTimer) { clearInterval(p.restTimer); p.restTimer = null; }
    if (p.resting) { p.resting = false; p.ws.send(JSON.stringify({ t: 'msg', msg: 'You rise, feeling more yourself.' })); }
  }

  lookDirection(p, dir) {
    const room = roomById(p.room);
    const target = room && resolveExit(room, dir);
    if (!target) return { ok: false, msg: 'You cannot see that way.' };
    const tr = roomById(target);
    const creatures = this.creaturesIn(target);
    const players = [...this.players.values()].filter((o) => o !== p && o.room === target);
    const bits = [];
    if (creatures.length) bits.push(`${creatures.map((c) => cap(c.def.name)).join(' and ')} ${creatures.length === 1 ? 'is' : 'are'} there`);
    if (players.length) bits.push(`${players.map((o) => o.name).join(', ')} ${players.length === 1 ? 'is' : 'are'} there`);
    const suffix = bits.length ? ` — ${bits.join('; ')}.` : '';
    return { ok: true, msg: `You peer ${DIRS[dir]} into ${tr.name}: ${tr.desc}${suffix}` };
  }

  // ---------- Quests ----------
  hasCrier(p) {
    const room = roomById(p.room);
    return Boolean(room && room.npcs && room.npcs.includes('towncrier'));
  }

  questCreatureFor(p) {
    const tiers = [
      { upTo: 2, pool: ['rat', 'kobold'] },
      { upTo: 4, pool: ['goblin', 'wolf'] },
      { upTo: 99, pool: ['wisp', 'bandit', 'troll'] },
    ];
    const tier = tiers.find((t) => p.circle <= t.upTo);
    const pool = tier ? tier.pool : ['rat'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  assignQuest(p, source = 'crier') {
    const id = this.questCreatureFor(p);
    p.quest = { creatureId: id, count: Math.min(3 + p.circle, 8), done: false, source };
    this.persistPlayer(p);
    return p.quest;
  }

  questKill(p, creatureId) {
    if (!p.quest || p.quest.done || p.quest.creatureId !== creatureId) return;
    p.quest.count -= 1;
    if (p.quest.count <= 0) {
      p.quest.count = 0;
      p.quest.done = true;
      gainSkillExp(p, 'perception', 10);
      gainSkillExp(p, 'fitness', 10);
      this.persistPlayer(p);
      p.ws.send(JSON.stringify({ t: 'msg', msg: `\n\x1b[1mQuest complete!\x1b[0m Return to the town crier and say "claim" to collect your reward.` }));
    } else {
      this.persistPlayer(p);
    }
  }

  questClaim(p) {
    if (!p.quest) return { ok: false, msg: 'You have no quest. Ask the crier or your guild leader for work.' };
    if (!p.quest.done) {
      return { ok: false, msg: `Your quest is not finished. Slay ${p.quest.count} more to complete it.` };
    }
    const def = creatureById(p.quest.creatureId);
    const silver = 40 + (def ? def.circle * 35 : 40);
    p.silver += silver;
    const fromLeader = p.quest.source === 'leader';
    if (fromLeader && p.guild.guildSkill && SKILLS[p.guild.guildSkill]) gainSkillExp(p, p.guild.guildSkill, 20);
    p.quest = null;
    this.persistPlayer(p);
    return fromLeader
      ? { ok: true, msg: `Your guild leader nods. "Work well done." You pocket ${silver} silvers and your ${SKILLS[p.guild.guildSkill].name} sharpens.` }
      : { ok: true, msg: `The crier hands you ${silver} silvers. "Good hunting," he says with a grin.` };
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

  // ---------- Status / prompt ----------
  guildTrainer(p) {
    const room = roomById(p.room);
    if (!room) return null;
    for (const npcId of room.npcs || []) {
      const npc = npcById(npcId);
      if (npc && npc.role === 'guild' && npc.guild === p.guild.id) return npc;
    }
    return null;
  }

  status(p) {
    const hp = p.hp > 0 ? p.hp : 0;
    const inCombat = this.combat.getFor(p) ? '[COMBAT]' : '';
    const prep = p.prepared ? `  [prepared: ${p.prepared.spellId} @ ${p.prepared.pct}%]` : '';
    const res = p.guild.magic
      ? `\x1b[33mMana: ${p.mana}/${p.maxMana}\x1b[0m`
      : p.guild.id === 'barbarian'
        ? `\x1b[31mFire: ${p.innerFire}/${p.maxInnerFire}\x1b[0m`
        : '';
    p.ws.send(JSON.stringify({
      t: 'prompt',
      msg: `\n\x1b[36mHP: ${hp}/${p.maxHp}\x1b[0m  ${res}  \x1b[35mCircle ${p.circle}\x1b[0m  ${p.silver} silvers ${inCombat}${prep}\n> `,
    }));
  }

  // ---------- Misc ----------
  who() {
    return [...this.players.values()].map((p) => `${p.name} (${p.race.name} ${guildTitle(p.guild, p.circle)}, circle ${p.circle})`);
  }}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function weaponString(item) {
  if (item.type !== 'weapon') return '';
  return `${item.dmg[0]}-${item.dmg[1]}`;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
