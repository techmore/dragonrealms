# Paper-Doll UI — Options Analysis & Ranked Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
>
> **Status:** COMPLETE — merged from background subagent analysis (deleg_22df5274, 2026-08-24)
> + local verification. Planning only; nothing implemented yet.

**Goal:** Make the HANDS-window paper doll the best possible at-a-glance character surface —
what I'm wearing, how hurt it is, what's bleeding — without violating DR fidelity
(prose condition words in player-facing UI, zero dependencies, no build step).

**Architecture:** Static SVG (`public/index.html` #hands-doll, viewBox 0 0 140 230) + render
functions in `public/js/status.js` + CSS state classes in `public/css/style.css:404-520`.
Server pushes `{t:'hands', slots}` on `p.handsDirty` (`server/status.js:40`); wounds arrive
every prompt via the `[bleeding: …]` tag.

---

## 1. Current state (post today's fixes)

Landed already: symmetric redraw on x=70; neck region; chest→torso normalization;
word-ladder health tint; bounded wound tooltips; arms/legs armor items.

Regression coverage today: ONE assertion on `#hands-hand` text (`scripts/client-regression.mjs:87`).

## 2. Latent defects found during analysis (fix-first list)

1. **Stale bleed tooltip** — `renderWounds()` (status.js:295-313) strips the `— bleeding:` suffix
   only inside the has-wounds branch; when bleeding stops the tooltip keeps it forever.
2. **Dropped `tended` flag** — `parsePrompt` regex captures `(?:, tended)?` but discards it;
   `{part, severity}` never carries `tended`, so `.pd-tended` CSS (style.css:508-513) is dead
   code and tended wounds pulse instead of holding steady amber.
3. **Invisible neck connector** — the `<path>` at index.html:68 sits outside any `.pd-region`
   with `stroke="none"`; untouched by health tints (gap in the figure's spine).
4. **No death visual** — `renderDollHealth` maps dead→critical; `[data-health="dead"]` has no CSS.
5. **Unknown-word fallback hazard** — `HEALTH_LEVEL_OF_WORD[...] || 'healthy'` silently maps any
   future server-side ladder addition to healthy; needs a test pinning
   `HEALTH_LEVEL_OF_WORD ⊇ VITALITY_WORDS`.

## 3. Full option catalog (16 options)

| # | Option | Impact | Cost | Risk |
|---|--------|--------|------|------|
| A1 | Fix latent correctness bugs (§2 items 1,2,4,5) | Tooltips tell truth; tended reads tended | S (~30 lines + tests) | Nearly none |
| A2 | Non-hue damage encoding (stroke-dasharray for damaged, shape overlay for wounds) | Deuteranopia-safe; grayscale-readable | S (CSS) | Dash/pulse stacking noise |
| A3 | Keyboard-focusable regions (tabindex, :focus-visible mirrors :hover, aria-describedby) | Operable without mouse; SR per-region state | S-M | Focus-order noise |
| A4 | Idle breathing + wound-onset flash (delta-detected empty→pd-wounded), reduced-motion gated | Alive figure; new bleeds grab attention | S | Gimmick creep |
| A5 | Hover cross-linking region ↔ #hands-worn row | Fastest "what's damaged?" answer | M (~40 lines) | Two name sources |
| A6 | Click-to-draft commands (`remove <item>` drafted into #cmd, never auto-sent) | Doll becomes quickest inventory surface mid-combat | M | Accidental clicks mid-fight; must draft not send |
| A7 | Gear-condition prose words in tooltips (pristine→scuffed→worn→battered beside %) | DR appraise flavor; numbers stay tooltip-only | S | Word fidelity (check elanthipedia dump) |
| A8 | Distinct death visual ([data-health="dead"] desaturate/collapse) + guaranteed reset on enter | Death reads instantly | S | Pose variant maintenance |
| A9 | Neck/spine cosmetic completion (region-consistent stroke, tint selectors) | No invisible gap | S | None |
| B1 | **Layered gear silhouettes** — garment shapes drawn ON the figure via material-class matrix (cloth/leather/mail/robe × slot ≈ 15-25 paths), SLOT_STYLE map keyed on name keywords | Transforms LEDs-on-mannequin into true paper doll; biggest single upgrade | L (art-heavy, still zero deps inline SVG) | Art volume/taste; condition tint layering |
| B2 | Dedicated HEALTH sub-window — collapsible pane of prose wound rows ("left arm — bleeding heavily"), same promptState.wounds source | Strongest fidelity play; DR has this window; tooltip-only model hides active bleeders mid-fight | M (~60 lines) | Rail vertical space contested |
| B3 | Encumbrance/burden cue (bar or posture) | Weight matters in DR-family | M-L (server snapshot extension) | Systems scope creep |
| C1 | Per-item unique glyph icons | More identifiable | M-L (30+ icons) | Maintenance treadmill; clutter at 104px |
| C2 | Race/guild-specific figures | Character identity | L-XL | No chargen build data to drive it |
| C3 | Drag-and-drop outfitting | Modern feel | L + protocol | Wrong genre grain; no drag source widget |
| C4 | Bleed particle FX | Juicy/gory | M | Tack-risk high in prose-first aesthetic |
| C5 | Perf micro-pass (cache NodeList, batch writes) | None perceptible | S but pointless | False economy |

## 4. RANKING

### 🏆 Best overall
**#1 — B1 layered gear silhouettes ("gear-aware figure")** — the only option that changes what
the UI *is* rather than refining what it *says*. 13 torso items collapse into ~4 garment classes,
so the matrix is ~8 slots × 2-4 variants ≈ 15-25 simple paths, inline SVG, zero deps.
Implementation: SLOT_STYLE map in status.js keyed on name keywords (mail/leather/robe…),
toggling pre-drawn variant groups per .pd-region (visible only when pd-filled); condition tint
applies to the garment layer where .pd-damaged works today. Pair with A1+A9 groundwork.
Impractical-ish (art-heavy, taste-sensitive) — which is why it tops this list, not the done-list.

Runners-up: **B2 HEALTH window** (strongest fidelity play, cheap enough to ship soon);
**A6 click-to-draft** (strongest interaction play).

### ⚡ Best quick wins (one session)
1. A1 correctness bundle (+ unit test pinning HEALTH_LEVEL_OF_WORD ⊇ VITALITY_WORDS)
2. A2+A3 accessibility bundle (dash-stroke encoding; focusable regions)
3. Tooling: extend client-regression.mjs past its single assertion — DOM assertions:
   dataset.health tracks prose word; pd-filled count matches worn slots; title has no repeated
   "— bleeding"; pd-tended present after tend. Plus unit test: PART_TO_REGION covers every
   BODY_PARTS entry (server/wounds.js:19)
4. A4 breathing + wound-onset flash (prefers-reduced-motion gated, style.css:1753)
5. A7 gear-condition prose words
6. A5 hover cross-linking
7. A8/A9 death visual + neck cosmetic fix while in those files

### 🌙 Moonshots not worth now
C3 drag-drop · C2 race figures · C1 per-item glyphs · C4 particle FX · C5 perf pass

### Sequencing if adopted
Quick-win bundle (A1+A2+A3+tooling) → A4/A5/A7 → B2 HEALTH window → B1 as dedicated art pass.
Nothing touches the wire protocol except optional B3; everything stays zero-dep/no-build.

---

## 5. Implementation tasks (for the quick-win bundle — first session)

### Task 1: A1 correctness fixes
**Files:** Modify `public/js/status.js` (renderWounds ~295-313, parsePrompt ~148-165,
HEALTH_LEVEL_OF_WORD ~257), `public/css/style.css` (add [data-health="dead"] block near line 470).
Steps:
1. Test first: extend client-regression.mjs with assertions listed above; run → fail
2. renderWounds: rebuild title unconditionally (base + optional bleeding section)
3. parsePrompt: carry `tended` into the wound object
4. Add [data-health="dead"] CSS (desaturate filter + dimmed stroke)
5. Unit test: every VITALITY_WORDS word exists in HEALTH_LEVEL_OF_WORD
6. `node --check` + `npm test` + live ego-browser verify (fight until wounded, tend, die once)

### Task 2: A9 neck connector + A2 dash encoding
**Files:** `public/index.html:68` (give connector path region-consistent stroke, or fold into torso group),
`public/css/style.css` .pd-damaged gets stroke-dasharray; verify pulse doesn't fight dashes.

### Task 3: A3 keyboard focusability
**Files:** index.html regions get tabindex="0" (or set programmatically), style.css :focus-visible
ring matching hover style; status.js sets aria-describedby to a shared summary node.

### Task 4: Regression tooling lock-in
**Files:** scripts/client-regression.mjs (extend), test/character.test.mjs or new test/doll.test.mjs
(PART_TO_REGION coverage + word-map coverage).

Verification protocol (all tasks): node --check touched files → npm test (280) → ego-browser live
(fight until wounded; assert dataset.health tracks HP prose; tooltips bounded; pd-tended after tend).

## 6. Open questions
- Death pose variant (A8): simple desaturation now vs kneeling-pose SVG later? Recommend desaturation now.
- B1 art pass ownership: one focused session with taste-check screenshots after each garment class?
