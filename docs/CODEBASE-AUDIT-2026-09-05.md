# Codebase and product audit — September 5, 2026

## Decision

The existing game is substantial, but it is not ready to be declared comprehensive or to serve as a clean baseline for simulator work. Stabilize persistence, client lifecycle, configuration handling, and verification first. Then improve the player journey and extract the modules that those changes need. Keep the vanilla client, ESM, SQLite, and zero-new-dependencies constraint.

This is an audit and implementation backlog. The original audit was read-only; the first implementation batch below followed the user's instruction to continue. Findings describe the baseline unless noted in the resolution log.

## Resolution log — first implementation batch

- **A01, shop buy/sell addressed:** item/payment writes now share a SQLite savepoint, with live inventory/balance restoration on rejection. Tests cover immediate reload and injected database failure. Broader vault/crafting/auction transfer atomicity remains to be reviewed before closing A01 in full.
- **A02, shutdown flushing addressed:** stop new work, stop timers, save every online player, close listeners/sockets with a bounded fallback, drain native authentication work before SQLite close, and report save failures with a nonzero exit. Integration tests cover unsaved balances/pools and failure reporting. Backup/restore documentation and a full process recovery drill remain open.
- **A03, rendering/import addressed:** highlight/gag patterns and IDs are escaped; color values are allowlisted; script names and trigger/edit attributes are escaped. Browser probes verify markup remains literal. This does not constitute a complete origin-wide XSS assessment.
- **A04 addressed:** typed login/register credentials are redacted before echo and excluded from history. Browser probes verify no password appears in either surface.
- **A16, import/backup addressed:** versioned export includes gags; legacy import remains supported; per-key validation rejects malformed settings before storage changes; storage failure restores prior values. Tests cover legacy/versioned input, malformed shapes, and rollback. Preview UI and existing-corrupt-storage recovery remain future work.
- First post-change full suite: **411/412 passed**, same existing `buys mace` failure. Subsequent focused tests include an additional auth-drain shutdown case. See the final verification receipt for the latest counts. No simulator files were edited by this task; concurrent changes to them remain outside this batch.

### Final verification receipt for this batch

- **25/25 focused tests passed** across economy atomicity, configuration, shutdown, WS session/security, and GM tests, including native auth drain before database close.
- **10 changed application modules passed syntax checks**; `git diff --check` passed.
- Browser checks: highlight markup rendered literally; gag markup did not create an element; typed password absent from log/history; malformed settings rejected; versioned gag configuration round-tripped.
- Full suite remains **411/412 on the recorded run**, with the pre-existing weapon-plan failure. The focused run adds one new passing shutdown test after that full run; no second full-run total is claimed.
- No changes committed or deployed. Disposable audit world and browser workspace closed after verification; the existing world on port 3000 was not restarted.

## Second implementation batch — client lifecycle and panels

- **A05 primary lifecycle addressed:** centralized cleanup on disconnect,
  logout, and account authentication; logout/token-expiry handling uses
  explicit server fields; valid tokens survive transport loss. Reconnect
  uses bounded backoff and labels sign-in/selection/play states. Scripts and
  timers stop; triggers are gated while outside play or spectating. A real
  disposable-world stop/restart returned to character selection without
  restarting either automation. Full manual spectate/unspectate restoration
  across every creation state remains a follow-up, not a verified claim.
- **A09 addressed:** finished scripts release their active slot; two
  consecutive runs of an echo/exit script completed in-browser.
- **A10/A11 addressed:** hide wins over old force-visible preferences,
  show clears hidden preferences, incoming chat respects intentional hiding,
  first equipment does not override hidden Hands, and Health is registered
  with a working collapse control and correct `aria-controls`.
- **A12 addressed:** request-correlated read-only panels replace timed stream
  capture. Wire tests verify authorization, identity, alias bypass, and
  rejection of arbitrary/chained commands. Browser checks verify separate
  chat, stale-response rejection, and working mobile panel open/close. Older
  servers display read-command results in the story without swallowing text.
- **A13/A14 addressed:** enabling input does not move focus; Tab only captures
  actual completion and Shift+Tab remains available; global shortcuts leave
  selects/textareas/editable fields alone. Browser checks cover settings
  focus and keyboard exit from the command field.
- **A15 auth flow addressed:** pending submissions are disabled and failures
  reach the form alert; a failed login restores enabled controls. Detailed
  inline character-creation validation remains open.
- New protocol contract: `docs/CLIENT-PROTOCOL.md`.
- Verification: **414/415 full-suite tests pass**, with only the same existing
  weapon-plan `buys mace` failure. All **6 session-security wire tests pass**;
  **14 changed JS/MJS files pass syntax checks**, and `git diff --check` passes.
  Browser checks include register/create/enter, wrong-password recovery,
  typed login after logout, script completion, window preferences, Health,
  panel/chat isolation, actual reconnect, and 390×844 mobile panel geometry
  (390px document width). Raw full-suite output:
  `/tmp/dr-lifecycle-final-tests.log`.
- Work remains uncommitted. Only the disposable world on port 3137 was
  restarted for this batch; the user's existing world was not restarted.

## Scope and evidence — original audit

- Reviewed working tree at `df742b9`: server entry/HTTP/WS/auth, persistence, command architecture, economy, combat lifecycle, player UI/router/input/settings/windows/scripts, GM/admin code, content validation, documentation, and test tooling.
- Existing work in progress: modified `public/js/script-engine.js` and `scripts/race-guild-sweep.mjs`; untracked `server/justice.js`, `test/circle-1130.test.mjs`, `test/shop-coverage.test.mjs`, and `.hermes/plans/sweep-split.md`. These were left alone. Findings involving those files describe this working tree, not necessarily HEAD.
- `npm test`: **403 passed / 404 total**, one failure in `test/weapon-plan.test.mjs:40`, assertion `buys mace`. Duration approximately 17.4 seconds. This is a simulator-adjacent failure discovered by the general suite; no simulator changes or progression runs were made.
- Syntax: **89 JavaScript files** under `server`, `public/js`, and `data` checked with `node --check`; no failures. This does not cover every tool or inline HTML script.
- `node scripts/audit-data.mjs`: **ALL CROSS-REFERENCES VALID**.
- `npm run verify-docs`: **4 errors**, including three duplicate feature IDs and one overclaim; also one stale status marker. Generators reproduce their checked-in output, which does not mean the claims are correct.
- Browser: ego-browser semantic/DOM inspection, registration → character creation → allocation → entry on a disposable world at port 3137 with its own `/tmp` database. Also inspected the existing login screen on port 3000. Tested desktop and 390×844 mobile emulation, script completion, window visibility, logout, failed login, and safe markup probes.
- Focus behavior and panel capture were additionally exercised through exported browser module functions. These are controlled component probes, not an all-input-methods end-to-end test.
- Screenshot capture timed out. Mobile findings are supported by DOM geometry and the accessibility tree, not a completed visual/pixel review. Physical phone keyboard behavior, screen-reader speech, contrast measurement, all guild playthroughs, production load, and recovery drills remain unverified.
- Did not run `npm run verify` or the existing CDP regression script against the shared world: both hard-code port 3000 and create gameplay state there. Their implementation was reviewed instead.

