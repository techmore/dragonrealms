// Lexical dependency audit: reads source text; never imports audited modules.
import { readdirSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, relative, extname, sep } from 'node:path';

export const MODULE_DIRECTORIES = ['server', 'data', 'public/js', 'scripts'];
const SKIP = new Set(['node_modules', '.git', 'live', 'store', 'generated', 'bins']);
const slashPath = (path) => path.split(sep).join('/');

export function sourceTokens(source) {
  const result = [];
  let index = 0;
  const push = (type, value, start) => result.push({ type, value, start });
  while (index < source.length) {
    const start = index;
    const char = source[index];
    if (/\s/.test(char)) { index++; continue; }
    if (source.startsWith('//', index)) { index = source.indexOf('\n', index); if (index < 0) break; continue; }
    if (source.startsWith('/*', index)) { const end = source.indexOf('*/', index + 2); index = end < 0 ? source.length : end + 2; continue; }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      let value = '', interpolated = false;
      index++;
      while (index < source.length && source[index] !== quote) {
        if (quote === '`' && source.startsWith('${', index)) interpolated = true;
        if (source[index] === '\\') {
          index++;
          const escape = source[index++];
          if (escape === 'u' || escape === 'x') {
            const width = escape === 'u' ? 4 : 2;
            const hex = source.slice(index, index + width);
            if (/^[0-9a-f]+$/i.test(hex) && hex.length === width) { value += String.fromCharCode(parseInt(hex, 16)); index += width; }
            else value += escape;
          } else value += ({ n: '\n', r: '\r', t: '\t', '\n': '' })[escape] ?? escape;
        } else value += source[index++];
      }
      index++;
      push(interpolated ? 'template' : 'string', value, start);
      continue;
    }
    // Regex literals are opaque too. This is a lexical scanner rather than a
    // JavaScript parser; expression-start contexts cover authored source here.
    const previous = result.at(-1)?.value;
    if (char === '/' && (previous === undefined || ['=', '(', '[', '{', ',', ':', ';', '!', '?', 'return', '=>', '&&', '||'].includes(previous))) {
      index++;
      let inClass = false;
      while (index < source.length) {
        if (source[index] === '\\') { index += 2; continue; }
        if (source[index] === '[') inClass = true;
        if (source[index] === ']') inClass = false;
        if (source[index++] === '/' && !inClass) break;
      }
      while (/[a-z]/i.test(source[index] ?? '') && index < source.length) index++;
      push('regex', '', start);
      continue;
    }
    if (/[\w$]/.test(char)) {
      index++;
      while (index < source.length && /[\w$]/.test(source[index])) index++;
      push('word', source.slice(start, index), start);
    } else {
      const pair = source.slice(index, index + 2);
      if (['=>', '&&', '||'].includes(pair)) { push('punctuation', pair, start); index += 2; }
      else { push('punctuation', char, start); index++; }
    }
  }
  return result;
}

export function moduleReferences(source) {
  const lexemes = sourceTokens(source);
  const references = [], skipped = [];
  const record = (token, kind, specifier) => ({ kind, ...(specifier === undefined ? {} : { specifier }), line: source.slice(0, token.start).split('\n').length });
  for (let index = 0; index < lexemes.length; index++) {
    const token = lexemes[index];
    if (token.type !== 'word' || !['import', 'export'].includes(token.value) || ['.', '?.'].includes(lexemes[index - 1]?.value)) continue;
    const next = lexemes[index + 1];
    if (token.value === 'import' && next?.value === '(') {
      const argument = lexemes[index + 2], following = lexemes[index + 3];
      if (argument?.type === 'string' && [')', ','].includes(following?.value)) references.push(record(token, 'dynamic', argument.value));
      else skipped.push({ ...record(token, 'dynamic'), reason: 'nonliteral-dynamic-import' });
      continue;
    }
    if (token.value === 'import' && next?.type === 'string') { references.push(record(token, 'static', next.value)); continue; }
    if (token.value === 'import' && next?.value === '.') continue;
    if (token.value === 'export' && !['{', '*'].includes(next?.value)) continue;
    for (let cursor = index + 1; cursor < lexemes.length; cursor++) {
      if (lexemes[cursor].value === ';' || (cursor > index + 1 && ['import', 'export'].includes(lexemes[cursor].value))) break;
      if (lexemes[cursor].value === 'from' && lexemes[cursor + 1]?.type === 'string') {
        references.push(record(token, token.value === 'export' ? 'reexport' : 'static', lexemes[cursor + 1].value));
        break;
      }
    }
  }
  return { references, skipped };
}

