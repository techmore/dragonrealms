// Known places come from world content, never live players or shop inventory.
import { ROOMS, ZONES } from '../data/world.js';
import { CREATURES, RARES } from '../data/creatures.js';
import { NPCS } from '../data/npcs.js';
import { ITEMS } from '../data/items.js';
import { GUILDS } from '../data/guilds.js';

const normalize = value => String(value || '').toLowerCase().replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
const DEFAULT_CATALOGS = { rooms: ROOMS, zones: ZONES, creatures: CREATURES, rares: RARES, npcs: NPCS, items: ITEMS, guilds: GUILDS };
const SCOPES = new Set(['creature', 'npc', 'item', 'guild', 'room']);

export function worldLocations(input, catalogs = DEFAULT_CATALOGS) {
  const parts = normalize(input).split(' ').filter(Boolean);
  const scope = SCOPES.has(parts[0]) ? parts.shift() : null;
  const query = parts.join(' ');
  if (!query) return { query, scope, entries: [] };
  const terms = query.split(' ');
  const { rooms, zones, creatures, rares = {}, npcs, items, guilds = {} } = catalogs;
  const roomList = Object.values(rooms);
  const locations = ids => roomList.filter(room => ids.includes(room.id)).map(room => ({
    roomId: room.id, name: room.name, zone: room.zone, area: zones[room.zone]?.name || room.zone,
  })).sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name) || a.roomId.localeCompare(b.roomId));
  const matches = (id, def, extra = '') => {
    const text = normalize(`${id} ${def.name} ${def.plural || ''} ${extra}`);
    return terms.every(term => text.includes(term));
  };
  const exact = (id, def) => [id, def.name, def.plural].some(value => normalize(value) === query);
  const entries = [];
  if (scope === 'room') {
    for (const room of roomList) if (matches(room.id, room, zones[room.zone]?.name || room.zone)) {
      entries.push({ type: 'room', id: room.id, name: room.name, exact: exact(room.id, room), locations: locations([room.id]) });
    }
  }
  if (!scope || scope === 'creature') {
    for (const [id, def] of Object.entries(creatures)) if (matches(id, def)) {
      entries.push({ type: 'creature', id, name: def.name, exact: exact(id, def), teaches: def.teaches,
        locations: locations(roomList.filter(room => room.spawns?.includes(id)).map(room => room.id)) });
    }
    for (const [zone, def] of Object.entries(rares)) if (matches(def.id, def)) {
      entries.push({ type: 'creature', id: def.id, name: def.name, exact: exact(def.id, def), rare: true,
        locations: locations(roomList.filter(room => room.zone === zone && room.spawns?.length).map(room => room.id)) });
    }
  }
  if (!scope || scope === 'npc' || scope === 'guild') {
    for (const [id, def] of Object.entries(npcs)) {
      if (scope === 'guild' && def.role !== 'guild') continue;
      if (!matches(id, def, `${def.role || ''} ${def.guild || ''} ${guilds[def.guild]?.name || ''}`)) continue;
      entries.push({ type: 'npc', id, name: def.name, role: def.role, exact: exact(id, def) || normalize(def.guild) === query,
        locations: locations(roomList.filter(room => room.npcs?.includes(id)).map(room => room.id)) });
    }
  }
  if (!scope || scope === 'item') {
    for (const [id, def] of Object.entries(items)) if (matches(id, def)) {
      const sellers = Object.values(npcs).filter(npc => Object.hasOwn(npc.stock || {}, id));
      entries.push({ type: 'item', id, name: def.name, exact: exact(id, def), sellers: sellers.map(npc => ({
        id: npc.id, name: npc.name,
        locations: locations(roomList.filter(room => room.npcs?.includes(npc.id)).map(room => room.id)),
      })) });
    }
  }
  entries.sort((a, b) => Number(b.exact) - Number(a.exact) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  return { query, scope, entries };
}

export function formatWorldLocations(input) {
  const result = worldLocations(input);
  if (!result.query) return 'Usage: where [creature|npc|item|guild|room] <name>. Try "where creature rat", "where npc healer", "where item potion_heal", or "where guild bard".';
  if (!result.entries.length) return `No known place matches "${result.query}". Try fewer words or choose creature, npc, item, guild or room.`;
  const lines = [`\nKnown places — ${result.query}`];
  const shown = result.entries.slice(0, 6);
  const showRooms = places => {
    for (const place of places.slice(0, 8)) lines.push(`    ${place.name} — ${place.area} [${place.roomId}]`);
    if (places.length > 8) lines.push(`    ${places.length - 8} additional known locations.`);
  };
  for (const entry of shown) {
    lines.push(`  ${entry.name} (${entry.type}${entry.role ? `; ${entry.role}` : ''})`);
    if (entry.type === 'item') {
      if (!entry.sellers.length) lines.push('    No shopkeeper is known to offer this item. It may come from other sources.');
      for (const seller of entry.sellers.slice(0, 6)) {
        lines.push(`    Sold by ${seller.name}:`);
        showRooms(seller.locations);
        if (!seller.locations.length) lines.push('    No known shop location.');
      }
      if (entry.sellers.length > 6) lines.push(`    ${entry.sellers.length - 6} additional merchants.`);
    } else {
      if (entry.rare) lines.push('    Rare sighting: these are possible haunts; an appearance is not guaranteed.');
      if (Array.isArray(entry.teaches) && entry.teaches.length === 2) lines.push(`    Teaching band: ranks ${entry.teaches[0]}–${entry.teaches[1]}. Use "ladder" to judge a hunt.`);
      showRooms(entry.locations);
      if (!entry.locations.length) lines.push('    No known location.');
    }
  }
  if (shown.length < result.entries.length) lines.push(`${result.entries.length - shown.length} more matches. Narrow the query with a type and exact name.`);
  lines.push('Creatures may be absent and shops may be sold out. Use "route <room-id>" for a walking route; in town, "dir list" lists landmarks.');
  return lines.join('\n');
}
