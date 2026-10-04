# Audit fixes — 2026-09-29

This pass implements the nine findings from the comprehensive codebase audit.
No dependencies were added, production databases were not used for fixtures,
and the normal world/menu-app launch settings were not changed.

## Runtime changes

- Item drops publish floor additions only after SQLite commit. Failed pickups
  preserve floor quantity/instance metadata and restore inventory. Missing or
  mismatched durable rows and insufficient inventory fail closed.
- WebSocket authentication handles rejected promises. Disconnects invalidate
  pending authentication generations; closed sockets cannot re-enter. Logout
  clears runtime authorization even when persistence fails.
- Authenticated sockets check token validity on every request, with an
  independent minute-based sweep for idle sockets. GM quick-play continues
  using its separately authorized credential flow.
- Both HTTP and WebSocket commands consume a shared policy of 20 actual
  executions per second per transport session. Each input also has a 4096-character,
  20-command and 64-expansion-node bound; aliases share the same budget. Large
  chains may execute a bounded prefix before returning a limit message.
- Live creature vitality and death are world-owned. Per-fight views retain
  range/timers/debuffs but share HP; defeat is claimed before rewards. Spawn
  generations prevent old fights from damaging or looting a respawn. The
  defeating player receives kill rewards; this does not introduce group loot.
- HTTP runtime sessions have a 15-minute idle lease, an independent cleanup
  timer, and a 512-message inbox. Enter, command and state responses drain
  messages and report `messagesDropped` when the oldest messages were evicted.
  Idle retirement does not revoke an otherwise valid account token.
- Runtime cleanup ownership is explicit and idempotent. `Game.stop()` disposes
  registered background resources without coupling Game to HTTP implementation.
- Only the spectator entry page permits same-origin framing. Gameplay,
  admin/GM pages, APIs and errors retain deny-framing headers; cross-origin
  embedding remains forbidden.
- Retention recognizes Python Unix-second completion timestamps as well as ISO
  strings. Dependencies in other run directories protect their evidence during
  both planning and apply. Oversized/unreadable reference sources fail closed.
  Reference contents are processed one file at a time to bound memory usage.

## Verification changes

The browser harness explicitly paces commands below the real input limit rather
than relying on browser latency. Corpus comparison ignores the incidental
position of periodic `mindstate` telemetry; other frames, responses and ordering
are still compared. FE telemetry remains covered by browser assertions. Existing
numeric/token normalization is unchanged.

Regression coverage includes transaction fault injection, stale durable loot,
failed logout persistence, rejected/closed authentication, revoked/expired tokens,
command chains and alias fanout, shared creature damage and idempotent rewards,
respawn lifetime guards, bounded/drained HTTP messages, idle retirement, scoped
framing, retention timestamps/dependencies and runtime cleanup isolation.

Verification was performed with the full Node verifier, Python unit suite,
isolated corpus capture/replay, all 82 real-browser client assertions and a live
admin Watch iframe against a disposable world. No progression simulations were
launched and no live experiment evidence was deleted.

Final results: 416 JavaScript/module syntax checks, 919/919 Node tests,
43/43 Python tests, 82/82 client browser assertions, a successful live Watch
iframe, matching isolated corpus replay, valid data cross-references and
reproducible/documentation-consistent generators. Browser verification used
the ego-browser skill. Optional corpus/browser gates were exercised separately
from the default verifier. The normal world and menu-app autostart services
remain disabled; all disposable test worlds were stopped.
