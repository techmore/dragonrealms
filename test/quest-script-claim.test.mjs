import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCircleScript } from '../scripts/lib/script-gen.mjs';

const script = errands => buildCircleScript({
  cap: { guild: 'barbarian', race: 'human', char: 'Scriptcheck', circle: 1, scriptBase: 'q-', skipCircle: true, trainList: [], finishKit: true },
  fromArena: { hall: [], back: [] },
  errands: { bazaarPath: [{ dir: 'n' }], returnPath: [{ dir: 's' }], sellLoot: [], ...errands },
});

test('generated crier visits claim explicitly before reviewing or requesting the next quest', () => {
  const source = script({ crierPath: [{ dir: 'w' }], crierBack: [{ dir: 'e' }], crierRoom: 'square' });
  const gate = source.indexOf('ifne room square goto CRIER_DONE');
  const claim = source.indexOf('put claim');
  const quest = source.indexOf('put quest');
  assert.ok(gate >= 0 && claim > gate && quest > claim);
  assert.match(source.slice(claim, quest), /put claim\n\s+wait/);
});

test('a script without a crier detour never injects a reward claim', () => {
  assert.doesNotMatch(script({}), /put claim/);
});
