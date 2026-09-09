# Field Desk UI experiment

Enable via Settings → Interface preview → Try Field Desk, or open `/?ui=experimental`. Classic remains the default. The checkbox saves a browser preference; Back to Classic disables it and removes the preview query parameter.

## Review

The current player UI preserves the important MUD primitives: text narration, typed commands, room exits, hands, EXP pools and roundtime. Its weaknesses are visual competition between similarly weighted tools, dense panel headings, narrow mobile vitals, and command discovery scattered across the toolbar. Repeated room information can help orientation but should not crowd the story. This review concerns the implemented game's interface, not a claim of complete fidelity to an official DR client.

## Experiment

Field Desk gives narration more comfortable line spacing and reading width, distinct room titles, clearer muted combat text, larger collapse controls, a stronger command-line boundary and visible keyboard focus. Optional field references are collapsed by default after visual review found the expanded shelf too tall. Existing tools are reused. Prepare help only fills an empty draft and focuses the command line; it never sends a command. Spectators cannot use it to prepare commands. Theme, window visibility and scripts remain intact. Mobile vitals use a single column within the horizontally scrollable status rail.

## Validation and limits

Browser checks used a manual test character in a disposable world, not a simulator: preview URL, setting persistence/reload, Classic restoration, preserved command drafts, reference disclosure, existing panel activation and mobile horizontal overflow. Desktop 1440×900 and mobile 390×844 screenshots were inspected; initial checks also exercised a shorter desktop viewport. Config import/export accepts the new boolean setting. No full accessibility certification or physical-keyboard mobile test is claimed. Next user feedback should focus on reading fatigue, critical combat visibility and whether the compact reference shelf earns its space.
