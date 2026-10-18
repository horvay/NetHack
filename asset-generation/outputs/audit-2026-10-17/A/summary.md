# Audit A: terrain, traps, UI overlays, pets/identity, combo avatars

Scope: 190 assets (terrain-features 66, traps-hazards 23, ui-status-overlays 22, player-pets-identity 25, player-combo-avatars 54). Contact sheets are `sheet-01.png` to `sheet-05.png`; `share-index.json` lists the share in sheet order.

## Counts

143 flagged out of 190: inconsistent 67 (54 are combo avatars), vector 36, unclear 23, wrong 17. Severity: 13 high, 84 medium, 46 low. By category: terrain-features 54, player-combo-avatars 54, traps-hazards 12, ui-status-overlays 12, player-pets-identity 11.

## Worst 10

1. `open-vertical-door`: a brown plank lying on stone, with no jambs and no gap.
2. `open-horizontal-door`: gray blocks with two orange dashes; nothing reads as a door.
3. `no-door-doorway`: an almost blank dark square, so doorways look like floor.
4. `closed-door`: a flat orange rectangle with black lines (6 colors), clip-art.
5. `broken-door`: three brown blobs that look like bread crumbs.
6. `trap-door`: drawn as a closed wooden chest.
7. `glyph-debug-overlay`: a plain gray square, used by the tile map for the remembered-invisible `I` and warning glyphs.
8. `engraving`: pale squiggles that read as bones or rubble, not writing on the floor.
9. `dart-trap`: a beige box outline with a red arrow (4 colors), a placeholder.
10. `human-rogue-*` / `orc-rogue-*`: painted avatars darker than the floor (brightness about 42–48 against ~74); the hero disappears on the map.

## Patterns across the share

- One batch is flat placeholder art. Everything labeled `provisional-terrain-room-regeneration-approved-install` has 2–7 colors at 32 px: floors, corridors, every wall piece, doors and the doorway, stairs, ladders, branch stairs and ladders, iron bars, drawbridge, magic portal, and the mines and sokoban tiles. `sea-water`, `health-bar` and `dart-trap` look the same way. Godot paints floors, walls and stairs itself; doors, doorways, ladders, bars and the drawbridge still come from these tiles, and Electron draws all of them.
- `wall-corner` and `wall-tee-junction` are single images used for all four corners and all four tees, and `zap-beam` is one diagonal used for both slants. Each needs rotated or mirrored variants plus a tile-map change.
- The 54 combo avatars are painted illustrations with no outline, smooth-scaled to map size. On the map they are thin, muddy, darker than the floor, and the roles look alike. They work as portraits. Keeping them as portraits beside new pixel map sprites, or showing the pixel role avatars on the map, is Greg's call.
- `ice`, `lava` and `moat-water` have baked frames or rims, so a lake or lava field tiles as a grid of badges. `moat-water` is also the `}` fallback.
- NetHack identity errors: the kitten is orange and the little dog dark gray (NetHack has both white), `pool-water` is green instead of blue, `rolling-boulder-trap` is a purple orb instead of a gray boulder, `boom-east`/`boom-west` are fireballs but mapped to the thrown-boomerang glyphs, and the beam tiles have arrowheads that NetHack rays don't.
- Green-screen fringe: a pale mint halo on the healer, priest, priestess and wizard role avatars and the elf and orc player variants; dark green edge pixels on three status badges; a teal smear on `land-mine`.
- Only `glyph-debug-overlay` and `valid-position-marker` from the UI overlay set are referenced by either front end, so the bad badges, bars and action icons are marked low.
- Not flagged: fountain, altar, throne, air, flash-effect, lava-wall, vibrating-square, the remaining traps, the pixel role avatars other than ranger and valkyrie, hero-avatar, pony-pet, and the unmapped `shield-*` direction tiles.
