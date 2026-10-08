import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { worldLocations, formatWorldLocations } from '../server/world-reference.js';
import { ROOMS } from '../data/world.js';
import { NPCS } from '../data/npcs.js';
import { setupGame, teardownGame, handleCommand, fakeWs } from './helpers.mjs';
before(setupGame); after(teardownGame);

test('creature locations follow actual spawn definitions and exact IDs rank first', () => {
  const result = worldLocations('creature rat');
  assert.equal(result.entries[0].id, 'rat');
  assert.ok(result.entries[0].locations.length);
  for (const entry of result.entries.filter(entry => !entry.rare)) {
    for (const location of entry.locations) assert.ok(ROOMS[location.roomId].spawns.includes(entry.id));
  }
  assert.equal(worldLocations('  CREATURE RAT  ').entries[0].id, 'rat');
});

test('services and guild names locate authored NPC placements in both cities', () => {
  const healer = worldLocations('npc healer').entries;
  assert.ok(healer.some(entry => entry.locations.some(room => room.roomId === 'temple')));
  assert.ok(healer.some(entry => entry.locations.some(room => room.roomId === 'rh_temple')));
  const guild = worldLocations('guild warrior mage').entries;
  assert.equal(guild.length, 1);
  assert.equal(guild[0].id, 'leader_warmage');
  assert.ok(guild[0].locations.some(room => room.roomId === 'rh_guilds'));
});

test('item search uses seller catalogs and does not mislabel buyers as sellers', () => {
  const item = worldLocations('item potion_heal').entries[0];
  assert.equal(item.id, 'potion_heal');
  assert.ok(item.sellers.length);
  for (const seller of item.sellers) assert.ok(Object.hasOwn(NPCS[seller.id].stock, item.id));
  const catalogs = {
    rooms: { room: { id: 'room', name: 'Shop', zone: 'town', npcs: ['buyer'] } }, zones: { town: { name: 'Town' } },
    creatures: {}, items: { hide: { id: 'hide', name: 'hide' } }, npcs: { buyer: { id: 'buyer', name: 'Buyer', buys: ['hide'] } },
  };
  assert.equal(worldLocations('item hide', catalogs).entries[0].sellers.length, 0);
});

test('reference output is bounded, handles unknown requests, and separates places from live state', () => {
  assert.match(formatWorldLocations(''), /Usage: where/);
  assert.match(formatWorldLocations('creature'), /Usage: where/);
  assert.match(formatWorldLocations('no-such-person'), /No known place/);
  assert.match(formatWorldLocations('creature rat'), /may be absent/);
  assert.ok(formatWorldLocations('a').split('\n').length < 120);
  assert.match(formatWorldLocations('creature shadowpaw'), /Rare sighting/);
});

test('where dispatch is passive and does not consult online players or mutate the character', () => {
  const p = { aliases: {}, silver: 100, room: 'square', ws: fakeWs() };
  const snapshot = JSON.stringify({ aliases: p.aliases, silver: p.silver, room: p.room });
  const game = { status() {}, get players() { throw new Error('must not inspect players'); } };
  handleCommand(game, p, 'where npc healer');
  assert.match(p.ws.msgs.at(-1).msg, /Sister Cora/);
  assert.equal(JSON.stringify({ aliases: p.aliases, silver: p.silver, room: p.room }), snapshot);
});

 test('room scope finds named rooms and emits exact route identifiers', () => {
  const result = worldLocations('room rh_temple');
  assert.equal(result.entries[0].id, 'rh_temple');
  assert.equal(result.entries[0].type, 'room');
  const output = formatWorldLocations('room rh_temple');
  assert.match(output, /\[rh_temple\]/);
  assert.match(output, /route <room-id>/);
  assert.ok(worldLocations('room Riverhaven').entries.length);
  assert.match(formatWorldLocations('npc healer'), /\[temple\]/);
});
