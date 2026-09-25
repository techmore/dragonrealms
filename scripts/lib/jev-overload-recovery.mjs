import { instrumentJevNoActionSource } from './jev-no-action-diagnostics.mjs';

const NAVIGATION_FAILURE = "if (!result.ok) { blockedActionIds.add(selected.id); log({type:'navigation-ended',goal:selected.id,...result,room:session.vitals.room}); }";
const NAVIGATION_START = 'const result = await walkTo(selected.targetRoom, selected.id);';
const REFUSAL_BRANCH = "} else if (/^(You cannot go that way|Creatures block your path|You are overloaded|Go where)/i.test(text) && lastCommandActionId) {";
const START_EVENT = "log({ type: 'start', char: name, user, origin: session.origin });";

export function instrumentJevOverloadRecoverySource(source,{extensionHash=null}={}) {
  if (typeof source!=='string') throw new TypeError('Jev player source must be text');
  for (const [label,anchor] of [['navigation failure',NAVIGATION_FAILURE],['navigation start',NAVIGATION_START],['refusal handler',REFUSAL_BRANCH],['start event',START_EVENT]]) {
    const count=source.split(anchor).length-1;
    if(count!==1) throw new Error(`Expected one ${label} anchor; found ${count}`);
  }
  let transformed=instrumentJevNoActionSource(source);
  transformed=transformed.replace(NAVIGATION_START,
    'lastCommandActionId=null; lastCommandActionAt=0; const result = await walkTo(selected.targetRoom, selected.id);');
  transformed=transformed.replace(NAVIGATION_FAILURE,
    "if (!result.ok) { if (!(overloadedFlag && String(result.reason||'').startsWith('movement-unconfirmed'))) blockedActionIds.add(selected.id); log({type:'navigation-ended',goal:selected.id,...result,room:session.vitals.room,burdenRecovery:overloadedFlag&&String(result.reason||'').startsWith('movement-unconfirmed')}); }");
  transformed=transformed.replace(REFUSAL_BRANCH,
    "} else if (/^You are overloaded/i.test(text) && lastCommandActionId) { log({type:'action-refusal-classified',action:lastCommandActionId,classification:'environmental-overload',blocked:false,room:session.vitals.room}); lastCommandActionId=null; lastCommandActionAt=0; } else if (/^(You cannot go that way|Creatures block your path|Go where)/i.test(text) && lastCommandActionId) {");
  transformed=transformed.replace(START_EVENT,
    `${START_EVENT}\nlog({type:'harness-extension',id:'jev-overload-recovery',version:1,sourceHash:${JSON.stringify(extensionHash)}});`);
  return transformed;
}
