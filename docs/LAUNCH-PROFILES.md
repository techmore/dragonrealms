# Launch profiles

Updated September 24, 2026. These settings take effect on the next process start. Existing running worlds are not reconfigured automatically.

## Desktop / local play (default)

```sh
npm start
```

`DR_PROFILE=local` binds to `127.0.0.1:3000`. The local HTTP test API remains enabled for existing desktop tooling; disable it with `DR_ENABLE_API=0`. Debug mutation endpoints remain disabled unless explicitly enabled. `PORT` may select an integer from 1 through 65535. `DR_HOST` may select `127.0.0.1`, `::1`, or `localhost` in this profile.

Newly generated GM credentials use cryptographic randomness. A private credential file owned by the current OS user may be reused so desktop tools retain a stable token. Permissive, foreign-owned or symlinked credential files are not trusted for reuse. Published GM/debug files are atomically replaced with mode 0600; a publication failure is logged without printing the secret. Files remain at `/tmp/dr-world-token-<port>.json` and `/tmp/dr-debug-token-<port>.json` for existing tooling.

## LAN / public hosting

Configure four independent high-entropy GM credentials, each at least 32 characters, plus an exact comma-separated browser-origin allowlist before starting explicitly:

```sh
DR_PROFILE=public \
DR_HOST=127.0.0.1 \
DR_ALLOWED_ORIGINS=https://play.example.com \
DR_ENABLE_API=0 \
DR_GM_TOKEN='<inspect-secret>' \
DR_GM_OPERATOR_TOKEN='<operator-secret>' \
DR_GM_ADMIN_TOKEN='<destructive-admin-secret>' \
DR_GM_PLAY_TOKEN='<gm-play-secret>' \
npm start
```

The public profile defaults to binding all IPv4 interfaces when `DR_HOST` is omitted, with test and debug APIs disabled. Binding to `127.0.0.1` is recommended when a reverse proxy on the same machine should be the only network entry point. Remote deployments should provide HTTPS/WSS through their existing TLS proxy. This profile does not configure a proxy, firewall, certificates, or rate limits outside the application.

`DR_GM_TOKEN` authorizes inspection and live watch. `DR_GM_OPERATOR_TOKEN` additionally authorizes reload, simulation operations, and script-folder operations; `DR_GM_ADMIN_TOKEN` authorizes destructive character deletion; and `DR_GM_PLAY_TOKEN` is limited to GM quick-play. Inject these secrets from a secret manager and do not reuse one credential for multiple roles.

`DR_ENABLE_API=1` explicitly enables both the authenticated test API and the GM HTTP surface. The GM dashboard requires that switch. Enabling the debug API additionally requires `DR_ENABLE_DEBUG_API=1` and a separately configured `DR_DEBUG_TOKEN` of at least 32 characters. Ordinary game sessions do not authorize the dedicated GM or debug surfaces. See `documentation/PROJECT-AUDIT-2026-09-24.md` for the complete public deployment, backup, migration, artifact-retention, verification, and rollback checklist.

**Behavior change:** a bare launch is now loopback-only. Existing LAN deployments must select the public profile and configure all four GM role credentials plus `DR_ALLOWED_ORIGINS` before restarting. A non-loopback `DR_HOST` in local mode is rejected rather than silently exposing local tooling.

## Runtime state and recovery

Each Game owns its economy, shop stock and restock targets. Purchases do not mutate `data/npcs.js` definitions or other Game instances. Stock remains transient and starts from authored capacity in a newly constructed world; this change does not add stock persistence. Server callers should use the Game facade. The exported standalone `economy` object remains for legacy direct callers and owns a separate stock collection.

For database snapshots, shutdown behavior and restore drills, see [RECOVERY.md](RECOVERY.md). For implementation status and remaining release checks, see [IMPROVEMENT-SCHEDULE.md](IMPROVEMENT-SCHEDULE.md).

## Public static artifacts

Both profiles serve client assets and deliberately published logs/JSON reports
under `public/` without GM authentication. This supports the existing simulator
report and log-tail clients, including HEAD/Range requests. Treat those files as
public content: do not place secrets or private player exports there.

Static and API/GM responses include a shared CSP, frame denial, MIME-sniffing
protection, a no-referrer policy, and a restrictive browser permissions policy.
Authored inline scripts/styles still require CSP compatibility exceptions, so
these headers are defense in depth rather than a substitute for DOM escaping.
Terminate public TLS at the reverse proxy and add HSTS there after confirming
all client paths support HTTPS/WSS. Use the dry-run-first retention policy in
[ARTIFACT-RETENTION.md](ARTIFACT-RETENTION.md) for `public/live/`; shared
history and unknown families are protected until a separately reviewed
compaction workflow exists.

The static handler rejects hidden path components, database files (`.db`,
`.sqlite`, `.sqlite3` and their WAL/SHM/journal companions), SQL dumps, `.bak` and
`.backup` files. It also rejects directories and symlinks escaping the canonical
public root; an alias pointing to a blocked artifact is blocked too. Rejected
GET/HEAD/Range requests return 404 without file metadata. This filename policy is
not content inspection: a private backup renamed to an allowed extension still
must stay outside `public/`. Authenticated GM inspection remains separate.
