// Release acceptance over a disposable DB: normal command paths, then a
// fresh Game and reloaded character rather than an in-memory-only assertion.
import { auth, createCharacter, loadPlayer, setupGame, teardownGame, game, fakeWs, handleCommand, Game } from './helpers.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, equipItem } from '../server/player.js';
import { equipmentSnapshot } from '../server/equipment-reference.js';
import { heldSpellIds } from '../server/spell-policy.js';

before(setupGame);
after(teardownGame);

test('auth, guild oath, circle, explicit quest reward, repaired gear and logout survive a fresh world lifecycle', async (t) => {
  const account = await auth.registerAccount('Lifecycleacceptance', 'secretword9');
  assert.equal(account.ok, true);
  assert.equal((await auth.loginAccount('Lifecycleacceptance', 'secretword9')).ok, true);
  const id = createCharacter(account.accountId, { name: 'Wayfarer', race: 'human', guild: null });
  const p = loadPlayer(id); p.ws = fakeWs(); game.addPlayer(p);
  assert.equal(p.guild, null);
  p.room = 'hall_warmage';
  handleCommand(game, p, 'join warmage');
  assert.equal(p.guild.id, 'warmage');
  for (const skill of Object.values(p.skills)) skill.rank = 1000;
  handleCommand(game, p, 'circle');
  assert.equal(p.circle, 2);
  assert.deepEqual(p.spellsKnown, heldSpellIds(p.guild, p.circle, p.spellsForgotten));
  p.room = 'square';
  const random = t.mock.method(Math, 'random', () => 0.5);
  try { handleCommand(game, p, 'quest'); } finally { random.mock.restore(); }
  assert.equal(p.quest.kind, 'deliver');
  p.room = p.quest.target.room;
  handleCommand(game, p, 'deliver');
  assert.equal(p.quest.done, true);
  const beforeReward = p.silver;
  handleCommand(game, p, 'journal'); handleCommand(game, p, 'quest');
  assert.equal(p.silver, beforeReward, 'inspection never collects the reward');
  assert.equal(p.quest.done, true);
  p.room = 'square';
  handleCommand(game, p, 'claim');
  assert.equal(p.quest, null);
  assert.ok(p.silver > beforeReward);
  const afterReward = p.silver;
  handleCommand(game, p, 'claim');
  assert.equal(p.silver, afterReward, 'a second claim never pays again');
  addItem(p, 'dagger', 1, { condition: 50, quality: 1.2, maker: 'Crafter' });
  equipItem(p, p.inventory.find(entry => entry.item.id === 'dagger'));
  p.room = 'forge';
  const repair = equipmentSnapshot(p, 'hand').pieces[0];
  handleCommand(game, p, 'repair dagger');
  assert.equal(p.silver, afterReward - repair.repairPrice);
  assert.equal(p.equipment.hand.condition, 100);
  const expectedSilver = p.silver;
  game.removePlayer(p); game.stop();
  const restarted = new Game(); restarted.init(); restarted.stop();
  try {
    const reloaded = loadPlayer(id);
    reloaded.ws = fakeWs(); restarted.addPlayer(reloaded);
    assert.equal(reloaded.guild.id, 'warmage');
    assert.equal(reloaded.circle, 2);
    assert.equal(reloaded.quest, null);
    assert.equal(reloaded.silver, expectedSilver);
    assert.equal(reloaded.equipment.hand.condition, 100);
    assert.equal(reloaded.equipment.hand.quality, 1.2);
    assert.equal(reloaded.equipment.hand.maker, 'Crafter');
    assert.deepEqual(reloaded.spellsKnown, heldSpellIds(reloaded.guild, 2, reloaded.spellsForgotten));
    restarted.removePlayer(reloaded);
  } finally { restarted.stop(); }
});
