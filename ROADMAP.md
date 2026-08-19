# Dragon Realms — Roadmap to Circle 10

Full-feature parity for all eleven guilds up to circle 10. This is the living
plan. The matching tracker lives at `public/ROADMAP.html` (served at
`/ROADMAP.html` while the game runs) and is **generated** from
`data/roadmap.js` — edit the data file, then run `npm run roadmap-doc` to
regenerate (the circle matrix is pulled live from the circle engine).

- **Current state:** see the `Status` markers below. ✅ = live, 🚧 = partial, ⬜ = planned.
- **Parity bar:** every guild must be able to reach circle 10 through a fair,
  fun, self-directed loop (hunt → skill up → train → circle → new spells/gear).

**Status snapshot (2026-08):** circle-10 parity for all 11 guilds is
sim-verified; the authentic exp/TDP/circle economy is live; both starting
cities exist; scripting, interface, and native controls are done; every guild
has a fidelity v1. The remaining work is breadth — deeper passes inside each
pillar (marked ⬜) and the large-lift items in the *Next Up* section at the
bottom.

---

**Guild fidelity at a glance (all v1s live, deeper trees pending):**

| Guild | v1 | Signature mechanics live |
|---|---|---|
| Barbarian | 🚧 | Inner Fire, Berserk/Wildfire, Dragon Form, Tenacity, Roars, Whirlwind, War Stomp, Choke, Dual Load, masteries, ANALYZE combos |
| Bard | 🚧 | Enchantes (war/bravery/regen), Performance |
| Cleric | 🚧 | Devotion rituals, holy damage scaling |
| Empath | 🚧 | Mend / take wounds, empathic stain on living kills |
| Moon Mage | 🚧 | Prediction (omen buff), lunar mana |
| Necromancer | 🚧 | Risen minions from corpses, Thanatology |
| Paladin | 🚧 | Soul, Smite, code of honor, undead-soul |
| Ranger | 🚧 | Wolf companions, beseech wind/sun |
| Thief | 🚧 | Khri (5), ambush from hiding, crime/justice |
| Trader | 🚧 | Commodity pits, Trading |
| Warrior Mage | 🚧 | Familiars, overchanneling, cambrinth |

---

## Pillar 1 — Characters & Races

| Feature | Status |
|---|---|
| Secure accounts: scrypt hashing, salt, lockout, sessions, rate limiting | ✅ |
| 5 character slots per account | ✅ |
| Character creation (name, race, guild) | ✅ |
| Stat allocation (8 stats, 30-point pool) | ✅ |
| 12 races with stat modifiers & descriptions (incl. Giantman) | ✅ |
| Character deletion (`deletechar`) | ✅ |
| Character select with slot display + "new" flow | ✅ |
| Rerolling / respec of spent stats | ✅ (Fane of Training: `respec`, returns spent points, 150 + circle×50 silvers) |

**Parity note:** respec is live (Fane of Training) as the safety net for the TDP economy — a misallocated build is never fatal.

---

## Pillar 2 — Skills & Experience

| Feature | Status |
|---|---|
| 83 skills across 8 categories (six DR skillsets + Combat Manipulation + Defense) | ✅ |
| EXP earned through use (combat, magic, crafting, world skills) | ✅ |
| Automatic rank-up when exp threshold reached (200 + n per rank, matching DR) | ✅ |
| Field-exp pools & pulses: 70% lands now, 30% banks and pulses into ranks every 30s; mindstate ladder reads the pool | ✅ |
| `skills`, `exp`, `score` reporting (exp shows mindstate ladder) | ✅ |
| Skill-gated world actions: `forage`, `track`, `skin`, `hunt`, `hide`, `study`, `steal`, `pick` | ✅ |
| Balanced exp curve so each guild can reach rank 10 primaries | ✅ sim-validated (all 11 guilds, 5–16 sim-min) |
| **TDPs** — authentic model: 600 starting, 50+circle base on circling, hidden pool (every 200 rank-points → 1 TDP), death can cost pool | ✅ |
| Spend TDPs to permanently raise stats — at the **Fane of Training** (DR: TRAIN twice to confirm) | ✅ |
| Spend TDPs to train any skill (`tdptrain <skill>`) | ✅ |
| Skill caps tied to circle (max rank = circle × 4, anti-grind) | ✅ |
| Mastery skills (Melee/Missile Mastery, Primary Magic) boost lower same-class skills | ✅ |
| Debts/locks to slow runaway grinding (optional, DR-flavored) | ✅ learning lockout after 3+ rapid rank-ups (50% for 2 min); death costs rank progress |
| **Guild capstones at circle 10** | ✅ (11 signature passives) |

**Circle-10 target per guild:** the authentic DR band tables (hard skills +
Nth-of-skillset pools, 1–10 bands scaled per circle). See the matrix below.

---

## Pillar 3 — Circling & Leveling

| Feature | Status |
|---|---|
| Circle requirement engine (`circleRequirements`, authentic DR band tables) | ✅ |
| Circle up in your guild hall (`circle`) | ✅ |
| HP/Mana growth with circle | ✅ |
| Circle 2 reachable & tested | ✅ |
| Circles 3–6 pacing balanced | 🚧 sim-validated (smooth per-circle milestones); curve retuning in flight after stamina/lockout landed |
| Circles 7–10 pacing + endgame | 🚧 pacing validated; endgame = capstones + tiered gear live |
| TDP bonus granted on circle-up (50 + circle < 10; 100 + circle ≥ 10) | ✅ |
| Guild rank titles (e.g. Barbarian "Furrier" → "Warlord") | ✅ (10 titles per guild) |
| Circle display in prompt, score, who | ✅ |

---

## Pillar 4 — Training

| Feature | Status |
|---|---|
| Guild trainers in each hall | ✅ |
| `train <skill>` pays silvers for skill exp | ✅ |
| Guild-only skill lists enforced | ✅ |
| Cost curve that stays meaningful to circle 10 | ✅ sim-validated (costs scale 40 + rank×20 through circle 10) |
| Trainers as NPCs with `ask` dialogue | ✅ |
| Advanced: train other races'/guilds' secrets for TDPs | ⬜ |

