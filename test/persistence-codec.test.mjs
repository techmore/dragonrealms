import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePersistentState, encodePersistentState,
  PERSISTENT_STATE_SCHEMA, PERSISTENT_STATE_VERSION,
} from '../server/persistence-codec.js';

test('empty and legacy persistent state decode to safe compatibility defaults', () => {
  for (const raw of [null, '', '{}', JSON.stringify({ workOrder: null })]) {
    const decoded = decodePersistentState(raw);
    assert.equal(decoded.diagnostics.canWrite, true);
    assert.equal(decoded.diagnostics.legacyUnversioned, true);
    assert.equal(decoded.state.version, PERSISTENT_STATE_VERSION);
    assert.deepEqual(decoded.state.cooldowns, {});
  }
  const versioned = decodePersistentState(JSON.stringify({ version: 1, scripts: { hunt: 'go north' } }));
  assert.equal(versioned.diagnostics.source, 'legacy-flat-v1');
  assert.deepEqual(versioned.state.scripts, { hunt: 'go north' });
});

test('tagged flat v1 records remain compatible with top-level SQL JSON paths', () => {
  const decoded = decodePersistentState(JSON.stringify({
    schema: PERSISTENT_STATE_SCHEMA,
    version: 1,
    workOrder: { verb: 'forge' },
    forgedQuality: { forged_short_sword: 1.2 },
  }));
  assert.equal(decoded.diagnostics.status, 'ok');
  assert.equal(decoded.diagnostics.source, 'tagged-v1');
  assert.equal(decoded.state.workOrder.verb, 'forge');
  const encoded = JSON.parse(encodePersistentState(decoded.state));
  assert.equal(JSON.parse(JSON.stringify(encoded)).workOrder.verb, 'forge');
  assert.equal(encoded.schema, PERSISTENT_STATE_SCHEMA);
  assert.equal(encoded.version, 1);
});

test('malformed and wrong-type fields repair safely with diagnostics', () => {
  const malformed = decodePersistentState('{broken');
  assert.equal(malformed.diagnostics.status, 'repaired');
  assert.equal(malformed.diagnostics.source, 'malformed');
  assert.equal(malformed.diagnostics.canWrite, true);

  const repaired = decodePersistentState(JSON.stringify({
    abilities: 'dragon', forgedQuality: [], scripts: null, commodities: 7,
    workOrder: [], sleep: 'dreaming', crimeHeat: 'hot', deepSleepSince: null,
    cooldowns: { warhornAt: 10, potionAt: -1, glyphAt: 'later' },
  }));
  assert.equal(repaired.diagnostics.status, 'repaired');
  assert.deepEqual(repaired.state.abilities, []);
  assert.deepEqual(repaired.state.forgedQuality, {});
  assert.deepEqual(repaired.state.scripts, {});
  assert.deepEqual(repaired.state.commodities, {});
  assert.equal(repaired.state.workOrder, null);
  assert.equal(repaired.state.sleep, 'awake');
  assert.equal(repaired.state.crimeHeat, 0);
  assert.deepEqual(repaired.state.cooldowns, { warhornAt: 10 });
  assert.equal(repaired.diagnostics.errors.some((error) => error.path === 'workOrder'), true);
});

test('unsupported schema or version is observable and blocked from overwrite', () => {
  for (const raw of [
    JSON.stringify({ schema: 'future.schema', version: 1 }),
    JSON.stringify({ version: 2 }),
  ]) {
    const decoded = decodePersistentState(raw);
    assert.equal(decoded.diagnostics.status, 'unsupported');
    assert.equal(decoded.diagnostics.canWrite, false);
    assert.match(decoded.diagnostics.source, /^unsupported-/);
  }
});
