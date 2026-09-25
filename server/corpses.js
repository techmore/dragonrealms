// Ground items and player corpses: what lies on the floor of a room, how
// belongings scatter on death, and how they're reclaimed. Floor state is
// persisted in world_loot so a restart cannot silently destroy dropped gear
// or an uncollected corpse.
import { db } from './db.js';
import {
  isStackableItem, instanceMetadata, addItem, removeItemInstances,
} from './player.js';
import { itemById } from '../data/items.js';

function uid() {
  return `crt_${Math.random().toString(36).slice(2, 10)}`;
}

function insertLoot({ uid: lootUid, room, kind, itemId, itemName, qty, metadata = {}, owner = null, ownerCharId = null }) {
  db.prepare(`
    INSERT INTO world_loot (uid, room, kind, item_id, item_name, qty, metadata, owner, owner_char_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(lootUid, room, kind, itemId, itemName, qty, JSON.stringify(metadata), owner, ownerCharId, Date.now());
}

function parseMetadata(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function corpseObject(row) {
  const metadata = parseMetadata(row.metadata);
  const items = Array.isArray(metadata.items) ? metadata.items : [];
  const equipment = Array.isArray(metadata.equipment) ? metadata.equipment : [];
  return {
    uid: row.uid, corpse: true, owner: row.owner, ownerCharId: row.owner_char_id,
    name: row.item_name, qty: 1,
    item: { id: row.item_id, name: row.item_name, type: 'corpse', value: 0, desc: 'A still body, belongings about it.' },
    items, equipment, ...(metadata.departed ? { departed: true } : {}),
  };
}

function itemObject(row) {
  const item = itemById(row.item_id);
  if (!item) return null;
  return {
    uid: row.uid, item, qty: row.qty,
    ...parseMetadata(row.metadata),
  };
}

// Rehydrate the in-memory world index after a process restart. The runtime
// map is still the fast path for look/get/combat; SQLite is the source of
// truth for durable world loot.
export function restoreFloorItems(game) {
  for (const row of db.prepare('SELECT * FROM world_loot ORDER BY id').all()) {
    const floor = game.floorItems.get(row.room);
    if (!floor) continue;
    const object = row.kind === 'corpse' ? corpseObject(row) : itemObject(row);
    if (object) floor.push(object);
  }
}

function insertDroppedItem(roomId, itemId, itemName, qty, metadata = {}) {
  insertLoot({ uid: uid(), room: roomId, kind: 'item', itemId, itemName, qty, metadata });
}

export function dropFloor(game, roomId, itemId, qty = 1, transferred = null) {
  const item = itemById(itemId);
  if (!item) return;
  const floor = game.floorItems.get(roomId);
  if (!floor) return;
  if (isStackableItem(item)) {
    const object = { uid: uid(), item, qty };
    insertDroppedItem(roomId, item.id, item.name, qty);
    floor.push(object);
    return;
  }
  const instances = Array.isArray(transferred) ? transferred : [];
  for (let copy = 0; copy < qty; copy += 1) {
    const metadata = instanceMetadata(instances[copy] || transferred || {});
    const object = { uid: uid(), item, qty: 1, ...metadata };
    insertDroppedItem(roomId, item.id, item.name, 1, metadata);
    floor.push(object);
  }
}

// Drop a player's item as one durable unit. This closes the old failure
// window where removeItemInstances() committed before the floor insert.
export function dropPlayerItem(game, p, item, qty = 1) {
  const n = Math.max(1, Math.floor(qty) || 1);
  const inventory = p.inventory.map((entry) => ({ ...entry }));
  const handsDirty = p.handsDirty;
  try {
    db.exec('BEGIN IMMEDIATE');
    const instances = removeItemInstances(p, item.item.id, n, item);
    if (isStackableItem(item.item)) {
      const lootUid = uid();
      insertLoot({ uid: lootUid, room: p.room, kind: 'item', itemId: item.item.id, itemName: item.item.name, qty: n });
      game.floorItems.get(p.room).push({ uid: lootUid, item: item.item, qty: n });
    } else {
      for (let copy = 0; copy < n; copy += 1) {
        const metadata = instanceMetadata(instances[copy] || {});
        const lootUid = uid();
        insertLoot({ uid: lootUid, room: p.room, kind: 'item', itemId: item.item.id, itemName: item.item.name, qty: 1, metadata });
        game.floorItems.get(p.room).push({ uid: lootUid, item: item.item, qty: 1, ...metadata });
      }
    }
    db.exec('COMMIT');
    p.handsDirty = true;
    return { ok: true };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    p.inventory = inventory;
    p.handsDirty = handsDirty;
    return { ok: false, error: error.message };
  }
}

// ---------- Player death: a corpse with your belongings stays where you fell ----------
export function dropCorpse(game, p) {
  const items = p.inventory.map((entry) => ({
    id: entry.item.id,
    qty: entry.qty,
    ...(isStackableItem(entry.item) ? {} : instanceMetadata(entry)),
  }));
  const equipment = Object.keys(p.equipment).map((slot) => ({
    slot,
    id: p.equipment[slot].id,
    ...instanceMetadata(p.equipment[slot]),
  }));
  if (!items.length && !equipment.length) return null;
  const corpseUid = uid();
  const name = `${p.name}'s corpse`;
  const corpse = {
    uid: corpseUid, corpse: true, owner: p.name, ownerCharId: p.charId,
    name, qty: 1,
    item: { id: `corpse_${p.charId}`, name, type: 'corpse', value: 0, desc: 'A still body, belongings about it.' },
    items, equipment,
  };
  // Move the rows and the durable corpse marker as one unit. If the insert
  // fails, SQLite restores the player's inventory/equipment rows and the
  // runtime object is never mutated.
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM inventory WHERE character_id=?').run(p.charId);
    db.prepare('DELETE FROM equipment WHERE character_id=?').run(p.charId);
    insertLoot({
      uid: corpseUid, room: p.room, kind: 'corpse', itemId: corpse.item.id,
      itemName: name, qty: 1, metadata: { items, equipment },
      owner: p.name, ownerCharId: p.charId,
    });
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  p.inventory = [];
  p.equipment = {};
  p.handsDirty = true;
  game.floorItems.get(p.room).push(corpse);
  return corpse;
}

function corpseIn(game, p) {
  const pile = game.floorItems.get(p.room) || [];
  return pile.find((c) => c.corpse && c.ownerCharId === p.charId) || null;
}

export function searchCorpse(game, p) {
  const corpse = corpseIn(game, p);
  if (!corpse) return { ok: false, msg: 'There is no corpse here to search.' };
  const parts = [];
  if (corpse.items.length) parts.push(`carried: ${corpse.items.map((i) => `${itemById(i.id).name}${i.qty > 1 ? ` (x${i.qty})` : ''}`).join(', ')}`);
  if (corpse.equipment.length) parts.push(`worn: ${corpse.equipment.map((e) => itemById(e.id).name).join(', ')}`);
  return {
    ok: true,
    msg: `\nYou kneel by ${corpse.name} and search it:\n  ${parts.join('\n  ') || 'Nothing of worth remains.'}\nReclaim your gear with "get <item> from corpse".`,
  };
}

function persistCorpse(corpse) {
  db.prepare('UPDATE world_loot SET metadata=? WHERE uid=?').run(JSON.stringify({
    items: corpse.items, equipment: corpse.equipment, ...(corpse.departed ? { departed: true } : {}),
  }), corpse.uid);
}

export function persistCorpseState(corpse) {
  persistCorpse(corpse);
  return true;
}

function retrieveOne(p, corpse, it) {
  const inventory = p.inventory.map((entry) => ({ ...entry }));
  const items = [...corpse.items];
  const equipment = [...corpse.equipment];
  try {
    db.exec('BEGIN IMMEDIATE');
    addItem(p, it.id, it.qty, it);
    if (corpse.items.includes(it)) corpse.items.splice(corpse.items.indexOf(it), 1);
    else corpse.equipment.splice(corpse.equipment.indexOf(it), 1);
    persistCorpse(corpse);
    db.exec('COMMIT');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    p.inventory = inventory;
    corpse.items = items;
    corpse.equipment = equipment;
    return false;
  }
}

export function retrieveFromCorpse(game, p, itemName) {
  const corpse = corpseIn(game, p);
  if (!corpse) return { ok: false, msg: 'There is no corpse here to take from.' };
  const n = itemName.toLowerCase();
  const invIdx = corpse.items.findIndex((i) => itemById(i.id) && (itemById(i.id).name.toLowerCase().includes(n) || i.id.includes(n)));
  if (invIdx >= 0) {
    const it = corpse.items[invIdx];
    if (!retrieveOne(p, corpse, it)) return { ok: false, msg: 'The relic could not be reclaimed safely; nothing was taken.' };
    clearEmptyCorpse(game, p, corpse);
    return { ok: true, msg: `You take ${it.qty > 1 ? `${it.qty}x ` : ''}${itemById(it.id).name} from the corpse.` };
  }
  const eqIdx = corpse.equipment.findIndex((e) => itemById(e.id) && (itemById(e.id).name.toLowerCase().includes(n) || e.id.includes(n)));
  if (eqIdx >= 0) {
    const it = corpse.equipment[eqIdx];
    if (!retrieveOne(p, corpse, it)) return { ok: false, msg: 'The relic could not be reclaimed safely; nothing was taken.' };
    clearEmptyCorpse(game, p, corpse);
    return { ok: true, msg: `You retrieve ${itemById(it.id).name} from the corpse.` };
  }
  return { ok: false, msg: 'It holds no such thing.' };
}

export function takeFloorItem(p, floor, qty = 1) {
  const take = Math.max(1, Math.min(qty, floor.qty));
  const inventory = p.inventory.map((entry) => ({ ...entry }));
  const handsDirty = p.handsDirty;
  try {
    db.exec('BEGIN IMMEDIATE');
    const metadata = floor.instances
      ? floor.instances.splice(0, take)
      : { condition: floor.condition, quality: floor.quality, maker: floor.maker };
    addItem(p, floor.item.id, take, metadata);
    floor.qty -= take;
    if (floor.qty <= 0) db.prepare('DELETE FROM world_loot WHERE uid=?').run(floor.uid);
    else db.prepare('UPDATE world_loot SET qty=? WHERE uid=?').run(floor.qty, floor.uid);
    db.exec('COMMIT');
    return { ok: true, take };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    p.inventory = inventory;
    p.handsDirty = handsDirty;
    return { ok: false, error: error.message };
  }
}

export function clearEmptyCorpse(game, p, corpse) {
  if (corpse.items.length || corpse.equipment.length) return;
  db.prepare('DELETE FROM world_loot WHERE uid=?').run(corpse.uid);
  const floor = game.floorItems.get(p.room) || [];
  const idx = floor.indexOf(corpse);
  if (idx >= 0) floor.splice(idx, 1);
}
