import { instrumentJevNoActionSource } from './jev-no-action-diagnostics.mjs';

const SUPERVISED='      repeatedOverrideReleaseAfter,\n    });';
const START_EVENT="log({ type: 'start', char: name, user, origin: session.origin });";

export function instrumentJevLowFundsCrierSource(source,{extensionHash=null}={}) {
  if(typeof source!=='string') throw new TypeError('Jev player source must be text');
  for(const [label,anchor] of [['supervised choice',SUPERVISED],['start event',START_EVENT]]) {
    const count=source.split(anchor).length-1;
    if(count!==1) throw new Error(`Expected one ${label} anchor; found ${count}`);
  }
  let transformed=instrumentJevNoActionSource(source);
  const insert=`
    if (!session.vitals.inCombat && Number(session.vitals.silver || 0) < 40) {
      const crierAction = options.find(option => option.id === 'take_quest');
      if (crierAction) selectedResult = {...selectedResult, action:crierAction,
        overrideReason:'take-quest-before-field-route-when-low-funds'};
    }
`;
  transformed=transformed.replace(SUPERVISED,SUPERVISED+insert);
  transformed=transformed.replace(START_EVENT,
    `${START_EVENT}\nlog({type:'harness-extension',id:'jev-low-funds-crier',version:1,sourceHash:${JSON.stringify(extensionHash)}});`);
  return transformed;
}
