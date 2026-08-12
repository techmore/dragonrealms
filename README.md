# Dragon Realms

A clean-room, text-based MUD inspired by *The Crossing*. Hunt creatures in the
Old Sewers and Wilds, grow your skills through use, advance **circles** at your
guild hall, and find your place among eleven guilds.

## Run it

```bash
npm install
npm start          # -> http://localhost:3000
```

Open `http://localhost:3000` in a browser. You'll be greeted with a terminal;
`register <user> <pass>` to make an account, create a character, and enter the
Crossing.

`npm test` runs the headless suites (auth, chargen, combat, circling, death,
economy, magic — see `test/`). `node scripts/client-corpus.mjs replay
<captured.json>` diffs a scripted session against the server build, and
`node scripts/client-regression.mjs` drives the web client in headless
Chromium.
`DR_ENABLE_API=1 npm start` exposes a secure JSON test API for automated
testing and analysis — see `docs/api.md`.

## Systems

- **Accounts** — scrypt-hashed passwords, per-salt hashing, lockout after 5
  failed logins, 12-hour session tokens, rate-limited input.
- **Races** (11) — each with stat modifiers (Strength, Constitution, Reflex,
  Agility, Charisma, Discipline, Wisdom, Intelligence).
- **Guilds** (11) — Barbarian, Bard, Cleric, Empath, Moon Mage, Necromancer,
  Paladin, Ranger, Thief, Trader, Warrior Mage. Each trains a primary and
  secondary skill set; magic guilds wield a signature spell.
- **Skills** (~45 across Weapon, Armor, Combat Manipulation, Defense, Lore,
  Magic, Survival). Using a skill earns experience toward its next rank; ranks
  cost ~200 exp plus a small per-rank increase, and Int/Wis/Discipline speed
  your learning. Rank-ups feed a hidden TDP pool (200 points → 1 TDP).
