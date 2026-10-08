// Read-only development preflight. Never imports db.js or opens a world database.
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runtimeConfig } from '../server/runtime-config.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export function launchSummary(env = {}, root = ROOT) {
  const config = runtimeConfig(env);
  return {
    profile: config.profile, host: config.host, port: config.port,
    apiEnabled: config.apiEnabled, debugApiEnabled: config.debugApiEnabled,
    agentBoostEnabled: config.agentBoostEnabled,
    database: env.DR_DB_PATH === ':memory:' ? ':memory:'
      : env.DR_DB_PATH ? resolve(env.DR_DB_PATH) : resolve(root, 'data/store/dragonrealms.db'),
  };
}

export async function diagnose({ env = process.env, root = ROOT, version = process.versions.node } = {}) {
  const checks = [];
  const check = async (name, action) => {
    try { checks.push({ name, status: 'pass', detail: await action() }); }
    catch (error) { checks.push({ name, status: 'fail', detail: error.message }); }
  };
  await check('Node runtime', () => {
    const [major, minor] = version.split('.').map(Number);
    if (!(major > 22 || major === 22 && minor >= 5)) throw new Error('Node 22.5 or newer is required.');
    return version;
  });
  let launch;
  await check('Launch configuration', () => {
    launch = launchSummary(env, root);
    return `${launch.profile} at ${launch.host}:${launch.port}`;
  });
  await check('WebSocket dependency', async () => {
    await import('ws');
    return 'ws is installed';
  });
  await check('SQLite runtime', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try { db.prepare('SELECT 1 AS ready').get(); }
    finally { db.close(); }
    return 'node:sqlite can open an in-memory database';
  });
  if (launch) await check('Database location', () => {
    if (launch.database === ':memory:') return 'Transient in-memory storage';
    if (existsSync(launch.database)) {
      if (!statSync(launch.database).isFile()) throw new Error('DR_DB_PATH must name a file.');
      accessSync(launch.database, constants.R_OK | constants.W_OK);
    }
    let parent = dirname(launch.database);
    while (!existsSync(parent)) parent = dirname(parent);
    if (!statSync(parent).isDirectory()) throw new Error('Database parent must be a directory.');
    accessSync(parent, constants.W_OK | constants.X_OK);
    return `${launch.database} (${existsSync(launch.database) ? 'existing file' : 'created by server startup'})`;
  });
  await check('Client entry point', () => {
    const entry = resolve(root, 'public/index.html');
    if (!statSync(entry).isFile()) throw new Error('public/index.html must be a file.');
    accessSync(entry, constants.R_OK);
    return 'public/index.html is readable';
  });
  return { ok: checks.every(check => check.status === 'pass'), checks, ...(launch ? { launch } : {}) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--json', '--help'].includes(arg))) {
    console.error('Usage: node scripts/doctor.mjs [--json] [--help]');
    process.exitCode = 2;
  } else if (args.includes('--help')) {
    console.log('Usage: node scripts/doctor.mjs [--json]\nChecks runtime, launch settings and storage access without starting a server.\nDoes not check port ownership, migrate a database or certify a running world.');
  } else {
    const report = await diagnose();
    console.log(args.includes('--json') ? JSON.stringify(report, null, 2)
      : report.checks.map(check => `${check.status.toUpperCase()}  ${check.name}: ${check.detail}`).join('\n'));
    process.exitCode = report.ok ? 0 : 1;
  }
}
