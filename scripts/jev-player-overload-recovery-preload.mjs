#!/usr/bin/env node
// Opt-in overload-recovery candidate for a fresh Jev run:
//   NODE_OPTIONS="--import=/absolute/path/scripts/jev-player-overload-recovery-preload.mjs" \
//     node scripts/jev-player.mjs 240
// This is an isolated runner overlay. It never transforms the DR server or
// native scripts and logs a version/hash marker in the player's event stream.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const main=process.argv[1]?path.resolve(process.argv[1]):'';
if(main===path.join(root,'scripts/jev-player.mjs')) {
  const inputs=['scripts/jev-player-overload-recovery-preload.mjs','scripts/jev-player-overload-recovery-loader.mjs','scripts/lib/jev-overload-recovery.mjs','scripts/lib/jev-no-action-diagnostics.mjs'];
  const hash=createHash('sha256');
  for(const file of inputs) hash.update(file).update('\0').update(fs.readFileSync(path.join(root,file)));
  process.env.JEV_OVERLOAD_RECOVERY_HASH=hash.digest('hex');
  register('./jev-player-overload-recovery-loader.mjs',import.meta.url);
}
