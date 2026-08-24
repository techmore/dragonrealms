// Paper-doll unit tests: client-side mapping tables must stay in lockstep
// with their server-side sources, or the figure silently lies.
// - HEALTH_LEVEL_OF_WORD (public/js/status.js) must cover every word in the
//   VITALITY_WORDS ladder — an uncovered word would render as "healthy".
// - PART_TO_REGION must map every BODY_PARTS entry (server/wounds.js) to at
//   least one doll region — an unmapped part would never pulse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const statusJs = await readFile(join(root, 'public/js/status.js'), 'utf8');
const woundsJs = await readFile(join(root, 'server/wounds.js'), 'utf8');

function extractObjectLiteral(source, name) {
  const start = source.indexOf(`${name} = {`);
  assert.ok(start !== -1, `${name} not found in public/js/status.js`);
  // Walk braces from the first one after '='.
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (!depth) return source.slice(source.indexOf('{', start), i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

test('HEALTH_LEVEL_OF_WORD covers every vitality word', async () => {
  // VITALITY_WORDS is client-side too; both ladders live in status.js.
  const words = [...statusJs.matchAll(/\[[-\d.]+, '([a-z ]+)'\]/g)].map((m) => m[1]);
  assert.ok(words.length >= 10, `expected the full vitality ladder, got ${words.length} words`);
  const map = extractObjectLiteral(statusJs, 'HEALTH_LEVEL_OF_WORD');
  for (const w of words) {
    assert.ok(
      map.includes(`'${w}':`) || map.includes(`${w}:`) || map.includes(` ${w}:`),
      `vitality word "${w}" has no health level`
    );
  }
});

test('PART_TO_REGION maps every wound body part', () => {
  const parts = [...woundsJs.matchAll(/'([a-z ]+)'/g)]
    .map((m) => m[1])
    .filter((s) => s.includes(' ') || ['head', 'chest', 'abdomen', 'back'].includes(s));
  const map = extractObjectLiteral(statusJs, 'PART_TO_REGION');
  for (const part of new Set(parts)) {
    const key = part.includes(' ') ? `'${part}'` : `${part}:`;
    assert.ok(map.includes(key), `body part "${part}" maps to no doll region`);
  }
});

test('parsePrompt carries the tended flag into wound objects', () => {
  // The regex captures ", tended" but historically dropped it, leaving
  // .pd-tended CSS unreachable.
  const section = statusJs.slice(statusJs.indexOf('promptState.wounds = bleed'));
  const obj = section.slice(0, section.indexOf('];'));
  assert.ok(/tended:/.test(obj), 'wound objects must include a tended field');
});
