# Full asset pipeline audit

Audited at: 2026-07-10T02:03:45.287Z
Manifest assets: 1044
Generated PNGs: 1044
by-category PNGs: 754

## Category counts
| category | manifest | generated |
|---|---:|---:|
| common-early-monsters | 60 | 60 |
| full-source-monsters | 318 | 318 |
| full-source-objects | 399 | 399 |
| objects-inventory | 77 | 77 |
| player-combo-avatars | 54 | 54 |
| player-pets-identity | 25 | 25 |
| terrain-features | 66 | 66 |
| traps-hazards | 23 | 23 |
| ui-status-overlays | 22 | 22 |

## Error summary
- duplicateIds: 0
- missingRefs: 0
- manifestNotOnDisk: 0
- shaMismatches: 0
- outputMismatches: 0
- byCategoryMismatches: 0
- generated files not in manifest: 0
- manifest assets not selectable by current renderer probes: 13

## Spotlight
- engraving: path=electron-poc/assets/tiles/generated/terrain-features/engraving.png; sha=b48d77c63416; selectable=true; selection=tile-map.glyphNumber.3994
- monk-role-avatar: path=electron-poc/assets/tiles/generated/player-pets-identity/monk-role-avatar.png; sha=398492abdb39; selectable=true; selection=playerRoleAvatarAssetId(character)
- monk: path=electron-poc/assets/tiles/generated/full-source-monsters/monk.png; sha=32a956be8436; selectable=true; selection=tile-map.semanticName.monk
- human-monk-male-avatar: path=electron-poc/assets/tiles/generated/player-combo-avatars/human-monk-male-avatar.png; sha=878f61d44bcc; selectable=true; selection=playerComboAvatarAssetId(character)
- human-monk-female-avatar: path=electron-poc/assets/tiles/generated/player-combo-avatars/human-monk-female-avatar.png; sha=dc3e6810bb05; selectable=true; selection=playerComboAvatarAssetId(character)
- hero-avatar: path=electron-poc/assets/tiles/generated/player-pets-identity/hero-avatar.png; sha=98929982a1d1; selectable=true; selection=tile-map.char.@

Full row inventory is in `full-asset-pipeline-audit.json`.