---

## Pillar 5 — Combat (async, immersive)

| Feature | Status |
|---|---|
| Server-ticked async combat | ✅ |
| Weapon speed, initiative, hit/miss/crit narrative | ✅ |
| **Combat ranges** (missile/pole/melee) with `advance`/`retreat`/`flee`/`assess`; indoor fights start at pole, outdoors at missile; movement blocked while a foe is at melee/pole | ✅ |
| **Roundtime** (DR weapon-class table: light 2–3s, medium 3, heavy 4, twohanded 4, brawling 2–3), `RT: n` in the prompt, RT actions gated | ✅ |
| **DR vitality words** (`bruised` → `near death`) in `health` + creature room display | ✅ |
| Armor mitigation, evasion, parry, shield usage | ✅ |
| Ranged weapons consume ammo | ✅ |
| Death/respawn + exp penalty | ✅ |
| Retreat / flee (spell + physical) | ✅ |
| Powers: Berserk (Barbarian), Backstab (Thief) | ✅ |
| 15 creature types (12 base + 3 named rares) across 7 zones | ✅ |
| Creature auto-engage on aggressive spawns | ✅ |
| **Combat stances** (aggressive / defensive / guarded) with **stance points** (Barbarian +1/60 Defending, Ranger +defense scaling) | ✅ |
| **PvP duels** (challenge/accept, wilds only, concede/defeat) | ✅ |
| **Ambush from hiding** (`hide` → `ambush`; thieves hide mid-fight) | ✅ |
| **Hunting ladder** (creature teaching bands; `ladder` command; over-levelled prey teaches little) | ✅ |
| Creature groups with formations | 🚧 groups partially spawn |
| Mid-tier (circle 5–7) and high-tier (8–10) hunting grounds | ✅ Cinder Cavern + Blackwood Ruins |
| Special maneuvers (disarm, trip, shield-bash) | ✅ |
| Battlefield healing / potion chug timers | ✅ 30s chug timer between draughts; no eating/drinking in combat (healing from magic and the healer) |
| Debuffs & DoTs from spells | 🚧 Rot slows only |
| Loot tables scale with creature circle | ✅ coins scale with circle; gems circle-tiered (garnet → diamond); strongboxes/ore at tier; rare named loot on zone rares |

**Parity bar:** by circle 10 each guild needs a complete kit — weapon skill,
armor skill, defense skill, and either spells or powers that reward mastery.

---

## Pillar 6 — Magic

| Feature | Status |
|---|---|
| Per-guild spell lists with circle gates (5 spells/guild: c1 / c3 / c5 / c7 / c8) | ✅ |
| Spell kinds: damage, heal, sleep, flee, teleport, mark, ward, drain, buff | ✅ |
| Mana economy: 6 mana types + cycles, perceive/harness, held mana, cambrinth | ✅ (see Pillar 25) |
| `spells` command + `prepare <spell> [pct]` overchanneling | ✅ |
| Fifth spell per guild at circle 8 | ✅ (all 8 magic guilds: c1/c3/c5/c7/c8, incl. the c7 signature spells) |
| Spell research / scroll learning (optional) | ⬜ |
| Spell damage scales with skill & circle to circle 10 | ✅ |

---

## Pillar 7 — World & Economy

| Feature | Status |
|---|---|
| Towns: The Crossing (square, market, bank, temple, brewery, forge, fane, jail, pit, guild district) + Riverhaven (square, market, shrine, hall row, ferry) | ✅ |
| 7 hunting zones (Sewers, Old Woods, Marsh, Deep Wilds, Bandit Camp, Cinder Cavern, Blackwood Ruins) | ✅ |
| Shops: buy/sell with stock + prices | ✅ |
| Bank deposit/withdraw | ✅ |
| Temple healer | ✅ |
| Town crier + `ask` topics | ✅ |
| Pest-control quests (crier) | ✅ |
| Foraging → herbs/potions consumables | ✅ |
| **Equipment tiers for circles 1–10** | ✅ (quartermaster, circle-gated) |
| **Crafting: alchemy** | ✅ (Tilted Retort; herbs+motes → potions) |
| Multi-level dungeon | ✅ Blackwood Ruins (keep → crypt) |
| Named/unique creatures with rare loot | ✅ Shadowpaw, Bandit Chieftain, Cinder Drake King |
| Auction / player trading | ✅ Merchants' Auction Hall (north of the Grain Pit): AUCTION OFFER/BUY, listings lapse after an hour, buyers pay sellers directly; broker fees pending |
| Economy balance (sink vs. source of silver) | 🚧 simulator validates training costs |

---

## Pillar 8 — Scripting & Automation

The web client is the surface for automation. All scripting is **client-side**
(sandboxed, per-user) so the server stays trustworthy.

| Feature | Status |
|---|---|
| Alias system (`alias <name> <command>`, `$1..$9`) | ✅ (persisted server-side) |
| Multi-command strings (`;` separated) | ✅ |
| Macro bar (buttons that fire commands) | ✅ (client) |
| Timed scripts / loops (`timer <sec> <command>`) | ✅ (client) |
| Triggered actions (react to room text) | ✅ (client: `trigger <text> <command>`) |
| Persistent per-character scripts (server-stored) | ✅ aliases; full scripts ⬜ |
| **DR-style scripts** (`.script` prefix, `put`/`move`/`wait`/`waitfor`/`match`/`matchwait`/`goto`/`pause`, `%1..%9` args, `%var`, `if_n`; `.hunt`, `.rest`, `.heal` ship built-in) | ✅ (client-side interpreter, roundtime-aware) |
| Script safety: rate limits, no eval of server state | ✅ |

---

## Pillar 9 — Custom Interface

