#!/usr/bin/env python3
"""Targeted actual-game-size legibility fixes found by 50-up review sheets."""
from __future__ import annotations

import json
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / 'electron-poc/assets/tiles/manifest.json'
STATUS_PATH = ROOT / 'asset-generation/manifests/generation-status.json'
FIX_IDS = {'cave-spider', 'centipede', 'giant-spider', 'scorpion', 'scorpius', 'hole', 'pit', 'spiked-pit'}


def transparent():
    return Image.new('RGBA', (32, 32), (0, 0, 0, 0))


def outline(draw, func, args, fill, width=1):
    dark = (8, 8, 10, 245)
    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        if func == 'ellipse':
            draw.ellipse(tuple(a + (dx if i % 2 == 0 else dy) for i, a in enumerate(args)), fill=dark)
        elif func == 'poly':
            draw.polygon([(x + dx, y + dy) for x, y in args], fill=dark)
        elif func == 'line':
            draw.line([(x + dx, y + dy) for x, y in args], fill=dark, width=width + 2)
    if func == 'ellipse':
        draw.ellipse(args, fill=fill)
    elif func == 'poly':
        draw.polygon(args, fill=fill)
    elif func == 'line':
        draw.line(args, fill=fill, width=width)


def spider_sprite(name: str):
    img = transparent(); d = ImageDraw.Draw(img)
    n = name.lower()
    body = (188, 96, 58, 255) if 'scorpion' not in n else (210, 132, 64, 255)
    hi = (238, 170, 92, 255)
    # bright, compact arthropod body that survives 16px downscale
    outline(d, 'ellipse', (9, 9, 24, 23), body)
    outline(d, 'ellipse', (5, 12, 14, 21), hi)
    for y in [12, 16, 20]:
        outline(d, 'line', [(10, y), (2, y - 4)], hi, width=2)
        outline(d, 'line', [(22, y), (30, y - 4)], hi, width=2)
    d.ellipse((7, 15, 10, 18), fill=(5, 5, 6, 255)); d.ellipse((11, 15, 14, 18), fill=(5, 5, 6, 255))
    if 'scorpion' in n:
        outline(d, 'line', [(22, 13), (27, 8), (25, 4)], hi, width=3)
        outline(d, 'poly', [(24, 4), (29, 2), (27, 8)], (245, 210, 110, 255))
    if 'centipede' in n:
        img = transparent(); d = ImageDraw.Draw(img)
        outline(d, 'line', [(4, 18), (9, 14), (15, 17), (21, 14), (28, 17)], (222, 150, 60, 255), width=5)
        for x in [8, 14, 20, 25]:
            d.line((x, 17, x - 3, 23), fill=(245, 190, 100, 255), width=2)
            d.line((x, 16, x + 2, 10), fill=(245, 190, 100, 255), width=2)
        d.ellipse((25, 14, 29, 18), fill=(5, 5, 6, 255))
    return img


def pit_sprite(kind: str):
    img = transparent(); d = ImageDraw.Draw(img)
    # Higher-contrast tan rim plus black center; still a transparent overlay, no floor card.
    outline(d, 'ellipse', (4, 8, 28, 27), (38, 31, 26, 245))
    d.arc((5, 7, 27, 25), 178, 358, fill=(232, 190, 118, 255), width=3)
    d.arc((7, 10, 25, 27), 0, 175, fill=(112, 82, 55, 255), width=2)
    d.ellipse((9, 13, 23, 25), fill=(6, 5, 5, 230))
    if 'spiked' in kind:
        for x in [11, 16, 21]:
            outline(d, 'poly', [(x, 23), (x + 2, 15), (x + 4, 23)], (218, 218, 205, 255))
    return img


def write_asset(asset, img):
    for key in ('installedPath', 'outputPath'):
        p = ROOT / asset[key]
        p.parent.mkdir(parents=True, exist_ok=True)
        img.save(p)
    mirror = ROOT / 'electron-poc/assets/tiles/by-category' / asset['categorySlug'] / (asset['id'] + '.png')
    if mirror.exists():
        img.save(mirror)


def main():
    manifest = json.loads(MANIFEST_PATH.read_text(), object_pairs_hook=OrderedDict)
    status = json.loads(STATUS_PATH.read_text(), object_pairs_hook=OrderedDict) if STATUS_PATH.exists() else OrderedDict()
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    changed = []
    for asset in manifest['assets']:
        aid = asset['id']
        if aid not in FIX_IDS:
            continue
        img = pit_sprite(aid) if aid in {'hole', 'pit', 'spiked-pit'} else spider_sprite(asset['name'])
        write_asset(asset, img)
        asset['renderingNotes'] = (asset.get('renderingNotes', '') + ' 50-up actual-size review fix: increased silhouette/rim contrast for 16px map readability while preserving transparency. Upgraded from placeholder initial badge to readable silhouette art; manifest id/path preserved.').strip() if asset.get('categorySlug') == 'full-source-monsters' else (asset.get('renderingNotes', '') + ' 50-up actual-size review fix: increased silhouette/rim contrast for 16px map readability while preserving transparency.').strip()
        asset['workflow'] = 'asset-generation/scripts/fix_small_legibility_assets.py'
        asset['workflowLabel'] = 'deterministic-silhouette-source-backlog-v2' if asset.get('categorySlug') == 'full-source-monsters' else 'actual-size-legibility-fix-v1'
        if aid in status.get('assets', {}):
            status['assets'][aid].update({'status': 'complete', 'updatedAt': now, 'workflowLabel': asset['workflowLabel']})
        changed.append(aid)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + '\n')
    if status:
        STATUS_PATH.write_text(json.dumps(status, indent=2) + '\n')
    print(json.dumps({'changedCount': len(changed), 'changedIds': changed}, indent=2))


if __name__ == '__main__':
    main()
