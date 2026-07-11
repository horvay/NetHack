#!/usr/bin/env python3
"""Build actual in-game scale diagnostic review sheets for selected NetHack tile ids.

This script intentionally loads the installed 32x32 tile PNGs from the Electron
manifest, not raw 512px ComfyUI outputs. 16px sheets are produced by downscaling
the installed 32px tile to 16px. Optional magnified sheets upscale the complete
composited tile only after the in-game scale render, so they cannot crop/zoom
into raw sprite fragments.
"""
from __future__ import annotations

import argparse
import json
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / 'electron-poc/assets/tiles/manifest.json'
STATUS_PATH = ROOT / 'asset-generation/manifests/generation-status.json'
TRANSPARENT_SLUGS = {
    'common-early-monsters', 'full-source-monsters', 'objects-inventory',
    'full-source-objects', 'player-pets-identity', 'traps-hazards',
}
TILE_SOURCE = 32
STRICT_GAME = 16


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def load_manifest() -> list[dict]:
    return json.loads(MANIFEST_PATH.read_text(), object_pairs_hook=OrderedDict)['assets']


def load_status() -> dict:
    return json.loads(STATUS_PATH.read_text())


def floor_tile(size: int) -> Image.Image:
    img = Image.new('RGBA', (size, size), (38, 36, 36, 255))
    d = ImageDraw.Draw(img)
    step = max(4, size // 4)
    for y in range(0, size, step):
        d.line((0, y, size, y), fill=(27, 26, 26, 255))
    for x in range(0, size, step):
        d.line((x, 0, x, size), fill=(48, 45, 45, 255))
    # a few low-contrast pebble highlights similar to dungeon stone
    for x, y in [(size // 5, size // 4), (size * 3 // 5, size // 3), (size // 2, size * 3 // 4)]:
        d.point((x, y), fill=(62, 58, 56, 255))
    return img


def checker(size: int) -> Image.Image:
    img = Image.new('RGBA', (size, size), (238, 238, 238, 255))
    d = ImageDraw.Draw(img)
    cell = max(4, size // 4)
    for y in range(0, size, cell):
        for x in range(0, size, cell):
            color = (184, 184, 184, 255) if ((x // cell + y // cell) & 1) else (236, 236, 236, 255)
            d.rectangle((x, y, min(size - 1, x + cell - 1), min(size - 1, y + cell - 1)), fill=color)
    return img


def alpha_preview(alpha: Image.Image, size: int) -> Image.Image:
    a = alpha.resize((size, size), Image.Resampling.LANCZOS if size < alpha.width else Image.Resampling.NEAREST)
    return Image.merge('RGBA', (a, a, a, Image.new('L', (size, size), 255)))


def is_transparent_expected(asset: dict) -> bool:
    slug = asset.get('categorySlug')
    return slug in TRANSPARENT_SLUGS or (slug == 'ui-status-overlays' and 'panel' not in asset['id'] and 'bar' not in asset['id'])


def installed_image(asset: dict) -> Image.Image:
    return Image.open(ROOT / asset['installedPath']).convert('RGBA')


def composite(asset: dict, tile_px: int, mode: str) -> Image.Image:
    src = installed_image(asset)
    if mode == 'alpha':
        return alpha_preview(src.getchannel('A'), tile_px)
    scaled = src.resize((tile_px, tile_px), Image.Resampling.LANCZOS if tile_px < TILE_SOURCE else Image.Resampling.NEAREST)
    bg = checker(tile_px) if mode == 'checker' else floor_tile(tile_px)
    bg.alpha_composite(scaled)
    return bg


def make_labeled_sheet(assets: list[dict], out: Path, tile_px: int, mode: str, magnify: int = 1) -> None:
    label_h = 14
    pad = 4
    rendered_tile = tile_px * magnify
    cell_w = max(78, rendered_tile + pad * 2)
    cell_h = rendered_tile + label_h + pad * 2
    cols = min(4, len(assets))
    rows = (len(assets) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell_w, rows * cell_h), (18, 18, 22, 255))
    d = ImageDraw.Draw(sheet)
    for idx, asset in enumerate(assets):
        cx = (idx % cols) * cell_w
        cy = (idx // cols) * cell_h
        tile = composite(asset, tile_px, mode)
        if magnify != 1:
            tile = tile.resize((rendered_tile, rendered_tile), Image.Resampling.NEAREST)
        tx = cx + (cell_w - rendered_tile) // 2
        ty = cy + label_h + pad
        sheet.alpha_composite(tile, (tx, ty))
        d.rounded_rectangle((cx + 2, cy + 1, cx + min(cell_w - 2, 8 + len(asset['id']) * 6), cy + label_h), radius=2, fill=(0, 0, 0, 220))
        d.text((cx + 4, cy + 2), asset['id'], fill=(255, 255, 255, 255))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert('RGB').save(out, optimize=True)


def edge_opaque_count(alpha: Image.Image) -> int:
    w, h = alpha.size
    vals = []
    for x in range(w):
        vals.append(alpha.getpixel((x, 0))); vals.append(alpha.getpixel((x, h - 1)))
    for y in range(h):
        vals.append(alpha.getpixel((0, y))); vals.append(alpha.getpixel((w - 1, y)))
    return sum(v > 250 for v in vals)


def metric_record(asset: dict, status: dict) -> OrderedDict:
    im = installed_image(asset)
    alpha = im.getchannel('A')
    pixels = list(im.getdata())
    alpha_data = list(alpha.getdata())
    non = sum(a > 0 for a in alpha_data)
    opaque = sum(a == 255 for a in alpha_data)
    greenish = sum(1 for r, g, b, a in pixels if a > 0 and g > 150 and r < 100 and b < 120)
    small = im.resize((STRICT_GAME, STRICT_GAME), Image.Resampling.LANCZOS)
    small_alpha = small.getchannel('A')
    comp16 = composite(asset, STRICT_GAME, 'floor')
    bg16 = floor_tile(STRICT_GAME)
    contrast = round(mean(ImageStat.Stat(ImageChops.difference(comp16.convert('RGB'), bg16.convert('RGB'))).mean), 2)
    rec = status.get('assets', {}).get(asset['id'], {})
    issues = []
    if is_transparent_expected(asset) and edge_opaque_count(alpha):
        issues.append('opaque-edge/background-card')
    if is_transparent_expected(asset) and non / (im.width * im.height) > 0.72:
        issues.append('card-like-fill')
    if sum(v > 32 for v in small_alpha.getdata()) < 8:
        issues.append('too-few-visible-pixels-at-16px')
    if contrast < 8:
        issues.append('low-contrast-at-16px')
    return OrderedDict([
        ('id', asset['id']),
        ('path', asset['installedPath']),
        ('statusPath', rec.get('installedPath')),
        ('workflow', rec.get('workflow')),
        ('coherentRestartStatus', rec.get('coherentRestartStatus')),
        ('coherentRestartQaStatus', rec.get('coherentRestartQaStatus')),
        ('size', list(im.size)),
        ('bbox', list(alpha.getbbox()) if alpha.getbbox() else None),
        ('nonTransparentRatio', round(non / (im.width * im.height), 4)),
        ('opaqueRatio', round(opaque / (im.width * im.height), 4)),
        ('opaqueEdgePixels', edge_opaque_count(alpha)),
        ('greenishVisiblePixels', greenish),
        ('small16VisiblePixels', sum(v > 32 for v in small_alpha.getdata())),
        ('small16Bbox', list(small_alpha.getbbox()) if small_alpha.getbbox() else None),
        ('contrast16', contrast),
        ('issues', issues),
    ])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids', required=True, help='comma-separated manifest ids in desired order')
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--prefix', default='diagnostic')
    args = ap.parse_args()

    wanted = [x.strip() for x in args.ids.split(',') if x.strip()]
    manifest = load_manifest()
    by_id = {a['id']: a for a in manifest}
    missing = [aid for aid in wanted if aid not in by_id]
    if missing:
        raise SystemExit(f'Unknown manifest ids: {missing}')
    assets = [by_id[aid] for aid in wanted]
    status = load_status()
    out = Path(args.out_dir)

    outputs = OrderedDict()
    for mode in ('floor', 'checker', 'alpha'):
        for tile_px in (32, 16):
            path = out / f'{args.prefix}-{tile_px}px-review-{mode}.png'
            make_labeled_sheet(assets, path, tile_px, mode, magnify=1)
            outputs[f'{tile_px}px-{mode}'] = str(path)
            mag = 4 if tile_px == 32 else 8
            mag_path = out / f'{args.prefix}-{tile_px}px-review-{mode}-magnified-full-tile.png'
            make_labeled_sheet(assets, mag_path, tile_px, mode, magnify=mag)
            outputs[f'{tile_px}px-{mode}-magnified-full-tile'] = str(mag_path)

    metrics = OrderedDict([
        ('reviewedAt', now_iso()),
        ('source', 'installed 32x32 PNGs from electron-poc/assets/tiles/manifest.json, not raw512 files'),
        ('ids', wanted),
        ('outputs', outputs),
        ('records', [metric_record(a, status) for a in assets]),
    ])
    metrics_path = out / f'{args.prefix}-alpha-green-readability-metrics.json'
    metrics_path.write_text(json.dumps(metrics, indent=2) + '\n')
    outputs['metrics'] = str(metrics_path)
    print(json.dumps(outputs, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