Temporary raw results: `/tmp/dr-audit-tests-20260905.log`, `/tmp/dr-audit-data-20260905.log`, `/tmp/dr-audit-docs-20260905.log`. These are local scratch evidence, not durable CI artifacts.

## Strengths to preserve

- Clear server/client/content separation; six domain command registries and duplicate-verb detection.
- Auth hashing is asynchronous and queue-bounded; dedicated GM authorization and debug opt-in exist; stale player ownership has explicit protections.
- Previous high-impact fixes are present: spawn depletion, deduplicated duel ticking, escaped GM database cells, script mutation ownership checks, and oversized-WS-frame handling.
- Shared HTTP composition and temporary-database tests reduce integration drift.
- Rich terminal functionality: scrollback/search, ANSI styling, macros, scripts, channel controls, compass, contextual windows, equipment and wound presentation.
- Mobile layout reflows: at 390px the document width was 390px, the rail occupied a 120px strip, and the story remained a separate region. Focus-visible and reduced-motion CSS are present.
- Source-shaped content and cross-reference tooling provide a useful foundation. Passing references should not be confused with balanced gameplay or full source fidelity.

## P1 — fix before calling the baseline ready

### A01. Purchases persist the item before persisting payment

**Evidence:** `server/economy.js:buy` subtracts runtime silver, calls `addItem` (immediate SQLite mutation), and returns. The `Game.buy` facade and shop handler do not save the character balance. A disposable-DB probe bought a club: runtime silver **150 → 38**, freshly loaded disk silver **150**, disk inventory **contains the club**.

**Impact:** interruption before the next save can preserve purchases without payment. Selling and other mixed inventory/currency operations need the same atomicity review.

**Change:** one transaction for durable item and currency changes, with runtime state updated consistently after success. Avoid layering a new transaction blindly around helpers that already transact.

**Acceptance:** immediate reload after buy/sell returns matching balances and items; injected failure cannot commit only one side. Extend this invariant to vault/crafting/auction transfers.

### A02. Graceful process shutdown does not flush online players

**Evidence:** `server/index.js:99` calls `game.stop()`, `closeDb()`, and `process.exit(0)`. `Game.stop()` only stops recurring timers. Regular autosave is every 60 seconds; movement and explicit disconnect save through separate paths.

**Impact:** normal menu-bar stop or SIGTERM can lose changes since the last save, including skill pools, vitals, and currency. This aggravates A01.

**Change:** stop accepting work, stop tickers, flush owned players, close WS/HTTP, close SQLite, then exit. Specify bounded shutdown and how save failures are reported. Add a documented SQLite-safe backup/restore procedure.

**Acceptance:** a process-level shutdown/restart test preserves an unsaved player mutation; failed saves surface an error rather than a successful shutdown claim.

### A03. Configuration text becomes HTML in the player origin

**Evidence:** `public/js/highlights.js:renderHighlightPanel` interpolates pattern/color/id; `public/js/gags.js:renderGagPanel` interpolates pattern/id. A harmless `<b id="audit-markup">…</b>` highlight produced a real DOM element. `panels.js:importConfig` accepts arbitrary JSON values for known keys, and imported highlight rules render at boot.

**Impact:** crafted shared configuration can inject executable markup in the origin holding game and potentially GM tokens. This is a local/imported-config entry point; the probe did not establish a remote player-to-player exploit.

**Change:** text nodes for patterns, allowlisted colors, generated/validated identifiers, and a versioned schema for config import. Audit script-name and edit-row HTML interpolation too.

**Acceptance:** markup stays literal, unsupported shapes are rejected before writing storage, and importing config cannot execute event handlers.

### A04. Typed login/register exposes passwords in terminal history

**Evidence:** `public/js/input.js:185–203` echoes and records every non-quit command before routing. Login/register syntax includes the password. The welcome screen advertises this route.

**Impact:** credentials remain visible in scrollback and are recoverable with Up, including after the story is cleared on entry.

**Change:** classify auth commands before echo/history; redact password output and never retain the full command. Prefer the form, with appropriate username/current-password/new-password autocomplete semantics.

**Acceptance:** typed registration/login works without credentials appearing in terminal, command history, exports, or spectator output.

### A05. Login/logout/reconnect lack a complete client state transition

**Evidence:** `router.js:login_prompt` shows the login UI without setting `gameState.value='login'` or clearing the token. Browser logout returned a visible welcome screen while the client state remained **playing**. `net.js` retries every two seconds and sends its retained token. `main.js:onDisconnect` does not stop scripts/timers or reset the full session state.

**Impact:** typed auth can route as game input after logout or an expired reconnect; old automation can survive into another session; stale character UI can persist.

**Change:** explicit lifecycle transitions with centralized cleanup for disconnect, auth failure, logout, character switch, playing, and spectating. Distinguish transport connected from authenticated/playing. Use error codes rather than prose matching to decide token invalidation.

**Acceptance:** expired-token reconnect supports typed and form login; logout clears credentials and character state; automation never resumes on a different character without an explicit action. Retry uses bounded backoff and an actionable status.

### A06. The quality gate is currently red and can report misleading success

**Evidence:** baseline results above. `scripts/verify.mjs` excludes docs/data checks, skips corpus when port 3000 is absent, and still prints “All checks passed. Safe to commit.” The corpus normalizer removes all numbers, potentially hiding numeric regressions. `scripts/client-regression.mjs` ignores some `waitFor` results and expects seven Windows entries while the implementation has eight.

**Change:** separate deterministic unit/data/docs checks from isolated integration/browser checks, but make the full gate fail or explicitly incomplete when required coverage is missing. Configure the base URL, own the temporary server/database, fail on timeouts, and normalize only identified volatile fields.

