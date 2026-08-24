// Domain suite: magic.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, db, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
// Walk a player along the derived grid path between rooms (layout-agnostic).
import { findPath } from '../data/grid.js';
function walk(game, pl, to) {
  for (const step of findPath(pl.room, to)) game.move(pl, step);
}


before(() => setupGame());
after(() => teardownGame());

// Total learning in a skill under the pool model: banked field exp + residual
// rank bits + ranks (ranks stand in for already-consumed bits in >0 checks).
const learned = (p, id) => ((p.expPools && p.expPools[id]) || 0)
  + (p.skills[id]?.exp || 0) + (p.skills[id]?.rank || 0);

test('spells command and out-of-combat healing', async () => {
  const acc = await auth.registerAccount('Empathtest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Gentle', race: 'elothean', guild: 'empath' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'spells');
  const spellsMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(spellsMsg, /Soothe/);

  p.hp = p.maxHp - 40;
  const manaBefore = p.mana;
  handleCommand(game, p, 'cast sooth');
  assert.ok(p.hp > p.maxHp - 40, 'heal spell restores hp');
  assert.ok(p.mana < manaBefore, 'heal spell costs mana');

  game.removePlayer(p);
});

test('third spells unlock at circle 5', async () => {
  const { spellsFor } = await import('../data/guilds.js');
  const { GUILDS } = await import('../data/guilds.js');
  for (const g of Object.values(GUILDS)) {
    if (!g.magic) continue;
    const at1 = spellsFor(g, 1).length;
    const at5 = spellsFor(g, 5).length;
    assert.equal(at1, 1, `${g.name} starts with one spell`);
    assert.equal(at5, 3, `${g.name} has three spells by circle 5`);
  }
});

test('mana system: types, perceive, harness, and held mana empowers casts', async () => {
  const { manaTypeFor, roomManaLevel, manaCycle, GUILD_MANA } = await import('../data/mana.js');
  assert.equal(GUILD_MANA.barbarian, 'none');
  assert.equal(GUILD_MANA.thief, 'none');
  assert.equal(manaTypeFor((await import('../data/guilds.js')).GUILDS.cleric).type, 'holy');
  assert.equal(manaTypeFor((await import('../data/guilds.js')).GUILDS.necromancer).type, 'necromantic');
  assert.equal(manaTypeFor((await import('../data/guilds.js')).GUILDS.moonmage).type, 'lunar');

  // Cycles stay bounded and room levels are 0..1.
  for (const t of Object.keys(GUILD_MANA)) {
    const c = manaCycle(GUILD_MANA[t]);
    assert.ok(c >= 0 && c <= 1, `${t} cycle bounded`);
  }
  const g = (await import('../data/guilds.js')).GUILDS.cleric;
  const level = roomManaLevel(g, 'town');
  assert.ok(level >= 0 && level <= 1, 'room mana level bounded');
  assert.equal(roomManaLevel((await import('../data/guilds.js')).GUILDS.barbarian, 'woods'), 0, 'no mana for none-type guilds');

  // perceive works for magic guilds, refused for others.
  const acc = await auth.registerAccount('Moonbeam', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Moonbeam', race: 'elothean', guild: 'moonmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);
  handleCommand(game, p, 'perceive');
  const percMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(percMsg, /lunar mana/, 'perceive reports your guild\'s mana type');
  assert.ok(learned(p, 'attunement') > 0, 'perceive trains attunement');

  // harness fills the held pool up to the attunement-based cap.
  const cap = 10 + p.skills.attunement.rank * 2;
  handleCommand(game, p, 'harness');
  assert.ok(p.heldMana > 0 && p.heldMana <= cap, 'harness fills held mana within cap');

  // held mana is consumed by the next combat cast.
  p.heldMana = 40;
  walk(game, p, 'sewers_1'); // sewers
  const creature = game.creaturesIn(p.room)[0];
  game.startCombat(p, [creature.def]);
  const combat = game.combat.getFor(p);
  p.mana = p.maxMana;
  combat.cast((await import('../data/guilds.js')).spellById(p.guild, 'moon_bolt'), combat.playerTarget);
  assert.equal(p.heldMana, 0, 'cast consumes held mana');
  while (game.combat.getFor(p)) combat.tick();
  game.removePlayer(p);

  // Non-magic guilds cannot perceive or harness.
  const acc2 = await auth.registerAccount('Furyblood', 's3cretword');
  const charId2 = createCharacter(acc2.accountId, { name: 'Furyblood', race: 'human', guild: 'barbarian' });
  const p2 = loadPlayer(charId2);
  const ws2 = fakeWs();
  p2.ws = ws2;
  game.addPlayer(p2);
  handleCommand(game, p2, 'perceive');
  handleCommand(game, p2, 'harness');
  const barbMsg = ws2.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(barbMsg, /no mana|commands no mana/, 'barbarians are refused mana verbs');
  assert.equal(p2.heldMana, 0);
  game.removePlayer(p2);
});

