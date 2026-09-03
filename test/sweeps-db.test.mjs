import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSweepsDb, insertSweep } from '../scripts/lib/sweeps-db.mjs';

test('sweep history preserves the experiment cohort and reproducibility fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dr-sweeps-'));
  try {
    const db = openSweepsDb(dir);
    insertSweep(db, {
      run_id: 'test', ts: new Date(0).toISOString(), guild: 'barbarian', race: 'gortog',
      variant: 'armorStack', targetCircle: 2, boost: 20, minutesCap: 40,
      mode: 'benchmark', arena: 'sewers_1', species: ['sewer rat'],
      variantConfig: { armorStack: true }, scriptHash: 'abcd1234', scriptSchemaVersion: 2,
      completedTarget: 1, closurePerMin: 2.08,
      finalRequirements: { target: 2, missing: [] },
      shortfallFirst: 84, shortfallLast: 0,
      gapsSamples: [{ m: 1, shortfall: 84, blocked: 19 }, { m: 2, shortfall: 0, blocked: 0 }],
      expRateSamples: [{ m: 1, totalRanks: 12, delta: 12, ranksPerMin: 12, shortfall: 84, blocked: 19, overtrained: ['evasion=9'] }],
      codeRevision: 'abc-dirty', startingCircle: 1, startingTotalRanks: 0,
      commandCounts: { attacks: 12, moves: 8 },
      milestoneEvents: [{ id: 'world_entry', ms: 1200, ts: new Date(1200).toISOString() }],
    });
    const row = db.prepare('SELECT * FROM sweeps WHERE run_id = ?').get('test');
    assert.equal(row.targetCircle, 2);
    assert.equal(row.boost, 20);
    assert.equal(row.minutesCap, 40);
    assert.equal(row.completedTarget, 1);
    assert.deepEqual(JSON.parse(row.species), ['sewer rat']);
    assert.deepEqual(JSON.parse(row.variantConfig), { armorStack: true });
    assert.deepEqual(JSON.parse(row.finalRequirements), { target: 2, missing: [] });
    assert.equal(row.shortfallFirst, 84);
    assert.equal(row.shortfallLast, 0);
    assert.deepEqual(JSON.parse(row.gapsSamples), [
      { m: 1, shortfall: 84, blocked: 19 }, { m: 2, shortfall: 0, blocked: 0 },
    ]);
    assert.deepEqual(JSON.parse(row.expRateSamples), [
      { m: 1, totalRanks: 12, delta: 12, ranksPerMin: 12, shortfall: 84, blocked: 19, overtrained: ['evasion=9'] },
    ]);
    assert.equal(row.codeRevision, 'abc-dirty');
    assert.deepEqual(JSON.parse(row.commandCounts), { attacks: 12, moves: 8 });
    assert.deepEqual(JSON.parse(row.milestoneEvents), [{ id: 'world_entry', ms: 1200, ts: new Date(1200).toISOString() }]);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
