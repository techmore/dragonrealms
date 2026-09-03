// Audit-fix regression tests (AUDIT-2026-08-28): C1 spawn lifecycle,
// C2 duel ticker dedupe, C9/C16 PvP defeat routing, C17 auth generation,
// D1 shop stock, D10 party leader promotion.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, handleCommand, fakeWs, game,
  setupGame, teardownGame, reviveRoomSpawns,
} from './helpers.mjs';
import { findPath } from '../data/grid.js';

before(() => setupGame());
after(() => teardownGame());

function walk(g, p, to) {
  for (const step of findPath(p.room, to)) g.move(p, step);
  reviveRoomSpawns(g, p.room);
}

function makeChar(name, guild = 'barbarian', race = 'human') {
  return auth.registerAccount(name, 's3cretword').then((acc) => {
    const charId = createCharacter(acc.accountId, { name, race, guild });
    return loadPlayer(charId);
  });
}

// ---------- C1: killing a live spawn depletes the room and schedules respawn ----------

test('C1: killCreature marks the world spawn dead and clocks respawn', async () => {
  const p = await makeChar('Spawnkill');
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);
  walk(game, p, 'sewers_1');
  const inst = game.creaturesIn(p.room)[0];
  assert.ok(inst, 'test room has a live spawn');
  game.startCombat(p, [inst.def], [inst]);
  const combat = game.combat.getFor(p);
  const enemy = combat.enemies[0];
  assert.equal(enemy.instance, inst, 'combat enemy carries the live instance');
  enemy.hp = 0;
  combat.killCreature(enemy);
  assert.equal(inst.alive, false, 'room instance is dead after the kill');
  assert.ok(inst.respawnAt > Date.now(), 'respawn is scheduled in the future');
  assert.equal(game.creaturesIn(p.room).includes(inst), false, 'dead spawn leaves the creature list');
  game.removePlayer(p);
});

test('C1: the respawn ticker revives depleted spawns', async () => {
  const p = await makeChar('Spawngrow');
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);
  walk(game, p, 'sewers_1');
  const inst = game.creaturesIn(p.room)[0];
  game.startCombat(p, [inst.def], [inst]);
  const combat = game.combat.getFor(p);
  combat.enemies[0].hp = 0;
  combat.killCreature(combat.enemies[0]);
  assert.equal(inst.alive, false);
  // Simulate the respawn clock expiring, then one respawnTick pass.
  inst.respawnAt = Date.now() - 1;
  game.respawnTick();
  assert.equal(inst.alive, true, 'expired respawn revives the instance');
  assert.equal(inst.hp, inst.maxHp);
  assert.equal(inst.respawnAt, 0);
  game.removePlayer(p);
});

// ---------- C2: a duel is ticked once per ticker pass, not twice ----------

test('C2: ticker dedupes combats stored under both participants', async () => {
  const a = await makeChar('DedupA', 'barbarian');
  const b = await makeChar('DedupB', 'barbarian');
  for (const p of [a, b]) {
    p.ws = fakeWs();
    game.addPlayer(p);
    b.room = a.room;
  }
  const res = game.combat.startDuel(a, b, 'blood');
  assert.ok(res.ok, 'duel starts: ' + (res.error || ''));
  assert.equal(game.combat.combats.size, 2, 'one map entry per participant');
  let ticks = 0;
  const orig = res.combat.tick.bind(res.combat);
  res.combat.tick = () => { ticks += 1; orig(); };
  game.combat.startTicker();
  await new Promise((r) => setTimeout(r, 1300));
  game.combat.stopTicker();
  const perPass = ticks / Math.max(1, Math.round(1300 / 1000));
  assert.ok(perPass <= 1.5, `one tick per pass (got ~${perPass.toFixed(2)}/s)`);
  game.combat.disconnect(a);
  game.combat.disconnect(b);
  game.removePlayer(a);
  game.removePlayer(b);
});

// ---------- C9: lethal cast against a player defender resolves the duel ----------

test('C9: a lethal spell routes a controller defender to defenderDefeated, not killCreature', async () => {
  const atk = await makeChar('SpellLethal', 'warmage');
  const def = await makeChar('SpellVictim', 'warmage');
  atk.ws = fakeWs();
  def.ws = fakeWs();
  game.addPlayer(atk);
  game.addPlayer(def);
  def.room = atk.room;
  const res = game.combat.startDuel(atk, def, 'blood');
  assert.ok(res.ok, 'duel starts');
  const combat = res.combat;
  const enemy = combat.aliveEnemies[0];
  enemy.hp = 1;
  let corpsePushed = 0;
  const origKill = combat.killCreature.bind(combat);
  combat.killCreature = (t) => { corpsePushed += 1; origKill(t); };
  // Drive the shared resolver (cast()'s tail): defender is controller-backed.
  combat.resolveTargetDefeat(enemy);
  // game.defenderDefeated: loser wakes in the temple at half HP — NOT a
  // creature-style death, and no corpse of the player was pushed.
  assert.equal(def.room, 'temple', 'defender defeated via the PvP lifecycle');
  assert.equal(atk.corpses.length, 0, 'no corpse of the player was pushed');
  assert.equal(corpsePushed, 0, 'killCreature was never invoked');
  game.combat.disconnect(atk);
  game.combat.disconnect(def);
  game.removePlayer(atk);
  game.removePlayer(def);
});

