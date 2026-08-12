// Wilds: foraging, tracking, hunting, rest, the warhorn, and looking into
// adjacent rooms.
import { ROOMS, ZONES, roomById } from '../data/world.js';
import { creatureById } from '../data/creatures.js';
import { itemById } from '../data/items.js';
import { skillRank, gainSkillExp, addItem } from './player.js';

const DIRS = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down', up: 'up', down: 'down',
};

const WILD_ZONES = new Set(['woods', 'marsh', 'deepwoods', 'camp', 'sewers']);

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export const wilds = {
  isWild(roomId) {
    const room = roomById(roomId);
    return room ? WILD_ZONES.has(room.zone) : false;
  },

  zoneName(roomId) {
    const room = roomById(roomId);
    return room && ZONES[room.zone] ? ZONES[room.zone].name : 'wilds';
  },

  forage(game, p) {
    if (!this.isWild(p.room)) return { ok: false, msg: 'You find nothing worth foraging here. Try the wilds.' };
    const skill = skillRank(p, 'foraging');
    const chance = 0.35 + skill * 0.03 + p.stats.wis * 0.004 + (game.weatherLuckMod ? game.weatherLuckMod() : 0);
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
  },

  track(game, p) {
    if (!this.isWild(p.room)) return { ok: false, msg: 'There is nothing to track in town.' };
    if (p.guild.id === 'ranger') gainSkillExp(p, 'scouting', 4);
    const skill = skillRank(p, 'tracking');
    const room = roomById(p.room);
    const chance = 0.4 + skill * 0.04 + (game.weatherLuckMod ? game.weatherLuckMod() : 0);
    if (Math.random() >= chance) {
      gainSkillExp(p, 'tracking', 3);
      return { ok: true, msg: 'You study the ground but the signs are too faint to follow.' };
    }
    const lines = [];
    for (const [rid, r] of Object.entries(ROOMS)) {
      if (r.zone !== room.zone) continue;
      const creatures = game.creaturesIn(rid);
      if (!creatures.length) continue;
      const desc = creatures.map((c) => cap(c.def.name)).join(', ');
      lines.push(`  ${r.name}: ${desc}`);
    }
    const leveled = gainSkillExp(p, 'tracking', 6);
    if (!lines.length) return { ok: true, msg: `The ${ZONES[room.zone].name} is quiet. No tracks to follow.` };
    return { ok: true, msg: `\nYou read the signs of the ${ZONES[room.zone].name}:\n${lines.join('\n')}${leveled ? '\nYour Tracking improved!' : ''}` };
  },

  hunt(game, p) {
    if (!this.isWild(p.room)) return { ok: false, msg: 'There is nothing to hunt in town. Try the wilds.' };
    if (p.guild.id === 'ranger') gainSkillExp(p, 'scouting', 4);
    const skill = skillRank(p, 'perception');
    const room = roomById(p.room);
    const chance = 0.4 + skill * 0.04 + (game.weatherLuckMod ? game.weatherLuckMod() : 0);
    if (Math.random() >= chance) {
      const leveled = gainSkillExp(p, 'perception', 3);
      return { ok: true, msg: `You scan the wilds but catch no sign of prey.${leveled ? ' Your Perception improved!' : ''}` };
    }
    const lines = [];
    for (const [rid, r] of Object.entries(ROOMS)) {
      if (r.zone !== room.zone) continue;
      const creatures = game.creaturesIn(rid);
      if (!creatures.length) continue;
      const desc = creatures.map((c) => cap(c.def.name)).join(', ');
      lines.push(`  ${r.name}: ${desc}`);
    }
    const leveled = gainSkillExp(p, 'perception', 6);
    if (!lines.length) return { ok: true, msg: `The ${ZONES[room.zone].name} is quiet. Nothing moves.` };
    return { ok: true, msg: `\nYou hunt the ${ZONES[room.zone].name} and catch the signs:\n${lines.join('\n')}${leveled ? '\nYour Perception improved!' : ''}` };
  },

  // Hunting ladder: every creature teaches within a rank band; the zones are
  // ordered by that band so you can see where to move next. Loot flags show
  // what each kind of prey yields (gems, coin, boxes, skins).
  ladder() {
    const TAG_NAMES = { skins: 'skins', gems: 'gems', coin: 'coin', box: 'boxes', named: 'rare loot' };
    const rows = [];
    for (const [zoneId, zone] of Object.entries(ZONES)) {
      const creatures = {};
      for (const room of Object.values(ROOMS)) {
        if (room.zone !== zoneId) continue;
        for (const defId of room.spawns || []) {
          const def = creatureById(defId);
          if (def && !creatures[def.id]) {
            const tags = (def.lootTags || []).map((t) => TAG_NAMES[t] || t).join(', ');
            creatures[def.id] = `${def.teaches ? `teaches ${def.teaches[0]}–${def.teaches[1]}` : `circle ${def.circle}`}${tags ? ` · drops: ${tags}` : ''}`;
          }
        }
      }
      const entries = Object.entries(creatures);
      if (entries.length) {
        rows.push(`\x1b[1m${zone.name}\x1b[0m`);
        for (const [id, t] of entries) rows.push(`  ${pad(creatureById(id).name.replace(/^a /, ''), 26)} ${t}`);
      }
    }
    return rows.length ? `\nHunting ladder (skill ranks a creature teaches best):\n${rows.join('\n')}` : 'The hunting grounds are empty.';
  },

  // Blowing a warhorn calls beasts to the room (15-minute timer).
  warhorn(game, p) {
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
    const insts = game.roomCreatures.get(p.room) || [];
    for (const defId of room.spawns.slice(0, 2)) {
      const def = creatureById(defId);
      if (def) insts.push(game.makeCreature(def));
    }
    return { ok: true, msg: 'You raise the warhorn — a deep, hungry bellow rolls across the land, and beasts answer it!' };
  },

  startRest(game, p) {
    if (p.combatId) return { ok: false, msg: 'You cannot rest in the middle of a fight!' };
    if (p.restTimer) return { ok: false, msg: 'You are already resting.' };
    let ticks = 0;
    p.resting = true;
    p.restTimer = setInterval(() => {
      ticks += 1;
      if (p.combatId || p.room !== p.restRoom) { wilds.stopRest(p); return; }
      const hpGain = Math.max(2, Math.floor(p.maxHp * 0.025));
      p.hp = Math.min(p.maxHp, p.hp + hpGain);
      if (p.guild.magic) p.mana = Math.min(p.maxMana, p.mana + Math.max(2, Math.floor(p.maxMana * 0.04)));
      p.stamina = Math.min(p.maxStaminaEff, (p.stamina || 0) + 6);
      gainSkillExp(p, 'athletics', 2);
      if (ticks % 10 === 0) p.rexp = Math.min(120, (p.rexp || 0) + 1);
      p.ws.send(JSON.stringify({ t: 'msg', msg: `You rest... hp ${p.hp}/${p.maxHp}${p.guild.magic ? `, mana ${p.mana}/${p.maxMana}` : ''}, stamina ${p.stamina}/${p.maxStaminaEff}` }));
      if (p.hp >= p.maxHp && (!p.guild.magic || p.mana >= p.maxMana) && p.stamina >= p.maxStaminaEff) wilds.stopRest(p);
      if (ticks >= 20) wilds.stopRest(p);
    }, 2000);
    p.restTimer.unref();
    p.restRoom = p.room;
    return { ok: true, msg: 'You settle down to rest and recover.' };
  },

  stopRest(p) {
    if (p.restTimer) { clearInterval(p.restTimer); p.restTimer = null; }
    if (p.resting) { p.resting = false; p.ws.send(JSON.stringify({ t: 'msg', msg: 'You rise, feeling more yourself.' })); }
  },

  lookDirection(game, p, dir) {
    const room = roomById(p.room);
    const target = room && (room.exits[dir] || ({ u: 'up', d: 'down' }[dir] && room.exits[{ u: 'up', d: 'down' }[dir]]));
    if (!target) return { ok: false, msg: 'You cannot see that way.' };
    const tr = roomById(target);
    const creatures = game.creaturesIn(target);
    const players = [...game.players.values()].filter((o) => o !== p && o.room === target);
    const bits = [];
    if (creatures.length) bits.push(`${creatures.map((c) => cap(c.def.name)).join(' and ')} ${creatures.length === 1 ? 'is' : 'are'} there`);
    if (players.length) bits.push(`${players.map((o) => o.name).join(', ')} ${players.length === 1 ? 'is' : 'are'} there`);
    const suffix = bits.length ? ` — ${bits.join('; ')}.` : '';
    return { ok: true, msg: `You peer ${DIRS[dir]} into ${tr.name}: ${tr.desc}${suffix}` };
  },
};
