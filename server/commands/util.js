// Shared helpers for command modules.
import { roomById } from '../../data/world.js';
import { SKILLS } from '../../data/skills.js';
import { ITEMS } from '../../data/items.js';
import { npcById } from '../../data/npcs.js';
import { maxStaminaFor, maxStaminaEff, sayRaw } from '../player.js';

export const STAT_FULL = {
  str: 'Strength', con: 'Constitution', ref: 'Reflex', agi: 'Agility',
  cha: 'Charisma', dis: 'Discipline', wis: 'Wisdom', int: 'Intelligence',
};

// DR spell-slot rates by guild magic tier (@150 circles): primary ~90,
// secondary ~66, tertiary ~60.
export const SLOT_RATES = {
  cleric: 90, moonmage: 90, warmage: 90,
  bard: 66, empath: 66, necromancer: 66,
  paladin: 60, ranger: 60, trader: 60,
};

export function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export function matchSkill(name) {
  const n = String(name).toLowerCase();
  const direct = SKILLS[n];
  if (direct) return n;
  const found = Object.entries(SKILLS).find(([id, def]) =>
    def.name.toLowerCase() === n || def.name.toLowerCase().includes(n));
  return found ? found[0] : null;
}

export function findNpcByName(p, name) {
  const room = roomById(p.room);
  const n = name.toLowerCase();
  return (room.npcs || []).map(npcById).find((x) => x && (x.id === n || x.name.toLowerCase().includes(n)));
}

export function findInventoryItem(p, name) {
  const n = name.toLowerCase();
  return p.inventory.find((e) => e.item.id === n || e.item.name.includes(n));
}

export function findSlotByItem(p, name) {
  const n = name.toLowerCase();
  return Object.entries(p.equipment).find(([slot, item]) => item.id === n || item.name.includes(n))?.[0];
}

export function broadcastRoom(game, p, selfMsg, otherMsg, channel) {
  for (const o of game.players.values()) {
    if (o.room === p.room) {
      sayRaw(o, { t: 'msg', msg: o === p ? selfMsg : otherMsg, channel });
    }
  }
  game.status(p);
}

export function gameTime() {
  const now = new Date();
  const hour = now.getHours();
  const period = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const year = 5 + Math.floor(now.getFullYear() - 2026);
  const day = now.getDate();
  const month = now.toLocaleString('en-US', { month: 'long' });
  return `It is ${period} of the ${ordinal(day)} of ${month}, in the Year ${year} of the Seventh Age.`;
}

export function ordinal(d) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function rankExp(rank) {
  return Math.floor(40 + rank * 28 + rank * rank * 1.5);
}

export function recalcDerived(p) {
  p.maxHp = Math.max(1, Math.floor((40 + p.stats.con * 2 + p.stats.str) * (1 + (p.circle - 1) * 0.08)) - (p.empathicStain || 0));
  // Titan mastery: the frame swells with raw power.
  if (p.guild.id === 'barbarian' && (p.abilities || []).includes('titan')) {
    p.maxHp = Math.floor(p.maxHp * 1.15);
  }
  // Cleric patron: the Warmaster's faithful are sturdier of frame.
  if (p.guild.id === 'cleric' && p.patron === 'war') {
    p.maxHp = Math.floor(p.maxHp * 1.08);
  }
  if (p.guild.magic) p.maxMana = Math.floor((20 + p.stats.wis * 2 + p.stats.int + p.stats.dis) * (1 + (p.circle - 1) * 0.06));
  else p.maxMana = 0;
  // Stamina pools track the frame and your load.
  p.maxStamina = maxStaminaFor(p);
  p.maxStaminaEff = maxStaminaEff(p);
  p.stamina = Math.min(p.stamina ?? p.maxStaminaEff, p.maxStaminaEff);
}

export function itemByIdName(id) {
  return ITEMS[id] ? ITEMS[id].name : id;
}
