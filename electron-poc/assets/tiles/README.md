# Electron POC tile assets

Organized installed assets live here, separate from raw generation outputs:

- `manifest.json` — renderer-facing list of installed/generated tile images.
- `generated/<category>/<asset-id>.png` — canonical installed PNG path used by Electron.
- `by-category/<category>/<asset-id>.png` — category browsing aliases/symlinks.
- `meta/` — reserved for renderer maps, notes, and future attribution.

Raw ComfyUI outputs and status tracking live in repo-level `asset-generation/`.
