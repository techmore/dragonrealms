# Dragon Realms — Roadmap to Circle 10

Full-feature parity for all eleven guilds up to circle 10. This is the living
plan. The matching tracker lives at `public/ROADMAP.html` (served at
`/ROADMAP.html` while the game runs) — features are checked off there as they
ship.

- **Current state:** see the `Status` markers below. ✅ = live, 🚧 = partial, ⬜ = planned.
- **Parity bar:** every guild must be able to reach circle 10 through a fair,
  fun, self-directed loop (hunt → skill up → train → circle → new spells/gear).

---

## Pillar 1 — Characters & Races

| Feature | Status |
|---|---|
| Secure accounts: scrypt hashing, salt, lockout, sessions, rate limiting | ✅ |
| 5 character slots per account | ✅ |
| Character creation (name, race, guild) | ✅ |
| Stat allocation (8 stats, 30-point pool) | ✅ |
| 11 races with stat modifiers & descriptions | ✅ |
| Character deletion (`deletechar`) | ✅ |
| Character select with slot display + "new" flow | ✅ |
| Rerolling / respec of spent stats | ⬜ |

**Parity note:** respec gives players a safety net as the TDP economy lands;
without it, a misallocated build is painful at circle 10.

---

## Pillar 2 — Skills & Experience

| Feature | Status |
|---|---|
| 83 skills across 8 categories (six DR skillsets + Combat Manipulation + Defense) | ✅ |
| EXP earned through use (combat, magic, crafting, world skills) | ✅ |
| Automatic rank-up when exp threshold reached (200 + n per rank, matching DR) | ✅ |
| `skills`, `exp`, `score` reporting (exp shows mindstate ladder) | ✅ |
| Skill-gated world actions: `forage`, `track`, `skin`, `hunt`, `hide`, `study`, `steal`, `pick` | ✅ |
| Balanced exp curve so each guild can reach rank 10 primaries | ✅ sim-validated (all 11 guilds, 10–23 sim-min) |
| **TDPs** — authentic model: 600 starting, 50+circle base on circling, hidden pool (every 200 rank-points → 1 TDP), death can cost pool | ✅ |
| Spend TDPs to permanently raise stats — at the **Fane of Training** (DR: TRAIN twice to confirm) | ✅ |
| Spend TDPs to train any skill (`tdptrain <skill>`) | ✅ |
| Skill caps tied to circle (max rank = circle × 4, anti-grind) | ✅ |
| Mastery skills (Melee/Missile Mastery, Primary Magic) boost lower same-class skills | ✅ |
| Debts/locks to slow runaway grinding (optional, DR-flavored) | ⬜ |
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
| Circles 3–6 pacing balanced | ✅ sim-validated (smooth per-circle milestones) |
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
| Cost curve that stays meaningful to circle 10 | 🚧 needs tuning |
| Trainers as NPCs with `ask` dialogue | ✅ |
| Advanced: train other races'/guilds' secrets for TDPs | ⬜ |

---

## Pillar 5 — Combat (async, immersive)

| Feature | Status |
|---|---|
| Server-ticked async combat | ✅ |
| Weapon speed, initiative, hit/miss/crit narrative | ✅ |
| Armor mitigation, evasion, parry, shield usage | ✅ |
| Ranged weapons consume ammo | ✅ |
| Death/respawn + exp penalty | ✅ |
| Retreat / flee (spell + physical) | ✅ |
| Powers: Berserk (Barbarian), Backstab (Thief) | ✅ |
| 15 creature types across 7 zones (+ named rares) | ✅ |
| Creature auto-engage on aggressive spawns | ✅ |
| **Combat stances** (aggressive / defensive / guarded) with **stance points** (Barbarian +1/60 Defending, Ranger +defense scaling) | ✅ |
| **PvP duels** (challenge/accept, wilds only, concede/defeat) | ✅ |
| **Ambush from hiding** (`hide` → `ambush`; thieves hide mid-fight) | ✅ |
| **Hunting ladder** (creature teaching bands; `ladder` command; over-levelled prey teaches little) | ✅ |
| Creature groups with formations | 🚧 groups partially spawn |
| Mid-tier (circle 5–7) and high-tier (8–10) hunting grounds | ✅ Cinder Cavern + Blackwood Ruins |
| Special maneuvers (disarm, trip, shield-bash) | ✅ |
| Battlefield healing / potion chug timers | ⬜ |
| Debuffs & DoTs from spells | 🚧 Rot slows only |
| Loot tables scale with creature circle | 🚧 flat loot |

