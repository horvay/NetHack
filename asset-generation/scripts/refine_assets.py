#!/usr/bin/env python3
"""Targeted ComfyUI refinement pass for visually weak NetHack Electron POC tiles.

Keeps the original production manifest, backs up the installed/output PNGs, writes
replacement PNGs through the existing ComfyUI workflow, and annotates generation-status
with refinement notes so the pass is resumable/auditable.
"""
from __future__ import annotations
import argparse, json, shutil, time, sys
from dataclasses import asdict
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parents[2]
BASE_PATH = ROOT / 'asset-generation/scripts/generate_assets.py'
spec = importlib.util.spec_from_file_location('generate_assets_base', BASE_PATH)
base = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = base
spec.loader.exec_module(base)  # type: ignore[union-attr]

REFINEMENTS = {
    'room-floor': 'clean top-down 32x32 roguelike stone floor tile, dark charcoal slate, a few broad low-contrast cracks only, seamless, flat orthographic, no letters, no symbols, no border, no object, readable at tiny size',
    'dark-room-floor': 'clean top-down 32x32 dark roguelike floor tile, blue-black stone slabs, very low contrast, simple broad shapes, seamless, no letters, no symbols, no border, readable but subdued',
    'lit-corridor': 'top-down 32x32 roguelike corridor floor tile, narrow walkable tunnel path centered, dark side margins, simple aligned stone slabs, low noise, no repeated glyphs, no text, no wall letters, readable at 16 pixels',
    'dark-corridor': 'top-down 32x32 dim corridor tile, narrow passable center path in muted gray brown, dark soft edges, simple stone texture, no black hole, no letters, no symbols, low noise, readable at tiny size',
    'vertical-wall': 'iconic top-down 32x32 dungeon wall segment, one thick vertical stone block bar centered, dark gray masonry, bright edge highlights, transparent/dark background, no text, no floor hole, clean silhouette',
    'horizontal-wall': 'iconic top-down 32x32 dungeon wall segment, one thick horizontal stone block bar across center, dark gray masonry, matching vertical wall palette, no text, no cracks that look like letters, clean silhouette',
    'wall-corner': 'top-down 32x32 dungeon wall corner tile, bold L shaped connected stone arms, dark gray blocks, clean geometry, no tiny noisy bricks, no letters, no perspective, readable at 16 px',
    'wall-tee-junction': 'top-down 32x32 dungeon wall tee junction tile, bold T shaped connected stone arms, same dark gray palette, clean chunky geometry, no tiny noisy bricks, no letters, readable at tiny size',
    'closed-door': 'top-down 32x32 closed dungeon door icon, sturdy wooden rectangle slab with small brass latch, centered, simple silhouette, no cross symbol, no text, high contrast against dark floor',
    'open-vertical-door': 'top-down 32x32 open vertical doorway tile, two short stone side jambs and clear passable dark floor gap through center, no white UI rectangle, no letters, no text, clean icon',
    'open-horizontal-door': 'top-down 32x32 open horizontal doorway threshold, two short stone jambs left and right with clear passable gap, low noise, no text, no black artifact, matches wall palette',
    'broken-door': 'top-down 32x32 broken dungeon door, splintered wooden planks lying in a doorway, passable debris, simple brown silhouette, no white poster, no glyph, no letters, readable at tiny size',
    'no-door-doorway': 'top-down 32x32 empty doorway in stone wall, side jambs and normal dark floor in middle, clearly passable opening, clean geometry, no perspective portal, no text, matches wall palette',
    'up-stairs': 'top-down 32x32 NetHack stairs up tile, compact light gray stone steps rising upward with a small subtle up arrow shape integrated into steps, no text, no UI icon, no black empty triangle, clean readable',
    'down-stairs': 'top-down 32x32 NetHack stairs down tile, compact dark gray descending steps with small downward arrow shape integrated into steps, no text, no UI icon, no black empty triangle, distinct from up stairs',
    'boulder': 'top-down 32x32 large gray boulder object, round heavy rock filling most of tile, simple silhouette, visible highlights, no face, no text, clear blocking object on dark floor',
    'coin-pile': 'top-down 32x32 small pile of gold coins treasure, bright gold disks and sparkle, centered on dark dungeon floor, no text, no dollar sign, readable at tiny size',
    'hero-avatar': 'top-down 32x32 roguelike player hero token inspired by @ symbol but drawn as tiny adventurer silhouette, bright warm outline, centered, no actual letter, no text, readable at 16 pixels',
    'kitten-pet': 'top-down 32x32 friendly kitten pet token, small cat silhouette with pointed ears and tiny blue collar dot, centered, no text, no letter, readable at 16 pixels',
    'kitten': 'top-down 32x32 hostile or neutral kitten monster token, small cat silhouette with pointed ears, simple tan gray shape, no pet badge, no text, readable at 16 pixels',
    'newt': 'top-down 32x32 small newt monster token, green lizard silhouette with tail, centered on dark floor, no text, no letter, readable at 16 pixels',
    'grid-bug': 'top-down 32x32 grid bug monster token, tiny electric insect with simple angular legs and blue spark, centered, no text, no letter x, readable at 16 pixels',
    'lichen': 'top-down 32x32 lichen monster token, small green fungus/moss patch with rounded silhouette, centered, no text, no letter F, readable at 16 pixels',
}

