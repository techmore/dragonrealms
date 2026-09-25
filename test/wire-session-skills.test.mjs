import test from 'node:test';
import assert from 'node:assert/strict';
import { WireSession, skillIdForDisplayName } from '../scripts/lib/wire-session.mjs';

test('wire skill labels map to canonical requirement IDs', () => {
  assert.equal(skillIdForDisplayName('Outdoorsmanship'), 'foraging');
  assert.equal(skillIdForDisplayName('Parry Ability'), 'parry');
  assert.equal(skillIdForDisplayName('Small Edged'), 'small_edged');
  assert.equal(skillIdForDisplayName('Unknown Skill'), 'unknown_skill');
});

test('wire quest journal updates and clears the player-visible quest state', async () => {
  const session=new WireSession({user:'test',pass:'test',char:'Tester'}), observed=[];
  session.handlers={onQuest:quest=>observed.push(quest)};
  const quest={kind:'kill',done:false,desc:'Slay 4 more kobolds.'};
  await session.onMessage({t:'quest',quest});
  assert.deepEqual(session.vitals.quest,quest);
  await session.onMessage({t:'quest',quest:null});
  assert.equal(session.vitals.quest,null);
  assert.deepEqual(observed,[quest,null]);
});
