import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const HASHED_SOURCES=Object.freeze({
  codeHashRegistry:'scripts/lib/jev-player-code-hashes.mjs',
  player:'scripts/jev-player.mjs',
  jevClient:'scripts/lib/jev.mjs',
  isolatedWorldLauncher:'scripts/jev-player-world.mjs',
  wireSession:'scripts/lib/wire-session.mjs',
  decisionPolicy:'scripts/lib/jev-player-policy.mjs',
  progressObserver:'scripts/lib/jev-progress.mjs',
  statPolicy:'scripts/lib/jev-stat-policy.mjs',
  observationPolicy:'scripts/lib/jev-observation-policy.mjs',
  combatEvidence:'scripts/lib/jev-combat-evidence.mjs',
  lootAccounting:'scripts/lib/jev-loot.mjs',
  jevProviderPolicy:'scripts/lib/jev-provider-policy.mjs',
  laneCoach:'scripts/lib/jev-lane-coach.mjs',
  rtPrefetch:'scripts/lib/jev-rt-prefetch.mjs',
});

export function captureJevPlayerCodeHashes(root) {
  return Object.fromEntries(Object.entries(HASHED_SOURCES).map(([key,relative])=>
    [key,createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')]));
}

export function mismatchedJevPlayerCodeHashes(expected,actual) {
  if (!expected || !actual) return ['missing-code-hashes'];
  return [...new Set([...Object.keys(expected),...Object.keys(actual)])]
    .filter(key=>!expected[key]||!actual[key]||expected[key]!==actual[key])
    .sort();
}

export function assessJevQueueCodeIntegrity({pinnedCodeHashes,currentCodeHashes,
  prerequisiteCodeHashes=[]}={}) {
  const sourceDrift=mismatchedJevPlayerCodeHashes(pinnedCodeHashes,currentCodeHashes);
  const prerequisiteDrift=prerequisiteCodeHashes.flatMap(({id,codeHashes})=>
    mismatchedJevPlayerCodeHashes(pinnedCodeHashes,codeHashes)
      .map(key=>`${id}:${key}`));
  return {valid:!sourceDrift.length&&!prerequisiteDrift.length,
    sourceDrift,prerequisiteDrift};
}

export function invalidateJevQueueForIntegrity(queue,integrity,reasonPrefix='Code changed') {
  if (integrity?.valid) return false;
  queue.status='invalidated';
  queue.finishedAt=new Date().toISOString();
  queue.integrityFailure={
    reason:reasonPrefix,
    sourceDrift:integrity?.sourceDrift||[],
    prerequisiteDrift:integrity?.prerequisiteDrift||[],
  };
  return true;
}
