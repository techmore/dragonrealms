// Production-generated baseline library. No live connections or game mutations.
// This does not reproduce the wire-sweep supervisor's adaptive routing/variants.
import {createHash} from 'node:crypto';
import {ROOMS} from '../data/world.js';
import {SKILLS} from '../data/skills.js';
import {buildHuntScript, buildCircleScript, buildMegaScript} from '../scripts/lib/script-gen.mjs';

export function route(from, to) {
  if (!ROOMS[from] || !ROOMS[to]) throw new Error('Unknown route endpoint');
  const queue = [[from, []]], seen = new Set([from]);
  for (let i=0; i<queue.length; i++) {
    const [room, path] = queue[i];
    if (room === to) return path;
    for (const [dir, exit] of Object.entries(ROOMS[room].exits || {})) {
      const next = typeof exit === 'string' ? exit : exit?.to;
      if (!ROOMS[next] || seen.has(next)) continue;
      seen.add(next);
      queue.push([next, [...path, {dir}]]);
    }
  }
  throw new Error(`No world route from ${from} to ${to}`);
}

export function productionLibrary({room, arena, circle, character='PufferScript', phase='hunt', trainList=null, skipCircle=false}) {
  if (!['hunt','hall'].includes(phase) || (trainList!==null && (!Array.isArray(trainList)||trainList.some(id=>!Object.hasOwn(SKILLS,id))))) throw new Error('Invalid observed training plan');
  if (!Number.isInteger(circle) || circle < 1 || circle > 20) throw new Error('Unknown circle');
  if (!ROOMS[arena]?.spawns?.length) throw new Error('Baseline requires a real hunting arena');
  const scriptBase = 'puffer_baseline_';
  const cap = {guild:'barbarian', race:'gortog', char:character, circle, scriptBase,
    defensiveKit:true, bazaarPath:route(room,'bazaar'), trainList, trainOffset:0, skipCircle};
  const library = {
    [`${scriptBase}hunt`]: buildHuntScript({cap,
      arena:{id:arena,fromArmed:route('bazaar',arena),fromHere:route(room,arena),fromHereOrigin:room},
      hallPath:route(arena,'hall_barbarian'), candidates:[]}),
    [`${scriptBase}circle`]: buildCircleScript({cap,
      fromArena:{hall:route(phase==='hall'?room:arena,'hall_barbarian'),back:route('hall_barbarian',arena)},
      errands:{bazaarPath:route('hall_barbarian','bazaar'),returnPath:route('bazaar',arena),
        sellLoot:['rat_pelt','kobold_skin'],gemLoot:[],gemRoom:'market_end',
        gemPath:route('bazaar','market_end'),gemBack:route('market_end','bazaar')}}),
    [`${scriptBase}mega`]: buildMegaScript(cap),
  };
  const hashes = Object.fromEntries(Object.entries(library).map(([name,text]) =>
    [name,createHash('sha256').update(text).digest('hex')]));
  return {library, entry:`${scriptBase}${phase==='hall'?'circle':'mega'}`, metadata:{
    schema:'dragonrealms.puffer.production-script-library/1',
    generator:'scripts/lib/script-gen.mjs', variant:'baseline', guild:'barbarian',race:'gortog',
    room,arena,circle,hashes,
    requires_supervisor:true,
    missing_supervisor_features:['hunt-to-hall handoff','observed requirement-driven training list','adaptive arena selection'],
    scope:'Production-generated hunt/circle/mega at a fixed arena; not the complete adaptive wire-sweep supervisor',
  }};
}