STYLE_PREFIX = 'A single cohesive NetHack dungeon tile, strict top-down orthographic pixel-art/painted pixel hybrid, final game asset must be readable when scaled to 32x32. '
STYLE_SUFFIX = '. Palette: dark charcoal dungeon, muted gray stone, warm wood/gold accents where appropriate. Avoid photorealism, diagonal perspective, UI frames, text, runes, letters, ASCII glyphs, watermarks, signatures, black void artifacts, excessive micro-noise.'


def backup(path: Path, backup_root: Path):
    if path.exists():
        rel = path.relative_to(ROOT)
        dest = backup_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            shutil.copy2(path, dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids', required=True, help='comma-separated refinement ids')
    ap.add_argument('--endpoint', default='http://127.0.0.1:8188')
    ap.add_argument('--seed', type=int, default=76076)
    ap.add_argument('--backup-tag', default=time.strftime('refine-%Y%m%dT%H%M%SZ', time.gmtime()))
    args = ap.parse_args()
    wanted = [x.strip() for x in args.ids.split(',') if x.strip()]
    status = base.load_existing_status()
    assets = {a.id: a for a in base.load_assets()}
    backup_root = ROOT / 'asset-generation/backups' / args.backup_tag
    run = {'type': 'targeted-refinement', 'startedAt': time.strftime('%FT%TZ', time.gmtime()), 'ids': wanted, 'seed': args.seed, 'backupRoot': str(backup_root.relative_to(ROOT)), 'stylePrefix': STYLE_PREFIX, 'styleSuffix': STYLE_SUFFIX}
    status.setdefault('runs', []).append(run)
    base.write_manifests(list(assets.values()), status)
    print('ComfyUI reachable:', base.check_comfy(args.endpoint).get('system',{}).get('comfyui_version','unknown'))
    for idx, aid in enumerate(wanted):
        if aid not in assets: raise SystemExit(f'unknown asset id: {aid}')
        a = assets[aid]
        prompt = STYLE_PREFIX + REFINEMENTS.get(aid, a.artDirection) + STYLE_SUFFIX
        a.prompt = prompt
        old_installed = ROOT / (status.get('assets',{}).get(aid,{}).get('installedPath') or f'electron-poc/assets/tiles/generated/{a.categorySlug}/{a.id}.png')
        old_output = ROOT / (status.get('assets',{}).get(aid,{}).get('outputPath') or f'asset-generation/outputs/{a.categorySlug}/{a.id}.png')
        backup(old_installed, backup_root)
        backup(old_output, backup_root)
        print('refine', aid)
        rec = {'status':'running','startedAt':time.strftime('%FT%TZ', time.gmtime()), 'prompt': prompt, 'refinement': True, 'backupRoot': str(backup_root.relative_to(ROOT))}
        status.setdefault('assets',{})[aid]=rec; base.write_manifests(list(assets.values()), status)
        src = base.comfy_generate(args.endpoint, a, args.seed + idx)
        base.install_asset(src, a)
        status['assets'][aid] = {**asdict(a), 'completedAt': time.strftime('%FT%TZ', time.gmtime()), 'refinement': True, 'backupRoot': str(backup_root.relative_to(ROOT)), 'refinementPrompt': prompt}
        base.write_manifests(list(assets.values()), status)
        print('installed', a.installedPath)
    run['completedAt'] = time.strftime('%FT%TZ', time.gmtime())
    base.write_manifests(list(assets.values()), status)

if __name__ == '__main__':
    main()
