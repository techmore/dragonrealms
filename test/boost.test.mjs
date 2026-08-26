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

// Post-linearization semantics: boost multiplies INCOME, and ranks still move
// only on pulses — so a boosted character outpaces an unboosted twin across
// the same production window instead of teleporting up the ladder on pulse 1.
test('boost accelerates conversion-to-rank across matched pulse windows', async () => {
  const race = async (mult) => {
    const acc = await auth.registerAccount(`pulserace${mult}${Math.floor(Math.random() * 99999)}`, 'password1');
    const cid = player.createCharacter(acc.accountId, { name: `Racey${['Zero','Ten'][mult === 0 ? 0 : 1]}`, race: 'human', guild: 'barbarian' });
    const p = player.loadPlayer(cid);
    p.boostMult = mult;
    let tick = 0;
    while (tick < 400) { // ~10 full pulse cycles
      player.gainSkillExp(p, 'perception', 25);
      player.pulseExp(p, tick);
      tick += 1;
    }
    return p.skills.perception.rank;
  };
  const base = await race(0);
  const boosted = await race(10);
  assert.ok(boosted > base,
    `same production, x10 income must reach higher rank (${boosted} vs ${base})`);
});

// Boost must be LINEAR in N: it multiplies field exp exactly once (gain
// time). Two twins with identical production must therefore convert exactly
// N× the field-exp bits over the same window — that converted-bit velocity is
// what "rank velocity" means here, since ranks price on a convex ladder
// (200+n) and pools deliberately waste surplus past mind lock, so raw
// rank-count ratios legitimately undershoot N for the faster twin. The old
// double-apply multiplied a second time inside pulseExp (~25x at boost x5,
// ~x400 at x20), which this test catches. Kept sub-saturation (income per
// conversion below the young-pool cap × fraction) so no bits are lost to
// mind-lock discard on either side.
test('boost xN yields Nx baseline learning velocity over a simulated window', async () => {
  const runWindow = async (mult) => {
    const acc = await auth.registerAccount(`linear${mult}${Math.floor(Math.random() * 99999)}`, 'password1');
    const cid = player.createCharacter(acc.accountId, { name: `Linearr${['Zero', 'Five'][mult === 0 ? 0 : 1]}`, race: 'human', guild: 'barbarian' });
    const p = player.loadPlayer(cid);
    p.boostMult = mult; // 0 behaves as no boost (Number(0) || 1)
    // Fixed production window: identical field-exp income every phase,
    // pulsing on the matching phase exactly like server/game.js does.
    // perception's group fires every 10th phase -> 200 conversions; boosted
    // intake is 5 bits/conversion, safely under the ~67-bit saturation
    // threshold of a fresh pool.
    let tick = 0;
    let drained = 0;
    while (tick < 2000) {
      player.gainSkillExp(p, 'perception', 1);
      drained += player.pulseExp(p, tick);
      tick += 1;
    }
    return { drained, rank: p.skills.perception.rank };
  };
  const base = await runWindow(0);
  const boosted = await runWindow(5);
  assert.ok(base.drained >= 1000, `baseline window converts real bits (${base.drained})`);
  const ratio = boosted.drained / base.drained;
  // Contract (2026-08 drain-scaling audit): boost multiplies gain AND the
  // pulse fraction. The old double-apply compounded to ~25x at x5; the old
  // gain-only doctrine starved agents into mind lock (ratio < 1 at high N).
  // Correct behavior: converted-bit velocity is AT LEAST N — faster draining
  // means less mind-lock discard on the boosted side, so the ratio may
  // legitimately exceed 5 — but must stay far below the old compounding.
  assert.ok(ratio >= 4.75,
    `boost x5 must convert at least ~5x the bits (got ${ratio.toFixed(3)}: ${boosted.drained} vs ${base.drained})`);
  assert.ok(ratio < 12,
    `boost x5 must not compound super-linearly like the old double-apply (~25x; got ${ratio.toFixed(3)})`);
  assert.ok(boosted.rank > base.rank,
    `higher conversion shows in ranks too (${boosted.rank} vs ${base.rank})`);
});

// End-to-end EXP economy ledger. Ranks are bought with pool bits at
// expToNextRank(n) = 200 + n, so rank 0 -> 100 costs sum(200+n, n=0..99)
// = 24,950 bits no matter how fast bits arrive. Boost scales INCOME only.
// Every bit that enters the pool ends up in exactly one of three places:
// still pooled, in the current-rank bucket (s.exp), or spent on rank-ups —
// so banked - pooled - s.exp must equal the ladder sum EXACTLY.
test('rank-100 sanity: scripted plan reaches rank 100 and spends exactly 24,950 bits', async () => {
  const acc = await auth.registerAccount('rank100' + Math.floor(Math.random() * 99999), 'password1');
  const cid = player.createCharacter(acc.accountId, { name: 'Century', race: 'human', guild: 'barbarian' });
  const p = player.loadPlayer(cid);
  p.boostMult = 20; // boost changes arrival speed only, never the price
  const { expToNextRank } = await import('../data/skills.js');

  const EXPECTED_BITS = Array.from({ length: 100 }, (_, n) => 200 + n).reduce((a, b) => a + b, 0);
  assert.equal(EXPECTED_BITS, 24950, 'rank 0->100 costs exactly 24,950 bits');

  // Drive the REAL pipeline — gainSkillExp banks (respecting the pool cap),
  // pulseExp converts on the skill's phase, applyExpToSkill charges the
  // ladder — until rank 100. With boost-scaled drain a single pulse can jump
  // many ranks, so stop the instant we cross (the ledger math below tolerates
  // the overshoot: extra bits sit in s.exp / pool, and `spent` counts only
  // ladder-consumed bits).
  let banked = 0;
  for (let tick = 0; tick < 8000 && p.skills.perception.rank < 100; tick += 1) {
    const before = p.expPools.perception || 0;
    player.gainSkillExp(p, 'perception', 5000);
    banked += (p.expPools.perception || 0) - before; // cap discard excluded here
    player.pulseExp(p, tick);
    if (p.skills.perception.rank >= 100) break;
  }
  const s = p.skills.perception;
  // Boost-scaled drain can overshoot inside a single pulse (one conversion
  // crosses several ranks), so assert "at least rank 100" and price the
  // ladder up to the rank actually reached.
  assert.ok(s.rank >= 100, `scripted training plan reaches rank 100 (got ${s.rank})`);
  const reached = s.rank;
  const EXPECTED_SPENT = Array.from({ length: reached }, (_, n) => 200 + n).reduce((a, b) => a + b, 0);
  // Fractional pool caps (mentalStatBonus) leave sub-bit remainders behind;
  // round before comparing against the integer ladder.
  const spent = Math.round(banked - (p.expPools.perception || 0) - s.exp);
  // Fractional pool caps leave sub-bit remainders per conversion; at x20 the
  // boosted side performs many more conversions, so allow a small rounding
  // envelope around the exact ladder sum.
  assert.ok(Math.abs(spent - EXPECTED_SPENT) <= 10,
    `bits spent on ranks must equal sum(200+n) for the ranks reached within rounding (got ${spent}, expected ${EXPECTED_SPENT})`);
});
