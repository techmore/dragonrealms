// Start the real server with an explicitly owned database and ephemeral port.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));

export async function startWorld({ dbPath, nodePath = process.execPath, enableApi = false, enableAgentBoost = false }) {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const gmToken = randomBytes(32).toString('hex');
  const child = spawn(nodePath, ['server/index.js'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), DR_DB_PATH: dbPath,
      DR_PROFILE: 'local', DR_HOST: '127.0.0.1', DR_ENABLE_API: enableApi ? '1' : '0', DR_ENABLE_DEBUG_API: '0', DR_ALLOW_SECOND_WORLD: '0',
      DR_GM_TOKEN: gmToken, DR_ENABLE_AGENT_BOOST: enableAgentBoost ? '1' : '0' },
  });
  let output = '';
  const closed = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', (error) => resolve({ error }));
  });
  async function stop() {
    if (child.exitCode == null && child.signalCode == null) child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 8000);
    try { return await closed; }
    finally {
      clearTimeout(timeout);
      const tokenFile = `/tmp/dr-world-token-${port}.json`;
      try {
        if (JSON.parse(readFileSync(tokenFile, 'utf8')).token === gmToken) rmSync(tokenFile);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Disposable world startup timed out.')), 10000);
      const finish = (fn, value) => { clearTimeout(timer); fn(value); };
      child.stdout.on('data', (chunk) => {
        output = (output + chunk).slice(-4000);
        if (output.includes(`Dragon Realms listening on http://localhost:${port}`)) finish(resolve);
      });
      child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
      closed.then((result) => finish(reject, new Error(`Disposable world exited before startup: ${JSON.stringify(result)}\n${output}`)));
    });
  } catch (error) { await stop(); throw error; }
  return { port, gmToken, url: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}/ws`, stop };
}
