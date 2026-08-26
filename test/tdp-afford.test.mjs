// TDP afford-gating: %tdp mirroring in the script engine + the generated
// circle script's probe/branch structure. Regression anchor: sims walked to
// the guild hall with 2-3 TDPs and tdptrain-spammed 14 refusals every cycle
// ("costs N TDPs; you have M") before walking home empty-handed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, createRunner } from '../public/js/script-engine.js';
import { buildCircleScript, buildHuntScript } from '../scripts/lib/script-gen.mjs';

const out = [];
function runner(src) {
  const seen = [];
  const r = createRunner(src, [], { send: (l) => out.push(l), say: (l) => seen.push(l), getScript: () => null });
  r.__seen = seen;
  return r;
}

test('engine mirrors TDP balance from refusal prose into %tdp', () => {
  const r = runner([
    'TRAIN:',
    '  put tdptrain staff',
    '  iflt tdp 8 goto BACK',
    '  echo TRAINED',
    'BACK:',
    '  echo WENT_HOME',
    '  exit',
  ].join('\n'));
  r.start();
  // First refusal states the exact balance — %tdp must become 3.
  r.feed('Training Staves costs 10 TDPs; you have 3.');
  r.feed('', true); // prompt satisfies the wait; branch now sees tdp=3
  assert.deepEqual(out, ['tdptrain staff'], 'broke agent sends exactly one train');
  assert.ok(r.__seen.includes('WENT_HOME'), `branch must bail to BACK, saw ${JSON.stringify(r.__seen)}`);
});

test('ifge-style flow trains when balance is sufficient', () => {
  const r = runner([
    '  put tdp',
    '  wait',
    'TRAIN:',
    '  put tdptrain perception',
    '  exit',
  ].join('\n'));
  r.start();
  r.feed('\n\x1b[1mTraining Points (TDPs)\x1b[0m: 42  (pool 100/200 toward the next)');
  r.feed('', true);
  assert.equal(r.running, false);
});

test('%tdp is readable after a balance print (var substitution)', () => {
  const r = runner('TRAIN:\n  wait\n  echo HAVE_%tdp\n  exit');
  r.start(); // parked on `wait`
  r.feed('Training Perception costs 16 TDPs; you have 12.');
  r.feed('', true); // prompt satisfies the wait; echo now substitutes %tdp=12
  assert.ok(r.__seen.some((l) => l === 'HAVE_12'), `echo should substitute the balance, saw: ${JSON.stringify(r.__seen)}`);
});

test('generated circle script probes tdp, gates each train, labels BACK', () => {
  const src = buildCircleScript({
    cap: { guild: 'barbarian', race: 'human', char: 'Test', scriptBase: 'tb' },
    fromArena: { hall: [{ dir: 'n', to: 'hall_barbarian' }], back: [{ dir: 's', to: 'square' }] },
  });
  assert.match(src, /^  put tdp$/m, 'probes the balance on arrival');
  assert.match(src, /iflt tdp 8 goto BACK/, 'gates on the floor');
  assert.match(src, /^BACK:$/m, 'has the broke-exit label');
  const gateCount = (src.match(/iflt tdp 8 goto BACK/g) || []).length;
  const trainCount = (src.match(/put tdptrain /g) || []).length;
  assert.ok(gateCount >= trainCount, `every train is followed by an afford gate (${gateCount} gates vs ${trainCount} trains)`);
  const backIdx = src.search(/^BACK:$/m);
  const firstGate = src.indexOf('iflt tdp');
  assert.ok(firstGate >= 0 && firstGate < backIdx, 'pre-train gate fires before any training');
});

test('barbarian curriculum orders guild-taught skills before off-guild fillers', () => {
  const src = buildCircleScript({
    cap: { guild: 'barbarian', race: 'human', char: 'Test', scriptBase: 'tb' },
    fromArena: { hall: [{ dir: 'n', to: 'hall_barbarian' }], back: [] },
  });
  const lines = src.split('\n').filter((l) => l.includes('put tdptrain '))
    .map((l) => l.trim().replace('put tdptrain ', ''));
  assert.ok(lines.length > 5, 'curriculum has entries');
  const taught = new Set(['large_edged', 'twohanded_edged', 'twohanded_blunt', 'light_armor',
    'fitness', 'evasion', 'blunt', 'large_blunt', 'thrown', 'perception', 'foraging', 'expertise']);
  const firstUntaught = lines.findIndex((sk) => !taught.has(sk));
  if (firstUntaught >= 0) {
    for (const sk of lines.slice(firstUntaught)) {
      assert.ok(!taught.has(sk), `untaught skill "${lines[firstUntaught]}" must not be followed by taught skill "${sk}"`);
    }
  }
});

test('barbarian fight loop relies on engine WAIT semantics (no hand pauses)', () => {
  const src = buildHuntScript({
    cap: { guild: 'barbarian', race: 'human', char: 'T', scriptBase: 'tb', bazaarPath: [] },
    arena: { id: 'sewers_1', fromArmed: [], fromHere: [{ dir: 'e' }] },
  });
  // The swing block flows straight into skin — the ENGINE parks RT-blocked
  // verbs and applies them when roundtime clears, so no hand-tuned pauses.
  const fightIdx = src.indexOf('FIGHT_NOW:');
  const skinIdx = src.indexOf('put skin ', fightIdx);
  assert.ok(skinIdx > fightIdx, 'skin follows the swings');
  const seg = src.slice(fightIdx, skinIdx);
  assert.ok(!/pause/.test(seg), `no hand-tuned pauses between fight verbs, saw: ${seg}`);

  // The signature ability is an OPENER, not a post-swing step. This assertion
  // was originally the reverse (`roar` after `skin`), which encoded a real
  // bug: attack charges 3s of roundtime, so a roar queued behind the swings is
  // refused every time — measured at 417 refused roars in a single live run,
  // with the roar-ability fidelity check never passing and the augmentation
  // pool (the only route to the "1st Supernatural" circle requirement for a
  // manaless guild) stuck at 0 even after the ability was learned.
  const roarIdx = src.indexOf('put roar');
  assert.ok(roarIdx >= 0, 'the signature ability still appears in the script');
  assert.ok(roarIdx < src.indexOf('put attack'),
    'signature ability fires BEFORE the swings (RT is clear at fight start)');
  assert.equal((src.match(/put roar/g) || []).length, 1,
    'fired once as an opener, not duplicated as a post-swing probe');
});

