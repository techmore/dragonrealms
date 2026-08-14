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
| `LOOK`/`L`/`l` re-display room | `l: look` alias, case-insensitive dispatch |
| Compass rose | `public/js/panels.js` — 3×3 + U/D clickable compass in the dock, lit by available exits |
| Vitals bars | `#status-strip` — HP / Mana / Stamina gauges parsed from the prompt |
| Stamina in the prompt | `server/status.js` adds `Stamina: n/n` |
| Clickable exits | exits list under the compass + inline exit bar in the terminal |
| Channel colors | `ch-room/combat/notice/error/echo/prompt` + themes |
| Scripts/macros/triggers | client automation panel (aliases, macro bar, timers, triggers) |

## Still pending (nice-to-have, per the research)

- **Room window** — a docked panel listing current players / creatures / items
  (the webclient's room tab). We have the compass dock + status strip; a full
  room panel would need a structured per-room snapshot (mostly available via
  the API snapshot).
- **`You also see ...` objects line** — room output lists floor items as
  `On the ground: ...`; DR's phrasing differs per container.
- **Room numbers** — shown only with a flag; we omit.
- **Map / mapper** — out of scope.
- **EXP window** — the webclient shows an experience panel; our `skills`
  docked panel covers it.

## Verification

Room format verified live: a connected spectator receives
`[[Sewer Entrance, Old Sewers]]` + `Obvious paths: up, north.` and the exits
array. Vitals gauges track HP/Mana/Stamina from the per-tick prompt.