**Acceptance:** fresh checkout has a reproducible green gate; a missing browser/server cannot look like a pass; representative numeric and UI regressions fail the right check. Record the existing weapon-plan failure before simulator work; do not weaken its assertion merely to make the gate green.

### A07. Runtime startup depends on an untracked module

**Evidence:** `server/game.js` imports `./justice.js`; that file is untracked in this working tree and absent from `git ls-files`.

**Impact:** a commit/deployment that omits the ongoing extraction will fail to import. Local tests alone do not prove checkout completeness.

**Change:** finish and review the owning change as one coherent unit, then validate a clean checkout. Preserve the existing contributor's work.

**Acceptance:** all runtime imports resolve from committed source. Treat this as a work-in-progress integration blocker, not an accusation that the extraction itself is wrong.

## P2 — correctness, usability, and maintainability

| ID | Finding and evidence | Recommended change / acceptance |
|---|---|---|
| A08 | **Restock target captures depleted stock.** `economy.restockTick()` initializes `stockWant` on the first tick, after purchases may already happen. Isolated probe: leather configured 4, reduced to 3, first restock target 3, stock stays 3. | Initialize immutable configured maxima before players can buy. Keep live stock per Game. Buying before the first tick must eventually restore the original count. |
| A09 | **Completed client scripts remain “running.”** `scripts.js` only clears `active` in `stopScript()`. Browser ran an echo/exit script twice; second run said it was already running. | Observe runner completion and release ownership; distinguish running/waiting/stopped/failed. A completed or errored script can run again without manual stop. |
| A10 | **Window visibility can contradict preferences.** `windows.js:setWindowVisible` leaves `force[id]` set when hiding. Browser probe produced `hiddenPreference:true`, `force:true`, `actuallyHidden:false`. Menu calculation also handles force differently for rail and dock windows. | One effective-visibility function; clear force on hide; use it for checkbox state and rendering. Add show→hide→reload and hide→show checks. Incoming chat should respect intentional hiding. |
| A11 | **HEALTH collapse control is disconnected.** Markup uses `data-collapse="health-win"`; `WINDOWS` has no corresponding entry, so `applyWindow()` returns. | Register Health with the same window model or provide a dedicated controller. Visible collapse control must actually collapse and expose truthful ARIA state. |
| A12 | **Panel capture can swallow unrelated traffic.** `panels.js:capture` grabs every msg/notice/error during a 2s/200ms timing window; router calls capture before chat routing. Controlled probe put unrelated nearby speech into Score. | Correlate panel responses with request IDs/type and an explicit end. Never hide chat, errors from another action, or system notices inside a requested panel. Handle timeout visibly. |
| A13 | **Prompt handling can steal focus.** `main.js:onMessage` calls `input.blockInput(false)` for each handled prompt; that helper always focuses `#cmd`. Component probe moved focus from `set-font` to `cmd`. | Separate enablement from focus. Restore focus only after an intentional flow transition or user command. Verify real combat prompts while editing settings/scripts and selecting controls. |
| A14 | **Command input traps Tab; select arrows can be hijacked.** `input.js` prevents every Tab, even when no completion exists; global arrow routing excludes INPUT/TEXTAREA but not SELECT. | Offer an ordinary keyboard exit (e.g. Shift+Tab), scope completion, and exempt all editable/select controls. Traverse the full UI with keyboard alone. |
| A15 | **Server auth errors miss the form's alert region.** Failed login displayed “Incorrect username or password” in terminal while `#wf-err` stayed empty. There is no pending submission state. | Route auth/chargen errors to the active form as well as the story where appropriate; disable duplicate submissions; focus the relevant field; expose pending/offline states. |
| A16 | **Config import is shape-unsafe and backup incomplete.** Any valid JSON value is accepted for each known key. Examples such as `dr_settings.channels:null` or `dr_windows_v1.hidden:null` break consumers. `CONFIG_KEYS` omits `dr_gags_v1`. | Validate/migrate each key; preview changes and preserve the old configuration on failure. Define which settings are browser-wide versus character-specific. Round-trip gags and every advertised persistent setting. |
| A17 | **Script editor cannot comfortably author multiline scripts.** Scripts panel uses a single-line input for script body and offers run/delete but no DR-script body editor. Libraries merge server entries into one browser-global store and retain local-only entries. | Dedicated textarea editor with Save/Cancel, validation feedback, dirty state, and clear character/local ownership. Deletions and switching accounts must not revive or ambiguously reuse scripts. |
| A18 | **Server exposure defaults disagree with the documentation.** Entry point enables API unless explicitly disabled, binds all interfaces, and creates GM fallback tokens with Math.random; HTTP factory defaults differ. `docs/api.md` says API opt-in. Static handler serves all files under public, including live logs/DBs. | Explicit local/private-network profiles, configured bind host, crypto-generated GM credentials, honest startup logs, and an explicit static-artifact policy. Preserve intended Tailscale access through configuration. Inspect existing token-file ownership/mode before reuse. |
| A19 | **Migrations swallow every ALTER failure as “already exists.”** `db.js:migrate` catches all exceptions without inspecting schema/error. | Versioned migrations with explicit schema checks, transactional boundaries where appropriate, and actionable failure. Test upgrades from a legacy fixture and unexpected failure. |
| A20 | **Admin initial deep links lose to saved tab.** `admin/boot.js:applyHash` calls `gotoTab` but returns undefined; `if (!applyHash())` always loads the saved tab afterward. | Explicit precedence: valid hash > valid saved tab > default. Validate tab IDs; test initial load and back/forward. Complete keyboard tab semantics. |
| A21 | **Documentation has competing truths.** Duplicate f191/f192/f193; ROADMAP still advertises 12 races including Giantman while `data/races.js` explicitly removed it; old EXP descriptions and “all green” handoff counts remain. | Unique IDs, one current scope/evidence registry, dated historical audits, generated status summaries. Separate implemented, tested, faithful, and balanced claims. |

## Architecture and organization improvements

These are refactoring opportunities, not defects inferred merely from line count.