test('mana pulses regen and cambrinth stores energy', async () => {
  const { addItem } = await import('../server/player.js');
  const acc = await auth.registerAccount('Pulsewave', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Pulsewave', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Mana regenerates in pulses while logged in (tickers are stopped in the
  // test harness, so drive the pulse directly like combat.test.mjs).
  p.mana = 5;
  game.manaPulse();
  assert.ok(p.mana > 5, 'mana regen pulses restore mana');

  // Charge a cambrinth band: mana spent, energy stored, arcana trains.
  addItem(p, 'cambrinth_band', 1);
  p.mana = 40;
  const arcanaBefore = learned(p, 'arcana');
  const manaBefore = p.mana;
  handleCommand(game, p, 'charge cambrinth band');
  assert.ok(p.cambrinth && p.cambrinth.charge > 0, 'cambrinth holds a charge');
  assert.equal(p.cambrinth.manaType, 'elemental', 'charged with your guild\'s mana type');
  assert.ok(p.mana < manaBefore, 'charging spends mana');
  assert.ok(learned(p, 'arcana') > arcanaBefore, 'charging trains arcana');

  // Invoke draws the stored energy into held mana.
  const heldBefore = p.heldMana || 0;
  handleCommand(game, p, 'invoke cambrinth band');
  assert.ok((p.heldMana || 0) > heldBefore, 'invoke restores held mana');
  assert.ok(!p.cambrinth || p.cambrinth.charge === 0, 'device drained after invoke');

  // Focus reports stored energy.
  handleCommand(game, p, 'charge cambrinth band');
  handleCommand(game, p, 'focus cambrinth band');
  const msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /energy/, 'focus reports stored energy');

  // Type-mismatch explodes the device.
  p.cambrinth = { itemId: 'cambrinth_band', charge: 4, capacity: 6, manaType: 'holy', updatedAt: Date.now() };
  const hpBefore = p.hp;
  const hadItem = p.inventory.filter((i) => i.item.id === 'cambrinth_band').length;
  handleCommand(game, p, 'charge cambrinth band');
  assert.ok(p.hp < hpBefore, 'mismatched charge damages you');
  assert.ok(p.inventory.filter((i) => i.item.id === 'cambrinth_band').length < hadItem || hadItem === 0, 'device destroyed on mismatch');

  game.removePlayer(p);
});

