import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkProject, markdownLinks, documentAnchors, nodeScriptTargets, PROJECT_DOCUMENTS } from '../scripts/lib/project-check.mjs';

function fixture(files, scripts = {}) {
  const root = '/project';
  return { root, documents: ['README.md'], packageJson: { scripts },
    isFile: (path) => Object.hasOwn(files, path),
    readFile: (path) => { if (!Object.hasOwn(files, path)) throw new Error(`Missing ${path}`); return files[path]; } };
}

test('local links, reference definitions, images and percent-encoded paths resolve relative to their source', () => {
  const options = fixture({
    '/project/README.md': '[Guide](docs/guide.md#start)\n![Map](docs/map%20image.png)\n[Reference][ref]\n[ref]: docs/guide.md#start\n[Root](/docs/guide.md?mode=full#start)',
    '/project/docs/guide.md': '# Start\n', '/project/docs/map image.png': '',
  });
  const result = checkProject(options);
  assert.equal(result.ok, true);
  assert.equal(result.counts.localLinks, 4);
  assert.equal(result.counts.fragments, 3);
  options.documents = ['docs/guide.md'];
  options.readFile = (path) => path.endsWith('guide.md') ? '[Home](../README.md)' : '# Home';
  assert.equal(checkProject(options).ok, true);
});

test('broken local paths and fragments give document path and line without fetching external links', () => {
  const result = checkProject(fixture({
    '/project/README.md': '# Home\n[missing](missing.md)\n[fragment](#absent)\n[external](https://example.test/missing#absent)\n[email](mailto:user@example.test)\n[protocol](//example.test/missing)\n[encoded](bad%XX.md)',
  }));
  assert.deepEqual(result.issues.map(({ code, path, line }) => ({ code, path, line })), [
    { code: 'missing-link-target', path: 'README.md', line: 2 },
    { code: 'missing-fragment', path: 'README.md', line: 3 },
    { code: 'invalid-link', path: 'README.md', line: 7 },
  ]);
});

test('headings generate duplicate slugs, preserve inline-code text, and recognize HTML anchors', () => {
  const source = '# Start\n## Start\n## Start\n## Use `progress` now!\nUnderlined\n==========\n<a id="explicit"></a>\n';
  const anchors = documentAnchors(source);
  for (const anchor of ['start', 'start-1', 'start-2', 'use-progress-now', 'underlined', 'explicit']) assert.ok(anchors.has(anchor), anchor);
  const result = checkProject(fixture({ '/project/README.md': '[HTML](page.html#named)', '/project/page.html': '<a name="named"></a>' }));
  assert.equal(result.ok, true);
});

test('code samples do not introduce false links or headings; valid links retain line locations', () => {
  const source = '```md\n[bad](missing.md)\n# Fake\n```\n`[bad](missing.md)`\n[good](actual.md "Title")\n';
  assert.deepEqual(markdownLinks(source), [{ target: 'actual.md', line: 6 }]);
  assert.equal(documentAnchors(source).has('fake'), false);
  assert.equal(markdownLinks('[paren](docs/guide(1).md)')[0].target, 'docs/guide(1).md');
});

test('npm target parsing handles command chains, watch/options, quotes, env and inline evaluation', () => {
  assert.deepEqual(nodeScriptTargets('node --watch server/index.js && node scripts/check.mjs --json'), ['server/index.js', 'scripts/check.mjs']);
  assert.deepEqual(nodeScriptTargets('DR_ENABLE_API=1 node --import "setup file.mjs" "scripts/check file.mjs"; node --test test/*.test.mjs'), ['scripts/check file.mjs', 'test/*.test.mjs']);
  assert.deepEqual(nodeScriptTargets('echo "node absent.mjs" && node -e "console.log(1)" && node --eval="1"'), []);
  assert.deepEqual(nodeScriptTargets('node --test-reporter spec --test test/example.test.mjs'), ['test/example.test.mjs']);
});

test('missing npm explicit Node targets fail; glob/stdin targets are reported as skipped', () => {
  const result = checkProject(fixture({ '/project/README.md': '# Project', '/project/scripts/check.mjs': '' }, {
    good: 'node scripts/check.mjs', broken: 'node --watch absent.mjs', tests: 'node --test test/*.test.mjs', stdin: 'node -',
  }));
  assert.equal(result.ok, false);
  assert.equal(result.counts.nodeTargets, 2);
  assert.equal(result.counts.skippedNodePatterns, 2);
  assert.deepEqual(result.issues.map((issue) => issue.code), ['missing-node-target']);
  assert.equal(result.issues[0].path, 'package.json#scripts.broken');
});

test('missing documents and malformed package scripts produce diagnostics', () => {
  const options = fixture({});
  options.packageJson = { scripts: [] };
  assert.deepEqual(checkProject(options).issues.map((issue) => issue.code), ['missing-document', 'invalid-package-scripts']);
  options.packageJson = { scripts: { invalid: null } };
  assert.ok(checkProject(options).issues.some((issue) => issue.code === 'invalid-package-script'));
});

test('read failures produce bounded diagnostics and implicit manifest loading works', () => {
  const options = fixture({ '/project/README.md': '# Project', '/project/package.json': '{"scripts":{}}' });
  delete options.packageJson;
  assert.equal(checkProject(options).ok, true);
  options.readFile = () => { throw new Error('read denied'); };
  assert.deepEqual(checkProject(options).issues.map((issue) => issue.code), ['unreadable-document', 'invalid-package', 'invalid-package-scripts']);
});

test('repository CLI is read-only, emits JSON and rejects unknown flags', () => {
  const path = fileURLToPath(new URL('../scripts/project-check.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [path, '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.ok, true);
  assert.equal(result.counts.documents, PROJECT_DOCUMENTS.length);
  const bad = spawnSync(process.execPath, [path, '--unknown'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});
