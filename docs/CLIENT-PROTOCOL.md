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
  previous script automatically. The browser shows explicit connection phases
  and a deadline-based countdown. Retry now cancels the scheduled retry and
  starts one immediate attempt; stale socket callbacks are ignored. Drafts and
  selection remain in the input, and commands are never queued for replay.

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

## Next-step snapshots

Prompts include an additive `journey` object with character/guild IDs, circle,
room, combat state and HP. `guildDirections` supplies a passive DIR command;
Riverhaven uses its shared guild row (`dir guilds`). Paladin snapshots also
include `soul`, so rank completion alone does not imply advancement eligibility.
Missing or malformed snapshots remain unknown. The client hides next-step
actions for spectators and rechecks session state before dispatching an action.

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
`inventory`, `equipment`, `score`, `info`, `skills`, `exp`, `spells`, `spellbook`, `slots`,
`progress`, `training`, `help`, `journal`, `recipes`, and `orders`. The server requires
an active playing session that owns its character. It invokes these read-only
views directly: player aliases, command chaining, and arbitrary verbs are
never evaluated through this route. Requests use the ordinary input rate limit.

Only `spellbook` accepts an optional `query` string, limited to 120 characters
before trimming. For example:

```json
{"t":"panel_request","requestId":"spells-2","panel":"spellbook","query":"fire shard"}
```

The handler receives the trimmed query as plain search text. Semicolons and
other command-like text are not executed. A non-string or oversized query, or
any query supplied to another panel, produces a correlated error response.
Omitting the query retains the existing unfiltered inspection behavior.

The response is complete; no timing window or end-marker inference is needed.
The client accepts only the currently pending request ID. Opening another
panel, closing the panel, or resetting the session invalidates that ID. A
five-second timeout produces an explicit refresh message. Chat, notices, and
errors from other commands continue through the story independently.

With an older server that does not advertise `panels-v1`, the client issues
the ordinary read command and tells the player its response appears in the
story. It does not restore timing-based capture. Restarting onto the updated
server enables the new panel responses; no database migration is required.

The Inventory, Crafting, Spells and Progress tabbed docks require `panels-v1` and a connected,
active playing session. They show an unavailable state on older servers,
during character creation, or while watching. Their tabs never fall back to
ordinary command dispatch. Tab changes cancel pending requests; stale replies
cannot replace the selected view.

## Quest snapshots and Journal

`quest` messages retain `quest: null` for no task and the existing `kind`,
`source`, `done` and `desc` fields for active work. Additive fields include
`state`, `objective`, `counter`, `destination` and `returnTo`. A counter has
`current`, `total`, `remaining` and `unit`; unknown legacy totals/current values
are null. Kill count tracks remaining enemies; harvest count tracks the total
goal and skinned count tracks completion. Only `done` determines reward readiness.

Delivery destinations include room ID/name, recipient, parcel and
`atDestination`. Inspect/Refresh use the passive `journal` panel for the player's
own character. Spectators inspect their latest watched snapshot locally without
issuing player commands. Watch subscription publishes the target's current quest
or null; returning to play republishes the owning character's quest. A delayed
own-character panel response cannot overwrite a watched snapshot.

`quest` reviews completed work without claiming it; `claim` collects the reward.
NPC reminders preserve existing assignments, and `quest abandon` explicitly
clears work without assigning another task.

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
