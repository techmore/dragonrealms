// Guild-joining suite: DR-authentic hall membership. Characters wake
// guildless; `join <guild>` at a hall's leader binds them; trainers, spells,
// and circling all refuse until then. Sims that pass guild at creation keep
// the old instant-guild path (verified via createCharacter).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
import { GUILDS } from '../data/guilds.js';
import { findPath } from '../data/grid.js';
import { hallGuildAt } from '../server/commands/join.js';

function walk(p, to) {
  for (const step of findPath(p.room, to)) game.move(p, step);
}

const msgs = (p) => p.ws.msgs.map((m) => m.msg || '').join('\n');

let acctId, p;

before(async () => {
  await setupGame();
  const reg = await auth.registerAccount('Joiner', 'joiner-pass');
  acctId = reg.accountId;
});

after(() => teardownGame());

function makeGuildless(name) {
  const id = createCharacter(acctId, { name, race: 'human', guild: null });
  const pl = loadPlayer(id);
  pl.ws = fakeWs();
  game.addPlayer(pl);
  return pl;
}

test('guildless creation: wakes at Crossing Temple with no guild, requirements carry the join hint', () => {
  p = makeGuildless('Waker');
  assert.equal(p.room, 'temple', 'guildless wake at Crossing Temple');
  assert.equal(p.guild, null, 'no guild');
  assert.equal(p.maxMana, 0, 'no mana pool for guildless');
  game.status(p);
  const prompt = p.ws.msgs.find((m) => (m && m.t === 'prompt') || (typeof m === 'string' && m.includes('"prompt"')));
  const promptObj = typeof prompt === 'string' ? JSON.parse(prompt) : prompt;
  const need = ((promptObj && promptObj.requirements && promptObj.requirements.rows) || []).map((r) => r.need || '').join('\n');
  assert.ok(need.includes('Join a guild at its hall'), 'prompt requirements show the join hint');
  handleCommand(game, p, 'who');
  assert.ok(msgs(p).includes('guildless'), 'who lists guildless');
});

test('join <guild> before its leader binds the guild (barbarian hall)', () => {
  handleCommand(game, p, 'DIR BARBARIAN');
  assert.match(msgs(p), /Heading to/);
  walk(p, 'hall_barbarian');
  handleCommand(game, p, 'join');
  assert.ok(msgs(p).includes('Whose banner?'), 'bare join lists leaders');
  handleCommand(game, p, 'join barbarian');
  assert.equal(p.guild.id, 'barbarian', 'bound to barbarian guild');
  const joined = msgs(p);
  assert.ok(joined.includes('joined the Barbarian guild'), 'prose confirms joining');
  assert.ok(joined.includes('Warchief Ulfgar'), 'leader named in the rite');
});

test('guilded player cannot join again; guild persists across reload', () => {
  handleCommand(game, p, 'join paladin');
  assert.ok(msgs(p).includes('already walk with the Barbarian'), 'second join refused');
  const reloaded = loadPlayer(p.charId);
  assert.equal(reloaded.guild.id, 'barbarian', 'guild persisted to db');
});

test('hallGuildAt: resolves single-guild halls, not the walk or shared riverhaven hub', () => {
  assert.equal(hallGuildAt('hall_barbarian'), 'barbarian');
  assert.equal(hallGuildAt('rh_hall_barbarian'), 'barbarian');
  assert.equal(hallGuildAt('hall_walk'), null);
  assert.equal(hallGuildAt('rh_guilds'), null);
  assert.equal(hallGuildAt('square'), null);
});

test('join with no leader nearby refuses with the dir hint; RH side halls route to rh_guilds', () => {
  const q = makeGuildless('Lostone');
  handleCommand(game, q, 'join thief');
  assert.ok(msgs(q).includes('no guild leader here'), 'refusal at square');
  assert.ok(msgs(q).includes('dir list guilds'), 'points at dir');
  q.room = 'rh_hall_bard';
  handleCommand(game, q, 'join bard');
  assert.ok(msgs(q).includes('Riverhaven Guilds hall'), 'RH side hall routes to rh_guilds');
});

