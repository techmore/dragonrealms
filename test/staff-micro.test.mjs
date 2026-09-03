import test from 'node:test';
import { setupGame, teardownGame, auth, createCharacter, loadPlayer, handleCommand, game, fakeWs } from './helpers.mjs';
import { addItem, gainSkillExp } from '../server/player.js';

test('wielding staff + gainSkillExp banks to expPools', async () => {
  const g = setupGame();
  const reg = await auth.registerAccount('StaffTest2', 'hunter2secret');
  const charId = createCharacter(reg.accountId, { name: 'Staffer', race: 'gortog', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  g.addPlayer(p);
  addItem(p, 'staff', 1);
  handleCommand(g, p, 'wield staff');
  gainSkillExp(p, 'staff', 10);
  console.log('expPools.staff:', p.expPools?.staff);
  console.log('skills.staff:', JSON.stringify(p.skills.staff));
  console.log('rank after:', p.skills.staff.rank);
  teardownGame();
});
