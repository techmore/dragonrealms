// Source-only release snapshots. No game imports, database access, or dependency execution.
import { readdirSync, lstatSync, readFileSync, mkdirSync, writeFileSync, linkSync, unlinkSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { moduleReferences } from './module-audit.mjs';
import { nodeScriptTargets, checkProject, PROJECT_DOCUMENTS } from './project-check.mjs';

export const SOURCE_TREES = ['server', 'data', 'public', 'admin', 'scripts', 'test', 'docs', 'documentation', 'deploy', 'puffer_adapter'];
export const REQUIRED_ROOT_FILES = ['package.json', 'package-lock.json', 'README.md', 'AGENTS.md', 'ROADMAP.md', 'SKILLS.md'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const deniedDirectories = new Set(['.git', '.hermes', '.pi', 'node_modules', '__pycache__', 'store', 'live', 'artifacts', 'backups', 'backup', 'logs', 'checkpoints', '.ssh', '.aws', '.cache', 'database', 'databases', '.puffer-runtime', '.puffer-venv']);
export function excludedSourcePath(path) {
  return path.split('/').some((name) => deniedDirectories.has(name.toLowerCase()) || /^\.env/i.test(name) || /^(?:credentials?|secrets?|service[-_]account)(?:[.\-_].*)?$/i.test(name) || /^(?:id_rsa|id_ed25519|private[-_]key)(?:[.\-_].*)?$/i.test(name) || /\.(?:db(?:-(?:wal|shm))?|sqlite\d?(?:-(?:wal|shm))?|pem|key|p12|pfx|der|jks|bak|backup|log|jsonl|pyc|tgz|zip|tar|gz)$/i.test(name) || name === '.DS_Store' || /^tmp-/i.test(name));
}
function safePath(path) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => !part || part === '.' || part === '..') || path.includes('\0')) throw new Error(`Unsafe archive path: ${path}`);
}
export function sourceFingerprint(files) {
  return hash(Buffer.from(JSON.stringify(files.map(({ path, mode, bytes, sha256 }) => ({ path, mode, bytes, sha256 })).sort((a, b) => compare(a.path, b.path)))));
}
export function validateSourceClosure(files) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const errors = [], skipped = [];
  const requirePath = (path, origin) => { if (!byPath.has(path)) errors.push(`${origin}: required source target is missing or outside release scope: ${path}`); };
  for (const path of REQUIRED_ROOT_FILES) requirePath(path, 'release');
  const pkgFile = byPath.get('package.json');
  let pkg;
  if (pkgFile) { try { pkg = JSON.parse(pkgFile.content.toString('utf8')); } catch { errors.push('package.json: invalid JSON'); } }
  if (pkg?.main) requirePath(posix.normalize(pkg.main), 'package.json main');
  for (const [name, command] of Object.entries(pkg?.scripts ?? {})) {
    if (typeof command !== 'string') { errors.push(`package.json scripts.${name}: expected string`); continue; }
    for (const target of nodeScriptTargets(command)) {
      if (/[?*\[]/.test(target)) { if (!files.some((file) => file.path.startsWith(target.split(/[?*\[]/)[0]))) errors.push(`package.json scripts.${name}: unmatched source glob ${target}`); }
      else requirePath(posix.normalize(target), `package.json scripts.${name}`);
    }
  }
  for (const file of files) if (/\.(?:mjs|js)$/.test(file.path)) {
    const result = moduleReferences(file.content.toString('utf8'));
    for (const item of result.skipped) skipped.push({ path: file.path, line: item.line, reason: item.reason });
    for (const ref of result.references) if (ref.specifier.startsWith('.')) {
      let target;
      try { target = decodeURIComponent(ref.specifier.split(/[?#]/)[0]); } catch { errors.push(`${file.path}:${ref.line}: invalid import encoding`); continue; }
      requirePath(posix.normalize(posix.join(posix.dirname(file.path), target)), `${file.path}:${ref.line}`);
    }
  }
  // Concrete static asset links are requirements; application/API routes and
  // navigational links are not files. CSS url() excludes data and remote URLs.
  for (const file of files) if (/\.(?:html|css)$/i.test(file.path)) {
    const source = file.content.toString('utf8');
    const refs = /\.css$/i.test(file.path)
      ? [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)].map((m) => m[1])
      : [...source.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(?:script|img|source|link)\b[^>]*?\b(?:src|href)\s*=\s*['"]([^'"]+)['"]/gi)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue;
      let target;
      try { target = decodeURIComponent(ref.split(/[?#]/)[0]); } catch { errors.push(`${file.path}: invalid asset URL encoding`); continue; }
      if (!target) continue;
      const publicAsset = file.path.startsWith('public/');
      if (target.startsWith('/') && !publicAsset) { skipped.push({ path: file.path, reason: 'absolute-document-asset', target }); continue; }
      target = posix.normalize(target.startsWith('/') ? `public/${target.slice(1)}` : posix.join(posix.dirname(file.path), target));
      requirePath(target, `${file.path} asset`);
    }
  }
  // Resolve only the active project guides against packaged bytes. Never let
  // the host checkout satisfy a link to an excluded or unshipped file.
  const documentRoot = resolve('/__dragonrealms_release_source__');
  const absoluteFiles = new Map(files.map((file) => [resolve(documentRoot, file.path), file]));
  const documents = [...new Set([...PROJECT_DOCUMENTS, 'docs/RELEASE.md'])].filter((path) => path === 'README.md' || byPath.has(path));
  const documentation = checkProject({
    root: documentRoot, documents, packageJson: pkg ?? { scripts: {} },
    isFile: (path) => absoluteFiles.has(path),
    readFile: (path) => {
      const file = absoluteFiles.get(path);
      if (!file) throw new Error('Target is not in the source release');
      return file.content.toString('utf8');
    },
  });
  for (const issue of documentation.issues) errors.push(`${issue.path}${issue.line ? ':' + issue.line : ''}: ${issue.message}`);
  return { errors, skipped, packageJson: pkg, documentation: { documents, counts: documentation.counts } };
}
function readSourceFile(path, expected) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = fstatSync(fd);
    if (!actual.isFile() || (expected && (actual.ino !== expected.ino || actual.dev !== expected.dev))) throw new Error(`Source file changed type or identity during collection: ${path}`);
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
export function collectReleaseSource(root, { readFile = readSourceFile } = {}) {
  root = resolve(root);
  const files = [], excluded = [];
  const visit = (path) => {
    if (excludedSourcePath(path)) { excluded.push(path); return; }
    safePath(path);
    const absolute = resolve(root, path), stat = lstatSync(absolute);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Unsupported source file type: ${path}`);
    if (stat.isDirectory()) { for (const name of readdirSync(absolute).sort(compare)) visit(`${path}/${name}`); return; }
    const content = Buffer.from(readFile(absolute, stat));
    files.push({ path, mode: stat.mode & 0o111 ? 0o755 : 0o644, bytes: content.length, sha256: hash(content), content });
  };
  const names = readdirSync(root).sort(compare);
  for (const tree of SOURCE_TREES) if (names.includes(tree)) visit(tree);
  for (const name of names) if (REQUIRED_ROOT_FILES.includes(name) || name === '.gitignore' || /\.md$/i.test(name) || /^(?:LICENSE|COPYING|NOTICE)(?:\.[\w-]+)?$/i.test(name)) visit(name);
  files.sort((a, b) => compare(a.path, b.path));
  const closure = validateSourceClosure(files);
  if (closure.errors.length) throw new Error(`Incomplete source release:\n${closure.errors.join('\n')}`);
  return { files, excluded, closure };
}
function tarHeader(path, mode, size) {
  safePath(path);
  const header = Buffer.alloc(512);
  let name = path, prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const positions = [...path.matchAll(/\//g)].map((m) => m.index).reverse();
    const split = positions.find((index) => Buffer.byteLength(path.slice(0, index)) <= 155 && Buffer.byteLength(path.slice(index + 1)) <= 100);
    if (split === undefined) throw new Error(`Path exceeds USTAR limits: ${path}`);
    prefix = path.slice(0, split); name = path.slice(split + 1);
  }
  header.write(name, 0, 100, 'utf8'); header.write(prefix, 345, 155, 'utf8');
  const octal = (offset, width, value) => { const encoded = value.toString(8); if (encoded.length > width - 1) throw new Error(`USTAR numeric overflow: ${path}`); header.write(encoded.padStart(width - 1, '0') + '\0', offset, width, 'ascii'); };
  octal(100, 8, mode); octal(108, 8, 0); octal(116, 8, 0); octal(124, 12, size); octal(136, 12, 0);
  header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return header;
}
export function buildReleaseBundle(snapshot, metadata = {}) {
  const entries = snapshot.files.map(({ content, ...entry }) => entry);
  for (const file of snapshot.files) { safePath(file.path); if (file.bytes !== file.content.length || file.sha256 !== hash(file.content)) throw new Error(`Source bytes changed: ${file.path}`); }
  const manifest = {
    schemaVersion: 1, packageName: snapshot.closure.packageJson?.name ?? null, packageVersion: snapshot.closure.packageJson?.version ?? null,
    sourceFingerprint: sourceFingerprint(entries), lockfileSha256: entries.find((file) => file.path === 'package-lock.json')?.sha256 ?? null,
    source: { trees: SOURCE_TREES, rootFiles: entries.filter((file) => !file.path.includes('/')).map((file) => file.path), includesUntracked: true, gitHead: metadata.gitHead ?? null, gitHeadIdentifiesArtifact: false },
    toolchain: { node: metadata.node ?? process.version, npm: metadata.npm ?? null },
    limitations: ['Snapshot records packaged bytes, not an atomic Git checkout.', 'Git HEAD alone does not identify this artifact.', 'Lexical import closure does not resolve computed runtime paths or nonliteral dynamic imports.', 'Markdown closure checks only present active PROJECT_DOCUMENTS and docs/RELEASE.md; archived Markdown is not audited.', 'Generated release-manifest.json is excluded from its own file list.'],
    documentationCheck: snapshot.closure.documentation,
    unresolvedImports: snapshot.closure.skipped, files: entries,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const contents = [...snapshot.files, { path: 'release-manifest.json', mode: 0o644, content: manifestBytes }];
  const blocks = [];
  for (const file of contents) { blocks.push(tarHeader(file.path, file.mode, file.content.length), file.content, Buffer.alloc((512 - file.content.length % 512) % 512)); }
  blocks.push(Buffer.alloc(1024));
  return { manifest, manifestBytes, archive: gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 }) };
}
export function writeReleaseBundle(out, bundle) {
  out = resolve(out);
  const manifestPath = `${out}.manifest.json`;
  // Never replace an existing output. Hard-link publication is atomic and exclusive.
  for (const path of [out, manifestPath]) { try { lstatSync(path); throw new Error(`Output already exists: ${path}`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
  const temporary = [out, manifestPath].map((path) => `${path}.tmp-${randomUUID()}`), published = [];
  try {
    writeFileSync(temporary[0], bundle.archive, { flag: 'wx', mode: 0o600 });
    writeFileSync(temporary[1], bundle.manifestBytes, { flag: 'wx', mode: 0o600 });
    for (let index = 0; index < temporary.length; index++) { const destination = [out, manifestPath][index]; linkSync(temporary[index], destination); published.push(destination); }
  } catch (error) { for (const path of published) unlinkSync(path); throw error; }
  finally { for (const path of temporary) { try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } } }
  return { archivePath: out, manifestPath, archiveSha256: hash(bundle.archive), sourceFingerprint: bundle.manifest.sourceFingerprint, files: bundle.manifest.files.length, bytes: bundle.archive.length };
}

// Run before installation/runtime initialization: every extracted file must be
// listed, except the generated manifest itself. Unknown files are never read.
export function verifyExtractedRelease(root) {
  root = resolve(root);
  const manifestPath = resolve(root, 'release-manifest.json');
  if (!lstatSync(manifestPath).isFile() || lstatSync(manifestPath).isSymbolicLink()) throw new Error('Invalid extracted manifest file type');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported release manifest schema');
  const expected = new Map(), errors = [], actual = [];
  for (const entry of manifest.files) {
    safePath(entry.path);
    if (excludedSourcePath(entry.path) || entry.path === 'release-manifest.json' || expected.has(entry.path) || ![0o644, 0o755].includes(entry.mode) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Invalid release manifest entry: ${entry.path}`);
    expected.set(entry.path, entry);
  }
  const visit = (path) => {
    const stat = lstatSync(resolve(root, path));
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) { errors.push(`Unsupported extracted file type: ${path}`); return; }
    if (stat.isDirectory()) { for (const name of readdirSync(resolve(root, path)).sort(compare)) visit(path ? `${path}/${name}` : name); return; }
    if (path === 'release-manifest.json') return;
    const entry = expected.get(path);
    if (!entry) { errors.push(`Unmanifested extracted file: ${path}`); return; }
    const bytes = readSourceFile(resolve(root, path), stat);
    const observed = { path, mode: stat.mode & 0o777, bytes: bytes.length, sha256: hash(bytes) };
    actual.push(observed); expected.delete(path);
    if (entry.mode !== observed.mode || entry.bytes !== observed.bytes || entry.sha256 !== observed.sha256) errors.push(`Extracted file differs from manifest: ${path}`);
  };
  visit('');
  for (const path of expected.keys()) errors.push(`Missing extracted file: ${path}`);
  if (sourceFingerprint(manifest.files) !== manifest.sourceFingerprint) errors.push('Manifest source fingerprint mismatch');
  const fingerprint = sourceFingerprint(actual);
  if (fingerprint !== manifest.sourceFingerprint) errors.push('Extracted source fingerprint mismatch');
  if (manifest.files.find((file) => file.path === 'package-lock.json')?.sha256 !== manifest.lockfileSha256) errors.push('Manifest lockfile hash mismatch');
  return { ok: errors.length === 0, errors, files: actual.length, sourceFingerprint: fingerprint };
}