test('prepare/cast: overchanneling scales cost and risks backlash', async () => {
  const { backfireChance, safeOverchannelPct } = await import('../data/mana.js');
  assert.equal(backfireChance(100, 100), 0, 'safe prepare never backfires');
  assert.equal(backfireChance(250, 100), 0.8, 'big overchannel caps at 80%');
  assert.equal(backfireChance(150, 130), 0.2, 'modest overchannel scales');
  assert.equal(safeOverchannelPct(50), 130, 'Primary Magic raises the safe ceiling');

  // Safe path: prepare 100% then cast — never backfires, heals fully.
  const acc = await auth.registerAccount('Prepwave', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Prepwave', race: 'elothean', guild: 'empath' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);
  const pmBefore = learned(p, 'primary_magic');
  handleCommand(game, p, 'prepare sooth 100');
  assert.ok(p.prepared && p.prepared.spellId === 'soothe' && p.prepared.pct === 100, 'prepare records the spell');
  assert.ok(learned(p, 'primary_magic') > pmBefore, 'prepare trains Primary Magic');
  p.hp = p.maxHp - 30;
  const hpBefore = p.hp;
  handleCommand(game, p, 'cast');
  const msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.equal(p.prepared, null, 'cast consumes the prepared spell');
  assert.ok(p.hp > hpBefore, 'safe cast heals');
  assert.ok(!/backlash/.test(msgs), 'safe cast never backfires');

  // Overchannel path: prepare 250% — cost inflates and it may backfire.
  game.removePlayer(p);
  const acc2 = await auth.registerAccount('Firewave', 's3cretword');
  const charId2 = createCharacter(acc2.accountId, { name: 'Firewave', race: 'human', guild: 'warmage' });
  const p2 = loadPlayer(charId2);
  const ws2 = fakeWs();
  p2.ws = ws2;
  game.addPlayer(p2);
  walk(game, p2, 'sewers_1'); // sewers
  const creature = game.creaturesIn(p2.room)[0];
  game.startCombat(p2, [creature.def]);
  p2.mana = 100;
  handleCommand(game, p2, 'prepare fire_shard 250');
  const manaBefore = p2.mana;
  const hp2Before = p2.hp;
  handleCommand(game, p2, 'cast');
  assert.equal(p2.prepared, null, 'overchannel cast consumes the preparation');
  const overcast = manaBefore - p2.mana >= Math.ceil(9 * 1.5);
  const backfired = p2.hp < hp2Before;
  assert.ok(overcast || backfired, 'overchannel either spends far more mana or backfires');
  while (game.combat.getFor(p2)) game.combat.getFor(p2).tick();
  game.removePlayer(p2);
});

test('moon mage prediction grants an omen buff', async () => {
  const acc = await auth.registerAccount('Predictor', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Oracle', race: 'human', guild: 'moonmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'predict');
  assert.match(ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' '), /Astrology/, 'needs astrology to predict');

  p.skills.astrology.rank = 3;
  handleCommand(game, p, 'predict');
  assert.ok((p.buffs.omen || 0) > 0, 'omen buff granted');
  assert.ok(p.mana < p.maxMana, 'prediction costs mana');

  game.removePlayer(p);
});

test('warmage familiar summons, fights, and survives death', async () => {
  const acc = await auth.registerAccount('Familiar', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Fam', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'summon familiar'); // not at the hall
  assert.equal(p.familiar, null, 'binding requires the hall');

  p.room = 'hall_warmage';
  p.skills.summoning.rank = 1;
  handleCommand(game, p, 'summon familiar');
  assert.ok(p.familiar && p.familiar.alive, 'familiar bound');
  const name = p.familiar.name;

  handleCommand(game, p, 'familiar');
  assert.match(ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' '), new RegExp(name), 'familiar reports');

  // The familiar fights in combat.
  p.room = 'sewers_1';
  const { CREATURES } = await import('../data/creatures.js');
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.rat));
  handleCommand(game, p, 'attack rat');
  let combat = game.combat.getFor(p);
  let guard = 0;
  while (game.combat.getFor(p) && guard++ < 400) combat.tick();
  const fightMsgs = ws.msgs.filter((m) => m.t === 'combat').map((m) => m.msg).join(' ');
  assert.match(fightMsgs, new RegExp(name), 'familiar attacks in combat');

  handleCommand(game, p, 'dismiss familiar');
  assert.equal(p.familiar, null, 'dismissed');

  game.removePlayer(p);
});

test('empath mend takes wounds; living kills leave a stain', async () => {
  const accE = await auth.registerAccount('Empmend', 's3cretword');
  const accH = await auth.registerAccount('EmpmendH', 's3cretword');
  const eId = createCharacter(accE.accountId, { name: 'Mender', race: 'elothean', guild: 'empath' });
  const hId = createCharacter(accH.accountId, { name: 'HurtX', race: 'human', guild: 'paladin' });
  const e = loadPlayer(eId);
  const h = loadPlayer(hId);
  const wse = fakeWs();
  const wsh = fakeWs();
  e.ws = wse;
  h.ws = wsh;
  game.addPlayer(e);
  game.addPlayer(h);

  h.hp = Math.floor(h.maxHp * 0.5);
  const healBefore = e.hp;
  handleCommand(game, e, 'mend HurtX');
  assert.ok(h.hp > Math.floor(h.maxHp * 0.5), 'target healed');
  assert.ok(e.hp < healBefore, 'empath took the wound');

  // Killing a living creature stains the empath.
  e.room = 'sewers_1';
  const { CREATURES } = await import('../data/creatures.js');
  game.roomCreatures.get(e.room).push(game.makeCreature(CREATURES.rat));
  handleCommand(game, e, 'attack rat');
  let combat = game.combat.getFor(e);
  let guard = 0;
  while (game.combat.getFor(e) && guard++ < 400) combat.tick();
  assert.ok(e.empathicStain >= 1, 'living kill stains the empath');

  game.removePlayer(e);
  game.removePlayer(h);
});

