# AGENTS.md — Dragon Realms

Text-based MUD (multi-user dungeon) inspired by DragonRealms. Node 22+ ESM,
zero runtime dependencies, SQLite via `node:sqlite`. Web client is vanilla
HTML/CSS/JS (no build step, no frameworks).

## Layout

```
data/                  game content (races, guilds, skills, items, creatures,
                       npcs, world, grid, map-facts, khri, abilities, forging,
                       commodities, mana)
server/
  index.js             boot: static handler + /api branch + WS attach + shutdown
  static.js            static file serving (unit-tested)
  api.js               HTTP test API (DR_ENABLE_API=1), auth-scoped
  session.js           WS lifecycle: auth, routing, rate limit
  chargen.js           char creation, stat alloc, world entry
  auth.js              scrypt accounts, sessions, lockout
  db.js                SQLite schema + migrations
  player.js            player model: stats, skills/exp pools, items, equipment,
                       TDPs, aliases, stances
  commands/            command registry (see below)
  combat.js            Combat (per-fight state machine)
  combat-manager.js    combat lifecycle, duels, death/flee, ticker
  game.js              Game: runtime state + facade delegating to:
  economy.js           shops, bank, healer, commodity pits
  wilds.js             forage/track/hunt/ladder/warhorn/rest/lookDirection
  quests.js            crier + guild-leader quests
  status.js            prompt line, guild trainer, who
public/
  index.html + css/style.css
  js/                  client ES modules: main (boot+routing), net, terminal,
                       input, panels, status, automation, settings, welcome,
                       state, util
test/
  helpers.mjs          shared scaffolding: temp DB, Game setup, fakeWs
  character.test.mjs   auth, chargen, circles, TDPs, training, justice, khri
  combat.test.mjs      attacks, duels, maneuvers, death, barbarian/thief arts
  magic.test.mjs       spells, mana, cambrinth, guild abilities (mend/smite/...)
  economy.test.mjs     shops, bank, healer, forging, crafting, commodity pits
  world.test.mjs       movement, wilds, quests, social, aliases, NPCs
  api.test.mjs         HTTP API tests (includes a deliberate ~32s real-combat wait)
  static.test.mjs      static handler tests
scripts/
  client-corpus.mjs    capture/replay/diff harness for behavior preservation
  client-regression.mjs 18-check CDP suite (headless Chromium)
  simulate-progression.mjs  headless grind to circle 10 per guild
  live-sim.mjs          progression sims over the REAL wire protocol (WS
                        sessions, no bot flag) — indistinguishable players
                        that exercise auth/chargen/dispatch; watchable live
  race-guild-sweep.mjs  race × guild fidelity sweep: DR-script-driven agents
                        (scripts/lib/wire-session.mjs + the client script
                        engine) play each guild via generated per-account
                        script libraries (hunt/circle/mega with `putrun`),
                        exercising guild signature abilities and writing
                        fidelity results to public/live/fidelity-*.log.
                        Each sweep gets a run-id suffix (char names like
                        SwTraderHuman-kcrk) so concurrent sweeps never
                        collide; every run appends a row to the sweeps
                        SQLite history (scripts/lib/sweeps-db.mjs →
                        public/live/sweeps.db, a sim artifact — not game
                        state), and `--report` reads that DB
  lib/wire-session.mjs  shared wire-level session for test agents (auth,
                        chargen, observed-exit BFS navigation, vitals)
data/guild-scripts.js per-guild scripting capabilities (fight verbs, signature
                        abilities, TDP curricula, fidelity check regexes,
                        curated race matrix)
```

## Command architecture

`server/commands/index.js` is the dispatcher: `;` chaining, alias expansion,
movement (`go`/directions), then a lookup into a registry merged from six
domain modules — `combat.js`, `magic.js`, `items.js`, `shops.js`,
`character.js`, `world.js` — plus shared `util.js` and `dirs.js`.

Every handler has the signature `(ctx)` where
`ctx = { game, p, cmd, arg1, arg2, rest, args, say, emit }`:
`say(msg)` sends a `msg`-type line; `emit(msg)` sends it and then the prompt.
New commands: add a handler to the right module's `commands` object. Keep
aliases as direct function references (`flee: retreat`) — never reference
`commands` inside its own literal (TDZ).

Game domain logic follows the same split: `Game` holds state and delegates to
the economy/wilds/quests/status modules (functions take `game` first when they
need world state).

Combat lives in `server/combat.js` (the per-fight `Combat` state machine) and
`server/combat-manager.js` (lifecycle/ticker/duels). It models the DR range
system: enemies sit at `missile | pole | melee`, weapons have a reach
(`weaponReach`), aggressive creatures close on their own, and the player uses
`advance`/`retreat`/`flee`/`assess`. Roundtime follows the DR weapon-class
table (`weaponRT`); RT actions are gated in `handleCommand` via `RT_BLOCK`
when the WS session passes `{ applyRT: true }` (tests/sim call the engine
directly and skip the gate). `setRoundtime`/`roundtimeLeft` live in
`server/player.js`.

