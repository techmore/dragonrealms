import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { moduleReferences, auditModuleSources, collectModuleFiles } from '../scripts/lib/module-audit.mjs';

function audit(sources) {
  return auditModuleSources({ root: '/project', sources, exists: (path) => Object.hasOwn(sources, relative('/project', path)) });
}

test('static side-effect imports, bindings, reexports and literal dynamic imports are discovered with lines', () => {
  const source = `import './side.js';
import { value } from './bound.mjs';
export { value } from './other.js';
export * from './all.js';
await import('./dynamic.js', { with: { type: 'json' } });
await import(\`./template.js\`);
`;
  assert.deepEqual(moduleReferences(source).references, [
    { kind: 'static', specifier: './side.js', line: 1 },
    { kind: 'static', specifier: './bound.mjs', line: 2 },
    { kind: 'reexport', specifier: './other.js', line: 3 },
    { kind: 'reexport', specifier: './all.js', line: 4 },
    { kind: 'dynamic', specifier: './dynamic.js', line: 5 },
    { kind: 'dynamic', specifier: './template.js', line: 6 },
  ]);
});

test('comments, quoted source examples, regexes, templates and import.meta do not create fake references', () => {
  const source = `// import './fake1.js';
/* export * from './fake2.js'; */
const sample = "import './fake3.js'";
const single = 'export * from "./fake4.js"';
const template = \`import './fake5.js'\`;
const regex = /import\\('fake6.js'\\)/;
const url = import.meta.url;
object.import('./fake7.js');
import './real.js';`;
  assert.deepEqual(moduleReferences(source).references, [{ kind: 'static', specifier: './real.js', line: 9 }]);
});

test('variable, interpolated and concatenated dynamic imports are explicitly skipped', () => {
  const parsed = moduleReferences("import(path);\nimport(`./${name}.js`);\nimport('./' + name);\nimport('./literal.js');");
  assert.equal(parsed.references.length, 1);
  assert.equal(parsed.skipped.length, 3);
  assert.deepEqual(parsed.skipped.map((entry) => entry.line), [1, 2, 3]);
  assert.ok(parsed.skipped.every((entry) => entry.reason === 'nonliteral-dynamic-import'));
});

test('missing exact relative targets fail across import types and extensionless paths do not resolve implicitly', () => {
  const result = audit({ 'server/a.js': "import './missing.js'; export * from '../data/missing.mjs'; import('./missing-dynamic.js'); import './present';", 'server/present.js': '' });
  assert.equal(result.ok, false);
  assert.equal(result.issueCount, 4);
  assert.deepEqual(result.issues.map((issue) => issue.target), ['server/missing.js', 'data/missing.mjs', 'server/missing-dynamic.js', 'server/present']);
  assert.ok(result.issues.every((issue) => issue.code === 'missing-module'));
});

test('queries, fragments and encoded characters address exact files; builtins and packages are external', () => {
  const result = audit({
    'public/js/a.js': "import './b.js?v=2#boot'; import('./space%20name.mjs#ready'); import 'node:fs'; import 'ws'; import('https://example.test/a.js');",
    'public/js/b.js': '', 'public/js/space name.mjs': '',
  });
  assert.equal(result.ok, true);
  assert.equal(result.counts.relativeReferences, 2);
  assert.equal(result.counts.externalReferences, 3);
  assert.equal(result.graph.edgeCount, 2);
  const bad = audit({ 'server/a.js': "import './bad%XX.js';" });
  assert.equal(bad.issues[0].code, 'invalid-import-url');
});

test('cycles are informational and architecture edges count unique module pairs deterministically', () => {
  const sources = {
    'server/a.js': "import '../data/b.js'; import('../data/b.js');",
    'data/b.js': "export * from '../server/a.js';",
    'scripts/self.mjs': "import './self.mjs'; import(variable);",
  };
  const result = audit(sources);
  assert.equal(result.ok, true);
  assert.equal(result.graph.moduleCount, 3);
  assert.equal(result.graph.edgeCount, 3);
  assert.equal(result.graph.cycleGroupCount, 2);
  assert.equal(result.graph.modulesInCycles, 3);
  assert.deepEqual(result.graph.cycleGroups, [['data/b.js', 'server/a.js'], ['scripts/self.mjs']]);
  assert.deepEqual(result.graph.directoryEdges, [{ from: 'data', to: 'server', count: 1 }, { from: 'scripts', to: 'scripts', count: 1 }, { from: 'server', to: 'data', count: 1 }]);
  assert.equal(result.counts.skippedDynamicImports, 1);
  assert.deepEqual(result, audit(Object.fromEntries(Object.entries(sources).reverse())));
});

test('directory collection sorts results and skips generated/artifact trees, hidden files and symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'dr-module-audit-'));
  try {
    for (const directory of ['server/deep', 'server/live', 'scripts/generated', 'data', 'public/js']) mkdirSync(join(root, directory), { recursive: true });
    for (const path of ['server/z.js', 'server/deep/a.mjs', 'server/live/ignore.js', 'scripts/generated/ignore.mjs', 'data/b.js', 'public/js/c.js', 'server/.hidden.js', 'server/readme.md']) writeFileSync(join(root, path), '');
    symlinkSync(join(root, 'server'), join(root, 'server/deep/loop'), 'dir');
    assert.deepEqual(collectModuleFiles(root).map((path) => relative(root, path)), ['data/b.js', 'public/js/c.js', 'server/deep/a.mjs', 'server/z.js']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('repository CLI emits structured report without executing audited modules and rejects bad flags', () => {
  const path = fileURLToPath(new URL('../scripts/audit-modules.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [path, '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.ok, true);
  assert.ok(result.counts.files > 100);
  assert.equal(result.scope.cyclesInformational, true);
  assert.equal(spawnSync(process.execPath, [path, '--unknown'], { encoding: 'utf8' }).status, 2);
});