| Feature | Status |
|---|---|
| Clickable exits | ✅ |
| Command history (arrow keys) | ✅ |
| Themes (dark / parchment / terminal-green) | ✅ |
| Font size & family controls | ✅ (size slider; mono/serif family; line spacing) |
| Custom ANSI color palette | ✅ (text/accent/success/muted pickers) |
| Auto-scroll toggle + pause | ✅ (toggle, scroll-lock pill, End to resume) |
| Mobile-friendly layout | ✅ (bottom-sheet dock, safe-area insets, thumb-reachable exits) |
| Text search within scrollback | ✅ (Ctrl-F or /search, match highlight + navigation) |
| Tab completion from command dictionary | ✅ |
| Status bar parsed from server prompt | ✅ (HP/mana/stamina/RT gauges, circle, silvers, combat flag) |
| **Pinned room panel** (DR room window: `[[Room, Area]]`, description, `Obvious paths`, compass) | ✅ |
| **DR-style window manager** (each pane collapsible + show/hideable, `Windows` menu, persisted) | ✅ |
| **Room contents DR phrasing** (`Here:` creatures/players · `You also see <objects>.`) | ✅ |
| **Combat window with live status line** (target HP/range + `COMBAT · RT ns`) | ✅ |
| **EXP (Thoughts) window** with `N skills learning` count | ✅ |
| **Hands bar** (Hand / Worn / Carried from the `hands` message) | ✅ |
| **EXP + INFO toolbar buttons** (docked exp/info panels) | ✅ |
| **Watch any player live** (`/?spectate=Name` deep-link; room/hands snapshot on subscribe) | ✅ |
| Navigation help in the room panel | ✅ |
| Incoming/outgoing text styles (say/emote/combat) | 🚧 room/notice/error/echo/prompt styled; say/emote/combat lines not channel-tagged on the wire yet |

---

## Pillar 10 — Native Controls (D-pad)

| Feature | Status |
|---|---|
| On-screen D-pad for touch devices | ✅ |
| D-pad navigates exits (n/s/e/w/u) | ✅ |
| Gamepad API support (browser controllers) | ✅ |
| D-pad input for combat actions (attack/cast/retreat) | ✅ (face buttons mapped) |
| Haptics/visual feedback on press | ✅ |

## Pillar 11 — Barbarian Guild Fidelity

The Barbarian is the first guild to get a full fidelity pass against the source
game: inner fire instead of mana, the four ability classes, and the faithful
skill/circle structure (Weapon primary; Survival + Armor secondary; Lore +
Magic tertiary).