test('join resolves "barbarian guild", plurals, and leader personal names', () => {
  const a = makeGuildless('Resolvey');
  a.room = 'rh_guilds';
  handleCommand(game, a, 'join bard guild');
  assert.equal(a.guild.id, 'bard', 'suffix "guild" stripped');

  const b = makeGuildless('Pluralist');
  b.room = 'rh_guilds';
  handleCommand(game, b, 'join paladins');
  assert.equal(b.guild.id, 'paladin', 'plural stripped');

  const c = makeGuildless('Namecaller');
  c.room = 'rh_guilds';
  handleCommand(game, c, 'join ulfgar');
  assert.equal(c.guild.id, 'barbarian', 'leader personal name resolves');

  const d = makeGuildless('Warmager');
  d.room = 'rh_guilds';
  handleCommand(game, d, 'join warmage');
  assert.equal(d.guild.id, 'warmage', 'warmage alias resolves');
});

test('guildless cannot train, cast, or circle until they join; hints are contextual', () => {
  const q = makeGuildless('Blocked');
  handleCommand(game, q, 'train evasion');
  assert.ok(msgs(q).includes('You have no guild yet'), 'train refuses guildless');
  handleCommand(game, q, 'circle');
  assert.ok(msgs(q).includes('no guild to advance'), 'circle refuses guildless');
  assert.equal(q.spellsKnown.length, 0, 'no spells known');
  walk(q, 'hall_paladin');
  handleCommand(game, q, 'train armor');
  assert.ok(msgs(q).includes('join paladin'), 'contextual hint names the local hall');
});

test('joining a magic guild grants Circle-1 spells and a mana pool (persisted)', () => {
  const q = makeGuildless('Spellsworn');
  assert.equal(q.maxMana, 0);
  walk(q, 'hall_warmage');
  handleCommand(game, q, 'join warrior mage');
  assert.equal(q.guild.id, 'warmage');
  assert.ok(q.maxMana > 0, 'mana pool opened on joining');
  assert.ok(q.spellsKnown.length > 0, 'circle-1 curriculum granted');
  const reloaded = loadPlayer(q.charId);
  assert.equal(reloaded.maxMana, q.maxMana, 'mana pool persisted');
  assert.equal(reloaded.spellsKnown.length, q.spellsKnown.length, 'spells persisted');
});

test('explicit-guild creation (sims path) still starts guilded instantly', () => {
  const id = createCharacter(acctId, { name: 'Simstod', race: 'human', guild: 'barbarian' });
  const sim = loadPlayer(id);
  assert.equal(sim.guild.id, 'barbarian', 'sims keep instant guild');
  assert.equal(sim.room, 'square');
});

test('dir gives directions for every guild hall in Crossing and Riverhaven', () => {
  const q = makeGuildless('Directioner');
  q.room = 'square';
  for (const g of Object.keys(GUILDS)) {
    q.ws.msgs.length = 0;
    handleCommand(game, q, `dir ${g} 30`);
    const out = msgs(q);
    assert.ok(out.includes('Heading to'), `dir ${g} gives directions`);
    const route = findPath('square', `hall_${g}`);
    assert.ok(route && route.length > 0, `hall_${g} is reachable for verification`);
  }
  q.room = 'rh_square';
  q.ws.msgs.length = 0;
  handleCommand(game, q, 'dir guilds');
  assert.ok(msgs(q).includes('Heading to'), 'rh dir guilds resolves the shared hall');
  for (const g of ['barbarian', 'bard', 'cleric', 'empath', 'moonmage']) {
    q.room = 'rh_square';
    q.ws.msgs.length = 0;
    handleCommand(game, q, `dir ${g}`);
    assert.ok(msgs(q).includes('Heading to'), `rh dir ${g} gives directions`);
  }
});
