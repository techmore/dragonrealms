// Shared DR-script generator: builds hunt/circle/mega libraries from live
// geography + the guild capability map. Used by the CLI sweep AND by server
// quick-play (gm-play) so every simulated player can launch straight into
// circling scripting.
import { ROOMS } from '../../data/world.js';
import { creatureById } from '../../data/creatures.js';
import { GUILD_SCRIPTS } from '../../data/guild-scripts.js';
import { GUILDS, trainableSkills } from '../../data/guilds.js';

const nounOf = (spawnId) => (creatureById(spawnId)?.name || spawnId).replace(/^(an?|the)\s+/i, '');

function moves(path) { return path.map((e) => `  move ${e.dir}`); }

// hunt.dr: arm check -> travel to arena -> scan/fight loop with guild verbs,
// mana gating for casters, rest when hurt. %target substitution happens in
// the generated text itself (one FIGHT label per species).
function buildHuntScript({ cap, arena, hallPath }) {
  const cfg = GUILD_SCRIPTS[cap.guild];
  const L = [];
  L.push(`# ${cap.scriptBase}hunt — ${cfg.magic ? 'caster' : 'weapon'} loop for ${cap.char}`);
  L.push('START:');
  L.push('  put look');
  L.push('  wait');
  L.push('ARMCHECK:');
  // Weapon upgrade ladder: if we've banked enough from selling pelts,
  // force a re-buy even when currently armed. The BUY section below
  // only fires for unarmed agents — without this, a club-wielding agent
  // would never upgrade because ARMCHECK matches "Worn:...club" and
  // skips straight to ARMED.
  L.push('  ifge silver 562 goto GETWEAPON');
  L.push('  ifge silver 337 goto GETWEAPON');
  // Order matters: equipped wins, then a carried weapon is wielded, and only
  // a genuinely unarmed character walks to the bazaar to buy.
  // The inventory reply is MULTI-LINE ("You are carrying:\n  a club\nWorn:
  // ..."), and RegExp '.' does not cross newlines — use [\s\S]* for
  // cross-line matching. A plain .* silently never matched a carried club,
  // sending armed agents to re-buy every cycle (the 0-kill wedge).
  L.push('  matchre ARMED Worn:[\\s\\S]*(club|sword|axe|staff|dagger|mace|blade|bow|hammer)');
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
  L.push('GETWEAPON:');
  if (cap.bazaarPath?.length) L.push(...moves(cap.bazaarPath));
  // WEAPON PLAN buy block. With a weaponPlan the agent buys its FULL kit on
  // this one visit (club + throwing knives + mace = 348s of starter silver:
  // fresh chars have 150, so only what's affordable lands now and later
  // bazaar trips fill gaps as pelt income arrives). Without a plan, falls
  // back to the legacy single-weapon ladder.
  const plan = cfg.weaponPlan;
  if (plan?.weapons?.length) {
    const prices = { club: 112, throwing_knives: 30, mace: 206, staff: 112, dagger: 25 };
    // DIVERSITY kit (cap.closeNth): swap the third weapon from mace (blunt —
    // trains the SAME category as club, useless for Nth-set diversity) to
    // staff (staff category, also 112s at Milgrym's). Three distinct
    // categories = blunt/thrown/staff, exactly what circle-2's 2nd/3rd/4th
    // weapon slots need exercised in the field.
    const kit = cap.closeNth && plan.weapons.includes('club')
      ? ['club', 'staff', 'throwing_knives']
      : plan.weapons;
    for (const wid of kit) {
      const nm = String(wid).replace(/_/g, ' ');
      const price = prices[wid];
      L.push(`BUY_${wid.replace(/_/g, '').toUpperCase()}:`);
      // Buying an owned weapon is harmless ("already have") but wastes a
      // wait — gate each purchase on its price so poor agents skip ahead.
      if (price) L.push(`  iflt silver ${price} goto PLAN_DONE`);
      L.push(`  put buy ${nm}`);
      L.push('  wait');
    }
    L.push('PLAN_DONE:');
    // Wield the FIRST weapon (rotation handles swapping in the field).
    const first = String(plan.weapons[0]).replace(/_/g, ' ');
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
  L.push('  matchre ARMED Worn:[\\s\\S]*(padded|leather|studded|chain|brigandine|plate)');
  L.push('  put inventory');
  L.push('  matchwait 4');
  L.push('  put buy padded cloth armor');
  L.push('  wait');
  L.push('  put wear padded cloth armor');
  L.push('  wait');
  // DIVERSITY (cap.closeNth): the 2nd armor slot needs a SECOND armor
  // CATEGORY taking blows (armor exp is granted per landed blow against each
  // WORN piece's own skill). padded cloth = light_armor; a 120s iron helm =
  // chain_armor. Same purse gate style as the weapon plan.
  if (cap.closeNth) {
    L.push('  ifge silver 120 BUY_HELM');
    L.push('  goto ARMED');
    L.push('BUY_HELM:');
    L.push('  matchre ARMED already have|Worn:[\\s\\S]*helm');
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
  L.push('  goto ARMED');
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
  L.push('ARMED:');
  // Walk to the arena from where we stand NOW (arm check may pass in any
  // room); after an actual buy, BUY falls through to ARMED_HERE instead.
  if (arena.fromHere?.length) L.push(...moves(arena.fromHere));
  L.push('  goto SCAN');
  L.push('ARMED_HERE:');
  if (arena.fromArmed?.length) L.push(...moves(arena.fromArmed));
  L.push('SCAN:');
  L.push('  pause 2');
  L.push('  iflt hp 40 goto REST');
  // Field readiness check (player-style `exp`): the view ends with either
  // "ready to circle!" or the missing-requirements list. Branch on it so a
  // ready agent heads for the hall instead of over-farming one arena.
    L.push('  matchre CIRCLE_READY ready to circle');
    // `exp` is information-only, but probing it on every scan floods the
    // wire when an arena is empty or a runner is parked (348 probes in one
    // 40m leg). Alternate probes: the supervisor also receives the merged
    // exp sheet and can force a hall trip as soon as the gate is met.
    L.push('  if_2 goto SCAN_NOEXP');
    L.push('  setvariable 2 1');
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
  const species = [...new Set(ROOMS[arena.id]?.spawns || [])];
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
  for (const sp of species) {
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
    L.push('  goto SCAN'); // target no longer present -> next scan
    L.push(`SD_${key}:`);
    L.push('  wait');
    L.push('  pause 3');
    // WEAPON ROTATION — swap to the plan's OTHER weapon after every kill.
    //
    // Why: circle 2 needs FOUR weapon skills (1st@8, 2nd@8, 3rd@4, 4th@2);
    // single-weapon farming trains only its own skill and leaves slots 2-4
    // to TDP-only grind — measured at ~105 TDPs to lift one rank-2 filler to
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
      const skillsOf = { club: 'blunt', mace: 'blunt', throwing_knives: 'thrown', staff: 'staff', dagger: 'small_edged' };
      const kit = cap.closeNth && plan.weapons.includes('club')
        ? ['club', 'dagger', 'throwing_knives']
        : plan.weapons;
      if (cap.closeNth && kit.length > 1) {
        // DIVERSITY rotation, requirement-aware ("4 levels over needed ->
        // switch off"). Each kit weapon maps to a skill with a circle-2
        // rank need. Branch order per kill (holding W_i):
        //   iflt wsr_<skill> <need+MARGIN> -> keep training it: fall through
        //     to the normal next-kit-swap below.
        //   otherwise (>= need+MARGIN) the weapon is SATISFIED — skip to the
        //     next UNsatisfied kit slot via a skip-chain of ifges.
        // [WSRANK:<skill>:<rank>] tokens are injected each heartbeat by the
        // harness from vitals.skills (mindstate-fed), so this works across
        // runner restarts with zero stored state. If every slot satisfies,
        // all skips chain to ROT_END and the currently-held weapon stays.
        // Overwhelmed handling remains the supervisor's flee interlock +
        // WEAKSWING primary-weapon fallback — unchanged here.
        const needs = { blunt: 8, thrown: 8, small_edged: 8 };
        const MARGIN = 4;
        // satisfied-check helper: 'iflt' var threshold jumps to label when
        // rank is BELOW margin-adjusted need (i.e. still needs training).
        const stillNeeds = (skl, lbl) => `iflt wsr_${skl} ${needs[skl] + MARGIN} goto ${lbl}`;
        for (let i = 0; i < kit.length; i++) {
          const skl = skillsOf[kit[i]];
          L.push(`  ife wsp ${skl} goto ROT_K${i}_${key}`);
        }
        const rotate = (from, to) => [
          `  put remove ${nm(kit[from])}`,
          `  put wield ${nm(kit[to])}`,
          '  wait',
        ];
        // K0 holds blunt. Satisfied? Skip knives (K1->K2 arm) unless knives
        // still need ranks; then staff; else stay.
        // K0 holds blunt. Knives unsatisfied? -> knives. Else -> staff.
        L.push(`ROT_K0_${key}:`);
        L.push(`  ${stillNeeds(skillsOf[kit[1]], `ROT_SWAP_1_${key}`)}`);
        L.push(...rotate(0, 2));
        L.push(`  goto ROT_END_${key}`);
        L.push(`ROT_SWAP_1_${key}:`);
        L.push(...rotate(0, 1));
        L.push(`  goto ROT_END_${key}`);
        // K1 holds knives -> next kit weapon is staff (straight rotation).
        L.push(`ROT_K1_${key}:`);
        L.push(...rotate(1, 2));
        // K2 holds staff. Blunt BELOW need+margin? -> club (it trains).
        // Otherwise knives get the exp (blunt is already satisfied).
        L.push(`ROT_K2_${key}:`);
        L.push(`  ${stillNeeds(skillsOf[kit[0]], `ROT_K2_CLUB_${key}`)}`);
        L.push(...rotate(2, 1));
        L.push(`  goto ROT_END_${key}`);
        L.push(`ROT_K2_CLUB_${key}:`);
        L.push(...rotate(2, 0));
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
  // Ready to circle: walk to the hall NOW (the mega's circle leg runs next
  // cycle anyway, but a ready agent shouldn't keep farming a thin arena).
  L.push('CIRCLE_READY:');
  L.push('  echo -- ready to circle: heading to the hall --');
  if (cap.hallPath?.length) {
    L.push(...moves(cap.hallPath));
    L.push('  put circle');
    L.push('  wait');
  }
  L.push('  goto SCAN');
  L.push('WANDER:');
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
  return L.join('\n');
}

// circle.dr: walk to the hall, try to circle, TDP-train the guild curriculum
// on failure, walk back.
// Ported from barb-run: parse the guild leader's blocker list into a
// targeted tdptrain curriculum. Handles both plain skills ("expertise at
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
      const pool = (cfg.trainSets[set] || []);
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
  const slots = GUILD_SCRIPTS[cap.guild]?.abilitySlots
    ? cfg.abilitySlots(1) // circle-1 slot count; circling re-fires this script with more slots
    : (cfg.learnAbilities || []).length;
  for (const abil of (cfg.learnAbilities || []).slice(0, slots)) {
    L.push(`  put learn ${abil}`);
    L.push('  wait');
  }
  L.push('  matchre CIRCLE_OK Rise, |now a ');
  L.push('  matchre TRAIN not yet ready|must stand in your own');
  L.push('  put circle');
  L.push('  matchwait');
  L.push('CIRCLE_OK:');
  L.push('  echo CIRCLE_UP_OK');
  L.push('  exit');
  L.push('TRAIN:');
  // Rotate across BOTH curricula: targeted retarget lists AND the generic
  // defaultTrain. The offset originally applied only when
  // cap.trainList?.length, i.e. only on retargeted trips — but fallback hall
  // trips pass trainList:null, which is the DOMINANT path (run bdas: 5
  // fallback trips, 0 circle attempts => 0 retargets), so all five trips ran
  // the byte-identical list. trainOffset may also legitimately be 0 on the
  // first trip, hence the explicit modulo guard rather than truthiness.
  let train = cap.trainList?.length ? cap.trainList : cfg.defaultTrain;
  const off = (cap.trainOffset || 0) % Math.max(1, train.length);
  if (off > 0) {
    train = [...train.slice(off), ...train.slice(0, off)];
  }
  // Guild-taught skills first: hard circle requirements are always taught,
  // so scarce TDPs land where circling needs them; off-guild set-fillers
  // soak up whatever remains. Stable sort preserves the rotation order.
  const g = GUILDS[cap.guild];
  if (g) {
    const teaches = new Set(trainableSkills(g));
    train = [...train].sort((a, b) => (teaches.has(b) ? 1 : 0) - (teaches.has(a) ? 1 : 0));
  }
  // Afford-gate the whole block on the live %tdp balance (mirrored into the
  // runner by the engine from game prose / injected prompts). A broke agent
  // used to spam every entry as a refusal and walk home — pure noise lines
  // and zero progress. TDP_FLOOR keeps a small reserve instead of burning
  // down to pocket change on cheap ranks.
  const TDP_FLOOR = cap.tdpFloor ?? 8;
  L.push('  put tdp');
  L.push('  wait');
  L.push('  pause 1');
  L.push(`  iflt tdp ${TDP_FLOOR} goto BACK`);
  for (const sk of train) {
    L.push(`  put tdptrain ${sk}`);
    L.push('  wait');
    L.push('  pause 1');
    L.push(`  iflt tdp ${TDP_FLOOR} goto BACK`);
  }
  L.push('BACK:');
  // Town errands: sell loot + bundle leftovers on the way home —
  // skins fund the weapon ladder (club → short sword → cavalry_sabre).
  let returnedViaErrands = false;
  if (errands?.bazaarPath?.length) {
    L.push(...moves(errands.bazaarPath));
    L.push('ERRAND_SELL:');
    for (const loot of errands.sellLoot || []) {
      L.push(`  matchre ERRAND_DONE not interested|do not have|Sell what`);
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
    // HELM RETRY (cap.helmRetry): the first-visit helm buy is purse-gated at
    // 120s but club+knives+armor drain the 150s purse on a fresh character,
    // so the gate can never fire on leg one (kjvh evidence: 1x buy padded
    // cloth armor, 0x buy iron helm, 2nd armor pinned 1/2). Every hall trip
    // passes the bazaar for errands with BANKED loot silver — retry here.
    if (cap.helmRetry) {
      L.push('HELM_RETRY:');
      L.push('  iflt silver 130 ERRAND_DONE');
      L.push('  matchre ERRAND_DONE Worn:[\\s\\S]*helm');
      L.push('  put inventory');
      L.push('  matchwait 4');
      L.push('  put buy iron helm');
      L.push('  wait');
      L.push('  put wear iron helm');
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

export { nounOf, moves, buildHuntScript, buildCircleScript, buildMegaScript, reversePath, OPPOSITE, trainListFromMissing };