test('paladin soul: smite burns it, undead and prayer restore, low soul blocks circling', async () => {
  const acc = await auth.registerAccount('PaladinSoul', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'VowX', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.equal(p.soul, 50, 'starts with a steady soul');
  p.room = 'sewers_1';
  const { CREATURES } = await import('../data/creatures.js');
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.rat));
  handleCommand(game, p, 'attack rat');
  let combat = game.combat.getFor(p);
  handleCommand(game, p, 'smite rat');
  const smiteMsgs = ws.msgs.filter((m) => m.t === 'msg' || m.t === 'combat').map((m) => m.msg).join(' ');
  assert.match(smiteMsgs, /smite/i, 'smite lands');
  assert.equal(p.soul, 35, 'smite burns 15 soul');
  while (game.combat.getFor(p)) game.combat.getFor(p).tick();
  p.hp = p.maxHp;

  // Undead kill restores soul (gear up: a wraith outmatches a fresh paladin).
  const { addItem } = await import('../server/player.js');
  p.circle = 8;
  p.skills.medium_edged = { rank: 20, exp: 0 };
  p.skills.evasion = { rank: 15, exp: 0 };
  p.skills.chain_armor = { rank: 15, exp: 0 };
  addItem(p, 'steel_sword', 1);
  addItem(p, 'ring_mail', 1);
  handleCommand(game, p, 'wield steel_sword');
  handleCommand(game, p, 'wear ring_mail');
  const soulBefore = p.soul;
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.wraith));
  handleCommand(game, p, 'attack wraith');
  combat = game.combat.getFor(p);
  combat.aliveEnemies[0].hp = 1; // deterministic kill
  let guard = 0;
  while (game.combat.getFor(p) && guard++ < 400) combat.tick();
  assert.ok(p.soul > soulBefore, 'slaying undead restores the soul');

  // Low soul blocks circling.
  p.circle = 1;
  p.soul = 5;
  game.move(p, 'e'); game.move(p, 's'); game.move(p, 's'); game.move(p, 's'); game.move(p, 's'); game.move(p, 's');
  p.room = 'hall_paladin';
  p.skills = Object.fromEntries(Object.entries(p.skills).map(([k, v]) => [k, { rank: 10, exp: 0 }]));
  handleCommand(game, p, 'circle');
  assert.equal(p.circle, 1, 'dim soul blocks circling');

  // Prayer restores.
  p.room = 'temple';
  handleCommand(game, p, 'pray');
  assert.equal(p.soul, 7, 'prayer restores soul');

  game.removePlayer(p);
});

test('ranger: wolf companion bonds and fights; beseech buffs', async () => {
  const acc = await auth.registerAccount('RangerPack', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'PackX', race: 'human', guild: 'ranger' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Bond a wolf by killing one (deterministic: force the bond roll; gear up).
  p.room = 'sewers_1';
  const { CREATURES } = await import('../data/creatures.js');
  const { addItem } = await import('../server/player.js');
  p.circle = 4;
  p.skills.medium_edged = { rank: 15, exp: 0 };
  p.skills.evasion = { rank: 12, exp: 0 };
  p.stats.con = Math.max(p.stats.con, 30); // soak variance: bleeding makes fights deadlier
  addItem(p, 'short_sword', 1);
  addItem(p, 'padded_cloth', 1);
  handleCommand(game, p, 'wield short_sword');
  handleCommand(game, p, 'wear padded_cloth');
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.wolf));
  p.skills.perception.rank = 100; // guaranteed bond chance
  handleCommand(game, p, 'attack wolf');
  let combat = game.combat.getFor(p);
  let guard = 0;
  while (game.combat.getFor(p) && guard++ < 400) combat.tick();
  assert.ok(p.companion && p.companion.alive, 'wolf bonded');

  // Beseech wind grants a buff.
  handleCommand(game, p, 'beseech wind');
  assert.ok((p.buffs.wind || 0) > 0, 'wind buff active');
  handleCommand(game, p, 'beseech wind'); // immediate repeat -> spurned
  const spurned = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).at(-1) || '';
  assert.match(spurned, /wary/, 'wilds grow wary of overuse');
  p.beseechAt = 0; // bypass the cooldown for the second test
  handleCommand(game, p, 'beseech sun');
  assert.ok((p.buffs.sun || 0) > 0, 'sun buff active');

  game.removePlayer(p);
});

