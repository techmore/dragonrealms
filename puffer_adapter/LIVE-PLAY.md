# Watch a frozen model play

Open `/sims.html#puffer-runs`. Follow latest selects the newest watch session;
the player screen opens automatically. A fresh running session says PLAYING.
Completed/stale sessions are not presented as active. Historical evaluations
remain in the run selector. UI refresh is two seconds, with catalog refresh
every fifteen seconds.

The **Watch · native DR UI** button opens `/?pufferWatch=<run-id>` in the
actual game client. `/?pufferWatch=latest` follows the play pointer. This
uses the existing room/prompt/terminal rendering, not a second client layout.
No WebSocket is opened in this mode, all transport sends return false,
scripts/triggers are not fed, and command input stays disabled. Only observed
text is adapted; unavailable inventory/equipment is not fabricated. The
native view retains the same sampled-response/accelerated-world limitations.

Launch a bounded watch session, without training or replacing a checkpoint:

```sh
.puffer-venv/bin/python -m puffer_adapter.live_play PARENT_RUN_ID --launch --seconds 600
```

The launcher prints the run ID, PID and artifact directory. SIGTERM to that
verified PID stops it; the worker closes its isolated engine. It also stops
at the wall-time cap, activity-step cap, death, target, or engine failure.
Only one watch worker holds the live-play lock. No optimizer is constructed.
The checkpoint is verified against its checksum, containment and the current
engine contract before launch, and weights/checkpoint are checked afterward.

This is **ongoing play in the isolated real game engine**, using accelerated
game time and the existing model's full observation contract. It is NOT a
login to the main world or proof of ordinary-client transfer. The network
selects activities and scripted macros execute commands. Screen output is a
bounded sample of responses after each activity, not every intervening command
and not a full transcript. Pacing slows activity selection for watching, not
the simulated engine clock.

Evidence is under `public/live/puffer/<run-id>/`: manifest, process receipt,
play log and timestamped `observations.jsonl`. `live-play.json` is a separate
discovery pointer; training's `latest.json` and original evaluation reports
are not overwritten. This single watch episode is not a matched benchmark
or a promotion decision. Never include private chat or credentials here.
