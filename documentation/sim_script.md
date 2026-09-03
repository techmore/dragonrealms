# War Mage Simulation Scripts Reference

This document describes how to write and run war mage (Warrior Mage) simulation scripts in the Dragon Realms project, including concurrency and fast mode usage.

## Quick Start

Run a warmage benchmark with concurrency and boost:
```bash
node scripts/race-guild-sweep.mjs --benchmark warmage --concurrency 2 --boost 50 --minutes 20
```

## Architecture Overview

The simulation framework uses these key components:
- `data/guild-scripts.js` — Guild capability map (defines warmage fight patterns, spells, training sets)
- `scripts/lib/script-gen.mjs` — Generates DR-script (.dr) files from the capability map
- `scripts/race-guild-sweep.mjs` — CLI orchestrator (concurrency, benchmarks, reporting)
- `public/js/script-engine.js` — Pure script engine (parsing + execution)

## Warmage Guild Configuration

In `data/guild-scripts.js`, the warmage entry defines:

```javascript
warmage: {
    magic: true,
    fight: ['put prepare fire_shard', 'put wait', 'put cast %target'],
    fallbackFight: ['put attack %target'],
    signature: { cmd: 'prepare fire_shard', ok: /You begin preparing/i, probe: 'spell' },
    armVerb: 'wield',
    spellsByCircle: { 1: 'fire_shard', 3: 'lightning', 5: 'storm_burst' },
    trainSets: {
      weapon: ['medium_edged', 'blunt', 'staff'],
      armor: ['chain_armor', 'shield_usage'],
      survival: ['perception', 'athletics', 'first_aid', 'scouting'],
      lore: ['elemental_lore', 'attunement', 'scholarship', 'appraisal'],
      magic: ['war_magic', 'offensive_magic', 'primary_magic'],
    },
    defaultTrain: ['war_magic', 'offensive_magic', 'primary_magic', 'summoning',
      'targeted_magic', 'evasion', 'parry', 'chain_armor', 'shield_usage',
      'medium_edged', 'attunement', 'elemental_lore', 'scholarship', 'perception'],
    fidelityChecks: [
      { name: 'prepare-spell', re: /You begin preparing/i },
      { name: 'cast-lands', re: /You cast Fire Shard|engulfed for \d+ damage/i },
    ],
  },
```

## Script Engine Syntax

DR-scripts are plain text with these commands:
- `put <verb>` — Send a command to the game
- `move <direction>` — Move in a cardinal direction
- `wait` — Wait for current action to complete
- `pause <seconds>` — Wait a fixed duration
- `matchre <label> <regex>` — Register a regex match for game output
- `matchwait [seconds]` — Wait for registered matches
- `goto <label>` — Jump to a label
- `iflt <var> <threshold> goto <label>` — Branch if variable < threshold
- `ifge <var> <threshold> goto <label>` — Branch if variable >= threshold
- `ife/ifne <var> <value> goto <label>` — String equality branch
- `if_1 <label>` — Branch if variable is set (DR-style)
- `putrun <name>` — Call a nested script

Live game state variables available for branching:
- `%hp`, `%maxhp`, `%mana`, `%maxmana`
- `%circle`
- `%rt` (roundtime remaining)
- `%silver` (silver pieces carried)
- `%tdp` (training differentiation points)
- `%wsp` (currently wielded weapon skill category)
- `%wsr_<skill>` (current rank of a weapon skill)
- `%rage` (barbarian berserk state)
- `%bleed` (wounds present)
- `%combat` (in combat state)

## Concurrency

Run multiple warmage agents simultaneously:
```bash
node scripts/race-guild-sweep.mjs --benchmark warmage --concurrency 4 --minutes 20
```

Key concurrency behaviors:
- Each concurrent worker gets its own character and account
- Workers share creature spawns (measuring resilience under load)
- Benchmark mode uses sequential runs by default (`--concurrency 1`) for clean pacing
- Higher concurrency values explicitly measure crowded-world performance
- Max concurrency: 10