1. **Define the wire contract.** Document message envelopes and structured room identity, character choices, vitals/wounds, auth errors, and request-scoped panels. Existing structured hands/targets/requirements are a good starting point. Preserve prose for the terminal while UI reads data. Add compatibility fixtures and a documented transition period rather than replacing the protocol wholesale.
2. **Keep commands thin.** Extract crafting/work orders from `commands/items.js`, and guild-specific magic operations from `commands/magic.js`. The duplicated `CRAFT_AFFINITY`, `VERB_SKILL`, and `CRAFT_TECH_COST` in items/verbs demonstrate an actual shared policy seam. Move policy to one content/domain module.
3. **Split combat around responsibilities.** `combat.js` is 1,571 lines spanning attacks, spells, guild maneuvers, PvP, rewards, and ticking. Extract damage resolution and terminal outcomes first, retaining one state machine. Require weapon/spell/PvP lethal and nonlethal invariants before further movement.
4. **Separate player persistence from gameplay arithmetic.** `player.js` is 941 lines. Introduce a persistence repository with explicit transaction ownership, inventory-instance operations, and progression/effect helpers. Avoid a giant generic service layer or broad rename-only rewrite.
5. **Split status presentation by widget.** `public/js/status.js` is 862 lines: room, vitals, equipment, wounds, experience, targets, and effects. Extract these behind an explicit character snapshot/reset lifecycle. Keep `main.js` as composition rather than relying on `window.__panelReady` and reciprocal dynamic imports to control boot order.
6. **Make content definitions immutable.** NPC stock currently mutates exported data objects. Different Game instances in one process therefore share mutable stock. Keep definitions in `data/` and runtime stock/spawns in the Game instance; test instance independence.
7. **Use command metadata as a single discovery source.** Registry, RT_BLOCK, client completion list, and HELP are independent. Extend metadata for canonical verb/aliases, syntax, help category, and RT policy. Generate help/completion without publishing server internals. This prevents recurring alias omissions.
8. **Organize CSS without a build step.** The 1,976-line stylesheet mixes tokens, terminal, widgets, overlays, and responsive overrides. Establish ordered sections or linked component stylesheets and shared spacing/color tokens. Do not change cascade order casually; retain theme/mobile fixtures.
9. **Make tooling boundaries visible.** Group verification and content tools separately from simulation tools; separate generated public documentation from authored pages. Consolidate the many audit/roadmap handoffs into an index with current versus historical status. Update AGENTS only after the layout actually changes.
10. **Add targeted observability.** Measure event-loop delay, save duration/failure count, active connections, auth queue depth, and combat tick duration. Report failed subsystem status in ops. A timer catch that logs and continues should not imply healthy operation. Benchmark before changing SQLite or adding dependencies.

## Product/UI enhancement direction

The terminal-first identity should remain. Improvements should reduce effort to discover and control the existing game.

- **Onboarding:** one clear form flow with immediate errors and pending state; explain stat names and remaining allocation; offer a suggested allocation with explicit player choice. Keep the textual route equivalent. Defer guildless creation and starting-city removal until product scope is decided.
- **First useful session:** a dismissible journal entry showing how to find the crier, a guild trainer, equipment, and appropriate hunting. Explain what an action accomplishes and its cost. Do not require simulator scripts to make ordinary play understandable.
- **Toolbar:** combine identical Info/Score outputs, group character panels, and distinguish Scripts from layout/settings. Keep common actions reachable at mobile widths without an unexplained horizontal strip of eleven controls.
- **Wayfinding:** searchable in-town destinations and a visited-room trail/minimap using observed exits. Distinguish directions from auto-walking; avoid exposing undiscovered world topology by accident.
- **Panel behavior:** persistent, clearly titled panels with loading/empty/error states, timestamps or refresh indicators, and independent chat. Desktop and mobile opening/closing should follow one rule.
- **Combat/readiness:** retain prose vitals and the existing RT treatment, but keep accessible resource names accurate (the Barbarian Inner Fire gauge appeared as “Mana” in the accessibility tree). Add clear script-running/paused/error status and one reliable stop action.
- **Customization:** multiline script editor; config validation and export; reset layout/theme; visible scope for character scripts versus browser preferences. Prefer undo for reversible edits.
- **Accessibility:** keyboard routes, visible labels, select behavior, active-element preservation, live-region noise controls, contrast across all themes, and real-device zoom/keyboard testing. Existing roles and CSS are a starting point, not an accessibility certification.
- **GM/admin:** honor deep links, consolidate credential/error handling, distinguish stale from live data, and separate inspect/reload actions clearly. Verify these workflows without launching simulators.

## Sequence and completion gates

| Phase | Deliverable | Exit condition |
|---|---|---|
| 1. Establish baseline | Integrate existing WIP deliberately; correct docs IDs/claims; repair deterministic test failure and isolated verification | Clean checkout boots; full required checks green with no hidden skips; baseline artifacts tied to revision |
| 2. Protect state | Atomic economy operations, graceful save/shutdown, config safety, password redaction, deployment profiles | Restart/fault tests preserve invariants; import cannot inject markup; no credential echo |
| 3. Repair lifecycle and UI | Login/logout/reconnect, script completion, windows, Health, panel correlation, keyboard/focus, inline errors | Browser journeys pass on desktop/mobile with unsolicited messages and reconnects |
| 4. Improve maintainability | Wire schema, command metadata, narrowly scoped domain/widget extractions, immutable content | Behavior fixtures pass; no new cycles/shared mutable world state; module ownership documented |
| 5. Polish the player journey | Simplified toolbar, first-session guidance, navigation, script editor, config UX, GM workflow | Human-usable fresh-character journey; physical-device and assistive-tech checks recorded |
| 6. Readiness review | Review defects, intentional divergences, scope, evidence and remaining risks | All P1 findings closed; material P2 issues fixed or explicitly accepted with rationale; then start simulator work |

“Comprehensive” should mean a declared, coherent scope with reliable user journeys and evidence—not every DragonRealms mechanic implemented. The existing roadmap centers on circle 10 while new files target 11–30, and planned guildless creation would change onboarding substantially. Default recommendation: stabilize current scope first, then choose those expansions explicitly.

Before simulator work, require fresh-account onboarding, move/look, help, equipment purchase/use/sale, combat and recovery, one training/circle path, save/reload, logout/reconnect, script start/stop/completion, config round-trip, and authorized GM inspection to work without hidden test privileges. Validate representative magic/nonmagic/noncombat play; full race×guild pacing belongs to the later simulator phase.

## Third implementation batch — 2026-09-06

