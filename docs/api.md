# Dragon Realms — Test API

A JSON-over-HTTP interface that lets an automated test computer
register accounts, create characters, enter the world, issue any game
command (movement, combat, shops, magic, death), and read full game state
for analysis. Normal player endpoints reuse the game's own scrypt
authentication and session tokens; privileged debug and GM surfaces use
separate service secrets.

## Enabling

The API is **off by default**. Start the server with:

```bash
DR_ENABLE_API=1 npm start        # http://localhost:3000, API under /api
PORT=3999 DR_ENABLE_API=1 npm start   # different port
```

Without the flag every `/api/*` path returns 404. The API also works with
the game's normal database; for clean test data point it at a throwaway DB:

```bash
DR_ENABLE_API=1 DR_DB_PATH=/tmp/dr-test.db npm start
```

The mutation-only debug fixture is a separate, two-credential surface. Enable
it only against disposable test data and give it a secret distinct from game
sessions and the GM secret:

```bash
DR_ENABLE_API=1 \
DR_ENABLE_DEBUG_API=1 \
DR_DEBUG_TOKEN='replace-with-a-long-random-test-secret' \
DR_DB_PATH=/tmp/dr-test.db npm start
```

The GM inspector also uses its own credential:

```bash
DR_ENABLE_API=1 DR_GM_TOKEN='replace-with-a-long-random-gm-secret' npm start
```

## Security model

- **Opt-in**: no API surface unless `DR_ENABLE_API=1`.
- **Authentication**: `Authorization: Bearer <token>`. Tokens are the
  game's own session tokens (issued by `/api/register` and `/api/login`,
  scrypt-verified, 12-hour expiry, pruned hourly).
- **Authorization**: every character action is scoped to the token's
  account (`characters` and `enter` check `account_id`); you cannot touch
  another account's characters.
- **Rate limit**: 20 commands/second per session (`POST /api/command`).
- **Input caps**: JSON bodies up to 16 KB; malformed bodies are rejected.
- **No secrets in logs**: passwords are only ever read server-side by the
  existing auth module.
- **Dedicated debug authority**: `/api/debug` is absent unless
  `DR_ENABLE_DEBUG_API=1`. It then requires both the normal game session and
  an exact `DR_DEBUG_TOKEN` in `X-DR-Debug-Token`; a game session alone gets
  HTTP 403.
- **Dedicated GM authority**: `/api/gm/*` accepts only the exact configured
  `DR_GM_TOKEN`. Game session tokens never grant GM access. Its DB browser
  excludes `accounts` and `sessions`, blocks authentication columns and
  SQLite internals, and limits queries to bounded SELECTs over gameplay
  tables.
- **Roundtime parity**: commands sent over HTTP use the same roundtime gate as
  commands sent over WebSocket.
- The WebSocket client path is untouched; the API and the game share the
  same world (a token can't double-enter a character — one player runtime
  per character at a time).

## Endpoints

