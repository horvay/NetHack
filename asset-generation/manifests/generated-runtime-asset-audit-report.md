# Generated-vs-runtime asset audit: engraving and scroll follow-up

Date: 2026-07-01

## Root cause

The installed `engraving` PNG already matched the better regenerated low-profile scratch/rune asset, but the renderer emitted stable image URLs like `../assets/tiles/generated/terrain-features/engraving.png`. Chromium can keep decoded/CSS background images cached after a PNG is replaced on disk. The Boss screenshot shows the earlier round stone/tablet engraving from that stale URL cache, not the current installed file.

The audit also found a real mapping gap for identified full-source scrolls: regenerated ids such as `food-detection`, `punishment`, `remove-curse`, `taming`, and `teleportation` were present and installed, but true item names like `scroll of food detection` could fall back to `scroll-class-icon` or an older curated `scroll-of-*` id instead of the regenerated full-source asset.

## Fixes

- Added manifest-driven cache busting in `tileUrl()`: `?v=<sha/completedAt>` is appended to tile image URLs, so replaced generated PNGs are reloaded without relying on a browser cache clear.
- Added `sha256/sourceSha256/cacheBustVersion` to the `engraving` manifest record.
- Added tile-map semantic mappings for regenerated scroll names and random-label names:
  - `scroll-of-food-detection` -> `food-detection`
  - `scroll-of-punishment` -> `punishment`
  - `scroll-of-remove-curse` -> `remove-curse`
  - `scroll-of-taming` -> `taming`
  - `scroll-of-teleport-away` -> `teleport-away`
  - `scroll-of-teleport-control` -> `teleport-control`
  - `scroll-of-teleportation` -> `teleportation`
  - `scroll-labeled-temov` -> `temov`
  - `scroll-labeled-zlorfik` -> `zlorfik`
  - `scroll-labeled-read-me` -> `read-me`
- Added `electron-poc/scripts/generated-runtime-asset-audit.js` and wired it into `test:manifest` and `test:map-tooltip`.

## Audit findings

- `engraving`: source output and installed runtime asset match (`37a514340224eaf967c9a0709ed79ad65c4ae8832770e8e2126d777364984cf9`). Current asset is the scratch/rune engraving, not the round stone tablet visible in the Boss screenshot.
- Regenerated scroll follow-up assets: all audited source outputs match installed runtime files.
- Mapping mismatches fixed: identified scroll names for the regenerated full-source scrolls now resolve to those regenerated assets.
- Remaining caveat: `scroll-of-identify`, `scroll-of-light`, `scroll-of-enchant-weapon`, `scroll-of-enchant-armor`, and `scroll-of-teleportation` curated object-inventory icons still exist and were accepted in the prior review. The explicit `scroll of teleportation` mapping now prefers the regenerated full-source `teleportation` asset; the curated `scroll-of-teleportation` remains installed for class/legacy UI use.

## Evidence

- Boss screenshot: `/home/horvay/.config/ai-org/ai-org-dev-data/attachments/att-1782930011587-0-attachment-delta-carving-falcon-91.png`
- Engraving old/current comparison: `asset-generation/outputs/engraving-runtime-audit-contact-sheet.png`
- Source-vs-runtime contact sheet: `asset-generation/outputs/generated-vs-runtime-scroll-engraving-contact-sheet.png`
- Machine audit JSON: `asset-generation/outputs/generated-runtime-asset-audit.json`

Run-evidence copies are in `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-zeta-carving-falcon-93/`.
