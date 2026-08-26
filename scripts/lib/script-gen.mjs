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
  L.push('  put exp');
  L.push('  matchwait 5');
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
    const label = `FIGHT_${sp.replace(/\W/g, '_')}`;
    const noun = nounOf(sp);
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
    L.push(`  matchre TARGET_GONE ^(?![\\s\\S]*${noun} is here)`);
    L.push(`  matchre FIGHT_NOW ${noun} is here`);
    L.push('  matchwait 4');
    L.push('TARGET_GONE:');
    L.push('  goto SCAN');
    L.push('FIGHT_NOW:');
    // Each verb gets its own `wait` so the engine syncs with roundtime
    // before the next fires — without this, verbs pile up mid-RT and spam
    // "You must wait N seconds" refusals.
    for (const step of cfg.fight) {
      L.push('  ' + step.replace(/%target/g, noun));
      L.push('  wait');
    }
    // Skinning guilds (ranger, barbarian...): skin the distinctive noun —
    // the server teaches it in the kill prose ("Type \"skin rat\""), and
    // bare `skin` is not a command ("Skin what?"). Failure prose
    // ('no such corpse') is harmless; the engine holds the verb until
    // weapon RT drains, then applies it.
    if ((cfg.survivalSkills || cfg.trainSets?.survival || []).includes('skinning')) {
      L.push(`  put skin ${noun}`);
      L.push('  wait');
    }
    if (cfg.signature && cfg.signature.probe === 'ability') {
      // Signature guild ability: fire it every few swings; failure prose
      // (not learned / no voice) still counts as a fidelity observation.
      L.push(`  put ${cfg.signature.cmd}`);
      L.push('  wait');
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
    L.push(`  matchre SCAN_DONE ${noun} is here`);
    L.push('  matchwait 3');
    L.push('  goto SCAN'); // target no longer present -> next scan
    L.push('SCAN_DONE:');
    L.push('  wait');
    L.push('  pause 3');
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
function trainListFromMissing(raw, guild) {
  const cfg = GUILD_SCRIPTS[guild];
  const wanted = [];
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
  for (const abil of (cfg.learnAbilities || [])) {
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
  let train = cap.trainList?.length ? cap.trainList : cfg.defaultTrain;
  if (cap.trainOffset && cap.trainList?.length) {
    // Rotate the start so repeated trips spend TDPs across ALL blocking
    // candidates instead of always re-training the first few.
    const off = cap.trainOffset % train.length;
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
  const TDP_FLOOR = 8;
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
    L.push('ERRAND_DONE:');
    if (errands.returnPath?.length) L.push(...moves(errands.returnPath));
  }
  if (fromArena.back?.length) L.push(...moves(fromArena.back));
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
