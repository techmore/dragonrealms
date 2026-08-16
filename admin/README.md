# Dragon Realms Admin (menu bar + Dock app)

A native macOS app that puts the world's admin tools one right-click away.

## What it does

- Shows in the **Dock** and the **menu bar** (right-click the 🐉 item).
- Menu (right-click or click the Dock icon):
  - **Open Admin Dash** — `/admin.html` (world status + links)
  - **GM Console** — `/gm.html` (read-only inspector + DB browser + live streams)
  - **Play** — the game client
  - **Roadmap** — the feature tracker
  - **Start World** / **Stop World** — manages the live Node server (child process,
    output tailed to `/tmp/dr-world.log`)
  - **Reload World** — persists all players then rescans room spawns
  - **Quit** — stops the world and exits
- Single-instance (a lockfile in `/tmp`); status refreshes every few seconds.

## Build & run

```bash
./scripts/build-admin-app.sh     # compiles bins/dradmin + the .app bundle
open bin/admin/dragonrealms-admin
```

Direct binary run (reliable for the menu-bar item):
```bash
DC_GM_TOKEN=gmsecret ./bin/admin/dragonrealms-admin/Contents/MacOS/dradmin
```

## Config

- World port: `PORT` (default 3000).
- GM access token: `DR_GM_TOKEN` (default `gmsecret`) — the same token the GM
  console / any auth-ed `DR_ENABLE_API` client uses. The server is started with
  `DR_ENABLE_API=1` and that token.

## Files

- `admin/main.swift` — the Swift/AppKit status-item app.
- `public/admin.html` — the web admin dash landing page.
- `server/gm.js` — `GET /api/gm/admin/status` and `.../admin/reload` (auth-gated
  read-mostly ops behind the GM token).
