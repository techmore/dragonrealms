// Fixed-width policy inputs made only from normal player-visible game frames.
// There is deliberately no fallback to the isolated engine's player object.
import { parseWirePrompt } from './wire_observation.mjs';

export const CLIENT_FEATURE_SCHEMA = 'dragonrealms.puffer.client-policy-observation/1';
const clean = text => typeof text === 'string' ? text.replace(/\x1b\[[0-9;]*m/g,'') : '';
const uniqueStrings = (values,label) => {
  if (!Array.isArray(values) || values.some(v=>typeof v!=='string'||!v.trim())
    || new Set(values).size!==values.length) throw new Error(`Invalid ${label}`);
  return [...values];
};

export function parseWireExperience(message, skillNames) {
  const text=clean(message?.msg);
  if (message?.t!=='msg'||!text.includes('Experience')) return {valid:false,reason:'not_experience'};
  const known=new Set(skillNames), skills={};
  const re=/^\s{2}(.+?)\s+rank (\d+)\s+(\d+)%\s+([A-Za-z ]+?)(?:\s+\[(\d+) held\])?\s*$/gm;
  for (const m of text.matchAll(re)) {
    const name=m[1].trim(),rank=Number(m[2]),mindstatePercent=Number(m[3]),mindstate=m[4].trim();
    // Rank progress is also displayed when no learning pool is present. Its
    // denominator is the display rank-exp curve, not the real rank threshold,
    // so a valid player-visible row may exceed 100% (usually with mind lock).
    if (!known.has(name)||rank<0||!Number.isSafeInteger(rank)
      ||mindstatePercent<0||!Number.isSafeInteger(mindstatePercent))
      return {valid:false,reason:'unknown_experience_row'};
    skills[name]={rank,mindstate_percent:mindstatePercent,mindstate,
      held_pool:Number.isSafeInteger(Number(m[5]))?Number(m[5]):null};
  }
  if (!text.includes('Guild circle progress (next:')) return {valid:false,reason:'missing_circle_progress'};
  // exp deliberately omits skills with rank=0, no rank progress, and no
  // learning pool; that documented omission is an observed all-zero row.
  for(const name of known) skills[name]??={rank:0,mindstate_percent:0,mindstate:'clear',held_pool:0};
  return {valid:true,skills};
}

export function parseWireInventory(message) {
  const text=clean(message?.msg);
  if (message?.t!=='msg'||!text.includes('You are carrying:')) return {valid:false,reason:'not_inventory'};
  const body=text.split('You are carrying:')[1]?.split('\nWorn:')[0];
  const worn=/\nWorn: (.*?)\.\nYou are /.exec(text)?.[1];
  const silver=/\nSilvers: (\d+)\./.exec(text);
  if (body==null||worn==null||!silver) return {valid:false,reason:'malformed_inventory'};
  const names=body.trim()==='nothing.'?[]:body.split('\n').map(s=>s.trim()).filter(Boolean)
    .map(s=>s.replace(/^\d+x /,'').replace(/ \[bundled\]$/,''));
  if (names.some(s=>!s||s==='nothing.')) return {valid:false,reason:'malformed_inventory_item'};
  return {valid:true,items:names,worn:worn==='nothing'?[]:worn.split(/,\s*/),silver:Number(silver[1])};
}

export function clientFeatureSpec({guild,race,actions,requirementLabels,skillNames,gearNames,roomIds}) {
  if(typeof guild!=='string'||typeof race!=='string') throw new Error('Guild and race are required');
  const spec={schema:CLIENT_FEATURE_SCHEMA,guild,race,
    actions:uniqueStrings(actions,'actions'),
    requirementLabels:uniqueStrings(requirementLabels,'requirement labels'),
    skillNames:uniqueStrings(skillNames,'skill names'),
    gearItems:Array.isArray(gearNames)?gearNames.map(item=>{
      if(!item||typeof item.id!=='string'||typeof item.name!=='string'||!item.id||!item.name)
        throw new Error('Invalid public gear catalog');
      return {id:item.id,name:item.name};
    }):[],roomIds:uniqueStrings(roomIds,'room IDs')};
  if(!spec.actions.length||!spec.requirementLabels.length||!spec.skillNames.length
    ||!spec.roomIds.length||spec.requirementLabels.length>64||spec.skillNames.length>512
    ||spec.gearItems.length>64||new Set(spec.gearItems.map(i=>i.id)).size!==spec.gearItems.length
    ||spec.roomIds.length>1024) throw new Error('Client feature schema exceeds bounds');
  spec.features=['hp_fraction','stamina_fraction','resource_fraction','roundtime_fraction',
    'circle_fraction','silver_fraction','combat','bleeding',
    ...spec.skillNames.flatMap(s=>[`rank:${s}`,`learning_percent:${s}`,`held_pool:${s}`]),
    ...spec.requirementLabels.flatMap(s=>[`requirement:${s}`,`requirement_active:${s}`]),
    ...spec.gearItems.map(s=>`owns:${s.id}`),...spec.gearItems.map(s=>`worn:${s.id}`),
    ...spec.roomIds.map(s=>`room:${s}`)];
  spec.observationSize=spec.features.length;
  return spec;
}

// Every input comes from received frames; absent facts are errors, not zeros.
export function encodeClientObservation(spec,state) {
  if(spec?.schema!==CLIENT_FEATURE_SCHEMA||!state||typeof state!=='object') throw new Error('Unknown client observation schema');
  const parsed=parseWirePrompt(state.prompt);
  if(!parsed.valid) throw new Error(`Unusable prompt: ${parsed.reason}`);
  const exp=state.experience?.valid?state.experience:parseWireExperience(state.experience,spec.skillNames);
  const inv=state.inventory?.valid?state.inventory:parseWireInventory(state.inventory);
  if(!exp.valid||!inv.valid||typeof state.room?.roomId!=='string') throw new Error('Incomplete ordinary-client observations');
  const v=parsed.vitals, req=parsed.requirements.rows;
  if(state.guild!==spec.guild||state.race!==spec.race||!spec.roomIds.includes(state.room.roomId)) throw new Error('Client state is outside the trained schema');
  const reqByLabel=new Map(req.map(row=>[row.label,row]));
  if([...reqByLabel.keys()].some(label=>!spec.requirementLabels.includes(label))) throw new Error('Requirement rows do not match the frozen schema');
  if(spec.skillNames.some(name=>!Object.hasOwn(exp.skills,name))) throw new Error('Experience snapshot omits a required skill');
  const normalize=s=>s.toLowerCase().replace(/^(a|an|the)\s+/,'').trim();
  const possessions=new Set(inv.items.map(normalize)), worn=new Set(inv.worn.map(normalize));
  const values=[v.hp/v.max_hp,v.stamina/v.max_stamina,
    v.resource_value==null?0:v.resource_value/v.resource_max,
    Math.min(1,v.roundtime_seconds/10),Math.min(1,v.circle/20),Math.min(1,inv.silver/1000),
    Number(v.in_combat),Number(Boolean(v.bleeding?.length)),
    ...spec.skillNames.flatMap(name=>[Math.min(1,exp.skills[name].rank/200),
      Math.min(1,Math.max(0,exp.skills[name].mindstate_percent/100)),
      Math.min(1,(exp.skills[name].held_pool||0)/1000)]),
    ...spec.requirementLabels.flatMap(label=>{
      const row=reqByLabel.get(label);return row?[Math.min(1,row.have/row.need),1]:[0,0];
    }),
    ...spec.gearItems.map(item=>Number(possessions.has(normalize(item.name)))),
    ...spec.gearItems.map(item=>Number(worn.has(normalize(item.name)))),
    ...spec.roomIds.map(name=>Number(state.room.roomId===name))];
  if(values.length!==spec.observationSize||values.some(x=>!Number.isFinite(x)||x<0||x>1)) throw new Error('Invalid encoded observation');
  return {schema:spec.schema,observation:values,features:spec.features,
    exact_skill_exp:null,experience_pools:null,source:'ordinary-client-frames'};
}
