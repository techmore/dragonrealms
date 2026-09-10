import { GUILDS, trainableSkills, circleRequirementNeeds, circleRequirements, circleRequirementCandidates } from '../../data/guilds.js';

// A completed EXP sheet supplies zeroes for omitted skills. Until then (or
// after 90 seconds without a fresh sheet), ask for observations, not work.
export function barbarianActivity({ ranks = {}, circle = 1, observedAt, locked = {}, lastCombatAt, now = Date.now() }) {
  const vars = {gap_mode:'observe',gap_analyze:'1',gap_trip:'1',gap_roar:'1',gap_forage:'0'};
  for (const skill of trainableSkills(GUILDS.barbarian)) vars[`gap_train_${skill}`]='0';
  vars.gap_study='0';
  if (!Number.isFinite(observedAt) || now-observedAt>90000) return {vars, reason:'EXP snapshot missing or stale'};
  const shaped=Object.fromEntries(Object.entries(ranks).map(([id,v])=>[id,{rank:Number(v?.rank??v)||0}]));
  const result=circleRequirements({id:'barbarian'},shaped,circle+1);
  const open=result.rows.filter(r=>r.have<r.need);
  const needs=new Set(circleRequirementNeeds({id:'barbarian'},shaped,circle+1).map(n=>n.skill));
  for (const skill of trainableSkills(GUILDS.barbarian)) vars[`gap_train_${skill}`]=needs.has(skill)?'1':'0';
  vars.gap_study=open.some(r=>/lore$/.test(r.label))?'1':'0';
  const full=id=>Number.isFinite(locked[id]) && now-locked[id]<60000;
  const missing=id=>open.some(r=>r.label===id);
  vars.gap_analyze=missing('expertise')&&!full('expertise')?'1':'0';
  vars.gap_trip=missing('tactics')&&!full('tactics')?'1':'0';
  vars.gap_roar=open.some(r=>r.label==='inner_fire'||/supernatural$/.test(r.label))?'1':'0';
  const survival=open.filter(r=>/survival$/.test(r.label));
  const survivalNeed=Math.max(0,...survival.map(r=>r.need));
  const pool=circleRequirementCandidates({id:'barbarian'},'survival');
  const candidates=[['forage','foraging'],['hunt','perception']].filter(([,id])=>pool.includes(id))
    .map(([action,id])=>({action,id,rank:shaped[id]?.rank||0,need:survivalNeed}))
    .filter(x=>x.rank<x.need);
  vars.gap_forage=candidates.some(x=>x.action==='forage'&&!full(x.id))?'1':'0';
  // Train the largest relative deficit first. Stop when the Nth gate closes;
  // don't insist on training a named skill after another eligible lane wins.
  const useful=candidates.filter(x=>!full(x.id)).sort((a,b)=>(b.need-b.rank)/b.need-(a.need-a.rank)/a.need);
  const combat=open.filter(r=>!/(?:survival|lore)$/.test(r.label));
  // Skinning needs kills even after the named combat rows are satisfied.
  // Do not strand that counted survival lane by switching entirely to town.
  const skinning=shaped.skinning?.rank || 0;
  if (survivalNeed>skinning && pool.includes('skinning'))
    combat.push({label:'skinning',have:skinning,need:survivalNeed});
  const combatWeight=Math.max(0,...combat.map(r=>(r.need-r.have)/r.need));
  const next=useful[0];
  if(result.ok) vars.gap_mode='town';
  // A persistent combat blocker (e.g. unpurchased armor) must not starve
  // smaller survival gaps forever. After combat, reserve up to 30 seconds
  // for useful field work before comparing combat weight again.
  else if(next && ((next.need-next.rank)/next.need>=combatWeight
    || (Number.isFinite(lastCombatAt) && now-lastCombatAt<30000))) vars.gap_mode=next.action;
  else if(combat.length) vars.gap_mode='combat';
  else if(candidates.length && !useful.length) vars.gap_mode='drain';
  else vars.gap_mode='town';
  return {vars, ready:result.ok, reason:open.map(r=>`${r.label} ${r.have}/${r.need}`).join(', ')||'next circle ready'};
}
