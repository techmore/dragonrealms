// Ground items and player corpses: what lies on the floor of a room, how
// belongings scatter on death, and how they're reclaimed. Extracted from
// Game — Game owns the floorItems Map and delegates; this module holds the
// rules. Functions take `game` first per the delegate convention.
import { db } from './db.js';
import { isStackableItem, instanceMetadata, addItem } from './player.js';
import { itemById } from '../data/items.js';

function uid() {
  return `crt_${Math.random().toString(36).slice(2, 10)}`;
}

export function dropFloor(game, roomId, itemId, qty = 1, transferred = null) {
  const item = itemById(itemId);
  if (!item) return;
  const floor = game.floorItems.get(roomId);
  if (isStackableItem(item)) {
    floor.push({ uid: uid(), item, qty });
    return;
  }
  const instances = Array.isArray(transferred) ? transferred : [];
  for (let copy = 0; copy < qty; copy += 1) {
    const metadata = instanceMetadata(instances[copy] || transferred || {});
    floor.push({ uid: uid(), item, qty: 1, ...metadata });
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
  // Move the rows as a unit. Unequipping first would temporarily merge gear
  // with carried copies and could detach one instance's quality/condition.
  db.prepare('DELETE FROM inventory WHERE character_id=?').run(p.charId);
  db.prepare('DELETE FROM equipment WHERE character_id=?').run(p.charId);
  p.inventory = [];
  p.equipment = {};
  p.handsDirty = true;
  const corpse = {
    uid: uid(), corpse: true, owner: p.name, ownerCharId: p.charId,
    name: `${p.name}'s corpse`, qty: 1,
    item: { id: `corpse_${p.charId}`, name: `${p.name}'s corpse`, type: 'corpse', value: 0, desc: 'A still body, belongings about it.' },
    items, equipment,
  };
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

export function retrieveFromCorpse(game, p, itemName) {
  const corpse = corpseIn(game, p);
  if (!corpse) return { ok: false, msg: 'There is no corpse here to take from.' };
  const n = itemName.toLowerCase();
  const invIdx = corpse.items.findIndex((i) => itemById(i.id) && (itemById(i.id).name.toLowerCase().includes(n) || i.id.includes(n)));
  if (invIdx >= 0) {
    const it = corpse.items[invIdx];
    addItem(p, it.id, it.qty, it);
    corpse.items.splice(invIdx, 1);
    clearEmptyCorpse(game, p, corpse);
    return { ok: true, msg: `You take ${it.qty > 1 ? `${it.qty}x ` : ''}${itemById(it.id).name} from the corpse.` };
  }
  const eqIdx = corpse.equipment.findIndex((e) => itemById(e.id) && (itemById(e.id).name.toLowerCase().includes(n) || e.id.includes(n)));
  if (eqIdx >= 0) {
    const it = corpse.equipment[eqIdx];
    addItem(p, it.id, 1, it);
    corpse.equipment.splice(eqIdx, 1);
    clearEmptyCorpse(game, p, corpse);
    return { ok: true, msg: `You retrieve ${itemById(it.id).name} from the corpse.` };
  }
  return { ok: false, msg: 'It holds no such thing.' };
}

export function clearEmptyCorpse(game, p, corpse) {
  if (corpse.items.length || corpse.equipment.length) return;
  const floor = game.floorItems.get(p.room) || [];
  const idx = floor.indexOf(corpse);
  if (idx >= 0) floor.splice(idx, 1);
}
