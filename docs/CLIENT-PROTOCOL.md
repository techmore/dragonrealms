# Client lifecycle and panel protocol

These additions preserve ordinary text commands and existing server message
types. The server remains authoritative for character ownership.

## Authentication and reconnect

- The initial `login_prompt` advertises `features: ["panels-v1"]`.
- Successful authentication sends `authed` with a token, followed by the
  existing character selection or creation flow.
- Authentication failure sends `error` with `code: "AUTH_FAILED"` and the
  player-facing `msg`.
- Rejected token authentication sends `code: "SESSION_EXPIRED"`. The client
  removes that stored token and returns to login. Wrong passwords do not
  invalidate an unrelated stored session token.
- Explicit logout sends `login_prompt` with `reason: "logout"`; the client
  clears its token. Network disconnect retains it for reauthentication.
- Disconnect, logout, and account authentication reset character widgets,
  pending panel requests, the active script, and running timers. Stored
  script/configuration definitions are retained. Triggers execute only while
  playing and not spectating.
- Reconnect retries back off from one second to a maximum of 30 seconds.
  Successful authentication/entry resets the retry count. A reconnected
  ordinary session returns to character selection; it does not restart a
  previous script automatically.

## New-character journey

Normal browser creation sends race and name with `city: "crossing"` and no
`guild`. New guildless characters start at the Crossing Temple, allocate
stats, then enter the world. `DIR LIST GUILDS` lists destinations;
`DIR BARBARIAN` gives directions, and `JOIN BARBARIAN` works before the
Barbarian leader at the hall. Crossing rooms tagged `town` count as city
rooms for DIR, including the Temple.

Existing characters retain their saved room and guild. Explicit guilded
creation through low-level wire/API callers remains supported for existing
test and simulation fixtures; guildless browser creation is not a wire-level
restriction. The Temple arrival is the intended product flow, not an
independently verified claim about historical DragonRealms onboarding.

## Read-only character panels

Client request:

```json
{"t":"panel_request","requestId":"panel-1","panel":"score"}
```

Success:

```json
{"t":"panel_response","requestId":"panel-1","ok":true,"lines":["Character status text"]}
```

Failure:

```json
{"t":"panel_response","requestId":"panel-1","ok":false,"error":"Enter the world to view this character panel."}
```

`requestId` is a string of at most 80 characters. The allowed panels are
`inventory`, `score`, `info`, `skills`, `exp`, and `spells`. The server requires
an active playing session that owns its character. It invokes these read-only
views directly: player aliases, command chaining, and arbitrary verbs are
never evaluated through this route. Requests use the ordinary input rate limit.

The response is complete; no timing window or end-marker inference is needed.
The client accepts only the currently pending request ID. Opening another
panel, closing the panel, or resetting the session invalidates that ID. A
five-second timeout produces an explicit refresh message. Chat, notices, and
errors from other commands continue through the story independently.

With an older server that does not advertise `panels-v1`, the client issues
the ordinary read command and tells the player its response appears in the
story. It does not restore timing-based capture. Restarting onto the updated
server enables the new panel responses; no database migration is required.

## Leaving live watch

`unspectate` unsubscribes the watcher and sends `session_restore` with the
original session `state`. The client clears spectator widgets and suppresses
that page's automatic watch deep link, then consumes the normal screen messages
that follow: `login_prompt`, `charselect`, `charcreate`, `charalloc`, or an
`enter` with `resumed: true` followed by the player's own room and status.
Allocation drafts and active player objects are retained; returning does not
call world entry again. Scripts and timers remain stopped.

A rejected player-watch request sends `error` with `code: "SPECTATE_FAILED"`,
then the same restoration sequence. Switching to an unavailable target also
ends the previous subscription so the displayed screen and active feed agree.
The updated client and server should be released together for this handshake.

## Character script libraries and editor saves

The `scripts` message is a complete character-library snapshot. The client
replaces its current character library instead of merging it into shared browser
storage, ignores watched-player libraries, and clears character scripts on session
reset. Returning from spectate replays the player's own library. Built-in examples
remain available to every character.

`scripts_put` and `scripts_del` accept an optional string `requestId` (at most 80
characters). Success sends the authoritative `scripts` snapshot followed by
`script_result` with the same ID and `ok: true`. Failure sends the ordinary error
line and `script_result` with `ok: false` and `error`. No success is reported before
persistence completes; failed writes restore the in-memory library. Existing
callers may omit the ID. Release the updated editor and server together.

The editor reports pending/success/failure, supports exact multiline bodies,
validates the existing name/body limits and offers Edit/Copy/Cancel. Unsaved drafts
survive panel closing within the current session; a session reset clears them to
avoid carrying another character's draft forward. Copy an unconfirmed draft before
reconnecting. Script-body syntax is still validated by the interpreter when run;
saving does not prove that a script can complete successfully.

Legacy `dr_scripts_v1` browser data is preserved as a labeled archive and remains
in browser configuration exports. It is excluded from the runnable character
library until the user explicitly copies and saves a script to the current
character. Character scripts remain on the server; browser-config export is not a
backup of that character's server library. Deleting a character script does not
cause an archived same-name copy to become runnable again.

## Sims comparison controls

The visible Sims run panel starts the three-worker Barbarian comparison
(baseline, edgedSkinCheapKit, edgedSkinActivity) with a 1–120 minute cap.
Thirty minutes is standard; custom durations belong to separate cohorts.
The workers use Gor'Tog, paired-fixed-v1, Circle 5, boost 20, and publish
normal sweep artifacts to public/live. Closing the page does not stop them.

GM-authenticated GET/POST `/api/gm/sim-runs` exposes status and accepts
`{action:"start",minutes:30}` or `{action:"stop"}`. Launch arguments are
fixed server-side; requests cannot select executables, ports or paths.
The launcher targets this server's port, rejects concurrent sweep processes,
and stops only its own child. Each launch has a durable launcher log;
its run ID is discovered from the experiment manifest. After a server
restart, an existing sweep is reported as external and cannot be stopped
by this control. The script cap remains active. These endpoints require
the updated server to be restarted; open Sims from Admin for GM access.
