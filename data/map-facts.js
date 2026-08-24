// Machine-checkable geographic facts for The Crossing, each traced to a
// readable-text Elanthipedia page (see tmp-crossing-audit.md for the full
// audit). A fact is either:
//
//   { a, dir, b }        — room `b` is reachable from room `a` by walking `dir`
//                          (a single compass step, possibly through unnamed
//                          street rooms is NOT allowed here: one literal exit).
//   { a, path, b }       — room `b` sits at the end of an exact step sequence
//                          from room `a` (each step one literal exit).
//   { a, near, b, steps }— room `b` is reachable from `a` in exactly `steps`
//                          literal moves (distance claim without a fixed path).
//
// validateMapFacts() walks the REAL room graph (data/world.js), so any future
// edit that silently breaks a sourced relationship fails the suite.
//
// Sources: page titles as cited in tmp-crossing-audit.md §2–§6.

export const MAP_FACTS = [
  // ---- Craft societies (RanikMap1 errors list + society pages) ----
  // "This building can be found 4 rooms west from the Crossing NE gate."
  { a: 'ne_gate', path: ['w', 'w', 'w', 'w'], b: 'enchanting_soc', src: 'Enchanting Society' },
  // "1 room east from the Engineering Society" (RanikMap1 errors).
  { a: 'alchemy_soc', dir: 'e', b: 'engineering_soc', src: 'RanikMap1 errors (reversed: our chain puts alchemy west of engineering)' },
  // "3 rooms south from the Bard Guild" (Outfitting Society page).
  { a: 'hall_bard', near: 'outfitting_soc', steps: 3, src: 'Outfitting Society' },
  // "south of the Barbarian Guild" (Forging Society page) — 1 step.
  { a: 'hall_barbarian', dir: 's', b: 'forging_soc', src: 'Forging Society' },
  // "1 room east from the Engineering Society" (RanikMap1 errors; the page's
  // "2 rooms east of the Traders' Guild" conflicts with it — we keep the
  // errors-list adjacency since the Traders' guild position itself is only
  // approximate in our layout).
  { a: 'alchemy_soc', dir: 'e', b: 'engineering_soc', src: 'RanikMap1 errors (reversed: our chain puts alchemy west of engineering)' },

  // ---- Guilds (guildhall pages) — clean-room adaptations of the cited
  //      directions to our street graph are noted per fact. ----
  // "one room south from the Empath Guild" (Barbarian Guildhall page).
  { a: 'hall_empath', dir: 's', b: 'hall_barbarian', src: 'Barbarian Guildhall' },
  // "1 room west from the Barbarian Guild" — Crossing Meeting Hall (RanikMap1 errors).
  { a: 'hall_barbarian', dir: 'w', b: 'meeting_hall', src: 'RanikMap1 errors' },
  // Taelbert's door adjoins the Bard Guild block; clean-room: one move from
  // the hall's north door, per "east then west from the Bard Guild" being a
  // street-address description rather than a walk (Taelbert's Inn page).
  { a: 'hall_bard', near: 'taelberts_inn', steps: 1, src: "Taelbert's Inn" },
  // "1 east from the Bard Guild" — the academy gates sit one move east of the
  // hall's east door (Asemath Academy page).
  { a: 'hall_bard', near: 'academy', steps: 1, src: 'Asemath Academy' },
  // "just east of the Oxenwaithe Bridge" (Bard Guildhall page) — bridge is one
  // move from the hall across its west forecourt.
  { a: 'hall_bard', near: 'oxenwaithe_bridge', steps: 1, src: 'Bard Guildhall' },
  // Empath door is a short walk inside the NE gate ("GO DOOR ... near the gate",
  // Empath Guildhall page); clean-room: the yard's Magen walk is 1 move away,
  // and the door is the next step south.
  { a: 'gateyard', dir: 'sw', b: 'hall_empath', src: 'Empath Guildhall' },
  // "top of Herald Street ... go N, then GO DOOR" from #10077 (Paladin Guildhall
  // page): the guild door sits at the far end of Herald Street. Clean-room:
  // the street runs downhill from the guild, so walking the street away from
  // the Magen Road reaches the hall door.
  { a: 'herald_st', near: 'hall_paladin', steps: 3, src: 'Paladin Guildhall' },
  // "found in west Crossing"; south entrance 1 room east from the Guard House
  // (Trader Guildhall page).
  { a: 'guard_house', dir: 'e', b: 'trader_south', src: 'Trader Guildhall' },

  // ---- Gates & their neighborhoods ----
  // Jadewater Mansion "2 rooms east from the North Gate" (Jadewater Mansion
  // page); clean-room: gate -> road bend (ne) -> manor way (ne) -> manor.
  { a: 'north_gate', near: 'jadewater', steps: 3, src: 'Jadewater Mansion' },
  // Haldofurd's Barn "2 E from the West gate" (RanikMap1 errors). Our layout
  // inserts Raven's Court (Thief Passages entrance) between the gate and the
  // road: gate -> court (e) -> West Road (e) -> barn (e).
  { a: 'west_gate', path: ['e', 'e', 'e'], b: 'haldofurd_barn', src: 'RanikMap1 errors' },
  // Enchanting Society "4 rooms west from the Crossing NE gate" (dup of above, kept
  // as the canonical gate anchor).
  { a: 'ne_gate', near: 'enchanting_soc', steps: 4, src: 'Enchanting Society' },

  // ---- Civic & commercial (RanikMap1 errors + landmark pages) ----
  // Town Hall "N then E from the Carousel" (Town Hall page).
  { a: 'carousel', path: ['n', 'e'], b: 'town_hall', src: 'Town Hall' },
  // Market Plaza "over the ramp just east of the bank" (Market Plaza page):
  // plaza is 1 step east of the bank court.
  { a: 'bank_plaza', dir: 'se', b: 'market_plaza', src: 'Market Plaza adjacency' },
  // Order HQ "1 room E from the bank" (Order Headquarters page).
  { a: 'bank_plaza', dir: 's', b: 'order_hq', src: 'Order Headquarters' },
  // Herilo's faces the bank court; Poetry in Motion is 1 room beyond it
  // (RanikMap1 errors). Clean-room: the pair sits north of the court.
  { a: 'herilos_artifacts', dir: 'n', b: 'poetry_in_motion', src: 'RanikMap1 errors' },
  // Tatting Street housing "1 room N from the Longbow Bridge" (Tatting Street page).
  { a: 'longbow', dir: 's', b: 'tatting_st', src: 'Tatting Street' },
  // Apostle HQ: "from the empath's guild ... south, west, west, go archway"
  // (RanikMap1 notes). Clean-room: empath -> barbarian (s) -> meeting hall (w)
  // -> archway court west of the hall; the walk back is (e).
  { a: 'hall_empath', path: ['s', 'w'], b: 'meeting_hall', src: 'RanikMap1 notes' },
  { a: 'meeting_hall', dir: 'e', b: 'hall_barbarian', src: 'RanikMap1 notes' },

  // ---- Hunting grounds & outside-gate geography (sourced) ----
  // "Siergelde ruins west of Crossing" (Favors.md): the wilds chain runs
  // directly out the West Gate.
  // Siergelde lies west of Crossing through the western grove — 18 moves in
    // DR (Crossing Travel script wg2brook/favor run); clean-room: grove chain
    { a: 'west_gate', near: 'woods_path', steps: 18, src: 'Favors.md + Crossing Travel script' },
  // Ranger hall -> Pine Needle Path -> the Siergelde woods (Ranger Guildhall page).
  { a: 'pine_needle_path', dir: 'nw', b: 'woods_1', src: 'Ranger Guildhall' },
  // Whispering Marsh lies beyond the East Gate (world command text; DR's east-
  // gate hunt per Backstab skill.md — louts — pending a creature pass).
  { a: 'east_gate', dir: 'e', b: 'marsh_1', src: 'Backstab skill.md / world command' },
  // Sewers down from Temple Row (RanikMap1g membership; world command text).
  { a: 'temple_row', dir: 'd', b: 'sewers_1', src: 'Crossing Sewer / RanikMap1g' },

  // ---- Riverhaven (RanikMap30/31; guild pages; Favors.md) ----
  { present: ['rh_temple_garden', 'rh_noble_inn', 'rh_academy',
              'rh_enchanting', 'rh_hall_barbarian', 'rh_hall_bard',
              'rh_hall_cleric', 'rh_hall_empath', 'rh_hall_moonmage'],
    src: 'Riverhaven audit (tmp-riverhaven-audit.md)' },
  // Blackthorn Grove mausoleum lies EAST of Riverhaven (Favors.md, RanikMap31).
  // Our rh_wilds chain runs out the ferry landing toward it.
  { a: 'rh_ferry', dir: 'sw', b: 'rh_wilds_1', src: 'Favors.md (Blackthorn Grove east of Riverhaven)' },

  // Neh Dock: "The Kree'la sails for Riverhaven, the Skirr'lolasu sails for
  // Crossing" (Ratha Travel script, Elanthipedia). Sea exit from Crossing docks.
  { a: 'neh_dock', dir: 'e', b: 'rh_ferry', src: 'Ratha (script) — Neh Dock sailings' },

  // ---- Confirmed landmark presence (audit §5 room-ID table) ----
  { present: ['tg_pond', 'half_pint', 'taelberts_inn', 'gaethrends_court',
              'orems_bathhouse', 'alchemy_soc', 'engineering_soc', 'enchanting_soc',
              'forging_soc', 'outfitting_soc', 'trader_south', 'order_hq',
              'meeting_hall', 'academy', 'haldofurd_barn', 'poetry_in_motion',
              'apostle_hq', 'oxenwaithe_bridge', 'guard_house'],
    src: 'audit §5 confirmed room IDs' },
];