**Parity bar:** by circle 10 each guild needs a complete kit — weapon skill,
armor skill, defense skill, and either spells or powers that reward mastery.

---

## Pillar 6 — Magic

| Feature | Status |
|---|---|
| Per-guild spell lists with circle gates (3 spells/guild: c1 / c3 / c5) | ✅ |
| Spell kinds: damage, heal, sleep, flee, teleport, mark, ward, drain, buff | ✅ |
| Mana economy: 6 mana types + cycles, perceive/harness, held mana, cambrinth | ✅ (see Pillar 25) |
| `spells` command + `prepare <spell> [pct]` overchanneling | ✅ |
| Fourth spell per guild at circle 8 | ✅ (all 8 magic guilds: c1/c3/c5/c8) |
| Spell research / scroll learning (optional) | ⬜ |
| Spell damage scales with skill & circle to circle 10 | ✅ |

---

## Pillar 7 — World & Economy

| Feature | Status |
|---|---|
| Town: square, market, bank, temple, brewery, guild district, east road | ✅ |
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
| Auction / player trading (optional) | ⬜ |
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
| Status bar parsed from server prompt | ✅ (HP/mana gauges, circle, silvers, combat flag) |
| Incoming/outgoing text styles (say/emote/combat) | 🚧 combat styled only; say/emote pending |

---

## Pillar 10 — Native Controls (D-pad)

