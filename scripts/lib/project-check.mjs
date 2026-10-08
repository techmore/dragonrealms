// A bounded, read-only check of the active project guide and npm entry points.
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';

export const PROJECT_DOCUMENTS = ['README.md', 'docs/README.md', 'docs/ARCHITECTURE.md', 'docs/PROJECT-EXPANSION-2026-10-06.md', 'docs/PROJECT-EXPANSION-2026-10-07.md', 'docs/PROJECT-EXPANSION-2026-10-08.md', 'docs/RELEASE.md'];
const stripFences = (text) => text.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, (block) => block.replace(/[^\n]/g, ' '));
const stripCode = (text) => stripFences(text).replace(/(`+)[^\n]*?\1/g, (code) => ' '.repeat(code.length));

export function markdownLinks(source) {
  const text = stripCode(source);
  const links = [];
  const patterns = [
    /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|((?:\\.|[^()\s]|\([^()\n]*\))+))(?:\s+["'][^\n]*?["'])?\s*\)/g,
    /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) {
    links.push({ target: (match[1] ?? match[2]).replace(/\\([()])/g, '$1'), line: text.slice(0, match.index).split('\n').length });
  }
  return links.sort((a, b) => a.line - b.line);
}

export function documentAnchors(source, extension = '.md') {
  const anchors = new Set();
  for (const match of source.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/g)) anchors.add(match[1]);
  if (extension.toLowerCase() !== '.md') return anchors;
  const used = new Set();
  const text = stripFences(source);
  const headings = [...text.matchAll(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$/gm)].map((m) => ({ text: m[1], index: m.index }));
  for (const match of text.matchAll(/^([^\n]+)\n {0,3}(?:=+|-+)\s*$/gm)) headings.push({ text: match[1], index: match.index });
  headings.sort((a, b) => a.index - b.index);
  for (const heading of headings) {
    const base = heading.text.replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    let slug = base;
    for (let suffix = 1; used.has(slug); suffix++) slug = `${base}-${suffix}`;
    used.add(slug);
    anchors.add(slug);
  }
  return anchors;
}

// Only actual shell command positions are considered. Quoted arguments such
// as `echo 'node missing.mjs'` are never interpreted as npm entry points.
export function nodeScriptTargets(command) {
  const tokens = [...command.matchAll(/"(?:\\.|[^"\\])*"|'[^']*'|&&|\|\||[;|]|[^\s;|]+/g)].map((match) => match[0]);
  const targets = [];
  let position = 0;
  const unquote = (token) => token.replace(/^(["'])([\s\S]*)\1$/, '$2');
  const withValue = new Set(['--require', '-r', '--import', '--loader', '--experimental-loader', '--conditions', '-C', '--inspect-port', '--input-type', '--env-file', '--env-file-if-exists', '--test-reporter', '--test-reporter-destination', '--test-name-pattern', '--test-skip-pattern', '--test-concurrency', '--test-timeout']);
  while (position < tokens.length) {
    let end = position;
    while (end < tokens.length && !['&&', '||', ';', '|'].includes(tokens[end])) end++;
    const segment = tokens.slice(position, end);
    let index = 0;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(segment[index] ?? '')) index++;
    if (segment[index] === 'node') {
      index++;
      while (index < segment.length && segment[index] !== '-' && segment[index].startsWith('-')) {
        const flag = segment[index++];
        if (['-e', '--eval', '-p', '--print'].includes(flag) || /^(?:--eval|--print)=/.test(flag)) { index = segment.length; break; }
        if (flag === '--') break;
        if (withValue.has(flag)) index++;
      }
      if (index < segment.length) targets.push(unquote(segment[index]));
    }
    position = end + 1;
  }
  return targets;
}

export function checkProject({ root, documents = PROJECT_DOCUMENTS, packageJson, readFile = (path) => readFileSync(path, 'utf8'), isFile = (path) => { try { return statSync(path).isFile(); } catch { return false; } } }) {
  const issues = [];
  const counts = { documents: 0, localLinks: 0, fragments: 0, nodeTargets: 0, skippedNodePatterns: 0 };
  const add = (code, path, message, line) => issues.push({ code, path, ...(line === undefined ? {} : { line }), message });
  const cache = new Map();
  const read = (path) => {
    if (!cache.has(path)) cache.set(path, readFile(path));
    return cache.get(path);
  };
  for (const document of documents) {
    const path = resolve(root, document);
    if (!isFile(path)) { add('missing-document', document, `Document ${document} is missing`); continue; }
    let source;
    try { source = read(path); } catch (error) { add('unreadable-document', document, error.message); continue; }
    counts.documents++;
    for (const { target, line } of markdownLinks(source)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;
      counts.localLinks++;
      const [location, fragment] = target.split('#', 2);
      let decodedPath, decodedFragment;
      try { decodedPath = decodeURIComponent(location.split('?')[0]); decodedFragment = fragment === undefined ? undefined : decodeURIComponent(fragment); }
      catch { add('invalid-link', document, `Invalid URL encoding in ${target}`, line); continue; }
      // Root-relative documentation URLs address the repository root.
      const destination = decodedPath ? resolve(decodedPath.startsWith('/') ? root : dirname(path), decodedPath.replace(/^\//, '')) : path;
      if (!isFile(destination)) { add('missing-link-target', document, `Link ${target} points to missing file ${relative(root, destination)}`, line); continue; }
      if (decodedFragment && ['.md', '.html', '.htm'].includes(extname(destination).toLowerCase())) {
        counts.fragments++;
        try {
          if (!documentAnchors(read(destination), extname(destination)).has(decodedFragment)) add('missing-fragment', document, `Link ${target} points to a missing anchor`, line);
        } catch (error) { add('unreadable-link-target', document, error.message, line); }
      }
    }
  }
  let manifest = packageJson;
  if (manifest === undefined) {
    try { manifest = JSON.parse(read(resolve(root, 'package.json'))); }
    catch (error) { add('invalid-package', 'package.json', error.message); }
  }
  if (!manifest?.scripts || typeof manifest.scripts !== 'object' || Array.isArray(manifest.scripts)) add('invalid-package-scripts', 'package.json', 'package.json scripts must be an object');
  else for (const [name, command] of Object.entries(manifest.scripts)) {
    if (typeof command !== 'string') { add('invalid-package-script', `package.json#scripts.${name}`, 'npm script must be a string'); continue; }
    for (const target of nodeScriptTargets(command)) {
      if (target === '-' || /[*?\[\]{}]/.test(target)) { counts.skippedNodePatterns++; continue; }
      counts.nodeTargets++;
      if (!isFile(resolve(root, target))) add('missing-node-target', `package.json#scripts.${name}`, `npm script ${name} references missing Node target ${target}`);
    }
  }
  return { schemaVersion: 1, ok: issues.length === 0, counts, issueCount: issues.length, issues };
}
