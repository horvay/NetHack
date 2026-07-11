#!/usr/bin/env python3
"""Create actual-size 50-up NetHack asset review sheets and audit JSON.

The sheets deliberately avoid the older 2x/zoomed contact-sheet style: each asset is
rendered at source tile size (32px) and at a stricter downscaled map size (16px).
A separate JSON/Markdown audit summarizes alpha/transparency and small-size legibility.
"""
from __future__ import annotations

import argparse
import json
import math
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / 'electron-poc/assets/tiles/manifest.json'
DEFAULT_EVIDENCE = Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-eta-climbing-rocket-70')
TRANSPARENT_SLUGS = {
    'common-early-monsters', 'full-source-monsters', 'objects-inventory',
    'full-source-objects', 'player-pets-identity', 'traps-hazards',
}
OPAQUE_OK_SLUGS = {'terrain-features'}
OPAQUE_UI_IDS = {'message-panel', 'stats-panel', 'inventory-panel', 'hp-bar', 'power-bar', 'health-bar', 'message-log-panel'}
TILE_SOURCE = 32
STRICT_GAME = 16
COLS = 10
ROWS = 5
BATCH_SIZE = COLS * ROWS


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def load_manifest():
    return json.loads(MANIFEST_PATH.read_text(), object_pairs_hook=OrderedDict)['assets']