| Feature | Status |
|---|---|
| Inner Fire resource (mana type: none) — active combat regen to 100%, passive cap ~30% at circle 1, kill-recharge, IF ranked skill | 🚧 pool live: berserk startup/pulse costs, combat regen to 100%, passive cap grows with inner_fire skill, kill-recharge, ranked skill trains in battle |
| Ability slots at tertiary rate (1 at circle 1, +1 every even circle) | 🚧 slots live (1 + floor(circle/2)); `learn` at the hall, `abilities` list, path prerequisites; forgetting via `ask <leader> about forgetting <ability>` (30-day cooldown) |
| Berserks: short-duration buffs, IF startup + pulsing upkeep, immediate activation, no cap on concurrent | 🚧 Berserk + Wildfire live (startup cost scales down with inner_fire, pulsing upkeep, burns out at 0); full berserk family pending |
| Forms: 90-min buffs, no startup cost, moderate pulsing upkeep, lower passive IF regen cap, max 5 | 🚧 Dragon Form live (startup IF, 1/tick upkeep, duration expiry); form family pending |
| Meditations: large IF startup, no upkeep, max 3, sit/kneel gate, chakrel speeds prep | ✅ Tenacity + Serenity live (large startup, no upkeep, duration expiry); sit/kneel gate and chakrel live |
| Roars + Voice Pool: debilitation-only, separate fast-regen pool, single/AOE/creatures targeting | 🚧 voice pool (40, pulse regen) + Everild's Rage + Screech live; AOE/creatures targeting pending |
| Masteries + Pit Masters: passive 1-slot abilities (Duelist, Juggernaut, Titan, Exemplar…) | ✅ Duelist (+25 passive cap), Juggernaut (10% damage reduction), Titan (+15% HP), Exemplar (+2 stance) live |
| Ability paths (Flame / Horde / Predator): prerequisites = N abilities picked in the same path | 🚧 path prerequisites live in `learn`; fuller per-path trees pending |
| Forgetting abilities: `ask <leader> about forgetting <ability>` (1 per 30 days) | 🚧 ask-based forget live (30-day cooldown, slot refund) |
| Whirlwind: attack everything in weapon range (350 weapon ranks + 31 agi/ref) | 🚧 live (circle 6 gate, IF cost, 30-tick cooldown, hits all engaged); DR rank gates noted |
| War Stomp: shiver the ground, knock opponents off balance | 🚧 live (circle 8 gate, IF cost, staggers all engaged) |
| Choke | 🚧 live (circle 5 gate, single-target grip, halved foe damage for 5 ticks) |
| Dual Load: fire two arrows (201 Bows + 30 agi/ref + Eagle form) | 🚧 live (learnable at circle 7, bow only, 2× ammo per shot, 1.5× damage) |
| Magic Resistance: premier anti-magic edge (Serenity, Dispel, Mage's Lash) | ✅ innate ward scales with Defending; Serenity (purge + magic ward), Dispel (silence foe magic), Mage's Lash (reflect) live |
| Bonus stance points: +1 per 60 Defending ranks | ✅ (stance-points model live) |
| Expertise skill + Barbarian combos: ANALYZE FLAME/ACCURACY/DAMAGE…, ACM Expertise checks | 🚧 `analyze <flame\|accuracy\|damage>` live (trains Expertise, 3-part combo grants an advantage); ACM check cooldown reduction pending |
| Barbarian items: chakrel, warhorns (15-min spawn boost), warpaint, roar helms | ✅ warhorn (spawns beasts, 15-min timer), chakrel (neck slot, −5 meditation cost), warpaint (+15% damage), roar helm (half voice cost, stronger roars) all live |
| Faithful circle requirements: the authentic DR band table (Weapon primary; Survival+Armor secondary; Lore+Magic tertiary) | ✅ (live in the band-table engine) |
| Weaponsmithing affinity: 3 free technique slots in Forging | ✅ modeled: barbarians forge weapons with +3 quality edge |
| Flavor verbs (BELCH, SHAKE HAND) + guild registers/titles | 🚧 belch + barbarian handshake live; guild titles in `score` live; barbarian registers pending |

---

## Pillar 12 — Cross-Guild Fidelity Systems

Shared infrastructure every guild-fidelity pass depends on. All rows below are
for the remaining ten guilds (Bard, Cleric, Empath, Moon Mage, Necromancer,
Paladin, Ranger, Thief, Trader, Warrior Mage) as documented on Elanthipedia.

| Feature | Status |
|---|---|
| Full DR skill set (~83 skills): Empathy, Thanatology, Summoning, Tactics, Scholarship, Performance, Defending, Parry Ability, Offhand Weapon, Melee/Missile Mastery, Inner Fire, Augmentation, Debilitation, Warding, Targeted Magic, Arcana, Sorcery, Outdoorsmanship, Thievery, Athletics, forging/enchanting/alchemy/outfitting/engineering | ✅ list live (83 skills); mastery mechanics live; guild-skill training gates live |
| Mana-type system: Elemental (Bard, Warrior Mage), Holy (Cleric, Paladin), Life (Empath, Ranger), Lunar (Moon Mage, Trader), Necromantic (Necromancer), none (Barbarian, Thief) | 🚧 types + cycles + cambrinth live; attunement-pulse regen nuances pending |
| Spell-slot progressions per guild: primary magic 89–91 slots @150 (Cleric, Moon Mage, Warrior Mage), secondary magic 55–76 (Bard, Empath, Necromancer), tertiary magic 60–61 (Paladin, Ranger, Trader); free magical feats at circle 2 | 🚧 `slots` display live; slot-constrained learning + free feats pending |
| Nth-skill + hard/soft requirement engine: real DR circle tables (hard skills can't count toward Nth skills; mastery skills excluded; Sorcery/Thievery exclusions per guild) | 🚧 engine live with all 11 guild tables (1–10 band, scaled per circle); organic exp sources live for tactics, scholarship, performance, appraisal, outdoorsmanship (foraging), athletics, hunting, scouting, backstab, defending, parry, thievery (steal), locksmithing (strongboxes), empathy, arcana; no outstanding requirement-skill gaps |
| Crafting skills + disciplines: Forging (Weaponsmithing/Armorsmithing/Blacksmithing), Enchanting (Artificing/Binding/Invoking), Alchemy (Remedies/Poison/Cooking), Outfitting (Tailoring/Artistry), Engineering (Tinkering/Shaping/Carving) | 🚧 Alchemy + Forging v1 live (ore → quality steel); full disciplines pending |
| Guild crafting affiliations: free technique slots per guild (e.g. 3× Armorsmithing Paladin, 2× Remedies+1× Cooking Empath) | 🚧 v1 live: Paladin +3 Armorsmithing, Ranger +2 Tailoring, Trader +2 Engineering, Empath +2 Remedies, Barbarian +3 Forging; explicit technique slots pending |
| Stamina + burden pools (prerequisite for War Stomp, berserks, heavy gear) | ✅ stamina pool (Con + Fitness); weapon/armor burden shrinks it and slows recovery; maneuvers/ambush/backstab/whirlwind/stomp/choke/snipe spend wind |
| Magic techniques / analogous patterns / metaspells | 🚧 five techniques live (Aether Efficiency −10% mana, Deep Harness +30%, Resonant Attunement, Meditation +20% regen, Cold Casting +15 safe ceiling), slots by circle; patterns/metaspells pending |

---

## Pillar 13 — Bard Fidelity (Lore primary · Magic+Weapon secondary · Elemental)

| Feature | Status |
|---|---|
| Enchantes: cyclic songs (war / bravery / regen) with mana upkeep, one at a time | ✅ v1 live; Segue + true area effect pending |
| Spell tree: 55 slots to master (76 @150); free feat Raw Channeling at circle 2 | 🚧 c7 signature spell (Crescendo) live; full tree + feat pending |
| Performance-centric circle table (1–10): Performance 4 hard, Tactics 2, Parry Ability 2, 1st/2nd weapon 3/2, 1st armor 2, 1st–3rd lore 3/3/2, 1st–4th magic 3/2/2/1, 1st–4th survival 1/1/1/1 | ✅ (live in the band-table engine) |
| Vocals & instruments: PRACTICE VOICE <range>, percussion/string/wind disciplines, inspirational state | ⬜ |
| Recall, Playact, Showmanship (BLUFF options), SLIP at circle 5, song scrolls, whistling | ⬜ |
| Crafting affiliation: Engineering — Tinkering, Shaping, Carving | ⬜ |

---

## Pillar 14 — Cleric Fidelity (Magic primary · Lore+Weapon secondary · Holy)

| Feature | Status |
|---|---|
| Align: choose one of 39 Immortals — +2 of five magic skills, −3 others | ⬜ |
| Devotion: `pray` rituals deepen it; holy damage scales with devotion; dim devotion costs more mana | ✅ v1 live; ritual sequences pending |
| Communes (gods, favor-spending), Infusion (Attunement-powered matrices), Resurrection ritual | 🚧 communes v1 live (four patrons, patron persists, SACRIFICE renewal); Infusion matrices + Resurrection pending |
| Faithful circle table (1–10): Theurgy 3 hard, Attunement 2 soft, Shield Usage 1 hard, Parry Ability 2, 1st/2nd weapon 3/0, 1st armor 2, 1st–4th lore 2/2/1/0, 1st–5th magic 4/4/3/0/0, 1st–4th survival 1/1/1/1 | ✅ (live in the band-table engine) |
| Holy quests, visions, altar network, undead-fearing presence | ⬜ |
| Crafting affiliation: Enchanting — Artificing, Binding, Invoking | ⬜ |

---

## Pillar 15 — Empath Fidelity (Lore primary · Magic+Survival secondary · Life)

| Feature | Status |
|---|---|
| Take wounds (`mend <player>` — the wound passes into the empath); empathic shock — living kills permanently stain max healing | ✅ v1 live; links live, shift/scars pending (see below) |
| Link, Persistent Link, Unity Link, Manipulate, Shift; Hand of Hodierna at 80 | ⬜ |
| 5 spellbooks (Healing, Protection, Purification, Mental Prep, Life Force); 63 slots to master (76 @150); free feat Injured Casting | 🚧 |
| Faithful circle table (1–10): Empathy 4 hard, Scholarship 3, First Aid 2 hard, Outdoorsmanship 1, 1st–3rd lore 3/2/2, 1st–5th magic 3/2/2/0/0, 1st–3rd survival 1/1/1 | ✅ (live in the band-table engine) |
| Scar tax, TOUCH diagnostics, Khalaen leadership | 🚧 LINK (mutual thread, mend at any distance), TOUCH diagnostics, SCAR tax ledger live; Khalaen pending |
| Crafting affiliation: Alchemy — 2× Remedies, 1× Cooking | 🚧 v1: +2 Remedies live; Cooking pending |

---

## Pillar 16 — Moon Mage Fidelity (Magic primary · Lore+Survival secondary · Lunar)

| Feature | Status |
|---|---|
| Lunar mana gated by the moons (Xibar, Yavash, Katamba); OBSERVE SKY, telescope | 🚧 three moons with real cycles, OBSERVE SKY + TELESCOPE insight, spell costs wax/wane with Xibar (dark +25%, full −10%) |
| 6 spellbooks (Stellar Magic, Perception, Geometry, Projection, Moonlight, Teleologic Sorcery); 89 slots @150; free feats Basic Preparation Recognition + Utility Mastery | 🚧 |
| Prediction: `predict` reads the moons for an omen buff (Astrology/Scholarship exp) | ✅ v1 live (omen buff, Astrology/Scholarship exp); ALIGN/tools/sects/Event Prediction pending |
| Teleport / Moon Gate (25), astral travel via Grazhir shards, 100th-circle quest | 🚧 MOON GATE live (gated on Xibar); astral travel pending |
| Faithful circle table (1–10): Astrology 3 hard, Scholarship 3, 1st–6th magic 4/4/3/2/0/0, 1st–3rd lore 2/2/1, 1st–5th survival 2/2/2/2/0 | ✅ (live in the band-table engine) |
| Crafting affiliation: Enchanting — Artificing, Binding, Invoking | ⬜ |

---

## Pillar 17 — Necromancer Fidelity (Survival primary · Lore+Magic secondary · Necromantic)

| Feature | Status |
|---|---|
| Risen: `animate` corpses into fighting minions (thanatology), dismiss | ✅ v1 live; Call/Creation rituals + states pending |
| States of Being (Unsullied/Forsaken/Redeemed/Lichdom) + Divine/Social Outrage meters, drain-time limits | ⬜ |
| 5 spellbooks + Anabasis (Holy sorcery); 77 slots @150; free feat Alternate Preparation | 🚧 |
| Thanatology rituals (Arise, Butchery, Consume, Dissection, Preserve…), Slip 30–70 (stealth) | 🚧 Arise/Butchery/Consume/Dissection/Preserve live; Slip pending |
| Faithful circle table (1–10): Thanatology 3 hard, Targeted Magic 2 soft, Small Edged 1, 1st–7th survival 4/4/3/3/3/3/2, 1st–5th magic 3/3/2/2/0, 1st–2nd lore 2/2, 1st armor 1 | ✅ (live in the band-table engine) |
| Crafting affiliation: Alchemy 2× Poison + Engineering 1× Carving | ⬜ |

---

## Pillar 18 — Paladin Fidelity (Armor primary · Lore+Weapon secondary · Holy)

| Feature | Status |
|---|---|
| Code of Honor: stealing (−10 soul), striking first (−5); dim soul blocks circling | 🚧 v1 live; quest-to-reinstate pending |
| Soul system: Smite (soul-powered), undead kills + soul, `pray` restores | ✅ v1 live; soulstone/holy weapon/insight pending |
| Armor Proficiency: negate mixing penalties — all four armor types by circle 30 | ⬜ |
| Lead (circle 2), Protect (self/money/party interception), Glyphs (soul/charisma-gated, holy quests) | ⬜ |
| Spellbooks Justice/Inspiration/Sacrifice; 61 slots @150; free feat at circle 2 | ⬜ |
| Faithful circle table (1–10): Conviction 3 hard, Defending 3 hard, Shield Usage 2 soft, Parry Ability 3 hard, Evasion 2 hard, Tactics 1, Scholarship 1, 1st/2nd armor 4/2, 1st/2nd weapon 3/0, 1st–3rd lore 2/1/1, 1st–3rd magic 1/1/1, 1st–4th survival 1/1/1/1 | ✅ (live in the band-table engine) |
| Crafting affiliation: Forging — 3× Armorsmithing | 🚧 v1: +3 Armorsmithing live |

---

## Pillar 19 — Ranger Fidelity (Survival primary · Weapon+Armor secondary · Life)

| Feature | Status |
|---|---|
| Animal companions (wolf bonding on kill, fight alongside) + Beseeches (wind/sun buffs, spurned on overuse) | ✅ v1 live; snipe + slip live, raccoons/horses pending |
| Spellbooks Animal Abilities / Nature Manipulation / Wilderness Survival; 60 slots to master (68 @150) | ⬜ |
| Scouting + TRACK, trailmarkers, bonus stance points (+1/60 ranks defense) | 🚧 scouting exp + TRACK + bonus stance points live; trailmarkers pending |
| Faithful circle table (1–10): Instinct 2 soft, 1st–8th survival 4/4/3/3/3/2/2/2, 1st/2nd weapon 3/1, Parry Ability 2, Defending 1, 1st armor 2, 1st–3rd magic 1/1/1, 1st/2nd lore 1/0 | ✅ (live in the band-table engine) |
| Crafting affiliation: Outfitting 2× Tailoring + Engineering 1× Carving | 🚧 v1: +2 Tailoring live; Carving pending |

---

## Pillar 20 — Thief Fidelity (Survival primary · Weapon+Lore secondary · no mana)

| Feature | Status |
|---|---|
| Khri: concentration-based buffs (9: Elusion, Focus, Nimbleness, Dampen, Strike, Sight, Stealth, Swiftness, Clarity), limited by concentration + Stealth skill | 🚧 v1 live; full khri family + pulse upkeep pending |
| Blindside (surprise attack from hiding), Ambush Moves (Stun, Choke, Ignite, Clout, Screen), Poison Resistance, Mark/Glance | ⬜ |
| Passages (city shortcuts), Contacts (+1/20 circles), Lockpick carving (12+), Slip, Voice throw | ⬜ |
| Urban bonus / Reputation (heat → guild punishment) / Confidence mechanics | ⬜ |
| Faithful circle table (1–10): Thievery 2 soft, Stealth 2 soft, Inner Magic 1, 1st–8th survival 4/4/3/3/3/2/2/1, 1st/2nd weapon 3/1, Parry Ability 1, 1st armor 2, 1st–3rd lore 1/1/1, 1st/2nd magic 1/0 | ✅ (live in the band-table engine) |
| Crafting affiliation: Engineering 2× Carving + Alchemy 1× Poison | ⬜ |

---

## Pillar 21 — Trader Fidelity (Lore primary · Survival+Armor secondary · Lunar)

| Feature | Status |
|---|---|
| Caravan system: RENT caravan, TELL to LEAD/SPOOK, TIE (corpse hauling), RECALL, crates; pack animals | 🚧 CARAVAN RENT/SELL at the guildhall live; TELL LEAD/SPOOK, TIE, RECALL, pack animals pending |
| Commodity trading pits: fluctuating board, buy low / sell high, Trader bonus | ✅ v1 live; SPECULATE (skill-scaled wager) live; market advantages/gem pouches pending |
| Hirelings (attendant/crier/messenger/delivery at 8), Speculate Coin (12), Chaffer (45), tessera remote spell learning | 🚧 porter/scribe hirelings, CHAFFER (+10%), SPECULATE live; attendant/crier/messenger + tessera pending |
| Starlight Aura confound; lunar spellbooks Fabrication / Illusion / Noematics | ⬜ |
| Faithful circle table (1–10): Trading 4 hard, Appraisal 3 hard, 1st weapon 1, 1st/2nd armor 2/1, 1st–3rd lore 3/2/2, 1st–6th survival 3/2/2/1/1/1 | ✅ (live in the band-table engine) |
| Trade Route Justice (ACCUSE), rumors, ledgers, abacus, banquet halls | ⬜ |
| Crafting affiliation: Forging 2× Blacksmithing + Outfitting 1× Artistry | ⬜ |

---

## Pillar 22 — Warrior Mage Fidelity (Magic primary · Weapon+Lore secondary · Elemental)

| Feature | Status |
|---|---|
| Elemental alignment + charge: SUMMON ADMITTANCE/IMPEDANCE/WEAPON; opposing-element penalties before ~500 Summoning | 🚧 element attunement (four boons), SUMMON WEAPON, IMPEDE live; ADMITTANCE + opposing-element penalties pending |
| Aethereal Pathways: aligned paths that aid Targeted Magic, consume charge (half/double cost) | ⬜ |
| Familiars: `summon familiar` at the hall — a combat ally that fights alongside, trains Summoning | ✅ v1 live; talismans/sizes/scrying pending |
| Spellbooks Aether/Air/Earth/Electricity/Fire/Water; 89 slots to master (91 @150); free feats Faster Targeting + Targeted Mastery | ⬜ |
| Faithful circle table (1–10): Summoning 3 hard, Targeted Magic 4, Scholarship 1, Parry Ability 2, Defending 1, 1st–5th magic 4/4/3/0/0, 1st–3rd weapon 3/0/0, 1st–3rd lore 2/2/1, 1st armor 2, 1st–4th survival 1/1/1/1 | ✅ (live in the band-table engine) |
| Crafting affiliation: Enchanting — 3× (Artificing, Binding, Invoking) | ⬜ |

---

## Pillar 23 — World & Hunting Fidelity

| Feature | Status |
|---|---|
| Creature levels + rank-band hunting ladder: creatures teach within documented min/max ranks | 🚧 teaching bands live (`ladder`); province/city/type/skill ladders pending |
| Depth-tiered hunting grounds: difficulty bands gated by room depth inside one area (e.g. Crossing Sewers with 3 tiers of silverfish/thugs) | ⬜ |
| Crossing fidelity: districts and landmarks (High Temple of the Thirteen, Asemath Academy, The Middens, docks, Amusement Pier), inns/taverns (Half Pint, Sand Spit, Tenderfoot…), hangouts | ✅ High Temple, Academy, Middens, Docks, Amusement Pier, Half Pint + Tenderfoot live |
| Task givers: per-guild leader kill tasks (ask <leader> task) + crier pest-control | ✅ kill + delivery/recovery/skinning quests live; street task givers pending |
| Second starting city: Riverhaven (square, market, temple, shared hall row, ferry road to the woods); province travel | ✅ Riverhaven live; province travel pending |
| Loot flags per creature (gems, coin, boxes, skins) driving ladder choice | ✅ flags live on the ladder; gems drop from flagged creatures |
| Specialized ladders: undead, constructs, skinning, locksmith | ⬜ |

---

## Pillar 24 — Skill System Fidelity

| Feature | Status |
|---|---|
| Full skillset structure: Weapon (18: incl. Offhand Weapon, Parry Ability, Melee/Missile Mastery), Armor (6: incl. Defending), Magic (21: incl. Astrology/Summoning/Theurgy), Survival (14), Lore (12), Combat Manipulation (2: Martial Arts, Warding), Defense (2: Fitness, Endurance), Guild (8) | ✅ live |
| Mastery skills (Melee Mastery, Missile Mastery, Primary Magic): boost any same-class skill ranked below them | ✅ |
| 11 guild skills: Empathy, Astrology, Expertise, Scouting, Backstab, Summoning, Bardic Lore, Conviction, Theurgy, Thanatology, Trading (guild-only training) | ✅ trainer-gated + activity sources live (8 in the Guild category; Astrology/Summoning/Theurgy live in the Magic skillset) |
| Hard/soft/restricted requirement semantics in the circle engine | ✅ (hard flags, mastery/Sorcery/Thievery exclusions live) |
| Skill-level messaging tiers (Novice → Practitioner → … → Avatar, 16 tiers with degree modifiers) in `skills` output | ✅ |
| Learning model: field-exp pools (70% now / 30% banks), 30s pulses, mindstate ladder, REXP (2:1, 2× drain) | ✅ pool/pulse timing live (single pulse group; DR's 10-group offset model noted) |
| Rank cap 1750 (DR) vs our anti-grind cap (circle × 4, 40 @ circle 10) | ✅ curve 200 + n exact; cap is an intentional divergence |

---

## Pillar 25 — Magic System Fidelity

| Feature | Status |
|---|---|
| Mana spectrum: Elemental / Holy / Life / Lunar / Necromantic / none with per-type cycles (holy days, seasons, weather, moon phases) | 🚧 six types + deterministic cycles live (lunar 12h, holy 72h, life monthly, elemental diurnal, necromantic amalgam); storms charge mana, fog dims it (weather live) |
| HARNESS + PERCEIVE verbs; attunement pool regenerates in pulses (4/3/2.5% of max per 6s base by guild rate — primary > secondary > tertiary — ×0.5–2.5 attunement scaling) | 🚧 `perceive`/`harness` + held-mana cast bonus live; 6s pulse regen live (guild-rate + attunement-scaled) |
| Cambrinth storage: CHARGE / INVOKE / RELEASE / FOCUS; type-locked (wrong type explodes), 1/8 leakage per 500s, Arcana-gated efficiency (~200 ranks), capacity by item shape | 🚧 cambrinth items + charge/invoke/focus live (type-lock explosion, 500s leakage, Arcana efficiency, capacity by device); multi-device tracking and partial-invoke pending |
| Casting model: PREPARE <spell> # → CAST <target>; TARGET verb; spell slots (primary ~89–92, secondary ~55–77, tertiary ~60–68 @150) | 🚧 `prepare` + `target` + `slots` live; slot-constrained prep pending |
| Spell types: standard, battle, ritual (foci cut mana), cyclic (one at a time, pulsing upkeep), metaspell | ⬜ |
| Analogous patterns: universal spells free circles 1–10, removed at 11 | ⬜ |
| Spell difficulty tiers: intro / basic (~10 ranks) / intermediate (~80) / advanced (~250) / esoteric (~400+) | ✅ tiers map from minCircle (intro 0, basic 10, intermediate 25, advanced 40, esoteric 60 ranks); casting beyond your mastery refuses |
| Backfire risk when over-channeling; sorcerous backlash; SvS contests (attack types vs defenses) for contested spells | 🚧 overchannel backfire live (Primary Magic raises the safe ceiling, damage on fizzle); sorcerous backlash and SvS contests pending |

---

## Pillar 26 — Crafting System Fidelity

| Feature | Status |
|---|---|
| 5 crafting skills × 3 disciplines (~25 techniques each): Forging (Blacksmithing/Armorsmithing/Weaponsmithing), Engineering (Carving/Shaping/Tinkering), Outfitting (Tailoring/Artistry/Jewelry), Alchemy (Remedies/Reactants/Cooking), Enchanting (Artificing/Binding/Invoking) | ⬜ |
| Technique slots: 13 general per skill (rank-gated 25–1200), careers (12) + hobbies (6), 3 guild bonus slots | ⬜ |
| Guild bonus disciplines (e.g. Empath Remedies×2+Cooking, Paladin Armorsmithing×3, Thief Carving×2+Reactants) | ⬜ |
| Workflow: gather materials → craft → quality roll; quality ladder (practically worthless → masterfully-crafted, quality scales damage) | 🚧 v1 live; tools/instructions/ANALYZE + masterful durability pending |
| Work orders + prestige → maker's mark; unmarked items recognized only by their maker | ⬜ |
| Crafted gear strictly superior to store-bought at high skill; magic buffs apply at half strength to crafting checks | ✅ crafted base stats exceed store-bought and the quality ladder (1.3x) scales with skill; half-strength magic buffs on crafting checks pending |

---

## Pillar 27 — PvP & Justice Fidelity

| Feature | Status |
|---|---|
| CHALLENGE dueling: end conditions (blood / blow / pain), refuse + surrender options | 🚧 `duel <name> [blood|blow|pain]`, `surrender`, `decline` live; duel reasons pending |
| PvP stance flagging (OPEN / GUARDED / CLOSED) + forced-open triggers (stealing) | 🚧 `pvp stance` live; steal forces OPEN; further forced-open triggers pending |
| Justice zones: Standard / Clan / Dirge / Hara'jaal / None, each with distinct crime consequences | 🚧 |
| Crime list: thievery; arrest → jail → PLEAD (guilty fine / innocent time + judge's costs on release, heat-scaled) | 🚧 theft justice live; murder/sorcery crimes + provincial debts pending |
| Warrants (RECALL WARRANT), SURRENDER to clear charges, stocks for petty theft, DEPART ITEM vs graverobbing | 🚧 murder warrants live (guards seize on sight, RECALL/SURRENDER/plead, stocks after guilty plea); DEPART ITEM + zone variants pending |
| Policy guardrails: no ganking / spawn-camping / preying on weaker players; REPORT for abuse | ✅ v1 live (assault circle-gap guard, hot-room respawn throttle, REPORT); broader moderation tooling pending |

---

## Circle-10 Requirement Matrix

The live engine (`data/guilds.js` `CIRCLE_TABLES`) implements the **authentic
DragonRealms band tables** for all 11 guilds — named hard/soft skills plus
Nth-of-skillset pools, with the 1–10 band values scaled per circle
(`need = max(1, ceil(band × circle / 10))`, so circle 10 demands exactly the
source-game table). Mastery skills (Defending, Parry Ability, Offhand,
Melee/Missile Mastery, Primary Magic) never count toward Nth pools, and
Sorcery/Thievery exclusions follow each guild's rules.

Verified by the progression simulator: **every guild reaches circle 10**.
Per-guild band rows can be read from the wiki corpus
(`docs/elanthipedia/<Guild>.md`) and the code side by side; per-guild fidelity
passes (Pillars 13–22) will swap in any remaining DR nuance.

---

## Release Stages (milestones)

- **Stage 1 — Foundation ✅** — accounts, slots, chargen, world, movement, client.
- **Stage 2 — Growth Loop ✅** — skills, exp, trainers, circle 1–3, rest, forage/track.
- **Stage 3 — Combat & Magic 🚧** — async combat, stances, PvP duels, maneuvers, ambush, tiered grounds, and fifth spells live; loot scaling live.
- **Stage 4 — Economy & Content 🚧** — tiers, alchemy, dungeon, named rares, auction, durability/repair live; balance pass pending.
- **Stage 5 — TDPs & Advanced Growth 🚧** — TDP economy, titles, and circle-10 capstones live.
- **Stage 6 — Scripting ✅** — aliases, chaining, macro bar, timers, triggers all live.
- **Stage 7 — Custom Interface 🚧** — themes, fonts, and palette live; channel styling pending.
- **Stage 8 — Native Controls 🚧** — D-pad + gamepad + haptics live.
- **Stage 9 — Circle-10 Parity 🚧** — all guilds verified by simulator; capstones live; pacing re-verify (5–16 sim-min) and playtest pending.

- **Stage 10 — Barbarian Fidelity 🚧** — inner fire, four ability classes, paths, masteries, Expertise combos live; the full berserk/form/roar families, warpaint, roar helms, and registers pending (Pillar 11).
- **Stage 11 — Cross-Guild Systems 🚧** — full DR skill set, mana types + cambrinth, spell-slot display, Nth-skill engine, alchemy + forging live; crafting disciplines and slot-constrained learning pending (Pillar 12).
- **Stage 12 — Guild Fidelity 🚧** — every guild has a live fidelity v1 (enchantes, devotion, wound-taking, prediction, risen, soul, companions/beseeches, khri, commodity pits, familiars); deeper per-guild trees pending (Pillars 13–22).
- **Stage 13 — World & Systems Fidelity 🚧** — Riverhaven, hunting ladder, task quests, justice loop live; provinces, depth-tiered grounds, the full crime set, and crafting disciplines pending (Pillars 23–27).

## Next Up (prioritized backlog)

**P1 — growth-loop depth**
- Spell-slot-constrained learning + free magical feats at circle 2 (P12/P25) — `slots` display live; prep gating pending
- Exp: DR's 10-group pulse offsets + retention by skillset rate (P24) — single 30s pulse group live

**P2 — combat & world**
- Loot: circle-scaled coins/gems, tiered strongboxes/ore, rare named loot, and ladder loot flags are live (P5/P23); deeper flags (undead/constructs/skinning/locksmith ladders) pending
- Provinces + more depth-tiered hunting grounds (P23) — Lower Drains + The Blackwater live
- Full crime set (murder, forbidden practices) + provincial debts (P27) — murder warrants live; debts/stocks pending
- Duel reasons live; justice-zone variants + DEPART ITEM pending (P27)

**P3 — breadth & polish**
- Crafting disciplines (Engineering/Outfitting/Enchanting) + technique slots (P26) — shaping/tailoring v1 live; technique slots pending
- Say/emote channel styling in the client (P9) — needs a wire-protocol channel tag
- Masterful-craft durability, work orders + maker's mark (P26)
- Deeper per-guild trees: full khri family, enchante segue + area effects,
  cleric infusion/resurrection, empath shift, astral travel, risen states,
  paladin protect, ranger horses, trader caravans/hirelings, warmage pathways (P13–22)

---

## Tooling

- `node scripts/simulate-progression.mjs [guild]` — headless grind using the real
  combat/training/circle systems (trainers, TDP spending, foraging, hunting,
  hiding, potions, strongboxes). Validates that **every guild can reach circle
  10** and reports pacing, TDPs, silver economy, and per-circle milestones.
- `node scripts/build-skills-doc.mjs` — regenerates `public/SKILLS.html` (the
  full skill reference) from the live game data.
- `npm test` — 82 headless tests including a full HTTP API suite
  (`server/api.js`, enable with `DR_ENABLE_API=1`).

**Sim-validated circle-10 times (simulated active minutes):**

| Guild | Minutes | | Guild | Minutes |
|---|---|---|---|---|
| Moon Mage | 5 | | Ranger | 12 |
| Bard | 8 | | Thief | 12 |
| Cleric | 7 | | Trader | 12 |
| Necromancer | 6 | | Warmage | 7 |
| Barbarian | 16 | | Paladin | 8 |
| | | | Empath | 11 |

All eleven guilds verified to circle 10 through the authentic band-based
requirement tables (named skills + Nth-of-skillset pools). TDP totals at
circle 10 land in the DR-authentic hundreds-to-thousands range (≈900–1030
with the 600-start + circle awards + pool conversions).
