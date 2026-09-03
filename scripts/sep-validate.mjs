#!/usr/bin/env node
// Deterministic SEP gate for model-produced DR scripts and route JSON.
// Usage: node scripts/sep-validate.mjs script path/to/file.dr
//        node scripts/sep-validate.mjs route path/to/route.json
import fs from 'node:fs';
import { ROOMS } from '../data/world.js';

const [, , kind, file] = process.argv;
if (!kind || !file || !['script', 'route'].includes(kind)) {
  console.error('usage: sep-validate.mjs <script|route> <file>'); process.exit(2);
}
const text = fs.readFileSync(file, 'utf8');
const errors = [];
if (kind === 'script') {
  if (text.length > 8000) errors.push(`script is ${text.length} bytes; saved-script limit is 8000`);
  const allowed = /^(?:#|\s*$|\s*(?:put|putrun|match|matchre|matchwait|goto|if|ife|iflt|ifge|ifexists|wait|pause|echo|exit|return|var|timer|move|attack|circle|train|tdptrain|exp|tdp|look|analyze|skin|rest|stand|flee|retreat|tend|wear|remove|wield|buy|sell|bundle|learn|roar|form|prepare|cast|target|hunt|scan)\b)/;
  text.split(/\r?\n/).forEach((line, i) => { if (!allowed.test(line)) errors.push(`line ${i + 1}: unknown script form`); });
  if (/buy\s+throwing knives\b/i.test(text)) errors.push('requests throwing knives, which are not sold by the Crossing shop');
} else {
  let route; try { route = JSON.parse(text); } catch { errors.push('route is not valid JSON'); }
  if (route) {
    const steps = Array.isArray(route) ? route : route.steps;
    if (!Array.isArray(steps)) errors.push('route must be an array or contain a steps array');
    else for (const [i, step] of steps.entries()) {
      const id = typeof step === 'string' ? step : step.room;
      if (!ROOMS[id]) errors.push(`step ${i + 1}: unknown room ${id}`);
    }
  }
}
if (errors.length) { console.error(`SEP FAIL (${errors.length})`); errors.forEach(e => console.error(`- ${e}`)); process.exit(1); }
console.log(`SEP PASS: ${kind} ${file}`);
