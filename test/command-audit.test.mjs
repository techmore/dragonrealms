import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registryDeclarations, auditCommandContracts } from '../scripts/lib/command-audit.mjs';
const entry = (verb, aliases = []) => ({ verb, aliases, category: 'Character', syntax: `${verb} [target]`, description: 'A command.' });
const fixture = () => ({ modules: { world: [{ verb: 'look', handler: 'look', line: 1 }, { verb: 'l', handler: 'look', line: 2 }, { verb: 'other', handler: 'other', line: 3 }] }, metadata: { look: { aliases: ['l'] } }, movement: { go: {} }, catalog: [entry('look', ['l'])], categories: ['Character', 'Client'], localCommands: ['find'] });

test('extracts literal keys and direct handler identity without evaluating any handler body', () => {
  const source = `export const commands = {
  look, l: look,
  method(ctx) { throw new Error('never execute'); },
  arrow: (ctx) => { process.exit(99); },
  'shield-bash': (ctx) => maneuver(ctx, 'bash'),
  fake: function () { const text = 'missing: handler'; /* ignored */ },
};`;
  assert.deepEqual(registryDeclarations(source).map(({ verb, handler }) => ({ verb, handler })), [
    { verb: 'look', handler: 'look' }, { verb: 'l', handler: 'look' }, { verb: 'method', handler: null }, { verb: 'arrow', handler: null }, { verb: 'shield-bash', handler: null }, { verb: 'fake', handler: null },
  ]);
  assert.throws(() => registryDeclarations('export const commands = buildCommands();'), /Unsupported/);
  assert.throws(() => registryDeclarations('export const commands = { ...other };'), /Unsupported/);
});

test('literal brackets and separators inside handlers cannot hide or forge registry keys', () => {
  const source = `const fakeStart = ['export', 'const', 'commands', '=', '{'];
export const commands = {
  first: (ctx) => { ctx.say('('); ctx.say('}'); ctx.say(','); const brackets = [']', ')', '{', '[']; },
  second: (ctx) => ctx.say("}"),
  third: (ctx) => ctx.say(\`Text \${"}"} and \${'('}\`),
  last,
};`;
  assert.deepEqual(registryDeclarations(source).map((entry) => entry.verb), ['first', 'second', 'third', 'last']);
  assert.throws(() => registryDeclarations("const fakeStart = ['export', 'const', 'commands', '=', '{'];"), /Unsupported/);
});

test('curated coverage is informational and recognized local commands are accepted', () => {
  const input = fixture();
  input.catalog.push({ ...entry('find'), category: 'Client', local: true });
  const result = auditCommandContracts(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.information[0].commands, ['go', 'other']);
  assert.equal(result.counts.localGuideEntries, 1);
});

test('duplicate identifiers, missing usage/category/description and unknown commands fail', () => {
  const input = fixture();
  input.catalog.push(entry('look'), { verb: 'unknown', aliases: [] });
  const result = auditCommandContracts(input);
  for (const code of ['duplicate-guide-command', 'invalid-category', 'missing-usage', 'missing-description', 'unknown-guide-command']) assert.ok(result.issues.some((issue) => issue.code === code), code);
});

test('unknown local routes, guide aliases and syntax mismatches are actionable', () => {
  const input = fixture();
  input.catalog = [{ ...entry('look', ['missing', 'missing']), syntax: 'other target' }, { ...entry('fake', ['fake-alias']), local: true }];
  const result = auditCommandContracts(input);
  for (const code of ['usage-command-mismatch', 'unknown-guide-alias', 'duplicate-guide-alias', 'unknown-local-command', 'unknown-local-alias']) assert.ok(result.issues.some((issue) => issue.code === code), code);
});

test('metadata alias resolution and direct handler identity catch mismatches', () => {
  const input = fixture();
  input.catalog = [entry('other', ['l']), entry('look', ['other'])];
  const result = auditCommandContracts(input);
  assert.ok(result.issues.some((issue) => issue.code === 'guide-alias-mismatch'));
  assert.ok(result.issues.some((issue) => issue.code === 'guide-handler-mismatch'));
});

