#!/usr/bin/env python3
"""Install source-derived symbolic placeholder tiles for full NetHack monster/object coverage.

This script is intentionally deterministic and offline: it uses the prior missing-assets
analysis as the backlog baseline, writes transparent 32x32 symbolic PNG tiles, appends
manifest/status records, and adds renderer semantic-name mappings without disturbing
existing curated assets.
"""
from __future__ import annotations

import json
import math
import re
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BASELINE = Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-beta-sailing-cat-49/missing-assets-analysis.json')
MANIFEST_PATH = ROOT / 'electron-poc/assets/tiles/manifest.json'
STATUS_PATH = ROOT / 'asset-generation/manifests/generation-status.json'
TILE_MAP_PATH = ROOT / 'electron-poc/assets/tiles/tile-map.json'
EVIDENCE_DIR = Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-nu-sailing-cat-60')

MON_DIR = ROOT / 'electron-poc/assets/tiles/generated/full-source-monsters'
OBJ_DIR = ROOT / 'electron-poc/assets/tiles/generated/full-source-objects'
MON_OUT = ROOT / 'asset-generation/outputs/full-source-monsters'
OBJ_OUT = ROOT / 'asset-generation/outputs/full-source-objects'

MON_SYM_TO_CHAR = {
    'S_ANT': 'a', 'S_BLOB': 'b', 'S_COCKATRICE': 'c', 'S_DOG': 'd', 'S_EYE': 'e', 'S_FELINE': 'f',
    'S_GREMLIN': 'g', 'S_HUMANOID': 'h', 'S_IMP': 'i', 'S_JELLY': 'j', 'S_KOBOLD': 'k', 'S_LEPRECHAUN': 'l',
    'S_MIMIC': 'm', 'S_NYMPH': 'n', 'S_ORC': 'o', 'S_PIERCER': 'p', 'S_QUADRUPED': 'q', 'S_RODENT': 'r',
    'S_SPIDER': 's', 'S_TRAPPER': 't', 'S_UNICORN': 'u', 'S_VORTEX': 'v', 'S_WORM': 'w', 'S_XAN': 'x',
    'S_LIGHT': 'y', 'S_ZRUTY': 'z', 'S_ANGEL': 'A', 'S_BAT': 'B', 'S_CENTAUR': 'C', 'S_DRAGON': 'D',
    'S_ELEMENTAL': 'E', 'S_FUNGUS': 'F', 'S_GNOME': 'G', 'S_GIANT': 'H', 'S_JABBERWOCK': 'J', 'S_KOP': 'K',
    'S_LICH': 'L', 'S_MUMMY': 'M', 'S_NAGA': 'N', 'S_OGRE': 'O', 'S_PUDDING': 'P', 'S_QUANTMECH': 'Q',
    'S_RUSTMONST': 'R', 'S_SNAKE': 'S', 'S_TROLL': 'T', 'S_UMBER': 'U', 'S_VAMPIRE': 'V', 'S_WRAITH': 'W',
    'S_XORN': 'X', 'S_YETI': 'Y', 'S_ZOMBIE': 'Z', 'S_GOLEM': "'", 'S_HUMAN': '@', 'S_GHOST': ' ',
    'S_SHADE': ' ', 'S_LIZARD': ':', 'S_DEMON': '&', 'S_EEL': ';',
}

GLYPH_COLORS = {
    'a': (214, 110, 40), 'b': (80, 210, 90), 'c': (190, 180, 90), 'd': (170, 120, 70), 'e': (95, 210, 220),
    'f': (220, 170, 80), 'g': (110, 170, 80), 'h': (180, 145, 110), 'i': (200, 80, 200), 'j': (80, 190, 220),
    'k': (150, 105, 70), 'l': (60, 220, 120), 'm': (170, 120, 190), 'n': (230, 120, 210), 'o': (80, 170, 80),
    'p': (150, 130, 95), 'q': (180, 130, 80), 'r': (140, 95, 75), 's': (130, 80, 60), 't': (90, 80, 65),
    'u': (245, 245, 245), 'v': (135, 200, 240), 'w': (150, 75, 200), 'x': (230, 120, 40), 'y': (245, 230, 90),
    'z': (140, 80, 180), 'A': (245, 225, 145), 'B': (90, 80, 110), 'C': (170, 120, 70), 'D': (120, 170, 210),
    'E': (210, 110, 55), 'F': (80, 170, 80), 'G': (170, 145, 105), 'H': (150, 120, 90), 'J': (170, 70, 190),
    'K': (80, 105, 180), 'L': (170, 220, 220), 'M': (210, 200, 165), 'N': (160, 80, 160), 'O': (170, 110, 70),
    'P': (80, 60, 110), 'Q': (110, 220, 220), 'R': (170, 80, 60), 'S': (80, 190, 90), 'T': (90, 140, 90),
    'U': (100, 80, 60), 'V': (180, 40, 60), 'W': (160, 160, 180), 'X': (120, 120, 120), 'Y': (220, 220, 240),
    'Z': (120, 160, 120), '@': (235, 210, 150), '&': (220, 70, 50), ';': (70, 170, 210), ':': (90, 220, 90),
    "'": (180, 180, 180), ')': (210, 205, 170), '[': (150, 165, 185), '(': (190, 170, 120), '%': (190, 120, 80),
    '!': (180, 80, 220), '?': (220, 220, 180), '=': (220, 180, 90), '"': (160, 220, 220), '$': (240, 210, 80),
    '*': (120, 210, 240), '/': (220, 220, 230), '+': (230, 210, 120), ' ': (150, 150, 170),
}

