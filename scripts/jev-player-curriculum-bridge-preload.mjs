#!/usr/bin/env node
// Opt-in Jev harness overlay. It only transforms the isolated player entry
// point; native DR server code and ordinary client scripts are not touched.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const main=process.argv[1]?path.resolve(process.argv[1]):'';
if(main===path.join(root,'scripts/jev-player.mjs')) {
  const inputs=['scripts/jev-player-curriculum-bridge-preload.mjs',
    'scripts/jev-player-curriculum-bridge-loader.mjs','scripts/lib/jev-curriculum-bridge.mjs'];
  const hash=createHash('sha256');
  for(const file of inputs) hash.update(file).update('\0').update(fs.readFileSync(path.join(root,file)));
  process.env.JEV_CURRICULUM_BRIDGE_HASH=hash.digest('hex');
  register('./jev-player-curriculum-bridge-loader.mjs',import.meta.url);
}
