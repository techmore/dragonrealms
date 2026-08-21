# DR Client UI Fidelity

Grounds the web client against the real DragonRealms client. Researched from
Elanthipedia (Webclient, Front end, Lich mapping reference), the official
play.net client pages, and the open-source front ends (Genie5, Outlander,
ProfanityFE, Lich/Drinfa parsers). DragonRealms itself is a paid game, so we
match the *documented* client conventions rather than playing it.

## What the real DR client does

### Room display (`LOOK`)
The server emits rooms as a game line that all front ends render the same way:

```
[[Boar Clan, Split-Log Path]]
A tall palisade wall of thick iron-banded tree trunks embraces the small village...
Obvious paths: northeast, southwest.
```

- Header is `[[Room Name, Area]]` — the area rides in the header.
- Exits are lowercased words: `Obvious paths:` outdoors, `Obvious exits:`
  indoors, `Obvious paths: none.` when stuck.
- A `You also see ...` line lists objects.
- Directions are typed directly (`n`, `ne`, `sw`, `u`, `d`) or via `go north`.
  `LOOK`/`L`/`l` all re-display the room.
- The **webclient** bolds creature names in rooms ("monsterbold").

### Client chrome
- **Compass rose** — clickable N/NE/E/SE/S/SW/W/NW (with Up/Down), lit for
  the exits the current room actually has.
- **Vitals bars** — visual Health / Mana (or Concentration) / Stamina / Spirit
  gauges (webclient, Genie5, Outlander, ProfanityFE).
- **Windows** — story, room, inventory, thoughts, spells, experience panels
  (room window lists players, mobs, items).
- **Highlights / channel colors**, macros, aliases, triggers, and script
  support.

### Prompt
DR prompts are configurable and end in `>`. The client parses vitals from the
game stream and drives the gauges from them.

## What we've matched (this repo)

| DR feature | Implementation |
|---|---|
| `[[Room Name, Area]]` header | `server/game.js` `look()` — header, description, then exits |
| `Obvious paths:` / `Obvious exits:` | wilds vs town/riverhaven zones, lowercase words |
| Monsterbold | creature names wrapped in `\x1b[1m` in `look()`; client renders bold |
| Creature vitality | `vitalityLabel` — bruised → battered → badly hurt → near death |
| `LOOK`/`L`/`l` re-display room | `l: look` alias, case-insensitive dispatch |
| Compass rose | `public/js/compass.js` — 3×3 + U/D clickable compass, lit by available exits |
| Pinned room window | `#room-panel` — title, description, `Obvious paths`, compass (always visible) |
| **DR-style window manager** | each dock/rail pane is an independent, collapsible, show/hideable window; `Windows` menu toggles visibility + collapse, persisted per-browser (`dr_windows_v1`) |
| Room contents DR phrasing | the pinned room panel separates `Here: <creatures/players>` from `You also see <objects>.` (webclient object-line feel) |
| Hands window | `#hands-bar` — Hand / Worn / Carried from the `hands` push message |
| Vitals bars | `#status-strip` — HP / Mana / Stamina / RT gauges parsed from the prompt |
| Combat window | `#target-widget` promoted to a live combat window with a header status line (`COMBAT · RT ns`) plus per-foe HP/range bars |
| EXP (Thoughts) window | the field-experience pane is a live window: every skill learning with rank + mindstate, plus an `N skills learning` count |
| EXP + INFO buttons | toolbar buttons open docked `exp` / `info` panels |
| Combat ranges | missile/pole/melee with `advance`/`retreat`/`flee`/`assess`; weapon reach |
| Roundtime | DR weapon-class RT table; `RT: n` in the prompt; actions gated |
| Scripts | DR-script interpreter: `.script` prefix, `put`/`wait`/`match`/`matchwait`/`goto` |
| **Server-stored scripts** | saved DR scripts persist on the character record and follow the player across browsers/machines; library pushed on world entry, deletes sync too (Pillar 8 closed) |
| Clickable exits | exits list under the compass + inline exit bar in the terminal |
| Channel colors | `ch-room/combat/notice/error/echo/prompt` + themes |
| Themes (dark / parchment / terminal-green) | theme tokens in `public/css/style.css`; picker in Settings → Appearance |
| **Ember theme** | 4th theme: deep charcoal warmed by forge-light accents; every token WCAG AA (≥ 4.5:1) against bg and panel |
| **WCAG AA contrast pass** | all four themes' text/accent/muted/dim tokens audited and retuned to ≥ 4.5:1 (`dim` raised in dark/green/parchment; parchment amber/green/muted darkened) |
| Scripts/macros/triggers | client automation panel (aliases, macro bar, timers, triggers, DR scripts) |
| **Channel muting** | Settings → Channels drops new lines of a muted channel from the story stream at render time; triggers/scripts still see them, and the Conversations pane keeps say/emote/shout |
| **Timestamps** | optional `[HH:MM]` prefix on story lines (Settings → Input) |
| **Automation edit-in-place** | macros and triggers editable inline in the Scripts panel (✎ row editor), not just delete/recreate |
| **Config backup** | Export/Import in the Scripts panel serializes all client-persisted config (settings, macros, triggers, highlights, scripts, window layout) as JSON for machine-to-machine moves |
| **Quick font keys** | Ctrl/Cmd `=`/`-` step font size, Ctrl/Cmd `0` resets (persisted) |
| **Quest journal** | docked Journal window fed by a `quest` push message (assign/progress/claim); kind label, live description, `✓ ready to claim` badge; hides when no task |
| **Chargen cards** | the `charcreate` message carries structured race/guild data; the form renders stat-modifier chips (+green/−red) per race and mana type per guild ("Elemental magic" / "no magic") |
| **Scrollback buffer cap** | Settings → Input (500/2000/5000/unlimited); the DOM never grows unbounded, trimmed search marks are pruned |
| **Gag rules** | Settings → Gagging: regex rules that drop matching lines from the story stream at render time (Genie/Lich staple); automation still sees them |
| **Audio alerts** | optional soft WebAudio chime when a highlight rule matches — no assets, no dependencies |
| **Keys overlay** | F1 or `keys` opens a keyboard-shortcuts reference; Esc closes |
| GM live watch | With `DR_GM_TOKEN` stored by the GM console, `/?spectate=Name` enters read-only watch mode with room/hands snapshots; ordinary accounts cannot read player streams or typed commands |

## Still pending (nice-to-have, per the research)

- **`You also see ...` objects line** — the pinned room panel renders floor
  objects this way (`renderRoomContents`); the server prose itself still says
  `On the ground: ...` (DR's phrasing differs per container).
- **Balance & position** — the full balance/position ladder and maneuver
  chart (jab/draw/slice/chop per attack type) beyond the DR combat ranges.
- **Room numbers** — shown only with a flag; we omit.
- **Map / mapper** — out of scope.
- **EXP window** — the webclient shows an experience panel; our `exp`
  docked panel covers it.

## Verification

Room format verified live: an authorized GM spectator receives
`[[Sewer Entrance, Old Sewers]]` + `Obvious paths: up, north.` and the exits
array. Vitals gauges track HP/Mana/Stamina from the per-tick prompt.