export function collectModuleFiles(root, directories = MODULE_DIRECTORIES) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && ['.js', '.mjs'].includes(extname(path))) files.push(path);
    }
  };
  for (const directory of [...directories].sort()) {
    const path = resolve(root, directory);
    if (lstatSync(path).isDirectory()) walk(path);
  }
  return [...new Set(files)].sort();
}

function cycleGroups(graph) {
  let sequence = 0;
  const indexes = new Map(), low = new Map(), stack = [], active = new Set(), groups = [];
  const visit = (node) => {
    indexes.set(node, sequence); low.set(node, sequence++); stack.push(node); active.add(node);
    for (const target of graph.get(node) ?? []) {
      if (!graph.has(target)) continue;
      if (!indexes.has(target)) { visit(target); low.set(node, Math.min(low.get(node), low.get(target))); }
      else if (active.has(target)) low.set(node, Math.min(low.get(node), indexes.get(target)));
    }
    if (low.get(node) !== indexes.get(node)) return;
    const group = [];
    let member;
    do { member = stack.pop(); active.delete(member); group.push(member); } while (member !== node);
    if (group.length > 1 || graph.get(node).has(node)) groups.push(group.sort());
  };
  for (const node of [...graph.keys()].sort()) if (!indexes.has(node)) visit(node);
  return groups.sort((a, b) => a[0].localeCompare(b[0]));
}

const domain = (path) => path.startsWith('public/js/') ? 'public/js' : path.split('/')[0];
export function auditModuleSources({ root, sources, exists = (path) => { try { return statSync(path).isFile(); } catch { return false; } } }) {
  const issues = [], skipped = [], edges = [], graph = new Map();
  const counts = { files: Object.keys(sources).length, references: 0, relativeReferences: 0, externalReferences: 0, skippedDynamicImports: 0 };
  for (const file of Object.keys(sources).sort()) graph.set(file, new Set());
  for (const [file, source] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
    const parsed = moduleReferences(source);
    for (const entry of parsed.skipped) skipped.push({ file, ...entry });
    counts.skippedDynamicImports += parsed.skipped.length;
    for (const reference of parsed.references) {
      counts.references++;
      if (!/^\.\.?\//.test(reference.specifier)) { counts.externalReferences++; continue; }
      counts.relativeReferences++;
      let location;
      try { location = decodeURIComponent(reference.specifier.split(/[?#]/)[0]); }
      catch { issues.push({ code: 'invalid-import-url', file, ...reference, message: 'Import path has invalid URL encoding' }); continue; }
      const targetPath = resolve(dirname(resolve(root, file)), location);
      const target = slashPath(relative(root, targetPath));
      if (!exists(targetPath)) issues.push({ code: 'missing-module', file, ...reference, target, message: `${file}:${reference.line} references missing ${target}` });
      else { edges.push({ from: file, to: target, kind: reference.kind }); graph.get(file).add(target); }
    }
  }
  const groups = cycleGroups(graph);
  const directoryEdges = new Map();
  for (const [from, targets] of graph) for (const to of targets) {
    const key = `${domain(from)}>${domain(to)}`;
    directoryEdges.set(key, (directoryEdges.get(key) ?? 0) + 1);
  }
  return { schemaVersion: 1, ok: issues.length === 0, counts, issueCount: issues.length, issues, skipped,
    graph: { moduleCount: graph.size, edgeCount: [...graph.values()].reduce((sum, targets) => sum + targets.size, 0),
      cycleGroupCount: groups.length, modulesInCycles: groups.reduce((sum, group) => sum + group.length, 0), cycleGroups: groups,
      directoryEdges: [...directoryEdges].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => { const [from, to] = key.split('>'); return { from, to, count }; }) },
    scope: { cyclesInformational: true, variableDynamicImportsSkipped: true, scanner: 'lexical; not a full JavaScript parser' } };
}

export function auditModules(root) {
  const sources = {};
  const loadIssues = [];
  for (const path of collectModuleFiles(root)) {
    const file = slashPath(relative(root, path));
    try { sources[file] = readFileSync(path, 'utf8'); }
    catch (error) { loadIssues.push({ code: 'unreadable-module', file, message: error.message }); }
  }
  const result = auditModuleSources({ root, sources });
  result.issues.push(...loadIssues);
  result.issueCount = result.issues.length;
  result.ok = result.issueCount === 0;
  return result;
}