| Feature | Status |
|---|---|
| On-screen D-pad for touch devices | ✅ |
| D-pad navigates exits (n/s/e/w/u) | ✅ |
| Gamepad API support (browser controllers) | ✅ |
| D-pad input for combat actions (attack/cast/retreat) | ✅ (face buttons mapped) |
| Haptics/visual feedback on press | ⬜ |

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
| Meditations: large IF startup, no upkeep, max 3, sit/kneel gate, chakrel speeds prep | 🚧 Tenacity Meditation live (large startup, no upkeep, duration expiry); sit/kneel gate and chakrel pending |
| Roars + Voice Pool: debilitation-only, separate fast-regen pool, single/AOE/creatures targeting | 🚧 voice pool (40, pulse regen) + Everild's Rage + Screech live; AOE/creatures targeting pending |
| Masteries + Pit Masters: passive 1-slot abilities (Duelist, Juggernaut, Titan, Exemplar…) | 🚧 Duelist (passive cap +25) + Juggernaut (10% damage reduction) live; Pit Master NPC and further masteries pending |
| Ability paths (Flame / Horde / Predator): prerequisites = N abilities picked in the same path | 🚧 path prerequisites live in `learn`; fuller per-path trees pending |
| Forgetting abilities: `ask <leader> about forgetting <ability>` (1 per 30 days) | 🚧 ask-based forget live (30-day cooldown, slot refund) |
| Whirlwind: attack everything in weapon range (350 weapon ranks + 31 agi/ref) | 🚧 live (circle 6 gate, IF cost, 30-tick cooldown, hits all engaged); DR rank gates noted |
| War Stomp: shiver the ground, knock opponents off balance | 🚧 live (circle 8 gate, IF cost, staggers all engaged) |
| Choke | 🚧 live (circle 5 gate, single-target grip, halved foe damage for 5 ticks) |
| Dual Load: fire two arrows (201 Bows + 30 agi/ref + Eagle form) | 🚧 live (learnable at circle 7, bow only, 2× ammo per shot, 1.5× damage) |
| Magic Resistance: premier anti-magic edge (Serenity, Dispel, Mage's Lash) | 🚧 innate −40% damage from magic-weapon creatures; Serenity/Dispel/Mage's Lash abilities pending |
| Bonus stance points: +1 per 60 Defending ranks | ⬜ (waits on a stance-points model) |
| Expertise skill + Barbarian combos: ANALYZE FLAME/ACCURACY/DAMAGE…, ACM Expertise checks | 🚧 `analyze <flame\|accuracy\|damage>` live (trains Expertise, 3-part combo grants an advantage); ACM check cooldown reduction pending |
| Barbarian items: chakrel, warhorns (15-min spawn boost), warpaint, roar helms | 🚧 warhorn live (spawns beasts, 15-min timer), chakrel live (neck slot, −5 meditation cost); warpaint and roar helms pending |
| Faithful circle requirements: Weapon primary / Survival+Armor secondary / Lore+Magic tertiary (real DR table: 4 weapons, 2 armors, Evasion, 4 survival, Tactics + 2nd lore, Inner Fire + 2 supernatural) | ⬜ |
| Weaponsmithing affinity: 3 free technique slots in Forging | ⬜ |
| Flavor verbs (BELCH, SHAKE HAND) + guild registers/titles | 🚧 belch + barbarian handshake live; registers/titles in `score` pending |

---

## Pillar 12 — Cross-Guild Fidelity Systems

Shared infrastructure every guild-fidelity pass depends on. All rows below are
for the remaining ten guilds (Bard, Cleric, Empath, Moon Mage, Necromancer,
Paladin, Ranger, Thief, Trader, Warrior Mage) as documented on Elanthipedia.

| Feature | Status |
|---|---|
| Full DR skill set (~83 skills): Empathy, Thanatology, Summoning, Tactics, Scholarship, Performance, Defending, Parry Ability, Offhand Weapon, Melee/Missile Mastery, Inner Fire, Augmentation, Debilitation, Warding, Targeted Magic, Arcana, Sorcery, Outdoorsmanship, Thievery, Athletics, forging/enchanting/alchemy/outfitting/engineering | ✅ list live (83 skills); mastery mechanics live; guild-skill training gates live |
| Mana-type system: Elemental (Bard, Warrior Mage), Holy (Cleric, Paladin), Life (Empath, Ranger), Lunar (Moon Mage, Trader), Necromantic (Necromancer), none (Barbarian, Thief) | 🚧 types + ambient cycles live (`perceive`, `harness`, held mana empowers casts); attunement-pulse regen and cambrinth pending |
| Spell-slot progressions per guild: primary magic 89–91 slots @150 (Cleric, Moon Mage, Warrior Mage), secondary magic 55–76 (Bard, Empath, Necromancer), tertiary magic 60–61 (Paladin, Ranger, Trader); free magical feats at circle 2 | 🚧 `slots` display live; slot-constrained learning + free feats pending |
| Nth-skill + hard/soft requirement engine: real DR circle tables (hard skills can't count toward Nth skills; mastery skills excluded; Sorcery/Thievery exclusions per guild) | 🚧 engine live with all 11 guild tables (1–10 band, scaled per circle); organic exp sources live for tactics, scholarship, performance, appraisal, outdoorsmanship (foraging), athletics, hunting, scouting, backstab, defending, parry, thievery (steal), locksmithing (strongboxes), empathy, arcana; no outstanding requirement-skill gaps |
| Crafting skills + disciplines: Forging (Weaponsmithing/Armorsmithing/Blacksmithing), Enchanting (Artificing/Binding/Invoking), Alchemy (Remedies/Poison/Cooking), Outfitting (Tailoring/Artistry), Engineering (Tinkering/Shaping/Carving) | 🚧 Alchemy + Forging v1 live (ore → quality steel); full disciplines pending |
| Guild crafting affiliations: free technique slots per guild (e.g. 3× Armorsmithing Paladin, 2× Remedies+1× Cooking Empath) | ⬜ |
| Stamina + burden pools (prerequisite for War Stomp, berserks, heavy gear) | ⬜ |
| Magic techniques / analogous patterns / metaspells | ⬜ |

---

## Pillar 13 — Bard Fidelity (Lore primary · Magic+Weapon secondary · Elemental)

| Feature | Status |
|---|---|
| Enchantes: cyclic area-affecting songs + Segue (swap cyclics without prep) | ⬜ |
| Spell tree: 55 slots to master (76 @150); free feat Raw Channeling at circle 2 | ⬜ |
| Performance-centric circle table (1–10): Performance 4 hard, Tactics 2, Parry Ability 2, 1st/2nd weapon 3/2, 1st armor 2, 1st–3rd lore 3/3/2, 1st–4th magic 3/2/2/1, 1st–4th survival 1/1/1/1 | ⬜ |
| Vocals & instruments: PRACTICE VOICE <range>, percussion/string/wind disciplines, inspirational state | ⬜ |
| Recall, Playact, Showmanship (BLUFF options), SLIP at circle 5, song scrolls, whistling | ⬜ |
| Crafting affiliation: Engineering — Tinkering, Shaping, Carving | ⬜ |

---

## Pillar 14 — Cleric Fidelity (Magic primary · Lore+Weapon secondary · Holy)

| Feature | Status |
|---|---|
| Align: choose one of 39 Immortals — +2 of five magic skills, −3 others | ⬜ |
| Devotion: ritual sequences earn divine favor; high favor boosts magic, neglect fades abilities | ⬜ |
| Communes (gods, favor-spending), Infusion (Attunement-powered matrices), Resurrection ritual | ⬜ |
| Faithful circle table (1–10): Theurgy 3 hard, Attunement 2 soft, Shield Usage 1 hard, Parry Ability 2, 1st/2nd weapon 3/0, 1st armor 2, 1st–4th lore 2/2/1/0, 1st–5th magic 4/4/3/0/0, 1st–4th survival 1/1/1/1 | ⬜ |
| Holy quests, visions, altar network, undead-fearing presence | ⬜ |
| Crafting affiliation: Enchanting — Artificing, Binding, Invoking | ⬜ |

---

## Pillar 15 — Empath Fidelity (Lore primary · Magic+Survival secondary · Life)

| Feature | Status |
|---|---|
| Touch / Transfer / Take wounds (external c1, internal c6, scars c7/8, poison c40, disease c80); empathic shock — killing living creatures can cost healing permanently | ⬜ |
| Link, Persistent Link, Unity Link, Manipulate, Shift; Hand of Hodierna at 80 | ⬜ |
| 5 spellbooks (Healing, Protection, Purification, Mental Prep, Life Force); 63 slots to master (76 @150); free feat Injured Casting | ⬜ |
| Faithful circle table (1–10): Empathy 4 hard, Scholarship 3, First Aid 2 hard, Outdoorsmanship 1, 1st–3rd lore 3/2/2, 1st–5th magic 3/2/2/0/0, 1st–3rd survival 1/1/1 | ⬜ |
| Scar tax, TOUCH diagnostics, Khalaen leadership | ⬜ |
| Crafting affiliation: Alchemy — 2× Remedies, 1× Cooking | ⬜ |

---

## Pillar 16 — Moon Mage Fidelity (Magic primary · Lore+Survival secondary · Lunar)

| Feature | Status |
|---|---|
| Lunar mana gated by the moons (Xibar, Yavash, Katamba); OBSERVE SKY, telescope | ⬜ |
| 6 spellbooks (Stellar Magic, Perception, Geometry, Projection, Moonlight, Teleologic Sorcery); 89 slots @150; free feats Basic Preparation Recognition + Utility Mastery | ⬜ |
| Prediction: ALIGN + PREDICT FUTURE, divining tools per sect, Event Prediction at 10 | ⬜ |
| Teleport / Moon Gate (25), astral travel via Grazhir shards, 100th-circle quest | ⬜ |
| Faithful circle table (1–10): Astrology 3 hard, Scholarship 3, 1st–6th magic 4/4/3/2/0/0, 1st–3rd lore 2/2/1, 1st–5th survival 2/2/2/2/0 | ⬜ |
| Crafting affiliation: Enchanting — Artificing, Binding, Invoking | ⬜ |

---

## Pillar 17 — Necromancer Fidelity (Survival primary · Lore+Magic secondary · Necromantic)

| Feature | Status |
|---|---|
| Risen: undead minions — temporary via Call from Beyond, permanent via Creation ritual | ⬜ |
| States of Being (Unsullied/Forsaken/Redeemed/Lichdom) + Divine/Social Outrage meters, drain-time limits | ⬜ |
| 5 spellbooks + Anabasis (Holy sorcery); 77 slots @150; free feat Alternate Preparation | ⬜ |
| Thanatology rituals (Arise, Butchery, Consume, Dissection, Preserve…), Slip 30–70 (stealth) | ⬜ |
| Faithful circle table (1–10): Thanatology 3 hard, Targeted Magic 2 soft, Small Edged 1, 1st–7th survival 4/4/3/3/3/3/2, 1st–5th magic 3/3/2/2/0, 1st–2nd lore 2/2, 1st armor 1 | ⬜ |
| Crafting affiliation: Alchemy 2× Poison + Engineering 1× Carving | ⬜ |

---

## Pillar 18 — Paladin Fidelity (Armor primary · Lore+Weapon secondary · Holy)

| Feature | Status |
|---|---|
| Code of Honor: stealing/cowardice/striking first destroys guild standing (soul penalty + quest to reinstate) | ⬜ |
| Soul system + soulstone; Smite (soul-powered strike); Holy Weapon vs. undead; Sacred Insight | ⬜ |
| Armor Proficiency: negate mixing penalties — all four armor types by circle 30 | ⬜ |
| Lead (circle 2), Protect (self/money/party interception), Glyphs (soul/charisma-gated, holy quests) | ⬜ |
| Spellbooks Justice/Inspiration/Sacrifice; 61 slots @150; free feat at circle 2 | ⬜ |
| Faithful circle table (1–10): Conviction 3 hard, Defending 3 hard, Shield Usage 2 soft, Parry Ability 3 hard, Evasion 2 hard, Tactics 1, Scholarship 1, 1st/2nd armor 4/2, 1st/2nd weapon 3/0, 1st–3rd lore 2/1/1, 1st–3rd magic 1/1/1, 1st–4th survival 1/1/1/1 | ⬜ |
| Crafting affiliation: Forging — 3× Armorsmithing | ⬜ |

---

## Pillar 19 — Ranger Fidelity (Survival primary · Weapon+Armor secondary · Life)

| Feature | Status |
|---|---|
| Beseeches: soul-pool rituals that coax nature (wind, sun) — spurned on overuse | ⬜ |
| Animal companions (wolves, raccoons), horse wrangling (60+), Snipe (40+), Dual Load, Slip, Sign | ⬜ |
| Spellbooks Animal Abilities / Nature Manipulation / Wilderness Survival; 60 slots to master (68 @150) | ⬜ |
| Scouting + TRACK, trailmarkers, bonus stance points (+1/60 ranks defense) | ⬜ |
| Faithful circle table (1–10): Instinct 2 soft, 1st–8th survival 4/4/3/3/3/2/2/2, 1st/2nd weapon 3/1, Parry Ability 2, Defending 1, 1st armor 2, 1st–3rd magic 1/1/1, 1st/2nd lore 1/0 | ⬜ |
| Crafting affiliation: Outfitting 2× Tailoring + Engineering 1× Carving | ⬜ |

---

## Pillar 20 — Thief Fidelity (Survival primary · Weapon+Lore secondary · no mana)

| Feature | Status |
|---|---|
| Khri: concentration-based buffs (Elusion, Focus, Strike, Nimbleness, Dampen), limited by concentration + Stealth skill | 🚧 v1 live; full khri family + pulse upkeep pending |
| Blindside (surprise attack from hiding), Ambush Moves (Stun, Choke, Ignite, Clout, Screen), Poison Resistance, Mark/Glance | ⬜ |
| Passages (city shortcuts), Contacts (+1/20 circles), Lockpick carving (12+), Slip, Voice throw | ⬜ |
| Urban bonus / Reputation (heat → guild punishment) / Confidence mechanics | ⬜ |
| Faithful circle table (1–10): Thievery 2 soft, Stealth 2 soft, Inner Magic 1, 1st–8th survival 4/4/3/3/3/2/2/1, 1st/2nd weapon 3/1, Parry Ability 1, 1st armor 2, 1st–3rd lore 1/1/1, 1st/2nd magic 1/0 | ⬜ |
| Crafting affiliation: Engineering 2× Carving + Alchemy 1× Poison | ⬜ |

---

## Pillar 21 — Trader Fidelity (Lore primary · Survival+Armor secondary · Lunar)

| Feature | Status |
|---|---|
| Caravan system: RENT caravan, TELL to LEAD/SPOOK, TIE (corpse hauling), RECALL, crates; pack animals | ⬜ |
| Commodity trading pits (speculate on price fluctuations), Market Advantages (better buy/sell, Charisma boosts), gem pouches, fur crates, Trader Markets (20), Auction Halls (30) | ⬜ |
| Hirelings (attendant/crier/messenger/delivery at 8), Speculate Coin (12), Chaffer (45), tessera remote spell learning | ⬜ |
| Starlight Aura confound; lunar spellbooks Fabrication / Illusion / Noematics | ⬜ |
| Faithful circle table (1–10): Trading 4 hard, Appraisal 3 hard, 1st weapon 1, 1st/2nd armor 2/1, 1st–3rd lore 3/2/2, 1st–6th survival 3/2/2/1/1/1 | ⬜ |
| Trade Route Justice (ACCUSE), rumors, ledgers, abacus, banquet halls | ⬜ |
| Crafting affiliation: Forging 2× Blacksmithing + Outfitting 1× Artistry | ⬜ |

---

## Pillar 22 — Warrior Mage Fidelity (Magic primary · Weapon+Lore secondary · Elemental)

| Feature | Status |
|---|---|
| Elemental alignment + charge: SUMMON ADMITTANCE/IMPEDANCE/WEAPON; opposing-element penalties before ~500 Summoning | ⬜ |
| Aethereal Pathways: aligned paths that aid Targeted Magic, consume charge (half/double cost) | ⬜ |
| Familiars: talisman-summoned aether spirits (Small/Large/Dark/Fir), see through their eyes, move/pick-up items | ⬜ |
| Spellbooks Aether/Air/Earth/Electricity/Fire/Water; 89 slots to master (91 @150); free feats Faster Targeting + Targeted Mastery | ⬜ |
| Faithful circle table (1–10): Summoning 3 hard, Targeted Magic 4, Scholarship 1, Parry Ability 2, Defending 1, 1st–5th magic 4/4/3/0/0, 1st–3rd weapon 3/0/0, 1st–3rd lore 2/2/1, 1st armor 2, 1st–4th survival 1/1/1/1 | ⬜ |
| Crafting affiliation: Enchanting — 3× (Artificing, Binding, Invoking) | ⬜ |

---

## Pillar 23 — World & Hunting Fidelity

| Feature | Status |
|---|---|
| Creature levels + rank-band hunting ladder: creatures teach within documented min/max ranks; ladders by province, city, creature type and skill | ⬜ |
| Depth-tiered hunting grounds: difficulty bands gated by room depth inside one area (e.g. Crossing Sewers with 3 tiers of silverfish/thugs) | ⬜ |
| Crossing fidelity: districts and landmarks (High Temple of the Thirteen, Asemath Academy, The Middens, docks, Amusement Pier), inns/taverns (Half Pint, Sand Spit, Tenderfoot…), hangouts | ⬜ |
| Task givers: per-guild leader kill tasks (ask <leader> task) + crier pest-control | 🚧 kill tasks live; delivery/recovery/skins + street task givers pending |
| Second starting city: Riverhaven; province travel (Zoluren, Therengia, Ilithi, Qi'Reshalia, Forfedhdar) | ⬜ |
| Loot flags per creature (gems, coin, boxes, skins) driving ladder choice | ⬜ |
| Specialized ladders: undead, constructs, skinning, locksmith | ⬜ |

---

## Pillar 24 — Skill System Fidelity

| Feature | Status |
|---|---|
| Full skillset structure: Weapon (19: incl. Offhand Weapon, Parry Ability, Melee/Missile Mastery, Expertise), Armor (7: incl. Defending, Conviction), Magic (8 + guild), Survival (10 + guild), Lore (9 + guild) | 🚧 skills live; mastery skill mechanics pending |
| Mastery skills (Melee Mastery, Missile Mastery, Primary Magic): boost any same-class skill ranked below them | ⬜ |
| 11 guild skills: Empathy, Astrology, Expertise, Scouting, Backstab, Summoning, Bardic Lore, Conviction, Theurgy, Thanatology, Trading (guild-only training) | 🚧 in skill list; guild-only training gates pending |
| Hard/soft/restricted requirement semantics in the circle engine | ⬜ |
| Skill-level messaging tiers (Novice → Practitioner → … → Avatar, 16 tiers with degree modifiers) in `skills` output | ✅ |
| Learning model: field exp → pools → pulses (10 groups, 200s); mindstate ladder (clear → … → mind lock); retention by skillset rate (primary 40–60 min, tertiary 70–100) | ⬜ |
| Rank cap 1750 (DR) vs our anti-grind cap (circle × 4, 40 @ circle 10) | ✅ curve 200 + n exact; cap is an intentional divergence |

---

## Pillar 25 — Magic System Fidelity

| Feature | Status |
|---|---|
| Mana spectrum: Divinity / Holy / Life / Elemental / Lunar / Gravity with per-type cycles (holy days, seasons, weather, moon phases) | 🚧 six types + deterministic cycles live (lunar 12h, holy 72h, life monthly, elemental diurnal, necromantic amalgam); weather-based bonuses pending |
| HARNESS + PERCEIVE verbs; attunement pool regenerates in pulses (2.5% per 6s), regen speed by guild rate (primary > secondary > tertiary) | 🚧 `perceive`/`harness` + held-mana cast bonus live; 6s pulse regen live (guild-rate + attunement-scaled) |
| Cambrinth storage: CHARGE / INVOKE / RELEASE / FOCUS; type-locked (wrong type explodes), 1/8 leakage per 500s, Arcana-gated efficiency (~200 ranks), capacity by item shape | 🚧 cambrinth items + charge/invoke/focus live (type-lock explosion, 500s leakage, Arcana efficiency, capacity by device); multi-device tracking and partial-invoke pending |
| Casting model: PREPARE <spell> # → CAST <target>; TARGET verb; spell slots (primary ~89–92, secondary ~55–77, tertiary ~60–68 @150) | 🚧 `prepare` + `target` + `slots` live; slot-constrained prep pending |
| Spell types: standard, battle, ritual (foci cut mana), cyclic (one at a time, pulsing upkeep), metaspell | ⬜ |
| Analogous patterns: universal spells free circles 1–10, removed at 11 | ⬜ |
| Spell difficulty tiers: intro / basic (~10 ranks) / intermediate (~80) / advanced (~250) / esoteric (~400+) | ⬜ |
| Backfire risk when over-channeling; sorcerous backlash; SvS contests (attack types vs defenses) for contested spells | 🚧 overchannel backfire live (Primary Magic raises the safe ceiling, damage on fizzle); sorcerous backlash and SvS contests pending |

---

## Pillar 26 — Crafting System Fidelity

| Feature | Status |
|---|---|
| 5 crafting skills × 3 disciplines (~25 techniques each): Forging (Blacksmithing/Armorsmithing/Weaponsmithing), Engineering (Carving/Shaping/Tinkering), Outfitting (Tailoring/Artistry/Jewelry), Alchemy (Remedies/Reactants/Cooking), Enchanting (Artificing/Binding/Invoking) | ⬜ |
| Technique slots: 13 general per skill (rank-gated 25–1200), careers (12) + hobbies (6), 3 guild bonus slots | ⬜ |
| Guild bonus disciplines (e.g. Empath Remedies×2+Cooking, Paladin Armorsmithing×3, Thief Carving×2+Reactants) | ⬜ |
| Workflow: gather materials → craft → quality roll (practically worthless → masterfully-crafted, quality scales damage) | 🚧 v1 live; tools/instructions/ANALYZE pending |
| Quality ladder: practically worthless → mediocre → about average → well-crafted → masterfully-crafted (99); durability bonus at masterful | ⬜ |
| Work orders + prestige → maker's mark; unmarked items recognized only by their maker | ⬜ |
| Crafted gear strictly superior to store-bought at high skill; magic buffs apply at half strength to crafting checks | ⬜ |

---

## Pillar 27 — PvP & Justice Fidelity

| Feature | Status |
|---|---|
| CHALLENGE dueling: end conditions (blood / blow / pain), refuse + surrender options | 🚧 `duel <name> [blood|blow|pain]`, `surrender`, `decline` live; duel reasons pending |
| PvP stance flagging (OPEN / GUARDED / CLOSED) + forced-open triggers (stealing) | 🚧 `pvp stance` live; steal forces OPEN; further forced-open triggers pending |
| Justice zones: Standard / Clan / Dirge / Hara'jaal / None, each with distinct crime consequences | ⬜ |
| Crime list: murder, thievery, disturbing the peace, forbidden practices (sorcery/necromancy), aiding and abetting; arrest → jail → judge → PLEAD → provincial debts | ⬜ |
| Warrants (RECALL WARRANT), SURRENDER to clear charges, stocks for petty theft, DEPART ITEM vs graverobbing | ⬜ |
| Policy guardrails: no ganking / spawn-camping / preying on weaker players; REPORT for abuse | ⬜ |

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
- **Stage 3 — Combat & Magic 🚧** — async combat, stances, PvP duels, maneuvers, and tiered grounds live; fourth spells + loot scaling pending.
- **Stage 4 — Economy & Content 🚧** — tiers, alchemy, dungeon, named rares live; balance pass pending.
- **Stage 5 — TDPs & Advanced Growth 🚧** — TDP economy, titles, and circle-10 capstones live.
- **Stage 6 — Scripting ✅** — aliases, chaining, macro bar, timers, triggers all live.
- **Stage 7 — Custom Interface 🚧** — themes, fonts, and palette live; channel styling pending.
- **Stage 8 — Native Controls 🚧** — D-pad + gamepad live; haptics pending.
- **Stage 9 — Circle-10 Parity 🚧** — all guilds verified by simulator; capstones live; playtest pending.

## Tooling

- `node scripts/simulate-progression.mjs [guild]` — headless grind using the real
  combat/training/circle systems (trainers, TDP spending, foraging, hunting,
  hiding, potions, strongboxes). Validates that **every guild can reach circle
  10** and reports pacing, TDPs, silver economy, and per-circle milestones.
- `node scripts/build-skills-doc.mjs` — regenerates `public/SKILLS.html` (the
  full skill reference) from the live game data.
- `npm test` — 55 headless tests including a full HTTP API suite
  (`server/api.js`, enable with `DR_ENABLE_API=1`).

**Sim-validated circle-10 times (simulated active minutes):**

| Guild | Minutes | | Guild | Minutes |
|---|---|---|---|---|
| Moon Mage | 4 | | Ranger | 11 |
| Bard | 4 | | Thief | 11 |
| Cleric | 4 | | Trader | 10 |
| Necromancer | 3 | | Warmage | 4 |
| Barbarian | 8 | | Paladin | 4 |
| | | | Empath | 9 |

All eleven guilds verified to circle 10 through the authentic band-based
requirement tables (named skills + Nth-of-skillset pools). TDP totals at
circle 10 land in the DR-authentic hundreds-to-thousands range (≈900–1040
with the 600-start + circle awards + pool conversions).
- **Stage 10 — Barbarian Fidelity ⬜** — inner fire, four ability classes, paths, masteries, Expertise combos, faithful circle table (see Pillar 11).
- **Stage 11 — Cross-Guild Systems ⬜** — full DR skill set, mana types, spell-slot progressions, Nth-skill requirement engine, crafting disciplines (see Pillar 12).
- **Stage 12 — Guild Fidelity ⬜** — faithful passes for all remaining guilds (see Pillars 13–22).
- **Stage 13 — World & Systems Fidelity ⬜** — hunting ladders, Crossing/Riverhaven depth, skill-system structure, magic mechanics, crafting, PvP & justice (see Pillars 23–27).
