import { auth, createCharacter, loadPlayer, setupGame, teardownGame, game, handleCommand, fakeWs } from './helpers.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../data/items.js';
import { equipmentSnapshot, formatEquipment } from '../server/equipment-reference.js';
import { conditionMult, qualityMult, repairCost } from '../server/equipment-policy.js';
import { totalArmor, addItem, equipItem, conditionMult as playerConditionMult, qualityMult as playerQualityMult } from '../server/player.js';
import { COMMAND_METADATA } from '../server/commands/metadata.js';

before(setupGame);
after(teardownGame);
const fixture = () => ({ room: 'square', silver: 100, equipment: {
  hand: { ...ITEMS.forged_mithril_blade, condition: 50, quality: 1.25, maker: 'Smith' },
  torso: { ...ITEMS.chainmail, condition: 73, quality: 1.4 },
  shield: { ...ITEMS.shield_wood, condition: 20, quality: 0.8 },
  chest: { ...ITEMS.lout_vest },
} });

test('equipped armor contributions and sum match production per-piece rounding, including shield and legacy chest', () => {
  const p = fixture();
  const plan = equipmentSnapshot(p);
  assert.equal(plan.totalArmor, totalArmor(p));
  for (const piece of plan.pieces.filter(piece => piece.type === 'armor')) {
    const item = p.equipment[piece.slot];
    assert.equal(piece.armor, Math.floor(item.armor * conditionMult(item) * qualityMult(item)));
  }
  assert.equal(playerConditionMult, conditionMult, 'existing player exports retain the shared policy');
  assert.equal(playerQualityMult, qualityMult);
  assert.match(formatEquipment(p), /effective contribution/);
});

test('weapon report exposes actual base damage, skill and instance provenance without predicting combat damage', () => {
  const p = fixture();
  const piece = equipmentSnapshot(p, 'hand').pieces[0];
  assert.deepEqual(piece.baseDamage, ITEMS.forged_mithril_blade.dmg);
  assert.equal(piece.skill, 'medium_edged');
  assert.equal(piece.quality, 1.25);
  assert.equal(piece.maker, 'Smith');
  assert.match(formatEquipment(p, 'hand'), /Actual combat damage also depends/);
});

test('repairs show the actual price, minimum, affordability boundaries and only supported shops', () => {
  const p = fixture();
  const piece = equipmentSnapshot(p, 'chainmail').pieces[0];
  assert.equal(piece.repairPrice, repairCost(p.equipment.torso));
  p.silver = piece.repairPrice - 1;
  assert.equal(equipmentSnapshot(p, 'torso').pieces[0].repairAffordable, false);
  p.silver++;
  assert.equal(equipmentSnapshot(p, 'torso').pieces[0].repairAffordable, true);
  assert.deepEqual(equipmentSnapshot(p).repairShops.map(room => room.roomId), ['forge', 'tailor_shop']);
  p.room = 'rh_forge';
  assert.equal(equipmentSnapshot(p).atRepairShop, false);
  p.equipment.chest.condition = 99;
  assert.equal(equipmentSnapshot(p, 'chest').pieces[0].repairPrice, 5);
});

test('exact IDs/slots win, name terms work, output is bounded and missing historical metadata stays explicit', () => {
  const p = fixture();
  assert.equal(equipmentSnapshot(p, 'shield_wood').count, 1);
  assert.equal(equipmentSnapshot(p, 'round wooden').pieces[0].slot, 'shield');
  assert.match(formatEquipment(p, 'nonexistent'), /No equipped piece matches/);
  assert.match(formatEquipment(p, 'chest'), /unrecorded; engine default/);
  assert.match(formatEquipment(p, 'chest'), /maker: unknown/);
  p.equipment.unknown = { id: 'oldpiece', name: 'an old piece', type: 'armor' };
  const plan = equipmentSnapshot(p, 'oldpiece');
  assert.equal(plan.pieces[0].armor, null);
  assert.equal(plan.totalArmor, null);
  assert.match(formatEquipment(p, 'oldpiece'), /effective contribution: unknown/);
  p.equipment.unknown.condition = 40;
  assert.equal(equipmentSnapshot(p, 'oldpiece').pieces[0].repairPrice, null);
  p.equipment.weird = {};
  assert.match(formatEquipment(p, 'weird'), /Item type unknown/);
  assert.equal(equipmentSnapshot({ equipment: { weird: {} } }).totalArmor, null);
  for (let n = 0; n < 9; n++) p.equipment[`extra${n}`] = { ...ITEMS.helm };
  assert.equal(equipmentSnapshot(p).pieces.length, 8);
  assert.match(formatEquipment(p), /Showing 8 of/);
  assert.match(formatEquipment({ equipment: {}, silver: 0 }), /nothing equipped/);
});

test('native equipped-item repair charges the planned price at both supported shops and persists condition', async () => {
  const account = await auth.registerAccount('Equipmentplanner', 'secretword9');
  const id = createCharacter(account.accountId, { name: 'Armored', race: 'human', guild: 'warmage' });
  const p = loadPlayer(id); p.ws = fakeWs(); game.addPlayer(p);
  addItem(p, 'dagger');
  equipItem(p, p.inventory.find(entry => entry.item.id === 'dagger'));
  for (const room of ['forge', 'tailor_shop']) {
    p.room = room; p.silver = 1000;
    p.equipment.hand.condition = 50;
    const piece = equipmentSnapshot(p, 'hand').pieces[0];
    handleCommand(game, p, `repair ${piece.id}`);
    assert.equal(p.silver, 1000 - piece.repairPrice);
    assert.equal(p.equipment.hand.condition, 100);
    assert.equal(loadPlayer(id).equipment.hand.condition, 100);
  }
  game.removePlayer(p);
});

test('equipment command and snapshot stay passive, including roundtime and pending stat confirmation', () => {
  const p = fixture(); p.ws = fakeWs(); p.feAt = Date.now(); p.rtUntil = Date.now() + 5000; p.trainPending = 'wis';
  const beforeState = JSON.stringify({ ...p, ws: null });
  equipmentSnapshot(p); formatEquipment(p);
  handleCommand(game, p, 'equipment', { applyRT: true });
  assert.equal(JSON.stringify({ ...p, ws: null }), beforeState);
  assert.match(p.ws.msgs.map(msg => msg.msg || '').join('\n'), /Equipment report/);
  assert.equal(COMMAND_METADATA.equipment.panelSafe, true);
  assert.deepEqual(COMMAND_METADATA.equipment.mutates, []);
});
