// diversity variant (closeNth): per-kill weapon rotation + exact Nth-slot
// TDP targeting. Companion to weapon-plan.test.mjs.
//
// Why this file exists: the original rotation (%wphase flip-flop) held its
// memory IN THE RUNNER. Every watchdog/regeneration restart builds a fresh
// createRunner with empty vars, and an undefined %wphase interpolates to the
// literal string '%wphase' (sub() leaves unknown %vars intact), which if_1
// read as SET — so after every restart the first kill took the club arm.
// Measured in run roarSmart-giantman (2026-08-27): 16x 'remove throwing
// knives', ZERO 'wield throwing knives' past the last === sweep run marker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../public/js/script-engine.js';
import { buildHuntScript } from '../scripts/lib/script-gen.mjs';

const e = (...d) => d.map((x) => ({ dir: x, to: 'y' }));
const mkHunt = (closeNth) => buildHuntScript({
  cap: {
    guild: 'barbarian', scriptBase: 'tb', trainList: [], bazaarPath: e('n'),
    closeNth,
  },
  arena: { id: 'sewers_1', hall: e('n'), loop: e('n'), fromHere: e('w'), fromArmed: e('s') },
  hallPath: e('n'),
});

// Extract just the generated rotation chain (first ife through its END label).
function rotationSeg(src) {
  const a = src.indexOf('  ife wsp ');
  const endLbl = /ROT_END_\w+:/.exec(src.slice(a));
  return src.slice(a, a + endLbl.index + endLbl[0].length);
}

async function swapFor(seg, weapon, ranks = {}) {
  const sent = [];
  const r = createRunner(seg, [], { send: async (l) => sent.push(l) });
  // WSRANK tokens mirror current weapon-skill ranks (mindstate-fed); without
  // them the requirement-aware skips see rank 0 and keep training everything.
  const toks = Object.entries(ranks).map(([id, n]) => ` [WSRANK:${id}:${n}]`).join('');
  r.feed(`HP: 100/100 Mana: 0/0 RT: 0 Circle 1${weapon ? ` [WEAPON:${weapon}]` : ''}${toks}`, 'inject');
  r.start();
  // In the full script the rotation segment flows back into SCAN (one swap
  // per kill). Here the extracted seg has no SCAN, so the runner re-enters
  // the chain — collect only the first contiguous swap (the semantic action).
  for (let i = 0; i < 20 && r.running; i++) {
    if (!sent.length) r.feed(`You re-arm. HP: 100/100 RT: 0${toks}`, 'prompt');
    if (sent.length >= 2) break;
    await new Promise((res) => setTimeout(res, 1));
  }
  return sent.slice(0, 2);
}

test('ife/ifne engine commands branch on string equality', () => {
  const sent = [];
  // Equal -> jumps over the verb.
  const s1 = ['X:', '  setvariable k v', '  ife k v goto HIT', '  put echo miss', 'HIT:', 'Y:'].join('\n');
  createRunner(s1, [], { send: async (l) => sent.push(l) }).start();
  assert.deepEqual(sent, [], 'equal var must branch past the inline verb');
  const sent2 = [];
  // Unequal -> falls through to the verb.
  const s2 = ['X:', '  ife k v goto HIT', '  put echo fell-through', 'HIT:'].join('\n');
  createRunner(s2, [], { send: async (l) => sent2.push(l) }).start();
  assert.deepEqual(sent2, ['echo fell-through']);
  const sent3 = [];
  const s3 = ['X:', '  ifne k v goto HIT', '  put echo nope', 'HIT:'].join('\n');
  createRunner(s3, [], { send: async (l) => sent3.push(l) }).start();
  assert.deepEqual(sent3, [], 'ifne branches when the var differs (unset != v)');
});

test('closeNth rotation wields the NEXT kit weapon from ground truth', async () => {
  const seg = rotationSeg(mkHunt(true));
  // All weapons below need+margin (8+4=12): straight rotation blunt->knives->staff->blunt.
  const ranks = { blunt: 0, thrown: 0, staff: 0 };
  assert.deepEqual(await swapFor(seg, 'blunt', ranks), ['remove club', 'wield throwing knives']);
  assert.deepEqual(await swapFor(seg, 'small_edged', ranks), ['remove dagger', 'wield throwing knives']);
  assert.deepEqual(await swapFor(seg, 'thrown', ranks), ['remove throwing knives', 'wield club']);
});

test('a weapon at need+4 margin rotates away even though the others are fresh', async () => {
  const seg = rotationSeg(mkHunt(true));
  const satBlunt = { blunt: 12, small_edged: 2, thrown: 1 };
  const res = await swapFor(seg, 'blunt', satBlunt);
  assert.deepEqual(res.filter((x) => x.startsWith('wield')), ['wield dagger'],
    'satisfied holder still rotates onward — exp flows into unsatisfied slots');
});

test('rotation survives cycle restarts — alternation does not need runner state', async () => {
  // Emulate the supervisor: a fresh createRunner each watchdog restart,
  // with whatever the hands snapshot last reported actually in hand. The
  // mindstate rank feed (WSRANK) rides along too, exactly as the harness
  // does it; blunt crosses its need+4 margin at kill 5 which routes exp
  // into the OTHER two categories instead of over-training blunt.
  const seg = rotationSeg(mkHunt(true));
  const order = [];
  let hand = '';                       // fresh cycle: state lost, ground truth kept
  for (let kill = 0; kill < 9; kill++) {
    const ranks = { blunt: kill >= 5 ? 12 : Math.min(kill * 2, 8), thrown: 2, staff: 2 };
    const sent = await swapFor(seg, hand, ranks);
    const wielded = sent.find((l) => l.startsWith('wield '));
    order.push(wielded.replace('wield ', ''));
    hand = { 'throwing knives': 'thrown', dagger: 'small_edged', club: '' }[order[kill]] ?? '';
  }
  assert.ok(order.includes('throwing knives') && order.includes('dagger') && order.includes('club'),
    `all three categories exercised across restarts (${order.join(' -> ')})`);
});

test('baseline keeps the legacy wphase block byte-for-byte (one-lever A/B)', () => {
  const src = mkHunt(false);
  assert.match(src, /if_1 goto ROT_A_rat/, 'legacy dispatch intact');
  assert.ok(!src.includes('ife wsp'), 'no ground-truth rotation in baseline');
  assert.ok(!src.includes('BUY_HELM'), 'no helm block in baseline');
});

test('closeNth adds a second armor CATEGORY purchase (helm = chain_armor)', () => {
  const src = mkHunt(true);
  assert.match(src, /put buy iron helm/, 'buys the iron helm');
  assert.match(src, /put wear iron helm/, 'wears it — armor exp needs a WORN piece');
  assert.match(src, /ifge silver 120 BUY_HELM/, 'purse-gated like the weapon plan');
});

test('fight-block labels stay unique per species with closeNth emitted blocks', () => {
  const defs = buildHuntScript({
    cap: { guild: 'barbarian', scriptBase: 'tb', trainList: [], bazaarPath: e('n'), closeNth: true },
    arena: { id: 'sewers_3', fromHere: e('w'), fromArmed: e('s') },
    hallPath: e('n'),
  }).match(/^[A-Za-z_0-9]+:/gm)?.map((l) => l.slice(0, -1)) || [];
  const dupes = defs.filter((l, i) => defs.indexOf(l) !== i);
  assert.deepEqual(dupes, []);
});
