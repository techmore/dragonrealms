# Dragon Realms Web Client — UI/UX Audit (2026-08-22)

> Resolution log: P0#2 (chargen modal race) fixed 2026-08-24 — the alloc phase
> collapses the create form, retitles to ALLOCATE & ENTER, and focuses the
> command bar so typed `enter`/`alloc` work. P0#1 (North Gate dead end)
> fixed 2026-08-24 — the gate opens onto the North Fields hunting ground.

Tested as fresh account `uiaudit1` / barbarian `UiAudit`, ~15 min live play: register → create → navigate the Crossing → bought/wielded club at Mongers' Bazaar → sewer rat combat (kills, skinning, RT) → all toolbar panels, settings, error paths.

## P0 — Bugs
1. **North Gate is a dead end that contradicts its own room text.** Desc says "Beyond the wall the wilds roll away toward the Northern Trade Route," but the only exit is `east` (back into town). New players following the promised hunting grounds hit a wall with no explanation.
2. **Character-creation modal never closes.** After `Create character` succeeds and the text stream says 'type "enter" to begin', the NEW ADVENTURER dialog stays open; typed `enter` commands appear ignored while it's up (must click "Enter the world" button). Two competing creation flows (modal vs. text commands `alloc`) are shown simultaneously.
3. **Navigation topology is loop-riddled with duplicate room names.** "Crossing Walk / Crossing Row / Crossing Passage" repeat across many dens rooms with mutually inconsistent exits; walking N from Town Green North ping-pongs between two different "North Road"s and dead-end North Gate. No minimap or room-identity cue beyond name; trivially lost even with deliberate movement.

## P1 — Friction
4. **Hunting grounds effectively undiscoverable.** Sewer entrance is an easy-to-miss "iron grate in the cobbles" on Temple Row; no hint chain from Town Green ("mistshrouded fields beyond the Northeast Gate" leads nowhere). A new player cannot find a creature without reading source/docs.
5. **Score and Info are byte-identical outputs** — two toolbar buttons for the same panel. Also `score` exposes exact numbers (Health 124/145) while vitals panel is prose-only — inconsistent information policy within one screen.
6. **Roundtime feedback is text-first.** Server replies "You must wait 3 seconds before you can do that." repeatedly when spamming attack; there IS an amber `RT: n` countdown chip (`strip-rt.rt-live`, pulsing) but it sits in the rail chips — not red blocks on the input bar's left edge as DR convention (and this client's own audit spec) expects. Amber ≠ danger-red; easy to miss during combat eyes-down typing.
7. **Wielded weapon renders nowhere on the paper doll.** HANDS SVG has per-slot `<g data-slot>` groups but equipping the club only adds a `<title>` tooltip ("hands: a stout club") + the caption line. Nothing visually changes on the figure — the paper doll communicates nothing gear state.
8. **Floating side panels overlap the story stream at small viewports.** At ≤720px wide the VITALS/HANDS/EXP dock window (`.dwin`, 205px) sits on top of the log; no auto-reflow. Default ego viewport (450px) makes the game nearly unusable; no responsive handling observed.
9. **Kill message teaches wrong skin syntax ambiguity**: "Type \"skin sewer\" to harvest it" (uses creature short-desc word), while `skin rat` also works; my first `skin sewer` fumbled with no hint about retry cost. Skinning failure messaging is fine DR-flavor but the taught noun varies.

## P2 — Polish
10. **Error handling is good** — unknown commands get "Hmm? I do not know the command \"frobnicate\". Type \"help\" for a list."; bare `attack` gets "Attack what?"; NPC `attack guard` correctly "There is no such creature here."
11. **DR fidelity strengths**: vitals prose ("in good shape", "hurt"), EXP thoughts panel with learning states (pondering/thoughtful/dabbling/clear), room header `[[Name, Area]]` format + "Obvious exits" + click-to-move exit links, compass pad, corpse/silver/inner-fire kill cadence, "Your guild forswears magic." for barb Spells panel. Genuinely good.
12. **Scroll & focus**: autoscroll pins to bottom under combat spam (verified scrollTop tracks scrollHeight); input focus never stolen by stream updates. History via ↑/↓ and Tab-complete advertised in keyboard help dialog.
13. **Settings** offer themes (Dark/Ember/Parchment/Terminal green), mono/serif fonts, size, line spacing, custom colors, plus scripts manager with macro/timer/trigger/DR-script types and config export/import — feature-rich but buried behind a lone ⚙ glyph with no tooltip until hover.
14. **Inventory wording**: wielding shows as "Worn: a stout club" — should read Wielded/With.
15. **Register flow quirk**: with an inherited session token, typing `register …` at char-select returns misleading "Not a valid character." instead of "already logged in".

## Verdict
Core play loop (move → fight → loot → panels update) works and DR messaging conventions are strong. The P0 cluster is all wayfinding/onboarding: map loops + dead-end gate + unclosable create modal will lose new players before their first fight.
