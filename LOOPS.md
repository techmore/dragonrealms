# Project loops

## Fidelity ledger sweep

Closes one roadmap/skills claim-vs-code gap per pass using the repo's own checkers as the gate, stopping at a clean full pass, a blocker, or an approval-needed item.

Prompt:

> Pick one claim in ROADMAP.md, data/roadmap.js, or SKILLS.md that may not match the code. Verify it against the implementation and tests, then fix the mismatch with the smallest change to whichever side is wrong. After each fix run `npm test`, `npm run verify-docs`, and `node scripts/audit-data.mjs`; keep only all-green fixes. Repeat until a full pass finds no mismatch. Stop at clean, blocked, or anything needing my approval.

Adaptation of [The product contract conformance loop](https://signals.forwardfuture.com/loop-library/loops/product-contract-conformance-loop/) — source modified 2026-07-07. Saved 2026-08-20.
