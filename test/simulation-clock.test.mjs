import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as h from './helpers.mjs';
import { addItem } from '../server/player.js';
import { rollWound, clotTick } from '../server/wounds.js';
import { CREATURES } from '../data/creatures.js';
import { ROOMS } from '../data/world.js';
import { ITEMS } from '../data/items.js';
import { armorContribution } from '../server/equipment-policy.js';
import { installSimulationClock } from '../scripts/lib/simulation-clock.mjs';

test('engine clock ages native wounds and cooldowns without aging runtime or changing gear', async () => {
  h.setupGame();
  const originalNow = Date.now;
  let seconds = 0;
  const clock = installSimulationClock(() => seconds);
  try {
    const startRuntime = performance.now();
    const wound = rollWound(7, 2, () => 0);
    wound.tended = true; // Fixture models a previously successful bandage.
    assert.equal(clotTick([wound], false), false);
    seconds = 120;
    assert.equal(clotTick([wound], false), false, 'strict native two-minute threshold');
    seconds = 121;
    assert.equal(clotTick([wound], false), true);
    assert.equal(wound.resolved, true);
    assert.ok(performance.now() - startRuntime < 1000, 'declared time must not count as runtime');
    clock.restore();
    const source = readFileSync(new URL('../scripts/simulate-progression.mjs', import.meta.url), 'utf8');
    const rest = source.slice(source.indexOf('function restToFull()'), source.indexOf('\nfunction sellLoot()'));
    const restPlayer = { hp: 100, maxHp: 100, guild: { magic: false }, wounds: [] };
    const context = vm.createContext({ p: restPlayer, ticks: 0, gainSkillExp() {}, clotTick });
    const restClock = installSimulationClock(() => context.ticks);
    try {
      restPlayer.wounds = [rollWound(7, 2, () => 0)]; restPlayer.wounds[0].tended = true;
      vm.runInContext(rest, context); vm.runInContext('restToFull()', context);
      assert.equal(restPlayer.wounds.length, 1, 'exact staged rest must not remove a fresh bandage');
      context.ticks = 121; vm.runInContext('restToFull()', context);
      assert.equal(restPlayer.wounds.length, 0, 'exact staged rest delegates aged bandages to native clot policy');
    } finally { restClock.restore(); }
    const account = await h.auth.registerAccount('Clockfixture', 'secretword9');
    const p = h.loadPlayer(h.createCharacter(account.accountId, { name: 'Clockfixture', race: 'human', guild: 'ranger' }));
    p.ws = h.fakeWs(); h.game.addPlayer(p);
    addItem(p, 'short_sword'); h.handleCommand(h.game, p, 'wield short_sword');
    addItem(p, 'salve', 3);
    const gear = JSON.stringify(p.equipment);
    seconds = 0;
    const commandClock = installSimulationClock(() => seconds);
    try {
      h.handleCommand(h.game, p, 'use salve');
      const count = () => p.inventory.filter(e => e.item.id === 'salve').reduce((n, e) => n + e.qty, 0);
      const afterFirst = count(), firstPool = p.expPools.first_aid;
      seconds = 29; h.handleCommand(h.game, p, 'use salve');
      assert.equal(count(), afterFirst); assert.equal(p.expPools.first_aid, firstPool);
      seconds = 30; h.handleCommand(h.game, p, 'use salve');
      assert.equal(count(), afterFirst - 1); assert.equal(p.expPools.first_aid, firstPool + 2);
      assert.equal(JSON.stringify(p.equipment), gear);
    } finally { commandClock.restore(); }
    assert.equal(Date.now, originalNow);
  } finally { clock.restore(); h.teardownGame(); }
});

test('exact First Aid hunt choice remains in normal tiers and actual authored placements', () => {
  const source = readFileSync(new URL('../scripts/simulate-progression.mjs', import.meta.url), 'utf8');
  const helper = source.slice(source.indexOf('function practiceHunt('), source.indexOf('\nfunction prepareFirstAidPractice('));
  const ctx = vm.createContext({ CREATURES, ROOMS, unmetFieldRequirement: id => id === 'first_aid' });
  vm.runInContext(helper, ctx);
  const cases = [
    { min: 1, room: 'sewers_2', ids: ['rat', 'kobold'], expected: 'kobold', armor: ['padded_cloth', 'shield_wood'] },
    { min: 4, room: 'woods_1', ids: ['goblin', 'wolf'], expected: 'wolf', armor: ['chainmail', 'shield_wood'] },
    { min: 5, room: 'marsh_2', ids: ['wisp'], expected: 'wisp', armor: ['chainmail', 'shield_wood'] },
    { min: 6, room: 'cinder_1', ids: ['cinder_lizard', 'fire_drake'], expected: 'fire_drake', armor: ['ring_mail', 'shield_wood'] },
  ];
  for (const fixture of cases) {
    ctx.normal = { min: fixture.min, room: fixture.room, ids: fixture.ids };
    const actual = vm.runInContext('practiceHunt(normal)', ctx);
    assert.equal(actual.ids[0], fixture.expected);
    assert.ok(ROOMS[actual.room].spawns.includes(fixture.expected));
    if (fixture.min === 1) assert.equal(actual.room, 'sewers_3');
    assert.ok(CREATURES[actual.ids[0]].circle <= Math.max(...fixture.ids.map(id => CREATURES[id].circle)));
    const armor = fixture.armor.reduce((sum, id) => sum + armorContribution(ITEMS[id]), 0);
    const def = CREATURES[actual.ids[0]];
    const maximum = Math.floor((Math.max(...def.weapon.dmg) + Math.floor(def.stats.str * 0.12)) * (1 - armor / (armor + 80)));
    assert.ok(rollWound(maximum, def.circle, () => 0), `native wound threshold remains possible at c${fixture.min}`);
  }
  const laterArmor = armorContribution(ITEMS.ring_mail) + armorContribution(ITEMS.shield_steel);
  const oldKoboldMaximum = Math.floor(10 * (1 - laterArmor / (laterArmor + 80)));
  assert.equal(rollWound(oldKoboldMaximum, 2, () => 0), null, 'old fixed kobold is unsuitable for later armor');
  ctx.unmetFieldRequirement = () => false;
  assert.equal(vm.runInContext('practiceHunt(normal)', ctx), ctx.normal, 'no shortage preserves normal hunt');
});