OBJECT_CLASS_WORDS = [
    (')', ['sword','dagger','knife','axe','mace','club','hammer','spear','arrow','bow','crossbow','bolt','dart','shuriken','ya','tsurugi','saber','aklys','flail','glaive','lance','trident','voulge','halberd','partisan','ranseur','spetum','fauchard','guisarme','bec de corbin','bill-guisarme','lucern hammer','morning star','polearm','weapon','whip','tooth']),
    ('[', ['armor','mail','helm','gloves','boots','cloak','shield','gauntlets','shirt','robe','dragon scale']),
    ('(', ['lamp','lantern','candle','key','lock pick','pick-axe','tool','horn','flute','harp','drum','whistle','mirror','camera','towel','saddle','leash','stethoscope','tin opener','kit','marker','bag','chest','box','candelabrum','bell','ball','chain']),
    ('%', ['ration','food','corpse','egg','apple','orange','pear','melon','carrot','banana','tripe','meat','cream pie','tin','kelp','eucalyptus','clove','garlic','wolfsbane']),
    ('!', ['potion','sickness','acid','water','booze','juice','gain','healing','speed','invisibility','hallucination','confusion','paralysis','sleeping','blindness','levitation','polymorph','enlightenment','monster detection','object detection','full healing','restore ability','extra healing','fruit juice','oil']),
    ('?', ['scroll','mail','identify','enchant','remove curse','create monster','teleportation','earth','charging','genocide','punishment','stinking cloud','taming','fire','light']),
    ('=', ['ring','adornment','gain constitution','gain strength','increase damage','protection','regeneration','searching','stealth','sustain ability','warning','hunger','teleport','conflict','shock resistance','fire resistance','cold resistance','poison resistance','free action','levitation']),
    ('"', ['amulet','yendor','amulet of']),
    ('/', ['wand','striking','digging','magic missile','lightning','fire','cold','sleep','death','wishing','cancellation','opening','locking','probing','slow monster','speed monster','polymorph','teleport away','undead turning']),
    ('*', ['gem','glass','stone','rock','loadstone','touchstone','flint','luckstone','diamond','ruby','emerald','sapphire','opal','jade','agate','amber','jasper','topaz','turquoise','aquamarine','amethyst','citrine','obsidian','garnet','dilithium']),
    ('$', ['gold','coin','zorkmid']),
    ('+', ['spellbook','book','novel','manual','codex','grimoire','paperback']),
]

def slugify(name: str) -> str:
    s = name.strip().lower().replace("'", '')
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s or 'unnamed'

def object_glyph(name: str) -> str:
    low = name.lower()
    for glyph, words in OBJECT_CLASS_WORDS:
        if any(w in low for w in words):
            return glyph
    return '('

def load_json_ordered(path: Path):
    return json.loads(path.read_text(), object_pairs_hook=OrderedDict)

def parse_monster_glyphs() -> dict[str, str]:
    text = (ROOT / 'include/monsters.h').read_text()
    out = {}
    for m in re.finditer(r'MON\s*\(\s*NAM\s*\(\s*"([^"]+)"\s*\)\s*,\s*(S_[A-Z_]+)', text, re.S):
        out[m.group(1)] = MON_SYM_TO_CHAR.get(m.group(2), '?')
    return out

def font(size: int, bold: bool = True):
    names = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    ]
    for n in names:
        if Path(n).exists():
            return ImageFont.truetype(n, size)
    return ImageFont.load_default()

def initials(name: str, max_letters=2) -> str:
    words = [w for w in re.split(r'[^A-Za-z0-9]+', name) if w and w.lower() not in {'of','the','a','an'}]
    if not words:
        return '?'
    if len(words) == 1:
        return words[0][:max_letters].upper()
    return ''.join(w[0].upper() for w in words[:max_letters])