## Fast Mode (Boost)

Speed up simulation with the boost multiplier:
```bash
node scripts/race-guild-sweep.mjs --benchmark warmage --boost 50 --minutes 10
```

Boost effects:
- Multiplies skill experience gains (`{t:'boost', mult:N}`)
- Multiplies rank conversion speed
- Speeds up rest recovery
- Shows `[BOOST xN]` in the prompt
- Capped at 100x multiplier

Recommended boost levels:
- `--boost 20`: Good balance of speed vs behavior fidelity
- `--boost 50`: Fast leveling for quick variant testing
- `--boost 100`: Maximum speed, less realistic behavior

## Variants

Benchmark variants change one knob at a time for A/B testing:
```bash
node scripts/race-guild-sweep.mjs --benchmark warmage --variants baseline,rest50,hall8
```

Available variant knobs (one changed per variant):
- `restPct` — HP threshold for resting (20-90%)
- `hallEvery` — Kills between forced guild hall trips
- `arenaBand` — Allowed creature circle spread above agent level
- `hallFallbackMs` — Blind hall-trip timer (60k-900k ms)
- `skipRage` — Skip signature ability when already active
- `closeNth` — Close circle requirements in Nth position
- `tdpFloor` — Minimum TDPs to spend at hall trips
- `helmRetry` — Retry helmet purchase at hall trips
- `armorStack` — Wear multiple armor pieces for exp
- `shieldKit` — Use shield + 4 distinct weapon categories

## Example Warmage Script Structure

Generated by `buildHuntScript()`:

```
START:
  put look
ARMCHECK:
  ifge silver 562 goto GETWEAPON
  ifge silver 337 goto GETWEAPON
  matchre ARMED Worn:[\s\S]*(sword|axe|staff|dagger|mace)
  matchre GETCLUB carrying:[\s\S]*club
  matchre GETWEAPON carrying:
  put inventory
  matchwait 6
GETCLUB:
  put wield club
  wait
  goto ARMED
GETWEAPON:
  move n
  move e
  ... [path to bazaar]
  put buy <weapon>
  ... [buy armor pieces]
  goto ARMED_FROM_BAZAAR
ARMED:
  ... [move to arena]
SCAN:
  pause 2
  iflt hp 40 goto REST
  iflt mana 8 goto WEAKSWING
  matchre FIGHT_rat rat is here
  matchre FIGHT_spider spider is here
  matchre WANDER [[
  put look
  matchwait 8
FIGHT_rat:
  put prepare fire_shard
  wait
  put cast rat
  wait
  put attack rat
  wait
  ...
WEAKSWING:
  put attack %target
  wait
REST:
  put rest
  wait
  goto SCAN
```

## Fidelity Checks

For warmage, the key fidelity events to verify:
1. **Spell preparation** — `/You begin preparing/i`
2. **Spell casting** — `/You cast Fire Shard|engulfed for \d+ damage/i`
3. **Circle progression** — Circle-up prose detection
4. **Skill training** — TDP spending at hall trips

## Reporting

View results after runs:
```bash
# Leaderboard for warmage benchmarks
node scripts/race-guild-sweep.mjs --benchmark warmage --report

# Full report across all guilds
node scripts/race-guild-sweep.mjs --report
```

Log files are written to `public/live/fidelity-<guild>-<race>-<suffix>.log`

## Troubleshooting

Common issues:
- **0 kills**: Check spawn room selection and creature weight class matching
- **Mana starvation**: Verify `iflt mana 8 goto WEAKSWING` gating in scripts
- **Stuck at hall**: Check TDP floor settings and silver availability for training
- **Wrong target**: Multi-species arena label collision (each species gets unique labels)
- **Roundtime spam**: Ensure each verb has a `wait` after it in fight loops
