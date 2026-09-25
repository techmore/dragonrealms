import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { instrumentJevCurriculumBridgeSource } from '../scripts/lib/jev-curriculum-bridge.mjs';

const source = fs.readFileSync(new URL('../scripts/jev-player.mjs', import.meta.url), 'utf8');

test('curriculum bridge source hook is exact-entrypoint additive and fail-closed', () => {
  const transformed=instrumentJevCurriculumBridgeSource(source,{extensionHash:'test-hash'});
  assert.match(transformed,/bridgeCurriculumAction/);
  assert.match(transformed,/harness-extension.*jev-curriculum-bridge/);
  assert.match(transformed,/prefetchHpFloor/);
  assert.equal((transformed.match(/minHpFraction:JEV_CURRICULUM_BRIDGE_PREFETCH_HP_FLOOR/g) || []).length,2);
  assert.equal(transformed.indexOf('#!'),0,'preserve the executable hashbang at byte zero');
  const anchor='      repeatedOverrideReleaseAfter,\n    });';
  assert.throws(()=>instrumentJevCurriculumBridgeSource(source.replace(anchor,anchor.replace('repeatedOverrideReleaseAfter','repeatedOverrideReleaseAfterX')),{}),/Expected one supervised choice anchor/);
});