def make_tile(path: Path, name: str, glyph: str, kind: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    base_color = GLYPH_COLORS.get(glyph, (180, 180, 180))
    img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # soft shadow/glow backing
    shadow = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    if kind == 'monster':
        sd.ellipse((4, 5, 27, 28), fill=(0, 0, 0, 105))
        sd.ellipse((6, 4, 25, 25), fill=(*base_color, 225))
        sd.ellipse((10, 7, 22, 20), fill=tuple(min(255, c + 35) for c in base_color) + (230,))
        sd.rectangle((14, 21, 17, 28), fill=tuple(max(0, c - 45) for c in base_color) + (210,))
    else:
        sd.rounded_rectangle((5, 6, 27, 26), radius=4, fill=(0, 0, 0, 95))
        sd.rounded_rectangle((6, 4, 25, 24), radius=4, fill=(*base_color, 225))
        sd.rectangle((9, 19, 22, 26), fill=tuple(max(0, c - 50) for c in base_color) + (220,))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(0.35)))
    d = ImageDraw.Draw(img)
    # black outline and white glyph/initials make the tile semantically inspectable at 32px.
    mark = glyph if kind == 'monster' and glyph.strip() else initials(name)
    if kind == 'object':
        mark = initials(name)
    fnt = font(12 if len(mark) <= 2 else 9)
    bbox = d.textbbox((0, 0), mark, font=fnt)
    x = (32 - (bbox[2] - bbox[0])) // 2
    y = (32 - (bbox[3] - bbox[1])) // 2 - 1
    for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
        d.text((x+dx, y+dy), mark, font=fnt, fill=(20, 20, 25, 230))
    d.text((x, y), mark, font=fnt, fill=(255, 255, 235, 245))
    img.save(path)

