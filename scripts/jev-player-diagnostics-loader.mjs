// Optional ESM load hook. It instruments only the Jev runner entrypoint and
// only adds diagnostic data to no-action wait events.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { instrumentJevNoActionSource } from './lib/jev-no-action-diagnostics.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const jevEntrypoint=path.join(root,'scripts/jev-player.mjs');

export async function load(url,context,nextLoad) {
  const loaded=await nextLoad(url,context);
  const main=process.argv[1]?path.resolve(process.argv[1]):'';
  if(main===jevEntrypoint && url===pathToFileURL(jevEntrypoint).href
      && loaded.format==='module' && loaded.source!=null) {
    const source=typeof loaded.source==='string'
      ?loaded.source:new TextDecoder().decode(loaded.source);
    return {...loaded,source:instrumentJevNoActionSource(source)};
  }
  return loaded;
}
