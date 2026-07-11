#!/usr/bin/env python3
"""AI-refine a critique-driven batch of NetHack tiles from the 50-up review.

This is intentionally targeted, not a procedural redraw: it sends bespoke prompts to
ComfyUI using the transparent-background workflow, installs curated 32x32 sprites,
and records backup/status metadata.
"""
from __future__ import annotations

import importlib.util
import json
import shutil
import sys
import time
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('generate_assets_base', ROOT / 'asset-generation/scripts/generate_assets.py')
base = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = base
spec.loader.exec_module(base)  # type: ignore[union-attr]
base.WORKFLOW_PATH = ROOT / 'asset-generation/workflows/krea2_basic_rem_back.json'

STATUS = ROOT / 'asset-generation/manifests/generation-status.json'
EMAN = ROOT / 'electron-poc/assets/tiles/manifest.json'

STYLE = (
    'A single 32x32 NetHack roguelike dungeon tile sprite, AI-painted pixel-art/painted-pixel hybrid, '
    'transparent background, centered bold silhouette, chunky readable shapes for 16px gameplay size, '
    'high contrast on dark stone floor, cohesive fantasy game art, not a flat SVG/vector icon, not an emoji, '
    'no text, no letters, no UI frame, no border, no square card, no baked background rectangle. '
)
NEG = ' Keep transparent alpha around the object; avoid generic placeholder/recolor reuse; avoid thin hairline details.'

# High-confidence failures from critique-50up-initial: duplicate beige role avatars,
# boss humanoids, and tiny tool/object rods/cards that collapse at 16px.
TARGETS = {
    'archeologist-role-avatar': 'tiny adventurer archeologist with tan fedora hat, round spectacles, brown coat, small pickaxe over shoulder, distinct explorer silhouette',
    'barbarian-role-avatar': 'muscular barbarian adventurer with horned fur helm, bare arms, oversized double axe, aggressive wide stance',
    'healer-role-avatar': 'fantasy healer adventurer with white robe, green sash, medical satchel and raised glowing staff, gentle silhouette distinct from wizard',
    'knight-role-avatar': 'armored knight adventurer with silver helmet, blue shield, short sword, compact heroic pose',
    'ranger-role-avatar': 'green hooded ranger adventurer with visible bow and quiver, forest cloak, archer silhouette',
    'rogue-role-avatar': 'dark hooded rogue adventurer with black cloak, purple scarf, curved dagger and sneaking crouch',
    'samurai-role-avatar': 'samurai adventurer with red kabuto helmet crest, lamellar armor, katana angled upward, unmistakable silhouette',
    'tourist-role-avatar': 'tourist adventurer with bright hawaiian shirt colors, small camera, floppy hat, backpack, playful distinct silhouette',
    'valkyrie-role-avatar': 'valkyrie adventurer with winged silver helm, round shield, spear, blue cloak, strong readable silhouette',
    'wizard-role-avatar': 'wizard adventurer with tall blue pointed hat, purple robe, glowing staff, crescent silhouette distinct from other roles',
    'credit-card': 'small golden credit card object seen in perspective with chunky embossed stripe and glint, readable as a card not a blank line',
    'stethoscope': 'chunky black stethoscope tool with silver chestpiece and clear loop, simplified thick pixels readable at 16px',
    'tin-opener': 'compact hand crank tin opener tool, silver C-shaped opener with red handle, chunky shape not a thin line',
    'towel': 'folded white towel object with blue edge stripe, soft cloth folds, readable as towel not paper',
    'magic-marker': 'isolated chunky purple felt-tip marker pen, horizontal simple cylinder like a thick sharpie with cap on one end and bright glowing nib on the other, only a pen silhouette, no magic book, no rectangle, no card, no paper, no dark backplate, transparent background',
    'amulet-of-yendor': 'isolated legendary golden circular amulet with central red gem and chunky rays, crisp artifact silhouette, no dust or debris pixels, transparent background',
    'book-of-the-dead': 'ominous black spellbook with skull clasp and red corner gems, closed book perspective, no text',
    'candelabrum-of-invocation': 'bright gold seven-branched candelabrum with large visible candle flames, thick readable branches, bright warm outline, no debris, transparent background',
    'bell-of-opening': 'isolated gold hand bell artifact with glowing blue sparkle, no letters, thick outline, clean alpha with no debris pixels, transparent background',
    'wizard-of-yendor': 'unique evil wizard boss with tall red-black hat, skeletal face, raised staff with green orb, dramatic boss silhouette',
    'death': 'grim reaper boss, black hooded skeleton with large silver scythe, very high contrast silhouette',
    'medusa': 'Medusa boss with green snake hair, pale face, bow or claws, distinct snake-crowned silhouette',
    'charon': 'skeletal ferryman boss in dark cloak holding long oar, ghostly boatman silhouette',
}