- **TDPs** (Training Development Points) — the DR-authentic growth currency:
  every new character starts with 600, circling grants 50 (+circle) below
  circle 10 (100 above), and every rank-up feeds a shared hidden pool that
  converts each 200 points into a TDP. Spend at the **Fane of Training** with
  `train <stat>` twice (DR's designated stat rooms); `tdptrain <skill>`
  spends TDPs on any skill; death shaves the pool.
- **Skills messaging** — `skills` reports the DR 16-tier ladder (Novice →
  Avatar, with degree modifiers); `exp` shows the mindstate ladder.
- **PvP & justice v1** — `duel <name> [blood|blow|pain]` with end conditions,
  `surrender`, and `pvp stance open|guarded|closed` flags. CLOSED characters
  refuse all challenges; OPEN ones can be attacked without consent; stealing
  forces your stance OPEN. `target <creature>` marks a combat focus and
  `slots` shows your guild's spell-slot budget.
- **Trainers** — your guild leader will drill you in your guild's skills for
  silver: `train <skill>`. This is how you prepare the ranks needed to circle.
- **Circles** — to advance a circle, meet your guild's rank requirements
  (primaries ≥ circle, secondaries ≥ circle−2, plus total ranks) and `circle`
  in your guild hall.
- **Spells** — magic guilds learn spells as they rise (up to circle 3 for the
  advanced spell). Kinds include damage, healing, sleep, escape (flee/teleport),
  hunter's mark, and a defensive ward. `spells` lists what you know.
  Magic guilds can also store mana in **cambrinth** devices — `charge`,
  `invoke`, `focus` — sold by Marlene in the market and Sergeant Voss at the
  bank end (type-locked: charging with the wrong mana destroys the device).
- **Combat** — fully async and server-ticked. Commands issued between rounds
  (`attack`, `cast`, `retreat`, `berserk`, `backstab`, and the maneuvers
  `disarm`, `trip`, `shield-bash`). Adopt a **stance** (`aggressive`,
  `defensive`, `guarded`, `balanced`) — stances cost **stance points**
  (Barbarians earn +1 per 60 Defending ranks, Rangers from defense skills).
  Thieves can **hide** and **ambush** from concealment — even mid-fight. The
  **hunting ladder** (`ladder`) shows which creatures teach which rank bands,
  and over-levelled prey teaches little. **PvP duels** let you challenge
  another adventurer in the wilds (`duel`, `accept`, `decline`). Death drops
  a corpse with your gear (search + reclaim) and respawns you at the temple.
- **Capstones** — reaching circle 10 unlocks your guild's signature passive
  (e.g. the Necromancer's Death Pact lifesteal, the Paladin's Aegis of Faith,
  the Trader's Golden Touch sell bonus). Announced on `circle`, shown in `score`.
- **Titles** — every guild has ten rank titles, one per circle (e.g. Paladins
  rise from Squire to Paragon), shown on `circle`, `score`, and `who`.
- **Scripting** — server-side **aliases** (`alias <name> <command>`, `$1..$9`,
  persisted), `;` multi-command chaining, plus client **macro bar**
  (`macro <label> <command>`), **timers** (`timer <sec> <command>`), and
  **triggers** (`trigger <text> <command>` — fires when incoming text matches).
  All client automation stays sandboxed and never touches the server.
- **NPCs** — shopkeepers (buy/sell), a tanner who buys hides and high-tier
  trophies on West Road, banker (deposit/withdraw), healer, guild
  trainers, a town crier, the quartermaster's circle-gated high-tier gear, and
  fourteen creature types across seven hunting grounds to hunt and skin for
  loot.
- **Crafting** — visit Fennel at the Tilted Retort (east of Market Way) and
  `craft` alchemical recipes, or cross to **Bram's Ember Forge** and `forge`
  steel: iron ore drops from trolls, bandits, and the blackwood dead, and
  quality scales with your Forging skill (practically worthless →
  masterfully-crafted, and masterful steel hits harder).
- **Thief khri** — concentration-based buffs (`khri`): Elusion, Focus,
  Nimbleness, Dampen, and Strike. The pool grows with circle and Stealth;
  taking a hit shatters your focus.
- **Guild tasks** — `ask <leader> task` gives guild-scaled kill quests with
  silver and guild-skill rewards (crier pest-control for everyone else).
- **Rested experience** — log out for 2 minutes to bank 1 minute of REXP
  (cap 120); while banked, learning runs at 2×. `rexp` shows your pool.
- **Moon Mage prediction** — `predict` reads the moons and wraps you in an
  omen (+defense) while training Astrology and Scholarship.
- **Warrior Mage familiars** — `summon familiar` at the guildhall binds a
  spirit that fights alongside you and trains Summoning (`familiar`,
  `dismiss familiar`).
- **Empath wound-taking** — `mend <player>` takes another’s wounds into
  yourself (half the healing hits you); killing living creatures leaves a
  permanent empathic stain on your healing.
- **Paladin soul** — `smite` burns soul for radiant damage; slaying the
  undead restores it, `pray` steadies it, and thieving or striking first
  dims it — a dim soul blocks circling.
- **Ranger companions & beseeches** — slay a wolf and its spirit may bond as
  a combat companion; `beseech wind` quickens you, `beseech sun` mends you
  (the wilds grow wary of overuse).
- **Necromancer risen** — `animate <creature>` raises a corpse you have
  felled as a shambling minion that fights alongside (Thanatology).
- **Cleric devotion** — `pray` at the temple deepens devotion (cap 100);
  holy magic burns brighter with it and dims without it (higher mana cost
  below 20). `devotion` reads your faith.
- **Bard enchantes** — `enchant war|bravery|regen` starts a cyclic song
  with mana upkeep: war marches (+damage), bravery wards (+defense), and
  renewal mends you as you fight. One at a time; `enchant off` ends it.
- **Trader commodity pits** — at the Grain Pit (west of Market Way) the
  board fluctuates every hour: `pit` reads prices, buy low and sell high
  (`buy grain 10` / `sell silk 5`); traders earn a bonus on sells.
- **Field exp & pulses** — exp lands 70% immediately and 30% banks in a
  field pool that pulses into ranks every 30s (retention feel, mindstate
  ladder reads the pool); REXP doubles learning.
- **Riverhaven** — a second starting city across the river: its own square,
  market, shrine, and a shared guild-hall row (circle works there too), with
  a ferry road into the Old Woods. Choose your city at character creation.
- **Justice** — theft near a guard can land you in the Town Cells:
  `plead guilty` (fine) or `plead innocent` (serve the sentence).
- **Dungeons & rares** — the Cinder Cavern (circle 5–7) lies under the bandit
  camp; the two-level Blackwood Ruins (circle 7–10) waits east of the Deep
  Wilds, crowned by the Dread Knight. Rare named creatures (Shadowpaw, the
  Bandit Chieftain, the Cinder Drake King) occasionally replace normal spawns
  and drop unique named gear.
- **World** — the Crossing town (guild halls, market, bank, temple, brewery),
  plus the Old Sewers, Old Woods, Whispering Marsh, Deep Wilds, Bandit Camp,
  Cinder Cavern, and Blackwood Ruins.
- **Interface** — the web client is text-first: room prose stays full-width
  and skimmable, with per-channel styling (room/combat/notice/error), a status
  bar parsed from the server prompt (HP/mana gauges, circle, silvers), a
  persistent exits widget, docked info panels (inventory/score/skills/spells),
  scrollback search (Ctrl-F), tab completion, command history, three themes
  plus a custom color palette, font/line-spacing controls, a scripts panel
  for macros/timers/triggers, an on-screen **D-pad** with haptic taps, and
  **gamepad support** for touch and controller play. A roadmap tracker lives
  at `/ROADMAP.html`.
- **Balance tooling** — `node scripts/simulate-progression.mjs [guild]` grinds
  a fresh character to circle 10 with the real systems; all 11 guilds are
  verified (4–12 simulated minutes each). `node scripts/build-skills-doc.mjs`
  regenerates `/SKILLS.html` and `SKILLS.md`; `node scripts/build-roadmap.mjs`
  regenerates the tracker from `data/roadmap.js`. A test-only HTTP API (`server/api.js`,
  `DR_ENABLE_API=1`) drives the game headlessly for analysis.
- **Skill taxonomy** — the full clean-room reference (six skillsets + guild
  skills, sub-skills, governing stats, training sources) lives in
  `SKILLS.md` and the interactive `/SKILLS.html`. New sources this pass:
  `study` at the temple (scholarship), `hide` in the wilds (hiding/stealth),
  `rest` (athletics), potions (first aid), strongboxes (lockpicking), and
  broad magic trickle from casting (arcana/augmentation/debilitation/
  utility/warding magic).

## Commands

```
Movement:  n s e w ne nw se sw u d | go <dir> | look [dir] | look <npc/item>
Combat:    attack <creature> | target <creature> | cast [spell] [target] | retreat/flee | skin <creature>
Maneuvers: disarm <target> | trip <target> | bash <target>  (shield required)
PvP:       duel <player> [blood|blow|pain] | accept/decline <player> | surrender | pvp stance open|guarded|closed  (wilds only)
Stances:   stance aggressive | defensive | guarded | balanced
Magic:     spells | slots | prepare <spell> [pct] | cast | perceive | harness | charge/invoke/focus <cambrinth>
Powers:    berserk | abilities | learn <ability> | form/roar/meditate <ability> | whirlwind | stomp | choke | analyze (Barbarian)
           backstab (Thief) | khri <name> (Thief) | smite (Paladin) | beseech wind|sun (Ranger) | mend <player> (Empath)
           predict (Moon Mage) | summon familiar / familiar / dismiss familiar (Warrior Mage)
           animate <corpse> / risen (Necromancer) | enchante war|bravery|regen / enchant off (Bard) | devotion (Cleric)
Companions: companion | call | release (Ranger)  |  pray (soul, Paladin)
Items:     get/drop <item> | get <item> from corpse | inventory | wear/wield <item> | remove <item> | use/eat/drink <item> | search <corpse>
Death:     die -> temple; gear stays on your corpse (search <corpse>, get <item> from corpse)
Shops:     list | buy <item> [qty] | sell <item> [qty] | deposit/withdraw <silvers> | pit (commodities) | heal
Training:  train <skill> (silvers, at your guild hall) | train <stat> twice (Fane of Training) | circle
TDPs:      tdp | raise <stat> | tdptrain <skill>
Quests:    quest | claim | ask <leader> task
Crafting:  craft <recipe> (Tilted Retort) | forge <recipe> (Ember Forge)
Wilds:     forage | hunt | track | ladder | hide | ambush <creature> | rest | wake | study | perform/sing | appraise <item>
Crime:     steal <npc> | pick <strongbox> | plead guilty|innocent  (jail)
Scripting: alias <name> <command> | use ";" to chain | client: macro / timer / trigger
NPCs:      ask <npc> <topic> (try "ask crier help")
Character: score | skills | exp | alloc <stat> <amount> | rexp
Social:    say | emote | shout | who | time | belch | shakehand
Misc:      help | save | quit | deletechar <name>
```


## Layout

```
data/        game content (races, guilds, skills, items, creatures, npcs, world)
server/      db, auth, player, world runtime, combat engine, commands, session, entry
public/      web terminal client (HTML/CSS/JS)
test/        headless smoke tests
```

Everything persists to `data/store/dragonrealms.db` (SQLite via `node:sqlite`,
no native dependencies).
