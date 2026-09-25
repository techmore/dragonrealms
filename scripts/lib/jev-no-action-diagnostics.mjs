// Source transformer used by the optional diagnostics preload. Keep this
// strictly observational: it adds fields to a wait event, but does not alter
// action selection or command dispatch.
const WAIT_LOG = "log({type:'wait',reason:'only-legal-action',retryInSeconds:10,room:v.room});";

export function instrumentJevNoActionSource(source) {
  if (typeof source !== 'string') throw new TypeError('Jev player source must be text');
  const occurrences = source.split(WAIT_LOG).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected one only-legal-action log site; found ${occurrences}`);
  }
  const diagnosticLog = `log({type:'wait',reason:'only-legal-action',retryInSeconds:10,room:v.room,diagnostics:{schema:'jev-no-action/1',candidateActions:options.map(({id,kind,targetRoom})=>({id,kind,targetRoom})),cooledActions:[...cooledActions],blockedActions:[...blockedActionIds],oncePerFightActions:[...oncePerFightActions],overloaded:overloadedFlag,vitals:{hp:v.hp,maxHp:v.maxhp,stamina:v.stamina,roundtime:v.rt,inCombat:v.inCombat,circle:v.circle},requirements:v.requirements?{circle:v.requirements.circle,rows:(v.requirements.rows||[]).map(({label,have,need})=>({label,have,need}))}:null,recentActions:actionMemory.slice(-8),recentText:recent.slice(-8)}});`;
  return source.replace(WAIT_LOG, diagnosticLog);
}
