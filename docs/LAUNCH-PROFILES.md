# Launch profiles

Updated September 8, 2026. These settings take effect on the next process start. Existing running worlds are not reconfigured automatically.

## Desktop / local play (default)

```sh
npm start
```

`DR_PROFILE=local` binds to `127.0.0.1:3000`. The local HTTP test API remains enabled for existing desktop tooling; disable it with `DR_ENABLE_API=0`. Debug mutation endpoints remain disabled unless explicitly enabled. `PORT` may select an integer from 1 through 65535. `DR_HOST` may select `127.0.0.1`, `::1`, or `localhost` in this profile.

Newly generated GM credentials use cryptographic randomness. A private credential file owned by the current OS user may be reused so desktop tools retain a stable token. Permissive, foreign-owned or symlinked credential files are not trusted for reuse. Published GM/debug files are atomically replaced with mode 0600; a publication failure is logged without printing the secret. Files remain at `/tmp/dr-world-token-<port>.json` and `/tmp/dr-debug-token-<port>.json` for existing tooling.

## LAN / public hosting

Configure a high-entropy `DR_GM_TOKEN` in the launch environment first (at least 32 characters), then start explicitly:

```sh
DR_PROFILE=public DR_HOST=0.0.0.0 DR_ENABLE_API=0 npm start
```

This profile defaults to binding all IPv4 interfaces, with test and debug APIs disabled. Use `DR_HOST=127.0.0.1` if a reverse proxy on the same machine should be the only network entry point. Remote deployments should provide HTTPS/WSS through their existing TLS proxy. This profile does not configure a proxy, firewall, certificates, or rate limits outside the application.

`DR_ENABLE_API=1` explicitly enables the authenticated test API. Enabling the debug API additionally requires `DR_ENABLE_DEBUG_API=1` and a separately configured `DR_DEBUG_TOKEN` of at least 32 characters. Ordinary game sessions do not authorize the dedicated GM or debug surfaces.

**Behavior change:** a bare launch is now loopback-only. Existing LAN deployments must select the public profile and configure their GM credential before restarting. A non-loopback `DR_HOST` in local mode is rejected rather than silently exposing local tooling.

## Runtime state and recovery

Each Game owns its economy, shop stock and restock targets. Purchases do not mutate `data/npcs.js` definitions or other Game instances. Stock remains transient and starts from authored capacity in a newly constructed world; this change does not add stock persistence. Server callers should use the Game facade. The exported standalone `economy` object remains for legacy direct callers and owns a separate stock collection.

For database snapshots, shutdown behavior and restore drills, see [RECOVERY.md](RECOVERY.md). For implementation status and remaining release checks, see [IMPROVEMENT-SCHEDULE.md](IMPROVEMENT-SCHEDULE.md).

## Public static artifacts

Both profiles serve client assets and deliberately published logs/JSON reports
under `public/` without GM authentication. This supports the existing simulator
report and log-tail clients, including HEAD/Range requests. Treat those files as
public content: do not place secrets or private player exports there.

The static handler rejects hidden path components, database files (`.db`,
`.sqlite`, `.sqlite3` and their WAL/SHM/journal companions), SQL dumps, `.bak` and
`.backup` files. It also rejects directories and symlinks escaping the canonical
public root; an alias pointing to a blocked artifact is blocked too. Rejected
GET/HEAD/Range requests return 404 without file metadata. This filename policy is
not content inspection: a private backup renamed to an allowed extension still
must stay outside `public/`. Authenticated GM inspection remains separate.