- Fixed restock targets being captured after early purchases. Targets now snapshot authored stock when the economy module loads, and each shop restocks once per tick even if referenced by multiple rooms. Shared mutable NPC stock across Game instances remains a separate architectural issue.
- Corrected the documentation verifier's invalid `execSync` invocation. Both generators now accept `DR_DOC_OUTPUT_DIR`; verification renders into a unique temporary directory, compares bytes, and cleans up without rewriting tracked documents. Checked that the current failure path preserves all three generated files.
- Main verification now includes data integrity and documentation consistency, uses the current Node executable, and explicitly reports skipped corpus/browser checks. Corpus execution requires `DR_VERIFY_CORPUS=1` and a disposable server on port 3000; it no longer silently creates accounts on whatever world happens to be running. Temporary corpus files are unique and cleaned up, and failed capture prevents replay.
- Validation: focused economy tests 4/4 pass; full `npm run verify` ran 437 tests, 436 passing, with the existing `weaponPlan emits a buy for every kit weapon` failure. Syntax and data integrity pass. Documentation still reports three duplicate IDs and one ambiguous fuzzy status match. Generated documents are reproducible. Corpus and browser checks were explicitly skipped this batch; no simulator was run. Full output: `/tmp/dr-audit-verification.log`.

The verification gate is now more honest but is not yet a complete isolated end-to-end runner. Remaining work includes correcting roadmap identities/matching, resolving the weapon-plan failure alongside current guildless onboarding edits, and isolating corpus/browser worlds automatically.


## Fourth implementation batch — schedule, onboarding and transfer integrity

Execution order and simulator entry criteria are tracked in `docs/IMPROVEMENT-SCHEDULE.md`. Simulator expansion is authorized after core readiness; no additional general approval is needed.

- Corrected the three duplicate roadmap IDs to f212–f214. Status matching now compares feature labels, avoiding incidental wording from long descriptions. This remains heuristic matching, not proof of semantic coverage. Regenerated the roadmap; documentation consistency passes.
- Corrected the obsolete weapon-plan assertion: the current default kit buys dagger/club/broadsword/sling and avoids redundant mace training. All seven weapon-plan tests pass without changing the simulator kit.
- Character creation now uses the server's 2–20-letter name limit, inline errors, duplicate-submission protection and named attributes. Allocation validates whole-number input. Typed guildless creation works. Fixed the creation-to-allocation transition hiding the entire card through the submit button's parent. Duplicate names now get a plain-language server error.
- Browser evidence on a disposable world: invalid name stays editable; duplicate name displays a retryable inline error; excess allocation is rejected and re-enables the button; valid allocation updates STR 35→40 and remaining points 30→25; allocation controls remain visible; entry succeeds; at 390×844, document width is 390px. This is DOM/semantic validation, not a completed visual or assistive-technology review. Browser task space and disposable server closed afterward.
- Extracted `server/inventory-transfer.js` as the shared synchronous transaction boundary for inventory and silver. Shop and vault operations use it. Vault failure tests verify ownership is preserved in live memory and on reload.
- Auction listing, buyer delivery, buyer payment and online/offline seller payment now commit together. Success notifications follow commit. Expiry returns items once and merges instance metadata into existing vault holdings instead of dropping it. Four injected-failure/reload tests cover posting, online payment, offline payment and expiry.
- Extracted `server/crafting.js` for atomic material consumption, output and durable work-order completion. Forge/shape/tailor/imbue/brew handlers retain their skill checks and prose. Rewards follow commit. Work-order payment commits with order removal. Four tests cover output rejection without experience, work-order failure/reload, intended failed-brew consumption and claim rejection.
- Remaining readiness work: process recovery and backup/restore drills, deployment defaults, isolated corpus/browser runner, full supported player journeys and spectate restoration. No simulator cohort or pacing claim is made in this batch.

### Fourth-batch final verification receipt

`npm run verify` passes: **446/446 tests**, syntax, data references and documentation consistency. A work-order object-identity regression found during the combined run was corrected, with the active order mutated only after commit. The targeted order suite passes 8/8. Full final output is `/tmp/dr-improvements-final-verify.log`. Corpus integration and the separate browser regression suite remain explicitly skipped; the onboarding browser checks above were performed separately. `git diff --check` passes. Changes remain uncommitted; no shared-world restart or simulator run was performed.


## Fifth implementation batch — recovery and isolated corpus (September 7)

- Added `scripts/backup-db.mjs`: a read-only SQLite source connection creates a consistent `VACUUM INTO` snapshot, checks integrity, publishes a private complete file without overwriting, and removes temporary data. Live-WAL tests confirm committed data survives restoration and later source writes do not alter the snapshot.
- Added `scripts/lib/disposable-world.mjs`: starts the actual server entry point with an owned database, temporary port and dedicated random GM credential, disables test/debug HTTP APIs, waits for readiness, and shuts down with a bounded fallback. Token-file cleanup checks ownership before deleting.
- Added a real-process recovery regression: create/enter over WebSocket, allocate stats without saving, confirm disk is still old, send SIGTERM, confirm successful exit and durable allocation, snapshot to a new path, restart from that snapshot, and authenticate using the restored session. This covers an actual process restart rather than only calling the shutdown function in-process.
- Added `scripts/verify-corpus.mjs`. Capture and replay now run in separate fresh worlds with temporary databases and artifacts. `DR_VERIFY_CORPUS=1 npm run verify` invokes this runner automatically. The lower-level corpus harness accepts `DR_WS_URL` and reports connection errors clearly.
- First standalone isolated run matched 184 captured messages. This proves same-revision repeatability within the corpus's normalizations; numeric correctness and cross-revision preservation are separate claims.
- Recovery instructions, limitations and exact commands: `docs/RECOVERY.md`. No production database was backed up or restored by these tests; all worlds and data are disposable.

### Fifth-batch final verification receipt

`DR_VERIFY_CORPUS=1 npm run verify` passes: **448/448 tests**, syntax, data integrity, documentation consistency, and isolated corpus capture/replay (184 messages). Browser regression remains explicitly skipped and needs its own runner repairs. Final output: `/tmp/dr-recovery-full-verify.log`. Corrected two stale authored roadmap claims (race count and field-experience banking) and marked `docs/REMAINING.md` as a historical snapshot; documentation consistency was rerun and passed after those edits. `git diff --check` passes. Simulator work remains behind the core-readiness review.

## Sixth implementation batch — browser checks and player control