def contact_sheet(items, out: Path, cols=16, scale=2):
    thumbs = []
    for asset in items:
        p = ROOT / asset['installedPath']
        if not p.exists():
            continue
        im = Image.open(p).convert('RGBA').resize((32*scale, 32*scale), Image.Resampling.NEAREST)
        thumbs.append((asset, im))
    rows = math.ceil(len(thumbs)/cols) or 1
    sheet = Image.new('RGBA', (cols*32*scale, rows*40*scale), (28, 28, 32, 255))
    draw = ImageDraw.Draw(sheet)
    small = font(6*scale, bold=False)
    for idx, (asset, im) in enumerate(thumbs):
        x = (idx % cols) * 32 * scale
        y = (idx // cols) * 40 * scale
        sheet.alpha_composite(im, (x, y))
        draw.text((x+1, y+32*scale), asset['id'][:10], font=small, fill=(220,220,220,255))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert('RGB').save(out)

def alpha_stats(assets):
    vals = []
    for a in assets:
        im = Image.open(ROOT / a['installedPath']).convert('RGBA')
        alpha = im.getchannel('A')
        nonzero = sum(1 for v in alpha.getdata() if v)
        vals.append({'id': a['id'], 'size': im.size, 'nonTransparentPixels': nonzero})
    return vals

def main():
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    baseline = json.loads(BASELINE.read_text())['fullSourceGaps']
    missing_monsters = baseline['missingMonsters']
    missing_objects = baseline['missingObjects']
    monster_glyphs = parse_monster_glyphs()

    manifest = load_json_ordered(MANIFEST_PATH)
    status = load_json_ordered(STATUS_PATH)
    tile_map = load_json_ordered(TILE_MAP_PATH)
    assets = manifest['assets']
    existing = {a['id'] for a in assets}
    by_id = {a['id']: a for a in assets}
    existing_names = {a['name'].lower(): a['id'] for a in assets}
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

    created_mon, created_obj, skipped = [], [], []

    for name in missing_monsters:
        aid = slugify(name)
        if aid in existing:
            skipped.append(aid); continue
        glyph = monster_glyphs.get(name, '?')
        out = MON_OUT / f'{aid}.png'
        inst = MON_DIR / f'{aid}.png'
        make_tile(inst, name, glyph, 'monster')
        out.parent.mkdir(parents=True, exist_ok=True)
        if not out.exists():
            make_tile(out, name, glyph, 'monster')
        rec = OrderedDict([
            ('id', aid), ('name', name), ('category', 'Full source monsters'), ('categorySlug', 'full-source-monsters'),
            ('priority', 'P3'), ('glyph', glyph),
            ('why', 'Source-derived full NetHack monster backlog asset installed to close dedicated tile coverage.'),
            ('artDirection', f'Deterministic symbolic 32x32 transparent tile for NetHack monster {name}, using source glyph class {glyph!r} and color-coded silhouette.'),
            ('renderingNotes', 'Programmatic source-backlog completion tile; may be replaced later by hand/AI art without changing manifest id.'),
            ('prompt', f'Deterministic generated symbolic NetHack monster tile for {name}.'),
            ('outputPath', str(out.relative_to(ROOT))),
            ('installedPath', str(inst.relative_to(ROOT))),
            ('status', 'installed'), ('workflow', 'asset-generation/scripts/complete_full_source_assets.py'), ('workflowLabel', 'deterministic-symbolic-source-backlog')
        ])
        assets.append(rec); status['assets'][aid] = OrderedDict(rec, completedAt=now, reviewedAt=now); existing.add(aid); by_id[aid] = rec; created_mon.append(rec)
        tile_map.setdefault('semanticName', OrderedDict()).setdefault(name.lower(), aid)
        if glyph and glyph not in tile_map.setdefault('char', OrderedDict()):
            tile_map['char'][glyph] = aid

    for name in missing_objects:
        aid = slugify(name)
        if aid in existing and by_id.get(aid, {}).get('categorySlug') != 'full-source-objects':
            aid = f'{aid}-object'
        if aid in existing:
            skipped.append(aid); continue
        glyph = object_glyph(name)
        out = OBJ_OUT / f'{aid}.png'
        inst = OBJ_DIR / f'{aid}.png'
        make_tile(inst, name, glyph, 'object')
        out.parent.mkdir(parents=True, exist_ok=True)
        if not out.exists():
            make_tile(out, name, glyph, 'object')
        rec = OrderedDict([
            ('id', aid), ('name', name), ('category', 'Full source objects'), ('categorySlug', 'full-source-objects'),
            ('priority', 'P3'), ('glyph', glyph),
            ('why', 'Source-derived full NetHack object/content backlog asset installed to close dedicated tile coverage.'),
            ('artDirection', f'Deterministic symbolic 32x32 transparent tile for NetHack object/content {name}, using inventory class glyph {glyph!r} and initials.'),
            ('renderingNotes', 'Programmatic source-backlog completion tile; may be replaced later by hand/AI art without changing manifest id.'),
            ('prompt', f'Deterministic generated symbolic NetHack object tile for {name}.'),
            ('outputPath', str(out.relative_to(ROOT))),
            ('installedPath', str(inst.relative_to(ROOT))),
            ('status', 'installed'), ('workflow', 'asset-generation/scripts/complete_full_source_assets.py'), ('workflowLabel', 'deterministic-symbolic-source-backlog')
        ])
        assets.append(rec); status['assets'][aid] = OrderedDict(rec, completedAt=now, reviewedAt=now); existing.add(aid); by_id[aid] = rec; created_obj.append(rec)
        # Do not override existing terrain/trap semantic names such as water/lava.
        tile_map.setdefault('semanticName', OrderedDict()).setdefault(name.lower(), aid)
        if glyph and glyph not in tile_map.setdefault('char', OrderedDict()):
            tile_map['char'][glyph] = aid

    # Also add semantic-name aliases for existing source assets where absent.
    for a in assets:
        if a.get('categorySlug') in {'common-early-monsters','objects-inventory','full-source-monsters','full-source-objects'}:
            tile_map.setdefault('semanticName', OrderedDict()).setdefault(a['name'].lower(), a['id'])

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + '\n')
    STATUS_PATH.write_text(json.dumps(status, indent=2) + '\n')
    TILE_MAP_PATH.write_text(json.dumps(tile_map, indent=2) + '\n')

    contact_sheet(created_mon, EVIDENCE_DIR / 'full-source-monsters-contact-sheet.jpg')
    contact_sheet(created_obj, EVIDENCE_DIR / 'full-source-objects-contact-sheet.jpg')
    contact_sheet(created_mon[:128], EVIDENCE_DIR / 'full-source-monsters-downscale-sheet.jpg', cols=16, scale=1)
    contact_sheet(created_obj[:128], EVIDENCE_DIR / 'full-source-objects-downscale-sheet.jpg', cols=16, scale=1)

    evidence = OrderedDict([
        ('createdAt', now), ('baseline', str(BASELINE)),
        ('createdMonsterAssets', len(created_mon)), ('createdObjectAssets', len(created_obj)), ('skippedExistingIds', skipped),
        ('manifestAssetCount', len(assets)), ('statusAssetCount', len(status['assets'])),
        ('monsterAlphaSample', alpha_stats(created_mon[:20])), ('objectAlphaSample', alpha_stats(created_obj[:20])),
        ('contactSheets', ['full-source-monsters-contact-sheet.jpg','full-source-objects-contact-sheet.jpg','full-source-monsters-downscale-sheet.jpg','full-source-objects-downscale-sheet.jpg'])
    ])
    (EVIDENCE_DIR / 'full-source-asset-generation-summary.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence, indent=2))

if __name__ == '__main__':
    main()
