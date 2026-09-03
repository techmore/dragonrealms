---
name: sep-map-builder
description: Build or repair DragonRealms map routes from current world data with deterministic route validation.
---

# SEP map builder

## Goal

Produce route JSON and map facts that resolve to real rooms and exits in `data/world.js`.

## Required workflow

1. Read `data/world.js` and existing map facts before proposing a route.
2. Use only room IDs and exit directions present in the current graph.
3. Keep town directions separate from wilds/dungeon hunting routes unless explicitly requested.
4. Validate route output with `node scripts/sep-validate.mjs route <file>`.
5. Add or update a focused route test when behavior changes.

## Output contract

Return JSON as either an array of room IDs or `{ "steps": [...] }`, followed by a short evidence note naming the source room, destination, and validation command.

## Constraints

- Never invent room IDs, exits, landmarks, or shop locations.
- Treat `APPROXIMATE` map facts as uncertain and label them.
- Do not edit unrelated game systems while repairing a route.