def floor_tile(size: int) -> Image.Image:
    img = Image.new('RGBA', (size, size), (37, 35, 35, 255))
    d = ImageDraw.Draw(img)
    step = max(4, size // 4)
    for y in range(0, size, step):
        d.line((0, y, size, y), fill=(28, 27, 27, 255))
    for x in range(0, size, step):
        d.line((x, 0, x, size), fill=(45, 43, 43, 255))
    return img


def checker(size: int) -> Image.Image:
    img = Image.new('RGBA', (size, size), (238, 238, 238, 255))
    d = ImageDraw.Draw(img)
    cell = max(4, size // 4)
    for y in range(0, size, cell):
        for x in range(0, size, cell):
            d.rectangle((x, y, min(size - 1, x + cell - 1), min(size - 1, y + cell - 1)),
                        fill=(188, 188, 188, 255) if ((x // cell + y // cell) & 1) else (235, 235, 235, 255))
    return img


def is_overlay(asset) -> bool:
    slug = asset.get('categorySlug')
    if slug in TRANSPARENT_SLUGS:
        return True
    if slug == 'ui-status-overlays' and asset['id'] not in OPAQUE_UI_IDS and not any(token in asset['id'] for token in ('panel', 'bar', 'log')):
        return True
    return False


def expected_transparent(asset) -> bool:
    return is_overlay(asset)


def img_for(asset) -> Image.Image:
    return Image.open(ROOT / asset['installedPath']).convert('RGBA')


def composite_tile(asset, tile_px: int, mode: str) -> Image.Image:
    im = img_for(asset).resize((tile_px, tile_px), Image.Resampling.LANCZOS if tile_px < TILE_SOURCE else Image.Resampling.NEAREST)
    if mode == 'alpha':
        bg = checker(tile_px)
    elif is_overlay(asset):
        bg = floor_tile(tile_px)
    else:
        bg = Image.new('RGBA', (tile_px, tile_px), (10, 10, 14, 255))
    bg.alpha_composite(im)
    return bg


def make_sheet(batch, out: Path, tile_px: int, mode: str):
    gutter = 1
    w = COLS * tile_px + (COLS - 1) * gutter
    h = ROWS * tile_px + (ROWS - 1) * gutter
    sheet = Image.new('RGBA', (w, h), (20, 20, 24, 255))
    for idx, asset in enumerate(batch):
        x = (idx % COLS) * (tile_px + gutter)
        y = (idx // COLS) * (tile_px + gutter)
        sheet.alpha_composite(composite_tile(asset, tile_px, mode), (x, y))
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


def contrast_score(comp: Image.Image) -> float:
    # Mean absolute difference between the rendered tile and its background at 16px.
    bg = floor_tile(STRICT_GAME)
    diff = ImageChops.difference(comp.convert('RGB'), bg.convert('RGB'))
    return round(mean(ImageStat.Stat(diff).mean), 2)


def audit_asset(asset):
    im = img_for(asset)
    alpha = im.getchannel('A')
    data = list(alpha.getdata())
    non = sum(v > 0 for v in data)
    opaque = sum(v == 255 for v in data)
    bbox = alpha.getbbox()
    small = im.resize((STRICT_GAME, STRICT_GAME), Image.Resampling.LANCZOS)
    small_alpha = small.getchannel('A')
    small_visible = sum(v > 32 for v in small_alpha.getdata())
    small_bbox = small_alpha.getbbox()
    comp16 = composite_tile(asset, STRICT_GAME, 'game')
    transparent_required = expected_transparent(asset)
    issues = []
    if transparent_required and edge_opaque_count(alpha):
        issues.append('opaque-edge/background-card')
    if transparent_required and non / (im.width * im.height) > 0.72:
        issues.append('card-like-fill')
    if transparent_required and opaque / (im.width * im.height) > 0.90:
        issues.append('nearly-fully-opaque')
    if small_visible < 8:
        issues.append('too-few-visible-pixels-at-16px')
    cscore = contrast_score(comp16)
    if cscore < 8 and (transparent_required or asset.get('categorySlug') not in OPAQUE_OK_SLUGS):
        issues.append('low-contrast-at-16px')
    status = 'acceptable' if not issues else 'review'
    # Known Boss focus assets get explicit semantic notes even when passing.
    semantic_note = ''
    if asset['id'] in {'kitten', 'kitten-pet', 'little-dog-pet', 'pony-pet'}:
        semantic_note = 'pet/animal overlay; transparent background required'
    elif asset['id'] in {'up-stairs', 'branch-stairs-up'}:
        semantic_note = 'up stair terrain; opaque floor/stone background allowed and expected'
    elif asset['id'] == 'engraving':
        semantic_note = 'floor scratches/runes; should not read as boulder'
    return OrderedDict([
        ('id', asset['id']), ('name', asset.get('name')), ('categorySlug', asset.get('categorySlug')),
        ('path', asset.get('installedPath')), ('transparentRequired', transparent_required),
        ('bbox', list(bbox) if bbox else None), ('nonTransparentRatio', round(non / (im.width * im.height), 4)),
        ('opaqueRatio', round(opaque / (im.width * im.height), 4)), ('opaqueEdgePixels', edge_opaque_count(alpha)),
        ('small16VisiblePixels', small_visible), ('small16Bbox', list(small_bbox) if small_bbox else None),
        ('contrast16', cscore), ('status', status), ('issues', issues), ('semanticNote', semantic_note),
    ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--evidence-dir', default=str(DEFAULT_EVIDENCE))
    args = ap.parse_args()
    evidence = Path(args.evidence_dir)
    sheet_dir = evidence / 'asset-review-50up'
    sheet_dir.mkdir(parents=True, exist_ok=True)
    assets = load_manifest()
    by_slug = defaultdict(list)
    for asset in assets:
        by_slug[asset['categorySlug']].append(asset)

    sheets = []
    legend = []
    order = ['terrain-features', 'player-pets-identity', 'traps-hazards', 'common-early-monsters',
             'objects-inventory', 'ui-status-overlays', 'full-source-monsters', 'full-source-objects']
    sheet_no = 1
    for slug in order:
        category_assets = by_slug.get(slug, [])
        for batch_no, start in enumerate(range(0, len(category_assets), BATCH_SIZE), 1):
            batch = category_assets[start:start + BATCH_SIZE]
            stem = f'{sheet_no:02d}-{slug}-batch-{batch_no:02d}'
            game32 = sheet_dir / f'{stem}-game-32px-50up.png'
            game16 = sheet_dir / f'{stem}-game-16px-50up.png'
            make_sheet(batch, game32, TILE_SOURCE, 'game')
            make_sheet(batch, game16, STRICT_GAME, 'game')
            sheets.extend([str(game32), str(game16)])
            if any(expected_transparent(a) for a in batch):
                alpha32 = sheet_dir / f'{stem}-alpha-checker-32px-50up.png'
                make_sheet(batch, alpha32, TILE_SOURCE, 'alpha')
                sheets.append(str(alpha32))
            legend.append(OrderedDict([
                ('sheetBase', stem), ('categorySlug', slug), ('batchNumber', batch_no),
                ('assetCount', len(batch)), ('assetIds', [a['id'] for a in batch]),
            ]))
            sheet_no += 1

    records = [audit_asset(a) for a in assets]
    issues = [r for r in records if r['issues']]
    trans_required = [r for r in records if r['transparentRequired']]
    trans_failures = [r for r in trans_required if any(i in r['issues'] for i in ('opaque-edge/background-card', 'card-like-fill', 'nearly-fully-opaque'))]
    by_status = defaultdict(int)
    for r in records:
        by_status[r['status']] += 1
    focus_ids = {'kitten', 'kitten-pet', 'little-dog-pet', 'pony-pet', 'up-stairs', 'branch-stairs-up', 'down-stairs', 'branch-stairs-down', 'engraving', 'falling-rock-trap'}
    focus = [r for r in records if r['id'] in focus_ids]

    report = OrderedDict([
        ('reviewedAt', now_iso()), ('assetCount', len(records)), ('sheetCount', len(sheets)),
        ('sheetDirectory', str(sheet_dir)), ('legendPath', str(sheet_dir / 'legend.json')),
        ('statusCounts', dict(by_status)), ('transparentRequiredCount', len(trans_required)),
        ('transparencyFailureCount', len(trans_failures)), ('issueCount', len(issues)),
        ('sheets', sheets), ('legend', legend), ('transparencyFailures', trans_failures),
        ('legibilityReviewItems', issues), ('bossFocusAssets', focus), ('records', records),
    ])
    (sheet_dir / 'legend.json').write_text(json.dumps(legend, indent=2) + '\n')
    (evidence / 'asset-review-50up-report.json').write_text(json.dumps(report, indent=2) + '\n')

    md = []
    md.append('# NetHack asset 50-up actual-size review\n')
    md.append(f'- Reviewed: {report["reviewedAt"]}\n')
    md.append(f'- Assets: {len(records)}; sheets: {len(sheets)}; transparent-required: {len(trans_required)}; transparency failures: {len(trans_failures)}; automated review items: {len(issues)}\n')
    md.append(f'- Sheet directory: `{sheet_dir}`\n')
    md.append(f'- Legend: `{sheet_dir / "legend.json"}`\n')
    md.append('\n## Critique summary\n')
    if not issues:
        md.append('- Automated alpha/readability audit found no failing cards, opaque-edge overlays, or too-small/low-contrast 16px icons. Sheets remain the visual evidence for human review.\n')
    else:
        md.append('- Items needing review/fix:\n')
        for r in issues[:80]:
            md.append(f"  - `{r['id']}` ({r['categorySlug']}): {', '.join(r['issues'])}; visible16={r['small16VisiblePixels']}; contrast16={r['contrast16']}\n")
    md.append('\n## Boss focus checks\n')
    for r in focus:
        verdict = 'PASS' if not r['issues'] else 'REVIEW'
        md.append(f"- {verdict} `{r['id']}`: transparentRequired={r['transparentRequired']}, opaqueEdgePixels={r['opaqueEdgePixels']}, note={r['semanticNote']}\n")
    md.append('\n## Transparency audit\n')
    if not trans_failures:
        md.append(f'- PASS: all {len(trans_required)} monster/pet/object/trap/effect overlay assets requiring transparency have no opaque card/background failure. Terrain/base tiles may be opaque.\n')
    else:
        for r in trans_failures:
            md.append(f"- FAIL `{r['id']}`: {', '.join(r['issues'])}\n")
    md.append('\n## 50-up sheet paths\n')
    for s in sheets:
        md.append(f'- `{s}`\n')
    (evidence / 'asset-review-50up-summary.md').write_text(''.join(md))
    print(json.dumps({'report': str(evidence / 'asset-review-50up-report.json'), 'summary': str(evidence / 'asset-review-50up-summary.md'), 'sheetCount': len(sheets), 'issueCount': len(issues), 'transparencyFailureCount': len(trans_failures)}, indent=2))
    return 1 if trans_failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