All responses are JSON. Shape: `{ ok: true, ... }` or `{ ok: false, error }`.
Missing player authentication returns HTTP 401; authenticated callers without
a required debug or GM privilege receive HTTP 403.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/api/health`       | —  | Liveness: `{ ok, service, players }` |
| POST | `/api/register`     | —  | `{user, pass}` → `{token, username, characters}` |
| POST | `/api/login`        | —  | `{user, pass}` → `{token, username, characters}` |
| POST | `/api/logout`       | ✓ | Invalidates the token |
| GET  | `/api/characters`   | ✓ | List this account's characters |
| POST | `/api/characters`   | ✓ | `{name, race, guild}` → creates character (max 5) |
| POST | `/api/enter`        | ✓ | `{charId}` → load character, join world; returns initial messages + state |
| POST | `/api/command`      | ✓ | `{command}` → run any game command; returns messages + state |
| GET  | `/api/state`        | ✓ | Full snapshot of the active character's world |
| POST | `/api/debug`        | session + debug secret | **Test-only fixtures**: force hp/room/items/skills, clear combat |

### Command reference

`POST /api/command` accepts any command the game's terminal accepts:
`n/s/e/w/u/d`, `look`, `attack <creature>`, `cast`, `retreat`, `skin`,
`buy/sell/list`, `deposit/withdraw`, `heal`, `train`, `circle`, `quest`,
`craft`, `stance`, `alloc`, `wield/wear`, `get/drop`, `search`, `steal`,
`perceive/harness`, `charge/invoke/focus`, aliases and `;` chaining — see
`README.md` for the full list. Responses include every message the
terminal would have printed (`t: msg/room/combat/prompt/...`) plus a fresh
state snapshot, so the test computer never has to parse the prose.

### State snapshot (`GET /api/state`)

```jsonc
{
  "ok": true,
  "state": {
    "player": { "name", "race", "guild", "circle", "hp", "maxHp", "mana", "maxMana",
                "silver", "bank", "tdp", "stance", "room", "heldMana", "prepared",
                "buffs", "unspentStat" },
    "room":    { "id", "zone", "name", "desc", "npcs", "exits" },
    "inventory": [{ "id", "name", "qty" }],
    "equipment": { "hand": "dagger", "torso": "leather", ... },
    "floor":     [{ "item", "name", "qty" } | { "corpse", "name", "items", "equipment" }],
    "skills":    { "medium_edged": { "rank": 4, "exp": 120 }, ... },
    "combat":    { "enemies": [{ "name", "hp", "circle", "timer" }],
                   "playerTarget", "playerTimer" } | null,
    "quest":     { "creatureId", "count", "done" } | null
  }
}
```

`skills` (80+ skills) is the analysis surface: rank + exp per skill for
progression studies. `combat` exposes live enemy vitals so a test computer
can make fight decisions and assert outcomes. `floor` reports loose items
and player corpses (with their contents) for death/retrieval analysis.

### Debug fixtures (`POST /api/debug`)

Test-only arrangement endpoint, gated behind `DR_ENABLE_API=1`,
`DR_ENABLE_DEBUG_API=1`, a normal game-session bearer token, and the exact
`DR_DEBUG_TOKEN` supplied in `X-DR-Debug-Token`. Fields (all optional):

```jsonc
{ "hp": 1,                    // set health (0..max)
  "mana": 50,                 // set mana
  "silver": 1000, "bank": 500,// set money
  "room": "sewers_1",         // teleport (any valid room id)
  "addItems": [{ "id": "long_sword", "qty": 1 }],
  "setSkills": { "medium_edged": 15 },
  "clearCombat": true }       // force-end any active fight
```

Example (where `TOKEN` is a game session and `DEBUG_TOKEN` is the distinct
configured debug secret):

```bash
curl -s -X POST localhost:3000/api/debug \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-DR-Debug-Token: $DEBUG_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"room":"sewers_1","addItems":[{"id":"long_sword","qty":1}]}'
```

### GM inspector (`/api/gm/*`)

GM endpoints require `Authorization: Bearer <DR_GM_TOKEN>`. A missing
credential returns 401; an invalid token—including a valid ordinary game
session—returns 403. The GM database endpoint never lists or dumps the
`accounts` or `sessions` tables and rejects SELECTs that could reference
them, their secret columns, views, or SQLite internals.

## Worked session (curl)

```bash
# Start: DR_ENABLE_API=1 npm start  (terminal 1)

# Register (returns token)
curl -s -X POST localhost:3000/api/register -d '{"user":"tester","pass":"s3cretword"}' | jq .token

# Create a character
curl -s -X POST localhost:3000/api/characters \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Tester","race":"human","guild":"warmage"}'

# Enter the world
curl -s -X POST localhost:3000/api/enter -H "Authorization: Bearer $TOKEN" \
  -d '{"charId":1}'

# Walk to the sewers and fight
curl -s -X POST localhost:3000/api/command -H "Authorization: Bearer $TOKEN" \
  -d '{"command":"nw"}'
curl -s -X POST localhost:3000/api/command -H "Authorization: Bearer $TOKEN" \
  -d '{"command":"w; w; d"}'
curl -s -X POST localhost:3000/api/command -H "Authorization: Bearer $TOKEN" \
  -d '{"command":"attack rat"}'

# Poll until the fight resolves
curl -s localhost:3000/api/state -H "Authorization: Bearer $TOKEN" | jq .state.combat

# Analyze progression
curl -s localhost:3000/api/state -H "Authorization: Bearer $TOKEN" | jq .state.skills
```

## Automated test suite

`test/api.test.mjs` and `test/gm.test.mjs` (run with `npm test`) boot APIs on
ephemeral ports with throwaway DBs and cover registration/login, token
enforcement, chargen, stat allocation, movement, **real async combat**
(equipped weapon vs sewer rat, polls to resolution), shop/inventory/
equipment round-trips, and the full **death loop** — deterministic death
via `/api/debug`, temple respawn, corpse at the death site, `search`, and
`get <item> from corpse` reclamation. The suites also prove debug flag/secret
isolation, GM/session separation, GM DB secret denial, and HTTP roundtime
enforcement.
