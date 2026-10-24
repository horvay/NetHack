# NetHack early-level asset generation

This folder contains the ComfyUI-driven generation pipeline for the 239 assets listed in `docs/electron-poc/early-level-asset-art-directions.html`.

## Layout

- `workflows/krea2_basic.json` — Boss-provided ComfyUI workflow copied from `/home/horvay/Downloads/krea2_basic.json`.
- `scripts/generate_assets.py` — parser/generator/installer with dry-run, subset, full, resume/skip, and status tracking.
- `manifests/early-level-assets.json` — parsed production checklist from the HTML.
- `manifests/generation-status.json` — per-asset status, prompts, output paths, installed paths, and errors.
- `outputs/<category>/<asset-id>.png` — raw downloaded generation outputs.
- `logs/` — dry-run and generation logs.

## Install target

Every successful generation is installed into `assets/tiles/generated/<category>/<asset-id>.png` and added to `assets/tiles/manifest.json`, the shared tileset. The Godot front end copies it into its project with `godot-poc/tools/sync_tiles.py`.

## Commands

Plan a small subset without contacting ComfyUI:

```bash
asset-generation/scripts/generate_assets.py --dry-run --subset 5
```

Check ComfyUI reachability:

```bash
asset-generation/scripts/generate_assets.py --dry-run --check-endpoint
```

Generate a safe representative subset:

```bash
asset-generation/scripts/generate_assets.py --ids room-floor,vertical-wall,closed-door,hero-avatar --full --seed 124
```

Generate all assets, resuming/skipping installed items:

```bash
asset-generation/scripts/generate_assets.py --full
```

Use `COMFYUI_ENDPOINT=http://host:port` or `--endpoint` to change the default `http://127.0.0.1:8188`. If ComfyUI is unreachable, the script reports the endpoint error and exits; it does not retry indefinitely or fall back to manual art.
