---
name: sep-script-writer
description: Write or repair DragonRealms scripts using current repository data and deterministic validation.
---

# SEP script writer

## Goal

Produce the smallest test-backed change for a DragonRealms script or generator. Optimize for valid commands, current shop/world data, and reproducible evidence—not plausible prose.

## Required workflow

1. Read the relevant generator, guild configuration, world/shop data, and focused tests.
2. State one falsifiable hypothesis and the exact files it affects.
3. Generate or edit the script using existing conventions; do not invent shop items, rooms, skills, or command verbs.
4. Run `node scripts/sep-validate.mjs script <file>` for generated `.dr` output, then run the smallest relevant tests.
5. Report changed files, validation output, test output, and remaining uncertainty.

## Constraints

- Current repository data outranks memory or training examples.
- TDPs are not skill EXP; preserve ordinary `train <skill>` versus `tdptrain <skill>` semantics.
- Never add an unavailable shop purchase or an unverified route.
- Do not start or stop servers or simulations unless the user explicitly requests it.
- Do not claim a Kaizen win from kills alone; use final gate shortfall and matched cohorts.
