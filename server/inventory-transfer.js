// Synchronous inventory/equipment/currency transaction boundary. Keep messages
// and experience rewards outside the callback: they cannot be rolled back.
import { db } from './db.js';

export function transferInventory(players, change) {
  const snapshots = [...new Set(players)].map((p) => ({
    p,
    inventory: p.inventory.map((entry) => ({ ...entry })),
    equipment: Object.fromEntries(Object.entries(p.equipment || {}).map(([slot, item]) => [slot, { ...item }])),
    silver: p.silver,
    handsDirty: p.handsDirty,
  }));
  db.exec('SAVEPOINT inventory_transfer');
  try {
    const value = change();
    for (const { p } of snapshots) {
      const result = db.prepare('UPDATE characters SET silver=? WHERE id=?').run(p.silver, p.charId);
      if (result.changes !== 1) throw new Error('Cannot save transfer for missing character.');
    }
    db.exec('RELEASE inventory_transfer');
    return value;
  } catch (error) {
    try {
      db.exec('ROLLBACK TO inventory_transfer');
      db.exec('RELEASE inventory_transfer');
    } finally {
      for (const { p, inventory, equipment, silver, handsDirty } of snapshots) {
        p.inventory = inventory;
        p.equipment = equipment;
        p.silver = silver;
        p.handsDirty = handsDirty;
      }
    }
    throw error;
  }
}
