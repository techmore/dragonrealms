# Barbarian activity switching — 2026-09-10

No new sweep results have appeared since the previous review. Latest DB row:
yvkd, 2026-09-09T18:15:00.905Z, terminated at Circle 1. Gap Study has not been
benchmarked. No candidate is promoted or described as faster.

The strongest death-free individual result in the standard historical
Gor'Tog / paired-fixed-v1 / boost 20 / Circle-5 target / 30-minute /
three-worker cohort remains inzl / edgedSkinCheapKit. Its shortfall was 15,
versus baseline 40 in the same cohort. Both remained Circle 1. Source:
public/live/fidelity-barbarian-edgedSkinCheapKit-gortog-inzl-iiij.log and
sweeps.db; revision e285eecbc8db-dirty, script hash 2cfc1034d410fb72. These
are historical results, not a current-code speed guarantee. See the
2026-09-09 gap-study review for cohort counts and evidence limitations.

## Weakness confirmed

From minute 16 to 24 the control added 73 ranks while shortfall stayed 19.
Final 12:28:10.005Z requirement sample:

| Already beyond the gate | Still missing |
| --- | --- |
| Evasion 36/6 | Fourth weapon 0/2 |
| First weapon 31/8 | Second armor 0/2 |
| Second weapon 20/8 | Third survival 1/4 |
| First armor 22/6 | Fourth survival 0/2 |
| Expertise 11/8 | Tactics 0/2; both lore lanes 0/2 |

Current code still unconditionally foraged in the shared fight tail and
idle loop, always analyzed/tripped, and could return early from the
supervisor when ranks did not move. The previous Gap Study candidate
changed town learning only; it did not switch the field loop.

## Candidate: edgedSkinActivity

One coherent lever versus the unchanged Cheap Kit control: live activity
selection. Equipment, recovery thresholds and weapon rotation stay fixed.

- Fresh EXP observations drive the authoritative next-circle gate, including
  eligible Nth pools. Unknown or >90-second-old observations request EXP
  instead of guessing that all skills are zero.
- Compare relative survival deficits with remaining combat deficits. Train
  foraging or perception when useful; stop when another eligible skill has
  already satisfied the counted slot. A fourth survival gate at rank two
  does not force that lane to rank four.
- Reserve up to 30 seconds after combat for useful survival work so a
  persistent rank-zero combat blocker cannot starve smaller survival gaps.
- Skip full survival pools while other work is useful; otherwise wait for
  drain and refresh. Full-pool observations expire after 60 seconds.
- Skip satisfied analyze, trip, and training-only roar calls. Skip forage
  in the fight tail when its counted gate is done or its pool is full.
- Keep combat when Skinning still needs kills, even if named combat rows
  are already satisfied. Preserve healing and active-fight handling.
- When combat and accessible field skills can no longer improve the gate,
  hand off to gap-driven town learning before the legacy no-progress return.
  Town retries are at most once per minute unless the circle is ready.
- Re-check hall training and study flags before sending commands; a rank
  gained while travelling can cancel an obsolete training action.
- Recompute on EXP/messages/prompts and seed every restarted runner. A new
  circle reopens the relevant gates. Timestamped [activity] and
  [activity-town] records explain switches for later review.

This policy uses the sweep runner's observations and variables, like other
supervised variants; a downloaded hunt script alone is not a standalone
replacement. It does not fix missing gear, unavailable routes, every full
combat pool, or stale weapon-rotation thresholds. Removing trip/roar after
training completion also removes their combat benefits: deaths must be
checked before promotion. Repeated town trips without gap closure remain
possible for skills without an implemented training route.

Sims now selects baseline / edgedSkinCheapKit / edgedSkinActivity. The
older Gap Study candidate remains available in the variant registry for
reproduction. Standard comparison is three concurrent workers, Gor'Tog,
paired-fixed-v1, boost 20, Circle 5, 30 minutes. No sim was launched in this
review. Next evidence must show lower shortfall or target completion with
no worse death/stall safety, not merely more total EXP.