test('necromancer: animate corpses into risen minions that fight', async () => {
  const acc = await auth.registerAccount('Risen', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Boney', race: 'human', guild: 'necromancer' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  const { CREATURES } = await import('../data/creatures.js');
  const { addItem } = await import('../server/player.js');
  p.room = 'sewers_1';
  p.circle = 4;
  p.skills.small_edged = { rank: 15, exp: 0 };
  addItem(p, 'dagger', 1);
  handleCommand(game, p, 'wield dagger');
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.rat));
  handleCommand(game, p, 'attack rat');
  let combat = game.combat.getFor(p);
  let guard = 0;
  while (game.combat.getFor(p) && guard++ < 400) combat.tick();
  assert.ok((p.corpses || []).length >= 1, 'corpse from the kill');

  handleCommand(game, p, 'animate rat');
  assert.ok(p.risen && p.risen.alive, 'risen raised');
  assert.equal((p.corpses || []).length, 0, 'corpse consumed');

  // The risen fights.
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.rat));
  handleCommand(game, p, 'attack rat');
  combat = game.combat.getFor(p);
  guard = 0;
  while (game.combat.getFor(p) && guard++ < 400) combat.tick();
  const msgs = ws.msgs.filter((m) => m.t === 'combat').map((m) => m.msg).join(' ');
  assert.match(msgs, /risen/, 'risen attacks in combat');

  handleCommand(game, p, 'dismiss risen');
  assert.equal(p.risen, null, 'dismissed');

  game.removePlayer(p);
});

test('cleric devotion: rituals deepen it, holy magic scales', async () => {
  const acc = await auth.registerAccount('Devout', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Faith', race: 'human', guild: 'cleric' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.equal(p.devotion, 30, 'starts with steady devotion');
  handleCommand(game, p, 'devotion');
  assert.match(ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' '), /30\/100/, 'devotion reports');

  p.room = 'temple';
  handleCommand(game, p, 'pray');
  assert.equal(p.devotion, 35, 'devotion ritual deepens faith');
  assert.ok(learned(p, 'theurgy') > 0, 'ritual trains theurgy');

  game.removePlayer(p);
});

test('bard enchantes: cyclic songs with mana upkeep', async () => {
  const acc = await auth.registerAccount('Singer', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Lyric', race: 'human', guild: 'bard' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'enchant war');
  assert.ok(p.cyclic && p.cyclic.song === 'war', 'war enchante active');
  handleCommand(game, p, 'enchante');
  assert.match(ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' '), /Enchante active/, 'status reads');

  // Combat: upkeep drains mana and the song lifts damage.
  const { CREATURES } = await import('../data/creatures.js');
  p.room = 'sewers_1';
  p.circle = 4;
  p.skills.medium_edged = { rank: 15, exp: 0 };
  const { addItem } = await import('../server/player.js');
  addItem(p, 'short_sword', 1);
  handleCommand(game, p, 'wield short_sword');
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.rat));
  handleCommand(game, p, 'attack rat');
  let combat = game.combat.getFor(p);
  let guard = 0;
  while (game.combat.getFor(p) && guard++ < 400) combat.tick();
  assert.ok(p.mana < p.maxMana || !p.cyclic, 'upkeep drained mana');

  handleCommand(game, p, 'enchant off');
  assert.equal(p.cyclic, null, 'song ends');

  game.removePlayer(p);
});
