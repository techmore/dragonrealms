// Wilds: foraging, tracking, hunting, rest, the warhorn, and looking into
// adjacent rooms.
import { ROOMS, ZONES, roomById } from '../data/world.js';
import { creatureById } from '../data/creatures.js';
import { itemById } from '../data/items.js';
import { skillRank, gainSkillExp, addItem, unlockAchievement } from './player.js';
import { clotTick } from './wounds.js';
import { cap, pad } from './util.js';

const DIRS = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down', up: 'up', down: 'down',
};

const WILD_ZONES = new Set(['woods', 'marsh', 'deepwoods', 'camp', 'sewers']);

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
    const chance = 0.35 + skill * 0.03 + p.stats.wis * 0.004 + (p.element === 'air' ? 0.05 : 0) + (game.weatherLuckMod ? game.weatherLuckMod() : 0);
    if (Math.random() >= chance) {
      const leveled = gainSkillExp(p, 'foraging', 3);
      return { ok: true, msg: `You comb the ground but find nothing useful.${leveled ? ' Your Foraging improved!' : ''}` };
    }
    const pool = ['stick', 'stick', 'branch', 'herb_mint', 'herb_mint', 'herb_root', 'herb_root'];
    const roll = Math.random();
    const itemId = roll < 0.02 ? 'potion_heal' : pool[Math.floor(Math.random() * pool.length)];
    addItem(p, itemId, 1);
    const leveled = gainSkillExp(p, 'foraging', 8);
    const item = itemById(itemId);
    return { ok: true, msg: `You find ${item.name} growing here and tuck it into your pack.${leveled ? ' Your Foraging improved!' : ''}` };
  },

  track(game, p) {
    if (!this.isWild(p.room)) return { ok: false, msg: 'There is nothing to track in town.' };
    if (p.guild.id === 'ranger') gainSkillExp(p, 'scouting', 4);
    // Scouting ranks sharpen a ranger's eye: track success scales with rank.
    const scoutEye = p.guild.id === 'ranger' ? skillRank(p, 'scouting') * 0.005 : 0;
    const skill = skillRank(p, 'tracking');
    const room = roomById(p.room);
    const chance = 0.4 + skill * 0.04 + scoutEye + (p.element === 'air' ? 0.05 : 0) + (game.weatherLuckMod ? game.weatherLuckMod() : 0);
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
    const chance = 0.4 + skill * 0.04 + (p.element === 'air' ? 0.05 : 0) + (game.weatherLuckMod ? game.weatherLuckMod() : 0);
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
  // what each kind of prey yields (gems, coin, boxes, skins). With 'province'
  // the zones group under their province (the Crossing lands vs Riverhaven);
  // with 'city' the grounds group by which town they hang from.
  // Specialized views filter by creature kind or loot tag (LADDER_FILTERS).
  ladder(filter = null) {
    const LADDER_FILTERS = {
      undead: (d) => (d.kinds || []).includes('undead'),
      construct: (d) => (d.kinds || []).includes('construct'),
      beast: (d) => (d.kinds || []).includes('beast'),
      humanoid: (d) => (d.kinds || []).includes('humanoid'),
      spirit: (d) => (d.kinds || []).includes('spirit'),
      skins: (d) => (d.lootTags || []).includes('skins'),
      boxes: (d) => (d.lootTags || []).includes('box'),
    };
    const TAG_NAMES = { skins: 'skins', gems: 'gems', coin: 'coin', box: 'boxes', named: 'rare loot' };
    const PROVINCES = {
      crossing: ['sewers', 'woods', 'marsh', 'deepwoods', 'camp', 'cinder', 'blackwood'],
      riverhaven: ['riverhaven'],
    };
    const CITY_ZONES = {
      'the Crossing': ['sewers', 'woods', 'marsh', 'deepwoods', 'camp', 'cinder', 'blackwood'],
      Riverhaven: ['riverhaven'],
    };
    const kindFilter = LADDER_FILTERS[filter];
    const groups = {};
    for (const [zoneId, zone] of Object.entries(ZONES)) {
      if (!kindFilter && filter === 'province') {
        const prov = Object.entries(PROVINCES).find(([, zones]) => zones.includes(zoneId))?.[0] || 'crossing';
        (groups[prov] ||= []).push([zoneId, zone]);
      } else if (!kindFilter && filter === 'city') {
        const city = Object.entries(CITY_ZONES).find(([, zones]) => zones.includes(zoneId))?.[0] || 'the Crossing';
        (groups[city] ||= []).push([zoneId, zone]);
      } else {
        (groups[zoneId] ||= []).push([zoneId, zone]);
      }
    }
    const rows = [];
    for (const [gid, zones] of Object.entries(groups)) {
      const creatures = {};
      for (const [zoneId, zone] of zones) {
        for (const room of Object.values(ROOMS)) {
          if (room.zone !== zoneId) continue;
          for (const defId of room.spawns || []) {
            const def = creatureById(defId);
            if (def && !creatures[def.id]) {
              if (kindFilter && !kindFilter(def)) continue;
              const tags = (def.lootTags || []).map((t) => TAG_NAMES[t] || t).join(', ');
              creatures[def.id] = `${def.teaches ? `teaches ${def.teaches[0]}–${def.teaches[1]}` : `circle ${def.circle}`}${tags ? ` · drops: ${tags}` : ''}`;
            }
          }
        }
      }
      const entries = Object.entries(creatures);
      if (entries.length) {
        const label = !kindFilter && filter === 'province' && gid === 'crossing' ? 'Crossing lands' : gid === 'riverhaven' ? 'Riverhaven' : ZONES[gid]?.name || gid;
        rows.push(`\x1b[1m${label}\x1b[0m`);
        for (const [id, t] of entries) rows.push(`  ${pad(creatureById(id).name.replace(/^a /, ''), 26)} ${t}`);
      }
    }
    if (kindFilter) {
      // Flat, rank-sorted view for the specialized ladders.
      const flat = [];
      for (const [zoneId, zone] of Object.entries(ZONES)) {
        for (const room of Object.values(ROOMS)) {
          if (room.zone !== zoneId) continue;
          for (const defId of room.spawns || []) {
            const def = creatureById(defId);
            if (def && kindFilter(def) && !flat.some(([id]) => id === def.id)) {
              const tags = (def.lootTags || []).map((t) => TAG_NAMES[t] || t).join(', ');
              flat.push([def.id, `${def.teaches ? `teaches ${def.teaches[0]}–${def.teaches[1]}` : `circle ${def.circle}`}${tags ? ` · drops: ${tags}` : ''}`, def.teaches ? def.teaches[0] : def.circle * 4]);
            }
          }
        }
      }
      flat.sort((x, y) => x[2] - y[2]);
      if (!flat.length) return 'No creatures match that ladder yet. Try "ladder" for the full list.';
      const body = flat.map(([id, t]) => `  ${pad(creatureById(id).name.replace(/^a /, ''), 26)} ${t}`).join('\n');
      return `\nHunting ladder — ${filter}:\n${body}\n\n("ladder" alone lists every zone; also "ladder skins|boxes|beast|humanoid|spirit|construct")`;
    }
    return rows.length ? `\nHunting ladder (skill ranks a creature teaches best):\n${rows.join('\n')}${filter ? '\n\n("ladder" alone lists every zone)' : ''}` : 'The hunting grounds are empty.';
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
    // Taverns and inns ease the body: rest comes faster under a roof.
    // Earth-attuned warrior mages are steadied by the ground itself.
    const room = roomById(p.room);
    const restful = Boolean(room && room.tavern);
    const earthBonus = p.element === 'earth' ? 1.25 : 1;
    let ticks = 0;
    p.resting = true;
    p.restTimer = setInterval(() => {
      ticks += 1;
      if (p.combatId || p.room !== p.restRoom) { wilds.stopRest(p); return; }
      // Agent boost multiplies recovery for speed-run test sessions.
      const bm = Number(p.boostMult) || 1;
      const hpGain = (restful ? Math.max(4, Math.floor(p.maxHp * 0.045)) : Math.max(2, Math.floor(p.maxHp * 0.025 * earthBonus))) * bm;
      p.hp = Math.min(p.maxHp, p.hp + hpGain);
      if (p.guild.magic) p.mana = Math.min(p.maxMana, p.mana + Math.max(2, Math.floor(p.maxMana * (restful ? 0.07 : 0.04 * earthBonus))) * bm);
      p.stamina = Math.min(p.maxStaminaEff, (p.stamina || 0) + (restful ? 9 : 6) * bm);
      gainSkillExp(p, 'athletics', 2);
      // Rest clots bleeding wounds: tended ones resolve, untended slow down.
      if (ticks % 3 === 0 && Array.isArray(p.wounds)) {
        for (const w of p.wounds) { w.tended = true; w.since = Date.now() - 120 * 1000; }
        clotTick(p.wounds, false);
        p.wounds = p.wounds.filter((w) => !w.resolved);
      }
      if (ticks % 10 === 0) p.rexp = Math.min(120, (p.rexp || 0) + 1);
      p.ws.send(JSON.stringify({ t: 'msg', msg: `You rest... hp ${p.hp}/${p.maxHp}${p.guild.magic ? `, mana ${p.mana}/${p.maxMana}` : ''}, stamina ${p.stamina}/${p.maxStaminaEff}${restful ? ' (warm and dry)' : ''}` }));
      if (p.hp >= p.maxHp && (!p.guild.magic || p.mana >= p.maxMana) && p.stamina >= p.maxStaminaEff) wilds.stopRest(p);
      if (ticks >= 20) wilds.stopRest(p);
    }, 2000);
    p.restTimer.unref();
    p.restRoom = p.room;
    return { ok: true, msg: restful ? 'You settle into a bench by the hearth. Rest comes easily here.' : 'You settle down to rest and recover.' };
  },

  // The Middens: the town junkyard. Scavenging turns Appraisal and luck
  // into stray coin and odd treasures.
  scavenge(game, p) {
    if (p.room !== 'middens') return { ok: false, msg: 'There is nowhere to scavenge here. The Middens lie south of the East Road.' };
    if (p.scavengeAt && Date.now() - p.scavengeAt < 15 * 1000) {
      const secs = Math.ceil((15 * 1000 - (Date.now() - p.scavengeAt)) / 1000);
      return { ok: false, msg: `You have already picked this heap over (${secs}s).` };
    }
    p.scavengeAt = Date.now();
    const skill = skillRank(p, 'appraisal');
    const chance = 0.25 + skill * 0.03 + p.stats.wis * 0.004 + (p.patron === 'fortune' ? 0.1 : 0) + (game.weatherLuckMod ? game.weatherLuckMod() : 0);
    const leveled = gainSkillExp(p, 'appraisal', 6);
    if (Math.random() >= chance) {
      return { ok: true, msg: `You poke through the refuse and find nothing worth keeping.${leveled ? ' Your Appraisal improved!' : ''}` };
    }
    const roll = Math.random();
    let found;
    if (roll < 0.02) found = { item: 'diamond', qty: 1, text: 'buried under a rusted kettle, a diamond catches the light!' };
    else if (roll < 0.1) found = { item: 'garnet', qty: 1, text: 'among the shards you find a blood garnet.' };
    else if (roll < 0.3) found = { item: 'iron_ore', qty: 1, text: 'a lump of iron ore, half-buried in ash.' };
    else if (roll < 0.5) found = { item: 'herb_root', qty: 1, text: 'a bitter root growing through the refuse.' };
    else found = { item: 'iron_ring', qty: 1, text: 'a bent iron ring, still worth a coin or two.' };
    addItem(p, found.item, found.qty);
    unlockAchievement(p, 'scavenger');
    return { ok: true, msg: `You sort through the heaps — ${found.text}${leveled ? ' Your Appraisal improved!' : ''}` };
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
