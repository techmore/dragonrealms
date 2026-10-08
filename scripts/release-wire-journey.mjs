#!/usr/bin/env node
// Bounded normal-player journey through owned fresh worlds, no API/debug/boost.
import { mkdirSync, writeFileSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { startWorld } from './lib/disposable-world.mjs';
import { runWireJourney, sourceWsUrl, REPRESENTATIVE_GUILDS } from './lib/release-wire-journey.mjs';
const args = process.argv.slice(2);
let world, temp;
try {
  let sourceUrl, outDir, cap = 120, guilds = REPRESENTATIVE_GUILDS;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--source-url' && args[index + 1]) sourceUrl = sourceWsUrl(args[++index]);
    else if (args[index] === '--out-dir' && args[index + 1]) outDir = resolve(args[++index]);
    else if (args[index] === '--cap-seconds' && args[index + 1]) cap = Number(args[++index]);
    else if (args[index] === '--guilds' && args[index + 1]) guilds = args[++index].split(',');
    else throw new Error(`Unknown or incomplete option: ${args[index]}`);
  }
  if (!outDir) throw new Error('--out-dir is required (choose a new artifact directory)');
  if (!Number.isFinite(cap) || cap < 10 || cap > 120) throw new Error('--cap-seconds must be between 10 and 120 (whole cohort)');
  if (!guilds.length || new Set(guilds).size !== guilds.length || guilds.some(guild => !REPRESENTATIVE_GUILDS.includes(guild))) throw new Error('Guilds must be a unique subset of barbarian,warmage,trader');
  mkdirSync(outDir, { mode: 0o700 });
  temp = mkdtempSync(join(tmpdir(), 'dr-wire-journey-'));
  const ownedWorld = !sourceUrl;
  const startedAt = new Date().toISOString(), deadline = Date.now() + cap * 1000;
  const results = [];
  for (const guild of guilds) {
    if (Date.now() >= deadline) { results.push({ guild, ok: false, failure: 'Cohort cap reached; account not started' }); process.exitCode = 1; continue; }
    const logPath = join(outDir, `${guild}.jsonl`);
    try {
      // Each owned leg gets untouched ordinary spawns and a fresh private DB.
      // Startup and shutdown are charged to the same whole-cohort cap.
      if (ownedWorld) world = await startWorld({ dbPath: join(temp, `${guild}.db`), enableApi: false, enableAgentBoost: false });
      const result = await runWireJourney({ url: ownedWorld ? world.wsUrl : sourceUrl, guild, deadline, onRecord: message => appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), ...message }) + '\n', { mode: 0o600 }) }); results.push(result);
    }
    catch (error) { results.push({ guild, ok: false, failure: error.message }); process.exitCode = 1; }
    finally { if (world) { const stopped = await world.stop(); world = null; if (stopped.code !== 0) process.exitCode = 1; } }
  }
  const report = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), capSeconds: cap, ownedWorld, freshWorldPerGuild: ownedWorld, apiEnabled: ownedWorld ? false : null, agentBoostEnabled: ownedWorld ? false : null, testApiUsed: false, debugApiUsed: false, boostRequested: false, bot: false, results, ok: results.every(result => result.ok), limitations: ['Representative functional normal-WS journeys; not matched progression or circle-2 evidence.'] };
  writeFileSync(join(outDir, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ ok: report.ok, guilds: results.map(result => ({ guild: result.guild, ok: result.ok, checks: result.checks, failure: result.failure })), report: join(outDir, 'result.json') }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (world) { const result = await world.stop(); if (result.code !== 0) process.exitCode = 1; } if (temp) rmSync(temp, { recursive: true, force: true }); }
