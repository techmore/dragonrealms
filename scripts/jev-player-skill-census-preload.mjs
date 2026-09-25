#!/usr/bin/env node
// Optional Node ESM preload for a fresh Jev-player run. Usage:
//   NODE_OPTIONS="--import=/absolute/path/scripts/jev-player-skill-census-preload.mjs" \
//     node scripts/jev-player.mjs 240
// It monkey-patches only this process's WireSession instance methods; no game
// server file or hashed player/policy source is modified.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installJevSkillCensusInstrumentation } from './lib/jev-skill-census-instrumentation.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const main=process.argv[1]?path.resolve(process.argv[1]):'';
if(main===path.join(root,'scripts/jev-player.mjs')) {
  const {WireSession}=await import('./lib/wire-session.mjs');
  installJevSkillCensusInstrumentation(WireSession,{root,
    intervalMs:Number(process.env.JEV_SKILL_CENSUS_INTERVAL_MS||180_000),
    timeoutMs:Number(process.env.JEV_SKILL_CENSUS_TIMEOUT_MS||5_000),
    minHpFraction:Number(process.env.JEV_SKILL_CENSUS_MIN_HP_FRACTION||0.8)});
}
