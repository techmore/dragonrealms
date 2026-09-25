#!/usr/bin/env node
// Run the Jev player against an isolated disposable DR server/database.
// The main local world stays untouched; per-run traces still publish to public/live.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startWorld } from './lib/disposable-world.mjs';
import { jevStatPolicy } from './lib/jev-stat-policy.mjs';
import { GUILDS } from '../data/guilds.js';

const args = process.argv.slice(2);
let minutesArg = '45';
let boost = 1;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--boost') {
    boost = Number(args[++i]);
  } else if (!args[i].startsWith('--')) {
    minutesArg = args[i];
  } else {
    throw new Error(`Unknown option: ${args[i]}`);
  }
}
const minutes = Math.max(1, Math.min(360, Number(minutesArg)));
if (!Number.isFinite(minutes)) throw new Error('Duration must be a finite number of minutes');
if (!Number.isInteger(boost) || boost < 1 || boost > 20)
  throw new Error('Disposable-world diagnostic boost must be an integer from 1 to 20');
const statPolicy = jevStatPolicy(process.env.JEV_PLAYER_STAT_POLICY || 'physical-combat-v1');
const guildId = String(process.env.JEV_PLAYER_GUILD || 'barbarian').trim().toLowerCase();
if (!GUILDS[guildId]) throw new Error(`Unknown Jev player guild: ${guildId}`);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const scratch = mkdtempSync(path.join(tmpdir(), 'dragonrealms-jev-world-'));
const dbPath = path.join(scratch, 'dragonrealms.db');
const world = await startWorld({ dbPath, enableApi: true, enableAgentBoost: true });
console.log(JSON.stringify({ type:'isolated-world-start', port:world.port, dbPath,
  durationMinutes:minutes, guild:guildId, statPolicy:statPolicy.name,
  experienceBoost:boost,
  comparisonId:process.env.JEV_PLAYER_COMPARISON_ID || null }));

const child = spawn(process.execPath, [path.join(root, 'scripts/jev-player.mjs'), String(minutes)], {
  cwd:root,
  stdio:'inherit',
  env:{...process.env, JEV_PLAYER_STAT_POLICY:statPolicy.name,
    JEV_PLAYER_GUILD:guildId,
    JEV_PLAYER_TEST_BOOST:String(boost),
    PORT:String(world.port), DR_PORT:String(world.port), DR_HTTP_ORIGIN:world.url, DR_WS_ORIGIN:world.wsUrl},
});
let requestedSignal = null;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
  requestedSignal ||= signal;
  if (child.exitCode == null && child.signalCode == null) child.kill(signal);
});
const result = await new Promise(resolve => {
  child.once('exit', (code, signal) => resolve({ code, signal }));
  child.once('error', error => resolve({ error }));
});
await world.stop();
console.log(JSON.stringify({ type:'isolated-world-stop', ...result, requestedSignal, dbPath }));
if (result.error) throw result.error;
process.exitCode = result.code ?? (result.signal ? 1 : 0);
