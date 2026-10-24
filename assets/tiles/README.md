# Tile assets

The installed tileset, separate from raw generation outputs:

- `manifest.json` — the list of installed tile images (`installedPath`, category, provenance, sha256).
- `tile-map.json` — maps NetHack glyphs and cells to asset ids.
- `generated/<category>/<asset-id>.png` — canonical installed PNG path.
- `by-category/<category>/<asset-id>.png` — category browsing aliases/symlinks.
- `meta/` — reserved for maps, notes, and future attribution.

Raw ComfyUI outputs and status tracking live in repo-level `asset-generation/`. The Godot front end copies this tileset into `godot-poc/project/assets/tiles/` with `godot-poc/tools/sync_tiles.py`; re-run it after installing new art.
