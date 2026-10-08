import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as h from './helpers.mjs';
import { GUILDS, trainableSkills, circleRequirementNeeds } from '../data/guilds.js';
import { GUILD_SCRIPTS, VARIANTS } from '../data/guild-scripts.js';
import { ROOMS } from '../data/world.js';
import { buildCircleScript, buildHuntScript, mandatoryStudyPlan } from '../scripts/lib/script-gen.mjs';
import { createRunner } from '../public/js/script-engine.js';

function path(from, to) {
  const queue = [[from, []]], seen = new Set([from]);
  for (const [room, route] of queue) {
    if (room === to) return route;
    for (const [dir, target] of Object.entries(ROOMS[room]?.exits || {})) {
      if (!seen.has(target)) { seen.add(target); queue.push([target, [...route, { dir }]]); }
    }
  }
  throw new Error(`No authored route ${from}->${to}`);
}
const make = (guild = 'warmage', ranks = null, errands = {}) => buildCircleScript({
  cap: { guild, char: 'Studyfixture', race: 'human', scriptBase: 'fixture', circle: 1, skipCircle: true, requirementRanks: ranks, trainList: [] },
  fromArena: { hall: [], back: [] },
  errands: { bazaarPath: path(`hall_${guild}`, 'bazaar'), returnPath: [], sellLoot: [], studyRoom: 'academy',
    studyPath: path(`hall_${guild}`, 'academy'), studyToBazaar: path('academy', 'bazaar'), ...errands },
});

test('mandatory warmage scholarship uses bounded actual library detour and skips satisfied ranks', () => {
  assert.equal(trainableSkills(GUILDS.warmage).includes('scholarship'), false);
  assert.deepEqual(mandatoryStudyPlan('warmage', null, 1), [{ skill: 'scholarship', need: 4 }, { skill: 'appraisal', need: 4 }]);
  assert.deepEqual(mandatoryStudyPlan('warmage', { scholarship: 4, appraisal: 4 }, 1), []);
  assert.ok(mandatoryStudyPlan('warmage', { scholarship: 2, appraisal: 0 }, 1).length, 'named gate alone cannot close lore breadth');
  assert.ok(path('hall_warmage', 'academy').length + path('academy', 'bazaar').length <= 44, 'actual route meets stock safety cap');
  for (const circle of [1, 3, 5, 8]) {
    const rows = circleRequirementNeeds(GUILDS.warmage, {}, circle + 1);
    const target = Math.max(...rows.filter(row => row.set === 'lore' || (!row.set && row.skill === 'scholarship')).map(row => row.need));
    assert.ok(mandatoryStudyPlan('warmage', {}, circle).every(row => row.need >= target));
  }
  const source = make();
  assert.equal((source.match(/put study/g) || []).length, 3);
  assert.match(source, /ifne room academy goto STUDY_DONE/);
  assert.match(source, /iflt wsr_scholarship 4 goto MANDATORY_STUDY/);
  assert.equal((make('warmage', { scholarship: 4, appraisal: 4 }).match(/put study/g) || []).length, 0);
  assert.equal((make('barbarian').match(/put study/g) || []).length, 0);
  assert.deepEqual(VARIANTS.baseline, { restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    hypothesis: 'Control — every other variant changes exactly one knob against it.' });
  const broken = make('warmage', null, { studyToBazaar: [] });
  assert.equal((broken.match(/put study/g) || []).length, 0, 'no one-way study detour');
  const sweep = readFileSync(new URL('../scripts/race-guild-sweep.mjs', import.meta.url), 'utf8');
  assert.match(sweep, /const \{ mandatoryStudyPlan,.*await import\('\.\/lib\/script-gen\.mjs'\)/);
  assert.equal((sweep.match(/GUILD_SCRIPTS\[this.guild\]\?\.mandatoryStudy\?\.length\) \? this.studyErrandRoute/g) || []).length, 2, 'initial and regenerated routes support mandatory study');
});

