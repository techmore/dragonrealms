#!/usr/bin/env node
// Opt-in diagnostic-only preload for a fresh Jev run:
//   NODE_OPTIONS="--import=/absolute/path/scripts/jev-player-diagnostics-preload.mjs" \
//     node scripts/jev-player.mjs 240
// It decorates only `only-legal-action` wait events. It does not change the
// choice set, send commands, patch the game server, or touch native DR scripts.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const main=process.argv[1]?path.resolve(process.argv[1]):'';
if(main===path.join(root,'scripts/jev-player.mjs'))
  register('./jev-player-diagnostics-loader.mjs',import.meta.url);
