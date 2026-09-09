// Capture/replay in separate fresh worlds, without writing to a shared server.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWorld } from './lib/disposable-world.mjs';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'dr-corpus-worlds-'));
let world;
try {
  for (const mode of ['capture', 'replay']) {
    world = await startWorld({ dbPath: join(dir, `${mode}.db`) });
    const result = await exec(process.execPath, ['scripts/client-corpus.mjs', mode, join(dir, 'corpus.json')], {
      cwd: root, env: { ...process.env, DR_WS_URL: world.wsUrl }, timeout: 130000,
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    const stopped = await world.stop(); world = null;
    if (stopped.code !== 0) throw new Error(`Disposable world shutdown failed: ${JSON.stringify(stopped)}`);
  }
} catch (error) {
  if (error.stdout) process.stdout.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  console.error(`Isolated corpus failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (world) await world.stop();
  rmSync(dir, { recursive: true, force: true });
}
