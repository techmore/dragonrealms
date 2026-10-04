// Headless browser gate. Owns its database, world, browser and profile.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWorld } from './lib/disposable-world.mjs';
import { runClientRegression } from './lib/client-checks.mjs';
import { runAuditClientChecks } from './lib/audit-client-checks.mjs';

const directory = mkdtempSync(join(tmpdir(), 'dr-browser-check-'));
const profile = join(directory, 'profile');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let world, browser, socket, browserError;
const pending = new Map();
let sequence = 0;
try {
  world = await startWorld({ dbPath: join(directory, 'world.db'), enableApi: true });
  browser = spawn(process.env.DR_CHROMIUM_PATH || 'chromium', [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--window-size=1280,800', world.url,
  ], { stdio: 'ignore' });
  browser.on('error', (error) => { browserError = error; });
  let target;
  const deadline = Date.now() + 12000;
  while (!target && Date.now() < deadline) {
    if (browserError) throw browserError;
    if (browser.exitCode != null) throw new Error(`Browser exited: ${browser.exitCode}`);
    try {
      const port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1000) })).json();
      target = pages.find((page) => page.type === 'page' && page.url.startsWith(world.url));
    } catch {}
    if (!target) await sleep(100);
  }
  if (!target) throw new Error('Browser page did not become ready.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const failPending = (error) => { for (const entry of pending.values()) entry.reject(error); pending.clear(); };
  socket.on('error', failPending);
  socket.on('close', () => failPending(new Error('Browser connection closed.')));
  socket.on('message', (data) => {
    const message = JSON.parse(data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser request timed out: ${method}`)); }, 15000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "(()=>{window.__auditSockets=[];const OriginalWebSocket=window.WebSocket;window.WebSocket=class extends OriginalWebSocket{constructor(...args){super(...args);window.__auditSockets.push(this);}};})();" });
  await cdp('Page.reload');
  await runClientRegression({ cdp });
  await runAuditClientChecks({ cdp, url: world.url, gmToken: world.gmToken });
} catch (error) {
  console.error('CLIENT CHECK FAILED:', error.message);
  process.exitCode = 1;
} finally {
  socket?.terminate();
  if (browser && browser.exitCode == null && browser.signalCode == null && browser.pid) {
    const closed = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill('SIGTERM');
    const timer = setTimeout(() => browser.kill('SIGKILL'), 3000);
    await closed;
    clearTimeout(timer);
  }
  if (world) {
    const stopped = await world.stop();
    if (stopped.code !== 0) { console.error('Disposable world shutdown failed.'); process.exitCode = 1; }
  }
  rmSync(directory, { recursive: true, force: true });
}
