// Opt-in ESM load hook for the isolated Jev runner. It changes only two
// harness-side overload classifications and adds no-action diagnostics.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { instrumentJevOverloadRecoverySource } from './lib/jev-overload-recovery.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const jevEntrypoint=path.join(root,'scripts/jev-player.mjs');

export async function load(url,context,nextLoad) {
  const loaded=await nextLoad(url,context);
  const main=process.argv[1]?path.resolve(process.argv[1]):'';
  if(main===jevEntrypoint && url===pathToFileURL(jevEntrypoint).href
      && loaded.format==='module' && loaded.source!=null) {
    const source=typeof loaded.source==='string'?loaded.source:new TextDecoder().decode(loaded.source);
    return {...loaded,source:instrumentJevOverloadRecoverySource(source,
      {extensionHash:process.env.JEV_OVERLOAD_RECOVERY_HASH||null})};
  }
  return loaded;
}
