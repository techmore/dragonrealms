// Shared DR-script generator: builds hunt/circle/mega libraries from live
// geography + the guild capability map. Used by the CLI sweep AND by server
// quick-play (gm-play) so every simulated player can launch straight into
// circling scripting.
import { ROOMS } from '../../data/world.js';
import { creatureById } from '../../data/creatures.js';
import { GUILD_SCRIPTS } from '../../data/guild-scripts.js';
import { GUILDS, circleRequirementCandidates } from '../../data/guilds.js';

const nounOf = (spawnId) => (creatureById(spawnId)?.name || spawnId).replace(/^(an?|the)\s+/i, '');

function moves(path) { return path.map((e) => `  move ${e.dir}`); }

function weaponKitFor(cap, plan) {
  // Every member must be stocked in the shared bazaar. Throwing knives are
  // an item but are not sold by any bazaar shop; using them here produced a
  // phantom lane and left the Circle-2 fourth-weapon row at zero.
  if (cap.cheapWeaponKit) {
    // Buy the 112s lane before the 20s sling so a 150s starter purse can
    // establish dagger+club (137s) instead of starving both heavy lanes.
    if (cap.weaponReserve) return ['dagger', 'club', 'staff', 'sling'];
    return cap.weaponFirst ? ['dagger', 'club', 'sling', 'staff'] : ['dagger', 'sling', 'club', 'staff'];
  }
  if (cap.shieldKit) return ['dagger', 'club', 'broadsword', 'greatsword'];
  // Sweep-default barbarian kit (defensiveKit, no kit variant): three DISTINCT,
  // affordable, bazaar-stocked lanes (small_edged/blunt/slings). The old entry
  // carried a 650s broadsword fourth lane that a 150s starter purse can never
  // reach while the 20s sling sat behind 337/562 re-entry gates — the observed
  // 3rd-weapon Nth-set starve (only dagger+club ever trained).
  // Order matters beyond price: the per-kill rotation walks the kit IN ORDER
  // from the wielded lane, so the lanes owned on visit 1 (dagger, sling) must
  // lead. Leading with club parked the rotation on an unowned weapon (failed
  // `wield club` -> fighting bare-handed) and the owned sling never trained.
  if (cap.defensiveKit) return ['dagger', 'sling', 'club'];
  if (cap.edgedKit) return ['dagger', 'broadsword', 'greatsword', 'hunting_bow'];
  // Legacy generator callers that do not opt into the mandated defensive
  // baseline retain their historical closeNth fixture.
  if (cap.closeNth && plan.weapons.includes('club')) return ['club', 'dagger', 'sling'];
  return plan.weapons;
}

// Keep the high-cardinality weapon decision tree out of hunt.dr. A hunt script
// has one fight block per species/candidate room, so inlining this tree can
// exceed the server's 8,000-character saved-script limit before it ever runs.
function buildWeaponRotationScript(cap) {
  const plan = GUILD_SCRIPTS[cap.guild]?.weaponPlan;
  if (!plan?.weapons?.length || !cap.closeNth) return 'exit';
  const skills = {
    club: 'blunt', sling: 'slings', staff: 'staff', dagger: 'small_edged',
    broadsword: 'large_edged', greatsword: 'twohanded_edged', hunting_bow: 'bow',
  };
  const kit = weaponKitFor(cap, plan);
  if (kit.length < 2) return 'exit';
  const need = cap.weaponAware ? [8, 8, 4, 2] : kit.map(() => 8);
  const nm = (w) => String(w).replace(/_/g, ' ');
  const L = ['# compact weapon rotation', 'START:', '  ife wsp ' + skills[kit[0]] + ' goto FROM0'];
  for (let i = 1; i < kit.length; i++) L.push(`  ife wsp ${skills[kit[i]]} goto FROM${i}`);
  L.push('  goto DONE');
  for (let from = 0; from < kit.length; from++) {
    L.push(`FROM${from}:`);
    for (let step = 1; step < kit.length; step++) {
      const to = (from + step) % kit.length;
      const skill = skills[kit[to]];
      const label = `SWAP${from}_${to}`;
      L.push(`  iflt wsr_${skill} ${(need[to] ?? 8) + (cap.rotMargin ?? 4)} goto ${label}`);
    }
    L.push('  goto DONE');
    for (let step = 1; step < kit.length; step++) {
      const to = (from + step) % kit.length;
      L.push(`SWAP${from}_${to}:`, `  put remove ${nm(kit[from])}`, `  put wield ${nm(kit[to])}`, '  wait', '  goto DONE');
    }
  }
  L.push('DONE:', '  exit');
  return L.join('\n');
}

// Shared fight body for closeNth hunts. The species-specific hunt script only
// needs to detect which creature is present; the repeated combat/progress
// sequence lives here and receives the target noun as %1.
function buildSharedFightScript(cap) {
  const cfg = GUILD_SCRIPTS[cap.guild];
  const L = ['# shared fight body — target noun is %1', 'FIGHT:'];
  const sigAt = cfg.signature?.probe === 'ability' ? cfg.signatureAfter : undefined;
  cfg.fight.forEach((step, i) => {
    L.push('  ' + step.replace(/%target/g, '%1'));
    L.push('  wait');
    if (sigAt === i + 1) {
      if (cap.skipRage) {
        L.push('  ifge rage 1 goto RAGE_LIT');
        L.push(`  put ${cfg.signature.cmd.replace(/%target/g, '%1')}`);
        L.push('RAGE_LIT:');
        L.push('  wait');
      } else {
        L.push(`  put ${cfg.signature.cmd.replace(/%target/g, '%1')}`);
        L.push('  wait');
      }
    }
  });
  if ((cfg.survivalSkills || cfg.trainSets?.survival || []).includes('skinning')) {
    L.push('  put skin %1', '  wait');
  }
  if ((cfg.survivalSkills || cfg.trainSets?.survival || []).includes('first_aid')) {
    L.push('  iflt bleed 1 goto NOTEND');
    L.push('TEND:', '  put tend', '  wait', '  put tend', '  wait', 'NOTEND:');
  }
  if (cfg.signature && cfg.signature.probe === 'ability' && cfg.signatureAfter === undefined) {
    L.push(`  put ${cfg.signature.cmd.replace(/%target/g, '%1')}`, '  wait');
  }
  if (cfg.signature?.probe === 'appraise') {
    L.push(`  put ${cfg.signature.cmd.replace(/%target/g, '%1')}`, '  wait');
  }
  if (cfg.signature?.probe === 'scout-cmd') {
    L.push(`  put ${cfg.signature.cmd.replace(/%target/g, '%1')}`, '  wait');
  }
  for (const v of cfg.identityVerbs || []) L.push(`  put ${v}`, '  wait');
  if (cap.closeNth) L.push(`  putrun ${cap.scriptBase}rotate`);
  if (cap.guild === 'barbarian') {
    // Same respawn-wait forage as the inline fight blocks (see hunt.dr):
    // the subroutine returns to SCAN next, so this RT is spent outside
    // combat feeding the foraging survival-Nth slot.
    L.push('  put forage');
    L.push('  wait');
  }
  L.push('  put exp', '  wait', '  exit');
  return L.join('\n');
}

