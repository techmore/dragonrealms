// Sourced travel routes from Tjololo's Crossing Travel script (Elanthipedia),
// transcribed 2026-08-22. Each entry records the EXACT direction sequence real
// DR players walked between landmarks; `hops` is that count.
//
// Test contract (test/travel-routes.test.mjs): our graph must connect each
// pair with path length in [hops, ceil(hops*2.2)+4]. Lower bound: our map may
// never be SHORTER than real DR (that would skip distance). Upper bound: our
// densified filler may add rooms, but not unboundedly.
//
// Clean-room note: direction sequences are factual game mechanics.

export const ROUTES = [
  // empath <-> barbarian: 1 move
  { a: 'hall_empath', b: 'hall_barbarian', hops: 1 },
  // guard house <-> trader south door: 1 move
  { a: 'guard_house', b: 'trader_south',   hops: 1 },
  // academy <-> bard hall: 1 move
  { a: 'academy',     b: 'hall_bard',      hops: 1 },
  // academy <-> cleric hall: 4 moves
  { a: 'academy',     b: 'hall_cleric',    hops: 4 },
  // academy <-> Randal's leather shop (our tailor): 3 moves
  { a: 'academy',     b: 'tailor_shop',    hops: 3 },
  // empath <-> paladin hall: 7 moves
  { a: 'hall_empath', b: 'hall_paladin',   hops: 7 },
  // north gate <-> empath: 6 moves
  { a: 'north_gate',  b: 'hall_empath',    hops: 6 },
  // NE gate (customs) <-> empath: 6 moves
  { a: 'ne_gate',     b: 'hall_empath',    hops: 6 },
  // east gate <-> First Provincial Bank: 4 moves straight west in DR. Our
  // layout routes the bank court through the green's SE walk and the bazaar
  // street, so the walk is longer by density; distance ORDER preserved.
  { a: 'east_gate',   b: 'bank_plaza',     hops: 4, maxHops: 14 },
  // bank <-> Catrox's forge (distinct from the Forging Society hall): 2 moves
  { a: 'bank_plaza',  b: 'catrox_forge',   hops: 2 },
  // trader <-> west gate (Commerce Ave): 9 moves
  { a: 'trader_south',b: 'west_gate',      hops: 9 },
  // academy <-> west gate incl. Oxenwaithe bridge: 7 moves
  { a: 'academy',     b: 'west_gate',      hops: 7 },
  // west gate -> Siergelde road (favors run): long chain through the grove
  { a: 'west_gate',   b: 'woods_path',     hops: 18 },
  // empath <-> bank via the northern weave: 9 moves
  { a: 'hall_empath', b: 'bank_plaza',     hops: 9 },
];
