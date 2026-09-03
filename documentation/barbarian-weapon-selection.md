# Barbarian weapon selection and rotation

The Barbarian sim separates the weapon kit decision from the leveling script
choice. The script variant is the experiment; the weapon policy is recorded
alongside each run so results are not silently compared across different kits.

## Kit selection

- `baseline`: the standard guild kit and legacy two-weapon behavior. This is
  the control and should remain unchanged in an A/B comparison.
- `diversity2stack` / `closeNth`: club, dagger, and throwing knives. These
  provide distinct blunt, small-edged, and thrown lanes.
- `shieldLadder`: dagger, club, broadsword, and greatsword, plus a worn wooden
  shield. The shield trains `shield_usage`; it is not a substitute for a
  light-armor lane.
- `edgedBowAware`: dagger, broadsword, greatsword, and hunting bow. These map
  to small-edged, large-edged, two-handed-edged, and bow lanes.

## Rotation rule

Requirement-aware variants read the current wielded category from `%wsp` and
weapon ranks from `%wsr_<skill>`. After a kill they select the next kit weapon
whose lane is still below its circle gate plus the configured margin. Circle 2
uses the Nth-weapon targets `8, 8, 4, 2` for the first through fourth ranked
weapon lanes. A lane above its target is skipped so field experience does not
continue pouring into the primary weapon while later lanes remain empty.

The rotation lives in the compact `barbarrotate` subscript. Keeping it out of
each species and candidate-room block is required because saved scripts have
an 8,000-character server limit.

## Evidence to inspect

For each run, use the run plot and log together:

1. Compare time on the x-axis against next-circle requirements matched.
2. Read the legend’s script and weapon-policy label.
3. Check `[weapon-policy]`, `wield`, `remove`, `[reqs]`, and `[gaps]` lines.
4. Confirm `2nd weapon`, `3rd weapon`, and `4th weapon` move upward rather
   than only `1st weapon` increasing.
5. Reject a cohort if it reports `Script too large (max 8000 characters)`;
   that run did not exercise the intended policy.

Promotion still prioritizes target circle, then deaths/stall verdict and final
shortfall. Faster kills alone do not justify promoting a kit that leaves an
Nth-weapon requirement starved.
