# Audit B: monster tiles (common-early-monsters + full-source-monsters)

Scope: 378 assets (60 common-early, 318 full-source). Each one was reviewed on the contact sheets `sheet-01.png` to `sheet-08.png` (3x on floor color #4b4a47, plus 1x and 16 px previews, NetHack glyph and color under each tile), and doubtful tiles were zoomed. Colors were checked against `include/monsters.h`.

## Counts (123 flagged)

| Problem | Count |
|---|---|
| wrong (wrong creature or wrong NetHack color) | 67 |
| inconsistent (oversize painterly, green fringe, baked patch, off-style) | 19 |
| vector (flat placeholder or clip-art) | 15 |
| unclear (unreadable at 32 px) | 12 |
| duplicate (indistinguishable from a sibling) | 10 |

Severity: 57 high, 58 medium, 8 low.

## Worst 15

1. `coyote`: a bare white line drawing of a dog, with no fill or shading.
2. `wolf`: a flat 10-color geometric gray shape, a leftover placeholder.
3. `uruk-hai`: only a green wireframe outline, with no body.
4. `black-light`: a faint thin ring at alpha 76 that is invisible in game.
5. `storm-giant`: a flat box-body stick figure with no face.
6. `titan`: the same placeholder figure as storm-giant, recolored purple.
7. `freezing-sphere`: a flat blue circle icon.
8. `shocking-sphere`: pixel-identical to freezing-sphere.
9. `floating-eye` (common early): an eye icon with an "i" pupil that reads as a UI info button.
10. `blue-jelly`: a brown letter J.
11. `gray-ooze`: a chrome letter P.
12. `angel`: a purple and gold emblem, with no figure at all.
13. `gray-dragon`: drawn red, so players will read it as a red dragon (this matters for resistances).
14. `centipede` (common early): a blurry S on a square card.
15. `fog-cloud` (common early): a weather-app cloud icon with a G swirl.

Close behind: `mind-flayer` (green tentacle squiggle), the three mimics and `warg` (1024 px painterly mush), `cerberus` (one gray head), the centaurs (three identical brown ponies with no torso), `acid-blob`, `xan`, `ochre-jelly`.

## Systemic observations

- **Generic palettes replaced NetHack colors.** About 121 prompts in this share use one of 7 stock palette strings ("purple and gold with lavender shadows", "emerald green with lime highlights", "rust red and copper", and so on) instead of the monster's NetHack color. This is the main source of the 67 "wrong" flags. Blue-dragon and green-dragon both got "purple and gold", housecat and python got "emerald green", and blue-jelly got "rust red". As a result 16 of the 22 dragons have the wrong color, all 6 snakes do, and most cats, nagas, nymphs, centaurs and jellies do too. Regeneration prompts must take their color from `monsters.h` (the glyph color).
- **13 tiles are installed at 512 or 1024 px instead of 32x32:** aleax, archon, warg, all three mimics, glass/iron piercer, all four worms, and zruty. Downscaled they become soft smudges with no outline. `godot-poc/tools/sync_tiles.py` resizes them with LANCZOS to 64 px for Godot, which is why only these 13 Godot copies differ from the installed files.
- **Green matte fringe** is visible on non-green monsters: attendant, hippocrates, healer, guide, djinni, stalker, ettin, hell-hound-pup, housecat, vampire-bat, mordor-orc, baby-gray-dragon. RMBG leaves a green halo, and green creatures generated on the green key also tend to bleed. Add a despill/edge-erode step after RMBG, and possibly a magenta key for green monsters.
- **Two tile families clash in style.** The 77 tiles labelled `transparent` are chunky, cream-outlined, sticker-like and brown/orange heavy (cats, baby dragons, centaurs, gargoyles, nymphs, jellies). The `coherent-restart` tiles are painterly with dark outlines. Several leftover "deterministic silhouette" placeholders (coyote, wolf, storm-giant, titan, spheres) were never replaced.
- **Weak family differentiation:** zombies and ghoul, the baby worms, nagas (golden vs red), python vs snake, gargoyle vs winged gargoyle. NetHack separates these by color, so following the canonical color fixes most of them.
- **Common-early monsters to prioritize** because players see them on turn 1: floating-eye, fog-cloud, centipede, acid-blob, rock-mole, soldier-ant, gas-spore, lichen, grid-bug, bat, manes, homunculus, garter-snake, newt, paper-golem, kobold-mummy, gray-ooze, coyote, imp, iguana.
- The `newt` is a recent `godot-regen-qwen-edit-approved-install`. It is flagged medium only: it is soft and has no outline next to the rest of the set. Greg may have approved it, so check with him before replacing it.
