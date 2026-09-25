import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommandMetadata, commandMetadata, normalizeCommandMetadata, roundtimeCommands,
} from '../server/commands/metadata.js';

test('metadata normalizes stable defaults and validates structural fields', () => {
  const meta = normalizeCommandMetadata({ aliases: ['one', 'one'], mutates: ['player'] });
  assert.deepEqual(meta.aliases, ['one']);
  assert.equal(meta.rt.gate, false);
  assert.equal(meta.rt.exempt, null);
  assert.equal(meta.validation, 'custom');
  assert.equal(meta.panelSafe, false);
  assert.throws(() => normalizeCommandMetadata({ aliases: 'one' }), /array/);
  assert.throws(() => normalizeCommandMetadata({ rt: { exempt: 'invented' } }), /exemption/);
  assert.throws(() => normalizeCommandMetadata({ validation: 'guess' }), /validation/);
});

test('canonical metadata is inherited by static aliases', () => {
  const registry = { attack() {}, kill() {}, tend() {}, bandage() {}, look() {} };
  const metadata = buildCommandMetadata(registry, {
    attack: { aliases: ['kill'], rt: { gate: true }, mutates: ['combat'] },
    tend: { aliases: ['bandage'], rt: { gate: true } },
  });

  assert.equal(commandMetadata(metadata, 'attack').aliasOf, null);
  assert.equal(commandMetadata(metadata, 'kill').canonical, 'attack');
  assert.equal(commandMetadata(metadata, 'kill').rt.gate, true);
  assert.deepEqual(commandMetadata(metadata, 'kill').mutates, ['combat']);
  assert.equal(commandMetadata(metadata, 'bandage').canonical, 'tend');
  assert.equal(commandMetadata(metadata, 'look').rt.gate, false);
  assert.deepEqual([...roundtimeCommands(metadata)].sort(), ['attack', 'bandage', 'kill', 'tend']);
});

test('metadata merge rejects unknown commands, missing aliases, and alias conflicts', () => {
  assert.throws(() => buildCommandMetadata({ look() {} }, { attack: {} }), /unknown command "attack"/);
  assert.throws(() => buildCommandMetadata({ attack() {} }, { attack: { aliases: ['kill'] } }), /unknown command "kill"/);
  assert.throws(() => buildCommandMetadata({ attack() {}, kill() {}, trip() {} }, {
    attack: { aliases: ['kill'] },
    trip: { aliases: ['kill'] },
  }), /claimed by both/);
  assert.throws(() => buildCommandMetadata({ attack() {}, kill() {} }, {
    attack: { aliases: ['kill'] },
    kill: { rt: { gate: true } },
  }), /also a canonical metadata command/);
});

test('panel metadata remains canonical-only', () => {
  const registry = { score() {}, stats() {}, inventory() {}, inv() {} };
  const metadata = buildCommandMetadata(registry, {
    score: { panelSafe: true }, inventory: { panelSafe: true },
  });
  assert.equal(commandMetadata(metadata, 'score').panelSafe, true);
  assert.equal(commandMetadata(metadata, 'stats').panelSafe, false);
  assert.equal(commandMetadata(metadata, 'inventory').panelSafe, true);
  assert.equal(commandMetadata(metadata, 'inv').panelSafe, false);
});
