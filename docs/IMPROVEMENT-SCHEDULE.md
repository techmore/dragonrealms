# Improvement implementation schedule

Updated September 9, 2026. This is the execution order for the ongoing audit, implementation, simulator work, and end-user validation. Stages advance on evidence, not calendar deadlines. It is not a background scheduler.

| Order | Work | Completion check | Status |
|---|---|---|---|
| 1 | Repair verification, roadmap identities, stale kit assertions | Syntax, full tests, data references and generated docs pass; skipped integration checks clearly reported | Complete: 468/468 tests, syntax, data, docs, isolated corpus and 78/78 standalone browser checks; no skipped gates |
| 2 | Finish player onboarding and lifecycle | Invalid/duplicate names, allocation errors, entry, logout/reconnect, scripts and panels work with keyboard and mobile layout | 78 assertions pass in standalone Chromium; six spectator browser checks pass, including allocation and character-selection restoration; broader readiness review remains |
| 3 | Close remaining state/recovery risks | Vault, crafting and auction transfers survive injected failures; save/restart and backup/restore drills preserve state; deployment defaults documented | Transfers, recovery and atomic/versioned legacy migrations tested; explicit launch profiles and static artifact policy implemented |
| 4 | Make validation reproducible and improve module ownership | Disposable worlds for corpus/browser checks; independent shop state per Game; shared crafting policy; maintain protocol fixtures | World stock isolated; corpus/browser driver own disposable worlds; successful standalone Chromium launch verified; shared crafting policy consolidated |
| 5 | Review core readiness | No open P1 defect; end-user purchase/equip/combat/recover/train/save journey passes; remaining P2 limitations listed explicitly | Development baseline verified in clean source copy; see CORE-READINESS-2026-09-09.md. Core and simulator source committed (fa3cabc, fc319c3); see INTEGRATION-CLOSEOUT-2026-09-09.md |
| 6 | Improve simulator correctness and usability | Auth/chargen/join paths match supported user journeys; bounded runs and cancellation; honest failure/stall statuses; isolated artifacts and reproducible run metadata | Active: real script execution, WebSocket fresh registration, validated options, deadlines, cancellation and distinct outcomes implemented; seven isolated browser checks pass; stable pointer/keyboard controls and command-inactivity diagnostics verified; progression-stall analysis and representative cohorts next |
| 7 | Validate simulator outcomes | Small representative guild cohorts first; compare matched parameters/seeds/boost and runtime; check regression and stall rates before expanding matrix | Started: bounded two-agent cohort exposed missing starter routes; fixed and outbound travel verified. Requirement telemetry and matched post-fix cohort remain |
| 8 | Validate and polish end-user UI/UX | First-session guidance, command discovery, understandable script state, mobile/keyboard controls, stale/error states, and measured accessibility checks | Continuous: six spectator and eight admin-navigation browser checks pass; final pass after simulator fixes |

## Scope and evidence rules

- Preserve the terminal-first design, vanilla client, ESM and zero new dependencies.
- Keep concurrent gameplay work intact; record which working-tree version was tested.
- Use disposable databases/worlds for test characters. Do not restart the shared world as part of validation.
- Separate implemented, unit-tested, browser-tested and simulation-measured claims.
- A green unit suite does not prove pacing, usability, fidelity, recovery, or accessibility.
- Simulator work is authorized against the verified development source inventory. The integration receipt records committed-source verification; no shared-world restart or broad cohort is implied.
- Record each completed batch and its remaining checks in `docs/CODEBASE-AUDIT-2026-09-05.md`.
