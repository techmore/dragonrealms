import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { instrumentJevLowFundsCrierSource } from './lib/jev-low-funds-crier.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=path.join(root,'scripts/jev-player.mjs');
export async function load(url,context,nextLoad) {
  const loaded=await nextLoad(url,context), main=process.argv[1]?path.resolve(process.argv[1]):'';
  if(main===entry&&url===pathToFileURL(entry).href&&loaded.format==='module'&&loaded.source!=null) {
    const source=typeof loaded.source==='string'?loaded.source:new TextDecoder().decode(loaded.source);
    return {...loaded,source:instrumentJevLowFundsCrierSource(source,{extensionHash:process.env.JEV_LOW_FUNDS_CRIER_HASH||null})};
  }
  return loaded;
}
