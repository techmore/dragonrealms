#!/usr/bin/env node
// Opt-in candidate: prioritize an offered town quest when the player cannot
// afford the next trainer lesson. This is a Jev harness overlay only.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(root,'scripts/jev-player.mjs')) {
  const hash=createHash('sha256');
  for(const f of ['scripts/jev-player-low-funds-crier-preload.mjs','scripts/jev-player-low-funds-crier-loader.mjs','scripts/lib/jev-low-funds-crier.mjs','scripts/lib/jev-no-action-diagnostics.mjs']) hash.update(f).update('\0').update(fs.readFileSync(path.join(root,f)));
  process.env.JEV_LOW_FUNDS_CRIER_HASH=hash.digest('hex');
  register('./jev-player-low-funds-crier-loader.mjs',import.meta.url);
}
