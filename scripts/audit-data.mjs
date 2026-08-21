// Data-integrity audit: cross-references every data file (skills, guilds,
// spells, circle tables, items, creatures, loot, rares, NPCs, rooms, recipes,
// mana types, abilities) and reports broken references.
// Run: node scripts/audit-data.mjs
import { readFileSync } from 'node:fs';
import { SKILLS } from '../data/skills.js';
import { GUILDS } from '../data/guilds.js';
import { ITEMS } from '../data/items.js';
import { CREATURES, RARES } from '../data/creatures.js';
import { NPCS } from '../data/npcs.js';
import { ROOMS, ZONES } from '../data/world.js';
import { RECIPES } from '../data/recipes.js';
import { BARBARIAN_ABILITIES } from '../data/abilities.js';
import { GUILD_MANA } from '../data/mana.js';

// Extract the circle tables (not exported, so parse the module source).
const src = readFileSync(new URL('../data/guilds.js', import.meta.url), 'utf8');
const tbl = src.match(/const CIRCLE_TABLES = \{[\s\S]*?\n\};/)[0];
const tables = {};
const re = /^  (\w+): \[([\s\S]*?)\n  \],/gm;
let m;
while ((m = re.exec(tbl))) {
  const rows = [...m[2].matchAll(/\{([^}]*)\}/g)].map((x) => {
    const o = {};
    for (const [k, v] of x[1].matchAll(/(\w+): (?:(\d+)|'([^']+)')/g)) o[k] = v[2] !== undefined ? Number(v[2]) : v[3];
    return o;
  });
  tables[m[1]] = rows;
}

const SETS = new Set(['weapon', 'armor', 'survival', 'lore', 'magic', 'supernatural']);
const issues = [];

for (const g of Object.values(GUILDS)) {
  for (const s of [...g.primary, ...g.secondary, g.guildSkill].filter(Boolean)) {
    if (!SKILLS[s]) issues.push(`guild ${g.id} -> missing skill ${s}`);
  }
  for (const sp of g.spells || []) {
    if (!SKILLS[sp.skill]) issues.push(`guild ${g.id} spell ${sp.id} -> missing skill ${sp.skill}`);
    if (!sp.kind) issues.push(`guild ${g.id} spell ${sp.id} -> no kind`);
  }
  if (!GUILD_MANA[g.id]) issues.push(`guild ${g.id} -> no mana type assigned`);
}
for (const [gid, rows] of Object.entries(tables)) {
  if (!GUILDS[gid]) issues.push(`circle table for unknown guild ${gid}`);
  for (const r of rows) {
    if (r.skill && !SKILLS[r.skill]) issues.push(`circle table ${gid} -> missing skill ${r.skill}`);
    if (r.set && !SETS.has(r.set)) issues.push(`circle table ${gid} -> unknown set ${r.set}`);
    if (r.nth && (!r.set || !r.rank)) issues.push(`circle table ${gid} -> malformed nth row`);
  }
}
for (const [id, it] of Object.entries(ITEMS)) {
  if (it.id !== id) issues.push(`item key ${id} disagrees with id ${it.id}`);
  if (it.skill && !SKILLS[it.skill]) issues.push(`item ${it.id} -> missing skill ${it.skill}`);
  if (it.type === 'weapon' && (!it.dmg || it.dmg.length !== 2)) issues.push(`item ${it.id} malformed dmg`);
  if (it.type === 'armor' && !it.armor) issues.push(`item ${it.id} missing armor value`);
}
for (const [id, c] of Object.entries(CREATURES)) {
  if (c.id !== id) issues.push(`creature key ${id} disagrees with id ${c.id}`);
  if (!SKILLS[c.weapon.skill]) issues.push(`creature ${c.id} -> missing skill ${c.weapon.skill}`);
  for (const l of c.loot || []) if (!ITEMS[l]) issues.push(`creature ${c.id} -> missing loot ${l}`);
  if (c.teaches && (c.teaches.length !== 2 || c.teaches[0] > c.teaches[1])) issues.push(`creature ${c.id} malformed teaches band`);
}
for (const [zone, r] of Object.entries(RARES)) {
  if (!ZONES[zone]) issues.push(`rare ${r.id} -> zone ${zone} missing`);
  if (!SKILLS[r.weapon.skill]) issues.push(`rare ${r.id} -> missing skill ${r.weapon.skill}`);
  for (const l of r.loot || []) if (!ITEMS[l]) issues.push(`rare ${r.id} -> missing loot ${l}`);
}
for (const [id, n] of Object.entries(NPCS)) {
  if (n.id !== id) issues.push(`npc key ${id} disagrees with id ${n.id}`);
  for (const id of Object.keys(n.stock || {})) if (!ITEMS[id]) issues.push(`npc ${n.id} -> missing stock ${id}`);
  for (const id of n.buys || []) if (!ITEMS[id]) issues.push(`npc ${n.id} -> buys missing ${id}`);
  if (n.role === 'guild' && !GUILDS[n.guild]) issues.push(`npc ${n.id} -> guild ${n.guild} invalid`);
}
for (const [rid, room] of Object.entries(ROOMS)) {
  if (room.id !== rid) issues.push(`room key ${rid} disagrees with id ${room.id}`);
  if (!ZONES[room.zone]) issues.push(`room ${rid} -> zone ${room.zone} invalid`);
  for (const npcId of room.npcs || []) if (!NPCS[npcId]) issues.push(`room ${rid} -> npc ${npcId} missing`);
  for (const spawn of room.spawns || []) if (!CREATURES[spawn]) issues.push(`room ${rid} -> creature ${spawn} missing`);
  for (const [dir, target] of Object.entries(room.exits || {})) {
    if (!ROOMS[target]) issues.push(`room ${rid} -> exit ${dir} -> ${target} missing`);
    else if (!Object.values(ROOMS[target].exits || {}).includes(rid)) issues.push(`room ${rid} -> exit to ${target} not reciprocal`);
  }
}

// Every room must be navigable from at least one character-creation origin.
// Reciprocal references alone do not catch an internally connected island.
const reachable = new Set(['square', 'rh_square'].filter((id) => ROOMS[id]));
const frontier = [...reachable];
while (frontier.length) {
  const room = ROOMS[frontier.shift()];
  for (const target of Object.values(room.exits || {})) {
    if (!reachable.has(target) && ROOMS[target]) {
      reachable.add(target);
      frontier.push(target);
    }
  }
}
for (const rid of Object.keys(ROOMS)) {
  if (!reachable.has(rid)) issues.push(`room ${rid} is unreachable from every starting city`);
}
for (const r of Object.values(RECIPES)) {
  if (!ITEMS[r.item]) issues.push(`recipe ${r.id} -> missing result ${r.item}`);
  for (const ing of Object.keys(r.ingredients)) if (!ITEMS[ing]) issues.push(`recipe ${r.id} -> missing ingredient ${ing}`);
}
for (const a of BARBARIAN_ABILITIES) {
  if (a.minCircle && a.minCircle > 10) issues.push(`ability ${a.id} minCircle ${a.minCircle} beyond circle-10 scope`);
}

console.log(issues.length ? `ISSUES (${issues.length}):\n` + issues.join('\n') : 'ALL CROSS-REFERENCES VALID');
process.exit(issues.length ? 1 : 0);
