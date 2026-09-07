# NetHack testing instructions

## Canonical terminal proof

There is one acceptance path for the completed Electron architecture:

```sh
cd electron-poc
NH_EVIDENCE_REVIEWER=/absolute/path/to/external-reviewer npm run test:final-proof
```

`NH_EVIDENCE_REVIEWER` is required. It must resolve to an executable regular file outside this repository. The proof runner passes it the immutable `evidence-approval.json` path plus a JSON review request containing the manifest hash, Verification Run identity, run-content hash, every raw-capture path, and every raw SHA-256. The reviewer must personally open every raw capture and return one JSON review object with explicit inspection notes and an approval or rejection for each exact hash. A repository script, default approval, filename, or approval-like prose is not a reviewer.

The command is authoritative because it performs all of the following as one fail-closed gate:

1. Runs the focused Verification Run, Evidence Approval, screenshot adapter, Game View, prompt/menu, command-planning, Transfer Session, ground-owner, and item/equipment contracts.
2. Rebuilds the fixture-enabled native shim.
3. Exercises a small representative set through the real production Electron/native interfaces: locked-container rejection → unlock → open, direct container Select all, direct and classic ground pickup, canonical item naming and Inventory & equipment ownership, direct equipment changes, and a terrain/context action.
4. Gives every captured scenario a unique Verification Run identity and output root under `electron-poc/test-output/verification-runs/<run-identity>/`.
5. Records assertions, stdout/stderr logs, raw screenshots, losslessly derived review copies, exact hashes, capture provenance, and derivative transform provenance in the run's sole `evidence-approval.json`.
6. Stops at **CAPTURED** until the external review has covered every exact raw hash. **CAPTURED is not APPROVED.**
7. Rejects missing or changed artifacts, failed assertions, reused identities/roots, reviewer mutation, mismatched review hashes/content, incomplete review notes, non-approved decisions, and leftover playground locks.
8. Applies the external review through `EvidenceApproval`, validates the immutable decision bindings, writes `evidence-approval.md`, and reports `FINAL VERIFICATION PROOF APPROVED` only when every run is valid and approved.

The raw screenshot is the approval subject. Review-safe derivatives are convenience copies only; their provenance must bind them to the raw SHA-256 and reproduce the declared Pillow transform. Never overwrite a capture in place. A changed raw screenshot, derivative, assertion, run identity, or decision invalidates approval.

Individual real scripts and scenario runbooks remain useful for diagnosis, but their capture-phase output is not acceptance evidence by itself. Do not claim terminal proof from an individual command, an old output directory, a synthetic-only test, or a `CAPTURED` manifest. Run the canonical command and include its exact run identities, manifests, reports, hashes, and inspection notes in the final response.

## Native build consistency

Both `build:shim` and `build:shim:test-fixtures` clean the complete core object set with `make -C ../src clean` before rebuilding `libnh.a`. Keep that full clean: Make does not track changes to `WANT_LIBNH` or compiler flags, and deleting selected object files can leave a mixed archive with missing native menu context or fixture hooks.