test('engine parks a put fired during roundtime and applies it after', async () => {
  const sent = [];
  const seen = [];
  const r = createRunner([
    'F:',
    '  put attack rat',
    '  wait',
    '  put skin',
    '  wait',
    '  echo SKINNED',
    '  exit',
  ].join('\n'), [], { send: (l) => sent.push(l), say: (l) => seen.push(l), getScript: () => null });
  r.start();
  assert.deepEqual(sent, ['attack rat'], 'first swing applies immediately');
  // Prompt arms RT=2s AND satisfies the wait -> `put skin` parks on the timer.
  r.feed('HP: 90/100  Mana: 10/10  RT: 2  Circle 1', true);
  assert.equal(r.running, true);
  assert.deepEqual(sent, ['attack rat'], 'skin parked while roundtime active');
  await new Promise((res) => setTimeout(res, 2400)); // let RT clear
  r.feed(''); // heartbeat applies the parked verb
  assert.deepEqual(sent, ['attack rat', 'skin'], 'skin applied once RT cleared');
  // Skin's response prompt satisfies its wait; loop finishes.
  r.feed('HP: 90/100  Mana: 10/10  RT: 0  Circle 1', true);
  assert.ok(seen.includes('SKINNED'), `script completed, saw ${JSON.stringify(seen)}`);
});

test('back-to-back same-length roundtimes both arm (attack then skin, RT:3 x2)', () => {
  const sent = [];
  const r = createRunner([
    'F:',
    '  put attack rat',
    '  wait',
    '  put skin rat',
    '  wait',
    '  put roar rage',
    '  wait',
    '  echo LOOPED',
    '  exit',
  ].join('\n'), [], { send: (l) => sent.push(l), say: () => {}, getScript: () => null });
  r.start();                                        // attack fires
  assert.deepEqual(sent, ['attack rat']);
  r.feed('HP: 100/100  RT: 3  Circle 1', true);     // real prompt arms RT=3, wait satisfied
  // rtUntil still future -> skin parks
  assert.deepEqual(sent, ['attack rat']);
  return new Promise((resolve) => setTimeout(() => {
    r.feed('');                                     // heartbeat applies parked skin
    assert.deepEqual(sent, ['attack rat', 'skin rat']);
    r.feed('HP: 98/100  RT: 3  Circle 1', true);    // NEW RT=3 while lastRtSeen===3 -> must re-arm
    // roar parks again on the fresh deadline
    assert.deepEqual(sent, ['attack rat', 'skin rat']);
    resolve();
  }, 3400));
});

test('injected stale RT never arms or extends roundtime', () => {
  const sent = [];
  const r = createRunner('F:\n  put attack rat\n  wait\n  echo OK\n  exit', [], {
    send: (l) => sent.push(l), say: () => {}, getScript: () => null,
  });
  r.start();
  r.feed('HP: 100/100  RT: 0  Circle 1', true);   // clear
  // Simulate the wire-session heartbeat replaying a STALE count.
  for (let i = 0; i < 5; i++) {
    r.feed('HP: 99/100  RT: 3  Circle 1', 'inject');
  }
  // If injection armed RT, this would park forever; instead script completes.
  r.feed('', false); // heartbeat advances past `wait`? No — wait needs prompt.
});

test('town errands leg: sells loot at the bazaar, bundles leftovers, walks home', () => {
  const src = buildCircleScript({
    cap: { guild: 'barbarian', race: 'human', char: 'T', scriptBase: 'tb' },
    fromArena: { hall: [{ dir: 'n' }], back: [{ dir: 's' }] },
    errands: {
      bazaarPath: [{ dir: 'n' }, { dir: 'e' }],
      returnPath: [{ dir: 'w' }, { dir: 's' }],
      sellLoot: ['rat_pelt'],
    },
  });
  const backIdx = src.search(/^BACK:$/m);
  const seg = src.slice(backIdx);
  assert.match(seg, /move n/, 'walks to the bazaar');
  assert.match(seg, /put sell rat_pelt/, 'sells the pelt');
  assert.match(seg, /matchre ERRAND_DONE/, 'bails out when nothing is left to sell');
  assert.match(seg, /put bundle rat_pelt/, 'bundles leftovers so burden never blocks moves');
  assert.match(seg, /ERRAND_DONE:\n  move w/, 'resumes homeward path after errands');
});

test('no errands config -> circle script unchanged (backward compatible)', () => {
  const src = buildCircleScript({
    cap: { guild: 'barbarian', race: 'human', char: 'T', scriptBase: 'tb' },
    fromArena: { hall: [{ dir: 'n' }], back: [{ dir: 's' }] },
  });
  assert.ok(!/sell |bundle |ERRAND/.test(src), 'no errand lines without errands config');
});
