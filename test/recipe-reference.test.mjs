// Initialize the disposable DB before evaluating dispatcher/Player imports.
import { setupGame, teardownGame, handleCommand, fakeWs } from './helpers.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { recipePlans, formatRecipes } from '../server/recipe-reference.js';
import { commandContract, readPanel } from '../server/commands/index.js';
import { RECIPES } from '../data/recipes.js';
import { FORGE_RECIPES, ENGINEER_RECIPES, OUTFIT_RECIPES } from '../data/forging.js';

before(setupGame);
after(teardownGame);

function player() {
  return { room: 'forge', inventory: [], skills: { forging: { rank: 0 }, engineering: { rank: 0 }, outfitting: { rank: 0 }, alchemy: { rank: 0 } }, craftTechs: {}, aliases: {}, stats: { wis: 10 }, silver: 100 };
}

test('every production recipe exposes its authoritative rank gate, inputs, output and execution verb', () => {
  const p = player();
  for (const [discipline, recipes, verb] of [
    ['alchemy', RECIPES, 'craft'], ['forging', FORGE_RECIPES, 'forge'],
    ['engineering', ENGINEER_RECIPES, 'shape'], ['outfitting', OUTFIT_RECIPES, 'tailor'],
  ]) {
    for (const [id, definition] of Object.entries(recipes)) {
      const plan = recipePlans(p, `${discipline} ${id}`).entries[0];
      assert.equal(plan.id, id);
      assert.equal(plan.minRank, discipline === 'alchemy' ? 0 : definition.minSkill);
      assert.equal(plan.output.id, definition.item);
      assert.equal(plan.output.quantity, 1);
      assert.equal(plan.verb, verb);
      assert.deepEqual(Object.fromEntries(plan.ingredients.map(ingredient => [ingredient.id, ingredient.need])), definition.ingredients);
    }
  }
});

test('readiness sums separate carried stacks and reports exact deficits while ignoring vault/equipped materials', () => {
  const p = player();
  p.inventory = [
    { item: { id: 'iron_ore' }, qty: 1 }, { item: { id: 'iron_ore' }, qty: 1 },
  ];
  p.vault = [{ item: { id: 'cinder_scale' }, qty: 10 }];
  p.equipment = { left: { id: 'cinder_scale' } };
  const initial = JSON.stringify(p);
  const short = recipePlans(p, 'forging forged_short_sword').entries[0];
  assert.equal(short.ready, true);
  const steel = recipePlans(p, 'forging forged_steel_sword').entries[0];
  assert.equal(steel.ready, false);
  assert.equal(steel.skillMet, false);
  assert.deepEqual(steel.ingredients.map(ingredient => ingredient.missing), [1, 1]);
  const output = formatRecipes(p, 'forging forged_steel_sword');
  assert.match(output, /forging 0\/10.*10 more ranks/);
  assert.match(output, /carrying 2; missing 1/);
  assert.match(output, /raise the required skill; gather missing ingredients/);
  assert.equal(JSON.stringify(p), initial);
});

test('station readiness follows production gates, including all role-craft alchemy stations', () => {
  const p = player();
  p.inventory = [{ item: { id: 'herb_root' }, qty: 2 }, { item: { id: 'herb_mint' }, qty: 1 }];
  const brew = recipePlans(p, 'alchemy healing_draught').entries[0];
  assert.equal(brew.minRank, 0);
  assert.equal(brew.ready, true, 'craft handler accepts forge_master at the forge');
  assert.ok(brew.stations.some(station => station.id === 'brewery'));
  assert.ok(brew.stations.some(station => station.id === 'tailor_shop'));
  assert.ok(brew.stations.some(station => station.id === 'commodity_pit'));
  p.room = 'alchemy_soc';
  assert.equal(recipePlans(p, 'alchemy healing_draught').entries[0].atStation, false, 'a Society name alone is not a supported station');
  p.room = 'forging_soc';
  assert.equal(recipePlans(p, 'forging forged_short_sword').entries[0].atStation, false, 'forge production requires the actual forge room');
  assert.equal(recipePlans(p, 'alchemy healing_draught').entries[0].atStation, true);
});

test('optional techniques and matching work orders are distinguished from recipe prerequisites', () => {
  const p = player();
  p.skills.forging.rank = 25;
  p.inventory = [{ item: { id: 'iron_ore' }, qty: 2 }];
  p.craftTechs.forging = ['hammer_rhythm'];
  p.workOrder = { verb: 'forge', recipeId: 'forged_short_sword', done: false, qualMult: 1.3 };
  const initial = JSON.stringify(p);
  assert.equal(recipePlans(p, 'forged_short_sword').entries[0].ready, true);
  const output = formatRecipes(p, 'forged_short_sword');
  assert.match(output, /Optional learned techniques: Hammer Rhythm/);
  assert.match(output, /required quality is set aside/);
  assert.match(output, /no separate tool or mandatory technique/);
  assert.equal(JSON.stringify(p), initial);
  p.craftTechs.forging = [];
  assert.equal(recipePlans(p, 'forged_short_sword').entries[0].ready, true);
});

test('query search, disciplines and bounded fixtures never silently craft a matching recipe', () => {
  const p = player();
  const entries = {};
  for (let i = 0; i < 12; i++) entries[`sample_${i}`] = { id: `sample_${i}`, name: 'sample potion', item: 'potion', ingredients: {}, minSkill: 99 };
  const data = { catalogs: { alchemy: { verb: 'craft', recipes: entries } }, items: { potion: { name: 'red potion' } }, rooms: { forge: { name: 'Forge', npcs: ['smith'] } }, npcs: { smith: { role: 'craft' } }, techniques: {} };
  assert.equal(recipePlans(p, 'alchemy', data).total, 12);
  assert.equal(recipePlans(p, 'alchemy', data).entries.length, 8);
  const exact = recipePlans(p, 'alchemy SAMPLE_11', data).entries[0];
  assert.equal(exact.id, 'sample_11');
  assert.equal(exact.minRank, 0, 'alchemy production ignores recipe rank fields');
  assert.equal(exact.ready, true);
  assert.match(formatRecipes(p, 'alchemy', data), /Showing 8 of 12/);
  assert.equal(recipePlans(p, 'red potion', data).total, 12);
  assert.equal(recipePlans(p, 'forging steel').entries.every(entry => entry.discipline === 'forging'), true);
  assert.match(formatRecipes(p, 'no-such-recipe'), /No recipes match/);
});

test('recipes command runs during roundtime and changes no inventory, learning, work orders or persistence', () => {
  const p = player();
  p.ws = fakeWs();
  p.rtUntil = Date.now() + 60_000;
  const initial = JSON.stringify({ ...p, ws: undefined });
  const game = { status() {}, persistPlayer() { throw new Error('must not persist'); } };
  handleCommand(game, p, 'recipes forging forged_short_sword', 0, { applyRT: true });
  assert.match(p.ws.msgs[0].msg, /Recipe plans/);
  assert.equal(JSON.stringify({ ...p, ws: undefined }), initial);
  assert.deepEqual(commandContract('recipes').mutates, []);
  assert.equal(commandContract('recipes').rt.gate, false);
  assert.equal(readPanel(game, p, 'recipes').ok, true);
});
