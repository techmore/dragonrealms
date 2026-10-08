#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { collectReleaseSource, buildReleaseBundle, writeReleaseBundle } from './lib/release-package.mjs';
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/package-release.mjs --out artifacts/releases/<id>/source.tar.gz [--json]\nPackages current authored source, including untracked files. Never overwrites outputs.');
} else {
  try {
    let out, json = false;
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--out' && args[index + 1] && !args[index + 1].startsWith('--')) out = args[++index];
      else if (args[index] === '--json') json = true;
      else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    }
    if (!out) throw new Error('--out is required');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const optionalCommand = (command, commandArgs) => { try { return execFileSync(command, commandArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 }).trim(); } catch { return null; } };
    const snapshot = collectReleaseSource(root);
    const bundle = buildReleaseBundle(snapshot, { gitHead: optionalCommand('git', ['rev-parse', 'HEAD']), npm: optionalCommand('npm', ['--version']) });
    const result = writeReleaseBundle(resolve(out), bundle);
    console.log(json ? JSON.stringify(result, null, 2) : `PACKAGED ${result.files} source files\n${result.archivePath}\nManifest: ${result.manifestPath}\nSource SHA256: ${result.sourceFingerprint}\nArchive SHA256: ${result.archiveSha256}`);
  } catch (error) { console.error(`Release packaging failed: ${error.message}`); process.exitCode = 1; }
}
