// Agent boost: xN experience multiplier and accelerated rest recovery for
// speed-run test sessions. Declared test-only divergence from DR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DR_DB_PATH = join(mkdtempSync(join(tmpdir(), 'dr-boost-')), 't.db');
const { migrate } = await import('../server/db.js');
migrate();
const auth = await import('../server/auth.js');
const player = await import('../server/player.js');

test('boost multiplier multiplies skill experience gains', async () => {
  const acc = await auth.registerAccount('boostx10', 'password1');
  const cid = player.createCharacter(acc.accountId, { name: 'Boosty', race: 'human', guild: 'barbarian' });
  const p = player.loadPlayer(cid);
  p.boostMult = 10;
  player.gainSkillExp(p, 'perception', 4);
  assert.equal(p.expPools.perception, 40, '4 exp x10 boost = 40');
  p.boostMult = 1;
  player.gainSkillExp(p, 'evasion', 4);
  assert.equal(p.expPools.evasion, 4, 'no boost = plain 4');
  // clamps: absurd multipliers are capped by handleBoostMessage, but direct
  // assignment of 0/undefined behaves as no boost
  p.boostMult = 0;
  player.gainSkillExp(p, 'climbing', 4);
  assert.equal(p.expPools.climbing, 4);
});

test('boost multiplier accelerates rest recovery', async () => {
  const acc = await auth.registerAccount('boostrest', 'password1');
  const cid = player.createCharacter(acc.accountId, { name: 'Resty', race: 'human', guild: 'barbarian' });
  const p = player.loadPlayer(cid);
  const { Game } = await import('../server/game.js');
  const game = new Game();
  game.init();
  game.stop();
  p.ws = { send() {} };
  p.online = true;
  game.addPlayer(p);
  p.hp = 10;
  p.boostMult = 10;
  const wilds = await import('../server/wilds.js');
  const res = game.startRest(p);
  assert.ok(res.ok, 'rest starts');
  await new Promise((r) => setTimeout(r, 2300));
  // One tick at x10: max(2, floor(maxHp*0.025)) * 10 — for ~145 maxHp that is
  // 3*10=30 hp in one 2s tick (vs 3 unboosted).
  assert.ok(p.hp >= 30, `one boosted tick healed >=30 (got ${p.hp})`);
  game.stopRest(p);
});

test('boost multiplier accelerates exp-to-rank pulse conversion', async () => {
  const acc = await auth.registerAccount('boostpulse', 'password1');
  const cid = player.createCharacter(acc.accountId, { name: 'Pulser', race: 'human', guild: 'barbarian' });
  const p = player.loadPlayer(cid);
  p.boostMult = 10;
  player.gainSkillExp(p, 'perception', 60);
  player.pulseExp(p); // flush all groups immediately (tick omitted)
  assert.ok(p.skills.perception.rank >= 1,
    `rank should rise from pooled exp x10 (got ${JSON.stringify(p.skills.perception)})`);
});
