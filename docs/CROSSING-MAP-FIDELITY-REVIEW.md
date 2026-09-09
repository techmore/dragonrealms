# Crossing map fidelity review

## Verdict

The current Crossing is a playable, source-informed adaptation, not a verified room-for-room reconstruction. Route consistency, visual map geometry and fidelity to the reference are separate questions. Six current grid/map-fact tests pass; that only establishes their encoded assertions.

## Evidence limits

The configured external archive `~/elanthipedia-dump/` is absent on this machine. The repository has an earlier text-source extraction (`tmp-crossing-audit.md`) and a shop-title checklist, but the relevant Ranik map/guild/society source pages were not found among the local `docs/elanthipedia` filenames. No live wiki API was queried. The earlier extraction explicitly did not inspect the graphical map images. Findings about the real map below are therefore comparisons to saved reference notes, not newly authenticated current-world facts.

## Findings

1. **Alchemy/Engineering direction is reversed.** The extraction records Alchemy east of Engineering. `data/world.js` also describes Alchemy that way, but its exit points east to Engineering; Engineering points west to Alchemy. `data/map-facts.js` duplicates this reversed assertion and labels it an adaptation. A test should not rewrite a reference fact to agree with an implementation. Correct the source evidence, prose and graph together after checking the original map/correction page.
2. **Synthetic travel dominates the room count.** Current authored data has 312 rooms globally, 254 tagged town; 134 town rooms use `dens_`/`trav_` connector IDs. Another 21 town rooms explicitly carry `APPROXIMATE`. Synthetic connectors can enforce selected travel distances without reproducing actual streets, intersections or room identities. Do not label them verified simply because BFS routes work.
3. **Guild interiors are compressed.** The Barbarian guild is one room with a leader and exits north to the Empath guild, west to Meeting Hall, south to Forging, east toward Paladin. Saved notes list a main hall, armory, Hall of Fame and stadium pits. Those are materially different navigation/interaction models. Even the saved extraction contains a later summary reversing the Meeting Hall relationship, so primary-page reconciliation is necessary before changing routes.
4. **Renderer geometry is not guaranteed.** `data/grid.js` assigns coordinates on first BFS discovery; later cycle edges cannot revise them. Its collision handling does not reserve cells as each room is placed within a city. The later pass flags 29 town rooms with already-used coordinates rather than moving them. Seven of 525 compass town-to-town edges differ from a single coordinate step; this diagnostic includes special/portal and unreachable-room cases and is not seven independently proven gameplay bugs. Rooms not reached by a grid seed receive arbitrary x=300+ positions. The introductory claim of exact geometry overstates the implementation.
5. **Shop/interior coverage is partial.** Named landmarks and mechanics exist, including Catrox's Forge and Milgrym-derived shop stock, but reference shop membership is not a location/route specification. The 102-title checklist includes obsolete, premium and duplicate entries and must not be treated as 102 mandatory missing shops. Compare current, relevant locations individually.

## Recommended order

1. Restore access to the approved archive and obtain the actual base map plus relevant submaps/corrections; record snapshot date and source identifiers.
2. Build a fact ledger separating verified adjacency, verified multi-step route, approximate placement, compressed interior and synthetic connector. Keep contradictions visible instead of encoding adaptations as source facts.
3. Prioritize the Barbarian loop: Town Green → guild entrance/interior → relevant weapon/armor shops → hunting gates. Capture exact directions, doors, elevation changes and return routes.
4. Correct the playable graph from that evidence. Treat path changes as script changes too: regenerate routes and check stranded-character/recovery behavior.
5. Render edges from the authoritative graph; flag overlaps and non-geometric transitions explicitly. A decorative grid must not invent compass semantics.
6. Add tests against verified facts and representative end-to-end routes, not against coordinates copied from the implementation.

No geography or simulator behavior was changed by this review. Validation: `node --test test/map-facts.test.mjs test/grid.test.mjs` — 6/6 passed (`/tmp/dr-map-review-tests.log`).
