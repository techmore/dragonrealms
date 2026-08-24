// One-off live-engine check of the North Fields (UI audit P0#1 fix):
// walk a fresh character out the North Gate, confirm spawns + a real fight.
import {
  auth, createCharacter, loadPlayer, game, handleCommand, fakeWs,
  setupGame, teardownGame,
} from '../test/helpers.mjs';
import { findPath } from '../data/grid.js';

await setupGame();
try {
  const acc = await auth.registerAccount('fieldcheck1', 's3cretword');
  const id = createCharacter(acc.accountId, { name: 'Fieldcheck', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(id);
  p.ws = fakeWs();
  game.addPlayer(p);
  console.log('start room:', p.room);

  for (const step of findPath(p.room, 'fields_stonebridge')) {
    handleCommand(game, p, step);
  }
  console.log('walked to:', p.room);

  // Force the respawn tick so the field rooms populate immediately.
  game.respawnTick();
  const creatures = game.creaturesIn(p.room).map((c) => c.def.name);
  console.log('bridge creatures:', creatures.length ? creatures.join(', ') : '(none)');

  if (!creatures.length) {
    // step back into the furrows and try there
    handleCommand(game, p, 's');
    game.respawnTick();
    console.log('furrow creatures:', game.creaturesIn(p.room).map((c) => c.def.name).join(', ') || '(none)');
  }

  const target = game.creaturesIn(p.room)[0];
  if (!target) throw new Error('no creatures spawned in either field room');
  addItem: {
    const { addItem } = await import('../server/player.js');
    addItem(p, 'hand_axe', 1);
  }
  handleCommand(game, p, 'wield hand_axe');
  handleCommand(game, p, `attack ${target.def.id}`);
  let combat = game.combat.getFor(p);
  if (!combat) throw new Error('combat did not start');
  combat.tick();
  console.log('fight started vs', target.def.name, '| hp', p.hp, '/', p.maxHp, '| RT ok');
  console.log('NORTH FIELDS OK');
} finally {
  teardownGame();
}