def backup(path: Path, root: Path) -> None:
    if path.exists():
        dst = root / path.relative_to(ROOT)
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists():
            shutil.copy2(path, dst)


def alpha_cleanup(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    alpha = im.getchannel('A')
    if alpha.getextrema()[0] < 250:
        return im
    # Fallback if background removal workflow returns an opaque image: flood-clear
    # the edge color only. This is cleanup, not procedural art replacement.
    pix = im.load(); w, h = im.size
    edge = []
    for x in range(w): edge += [pix[x, 0][:3], pix[x, h - 1][:3]]
    for y in range(h): edge += [pix[0, y][:3], pix[w - 1, y][:3]]
    bg = tuple(sum(c[i] for c in edge) // len(edge) for i in range(3))
    stack = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    seen = set(); tol = 72
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or (x, y) in seen:
            continue
        r, g, b, a = pix[x, y]
        if (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2 > tol * tol:
            continue
        seen.add((x, y)); pix[x, y] = (r, g, b, 0)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return im


def fit_to_32(src: Path, dests: list[Path]) -> dict:
    im = alpha_cleanup(Image.open(src))
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((30, 30), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((32 - im.width) // 2, (32 - im.height) // 2))
    rgb = ImageEnhance.Contrast(canvas.convert('RGB')).enhance(1.10)
    canvas = Image.merge('RGBA', (*rgb.split(), canvas.getchannel('A'))).filter(ImageFilter.UnsharpMask(radius=0.6, percent=105, threshold=3))
    for d in dests:
        d.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(d)
    hist = canvas.getchannel('A').histogram()
    return {
        'transparentPixels': sum(hist[:16]),
        'semiTransparentPixels': sum(hist[16:240]),
        'opaquePixels': sum(hist[240:]),
        'size': list(canvas.size),
    }


def main() -> None:
    endpoint = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8188'
    wanted = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else set(TARGETS)
    manifest = json.loads(EMAN.read_text())
    assets = {a['id']: a for a in manifest['assets']}
    status = json.loads(STATUS.read_text())
    stamp = time.strftime('ai-critique-delta-refine-%Y%m%dT%H%M%SZ', time.gmtime())
    backup_root = ROOT / 'asset-generation/backups' / stamp
    stats = base.check_comfy(endpoint)
    print('ComfyUI reachable:', stats.get('system', {}).get('comfyui_version'))
    run = {
        'type': 'ai-critique-delta-refinement',
        'startedAt': time.strftime('%FT%TZ', time.gmtime()),
        'workflow': 'asset-generation/workflows/krea2_basic_rem_back.json',
        'targets': [],
        'backupRoot': str(backup_root.relative_to(ROOT)),
    }
    status.setdefault('runs', []).append(run)
    for i, aid in enumerate([x for x in TARGETS if x in wanted]):
        if aid not in assets:
            print('missing', aid); continue
        a = assets[aid]
        for rel in [a.get('installedPath'), a.get('outputPath')]:
            if rel:
                backup(ROOT / rel, backup_root)
        prompt = STYLE + TARGETS[aid] + '. ' + NEG
        asset = base.Asset(aid, a.get('name', aid), a.get('category', ''), a['categorySlug'], a.get('priority', 'P1'), a.get('glyph', ''), a.get('why', ''), TARGETS[aid], a.get('renderingNotes', ''), prompt)
        asset.outputPath = a.get('outputPath') or f'asset-generation/outputs/{asset.categorySlug}/{aid}.png'
        asset.installedPath = a['installedPath']
        print('AI refine', aid)
        raw = base.comfy_generate(endpoint, asset, seed=731510 + i)
        alpha = fit_to_32(raw, [ROOT / asset.outputPath, ROOT / asset.installedPath])
        rec = {**a, 'prompt': prompt, 'status': 'installed', 'workflow': 'asset-generation/workflows/krea2_basic_rem_back.json', 'workflowLabel': 'transparent-rmbg-ai-critique-delta-refine', 'aiRefinement': True, 'backupRoot': str(backup_root.relative_to(ROOT)), 'completedAt': time.strftime('%FT%TZ', time.gmtime()), 'alphaStats': alpha}
        status['assets'][aid] = rec
        a.update({k: rec[k] for k in ['prompt', 'workflow', 'workflowLabel', 'status'] if k in rec})
        run['targets'].append({'id': aid, 'alphaStats': alpha})
        print('installed', a['installedPath'], alpha)
    run['completedAt'] = time.strftime('%FT%TZ', time.gmtime())
    STATUS.write_text(json.dumps(status, indent=2) + '\n')
    EMAN.write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