test('generated native library route and trip bank three lore lanes without grants', async () => {
  h.setupGame();
  const originalNow = Date.now;
  try {
    const account = await h.auth.registerAccount('Studyfixture', 'secretword9');
    const p = h.loadPlayer(h.createCharacter(account.accountId, { name: 'Studyfixture', race: 'human', guild: 'warmage' }));
    p.ws = h.fakeWs(); h.game.addPlayer(p); p.room = 'hall_warmage';
    const silver = p.silver, gear = JSON.stringify(p.equipment), inventory = JSON.stringify(p.inventory);
    h.handleCommand(h.game, p, 'train scholarship');
    assert.equal(p.silver, silver); assert.equal(p.expPools.scholarship || 0, 0);
    assert.ok(p.ws.msgs.some(m => /does not teach/.test(m.msg || '')));
    const source = make();
    const back = source.slice(source.indexOf('BACK:') + 'BACK:'.length, source.indexOf('  ifne room bazaar goto ERRAND_SKIPPED'));
    const pending = [], rooms = [];
    let now = originalNow(); Date.now = () => now;
    const runner = createRunner(back + '\nexit', [], { roomNow: () => p.room, send: line => pending.push(line) }).start();
    let studies = 0;
    for (let guard = 0; runner.running && guard < 500; guard++) {
      if (!pending.length) { now += 1000; runner.feed('', false); continue; }
      const line = pending.shift(), oldRoom = p.room;
      const before = p.ws.msgs.length;
      h.handleCommand(h.game, p, line, 0, { applyRT: true });
      if (line === 'study') { studies++; assert.equal(p.room, 'academy'); }
      if (p.room !== oldRoom) { rooms.push(p.room); runner.feed('room', 'room'); }
      for (const message of p.ws.msgs.slice(before)) if (message.t === 'prompt') runner.feed(message.msg, 'prompt');
    }
    assert.equal(runner.running, false); assert.equal(studies, 3);
    assert.ok(rooms.includes('academy')); assert.equal(p.room, 'bazaar');
    assert.equal(p.expPools.scholarship, 30); assert.equal(p.expPools.appraisal, 18);
    assert.equal(p.skills.scholarship.rank, 0); assert.equal(p.skills.scholarship.exp, 0);
    assert.equal(p.silver, silver); assert.equal(JSON.stringify(p.equipment), gear); assert.equal(JSON.stringify(p.inventory), inventory);
    assert.equal(circleRequirementNeeds(p.guild, p.skills, 2).find(row => row.skill === 'scholarship').need, 2);
    // Exercise the actual generated fight prefix against native target/stamina gates.
    const hunt = buildHuntScript({ cap: { guild: 'warmage', char: p.name, circle: 1, scriptBase: 'fixture' },
      arena: { id: 'sewers_1', fromArmed: [] }, hallPath: [] });
    const block = hunt.slice(hunt.indexOf('FN_rat:'), hunt.indexOf('  put skin sewer rat', hunt.indexOf('FN_rat:')));
    assert.match(block, /put trip sewer rat\n  wait\n  put prepare fire_shard\n  wait\n  put cast sewer rat\n  wait/);
    now += 5000; // Honor the final native study roundtime before the next activity.
    p.room = 'bazaar';
    const beforeTactics = p.expPools.tactics || 0;
    h.handleCommand(h.game, p, 'trip rat', 0, { applyRT: true });
    assert.equal(p.expPools.tactics || 0, beforeTactics, 'no target means no banked maneuver EXP');
    p.room = 'sewers_1';
    const stamina = p.stamina;
    const command = block.match(/put (trip [^\n]+)/)[1];
    h.handleCommand(h.game, p, command, 0, { applyRT: true });
    assert.ok(h.game.combat.getFor(p));
    assert.equal(p.expPools.tactics, beforeTactics + 12);
    assert.equal(p.stamina, stamina - 8);
    assert.equal(p.skills.tactics.rank, 0);
    h.handleCommand(h.game, p, command, 0, { applyRT: true });
    assert.equal(p.expPools.tactics, beforeTactics + 12, 'native maneuver cooldown prevents duplicate learning');
    assert.equal(p.stamina, stamina - 8);

  } finally { Date.now = originalNow; h.teardownGame(); }
});