- Split the browser suite into `scripts/lib/client-checks.mjs` and a standalone Chromium driver. The driver starts an owned world/database/profile, uses a browser-assigned debug port, supports `DR_CHROMIUM_PATH`, propagates CDP errors, bounds requests, and cleans up on failure. A regression test confirms missing-browser failure exits nonzero with no owned database/profile left behind.
- Browser waits now throw on timeout. Replaced obsolete numeric-vital, seven-window and unversioned-config expectations; race/guild flavor checks run before form submission. Navigation uses current content paths through normal player commands instead of the stale hardcoded sewer route. Added purchase/equip, mobile geometry, focus-return, accurate Inner Fire name, logout-token and stopped-script assertions.
- The real browser run found a gameplay defect: automatic swings renewed roundtime before ordinary flee commands could run. A flee request during RT now pauses automatic player swings and gets an escape attempt when RT ends. Enemy actions continue, normal escape probability remains, and failed escape resumes combat. Existing desperate low-health escape remains immediate. Targeted combat/roundtime tests pass. This deliberate control change should be recorded when comparing later simulator runs with historical baselines.
- Inner Fire now updates the resource gauge's accessible name and tooltip; a plain-text prompt without a structured message no longer crashes when reading buffs.
- **78 shared browser assertions pass through ego-browser** against a fresh actual server with test/debug HTTP APIs disabled. Coverage includes register/create/allocate/enter, panels, windows, scripts, chat, current-map navigation, buying/equipping a dagger, combat/escape, customization, persisted scripts after fresh login, 390×844 mobile bounds, focus return and logout. This is a semantic/DOM/CDP test pass, not pixel-level or assistive-technology certification. The standalone Chromium driver's successful launch path was not separately exercised; its negative path is tested.
- `DR_VERIFY_BROWSER=1` now opts the main verifier into the standalone browser gate; missing prerequisites are failures, and omitted gates remain explicit skips. The main verifier only says all configured checks passed when none were skipped.
- Browser receipt: `/tmp/dr-browser-gate-final.log`. Browser space and disposable world closed successfully. Shared development worlds were not restarted.

### Sixth-batch final verification receipt

**450/450 tests pass**, plus syntax, data integrity, documentation consistency and isolated corpus capture/replay (184 messages). Shared browser assertions pass **78/78** separately through ego-browser. The main invocation did not run the standalone Chromium driver, so its browser step correctly reports SKIP. Final main log: `/tmp/dr-browser-batch-final-verify.log`; browser log: `/tmp/dr-browser-gate-final.log`. `git diff --check` passes. Remaining work before simulator readiness includes runtime-state isolation, deployment/startup review, and the uncommitted-source integration concern from A07; no simulator cohort was launched.


## Seventh implementation batch — runtime isolation and launch profiles (September 8)

- Each Game constructs its own economy service. Shop stock, purchase depletion and restock targets are local to that instance, and authored NPC definitions are unchanged. Legacy direct `economy` calls retain their interface with a separate standalone stock collection. Game facades and the restock timer use the owned service. Regression tests cover inter-world independence, unchanged content, later world construction and the original capacity after purchases.
- Added pure, validated runtime configuration. Default desktop mode now binds loopback, preserving its existing local API while leaving debug disabled. Explicit public mode requires a configured GM credential, defaults test/debug APIs off, and requires a separate configured credential to enable public debug. Invalid ports/profiles and accidental non-loopback local binds fail explicitly.
- New generated GM credentials use cryptographic randomness. Credential reuse checks private ownership and rejects symlinks. Publication atomically replaces files with private permissions, including pre-existing permissive files, without following symlinks. Fault-path tests ensure the symlink target remains unchanged.
- Disposable-world tooling pins local mode and loopback explicitly, so inherited public-host environment settings do not leak into tests.
- Launch behavior and the change required for LAN users are documented in `docs/LAUNCH-PROFILES.md`. Current shared worlds were not restarted; configuration changes apply on their next launch.

### Seventh-batch final verification receipt

**456/456 tests pass**, plus syntax, data integrity, generated documentation consistency and isolated corpus capture/replay (184 messages). Invalid launch configuration now fails before opening a database, covered by an actual entry-point subprocess test. Final log: `/tmp/dr-runtime-isolation-final-verify.log`. The standalone browser step remains explicitly skipped; previous shared browser evidence is unchanged. Shared worlds were not restarted.

## Eighth implementation batch — shared crafting policy (September 8)

- Extracted guild affinity and learned-technique lookup into `server/crafting-policy.js`, consumed by both production commands and technique learning. Removed unused station, skill, cost and slot-import remnants from the items module. Existing crafting values, station availability and command prose are preserved.
- Validation after extraction: syntax checks for all three affected modules and **22/22** existing tests across crafting techniques, atomic crafting, work orders, enchanting and economy pass. Receipt: `/tmp/dr-crafting-policy-tests.log`. The 456-test full-suite receipt above precedes this extraction; it is not a claim of another full-suite run. `git diff --check` passes.
- Remaining readiness work includes successful standalone Chromium launch, spectator lifecycle checks and source integration review. Simulator cohorts remain queued after that review.

## Ninth implementation batch — standalone browser and spectator restoration (September 8)

- The standalone Chromium runner successfully launched its own browser, profile, database and world, and passed all 78 shared assertions. Receipt: `/tmp/dr-standalone-browser.log`. This closes the previously untested successful driver path.
- Found and fixed missing screen restoration after `unspectate`. The server now confirms restoration and replays the original session view without re-entering the world or replacing the allocation draft. Playing restoration refreshes the player's room, vitals and equipment. Client cleanup removes watched state, leaves automation stopped, and prevents the same deep link from immediately restarting watch mode.
- Failed player-watch requests restore the original view; a failed target switch ends the previous feed. Removed the interval that repeatedly hid the welcome screen. The protocol is documented in `docs/CLIENT-PROTOCOL.md`.
- Wire regression suite: 8/8 pass, including login, creation, allocation, playing, selection, preserved allocation and runtime object identity, and a missing target after an existing subscription.
- Six browser checks pass through ego-browser on an owned world: deep-link exit, creation controls, allocation controls, playing controls, character selection, and missing-target recovery. Receipt: `/tmp/dr-spectate-browser.log`. World shutdown returned code 0; browser task space closure confirmed. These are DOM/semantic checks, not physical-device or screen-reader certification.
- The disposable-world helper now returns its already-generated GM credential to the owning test caller, avoiding a race reading the asynchronously published credential file. No credential is included in test receipts.

### Ninth-batch full verification receipt

`DR_VERIFY_CORPUS=1 DR_VERIFY_BROWSER=1 DR_CHROMIUM_PATH='/Applications/Chromium.app/Contents/MacOS/Chromium' npm run verify` passes with **no skipped gates**: **458/458 tests**, syntax, data integrity, documentation consistency, corpus replay (184 messages), and **78/78** standalone Chromium assertions. Receipt: `/tmp/dr-readiness-full-verify.log`. The six spectator browser checks above supplement that gate. Changes remain uncommitted; shared worlds were not restarted.

## Tenth implementation batch — admin navigation (September 8)

