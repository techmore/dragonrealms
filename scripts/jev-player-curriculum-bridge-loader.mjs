import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { instrumentJevCurriculumBridgeSource } from './lib/jev-curriculum-bridge.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=path.join(root,'scripts/jev-player.mjs');
export async function load(url,context,nextLoad) {
  const loaded=await nextLoad(url,context), main=process.argv[1]?path.resolve(process.argv[1]):'';
  if(main===entry&&url===pathToFileURL(entry).href&&loaded.format==='module'&&loaded.source!=null) {
    const source=typeof loaded.source==='string'?loaded.source:new TextDecoder().decode(loaded.source);
    return {...loaded,source:instrumentJevCurriculumBridgeSource(source,{extensionHash:process.env.JEV_CURRICULUM_BRIDGE_HASH||null})};
  }
  return loaded;
}