Client scripting is a DR-script interpreter: `public/js/script-engine.js`
(pure engine, unit-tested) + `public/js/scripts.js` (runner, storage, `.name`
prefix, `script <name>`/`script stop`). The compass rose is shared via
`public/js/compass.js` (room panel + exits dock).

## Game Master / admin surfaces

Read-only inspection and inspection-driven ops live behind the auth-gated
GM API (`server/gm.js`, mounted at `/api/gm/*`, bearer = the exact dedicated
`DR_GM_TOKEN`; ordinary game sessions are never sufficient):

- `GET /api/gm/summary | world | room/<id> | creatures | npcs | items |
                       highscores (?page&perPage&sort=circle|skill) |
  guilds | races | skills | characters | player/<name> | players-online |
  admin/status | admin/reload | db` (DB browser: table list/dump or a
  bounded `SELECT … LIMIT n`; authentication tables/columns, SQLite internals,
  compound queries, and write/DDL keywords are rejected). `admin/status`
  reports `uptimeMs` (from `game.uptimeAt`, set at boot) plus `proc`
  (RSS/heap/CPU counters, node/pid/platform) and `dbBytes`; the online view
  includes `maxHp` so clients can render HP fractions.

Clients: `public/gm.html` + `gm-console.js` (GM console: world map, player
inspector, live per-player + world-wide streams) and `public/admin.html`
(ops dashboard: uptime/process load + latency & population sparklines,
world census vitals, live roster with HP bars, zone NPC/spawn drill-down
with live room queries, embedded player-view watch via `/?spectate=`,
jobs log tailer, world reload). A native macOS menu-bar/Dock app
(`admin/main.swift`, built by `scripts/build-admin-app.sh`) starts/stops the
world and opens these pages: `open bin/admin/dragonrealms-admin`.

Live watch relay: `server/spectate.js` mirrors a player's full stream to
watchers; `/?spectate=Name` deep-links the main client straight into watch
mode, and `{t:'worldwatch'}` subscribes a GM session to every online player's
tagged messages. All spectator paths are read-only.

## Wire protocol (server → client)

`room` (msg in `[[Name, Area]]` form + exits + roomId), `msg`, `combat`,
`notice`, `error`, `prompt` (`HP: n/n  Mana: n/n  Stamina: n/n  RT: n  Circle
n  n silvers [COMBAT]`), `hands` (equipment snapshot, sent on gear changes),
`command` (spectator echo of the watched player's typing), `login_prompt`,
`authed`, `charselect`, `charcreate`, `charalloc`, `enter`, `pong`. Text is
plain with ANSI codes (`\x1b[NNm`); the client parses ANSI and derives its
status strip / hands bar / room panel / compass from `prompt`, `room`, and
`hands` messages. The spectator relay (`server/spectate.js`) mirrors a
player's full stream to watchers; `/?spectate=Name` deep-links the main
client straight into watch mode.

## Conventions

- ESM everywhere; `node --check` before committing.
- Command handlers return `emit(...)` early on validation failures.
- Player-facing prose is DR-flavored; keep channel styling on the client.
- Zero new dependencies; no build step for the client.

## Verification

```bash
npm run verify      # syntax + tests + corpus replay (needs server on :3000)
npm test            # domain + api + static suites (all green expected)
node scripts/client-corpus.mjs capture /tmp/corpus.json   # baseline
node scripts/client-corpus.mjs replay  /tmp/corpus.json   # behavior diff
node scripts/client-regression.mjs    # CDP suite (server + chromium running)
npm run simulate    # per-guild circle-10 pacing check
node scripts/race-guild-sweep.mjs --guilds warmage,barbarian --minutes 10
node scripts/race-guild-sweep.mjs --report
                    # render fidelity-summary.jsonl as a guild x race table
                    # DR-script fidelity sweep (server on :3000 required);
                    # --all runs the curated race×guild matrix; --boost N
                    # (default 20, cap 100) engages the test-only agent boost
                    # ({t:'boost',mult:N}: N× skill exp, rank conversion,
                    # and rest recovery; [BOOST xN] in the prompt); results:
                    # public/live/fidelity-*.log + fidelity-summary.jsonl
```

## Working in this repo

A parallel session may be editing at the same time. Before restructuring a
file, check `git status` and file mtimes. When committing, stage only your
files (never `git add -A` if other work is in flight) — use
`git apply --cached` hunks if a file is shared. `data/` and `test/` are often
in flux during fidelity passes; `server/commands/`, `public/js/`, and the
domain modules are the stable seams.

## Reference material — Elanthipedia local archive

A one-time archival copy of the DragonRealms wiki lives at
`~/elanthipedia-dump/` (taken 2026-08-21 with express permission from the
Elanthipedia community). For fidelity questions:

- Query the **local** dump: `cd ~/elanthipedia-dump && ./lookup.mjs <terms>`
  (`--title`, `--ns N` flags available; see its README). Do not hit the live
  API from sessions.
- Clean-room rule: extract *facts and mechanics* into `data/*.js` rewritten
  in our own words, citing the source page title in a comment. Never copy
  wiki prose/wikitext into the repo, and never commit anything from the
  archive folder itself.