test('registry and metadata duplicate/unknown definitions fail', () => {
  const input = fixture();
  input.modules.extra = [{ verb: 'look', line: 1 }];
  input.metadata = { look: { aliases: ['l', 'absent', 'other'] }, other: { aliases: ['l'] }, nonexistent: {} };
  const result = auditCommandContracts(input);
  for (const code of ['duplicate-registry-command', 'unknown-metadata-command', 'unknown-metadata-alias', 'canonical-alias-conflict', 'duplicate-metadata-alias']) assert.ok(result.issues.some((issue) => issue.code === code), code);
});

test('CLI runs despite an unusable database path, emits JSON and rejects unknown flags', () => {
  const path = fileURLToPath(new URL('../scripts/audit-commands.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [path, '--json'], { encoding: 'utf8', env: { ...process.env, DR_DB_PATH: '/dev/null/never-open.sqlite' } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.ok(report.counts.registryCommands > 100);
  assert.ok(report.information.some((entry) => entry.code === 'uncovered-dispatcher-commands'));
  assert.equal(spawnSync(process.execPath, [path, '--invalid'], { encoding: 'utf8' }).status, 2);
});

test('passive panel metadata resolves declared aliases without evaluating handlers', () => {
  const input = fixture();
  input.metadata.look = { panelSafe: true, aliases: ['l'], mutates: [], rt: { gate: false }, requires: { guild: 'fighter' } };
  const result = auditCommandContracts(input);
  assert.equal(result.ok, true);
  assert.equal(result.counts.panelSafeCanonicalCommands, 1);
  assert.equal(result.counts.panelSafeResolvedCommands, 2);
  assert.deepEqual(result.panelSafeCommands, [{ name: 'l', canonical: 'look', aliasOf: 'look' }, { name: 'look', canonical: 'look', aliasOf: null }]);
  assert.match(result.scope.panelContractLimitations, /handler purity/);
});

test('passive panels cannot declare mutations, roundtime gating or exemptions', () => {
  const input = fixture();
  input.metadata.look = { panelSafe: true, aliases: ['l'], mutates: ['player', 'world'], rt: { gate: true, exempt: 'desperateFlee' } };
  const result = auditCommandContracts(input);
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.filter(issue => issue.code.startsWith('panel-')).map(issue => issue.path), ['metadata.look.mutates', 'metadata.look.rt.gate', 'metadata.look.rt.exempt']);
  input.metadata.look.panelSafe = false;
  assert.equal(auditCommandContracts(input).ok, true);
});

test('malformed metadata fields yield precise schema issues instead of normalized coercions or crashes', () => {
  const cases = [
    ['panelSafe', 'yes', 'panelSafe'], ['rt', [], 'rt'], ['rt', { gate: 'yes' }, 'rt.gate'],
    ['rt', { exempt: 'invented' }, 'rt.exempt'], ['rt', { delay: 2 }, 'rt.delay'],
    ['mutates', ['player', null], 'mutates'], ['capabilities', 'magic', 'capabilities'],
    ['requires', [], 'requires'], ['aliases', { some: 'not a function' }, 'aliases'],
    ['aliases', ['UPPERCASE'], 'aliases'], ['validation', 'invented', 'validation'],
    ['inventedField', true, 'inventedField'],
  ];
  for (const [field, value, expected] of cases) {
    const input = fixture();
    input.metadata.look = { [field]: value };
    const result = auditCommandContracts(input);
    assert.equal(result.ok, false, field);
    assert.ok(result.issues.some(issue => issue.code === 'invalid-metadata-schema' && issue.path === `metadata.look.${expected}`), expected);
  }
});

test('malformed whole metadata and null definitions fail cleanly; unsupported command identifiers fail', () => {
  const input = fixture();
  input.metadata = null;
  assert.ok(auditCommandContracts(input).issues.some(issue => issue.path === 'metadata'));
  input.metadata = { look: null };
  assert.ok(auditCommandContracts(input).issues.some(issue => issue.path === 'metadata.look'));
  input.metadata = { UPPERCASE: {} };
  assert.ok(auditCommandContracts(input).issues.some(issue => issue.code === 'invalid-metadata-command'));
});