- Fixed A20: valid initial hash takes precedence over saved tab, invalid hashes fall back to a valid saved tab or Overview, and unknown tab requests preserve the current panel. Hash matching rejects trailing junk instead of partially interpreting it.
- Added roving keyboard focus, Left/Right wrapping and Home/End selection, plus explicit tab/panel ARIA relationships. Only the selected tab participates in ordinary Tab navigation.
- Both affected modules pass syntax checks. **8/8 browser checks** on an owned actual server cover hash/saved/default precedence, rejected unknown tabs, back/forward navigation, arrow/Home/End behavior, focus, and linked semantics. Receipt: `/tmp/dr-admin-navigation-browser.log`. The world shut down with code 0 and the browser task space was closed. No GM mutation or shared-world operation was performed.
- The full gate above precedes this small admin-only change; it is not a claim of a second full-suite run. `git diff --check` passes. Outstanding core review includes A17 (script editing/ownership), A19 (migration failure handling), static artifact policy under A18, and A07 (source integration).

## Eleventh implementation batch — atomic schema upgrades (September 8)

- Fixed A19's swallowed errors. Extracted `server/schema.js` from connection ownership in `server/db.js`. Version 1 brings fresh and historical schemas to the current baseline; migration history is recorded only on commit. Additions inspect actual columns and propagate contextual failures.
- The entire upgrade, including schema creation, column additions, the guildless rebuild and indexes, is transactional. Startup refuses failures and newer schema versions. Foreign-key checks run before commit, and connection settings are restored afterward.
- The guildless rebuild preserves the original CREATE statement apart from the known guild constraint, preserving CHECK/default/UNIQUE/extra-column definitions. It recreates custom indexes and triggers, retains views and child rows, and preserves the AUTOINCREMENT high-water mark. A pre-existing rebuild table or unknown declaration fails explicitly without deleting evidence.
- Six new migration tests cover fresh/repeated upgrades, legacy state and dependent objects, failure during additions, failure after rebuilding, a pre-existing temporary table, orphan rows and future versions. **17/17 focused tests** including guild joining and real process recovery pass. Receipt: `/tmp/dr-schema-focused.log`. All test databases are disposable; no shared world/database was upgraded.

## Twelfth implementation batch — static artifact policy (September 8)

- Closed the remaining A18 static-policy finding: database/journal/backup files and hidden paths are not served; symlinks are resolved and checked against the canonical public root and the same artifact policy. Directory HEAD requests now return 404 rather than exposing directory metadata.
- Logs and JSON reports remain intentionally public for the existing simulator viewers. The policy and filename-based limitation are explicit in `docs/LAUNCH-PROFILES.md`; private files with arbitrary allowed extensions still belong outside `public/`.
- **12/12 static tests pass**, including GET/HEAD/Range rejection, encoded hidden paths, outside-root and disguised-database symlinks, and real HTTP log tail/report access. Receipt: `/tmp/dr-static-policy-tests.log`. Syntax and `git diff --check` pass. The full migration run was already underway before this static-only change; its test count is separate from these two new static tests.

### Migration/full-gate verification receipt

`DR_VERIFY_CORPUS=1 DR_VERIFY_BROWSER=1 DR_CHROMIUM_PATH='/Applications/Chromium.app/Contents/MacOS/Chromium' npm run verify` passes with no skipped gates: **464/464 tests**, syntax, data integrity, generated documentation, corpus replay (184 messages), and **78/78 Chromium checks**. Receipt: `/tmp/dr-schema-full-verify.log`. The static-policy change made after that test suite started has its separate **12/12** focused receipt above; the browser portion completed successfully afterward. No shared world restart, persistent database migration or simulator cohort was performed.

## Thirteenth implementation batch — script editor and character ownership (September 9)

- Addressed A17 with a labeled multiline textarea, Edit/Copy/Cancel controls, dirty/pending feedback, inline name/body validation and confirmed save/delete results. Drafts survive panel close/reopen within the session, and server library refresh preserves editor selection/focus. Session changes clear the draft.
- Character libraries are authoritative snapshots and are no longer merged into the browser store. The old browser library remains visible as a copy source, explicitly excluded from automatic execution. Deleted scripts cannot reappear from that archive. Watched-player library updates are ignored and return-from-watch restores the owner's library.
- Script writes/deletes now use correlated responses and restore live state on a persistence failure. Fourteen focused ownership/session tests pass, including durable acknowledgements and injected write/delete failures. Receipt: `/tmp/dr-script-ownership-focused.log`.
- **10/10 browser checks** pass for multiline editing, archive separation/copying, confirmed saves, edit/cancel, invalid drafts, panel reopen, character switching, deletion after reload and 390px mobile bounds. Receipt: `/tmp/dr-script-editor-browser.log`. The owned world exited with code 0 and the browser task space was closed.
- The existing standalone Chromium suite also passes **78/78** with its old browser-cache assertions replaced by checks of the confirmed character library and server restoration. Receipt: `/tmp/dr-script-editor-regression.log`. Script language/limits and built-in examples are unchanged; saved syntax is not certified to execute successfully merely because persistence passed.

### Thirteenth-batch full and clean-source receipt

The working tree and a clean 851-file source copy both pass the complete gate: **468/468 tests**, syntax, data integrity, generated docs, corpus replay (184 messages) and **78/78 standalone Chromium checks**, with no skipped gates. Logs: `/tmp/dr-script-library-full-verify.log` and `/tmp/dr-source-integration-verify.log`. The clean copy used a fresh lockfile install, and no manifested source file changed during verification. See `docs/CORE-READINESS-2026-09-09.md` for the inventory digest and the explicit distinction between development readiness and the remaining Git-only release condition. No source was staged or committed; concurrent content edits after this snapshot remain separate.

## First simulator implementation batch — actual script execution and cancellation (September 9)

