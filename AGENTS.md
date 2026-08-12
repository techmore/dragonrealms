# AGENTS.md — Dragon Realms

Text-based MUD (multi-user dungeon) inspired by DragonRealms. Node 22+ ESM,
zero runtime dependencies, SQLite via `node:sqlite`. Web client is vanilla
HTML/CSS/JS (no build step, no frameworks).

## Layout

```
data/                  game content (races, guilds, skills, items, creatures,
                       npcs, world, khri, abilities, forging, commodities, mana)
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

## Wire protocol (server → client)

`room` (msg + exits + roomId), `msg`, `combat`, `notice`, `error`, `prompt`
(`HP: n/n  Mana: n/n  Circle n  n silvers [COMBAT]`), `login_prompt`,
`authed`, `charselect`, `charcreate`, `charalloc`, `enter`, `pong`. Text is
plain with ANSI codes (`\x1b[NNm`); the client parses ANSI and derives its
status strip / exits widget from `prompt` and `room` messages.

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
```

## Working in this repo

A parallel session may be editing at the same time. Before restructuring a
file, check `git status` and file mtimes. When committing, stage only your
files (never `git add -A` if other work is in flight) — use
`git apply --cached` hunks if a file is shared. `data/` and `test/` are often
in flux during fidelity passes; `server/commands/`, `public/js/`, and the
domain modules are the stable seams.
