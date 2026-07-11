# Scroll asset follow-up review

Contact sheets:

- Before all reviewed scroll-like assets: `asset-generation/outputs/scroll-review-before-contact-sheet.png`
- Before regenerated subset from backup: `asset-generation/outputs/scroll-review-before-regenerated-contact-sheet.png`
- After: `asset-generation/outputs/scroll-review-after-contact-sheet.png`

| Asset id | Review decision | Reason/action |
|---|---|---|
| `charging` | Accept | Already reads as a rolled parchment scroll with magic glow. |
| `create-monster` | Accept | Already reads as a rolled parchment scroll with magic glow. |
| `food-detection` | Regenerated | Previous image was a round food token/bun, not a scroll. New image is parchment with food-divination cues. |
| `punishment` | Regenerated | Previous image was a flat card-like rectangle, not clearly a scroll. |
| `read-me` | Regenerated | Previous image was a flat card-like rectangle. First retry had readable text, so it was retried again with non-readable decorative strokes. |
| `remove-curse` | Regenerated | Previous image was a flat card-like rectangle, not clearly a scroll. |
| `scroll-class-icon` | Accept | Clear generic scroll/parchment silhouette. |
| `scroll-of-enchant-armor` | Accept | Clear scroll with distinct blue armor/rune cue. |
| `scroll-of-enchant-weapon` | Accept | Clear scroll with distinct weapon/rune cue. |
| `scroll-of-identify` | Accept | Clear scroll with identify/rune cue. |
| `scroll-of-light` | Accept | Clear glowing scroll/parchment cue. |
| `scroll-of-teleportation` | Accept | Clear scroll with teleport spiral cue. |
| `taming` | Regenerated | Previous image was a flat card-like rectangle, not clearly a scroll. |
| `teleport-away` | Regenerated | Previous image was a flat book/card, not clearly a scroll. |
| `teleport-control` | Regenerated | Previous image looked like a purple amulet/potion, not a scroll. |
| `teleportation` | Regenerated | Previous image was a flat card-like rectangle, not clearly a scroll. |
| `temov` | Regenerated | Previous image was a flat card-like rectangle, not clearly a scroll. |
| `zlorfik` | Regenerated | Previous image was a flat card-like rectangle, not clearly a scroll. |

Regenerated assets used `asset-generation/workflows/krea2_basic_rem-background.json` with RMBG alpha output, seeds stored in `asset-generation/manifests/scroll-followup-provenance.json`. Raw 1024 generated files for the regenerated subset are preserved under `asset-generation/outputs/scroll-followup-raw1024/`; runtime outputs and installed assets are downscaled RGBA 32x32 PNGs.
