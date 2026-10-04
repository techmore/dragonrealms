// Same browser gate through the supported Ego browser, with an owned world.
// Each invocation creates exactly one task space and cleans up after success.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWorld } from './lib/disposable-world.mjs';
const directory = mkdtempSync(join(tmpdir(), 'dr-ego-check-'));
let world;
try {
  world = await startWorld({ dbPath: join(directory, 'world.db'), enableApi: true });
  const checksPath = fileURLToPath(new URL('./lib/client-checks.mjs', import.meta.url));
  const auditPath = fileURLToPath(new URL('./lib/audit-client-checks.mjs', import.meta.url));
  const script = `
    const task = await taskSpace(${process.env.DR_EGO_SPACE_ID ? Number(process.env.DR_EGO_SPACE_ID) : JSON.stringify('DragonRealms implementation verification')});
    console.log('Ego task space:', task.spaceId);
    const page = task.page('p1');
    await page.cdp('Network.enable');
    await page.cdp('Network.emulateNetworkConditions', {offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await page.cdp('Page.addScriptToEvaluateOnNewDocument', {source: "(()=>{window.__auditSockets=[];const OriginalWebSocket=window.WebSocket;window.WebSocket=class extends OriginalWebSocket{constructor(...args){super(...args);window.__auditSockets.push(this);}};})();"});
    await page.goto(${JSON.stringify(world.url)});
    await page.cdp('Emulation.setDeviceMetricsOverride', {width:1280,height:900,deviceScaleFactor:1,mobile:false});
    const cdp = (method, params) => page.cdp(method, params);
    const {runClientRegression} = await import(${JSON.stringify(checksPath)});
    const {runAuditClientChecks} = await import(${JSON.stringify(auditPath)});
    await runClientRegression({cdp});
    await runAuditClientChecks({cdp, url:${JSON.stringify(world.url)}, gmToken:${JSON.stringify(world.gmToken)}});
    await task.finish({keep:[]});
  `;
  const execution = promisify(execFile)('ego-browser', ['nodejs', '-e', script], { timeout: 240000, maxBuffer: 4 * 1024 * 1024 });
  // The CLI consumes stdin before evaluation even with -e. Close the owned
  // pipe, matching shell invocations; an open pipe would stall the gate.
  execution.child.stdin.end();
  const result = await execution;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
} catch (error) {
  if (error.stdout) process.stdout.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  console.error('EGO CLIENT CHECK FAILED:', error.killed ? 'Browser gate timed out.' : 'See browser diagnostics above.');
  process.exitCode = 1;
} finally {
  if (world) {
    const result = await world.stop();
    if (result.code !== 0) process.exitCode = 1;
  }
  rmSync(directory, { recursive: true, force: true });
}
