import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCorpus, sanitizeCorpusMessages } from '../scripts/lib/corpus-normalize.mjs';

const transcript = [
  { t: 'authed', token: 'a'.repeat(64) },
  { t: 'enter', msg: 'You are Corpalice, account corp123.' },
  { t: 'prompt', msg: 'HP: 70/80 Mana: 30/40 Stamina: 50/60 RT: 2 Circle 3 105 silvers', journey: { characterId: 17, hp: 70, maxHp: 80, circle: 3 } },
  { t: 'msg', msg: 'STR 35 AGI 20 Spell slots 3/6 Need 12 ranks; item abcdef1234567890abcdef1234567890' },
  { t: '>>', cmd: 'deposit 10' },
];
const actor = { name: 'Corpalice', username: 'corp123', characterId: 17 };

test('known generated actors and only the authed token field normalize without mutating input', () => {
  const other = structuredClone(transcript);
  other[0].token = 'b'.repeat(64); other[1].msg = 'You are Corpbob, account corp999.'; other[2].journey.characterId = 99;
  assert.equal(normalizeCorpus(transcript, actor), normalizeCorpus(other, { name: 'Corpbob', username: 'corp999', characterId: 99 }));
  assert.equal(transcript[0].token, 'a'.repeat(64));
  const result = normalizeCorpus(transcript, actor);
  assert.match(result, /abcdef1234567890abcdef1234567890/);
  assert.match(result, /CORPUS_CHARACTER_ID/);
  assert.match(result, /deposit 10/);
});

test('every gameplay numeric mutation remains visible, including prompt vitals, RT and command amounts', () => {
  const baseline = normalizeCorpus(transcript, actor);
  const mutations = [
    (x) => { x[2].msg = x[2].msg.replace('70/80', '71/80'); },
    (x) => { x[2].msg = x[2].msg.replace('30/40', '31/40'); },
    (x) => { x[2].msg = x[2].msg.replace('50/60', '51/60'); },
    (x) => { x[2].msg = x[2].msg.replace('RT: 2', 'RT: 3'); },
    (x) => { x[2].msg = x[2].msg.replace('Circle 3', 'Circle 4'); },
    (x) => { x[2].msg = x[2].msg.replace('105 silvers', '106 silvers'); },
    (x) => { x[2].journey.hp++; }, (x) => { x[2].journey.maxHp++; }, (x) => { x[2].journey.circle++; },
    (x) => { x[3].msg = x[3].msg.replace('STR 35', 'STR 36'); },
    (x) => { x[3].msg = x[3].msg.replace('3/6', '4/6'); },
    (x) => { x[4].cmd = 'deposit 11'; },
  ];
  for (const mutate of mutations) { const changed = structuredClone(transcript); mutate(changed); assert.notEqual(normalizeCorpus(changed, actor), baseline); }
});

test('unknown identifiers, non-auth token fields, frame ordering and omitted frames cause drift', () => {
  const baseline = normalizeCorpus(transcript, actor);
  for (const change of [
    (x) => { x[1].msg += ' CorpaliceExtra'; },
    (x) => { x[2].journey.characterId = 18; },
    (x) => { x[3].token = 'secret-looking-but-not-auth'; },
    (x) => { [x[3], x[4]] = [x[4], x[3]]; },
    (x) => { x.pop(); },
  ]) { const changed = structuredClone(transcript); change(changed); assert.notEqual(normalizeCorpus(changed, actor), baseline); }
});

test('periodic mindstate positioning and prose whitespace remain explicitly incidental', () => {
  const other = structuredClone(transcript); other.splice(2, 0, { t: 'mindstate', skills: [{ rank: 999 }] });
  other[1].msg = 'You are\n Corpalice, account corp123.';
  assert.equal(normalizeCorpus(other, actor), normalizeCorpus(transcript, actor));
});

test('capture sanitation strips authentication secrets without changing gameplay fields', () => {
  const sanitized = sanitizeCorpusMessages(transcript);
  assert.equal(sanitized[0].token, 'SESSION_TOKEN');
  assert.deepEqual(sanitized.slice(1), transcript.slice(1));
  assert.ok(!JSON.stringify(sanitized).includes('a'.repeat(64)));
});


test('actor identity adjacent to ANSI color sequences normalizes while color and other names remain exact', () => {
  const left = [{ t: 'msg', msg: '\x1b[1mCorpalice\x1b[0m Circle 12' }];
  const right = [{ t: 'msg', msg: '\x1b[1mCorpbob\x1b[0m Circle 12' }];
  assert.equal(normalizeCorpus(left, { name: 'Corpalice' }), normalizeCorpus(right, { name: 'Corpbob' }));
  assert.notEqual(normalizeCorpus([{ t: 'msg', msg: 'PrefixCorpalice Circle 12' }], { name: 'Corpalice' }), normalizeCorpus([{ t: 'msg', msg: 'PrefixCorpbob Circle 12' }], { name: 'Corpbob' }));
  assert.notEqual(normalizeCorpus(left, { name: 'Corpalice' }), normalizeCorpus([{ t: 'msg', msg: '\x1b[2mCorpbob\x1b[0m Circle 12' }], { name: 'Corpbob' }));
});
