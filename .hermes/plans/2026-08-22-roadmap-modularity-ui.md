# Roadmap Audit, Modularity & UI Fidelity — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close the gap between ROADMAP.md and the code, tighten module seams, and make the client + admin UI feel more like DragonRealms while staying more usable than the original.

**Architecture:** Three workstreams, each independently shippable: (A) roadmap alignment fixes in `data/` + domain modules; (B) modularity — extract leaked domain logic out of `server/game.js` (899 lines) into the existing delegate modules; (C) client/admin fidelity pass building on the window-manager + paper-doll foundation just landed.

**Tech Stack:** Node 22 ESM, zero deps, SQLite via node:sqlite, vanilla JS client. Tests: `npm test` (250 tests).

---

## Workstream A — Roadmap alignment (highest-value gaps first)

### Task A1: Barbarian bonus stance points must affect combat
Roadmap P11 says "🚧 totals are calculated and displayed; bonuses do not yet change allocation or combat outcomes."
**Files:** `server/combat.js` (defense calc), `server/player.js` (~line 777 has the ranger/barbarian bonus calc).
- Write failing test in `test/combat.test.mjs`: barbarian with 120 Defending gets +2 effective stance vs a non-barbarian.
- Apply bonus wherever base stance is read in combat resolution.
- Verify: `npm test`; commit `feat(barb): bonus stance points apply to combat outcomes`.

### Task A2: Enchanting discipline (last missing craft)
P26/P3: "Enchanting discipline remains."
**Files:** new station in `data/world.js` (Crossing guild district), craft logic beside Forging/Alchemy v1 in `server/economy.js` or its own `server/crafting.js`.
- Artificing/Binding/Invoking techniques; input: gem/mote + item → enchanted variant (+quality magic edge).
- Test in `test/economy.test.mjs` following the alchemy v1 test shape.
- Commit `feat(crafting): enchanting discipline v1`.

### Task A3: Empath/Ranger pacing outliers
Simulator table shows Empath 75.6h / Ranger 40.4h vs Barb 15.6h.
**Files:** `scripts/simulate-progression.mjs`, then exp-rate tuning in `server/player.js` pulse fractions for Life-mana guilds.
- Re-run per-guild sim after change; target spread < 2× between fastest/slowest.
- Commit `balance(exp): narrow guild pacing spread` with updated ROADMAP.md table.

## Workstream B — Modularity

### Task B1: Extract combat-command handlers from game.js
`server/game.js` still holds ~300 lines of command-adjacent logic. Move pure-domain pieces into `server/combat.js` / `server/wilds.js`, leaving game.js a thin facade (AGENTS.md's stated pattern).
- Guardrail: `npm run verify` corpus replay must show zero diffs (`node scripts/client-corpus.mjs capture /tmp/a.json` before, replay after).

### Task B2: Client message-router split
`public/js/main.js` message switch (18 cases) grows every feature. Extract to `public/js/router.js` mapping type → handler module import; main.js keeps only boot/routing.

## Workstream C — DR-fidelity UI

### Task C1: Prompt-line fidelity
DR shows `[X] >n You're dead...` style cues and roundtime flash. Add: RT countdown chip pulsing in status strip while RT > 0 (client-only, data already in prompt).
**Files:** `public/js/status.js` renderStatusStrip.

### Task C2: Admin dash polish
`public/admin.html`: unify token/GM state banner (now auto-filled from launcher), add sparkline hover values, dark-theme tokens consistent with Ember.
### Task C3: Windows-menu defaults for paper doll
Ensure Hands window force-shown once doll data arrives (setWindowVisible force path) so new players see it.

## Verification
- After each task: `npm test`
- After B-tasks: corpus capture/replay diff = none
- End of session: `npm run verify` (needs server on :3000)

## Risks
- A3 balance changes affect sim baselines in ROADMAP.md — regenerate doc via `npm run roadmap-doc`.
- B1 refactor risks behavior drift — corpus replay is the safety net; if diff ≠ 0, revert hunk-by-hunk.