// ---------- C16: splash kills resolve every zero-HP enemy ----------

test('C16: splash-killed creatures do not remain alive at zero HP', async () => {
  const bard = await makeChar('SplashBard', 'bard');
  bard.ws = fakeWs();
  game.addPlayer(bard);
  walk(game, bard, 'sewers_1');
  const insts = game.creaturesIn(bard.room);
  if (insts.length < 2) {
    const extra = game.makeCreature(insts[0].def);
    game.roomCreatures.get(bard.room).push(extra);
    insts.push(extra);
  }
  game.startCombat(bard, insts.map((c) => c.def), insts);
  const combat = game.combat.getFor(bard);
  const [primary, secondary] = combat.enemies;
  const secondaryInstance = secondary.instance;
  primary.hp = 1;
  secondary.hp = 0; // already slain by the splash
  combat.resolveTargetDefeat(primary); // the resolver sweeps splash companions
  assert.equal(secondary.dead, true, 'secondary zero-HP enemy is resolved dead');
  if (secondaryInstance) assert.equal(secondaryInstance.alive, false, 'secondary world instance depleted');
  game.removePlayer(bard);
});

// ---------- C17: a stale login completion cannot resurrect a logged-out session ----------

test('C17: a slower in-flight login cannot beat a newer auth action (generation guard)', async () => {
  await auth.registerAccount('GenGuardAcct', 's3cretword');
  const send = [];
  const session = {
    socket: { readyState: 1, send: () => {} },
    state: 'login', token: null, accountId: null, username: null,
    player: null, gmToken: 'x', isBot: false, charCreate: null,
    cmdTimestamps: [], authGeneration: 0, gmAuthorized: false,
    stateBeforeSpectate: null, game,
    send: (o) => send.push(o),
  };
  const { route } = await import('../server/session.js');
  // Two logins dispatched back-to-back. Each bumps the generation at DISPATCH
  // time (synchronously, before either scrypt resolves), so login#1 is stale
  // no matter how the worker threads interleave — the exact race the guard
  // exists for. Previously the last-to-RESOLVE won and both issued authed.
  route(session, { t: 'login', u: 'GenGuardAcct', p: 's3cretword' });
  route(session, { t: 'login', u: 'GenGuardAcct', p: 's3cretword' });
  await new Promise((r) => setTimeout(r, 250));
  const authed = send.filter((m) => m.t === 'authed');
  assert.equal(authed.length, 1, 'exactly one authed — the stale login discarded itself');
  assert.equal(session.state, 'charcreate', 'session ended in the post-auth state');
  assert.equal(session.username, 'genguardacct', 'session identity belongs to the newest auth');
});

// ---------- D1: purchases decrement real stock (and it shows in list) ----------

test('D1: buying depletes shop stock and listShop reflects it', async () => {
  const p = await makeChar('StockBuyer', 'warmage');
  p.ws = fakeWs();
  game.addPlayer(p);
  p.silver = 5000;
  walk(game, p, 'bazaar'); // Marlene's general store + smithies share this room
  const { economy } = await import('../server/economy.js');
  const shops = economy.shopNpcsIn(p);
  assert.ok(shops.length, 'general store keeper present');
  // The bazaar stacks several vendors; mags (firewood) stocks nothing, so
  // pick the first shop that actually carries wares.
  const shop = shops.find((s) => Object.keys(s.stock).length > 0);
  assert.ok(shop, 'a stocked shop is present');
  const firstId = Object.keys(shop.stock)[0];
  const before = shop.stock[firstId];
  assert.ok(before > 0, 'stock exists before purchase');
  const r1 = economy.buy(p, firstId, 1);
  assert.ok(r1.ok, 'purchase succeeds: ' + (r1.msg || ''));
  assert.equal(shop.stock[firstId], before - 1, 'stock decremented by exactly one');
  const r2 = economy.buy(p, firstId, before + 10);
  assert.equal(r2.ok, false, 'cannot buy more than stock');
  assert.match(r2.msg, /do not have that many in stock/);
  game.removePlayer(p);
});

// ---------- D10: a departing leader promotes a successor ----------

test('D10: leader leave promotes the next member instead of orphaning the party', async () => {
  const { partyLeave } = await import('../server/pvp.js');
  const leader = await makeChar('PartyLead', 'barbarian');
  const m2 = await makeChar('PartyTwo', 'barbarian');
  const m3 = await makeChar('PartyThree', 'barbarian');
  for (const pl of [leader, m2, m3]) { pl.ws = fakeWs(); game.addPlayer(pl); pl.room = leader.room; }
  const party = { id: 'p_test', leader: leader.charId, members: [leader.charId, m2.charId, m3.charId] };
  leader.party = party; m2.party = party; m3.party = party;

  partyLeave(game, leader);
  assert.equal(m2.party.leader, m2.charId, 'leadership promoted to first remaining member');
  assert.equal(m3.party.leader, m2.charId, 'members share the same party object');
  assert.equal(m2.party.members.includes(leader.charId), false, 'departing leader removed from roster');
  assert.ok(m3.party, 'party survives leader departure');

  // Party of one remaining disbands, as before.
  partyLeave(game, m2);
  assert.equal(m3.party, null, 'party of one disbands');
  for (const pl of [leader, m2, m3]) game.removePlayer(pl);
});
