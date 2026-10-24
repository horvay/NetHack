#!/usr/bin/env python3
"""Copies the generated tile art from assets/tiles into the Godot project.

Source of truth: assets/tiles/manifest.json and tile-map.json.
Output: project/assets/tiles/<id>.png (map size, 32 px), <id>.portrait.png for
large source art (hero avatars), and tiles.json (asset metadata + tile map)
read by project/game/world/tile_resolver.gd. Re-run after new art is installed.
"""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

GODOT = Path(__file__).resolve().parent.parent
ROOT = GODOT.parent
SOURCE = ROOT / "assets" / "tiles"
OUT = GODOT / "project" / "assets" / "tiles"
MAP_SIZE = 32
LARGE_MAP_SIZE = 64
PORTRAIT_SIZE = 256


def fit_square(image: Image.Image, margin: float) -> Image.Image:
    """Crops transparent margins and centers the figure on a square canvas."""
    bbox = image.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    if bbox:
        image = image.crop(bbox)
    side = int(max(image.size) * (1.0 + margin))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(image, ((side - image.width) // 2, side - image.height - int(side * margin / 4)))
    return canvas


def main() -> int:
    manifest = json.loads((SOURCE / "manifest.json").read_text())
    tile_map = json.loads((SOURCE / "tile-map.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    assets = {}
    for asset in manifest["assets"]:
        src = ROOT / asset["installedPath"]
        if not src.is_file():
            print(f"missing {src}", file=sys.stderr)
            continue
        asset_id = asset["id"]
        image = Image.open(src).convert("RGBA")
        entry = {"category": asset.get("categorySlug", ""), "name": asset.get("name", asset_id),
                 "workflow": asset.get("workflow", ""), "workflowLabel": asset.get("workflowLabel", "")}
        if asset.get("objectClasses"):
            # The NetHack object classes this name exists in ("=" ring, "!"
            # potion…): the resolver won't use the art for another class.
            entry["objectClasses"] = asset["objectClasses"]
        # A hero's painted portrait kept beside its pixel map sprite
        # (player-combo-portraits/<id>.png): the sprite on the map, the
        # painting on the hero card and character sheet.
        painting = src.parent.parent / "player-combo-portraits" / f"{asset_id}.png"
        if image.size == (MAP_SIZE, MAP_SIZE) and painting.is_file():
            shutil.copyfile(src, OUT / f"{asset_id}.png")
            fit_square(Image.open(painting).convert("RGBA"), 0.04).resize((PORTRAIT_SIZE, PORTRAIT_SIZE), Image.Resampling.LANCZOS).save(OUT / f"{asset_id}.portrait.png")
            entry["portrait"] = True
        elif image.size == (MAP_SIZE, MAP_SIZE):
            shutil.copyfile(src, OUT / f"{asset_id}.png")
        else:
            # Large painted art (hero avatars): a cropped 64 px map sprite drawn
            # smoothly at tile size, plus the full portrait for the UI.
            figure = fit_square(image, 0.08)
            figure.resize((LARGE_MAP_SIZE, LARGE_MAP_SIZE), Image.Resampling.LANCZOS).save(OUT / f"{asset_id}.png")
            fit_square(image, 0.04).resize((PORTRAIT_SIZE, PORTRAIT_SIZE), Image.Resampling.LANCZOS).save(OUT / f"{asset_id}.portrait.png")
            entry["portrait"] = True
            entry["smooth"] = True
        assets[asset_id] = entry
    # Godot-only replacements (tools/art/regen_sprites.sh picks), applied
    # over the shared tileset so Electron's art stays unchanged.
    overrides = GODOT / "tools" / "art" / "overrides"
    for override in sorted(overrides.glob("*.png")):
        if override.stem in assets:
            shutil.copyfile(override, OUT / override.name)
            print(f"override {override.stem}")
    (OUT / "tiles.json").write_text(json.dumps({"assets": assets, "tileMap": tile_map}, indent=1, sort_keys=True))
    print(f"synced {len(assets)} tiles into {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
