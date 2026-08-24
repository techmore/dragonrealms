# UI/UX Audit — admin.html + Sim Players experience (2026-08-24)

Audited live at http://127.0.0.1:3000/admin.html against `public/js/admin/*`,
`public/live/*` artifacts, and `server/gm.js`. Audit only — no code changes.

## What exists today

- Sim launch form + browser-run agent loop (`js/admin/agents.js`) at the bottom
  of a very long ops dashboard.
- Flat log tailer (`jobs.js`) listing `public/live/*.log`, plus a standalone
  `/jobs.html` twin.
- `fidelity-summary.jsonl` (per-run results: circle, kills, deaths, trains,
  fidelity checks, letter grade) — **generated but never surfaced in any UI**.
- `/api/gm/player/<name>` returns full skill ranks/exp even for OFFLINE
  characters — ideal for leveling/skill tracking, currently used nowhere.

## Findings

### P0 — broken or blocking

1. **No per-agent control.** `agRenderState()` shows only "● N running" with
   details hidden in a title tooltip. There is no Stop button for an individual
   agent — only global "Stop all". A misbehaving sim can't be stopped without
   killing all of them (or the tab).
2. **Browser agents die silently with the tab.** Agent WS loops live in the
   admin page's JS context. Reload/close = dead sims, and after reload the UI
   says "○ none running" with no hint anything was ever launched. No
   persistence, no orphan detection (roster still shows the bot until its
   socket times out server-side).
3. **Run history is invisible.** Every past sweep's outcome (grades, circles,
   kill/death counts) sits in fidelity-summary.jsonl but the UI only offers raw
   log files. You cannot answer "how did last night's thief-halfling run do?"
   without reading JSONL by hand.

### P1 — friction and information scent

4. **Sim section placement.** It's the 6th section down a monitoring-heavy page,
   mixed with world-reload ops. Sim work (launch → watch → review) deserves its
   own surface; the admin page should link to it, not embed it.
5. **Log viewer has no structure.** Raw text dump; `[progress]` lines (which
   already encode circle/hp/kills/circles/trains per minute) are never parsed.
   No filter, no jump-to-errors, no sparkline of pacing.
6. **No leveling/skill view.** The single most interesting question — "is this
   sim actually training?" — requires curl + the GM token. All 84 skill ranks
   are one GET away; there's no UI for it.
7. **Token inconsistency confuses.** Zones panel demands DR_GM_TOKEN, but the
   sim launcher happily registers accounts and enters the world with zero auth.
   Nothing explains this asymmetry (public register API vs GM API). Also the
   header sub-copy references `dragonrealms.service` / `deploy/` — stale; this
   box runs a macOS LaunchAgent.
8. **"circle →" field label** reads as a direction, and boost x20 default isn't
   flagged as test-only ({t:'boost'} semantics invisible to the operator).

### P2 — polish

9. Uptime shows "n/a" while the world pill reads ONLINE (uptime comes from the
   GM status payload; public health path leaves it blank). Minor trust erosion.
10. Duplicate surfaces: admin log viewer vs /jobs.html — same feature, two
    places, slightly different chrome.
11. Log buttons strip only the `fidelity-` prefix; browser-run logs and sweep
    logs sort together with no grouping by run/guild/race/date.

## Proposal — dedicated Sims page (`/sims.html`)

One page, three columns of purpose: **launch · watch · review**.

1. **Runs table (review).** Merge `/live/index.json` with
   `fidelity-summary.jsonl`: char, guild × race, date/duration, end reason,
   circle reached, kills/deaths/trains, fidelity score + grade badge, LIVE
   badge for appending logs. Click a row → detail pane. This alone resolves
   P0-3 and P2-11.
2. **Per-run detail.**
   - Structured progress chart parsed from `[progress]` lines: circles & kills
     over minutes (canvas sparkline, same pattern as admin latency/pop).
   - Fidelity checklist rendered as pass/fail chips from the run's
     `fidelity:{}` counters.
   - Log tail (reuse jobs.js polling) with an errors-only filter toggle.
3. **Character tracking.** For any character name (from the runs table or free
   text): fetch `/api/gm/player/<name>` and show circle, TDP pool, silver, and
   a sortable skill table (rank + exp-to-next bar). To get *trending*, add a
   tiny server-side snapshot hook: append `{ts,char,circle,topSkills[]}` to
   `public/live/sims-history.jsonl` at each run end — then chart rank deltas
   between runs. Zero deps, one file, no schema migration.
4. **Live control strip (watch).** Per-agent row: name, guild, HP bar, circle,
   room, [Stop] button; state kept in localStorage so a reload renders
   last-known rows marked "(tab closed)" instead of pretending nothing ran.
   Deep-link Watch (`/?spectate=Name`) for full-stream viewing.
5. **Replay = relaunch.** Each finished run row gets "▶ rerun with same
   params" prefilled into the launch form. True stream replay would require
   recording the wire log; the existing script> lines in sweep logs give 80%
   of that value for free if the detail pane renders them as a command
   timeline rather than raw text.
6. **Admin page slims down.** Replace the embedded Sim players section with
   the launch form moved to /sims.html plus a compact "N running → Sims"
   link-card. Fixes P1-4 and the duplicate-viewer issue (P2-10).

Copy fixes while in there: explain the token asymmetry in one line ("sims use
the public game API; inspection needs the GM token"), fix the
service/deploy reference, rename "circle →" to "target circle", tag boost as
test-only.