- Found that the browser simulator accepted `autorun` by setting a flag but never instantiated or fed a script engine. The flag then suppressed normal hunting. Added an independent interpreter/library per agent using the existing DR engine, with nested-script lookup, wire-message feeds, timer heartbeat, and cleanup on completion/stop.
- Fixed a pending-authentication cancellation race: a late response can no longer open a WebSocket after Stop. Authentication fetches are abortable; startup has a 15-second timeout; delayed command sends check stopped state; stop clears the interpreter and timers. Pending launches expose Stop and participate in the page's emergency-stop action.
- **36/36** interpreter/controller tests pass, including nested execution, prompt advancement, independent libraries, missing scripts and cancellation. Receipt: `/tmp/dr-browser-agent-script-tests.log`.
- **4/4 simulator-host browser checks** pass with a controlled HTTP/WebSocket transport: pending Stop availability, late-auth cancellation, real interpreter execution and prompt-driven completion/cleanup. Receipt: `/tmp/dr-sim-browser-smoke.log`. This is functional browser evidence, not a progression cohort or a pacing/fidelity claim. The owned server exited successfully and the browser space was closed.
- Follow-up review: browser launcher still depends on the optional HTTP test API; race/guild options include stale entries; startup name-error recovery still expects older prose; fresh versus reused characters, duration/input bounds and explicit outcome metadata need work before cohorts. The original `live-sim.mjs` also hardcodes its target address; distinguish that legacy CLI from the browser launcher and script-driven fidelity sweeps.
- Syntax and whitespace checks pass for the files changed in this batch. An unrelated concurrent whitespace change in `data/skills.js` was left untouched. Full baseline receipts precede these simulator changes; the targeted and browser receipts above cover this batch.


## Simulator batch 2 — fresh WebSocket launch and explicit outcomes (September 9)

The browser launcher now registers over the normal WebSocket handshake with a new random account per run. It no longer depends on the HTTP test API or silently reuses an old character. Occupied names fail visibly without renaming. The shared launch contract checks authored race/guild IDs and bounded numeric options before connecting; form errors appear inline. Each run records its ID, original configuration, start/end times and reason, with distinct running, failed, cancelled, target, script-finished, time-limit and interrupted states. Credentials are omitted from persisted rows and cleared on stop. A deadline timer also bounds silent connections; startup and starter-library timeouts fail explicitly.

Validation: seven focused config/interpreter tests pass (`/tmp/dr-sim-launch-tests.log`). Seven functional browser checks across isolated fresh worlds confirm real registration/chargen/script command dispatch with the HTTP test API disabled, no HTTP authentication requests, duplicate active-launch rejection, roster Stop cleanup, occupied-name failure, inline invalid-form feedback, and outcome persistence after reload (`/tmp/dr-sim-auth-browser.log`). The initial pointer-driven Stop assertion did not observe cancellation; a subsequent DOM control activation verified the handler and cleanup. Pointer interaction therefore remains part of the later UI pass. Both owned worlds shut down cleanly and their temporary databases were removed.

These are functional launch checks, not progression/pacing or historical cohort comparisons. The earlier 468-test clean-source receipt predates this batch and concurrent gameplay edits. Remaining simulator work includes stall detection, clearer per-run result presentation, short representative cohorts with matched parameters, and the legacy CLI launcher's hardcoded server endpoint.


## Simulator batch 3 — stable controls and inactivity diagnostics (September 9)

Roster updates now retain row and button identity across prompt/timer refreshes. Stop targets a run ID, buttons have character-specific accessible labels, and Watch/Stop no longer toggle the settings panel. Open settings retain their draft and focus; their controls become disabled after termination. Failure reasons are visible in the roster rather than available only as hover text.

The new pure `agent-health.js` diagnostic warns after 60 seconds without a script command and clears on renewed activity. It explicitly allows legitimate script waits and does not mark these runs failed or alter progression. Existing runtime deadlines still bound runs. This detects command inactivity, not all forms of progression stalls.

Validation: 10 focused launch/interpreter/health tests passed. Eight browser assertions across disposable actual worlds passed: button identity/focus retention; pointer Stop with intervening renders; no settings toggle from Stop; settings draft/focus retention; keyboard Enter activation; injected inactivity warning; warning clearing; and disabling mounted settings on stop. The first interaction probe targeted the initially collapsed launch section; the corrected probe expanded it. Keyboard activation used the full native Enter event sequence. Logs: `/tmp/dr-sim-controls-browser.log`. Each owned world exited cleanly and its temporary DB was deleted. These are short functional runs across barbarian/warmage, not pacing cohorts or historical comparisons.

Broader validation: `npm test` passed 480/480 tests with no skips (`/tmp/dr-sim-controls-tests.log`); simulator module syntax and scoped whitespace checks passed. This is the current working-tree unit/integration suite, not a repeat of the earlier clean-source corpus/browser gate.


## Simulator batch 4 — fresh-character routing (September 9)

A one-minute browser cohort (fresh human barbarian / elf warmage, default stats, requested boost ×20, Circle-2 target, two concurrent agents, one sample per configuration) ended with both agents at Circle 1 in the town square. Both terminated as `time_limit`. Evidence: `/tmp/dr-browser-cohort-20260909.json`. No milestone or best-result promotion: detailed requirement rows/deaths were not captured, no matched historical baseline was established, and a minute is below the existing sweep classifier's warm-up period. This is functional stall evidence, not a pacing comparison. An earlier inspection attempt failed because disabling the HTTP API also disables GM endpoints; its world exited cleanly.

Inspection and a wire trace found incomplete starter-generator inputs: no shop route for naked fresh characters, no shop-to-arena route, and no actual origin on the initial arena route. `server/starter-scripts.js` now supplies all three from authored geography. The regression covers both guilds and executes the origin-gated outbound step through the real interpreter. Five focused route/interpreter tests, syntax and scoped whitespace checks pass.

A short post-fix isolated barbarian probe traversed the square → bazaar → east road, demonstrating that provisioning/travel no longer parks at the initial square (`/tmp/dr-starter-route-browser.json`). It does not establish arena arrival, successful equipment purchases, Circle 2, or long-run recovery. All disposable worlds were stopped and removed. Next hypothesis: with complete route inputs, a matched one-minute cohort should leave the initial square and produce observable hunting activity; capture per-agent commands, equipment, skills and requirement rows before any progression ranking. The prior 480-test result predates this route fix.


## Source integration closeout — September 9

User authorized reconciliation and commits of outstanding work. Core source is committed as `fa3cabc`, simulator repairs as `fc319c3`. The first combined gate passed syntax/data/docs/corpus/browser but exposed the existing random justice test: several profitable thefts could precede arrest, invalidating its assumption that the remaining purse must be below the original 100. The test now fixes theft/coin/arrest rolls and asserts the exact 79-silver remainder. Full rerun: 481/481 passed. This was a test correction, not a change to arrest mechanics. A staged-file whitespace check also removed one trailing blank line from crafting-policy.

See `INTEGRATION-CLOSEOUT-2026-09-09.md` for clean committed-source evidence and remaining Barbarian work. The accumulation of untracked implementation files is closed by these commits; broad progression/accessibility/content claims remain scoped to their actual evidence.
