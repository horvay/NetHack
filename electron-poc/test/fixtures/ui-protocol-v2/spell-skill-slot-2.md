# UI protocol v2, serialized slot 2: spell and skill rows

**Owner:** UXM-03  
**Parent green baseline:** `UXM-05-SECRETARY-REREVIEW-FAIL-CLOSED-PRELOAD-MANIFEST-CANDIDATE-2026-07-12-3890c6a4dcee`  
**Change:** additive; no slot-3 target, slot-4 result, slot-5 final-run, or UXM-06 field is introduced.

## Authoritative envelopes

`spell.rows` contains a request-owned menu ID, monotonic spell revision, `classificationConfidence: "typed"`, and rows containing only core-emitted `name`, `selector`, `level`, `pwCost`, `failure`, and `status`. Except for `name`, unavailable fields may be omitted.

`skill.rows` contains the same ownership/provenance structure and rows containing only core-emitted `name`, `selector`, `currentRank`, `nextRank`, `nextCost`, and `canAdvance`. `currentRank` and `canAdvance` are emitted by core. Selector, next rank, and next cost are omitted unless the core says that row can advance.

Typed rows require `source.layer` `core` or `shim-bridge` plus `source.authoritative: true`. The envelope request ID must equal its payload menu ID. The game-view reducer additionally requires the currently active request-owned menu and matching spell/skill purpose. Duplicate IDs, stale revisions, out-of-order per-kind sequences, wrong-kind owners, and ownerless delivery reject without mutating the last accepted snapshot.

## Compatibility fallback

Legacy menu parsing is presentation compatibility only. Its snapshot is always `classificationConfidence: "fallback"`, `authoritative: false`, and source `classic.menu.fallback`. It parses only exact public menu columns, may omit fields, never calculates or estimates them, and cannot replace typed rows for the same request. The presenter prefers typed public rows and uses legacy text only when no authoritative row exists.

## Native source

`src/spell.c` emits spell name, public selector, spell level, current core Pw cost, current core failure percentage, and retention/status while constructing the real spell menu. `src/weapon.c` emits the core skill name/rank and advancement facts while constructing the real skill menu. `win/shim/winshim.c` forwards these callbacks. `nh-shim-bridge.c` binds them to the active menu lifecycle, assigns event sequence/revision/ID, emits only the allowlisted fields, and omits unavailable optional values.

## Fixtures and proof

- `spell-skill-slot-2.json`: explicit unknown-omission, invalid, duplicate, order, owner, atomicity, and precedence matrix.
- `valid-events.json`, `invalid-events.json`, `replay-recording.json`: shared golden and replay coverage.
- `test/ux/spell-skill-protocol-test.js`: schema, shim, reducer, fallback, browser-global, recording, and replay contract.
- `scripts/native-spell-skill-rows-shim-test.js`: real native core/bridge emission and reduced-view proof.

No renderer recommendation, build strategy, hidden spell effect, projected damage, build advice, or future advancement estimate is public protocol data.
