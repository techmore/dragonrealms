# Client observation contract — policy v1

This is a new Puffer input contract, not a conversion of old checkpoints.
`client_contract.mjs` encodes only normal player-visible room, prompt,
`exp`, and `inventory` frames. `engine_circle.mjs` now generates its policy
vector by calling those same public game surfaces; the policy vector never
reads the isolated player's skills, EXP pools, purse, inventory IDs, or room
object. Engine state remains available to calculate rewards and evaluation
receipts, which are training/evaluation targets rather than policy inputs.

Inputs include normalized HP, stamina, mana/inner fire, roundtime, circle,
silvers, combat and bleeding; every known skill's displayed rank, displayed
learning percentage and held-pool amount; requirement progress and a separate
active-row mask; visible ownership/wearing of the six starter kit items; and a
one-hot room ID from the observed room frame. An omitted skill line means rank
zero, no displayed learning and no held pool: the public `exp` command omits
only those empty skills. An absent requirement row is marked inactive rather
than confused with an unmet row. Unknown labels, rooms, malformed commands,
missing frames and wrong guild/race fail closed. Exact within-rank EXP is not
displayed and remains null; never reconstruct it from hidden engine state.

Feature lists are frozen in the environment specification and included in its
scenario name. This makes the client-v1 input width and ordering explicit. It
supersedes the old privileged observation (rank, within-rank EXP fraction,
private pool fraction, private economic affordance features, and progress/time).
Old Barbarian and Ranger weights cannot resume this scenario. The policy must
be retrained from scratch or from demonstrations encoded through this same
contract.

The action contract remains **bounded activities plus scripted macros**: the
policy chooses the existing activity list, and those macros issue commands.
The ordinary wire runner does not yet execute these activities, and macro
bodies still consult internal player/world state for routes, equipment and
targets. So this aligns the policy's observation vector, but not the complete
training and live execution loops. Before transfer claims, move macro choices
onto observed room/exits, command replies, equipment and vitals, then compare
against the main Sims supervisor under a matched cohort.

`wire_smoke.mjs` verifies ordinary transport. It does not evaluate this policy.
No training was launched as part of this schema change.
