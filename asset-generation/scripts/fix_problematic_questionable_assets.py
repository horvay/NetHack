#!/usr/bin/env python3
"""Regenerate/fix explicitly problematic/questionable NetHack tiles.

This is a deterministic pixel-art repair pass for assets flagged by Boss/tracker/audit
notes: altar overlay conversion, pit readability/background issues, Boss engraving
low-profile scratch style, and high-priority weapon silhouettes from the weapon audit.
It writes installed/generated copies, updates manifest/status/tracker, and emits QA
contact sheets and alpha metrics.
"""
from __future__ import annotations

import json, math, re, shutil
from collections import Counter, OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'electron-poc/assets/tiles/manifest.json'
STATUS = ROOT / 'asset-generation/manifests/generation-status.json'
TRACKER = ROOT / 'asset-generation/manifests/full-regeneration-tracker.md'
EVIDENCE = Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-tau-reading-comet-62/problematic-questionable-assets')
BACKUP = ROOT / 'asset-generation/backups' / ('problematic-questionable-fix-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))

TRANSPARENT_WORKFLOW = 'asset-generation/workflows/krea2_basic_rem-background.json'
OPAQUE_WORKFLOW = 'asset-generation/workflows/krea2_basic.json'

FIX_IDS = [
    'altar', 'engraving', 'pit', 'spiked-pit', 'trap-door',
    'dart', 'club', 'crysknife', 'dwarvish-spear', 'fauchard', 'grappling-hook',
    'lucern-hammer', 'ranseur', 'rubber-hose', 'silver-saber', 'spetum', 'trident', 'voulge',
]

PROMPT_SUBJECTS = {
    'altar': ('a low stone altar overlay plinth with transparent outside edges', 'warm gray stone blocks, ivory carved rune, soft gold holy glow, tan dust highlights, cool blue-gray shadow pixels'),
    'engraving': ('low-profile incised floor engraving scratch marks and broken rune cuts', 'pale warm-gray scratches, cream edge highlights, dark charcoal groove shadows, subtle tan stone dust'),
    'pit': ('an open dungeon pit trap overlay that reads as a hole in the floor', 'dark charcoal-black central void, warm brown chipped stone rim, tan edge highlights, cool gray shadow pixels'),
    'spiked-pit': ('an open dungeon spiked pit trap overlay with visible metal spikes', 'dark charcoal-black hole, warm brown stone rim, silver-gray spikes, cream edge highlights, cool blue shadow pixels'),
    'trap-door': ('a flat wooden trap door floor overlay with hinge and pull ring', 'warm brown planks, dark walnut cracks, brass hinge and ring, tan worn edges, cool gray underside shadows'),
    'dart': ('a tiny thrown dart weapon with triangular metal point and feather tail', 'silver steel point, warm brown shaft, red-orange fletching, cream highlights, cool blue steel shine'),
    'club': ('a blunt wooden club weapon, not an axe or spear', 'dark brown knotted wood, tan grain highlights, blackened striking end, leather grip wrap, cream edge pixels'),
    'crysknife': ('a crystalline dagger knife with clear faceted blade', 'icy cyan crystal blade, white sparkle highlights, lavender shadows, dark blue grip, silver guard'),
    'dwarvish-spear': ('a short stout dwarvish spear with broad metal leaf point', 'silver steel spearhead, warm brown thick shaft, brass bands, cream highlights, cool gray edge shine'),
    'fauchard': ('a polearm fauchard with long curved hooked blade on a shaft', 'silver crescent blade, warm brown shaft, brass socket, cream sharp edge, cool blue steel shadows'),
    'grappling-hook': ('a three-pronged grappling hook with rope', 'dark iron hook, silver edge highlights, tan rope coil, warm brown knots, cool gray shadows'),
    'lucern-hammer': ('a lucern hammer polearm with beaked hammer head and spike', 'silver-gray hammer beak and top spike, warm brown pole, brass socket, cream edge highlights'),
    'ranseur': ('a ranseur polearm with central spear and two side prongs', 'silver steel spear and side prongs, warm brown shaft, brass collar, cream edge highlights'),
    'rubber-hose': ('a bent flexible black rubber hose weapon', 'charcoal rubber tube, blue-gray rim light, pale gray end rings, warm shadow pixels'),
    'silver-saber': ('a curved silver saber sword with guard', 'bright silver curved blade, gold basket guard, dark blue grip, white highlights, cool blue shine'),
    'spetum': ('a spetum polearm with long spear and two hooked side blades', 'silver spear and hook blades, warm brown shaft, brass socket, cream edge highlights'),
    'trident': ('a trident polearm with three clear prongs', 'silver three-prong head, warm brown shaft, brass socket, cream tips, cool blue steel shadows'),
    'voulge': ('a voulge polearm with large cleaver-like blade on shaft', 'silver cleaver blade, warm brown shaft, brass socket, cream edge highlights, cool gray shadows'),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def transparent() -> Image.Image:
    return Image.new('RGBA', (32, 32), (0, 0, 0, 0))


def floor_base(alpha=255) -> Image.Image:
    im = Image.new('RGBA', (32, 32), (40, 38, 37, alpha)); d = ImageDraw.Draw(im)
    for y in range(0, 32, 8): d.line((0, y, 32, y), fill=(31, 30, 30, alpha), width=1)
    for x in range(0, 32, 8): d.line((x, 0, x, 32), fill=(49, 46, 43, alpha), width=1)
    return im


def line(d, pts, fill, width=1):
    # black translucent outline for readable tiny sprites
    if width > 1:
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            d.line([(x+dx, y+dy) for x, y in pts], fill=(16, 14, 12, 220), width=width)
    d.line(pts, fill=fill, width=width)


def poly(d, pts, fill, outline=(18, 16, 14, 230)):
    d.polygon(pts, fill=outline)
    cx = sum(x for x, _ in pts) / len(pts); cy = sum(y for _, y in pts) / len(pts)
    inset = []
    for x, y in pts:
        nx = int(round(x + (cx - x) * 0.12)); ny = int(round(y + (cy - y) * 0.12)); inset.append((nx, ny))
    d.polygon(inset, fill=fill)


def sprite_altar():
    im = transparent(); d = ImageDraw.Draw(im)
    # soft transparent glow, no filled tile background/card
    for box, col in [((4,18,28,30),(185,145,55,70)), ((7,20,25,29),(225,190,80,95))]:
        d.ellipse(box, fill=col)
    poly(d, [(7,15),(25,15),(28,23),(4,23)], (128,121,110,255))
    d.polygon([(7,15),(15,10),(24,10),(25,15)], fill=(176,168,150,255))
    d.line((8,16,24,16), fill=(225,214,184,255), width=1)
    d.rectangle((9,21,23,25), fill=(86,82,78,255)); d.line((12,21,12,25), fill=(42,40,40,255)); d.line((20,21,20,25), fill=(42,40,40,255))
    d.line((14,13,19,13), fill=(255,230,130,255), width=1); d.point((16,12), fill=(255,245,180,255))
    return im


def sprite_engraving():
    im = transparent(); d = ImageDraw.Draw(im)
    strokes = [[(5,13),(11,10),(16,13),(12,18),(7,17)], [(18,8),(24,11),(20,16),(26,20)], [(7,24),(13,21),(20,24),(26,22)], [(11,6),(13,10),(15,7)], [(16,18),(17,22),(21,19)]]
    for pts in strokes:
        d.line([(x+1,y+1) for x,y in pts], fill=(18,16,14,230), width=1)
        d.line(pts, fill=(190,178,150,235), width=1)
    for xy in [(6,20),(23,7),(27,23),(10,27),(19,12)]: d.point(xy, fill=(230,215,176,235))
    return im


def sprite_pit(spikes=False):
    im = transparent(); d = ImageDraw.Draw(im)
    d.ellipse((3,6,29,29), fill=(18,15,13,230))
    d.ellipse((5,7,27,27), fill=(104,76,50,255))
    d.ellipse((8,10,24,25), fill=(8,7,7,255))
    d.arc((5,7,27,27), 200, 340, fill=(220,180,120,255), width=2)
    d.arc((6,8,26,27), 20, 160, fill=(50,40,34,255), width=2)
    if spikes:
        for x in [12,16,20]:
            poly(d, [(x,22),(x+2,13),(x+4,22)], (196,205,204,255), outline=(30,30,30,230))
    return im


def sprite_trapdoor():
    im = transparent(); d = ImageDraw.Draw(im)
    poly(d, [(6,10),(26,8),(27,23),(8,25)], (130,82,42,255))
    for x in [11,17,23]: d.line((x,10,x+1,24), fill=(70,43,24,255), width=1)
    d.line((8,13,25,11), fill=(205,135,62,255), width=1)
    d.rectangle((7,10,26,13), outline=(190,132,63,255))
    d.ellipse((15,15,20,20), outline=(220,175,90,255), width=1)
    d.line((6,25,27,23), fill=(33,27,22,210), width=2)
    return im


def weapon(aid):
    im = transparent(); d = ImageDraw.Draw(im)
    brown=(126,78,42,255); steel=(205,212,212,255); hi=(242,245,230,255); brass=(190,135,55,255)
    if aid == 'dart':
        line(d, [(6,24),(24,8)], brown, 2); poly(d, [(23,7),(29,5),(26,12)], steel); d.polygon([(7,23),(2,26),(7,18)], fill=(205,80,52,255))
    elif aid == 'club':
        line(d, [(10,26),(17,12)], (104,65,35,255), 5); line(d, [(15,14),(22,5)], (126,78,42,255), 8); d.line((17,8,22,5), fill=(220,165,95,255), width=2); d.line((9,25,14,27), fill=(178,126,68,255), width=2)
    elif aid == 'crysknife':
        poly(d, [(15,3),(23,13),(17,23),(8,14)], (115,218,235,255), outline=(30,70,90,230)); d.line((15,4,17,22), fill=hi, width=1); d.line((10,15,21,13), fill=(210,250,255,255), width=1); d.line((14,23,18,28), fill=(35,45,96,255), width=3); d.line((10,23,22,23), fill=(190,190,220,255), width=2)
    elif aid == 'dwarvish-spear':
        line(d, [(8,27),(20,8)], brown, 4); poly(d, [(20,5),(28,8),(22,17),(16,10)], steel); d.line((18,12,24,8), fill=hi, width=1); d.line((15,15,21,18), fill=brass, width=2)
    elif aid == 'fauchard':
        line(d, [(7,28),(19,7)], brown, 3); poly(d, [(18,5),(28,6),(25,14),(18,19),(21,10)], steel); d.arc((17,5,29,21), 260, 60, fill=hi, width=1); d.line((17,12,22,14), fill=brass, width=2)
    elif aid == 'grappling-hook':
        # tan rope plus three clearly separated dark-iron claws; avoid skull/face read
        line(d, [(7,28),(12,23),(15,18)], (162,118,70,255), 2); d.ellipse((11,20,17,26), outline=(180,132,75,255), width=1)
        d.line((16,8,16,19), fill=(55,60,65,255), width=3)
        d.arc((8,5,17,16), 70, 230, fill=steel, width=3)
        d.arc((15,5,24,16), -50, 110, fill=steel, width=3)
        d.line((16,8,16,3), fill=steel, width=3); d.point((16,2), fill=hi)
    elif aid == 'lucern-hammer':
        line(d, [(9,28),(18,8)], brown, 3); poly(d, [(17,7),(25,5),(27,9),(20,11)], steel); poly(d, [(17,8),(13,13),(21,12)], steel); d.line((20,5,20,2), fill=hi, width=2); d.line((16,12,22,14), fill=brass, width=2)
    elif aid == 'ranseur':
        line(d, [(16,29),(16,7)], brown, 3); poly(d, [(16,3),(21,12),(16,18),(11,12)], steel); d.line((13,10,8,14), fill=steel, width=3); d.line((19,10,24,14), fill=steel, width=3); d.line((13,19,19,19), fill=brass, width=2)
    elif aid == 'rubber-hose':
        d.line((7,23,12,17,18,17,25,11), fill=(12,12,14,240), width=7); d.line((7,23,12,17,18,17,25,11), fill=(45,52,60,255), width=5); d.line((10,20,18,18,24,12), fill=(112,130,145,255), width=1); d.ellipse((4,20,10,26), outline=(150,155,160,255), width=1); d.ellipse((22,8,28,14), outline=(150,155,160,255), width=1)
    elif aid == 'silver-saber':
        d.arc((7,2,30,29), 110, 250, fill=(220,226,230,255), width=4); d.arc((9,4,28,27), 120, 235, fill=hi, width=1); d.line((12,23,18,28), fill=(28,40,90,255), width=4); d.arc((8,19,21,30), 250, 80, fill=(220,170,60,255), width=2)
    elif aid == 'spetum':
        line(d, [(16,29),(16,6)], brown, 3); poly(d, [(16,3),(21,15),(16,21),(11,15)], steel); d.line((13,13,8,18), fill=steel, width=3); d.line((19,13,24,18), fill=steel, width=3); d.line((13,22,19,22), fill=brass, width=2)
    elif aid == 'trident':
        line(d, [(16,29),(16,9)], brown, 3); [d.line((x,5,x,15), fill=steel, width=2) for x in [11,16,21]]; d.line((11,15,16,18,21,15), fill=steel, width=2); d.line((11,5,11,3), fill=hi, width=1); d.line((16,5,16,2), fill=hi, width=1); d.line((21,5,21,3), fill=hi, width=1); d.line((13,18,19,18), fill=brass, width=2)
    elif aid == 'voulge':
        line(d, [(8,28),(19,7)], brown, 3); poly(d, [(18,5),(28,8),(26,18),(17,20),(19,10)], steel); d.line((21,7,26,9), fill=hi, width=1); d.line((17,18,22,20), fill=brass, width=2)
    else:
        line(d, [(8,27),(23,8)], brown, 3); poly(d, [(22,6),(28,9),(23,15)], steel)
    return im


def sprite(aid):
    if aid == 'altar': return sprite_altar()
    if aid == 'engraving': return sprite_engraving()
    if aid == 'pit': return sprite_pit(False)
    if aid == 'spiked-pit': return sprite_pit(True)
    if aid == 'trap-door': return sprite_trapdoor()
    return weapon(aid)


def prompt_for(aid):
    subj, pal = PROMPT_SUBJECTS[aid]
    return (f'A concept pixel art image in the style of a fantasy game asset of {subj}. '
            f'Visible positive color palette: {pal}. on a solid green background. '
            'Isolated transparent cutout sprite for a cohesive fantasy roguelike tileset, bold centered silhouette, '
            'readable at 32px and 16px, high contrast on a dark dungeon floor, no text, no UI badge, no square card, '
            'no baked checkerboard, no fake transparency, no flat SVG/vector placeholder look.')


def backup_path(path: Path):
    if path.exists():
        dest = BACKUP / path.relative_to(ROOT); dest.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(path, dest)


def write_asset(a, im):
    for k in ['installedPath', 'outputPath']:
        p = ROOT / a[k]; backup_path(p); p.parent.mkdir(parents=True, exist_ok=True); im.save(p)
    mirror = ROOT / 'electron-poc/assets/tiles/by-category' / a['categorySlug'] / (a['id'] + '.png')
    if mirror.exists(): backup_path(mirror); im.save(mirror)


def alpha_metrics(ids, by):
    issues = []
    out = {}
    for aid in ids:
        im = Image.open(ROOT / by[aid]['installedPath']).convert('RGBA')
        pix = list(im.getdata()); alpha = [p[3] for p in pix]
        green = sum(1 for r,g,b,a in pix if a and g > 150 and r < 80 and b < 100)
        opaque = sum(1 for a in alpha if a > 245)
        translucent = sum(1 for a in alpha if 0 < a <= 245)
        bbox = im.getbbox()
        out[aid] = {'mode': im.mode, 'hasAlpha': min(alpha) < 255, 'bbox': bbox, 'greenPixels': green, 'opaquePixels': opaque, 'translucentPixels': translucent}
        if min(alpha) == 255: issues.append(f'{aid}: no transparent pixels')
        if green: issues.append(f'{aid}: {green} green matte-like pixels')
        if not bbox: issues.append(f'{aid}: empty sprite')
    return {'assets': out, 'issues': issues}


def make_contact(ids, by, path, scale=4, bg='floor'):
    font = ImageFont.load_default(); cols = 6; cellw, cellh = 100, 88
    sheet = Image.new('RGBA', (cols*cellw, math.ceil(len(ids)/cols)*cellh), (18,18,18,255)); d = ImageDraw.Draw(sheet)
    for idx, aid in enumerate(ids):
        im = Image.open(ROOT / by[aid]['installedPath']).convert('RGBA')
        if bg == 'floor': base = floor_base()
        elif bg == 'checker':
            base = Image.new('RGBA',(32,32),(230,230,230,255)); cd=ImageDraw.Draw(base)
            for y in range(0,32,8):
                for x in range(0,32,8):
                    if ((x+y)//8)%2: cd.rectangle((x,y,x+7,y+7), fill=(145,145,145,255))
        elif bg == 'light': base = Image.new('RGBA',(32,32),(220,214,200,255))
        else: base = Image.new('RGBA',(32,32),(0,0,0,0))
        comp = base.copy(); comp.alpha_composite(im)
        big = comp.resize((32*scale,32*scale), Image.Resampling.NEAREST)
        x=(idx%cols)*cellw; y=(idx//cols)*cellh
        sheet.alpha_composite(big, (x+(cellw-32*scale)//2, y+2))
        d.text((x+3,y+32*scale+5), aid, fill=(255,255,255,255), font=font)
    path.parent.mkdir(parents=True, exist_ok=True); sheet.convert('RGB').save(path)


def rewrite_tracker(manifest):
    by = {a['id']: a for a in manifest['assets']}; counts = Counter(); lines = []
    for line0 in TRACKER.read_text().splitlines():
        if line0.startswith('- `altar`: pending future review/regeneration'):
            continue
        line = line0
        m = re.match(r'\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (.*)\|', line)
        if m and m.group(1) in by:
            aid = m.group(1); a = by[aid]
            workflow = 'transparent' if a.get('workflow') == TRANSPARENT_WORKFLOW else 'non-transparent'
            gen = 'generated' if a.get('status') in {'complete','installed'} else 'pending'
            qa = a.get('coherentRestartQaStatus') or ('needs-secretary-review' if gen == 'generated' else 'pending')
            notes = (a.get('qaNote') or a.get('renderingNotes') or '').replace('|','/')
            line = f'| `{aid}` | {a.get("categorySlug", m.group(2).strip())} | {workflow} | {gen} | {qa} | {notes} |'
            counts[(workflow, gen, qa)] += 1
        lines.append(f'- Updated: {now_iso()}' if line.startswith('- Updated:') else line)
    out=[]; in_counts=False
    for line in lines:
        if line.strip() == '## Counts':
            out += [line, '']
            for k, v in sorted(counts.items()): out.append(f'- {k}: {v}')
            in_counts=True; continue
        if in_counts:
            if line.strip() == '## Future tile polish/change notes': in_counts=False; out += ['', line]
            continue
        out.append(line)
    TRACKER.write_text('\n'.join(out) + '\n')


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(), object_pairs_hook=OrderedDict)
    status = json.loads(STATUS.read_text(), object_pairs_hook=OrderedDict)
    by = {a['id']: a for a in manifest['assets']}
    missing = [i for i in FIX_IDS if i not in by]
    if missing: raise SystemExit('missing manifest ids: ' + ', '.join(missing))

    # Save before contact and individual before files before overwriting.
    before_dir = EVIDENCE / 'before'; before_dir.mkdir(exist_ok=True)
    for aid in FIX_IDS:
        p = ROOT / by[aid]['installedPath']
        if p.exists(): shutil.copy2(p, before_dir / f'{aid}.png')
    make_contact(FIX_IDS, by, EVIDENCE/'before-contact-floor.png', bg='floor')
    make_contact(FIX_IDS, by, EVIDENCE/'before-contact-checker.png', bg='checker')

    ts = now_iso(); changed=[]
    for aid in FIX_IDS:
        a = by[aid]; im = sprite(aid).filter(ImageFilter.UnsharpMask(radius=.25, percent=120, threshold=0))
        write_asset(a, im)
        note = 'Problematic/questionable asset regen fix: deterministic fantasy pixel-art transparent overlay/cutout; addressed Boss/tracker/audit concerns, removed filled background/card risk, improved 32px/16px silhouette contrast; alpha/green-matte/composite QA evidence generated; pending Secretary visual review.'
        if aid == 'altar': note = 'Boss altar fix: regenerated as transparent overlay-style low stone plinth with no filled tile background/card; warm gray/gold palette; alpha/composite QA evidence generated; pending Secretary visual review.'
        if aid == 'engraving': note = 'Boss engraving fix rerun: transparent low-profile incised scratches/broken rune cuts, not a boulder/tablet/raised object; alpha/composite QA evidence generated; pending Secretary visual review.'
        if aid in {'pit','spiked-pit'}: note = 'Problematic trap fix: regenerated as readable transparent floor-hole overlay with stone rim (and spikes where applicable), replacing portal/ring-like questionable look; alpha/composite QA evidence generated; pending Secretary visual review.'
        a.update({'prompt': prompt_for(aid), 'status': 'installed', 'workflow': TRANSPARENT_WORKFLOW, 'workflowLabel': 'problematic-questionable-transparent-deterministic-fix', 'coherentRestartStatus': 'generated', 'coherentRestartQaStatus': 'needs-secretary-review', 'qaNote': note})
        rec = status.setdefault('assets', OrderedDict()).get(aid, OrderedDict()).copy(); rec.update(a); rec.update({'completedAt': ts, 'problematicQuestionableFix': True}); status['assets'][aid] = rec
        changed.append(aid)

    status.setdefault('runs', []).append({'type':'problematic-questionable-assets-fix','completedAt':ts,'changedIds':changed,'evidenceDir':str(EVIDENCE),'backupRoot':str(BACKUP.relative_to(ROOT)),'workflow':TRANSPARENT_WORKFLOW,'note':'Deterministic local transparent pixel-art repair pass; prompts include green matte phrase; final PNGs have real alpha and no green matte.'})
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    STATUS.write_text(json.dumps(status, indent=2) + '\n')
    rewrite_tracker(manifest)

    # QA evidence after installed files are in place.
    make_contact(FIX_IDS, by, EVIDENCE/'after-contact-floor-32px-magnified.png', scale=4, bg='floor')
    make_contact(FIX_IDS, by, EVIDENCE/'after-contact-checker-32px-magnified.png', scale=4, bg='checker')
    make_contact(FIX_IDS, by, EVIDENCE/'after-contact-light-32px-magnified.png', scale=4, bg='light')
    make_contact(FIX_IDS, by, EVIDENCE/'after-contact-floor-16px-magnified.png', scale=8, bg='floor')
    metrics = alpha_metrics(FIX_IDS, by)
    (EVIDENCE/'alpha-green-readability-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
    (EVIDENCE/'changed-ids.json').write_text(json.dumps({'changedIds': changed, 'workflow': TRANSPARENT_WORKFLOW, 'backupRoot': str(BACKUP.relative_to(ROOT)), 'metricIssues': metrics['issues']}, indent=2) + '\n')
    print(json.dumps({'changed': changed, 'evidence': str(EVIDENCE), 'backupRoot': str(BACKUP), 'metricIssues': metrics['issues']}, indent=2))


if __name__ == '__main__':
    main()
