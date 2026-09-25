// Character creation policy for isolated Jev runs; never changes server rules.
// Each preset spends the same 30 chargen points so runs can isolate allocation.
const POLICIES = Object.freeze({
  'physical-combat-v1': Object.freeze({ str:10, con:10, agi:5, ref:5 }),
  'mental-learning-v1': Object.freeze({ int:10, dis:10, wis:10 }),
});

export function jevStatPolicy(name = 'physical-combat-v1') {
  const allocation = POLICIES[name];
  if (!allocation) throw new Error(`Unknown Jev stat policy: ${name}`);
  return { name, allocation:{...allocation}, points:Object.values(allocation).reduce((sum,n)=>sum+n,0) };
}

export function jevStatPolicyNames() {
  return Object.keys(POLICIES);
}