// hunt.dr: arm check -> travel to arena -> scan/fight loop with guild verbs,
// mana gating for casters, rest when hurt. %target substitution happens in
// the generated text itself (one FIGHT label per species).
function buildHuntScript({ cap, arena, hallPath, candidates = [] }) {
  const cfg = GUILD_SCRIPTS[cap.guild];
  const L = [];
  L.push(`# ${cap.scriptBase}hunt — ${cfg.magic ? 'caster' : 'weapon'} loop for ${cap.char}`);
  L.push('START:');
  L.push('  put look');
  L.push('  wait');
  L.push('ARMCHECK:');
  // Order matters: equipped wins, then a carried weapon is wielded, and only
  // a genuinely unarmed character walks to the bazaar to buy.
  // The inventory reply is MULTI-LINE ("You are carrying:\n  a club\nWorn:
  // ..."), and RegExp '.' does not cross newlines — use [\s\S]* for
  // cross-line matching. A plain .* silently never matched a carried club,
  // sending armed agents to re-buy every cycle (the 0-kill wedge).
  // An armed character may still visit the bazaar to provision an affordable
  // missing lane, but must retain the current weapon across that refresh.
  // Previously the silver gates ran first and PLAN_DONE always re-wielded the
  // first kit weapon, so every watchdog restart reset rotation progress.
  L.push('  matchre ARMED_NOW Worn:[\\s\\S]*(club|sword|axe|staff|dagger|mace|blade|bow|sling|hammer)');
  L.push('  matchre GETCLUB carrying:[\\s\\S]*club');
  // Carrying something but unarmed: walk to the bazaar weapon shop first.
  // (BUY alone would try "buy club" wherever we stand — no shopkeeper there.)
  L.push('  matchre GETWEAPON carrying:');
  L.push('  put inventory');
  L.push('  matchwait 6');
  L.push('GETCLUB:');
  L.push('  put wield club');
  L.push('  wait');
  L.push('  goto ARMED');
  L.push('ARMED_NOW:');
  L.push('  setvariable armed 1');
  // The affordable kit's remaining real lanes cost 112s each. Waiting for
  // the legacy 337/562 upgrade gates stranded club/staff at rank zero for an
  // entire 30-minute cohort even after skins had funded either purchase.
  if (cap.cheapWeaponKit) L.push('  ifge silver 112 goto GETWEAPON');
  // Sweep-default barbarians restock the affordable third lane (club/sling)
  // on any 112s+ bazaar pass. The legacy 337/562 upgrade gates below stranded
  // the sling lane: affordable after the first pelt sale yet never re-bought.
  else if (cap.defensiveKit) L.push('  ifge silver 112 goto GETWEAPON');
  else {
    L.push('  ifge silver 562 goto GETWEAPON');
    L.push('  ifge silver 337 goto GETWEAPON');
  }
  L.push('  goto ARMED');
  L.push('GETWEAPON:');
  // BAZAAR GUARD (ouik fix): cap.bazaarPath is rooted at the ENTRY room, but
  // GETWEAPON fires from wherever the arm check ran — post-death respawn via
  // the bazaar escape leaves the agent AT the bazaar, and replaying the
  // entry->bazaar route then walked it six rooms AWAY into the one-way dens
  // with no shopkeeper (parked-in-bazaar 8m wedge, 66+ refused moves).
  // %room gate: if already at the bazaar, skip the walk and buy right here.
  L.push('  ife room bazaar goto BUY_HERE');
  if (cap.bazaarPath?.length) L.push(...moves(cap.bazaarPath));
  L.push('BUY_HERE:');
  // WEAPON PLAN buy block. With a weaponPlan the agent buys its FULL kit on
  // this one visit (club + sling + mace = 338s of starter silver:
  // fresh chars have 150, so only what's affordable lands now and later
  // bazaar trips fill gaps as pelt income arrives). Without a plan, falls
  // back to the legacy single-weapon ladder.
  const plan = cfg.weaponPlan;
  if (plan?.weapons?.length) {
    const prices = {
      club: 112, sling: 20, mace: 206, staff: 112, dagger: 25,
      hand_axe: 65, broadsword: 650, greatsword: 675, shield_wood: 70,
      hunting_bow: 162,
    };
    // DIVERSITY kit (cap.closeNth): swap the third weapon from mace (blunt —
    // trains the SAME category as club, useless for Nth-set diversity) to
    // staff (staff category, also 112s at Milgrym's). Three distinct
    // categories = blunt/slings/staff, exactly what circle-2's 2nd/3rd/4th
    // weapon slots need exercised in the field.
    // Shield-ladder candidate: buy a cheap shield first, then build four
    // distinct weapon lanes (blunt, small-edged, large-edged, two-handed
    // edged). The shield remains worn while the weapon in hand rotates, so
    // every landed blow also trains shield_usage.
    const kit = weaponKitFor(cap, plan);
    // Shield-first is the shieldKit variant's identity (a worn shield trains
    // shield_usage on every landed blow). The sweep-default barbarian skips
    // it: 70s on a shield leaves a 150s starter purse unable to open armor +
    // two weapon lanes (the observed shield + dagger-only stall).
    if (cap.shieldKit && !cap.cheapWeaponKit) {
      // Re-entry can happen after a profitable hunt. Inspect first so a
      // shielded worker does not spend 70s buying duplicate shields on every
      // upgrade visit; only the missing-shield path reaches the purse gate.
      L.push(`  matchre PLAN_WEAPONS Worn:[\\s\\S]*shield|carrying:[\\s\\S]*shield`);
      L.push('  put inventory');
      L.push('  matchwait 4');
      L.push('  iflt silver 70 goto PLAN_WEAPONS');
      L.push('  put buy wooden shield');
      L.push('  wait');
      L.push('  put wear wooden shield');
      L.push('  wait');
      L.push('PLAN_WEAPONS:');
    }
    // ARMOR-FIRST (muse-a): provision padded cloth armor BEFORE weapon extras.
    // Fresh characters carry 150s; the old order bought weapons first and the
    // purse died at 13s, so agents left the bazaar with no worn armor and 1st
    // armor sat at 0/6 all run. Padded (40s) + dagger (25s) + sling (20s) =
    // 85s fits the starter purse with 65s toward the 112s club/staff lane;
    // the purse gate preserves a sub-40s purse for the weapon loop instead.
    // Cheap-kit reserve experiments keep their own armor timing (untouched).
    if (cap.defensiveKit && !cap.cheapWeaponKit) {
      L.push('ARMOR_FIRST:');
      L.push('  matchre KIT_WEAPONS Worn:[\\s\\S]*padded cloth armor');
      L.push('  put inventory');
      L.push('  matchwait 2');
      L.push('  iflt silver 40 KIT_WEAPONS');
      L.push('  put buy padded cloth armor');
      L.push('  wait');
      L.push('  put wear padded cloth armor');
      L.push('  wait');
      L.push('KIT_WEAPONS:');
    }
    for (const wid of kit) {
      const nm = String(wid).replace(/_/g, ' ');
      const price = prices[wid];
      const tag = wid.replace(/_/g, '').toUpperCase();
      L.push(`BUY_${tag}:`);
      if (cap.weaponReserveV3 && wid === 'sling') {
        // Hard reserve: an unaffordable staff must not fall through to the
        // cheap sling, or the next 20 silvers are spent before the 112s lane.
        L.push('  matchre STAFF_READY Worn:[\\s\\S]*staff|carrying:[\\s\\S]*staff');
        L.push('  put inventory');
        L.push('  matchwait 2');
        L.push('  goto BUY_SKIP_SLING');
        L.push('STAFF_READY:');
      }
      // Re-entry is normal after watchdog recovery. Inspect ownership before
      // spending so an existing cheap dagger/sling cannot consume the silver
      // reserved for the missing 112s club or staff lane.
      L.push(`  matchre BUY_SKIP_${tag} Worn:[\\s\\S]*${nm}|carrying:[\\s\\S]*${nm}`);
      L.push('  put inventory');
      L.push('  matchwait 2');
      if (price) L.push(`  iflt silver ${price} goto BUY_SKIP_${wid.replace(/_/g, '').toUpperCase()}`);
      L.push(`  put buy ${nm}`);
      L.push('  wait');
      L.push(`BUY_SKIP_${tag}:`);
    }
    L.push('PLAN_DONE:');
    if ((cap.defensiveKit || cap.shieldKit) && cap.cheapWeaponKit) {
      L.push('  matchre SHIELD_DONE Worn:[\\s\\S]*shield|carrying:[\\s\\S]*shield');
      L.push('  put inventory');
      L.push('  matchwait 3');
      L.push('  iflt silver 70 goto SHIELD_DONE');
      L.push('  put buy wooden shield');
      L.push('  wait');
      L.push('  put wear wooden shield');
      L.push('  wait');
      L.push('SHIELD_DONE:');
    }
    // Wield the FIRST weapon only for an unarmed provisioning pass. An armed
    // restart reaches this block through ARMED_NOW and must preserve its
    // current lane so the rotation can continue across watchdog cycles.
    L.push('  ife armed 1 goto BUY_ARMOR');
    const first = String(kit[0]).replace(/_/g, ' ');
    L.push(`  put remove club`);
    L.push(`  put wield ${first}`);
    L.push('  wait');
    L.push('  goto BUY_ARMOR');
  }
  L.push('BUY:');
  L.push('  matchre WIELD You buy|You pay|hands you');
  // No shopkeeper here means our bazaar path was empty/stale — re-arm check
  // restarts the loop (and a fresh snapshot) instead of spinning on BUY.
  L.push('  matchre ARMED do not sell|already have|no such|do not have|out of stock|no shopkeeper');
  // Silver exhaustion: one bank withdrawal attempt, then re-arm (which walks
  // to the arena and fights bare-handed — fists train Defending/Evasion too)
  // rather than an infinite BUY spin that starves the whole run.
  L.push('  matchre BROKE cannot afford');
  // Weapon upgrade ladder (player-style progression): spend the purse on the
  // best blade it reaches before settling for a club. Ladder keyed to
  // Milgrym's real Kronar prices (docs/reference-milgryms-weapons.md):
  // cavalry_sabre 562 > short_sword 337 > club 112. Fresh characters start
  // with 150 silver — enough only for the club floor; skin/loot sales fund
  // the climb. Each branch falls through when unaffordable.
  // Silver tracking: branch on LIVE purse size (mirrored into %silver by the
  // prompt parser). The weapon ladder only fires when the agent has actually
  // banked enough from selling pelts — without this, fresh chars spin on
  // BUY_CLUB forever because 150 silver never reaches 337.
  // ONLY emitted when no weaponPlan exists — with a plan, the BUY_ labels
  // above already define these names and the engine's LAST-definition-wins
  // label map would silently redirect every plan jump into the dead legacy
  // ladder (the duplicate-label class of bug).
  if (!plan?.weapons?.length) {
  L.push('  ifge silver 562 goto BUY_SABRE');
  L.push('  ifge silver 337 goto BUY_SHORTSWORD');
  L.push('BUY_CLUB:');
  L.push('  put buy club');
  L.push('  matchwait 30');
  L.push('  goto BUY_ARMOR');
  L.push('BUY_SABRE:');
  L.push('  put buy sabre');
  L.push('  wait');
  L.push('  matchre WIELD_NEW You buy|You pay|hands you');
  L.push('  matchwait 10');
  L.push('  goto BUY_CLUB');
  L.push('BUY_SHORTSWORD:');
  L.push('  put buy short sword');
  L.push('  wait');
  L.push('  matchre WIELD_NEW You buy|You pay|hands you');
  L.push('  matchwait 10');
  L.push('  goto BUY_CLUB');
  L.push('WIELD_NEW:');
  L.push('  put remove club');
  L.push('  put wield sword');
  L.push('  wait');
  L.push('  goto BUY_ARMOR');
  } // end legacy-ladder-only guard
  // Armor, bought in the SAME bazaar visit as the weapon (the armorer shares
  // the room), so this adds no navigation. It must live here rather than as a
  // separate walk: an earlier attempt gave armor its own bazaarPath leg, but
  // by then the agent was already AT the bazaar, so replaying the path walked
  // it past into catrox_forge and wedged the run (0 kills, watchdog escapes).
  //
  // Why it matters: "1st armor at least rank 6" is a circle-2 requirement,
  // and armor exp is granted only per landed blow by the equipment loop in
  // the damage path (server/combat.js -> gainSkillExp(piece.skill, ...)).
  // With nothing worn that loop has no body, so 1st armor sat at 0/6 for an
  // entire 10-minute run while other skills climbed to 72 total ranks.
  // Worn armor also soaks damage, so the agent flees less.
  L.push('BUY_ARMOR:');
  if (cap.weaponReserveV2) {
    // Preserve purse for the missing staff lane. Once the four-lane kit is
    // complete, resume the normal armor provisioning path.
    L.push('  matchre RESERVE_HAVE_STAFF Worn:[\\s\\S]*staff|carrying:[\\s\\S]*staff');
    L.push('  put inventory');
    L.push('  matchwait 4');
    L.push('  ifge silver 112 goto GETWEAPON');
    L.push('  goto ARMED_FROM_BAZAAR');
    L.push('RESERVE_HAVE_STAFF:');
  }
  if (!cap.closeNth && cap.guild !== 'barbarian') {
    L.push('  matchre ARMED_FROM_BAZAAR Worn:[\\s\\S]*(padded|leather|studded|chain|brigandine|plate)');
  }
  if (cap.defensiveKit) L.push('  matchre PADDED_DONE Worn:[\\s\\S]*padded cloth armor');
  L.push('  put inventory');
  L.push('  matchwait 4');
  L.push('  put buy padded cloth armor');
  L.push('  wait');
  L.push('  put wear padded cloth armor');
  L.push('  wait');
  if (cap.defensiveKit) L.push('PADDED_DONE:');
  // DIVERSITY (cap.closeNth): the 2nd armor slot needs a SECOND armor
  // CATEGORY taking blows (armor exp is granted per landed blow against each
  // WORN piece's own skill). padded cloth = light_armor; a 120s iron helm =
  // chain_armor. Same purse gate style as the weapon plan.
  if (cap.closeNth || cap.defensiveKit) {
    L.push('  ifge silver 120 BUY_HELM');
    L.push('  goto ARMED_FROM_BAZAAR');
    L.push('BUY_HELM:');
    L.push('  matchre ARMED_FROM_BAZAAR already have|Worn:[\\s\\S]*helm');
    L.push('  put buy iron helm');
    L.push('  wait');
    L.push('  put wear iron helm');
    L.push('  wait');
  }
  // ARMOR STACK (cap.armorStack): wear MORE light_armor pieces. Verified
  // server-side (2026-08-27): the armor-exp loop grants exp PER WORN PIECE
  // per landed blow — `circle*3 + piece.armor/8`, independent of how much
  // damage the piece soaks, and blows always land (armor only scales dmg).
  // So "naked-tank" pulls would train NOTHING (no worn piece, no exp) and a
  // cheaper piece trains nothing extra; the only exp lever is pieces WORN.
  // sleeves(45s)+boots(30s)+pants(55s) with torso+helm → ~4x light_armor
  // exp per landed blow (1st armor was the last circle-2 blocker at 5/6).
  // Purse-gated per piece; retries live in the circle script's errand stop.
  if (cap.armorStack) {
    const pieces = [
      ['sleeves', 'leather sleeves', 60],
      ['boots', 'leather boots', 45],
      ['leggings', 'leather leggings', 60],
    ];
    for (const [tag, noun, cost] of pieces) {
      L.push(`STACK_${tag.toUpperCase()}:`);
      L.push('  put inventory');
      L.push(`  matchre STACK_NEXT_${tag.toUpperCase()} Worn:[\\s\\S]*${tag}`);
      L.push('  matchwait 4');
      L.push(`  iflt silver ${cost} STACK_NEXT_${tag.toUpperCase()}`);
      L.push(`  put buy ${noun}`);
      L.push('  wait');
      L.push(`  put wear ${noun}`);
      L.push('  wait');
      L.push(`STACK_NEXT_${tag.toUpperCase()}:`);
    }
  }
  // We are still standing at the bazaar after provisioning. The normal ARMED
  // label uses a route from the original starting room, which is invalid here
  // and caused a stale first move followed by a 90-second watchdog recovery.
  L.push('  goto ARMED_FROM_BAZAAR');
  L.push('BROKE:');
  L.push('  put withdraw 100');
  L.push('  wait');
  L.push('  matchre BUY You withdraw');
  L.push('  matchre ARMED does not hold|no banker|nothing');
  L.push('  matchwait 20');
  L.push('  goto ARMED');
  L.push('WIELD:');
  L.push('  put wield club');
  L.push('  wait');
  L.push('  goto ARMED_HERE');
  // ROOM-GATED ARRIVALS (gydk fix): all three arrival routes are baked from
  // ONE origin room. Executed from anywhere else (post-death respawn, town
  // drift, den stranding) the first move refuses, skipMoves discards the
  // walk, and the agent idles in town — the SCAN loop there can never match
  // a creature. Gate each route on its origin: hub-origin only from the hub,
  // bazaar-origin only from the bazaar, and ANY OTHER room falls through
  // straight to SCAN/PICK ladder (wherever we are is good enough to hunt or
  // the supervisor's town-strand breaker will re-path us).
  const tail = `  goto ${candidates.length ? 'PICK_ROOM_0' : 'SCAN'}`;
  // fromHereOrigin = the room the fromHere route was baked from (gen-time
  // s.vitals.room). Gating ARMED on the hub was wrong for regen cycles: the
  // supervisor re-bakes fromHere from wherever the agent stands (often the
  // bazaar), so the gate must match THAT room or every arrival leg skips and
  // the agent idles at the bazaar forever (run uhhd, warmage/dwarf).
  const fromHereOrigin = arena.fromHereOrigin || arena.id;
  L.push('ARMED:');
  if (arena.fromHere?.length) {
    L.push(`  ifne room ${fromHereOrigin} goto ARMED_ANYWHERE`);
    L.push(...moves(arena.fromHere));
  }
  L.push(tail);
  L.push('ARMED_FROM_BAZAAR:');
  if (arena.fromArmed?.length) {
    L.push('  ifne room bazaar goto ARMED_ANYWHERE');
    L.push(...moves(arena.fromArmed));
  }
  L.push(tail);
  L.push('ARMED_HERE:');
  if (arena.fromArmed?.length) {
    L.push('  ifne room bazaar goto ARMED_ANYWHERE');
    L.push(...moves(arena.fromArmed));
  }
  L.push(tail);
  L.push('ARMED_ANYWHERE:');
  L.push(tail);
  // if another player is here (%pcount > 0) walk to the next candidate room
  // and re-check. The server reports who is in the room, so this is a pure
  // world-state decision: agents self-spread across empty hunting grounds
  // with no shared memory (works across separate node processes too). Paths
  // are rooted at arena.id (the hub all ARMED paths land on), which is stable
  // for the whole run, so the ladder never goes stale. The union of every
  // candidate room's species is what SCAN matches on, so a kill triggers
  // wherever the script finally settles. Route ALL arrival paths through the
  // ladder so the occupancy check fires regardless of which leg delivered
  // the agent (arm-here, post-buy, or post-hall-trip).
  //
  // O20 fix: legs are hub-rooted, so between two CANDIDATE legs the script
  // must trampoline back to the hub — walking "candidate_i -> candidate_i+1"
  // with hub-rooted moves used to drift the agent into arbitrary rooms
  // (first-empty-room selection was never actually implemented). The
  // occupied branch now jumps to a shared RETURN_TO_HUB label that replays
  // the just-walked path in reverse; refusals on the way home are skipped
  // (engine skipMoves) and the next look re-anchors occupancy. An empty room
  // falls through straight to SCAN exactly as intended. (The old self-healing
  // tolerance for refused legs is unchanged — this only fixes the case that
  // previously had NO branch at all: the occupied fall-through.)
  const ladder = candidates.length ? candidates : [];
  for (let i = 0; i < ladder.length; i++) {
    const c = ladder[i];
    L.push(`PICK_ROOM_${i}:`);
    // HUB GATE (bjuv/ouik fix): every leg route is rooted at the arena hub,
    // but the ladder re-enters from wherever the previous leg/drift left the
    // agent. A hub-rooted route executed from any other room refuses on its
    // FIRST move and the ladder chains into the next hub-rooted leg — the
    // observed n-n-n/n/up/s-s-e infinite refusal loop. Gate each leg on
    // %room === hub: if we are not at the hub, skip this leg's moves entirely
    // (the next gate either applies or also skips; SCAN at the end runs
    // wherever we stand, which is always a legal hunting spot because SCAN
    // matches the union of every candidate's species).
    L.push(`  ifne room ${arena.id} goto ${i + 1 < ladder.length ? `PICK_ROOM_${i + 1}` : 'PICK_ROOM_DONE'}`);
    if (c.fromHere?.length) L.push(...moves(c.fromHere));
    L.push('  put look');
    // matchwait (not wait) so the occupancy check resolves on timeout even
    // if the server sends no immediate prompt — same proven form as SCAN.
    L.push('  matchwait 4');
    if (i + 1 < ladder.length) {
      // Occupied: go home (hub) first, then start the next leg from there.
      L.push(`  ifgt pcount 0 goto RETURN_TO_HUB_${i}`);
    }
  }
  // If every candidate was occupied, do not fall through and hunt alongside
  // somebody. Step back to the hub and restart the ladder so the next scan
  // can claim an empty room as soon as one opens. This is cooperative only:
  // no room is locked and other players are never denied entry.
  L.push('PICK_ROOM_DONE:');
  if (ladder.length) {
    // A fully occupied ladder must not deadlock a worker indefinitely. The
    // reserve-v2 candidate is specifically measuring weapon acquisition, so
    // after one complete patrol it hunts in-place and keeps earning EXP.
    // Other variants retain strict empty-room preference for comparison.
    if (cap.weaponReserveV2) L.push('  ifgt pcount 0 goto SCAN');
    else L.push('  ifgt pcount 0 goto OCCUPIED_PATROL');
  }
  // REANCHOR safety net: every path above that finds itself somewhere OTHER
  // than the hub lands here via the hub gates. SCAN is only a legal hunting
  // spot at a candidate room — an agent that drifted (or armed) in the BAZAAR
  // used to scan the bazaar forever (run4: 0 moves across 21 agents). If we
  // are not at the hub but ARE at the bazaar, replay the bazaar->hub walk and
  // re-enter the ladder; anywhere else, bail to SCAN and let the supervisor
  // breakers re-path.
  L.push(`  ifne room ${arena.id} goto REANCHOR`);
  L.push('  goto SCAN');
  L.push('REANCHOR:');
  if (arena.fromArmed?.length) {
    L.push('  ifne room bazaar goto SCAN');
    L.push(...moves(arena.fromArmed));
    L.push('  goto PICK_ROOM_0');
  } else {
    L.push('  goto SCAN');
  }
  // An EMPTY candidate room (or PICK_ROOM_DONE reached empty) falls through
  // here — the trampolines live at the very end of the script so nothing
  // above can fall into them by accident.
  L.push('SCAN:');
  L.push('  pause 2');
  L.push('  iflt hp 40 goto REST');
    // `exp` is information-only, but probing it on every scan floods the
    // wire when an arena is empty or a runner is parked (348 probes in one
    // 40m leg). Alternate probes: the supervisor also receives the merged
    // exp sheet and can force a hall trip as soon as the gate is met.
    L.push('  if_2 goto SCAN_NOEXP');
    L.push('  setvariable 2 1');
    L.push('  wait');
    L.push('  put exp');
    L.push('  matchwait 5');
    L.push('  goto SCAN_LOOK');
    L.push('SCAN_NOEXP:');
    L.push('  setvariable 2');
    L.push('SCAN_LOOK:');
  if (cfg.magic) L.push('  iflt mana 8 goto WEAKSWING');
  for (const pre of cfg.preFight || []) L.push(`  put ${pre.replace(/^put /, '').replace('%target', '')}`);
  // Bard area enchantes: segue mid-hunt so the song stays fresh and the
  // splash keeps training (DR Segue; also exercises the transition path).
  if (cfg.segueCycle?.length) {
    for (const s of cfg.segueCycle) L.push(`  put segue ${s}`);
  }
  const species = [...new Set([arena.id, ...candidates.map((c) => c.id)]
    .flatMap((id) => ROOMS[id]?.spawns || []))];
  // Register matchers BEFORE 'put look': 'put' returns immediately, so the
  // room message from look can land before later matchre lines register —
  // the prose would be dropped and every scan would time out.
  for (const sp of species) {
    L.push(`  matchre FIGHT_${sp.replace(/\W/g, '_')} ${nounOf(sp)} is here`);
  }
  L.push('  matchre WANDER \\[\\[');
  L.push('  put look');
  // Timeout matters: in a creature-less room (post-flee town stranding) no
  // prose will ever match — an untimed matchwait wedges here until the
  // external watchdog restarts the whole cycle ~90s later.
  L.push('  matchwait 8');
  // IDLE-SCAN SCHEDULE (muse-d follow-up): event-placed verbs (post-kill and
  // chained-kill forage) measured 0 sends across 26 kills — populated arenas
  // never present those moments. But the matchwait-timeout fall-through below
  // provably executes on every empty scan, so hang a 3-cycle rotation here:
  // every 3rd empty scan fires one training verb, alternating forage/hunt.
  // Both are legal in every sweep arena (sewers IS a wild zone) and each use
  // grants exp unconditionally (foraging 3-8, perception 3-6) — the two
  // survival-Nth inputs sitting at 0 while combat over-gains skinning.
  L.push('SCAN_IDLE_1:');
  L.push('  if_3 goto SCAN_IDLE_2');
  L.push('  setvariable 3 1');
  L.push('  goto SCAN_AFTER_IDLE');
  L.push('SCAN_IDLE_2:');
  L.push('  if_4 goto SCAN_IDLE_3');
  L.push('  setvariable 4 1');
  L.push('  setvariable 3');
  L.push('  goto SCAN_AFTER_IDLE');
  L.push('SCAN_IDLE_3:');
  L.push('  setvariable 4');
  L.push('  setvariable 3');
  L.push('  if_6 goto SCAN_IDLE_HUNT');
  L.push('  setvariable 6 1');
  L.push('  put forage');
  L.push('  wait');
  L.push('  goto SCAN_AFTER_IDLE');
  L.push('SCAN_IDLE_HUNT:');
  L.push('  setvariable 6');
  L.push('  put hunt');
  L.push('  wait');
  L.push('SCAN_AFTER_IDLE:');
  if (cap.sharedFight) {
    for (const sp of species) {
      const key = sp.replace(/\W/g, '_');
      const noun = nounOf(sp);
      L.push(`FIGHT_${key}:`);
      L.push('  put look');
      L.push(`  matchre TG_${key} ^(?![\\s\\S]*${noun} is here)`);
      L.push(`  matchre FN_${key} ${noun} is here`);
      L.push('  matchwait 4');
      L.push(`TG_${key}:`, '  goto SCAN');
      L.push(`FN_${key}:`, `  putrun ${cap.scriptBase}fight "${noun.replace(/"/g, '')}"`, '  goto SCAN');
    }
  } else for (const sp of species) {
    const key = sp.replace(/\W/g, '_');
    const label = `FIGHT_${key}`;
    const noun = nounOf(sp);
    // Per-species UNIQUE labels: the engine's label map is LAST-definition-wins,
    // so shared labels (TARGET_GONE/FIGHT_NOW/SCAN_DONE) collided across species
    // blocks — in multi-species arenas (sewers_3: kobold/silverfish/rat) a rat
    // match jumped into the last species' fight block and swung at the wrong noun.
    L.push(`${label}:`);
    // Target-presence gate: prose matched a moment ago, but the creature may
    // have been slain (or despawned) between then and now. Re-look; if the
    // noun is gone, return to SCAN instead of swinging at nothing.
    // The room message is MULTI-LINE; a '(?!.*noun)' lookahead anchored to
    // any line matched the first rat-free line ('Obvious paths: ...') and
    // declared the target gone even while it stood in front of us — the
    // never-fight wedge. Anchor ^ at string start with [\s\S]* so the
    // detector only fires when the noun is absent from the WHOLE message.
    L.push('  put look');
    L.push(`  matchre TG_${key} ^(?![\\s\\S]*${noun} is here)`);
    L.push(`  matchre FN_${key} ${noun} is here`);
    L.push('  matchwait 4');
    L.push(`TG_${key}:`);
    L.push('  goto SCAN');
    L.push(`FN_${key}:`);
    // Each verb gets its own `wait` so the engine syncs with roundtime
    // before the next fires — without this, verbs pile up mid-RT and spam
    // "You must wait N seconds" refusals.
    // signatureAfter inserts the guild's signature ability at a specific slot
    // in the swing sequence (see data/guild-scripts.js): the roar needs combat
    // to already exist, so it cannot lead, but it must not trail the whole
    // block either or it lands mid-roundtime and is refused.
    const sigAt = cfg.signature?.probe === 'ability' ? cfg.signatureAfter : undefined;
    cfg.fight.forEach((step, i) => {
      L.push('  ' + step.replace(/%target/g, noun));
      L.push('  wait');
      if (sigAt === i + 1) {
        if (cap.skipRage) {
          // roarSmart variant: only roar when no rage is active. The rage
          // lasts 12 ticks and a fight lasts ~2, so the ungated line is
          // refused ("The rage already burns in you") on every fight after
          // the first — charged RT, stalled swing block, log noise. The
          // refused roar banks NO augmentation either way (the wrapper's
          // res.ok gate), so skipping it costs zero exp. %rage is mirrored
          // from the prompt's [Raging] tag by the engine.
          const rl = `RAGE_LIT_${key}`;
          L.push(`  ifge rage 1 goto ${rl}`);
          L.push(`  put ${cfg.signature.cmd}`);
          L.push(`${rl}:`);
          L.push('  wait');
        } else {
          L.push(`  put ${cfg.signature.cmd}`);
          L.push('  wait');
        }
      }
    });
    // Skinning guilds (ranger, barbarian...): skin the distinctive noun —
    // the server teaches it in the kill prose ("Type \"skin rat\""), and
    // bare `skin` is not a command ("Skin what?"). Failure prose
    // ('no such corpse') is harmless; the engine holds the verb until
    // weapon RT drains, then applies it.
    if ((cfg.survivalSkills || cfg.trainSets?.survival || []).includes('skinning')) {
      L.push(`  put skin ${noun}`);
      L.push('  wait');
    }
    // FIRST AID field training — tend bleeding wounds between kills.
    // Skins first (same RT window), then branch: only `tend` when the prompt
    // shows [bleeding: ...] (%bleed mirrored by the engine). Tending earns
    // First Aid exp per wound level — a survival skill that otherwise only
    // trains via rare trainer visits. Worst-bleeder-first is the server's
    // default; repeat once for double bleeders. "No wounds" prose is harmless.
    if ((cfg.survivalSkills || cfg.trainSets?.survival || []).includes('first_aid')) {
      // Gate on %bleed — but INVERTED: jump PAST tend when NOT bleeding.
      // (The old 'ifge bleed 1 goto TEND' fell through into tend even when
      // the gate matched, making it unconditional; and when it didn't match,
      // execution still entered TEND_ from below. Both paths must skip.)
      L.push(`  iflt bleed 1 goto NOTEND_${key}`);
      L.push(`TEND_${key}:`);
      L.push('  put tend');
      L.push('  wait');
      L.push('  put tend');   // second pass — double wounds are common at c2+
      L.push('  wait');
      L.push(`NOTEND_${key}:`);
    }
    if (cfg.signature && cfg.signature.probe === 'ability') {
      // Skipped when signatureAfter already placed it mid-sequence. The
      // trailing slot only works for guilds whose signature does not need an
      // active fight; for barbarians it lands inside the attack's roundtime
      // and is refused every time.
      if (cfg.signatureAfter === undefined) {
        L.push(`  put ${cfg.signature.cmd}`);
        L.push('  wait');
      }
    }
    if (cfg.signature && cfg.signature.probe === 'appraise') {
      // Trader identity: appraise the foe's remains between swings.
      L.push(`  put ${cfg.signature.cmd}`);
      L.push('  wait');
    }
    if (cfg.signature && cfg.signature.probe === 'scout-cmd') {
      // Ranger identity: read the tracks while hunting.
      L.push(`  put ${cfg.signature.cmd}`);
      L.push('  wait');
    }
    // Trader identity: chaffer before selling loot — failure prose ('need a
    // shopkeeper') still counts as a fidelity observation of the verb.
    if (cfg.identityVerbs) {
      for (const v of cfg.identityVerbs) {
        L.push(`  put ${v}`);
        L.push('  wait');
      }
    }
    // Kill check: the foe's death sends us back to SCAN for the next one;
    // a missing corpse/target after the exchange means it too is gone.
    L.push('  put look');
    L.push(`  matchre SD_${key} ${noun} is here`);
    L.push('  matchwait 3');
    if (cap.guild === 'barbarian') {
      // RESPAWN-WAIT FORAGE (muse-a): the look just proved this noun is gone,
      // so the next seconds are dead respawn wait (25s ticker) — forage them.
      // WANDER's forage almost never fires because populated arenas match a
      // FIGHT first; this slot fires once per kill, costs one 5s RT outside
      // combat, and feeds the starved foraging survival-Nth slot.
      L.push('  put forage');
      L.push('  wait');
    }
    L.push('  goto SCAN'); // target no longer present -> next scan
    L.push(`SD_${key}:`);
    L.push('  wait');
    if (cap.guild === 'barbarian') {
      // CHAINED-KILL FORAGE (muse-a): another creature of the same noun is
      // still here, so this branch (not the empty-room timeout below) is the
      // path that actually executes in populated arenas — the first attempt
      // at placing forage here never fired (0 sends across 23 kills). It
      // replaces the idle `pause 3` at a net +2s per chained kill and feeds
      // the starved foraging survival-Nth slot with boost-multiplied exp.
      L.push('  put forage');
      L.push('  wait');
    } else {
      L.push('  pause 3');
    }
    if (cap.leaveCombatOnLock) {
      // A full EXP pool is not useful training. Check after the kill, when
      // fleeing is safe, and leave the fight before the next swing if the
      // report contains a mind-locked lane. The noncombat loop then rotates
      // forage/track/hunt and lets pools drain.
      L.push('  put exp');
      L.push('  matchre LOCKED_EXIT mind lock');
      L.push('  matchwait 5');
      L.push('  goto ROTATE');
      L.push('LOCKED_EXIT:');
      L.push('  put flee');
      L.push('  wait');
      L.push('  goto WANDER');
      L.push('ROTATE:');
    }
    // WEAPON ROTATION — swap to the plan's OTHER weapon after every kill.
    //
    // Why: circle 2 needs FOUR weapon skills (1st@8, 2nd@8, 3rd@4, 4th@2);
    // single-weapon farming trains only its own skill and leaves slots 2-4
    // to an untrained requirement. Rotating per kill
    // its requirement against ~2 TDPs of income per run. Rotating per kill
    // turns kills into field exp for a second guild-taught category instead.
    //
    // How: a two-state flip on a script variable, driven by if_N (DR's
    // branch-if-variable-set). wphase empty -> wield weapon B and set
    // wphase=1; wphase set -> jump ROT_A_<key>, wield weapon A and clear it,
    // then fall through to the exp/REST check below. Labels are per-species
    // because each species' fight block is emitted separately (labels are
    // LAST-wins in the parser), but the shared %wphase var keeps the global
    // alternation coherent. Removing a not-wielded weapon prints harmless
    // "You aren't wearing that." prose; `wield` of the already-wielded
    // weapon re-equips cleanly server-side.
    if (plan?.weapons?.length > 1) {
      const nm = (w) => String(w).replace(/_/g, ' ');
      // DIVERSITY rotation (cap.closeNth): branch on ground truth. The old
      // %wphase flip-flop held its memory IN THE RUNNER — every watchdog /
      // regeneration restart creates a fresh createRunner with empty vars,
      // and an undefined %wphase interpolates to the literal string
      // '%wphase' (sub() leaves unknown vars intact), which if_1 read as
      // SET: after each restart the first kill always took the ROT_A arm
      // ('remove knives, wield club') — fidelity log run
      // roarSmart-giantman 2026-08-27 shows 16 'remove throwing knives' vs
      // ZERO 'wield throwing knives' past the last sweep-run marker.
      // Fix: pick the NEXT kit weapon from %wsp (what is actually in hand,
      // mirrored from the server's hands snapshot), so a restart re-syncs
      // instead of desyncing. Baseline keeps the old block byte-for-byte.
      const skillsOf = {
        club: 'blunt', mace: 'blunt', sling: 'slings', staff: 'staff',
        dagger: 'small_edged', broadsword: 'large_edged', greatsword: 'twohanded_edged',
        // edgedBow kit (2026-08-28): 4 DISTINCT weapon categories so the
        // circle-2 Nth-weapon ladder (1st/2nd/3rd/4th) can all fill from the
        // field instead of starving on a duplicated category (mace==blunt).
        cinquedea: 'large_edged', greataxe: 'twohanded_edged',
        hunting_bow: 'bow', long_bow: 'bow', yew_longbow: 'bow',
        light_crossbow: 'crossbow', war_crossbow: 'crossbow', arbalest: 'crossbow',
      };
      const kit = weaponKitFor(cap, plan);
      if ((cap.defensiveKit || cap.shieldKit) && kit.length > 1) {
        // Shield-ladder rotation: walk the four independent weapon skills in
        // a cyclic, requirement-aware order. Once a lane is comfortably over
        // its circle-2 need, skip it and feed the next lane. The shield stays
        // in its own equipment slot throughout, so incoming blows continue
        // training shield_usage even while a two-handed weapon is wielded.
        // slings rides the same need-8 as the other affordable lanes. It was
        // missing here, so every comparison against it was NaN (never true)
        // and the rotation could never swap TO the sling — the second half
        // of the 3rd-weapon starve (owned but never wielded).
        const needs = { blunt: 8, small_edged: 8, large_edged: 8, twohanded_edged: 8, slings: 8 };
        // rotMargin: how far above a weapon's circle-2 need the rotation
        // treats it as "done" and stops feeding it. Default 4 (historical).
        // Kaizen (diversity2stackRot): 1 — keep the 3rd-weapon category
        // (staff, need only 4) in active rotation until it actually clears
        // its requirement instead of parking on the two satisfied weapons.
        const MARGIN = cap.rotMargin ?? 4;
        for (let i = 0; i < kit.length; i++) {
          const skl = skillsOf[kit[i]];
          L.push(`  ife wsp ${skl} goto ROT_S${i}_${key}`);
        }
        const rotateTo = (from, to, label) => [
          `  put remove ${nm(kit[from])}`,
          `  put wield ${nm(kit[to])}`,
          '  wait',
          `  goto ${label}`,
        ];
        for (let from = 0; from < kit.length; from++) {
          L.push(`ROT_S${from}_${key}:`);
          const targets = [];
          for (let step = 1; step < kit.length; step++) {
            const to = (from + step) % kit.length;
            const skl = skillsOf[kit[to]];
            const label = `ROT_S${from}_TO_${to}_${key}`;
            L.push(`  iflt wsr_${skl} ${needs[skl] + MARGIN} goto ${label}`);
            targets.push({ label, to });
          }
          L.push(`  goto ROT_END_${key}`);
          for (const { label, to } of targets) {
            L.push(`${label}:`);
            L.push(...rotateTo(from, to, `ROT_END_${key}`));
          }
        }
        L.push(`ROT_END_${key}:`);
      } else if (cap.closeNth && kit.length > 1) {
        // DIVERSITY rotation, requirement-aware ("need+MARGIN levels over ->
        // switch off"), generalized to N kit weapons (the old code hard-coded
        // a 3-slot K0/K1/K2 chain; edgedBow needs a 4-distinct-category kit).
        // Per kill, holding W_i: for each step 1..kit.length-1, if the target
        // weapon's skill is still below need+MARGIN, swap to it; otherwise keep
        // scanning. If every slot satisfies, all iflts fall through and the
        // held weapon stays (ROT_END). [WSRANK:<skill>:<rank>] tokens are
        // injected each heartbeat by the harness from vitals.skills, so this
        // survives runner restarts with zero stored state. Overwhelmed
        // handling remains the supervisor's flee interlock + WEAKSWING
        // primary-weapon fallback — unchanged here.
        const needs = {};
        // Use the actual Nth-set gate for weapon-exp measurements:
        // 1st@8, 2nd@8, 3rd@4, 4th@2. Uniformly targeting 8 over-trains
        // the primary lane and can hide the fourth lane's contribution.
        const laneNeeds = cap.weaponAware ? [8, 8, 4, 2] : kit.map(() => 8);
        for (let i = 0; i < kit.length; i++) needs[skillsOf[kit[i]]] = laneNeeds[i] ?? 8;
        // rotMargin: how far above need a weapon is "done" and skipped. Lower
        // (1) keeps a short slot fed until it actually clears its requirement.
        const MARGIN = cap.rotMargin ?? 4;
        const stillNeeds = (skl, lbl) => `iflt wsr_${skl} ${needs[skl] + MARGIN} goto ${lbl}`;
        for (let i = 0; i < kit.length; i++) {
          L.push(`  ife wsp ${skillsOf[kit[i]]} goto ROT_K${i}_${key}`);
        }
        const rotate = (from, to, end) => [
          `  put remove ${nm(kit[from])}`,
          `  put wield ${nm(kit[to])}`,
          '  wait',
          `  goto ${end}`,
        ];
        for (let from = 0; from < kit.length; from++) {
          L.push(`ROT_K${from}_${key}:`);
          const targets = [];
          for (let step = 1; step < kit.length; step++) {
            const to = (from + step) % kit.length;
            const skl = skillsOf[kit[to]];
            const label = `ROT_K${from}_TO_${to}_${key}`;
            L.push(`  ${stillNeeds(skl, label)}`);
            targets.push({ label, to });
          }
          L.push(`  goto ROT_END_${key}`);
          for (const { label, to } of targets) {
            L.push(`${label}:`);
            L.push(...rotate(from, to, `ROT_END_${key}`));
          }
        }
        L.push(`ROT_END_${key}:`);
      } else {
      const [wa, wb] = plan.weapons;
      L.push('  setvariable 1 %wphase');   // copy phase into var "1" for if_1
      L.push(`  if_1 goto ROT_A_${key}`);
      L.push(`  put remove ${nm(wa)}`);
      L.push(`  put wield ${nm(wb)}`);
      L.push('  wait');
      L.push('  setvariable wphase 1');
      L.push('  goto SCAN');
      L.push(`ROT_A_${key}:`);
      L.push(`  put remove ${nm(wb)}`);
      L.push(`  put wield ${nm(wa)}`);
      L.push('  wait');
      L.push('  setvariable wphase');
      } // end baseline wphase rotation
    }
    // Check the experience sheet after a kill, the way a real player does.
    // `exp` is a pure information command — no setRoundtime(), not in
    // RT_BLOCK — so this costs nothing and needs no special harness support.
    //
    // Two things depend on it, and BOTH were running nearly blind because the
    // only other `put exp` sits in SCAN:, which a fighting agent almost never
    // returns to (measured: exp fired ONCE in 13 minutes):
    //   1. the circleGaps ledger, parsed from the "you have N" lines, which
    //      the supervisor uses to decide whether a hall trip is worth walking
    //   2. rank tracking for the [gaps] report — the mindstate feed omits any
    //      skill with an empty pool, so fully-converted skills read as 0
    //      (this is what made [gaps] show parry 0/8 at real rank 5)
    L.push('  wait');
    L.push('  put exp');
    L.push('  wait');
    L.push('  iflt hp 40 goto REST');
    if (cfg.magic) L.push('  iflt mana 8 goto WEAKSWING');
    L.push(`  goto ${label}`);
    }
  // Mana-poor rounds still train the weapon: swing instead of standing around.
  L.push('WEAKSWING:');
  for (const step of (cfg.fallbackFight || ['put attack %target'])) {
    L.push('  ' + step.replace(/%target/g, species.length ? nounOf(species[0]) : 'creature'));
  }
  L.push('  wait');
  L.push('  pause 3');
  L.push('  goto SCAN');
  // Occupied-room patrol. The baked walk-home route (ladder.at(-1).fromHere
  // reversed) is rooted at the arena HUB — but OCCUPIED_PATROL can fire from
  // ANY ladder room the agent failed to reach, and any refusal mid-route
  // desyncs it from its origin forever (run bjuv: the agent looped
  // n-n-n/n/up/s-s-e between sewers_1..3 for ten minutes because the patrol
  // route kept replaying hub-origin moves from a drifted room). The hub ITSELF
  // is the only room the ladder guarantees: `put look` + matchwait already ran
  // in PICK_ROOM_DONE's room, so simply restarting the ladder from wherever we
  // stand is always safe — every PICK_ROOM_i route is relative to the hub
  // ONLY as a walk-through, and the first look re-anchors occupancy checking.
  // A refusal inside any PICK leg skips that leg's remaining moves (engine
  // skipMoves) and continues the ladder from the next candidate, so the
  // ladder is self-healing from an arbitrary start room: legs whose paths
  // don't apply from here are refused-and-skipped until one lands, and SCAN
  // runs wherever the agent ends up. The 2s pause replaces the old walk-home
  // and keeps the re-scan cadence sane.
  if (ladder.length) {
    L.push('OCCUPIED_PATROL:');
    L.push('  pause 2');
    L.push('  goto PICK_ROOM_0');
  }
  // Respawn-wait kaizen: WANDER used to idle (`pause 4`). Foraging here is
  // free survival exp that lifts the starved Nth-set slots (3rd/4th survival)
  // while the 1st/2nd (skinning, perception) over-gain from combat — the
  // run vqgv agents sat at shortfall 5-6 with foraging untouched.
  L.push('WANDER:');
  if (cap.survivalBreadth) {
    // Survival commands have their own roundtime. Gate each command on the
    // preceding EXP read so a full pool is skipped instead of repeatedly
    // issuing a useless action. The matchwait timeout is intentional: when
    // the skill is not mind-locked, the EXP report does not match the skip
    // label and execution continues to the command.
    L.push('  wait');
    L.push('  put exp');
    L.push('  matchre SURV_TRACK_SKIP Foraging[\\s\\S]*mind lock');
    L.push('  matchwait 5');
    L.push('  put forage');
    L.push('  wait');
    L.push('SURV_TRACK_SKIP:');
    L.push('  put exp');
    L.push('  matchre SURV_HUNT_SKIP Tracking[\\s\\S]*mind lock');
    L.push('  matchwait 5');
    L.push('  put track');
    L.push('  wait');
    L.push('SURV_HUNT_SKIP:');
    L.push('  put exp');
    L.push('  matchre SURV_DONE Perception[\\s\\S]*mind lock');
    L.push('  matchwait 5');
    L.push('  put hunt');
    L.push('  wait');
    if (cap.survivalFocus) {
      L.push('  pause 2');
      L.push('  goto WANDER');
    }
    L.push('SURV_DONE:');
  }
  if (!cap.survivalBreadth) { L.push('  put forage', '  wait'); }
  L.push('  pause 4');
  L.push('  goto SCAN');
  L.push('REST:');
  L.push(`  echo -- licking wounds --`);
  L.push('  ifge combat 1 goto SCAN');
  L.push(cfg.healSpell ? `  put prepare ${cfg.healSpell}` : '  put rest');
  if (cfg.healSpell) {
    L.push('  wait');
    L.push('  put cast');
    L.push('  wait');
    L.push('  iflt hp 85 goto REST');
  } else {
    L.push('RESTWAIT:');
    L.push('  pause 3');
    L.push('  ifge combat 1 goto SCAN');
    L.push('  iflt hp 85 goto RESTWAIT');
    L.push('  put stand');
    L.push('  wait');
  }
  L.push('  goto SCAN');
  // RETURN_TO_HUB_<i> trampolines (O20): an occupied candidate jumps here,
  // replays its just-walked path in reverse back to the arena hub, then
  // starts the next hub-rooted leg. Only legs WITH a successor get one (the
  // last leg's occupied case is handled by PICK_ROOM_DONE -> OCCUPIED_PATROL),
  // and they are emitted last so no fall-through above can reach them.
  for (let i = 0; i + 1 < ladder.length; i++) {
    L.push(`RETURN_TO_HUB_${i}:`);
    for (const m of moves(reversePath(ladder[i].fromHere))) L.push(m);
    L.push(`  goto PICK_ROOM_${i + 1}`);
  }
  let src = L.join('\n');
  if (cap.rotationSubscript) {
    // Each species block has the same rotation tree immediately before its
    // post-kill exp check. Replace those copies with one compact putrun call.
    src = src.replace(/\n  ife wsp [\s\S]*?(?=\n  put exp)/g,
      `\n  putrun ${cap.scriptBase}rotate`);
  }
  return src;
}

