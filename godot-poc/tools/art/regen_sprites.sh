#!/usr/bin/env bash
# Regenerates sprites that read wrong in play (BIBLE / review round 1, item 42) on the shared Arc Pro B70.
#   newt                the old prompt asked for an orange-red newt, so it read as a fire salamander; NetHack's newt is
#                       yellow (`:` yellow)
#   open-vertical-door  read as a broken floor tile
# Krea2 (the ComfyUI workflow in ASSET_GENERATION.md) was removed from this PC on 2026-10-17, so this uses the one
# local image model left, Qwen Image 2.1 via ~/ai/weeb/b70-image.sh, in edit mode: image 1 is an existing sprite from
# the generated tileset, so the new art keeps the tileset's pixel-art look.
# Queued like ~/ai/clips and ~/Music/make_real: one sd-cli batch under `b70-lease run`, which waits for the other
# holder and for free VRAM. Candidates only: nothing is installed. Afterwards `postprocess` keys out the green matte,
# shrinks each candidate to 32 px and writes a contact sheet for picking by eye.
# usage: regen_sprites.sh queue | postprocess
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd ../../.. && pwd)
TILES=$ROOT/electron-poc/assets/tiles/generated
OUT=$ROOT/asset-generation/outputs/godot-regen
B70=~/ai/weeb/b70-image.sh
export SD_XPU_QWEN21_LIB=${SD_XPU_QWEN21_LIB:-$HOME/ai/stable-diffusion.cpp-b70-native/xpu_sdpa/libxpu_qwen21.so}
mkdir -p "$OUT/refs"
NEG="photograph, realistic, 3d render, blurry, text, letters, watermark, logo, frame, border, checkerboard, ui badge, card"
q() { python3 -c 'import shlex, sys; print(" ".join(map(shlex.quote, sys.argv[1:])))' "$@"; }

# ref <src png> <name> <background>: the 32 px sprite, flattened onto <background>, scaled up with hard pixels.
ref() { magick "$1" -background "$3" -flatten -filter point -resize 1024x1024! "$OUT/refs/$2.png"; }

queue() {
  ref "$TILES/common-early-monsters/gecko.png" newt-base '#00ff00'
  ref "$TILES/terrain-features/open-vertical-door.png" door-base '#4a4a4a'
  local jobs=$OUT/jobs.txt; : > "$jobs"
  for sd in 42 8 7; do
    [[ -f $OUT/newt-s$sd.png ]] || q --seed $sd -r "$OUT/refs/newt-base.png" -o "$OUT/newt-s$sd.png" -p \
      "Edit image 1, a pixel art game sprite in the style of a fantasy game asset. Redraw the creature as a small newt: a slender bright lemon-yellow newt with a pale cream belly, small olive-green spots along its back, a long thin tail, four short splayed legs and a small rounded head with tiny black eyes and white highlights, seen from above at a slight angle. Bold clean dark-brown outline, readable at 32 pixels, centered with a clear margin, on a solid green background. Keep the same chunky pixel-art style, shading and outline weight as image 1." >> "$jobs"
    [[ -f $OUT/open-vertical-door-s$sd.png ]] || q --seed $sd -r "$OUT/refs/door-base.png" -o "$OUT/open-vertical-door-s$sd.png" -p \
      "Edit image 1, a top-down pixel art dungeon tile in the style of a fantasy game asset. Show an open doorway in a vertical stone wall: gray stone door jambs at the top and bottom edges, warm slate floor visible through the middle of the gap, and a brown wooden plank door with brass hinges swung fully open and lying flat against the left jamb. The opening must clearly read as a passage. Bold clean outlines, readable at 32 pixels, filling the whole tile. Keep the same chunky pixel-art style and palette as image 1." >> "$jobs"
  done
  [[ -s $jobs ]] || { echo "all candidates exist"; return; }
  [[ ${DRY:-} == 1 ]] && { echo "dry run: $(wc -l < "$jobs") jobs in $jobs"; return; }
  echo "$(date +%T) queued $(wc -l < "$jobs") jobs; waiting for the B70 lease"
  b70-lease run nethack-art -- "$B70" --batch "$jobs" -m qwen --xpu -W 1024 -H 1024 -n "$NEG" --cfg-steps 15
  postprocess
}

postprocess() {
  python3 - "$OUT" <<'PY'
import sys
from pathlib import Path
from PIL import Image
out = Path(sys.argv[1]); cand = out / "candidates"; cand.mkdir(exist_ok=True)
tiles = []
for src in sorted(out.glob("*-s*.png")):
    img = Image.open(src).convert("RGBA")
    if src.name.startswith("newt"):
        # Key out the green matte, and pull green spill off the edges.
        px = img.load()
        for y in range(img.height):
            for x in range(img.width):
                r, g, b, a = px[x, y]
                if g > 140 and g > r * 1.35 and g > b * 1.35:
                    px[x, y] = (0, 0, 0, 0)
                elif g > max(r, b):
                    px[x, y] = (r, max(r, b), b, a)
        box = img.getbbox()
        if box:
            img = img.crop(box)
        side = max(img.size)
        square = Image.new("RGBA", (side, side)); square.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
        small = square.resize((28, 28), Image.LANCZOS)
        tile = Image.new("RGBA", (32, 32)); tile.paste(small, (2, 2))
    else:
        tile = img.resize((32, 32), Image.LANCZOS)
    tile.save(cand / src.name)
    tiles.append((src.name, tile))
# Contact sheet: each candidate at 4x on dungeon-floor gray and on light gray.
if tiles:
    sheet = Image.new("RGBA", (len(tiles) * 140, 290), (24, 24, 30, 255))
    for i, (name, tile) in enumerate(tiles):
        big = tile.resize((128, 128), Image.NEAREST)
        for row, bg in enumerate([(74, 70, 64, 255), (200, 200, 200, 255)]):
            cell = Image.new("RGBA", (128, 128), bg); cell.alpha_composite(big)
            sheet.paste(cell, (i * 140 + 6, 6 + row * 140))
    sheet.save(out / "contact-sheet.png")
print(f"{len(tiles)} candidates in {cand}; sheet {out / 'contact-sheet.png'}")
PY
}

"${1:-queue}"
