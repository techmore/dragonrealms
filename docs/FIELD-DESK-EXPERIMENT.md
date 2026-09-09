# Field Desk UI experiment

Enable via Settings → Interface preview → Try Field Desk, or open `/?ui=experimental`. Classic remains the default. The checkbox saves a browser preference; Back to Classic disables it and removes the preview query parameter.

## Review

The current player UI preserves the important MUD primitives: text narration, typed commands, room exits, hands, EXP pools and roundtime. Its weaknesses are visual competition between similarly weighted tools, dense panel headings, narrow mobile vitals, and command discovery scattered across the toolbar. Repeated room information can help orientation but should not crowd the story. This review concerns the implemented game's interface, not a claim of complete fidelity to an official DR client.

## Experiment

Field Desk gives narration more comfortable line spacing and reading width, distinct room titles, clearer muted combat text, larger collapse controls, a stronger command-line boundary and visible keyboard focus. Optional field references are collapsed by default after visual review found the expanded shelf too tall. Existing tools are reused. Prepare help only fills an empty draft and focuses the command line; it never sends a command. Spectators cannot use it to prepare commands. Theme, window visibility and scripts remain intact. Mobile vitals use a single column within the horizontally scrollable status rail.

## Validation and limits

Browser checks used a manual test character in a disposable world, not a simulator: preview URL, setting persistence/reload, Classic restoration, preserved command drafts, reference disclosure, existing panel activation and mobile horizontal overflow. Desktop 1440×900 and mobile 390×844 screenshots were inspected; initial checks also exercised a shorter desktop viewport. Config import/export accepts the new boolean setting. No full accessibility certification or physical-keyboard mobile test is claimed. Next user feedback should focus on reading fatigue, critical combat visibility and whether the compact reference shelf earns its space.

## Avatar pass

The experimental equipment figure now uses a tighter viewBox, larger scale, quiet portrait frame, stronger empty-slot outlines, and a textual inspection panel instead of tiny SVG labels. Hover/click/focus events reveal the existing item/condition tooltip text; live equipment and wound classes remain authoritative. Classic restores the original viewBox and hides the experimental frame/readout. Reduced-motion preferences suppress avatar animation. Mobile retains a scrollable equipment section with a compact figure.

Validation used client-only empty/equipped/damaged fixtures, screenshot inspection, simulated focus/click events, and Classic restoration. Direct programmatic SVG focus did not trigger the detail update in the initial browser probe; explicit focus events did, and a capture-phase focus handler was added. Physical keyboard and touch interaction remain a hands-on check. No simulator or game-state changes were made.