// circle.dr: walk to the hall, try to circle, train the guild curriculum with
// ordinary guild training on failure, then walk back. TDPs are for stats only.
// Ported from barb-run: parse the guild leader's blocker list into a
// targeted skill-training curriculum. Handles both plain skills ("expertise at
// least rank 8 (you have 5)") and set requirements ("2nd weapon at least
// rank 8"), expanding the Nth-set entries into that guild's candidate pools.
function trainListFromMissing(raw, guild, opts = {}) {
  const cfg = GUILD_SCRIPTS[guild];
  const wanted = [];
  // DIVERSITY targeting (opts.targetNth + opts.ranks): for a missing
  // Nth-set line ("2nd weapon at least rank 8 (your 2nd is 0)"), rank the
  // pool's current ranks descending and train the member SITTING AT that
  // Nth position — the exact slot the requirement counts. The generic
  // expansion below instead dumps EVERY pool candidate into the curriculum,
  // which spread scarce TDPs across six weapon skills while the counted
  // slots stayed behind.
  if (opts.targetNth && opts.ranks) {
    for (const m of raw.matchAll(/\d+(?:st|nd|rd|th) (weapon|armor|survival|lore|magic|supernatural) at least rank (\d+)/gi)) {
      const set = m[1].toLowerCase();
      const need = Number(m[2]);
      const nth = ({ st: 1, nd: 2, rd: 3 })[m[0].match(/^(\d+)(st|nd|rd|th)/i)[2]] || Number(m[0].match(/^(\d+)/)[1]);
      // The guild script's trainSets include useful field skills that are not
      // eligible for the circle gate (e.g. Barbarian hunting/scouting). Use
      // the same authoritative pool as circleRequirements() or a blocker can
      // look satisfied to the retargeter while the real Nth slot stays low.
      const pool = circleRequirementCandidates(GUILDS[guild], set);
      const ranked = [...pool]
        .map((id) => ({ id, rank: opts.ranks[id] || 0 }))
        .sort((a, b) => b.rank - a.rank);
      const blocker = ranked[nth - 1];
      if (blocker && blocker.rank < need) wanted.push(blocker.id);
    }
    // Plain skills still matter ("expertise at least rank 8") — strip the
    // Nth-set lines FIRST or "2nd weapon …" parses as skill "weapon".
    const plainOnly = raw.replace(/\d+(?:st|nd|rd|th) (?:weapon|armor|survival|lore|magic|supernatural) at least rank \d+[^\n]*/gi, '');
    for (const m of plainOnly.matchAll(/([a-z_]+?) at least rank (\d+)/g)) {
      const name = m[1].trim().toLowerCase();
      if (name && !/^\d+(?:st|nd|rd|th)$/.test(name)) {
        const id = name.replace(/\s+/g, '_');
        if (!wanted.includes(id)) wanted.push(id);
      }
    }
    return wanted;
  }
  // Strip Nth-set lines ("2nd weapon at least rank 8") — expanded below from
  // the guild's candidate pools — then collect remaining plain skills.
  const plain = raw.replace(/\d+(?:st|nd|rd|th) (?:weapon|armor|survival|lore|magic) at least rank \d+[^\n]*/gi, '');
  for (const m of plain.matchAll(/([a-z_' ]+?) at least rank (\d+)/g)) {
    const name = m[1].trim().toLowerCase();
    if (name) wanted.push(name);
  }
  for (const m of raw.matchAll(/\d+(?:st|nd|rd|th) (weapon|armor|survival|lore|magic)/gi)) {
    for (const c of cfg.trainSets[m[1].toLowerCase()] || []) wanted.push(c);
  }
  return [...new Set(wanted)];
}

function buildCircleScript({ cap, fromArena, errands }) {
  const cfg = GUILD_SCRIPTS[cap.guild];
  const L = [];
  L.push(`# ${cap.scriptBase}circle — guild hall trip (+ town errands)`);
  L.push('HALLTRIP:');
  if (fromArena.hall?.length) L.push(...moves(fromArena.hall));
  // Learn guild abilities while standing in the hall (they are taught ONLY
  // here — server/commands/combat.js learn()). Agents previously reached the
  // hall with abilities:[] for an entire run, so every scripted signature
  // ability was rejected with "You have not learned <X>" and the guild's
  // whole identity kit was dead: the roar-ability fidelity check had NEVER
  // passed in any run, and the supernatural exp those abilities grant (the
  // only path to the "1st Supernatural" circle requirement for a manaless
  // guild) never accrued. Failure prose is harmless — already-known and
  // no-free-slot both just print and fall through.
  // Learn only up to the guild's available ability slots. Slots are scarce
  // (barbarianSlots() = 1 + floor(circle/2) — exactly ONE at circle 1), so
  // attempting the whole list every trip is pure waste: run bdas fired 25
  // learn attempts across 5 trips for a single always-satisfied slot. The
  // first `slots` entries of learnAbilities are the priority order from
  // data/guild-scripts.js; later ones fail harmlessly but cost a wait each.
  // Use the live circle, not a circle-1 constant: after circling, the next
  // generated hall trip must be able to fill the newly available slot(s).
  const slots = GUILD_SCRIPTS[cap.guild]?.abilitySlots
    ? cfg.abilitySlots(Math.max(1, Number(cap.circle) || 1))
    : (cfg.learnAbilities || []).length;
  for (const abil of (cfg.learnAbilities || []).slice(0, slots)) {
    L.push(`  put learn ${abil}`);
    L.push('  wait');
  }
  // Circling itself does not spend TDPs. Attempt it before the optional
  // training budget gate, otherwise a ready character with a low balance can
  // never advance: it walks home without ever sending `circle`.
  // The supervisor sets skipCircle when the latest local requirement snapshot
  // proves the gate is still closed. Training-only hall trips must not emit a
  // blind circle attempt; circleRequirements() is authoritative before this
  // script is launched.
  if (cap.skipCircle) L.push('  goto TRAIN');
  L.push('TRY_CIRCLE:');
  L.push('  matchre CIRCLE_OK Rise, |now a ');
  L.push('  matchre TRAIN not yet ready|must stand in your own');
  L.push('  put circle');
  L.push('  matchwait');
  L.push('CIRCLE_OK:');
  L.push('  echo CIRCLE_UP_OK');
  L.push('  exit');
  L.push('TRAIN:');
  // TDPs are an INFO/stat currency in this game, never a skill-EXP shortcut.
  // Skill ranks come from EXP/field activity or ordinary guild training. When
  // a circle blocker is trainable by the guild, spend silver on that skill at
  // the hall; non-guild blockers must continue to grow organically in the
  // field.
  L.push('  put tdp');
  L.push('  wait');
  L.push('  pause 1');
  const curriculum = cap.trainList?.length ? cap.trainList : (cfg.defaultTrain || []);
  for (const skill of curriculum.slice(0, 8)) {
    L.push(`  put train ${skill}`);
    L.push('  wait');
  }
  // Drain-and-circle loop (SPEED-RUN): one hall visit should BANK the circle,
  // not train once and walk home. After draining the curriculum this pass,
  // re-attempt `circle` immediately — if the gate just closed we circle now
  // instead of waiting for the next 4-kill / 4-minute hall trigger (the
  // 505-banked-tdp / shortfall-35 failure mode). If still short we leave to
  // hunt; the driver re-triggers a hall visit (every hallFallbackMs / on rank
  // movement) for another full drain, so repeated visits converge. A single
  // drain pass is enough to close the dominant shortfall: 15 skills x cheap
  // ranks spends most of a banked pool in one visit, which circles on the spot.
  // (A second in-script pass would repeat skill-training lines and break the
  // curriculum-ordering test.)
  if (cap.skipCircle) L.push('  goto BACK');
  else L.push('  goto CIRCLE_AGAIN');
  L.push('CIRCLE_AGAIN:');
  L.push('  matchre CIRCLE_OK Rise, |now a ');
  L.push('  matchre BACK not yet ready|must stand in your own');
  L.push('  put circle');
  L.push('  matchwait');
  L.push('  goto BACK');
  L.push('BACK:');
  // Town errands: sell loot + bundle leftovers on the way home —
  // skins fund the weapon ladder (club → short sword → cavalry_sabre).
  let returnedViaErrands = false;
  if (errands?.bazaarPath?.length) {
    L.push(...moves(errands.bazaarPath));
    // ROOM GATE: sell/bundle only where a shopkeeper actually stands.
    // Fallback hall trips and watchdog regenerations can fire this script
    // from anywhere (sewers_2, transit rooms); the nav moves get refused,
    // the script falls through, and the old unconditional block dumped
    // ~190 "sell <loot>" commands into the sewers with nobody to sell to
    // (qvgp run). %room is mirrored from the harness-injected [ROOM:...]
    // token. Off-bazaar => skip the errands AND the bazaar-origin return
    // path (it would just refuse), leaving the agent where it stands for
    // the watchdog's own recovery walk.
    L.push(`  ifne room bazaar goto ERRAND_SKIPPED`);
    L.push('ERRAND_SELL:');
    for (const loot of errands.sellLoot || []) {
      L.push(`  matchre ERRAND_DONE not interested|do not have|Sell what|no shopkeeper|does not buy`);
      L.push(`  put sell ${loot}`);
      L.push('  wait');
      L.push('  pause 0.5');
    }
    L.push('ERRAND_BUNDLE:');
    for (const loot of errands.sellLoot || []) {
      L.push(`  put bundle ${loot}`);
      L.push('  wait');
      L.push('  pause 0.5');
    }
    // EDGED KIT RETRY: the starter purse cannot buy all four lanes at once
    // (dagger 25 + broadsword 650 + greatsword 675 + bow 162). Re-check the
    // missing lanes after selling skins, but only issue a buy when inventory
    // proves the weapon is absent and the live purse can cover it. This keeps
    // profitable town trips useful without buying duplicate weapons on every
    // hall visit.
    if (cap.edgedKit) {
      const edgedWeapons = [
        ['DAGGER', 'dagger', 25],
        ['BROADSWORD', 'broadsword', 650],
        ['GREATSWORD', 'greatsword', 675],
        ['BOW', 'hunting bow', 162],
      ];
      for (const [tag, noun, cost] of edgedWeapons) {
        L.push(`WEAPON_RETRY_${tag}:`);
        L.push(`  iflt silver ${cost} WEAPON_RETRY_NEXT_${tag}`);
        L.push('  put inventory');
        L.push(`  matchre WEAPON_RETRY_NEXT_${tag} Worn:[\\s\\S]*${noun}|carrying:[\\s\\S]*${noun}`);
        L.push('  matchwait 4');
        L.push(`  put buy ${noun}`);
        L.push('  wait');
        L.push(`WEAPON_RETRY_NEXT_${tag}:`);
      }
    }
    // CHEAP KIT RETRY: the four affordable lanes can still exceed the fresh
    // purse once armor is purchased. Retry missing weapons after selling
    // skins, without requiring the shield variant that originally introduced
    // this kit.
    if (cap.cheapWeaponKit) {
      const cheapWeapons = [
        ['DAGGER', 'dagger', 25],
        ['SLING', 'sling', 20],
        ['CLUB', 'club', 112],
        ['STAFF', 'staff', 112],
      ];
      for (const [tag, noun, cost] of cheapWeapons) {
        L.push(`WEAPON_RETRY_${tag}:`);
        L.push(`  iflt silver ${cost} WEAPON_RETRY_NEXT_${tag}`);
        L.push('  put inventory');
        L.push(`  matchre WEAPON_RETRY_NEXT_${tag} Worn:[\\s\\S]*${noun}|carrying:[\\s\\S]*${noun}`);
        L.push('  matchwait 4');
        L.push(`  put buy ${noun}`);
        L.push('  wait');
        L.push(`WEAPON_RETRY_NEXT_${tag}:`);
      }
    }
    // SWEEP-DEFAULT RETRY (muse-a): defensiveKit barbarians with no kit
    // variant previously never retried missing weapons at hall errands, so a
    // club skipped on the first visit (85s left of 150s after armor + dagger
    // + sling) waited for a 112s+ watchdog re-entry instead of converting
    // pelt silver on the next hall trip. Labels stay disjoint from the
    // cheap/edged retry blocks via the mutually exclusive cap gates.
    if (cap.defensiveKit && !cap.cheapWeaponKit && !cap.edgedKit && !cap.shieldKit) {
      const defaultLanes = [
        ['DAGGER', 'dagger', 25],
        ['CLUB', 'club', 112],
        ['SLING', 'sling', 20],
      ];
      for (const [tag, noun, cost] of defaultLanes) {
        L.push(`WEAPON_RETRY_${tag}:`);
        L.push(`  iflt silver ${cost} WEAPON_RETRY_NEXT_${tag}`);
        L.push('  put inventory');
        L.push(`  matchre WEAPON_RETRY_NEXT_${tag} Worn:[\\s\\S]*${noun}|carrying:[\\s\\S]*${noun}`);
        L.push('  matchwait 4');
        L.push(`  put buy ${noun}`);
        L.push('  wait');
        L.push(`WEAPON_RETRY_NEXT_${tag}:`);
      }
    }
    // HELM RETRY (cap.helmRetry): the first-visit helm buy is purse-gated at
    // 120s but club+knives+armor drain the 150s purse on a fresh character,
    // so the gate can never fire on leg one (kjvh evidence: 1x buy padded
    // cloth armor, 0x buy iron helm, 2nd armor pinned 1/2). Every hall trip
    // passes the bazaar for errands with BANKED loot silver — retry here.
    if (cap.helmRetry) {
      L.push('HELM_RETRY:');
      L.push(`  iflt silver 130 ${cap.shieldKit ? 'SHIELD_RETRY' : 'ERRAND_DONE'}`);
      L.push('  matchre ERRAND_DONE Worn:[\\s\\S]*helm');
      L.push('  put inventory');
      L.push('  matchwait 4');
      L.push('  put buy iron helm');
      L.push('  wait');
      L.push('  put wear iron helm');
      L.push('  wait');
    }
    // SHIELD RETRY (cap.shieldKit): the first bazaar visit may spend the
    // starter purse on a weapon before it can buy the shield. Later hall
    // errands are the safe, repeatable place to retry it; once worn, every
    // landed blow also advances shield_usage as an armor category.
    if (cap.shieldKit) {
      L.push('SHIELD_RETRY:');
      L.push('  iflt silver 75 ERRAND_DONE');
      L.push('  matchre ERRAND_DONE Worn:[\\s\\S]*shield');
      L.push('  put inventory');
      L.push('  matchwait 4');
      L.push('  put buy wooden shield');
      L.push('  wait');
      L.push('  put wear wooden shield');
      L.push('  wait');
    }
    // ARMOR STACK retry (cap.armorStack): same economics as helmRetry — the
    // fresh-purse first visit can't afford the stack; hall trips pass here
    // with loot silver. Helm is prioritized (2nd armor CATEGORY) first.
    if (cap.armorStack) {
      const pieces = [
        ['SLEEVES', 'sleeves', 'leather sleeves', 60],
        ['BOOTS', 'boots', 'leather boots', 45],
        ['LEGGINGS', 'leggings', 'leather leggings', 60],
      ];
      for (const [TAG, tag, noun, cost] of pieces) {
        L.push(`STACKR_${TAG}:`);
        L.push('  put inventory');
        L.push(`  matchre STACKR_NEXT_${TAG} Worn:[\\s\\S]*${tag}`);
        L.push('  matchwait 4');
        L.push(`  iflt silver ${cost} STACKR_NEXT_${TAG}`);
        L.push(`  put buy ${noun}`);
        L.push('  wait');
        L.push(`  put wear ${noun}`);
        L.push('  wait');
        L.push(`STACKR_NEXT_${TAG}:`);
      }
    }
    L.push('ERRAND_DONE:');
    L.push('ERRAND_SKIPPED:');
    if (errands.returnPath?.length) {
      L.push(...moves(errands.returnPath));
      returnedViaErrands = true;
    }
  }
  // Both paths terminate at the arena. Appending hall->arena after the
  // errands route has already walked bazaar->arena replays moves from the
  // wrong origin and strands the agent in a transit room. This was the
  // dominant late-run Barbarian wedge while one rank short of circle 2.
  if (!returnedViaErrands && fromArena.back?.length) L.push(...moves(fromArena.back));
  L.push('  exit');
  return L.join('\n');
}

// mega.dr: the top-level orchestration the driver actually launches. It runs
// one full cycle via putrun; the driver re-runs it until targets/time end it.
function buildMegaScript(cap) {
  return [
    `# ${cap.scriptBase}mega — one full hunt+circle cycle`,
    'putrun ' + cap.scriptBase + 'hunt',
    'putrun ' + cap.scriptBase + 'circle',
    'exit',
  ].join('\n');
}


const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e', ne: 'sw', sw: 'ne',
  nw: 'se', se: 'nw', up: 'down', down: 'up', out: 'in' };

function reversePath(path) {
  if (!path?.length) return [];
  return [...path].reverse().map((e) => ({ dir: OPPOSITE[e.dir] || e.dir }));
}

export { nounOf, moves, buildHuntScript, buildWeaponRotationScript, buildSharedFightScript, buildCircleScript, buildMegaScript, reversePath, OPPOSITE, trainListFromMissing };