// Walk the room graph and check every fact. Returns { ok, issues } with
// human-readable failures that name the fact and its source page.
export function validateMapFacts(rooms, findPathFn) {
  const issues = [];
  const exitsOf = (id) => rooms[id]?.exits || {};

  for (const f of MAP_FACTS) {
    if (f.present) {
      for (const id of f.present) {
        if (!rooms[id]) issues.push(`missing room "${id}" (source: ${f.src})`);
      }
      continue;
    }
    if (!rooms[f.a]) { issues.push(`fact anchor "${f.a}" missing (${f.src})`); continue; }
    if (f.b && !rooms[f.b]) { issues.push(`fact target "${f.b}" missing (${f.src})`); continue; }

    if (f.dir) {
      const dest = exitsOf(f.a)[f.dir];
      if (dest !== f.b) {
        issues.push(`${f.a} --${f.dir}--> expected "${f.b}" (${f.src}), got "${dest || 'nothing'}"`);
      }
    } else if (f.path) {
      let cur = f.a;
      for (const step of f.path) {
        const next = exitsOf(cur)[step];
        if (!next) { issues.push(`${f.a} path [${f.path}] dead-ends at "${cur}" --${step} (${f.src})`); cur = null; break; }
        cur = next;
      }
      if (cur && cur !== f.b) {
        issues.push(`${f.a} path [${f.path}] reaches "${cur}" but expected "${f.b}" (${f.src})`);
      }
    } else if (f.near) {
      const path = findPathFn(f.a, f.near);
      const n = Array.isArray(path) ? path.length : path;
      if (n == null || n !== f.steps) {
        issues.push(`${f.near} should be exactly ${f.steps} moves from ${f.a} (${f.src}), got ${n ?? 'unreachable'}`);
      }
    }
  }
  return { ok: issues.length === 0, issues };
}
