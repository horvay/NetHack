#!/usr/bin/env python3
"""Continue coherent full tileset regeneration for next 100 pending assets.

This pass is deterministic/offline and deliberately uses concrete item silhouettes
rather than prompt fallbacks. It also reapplies the Boss-note beartrap/blindfold
corrections and emits before/after evidence in this run's evidence directory.
"""
from __future__ import annotations

import json, math, re, shutil
from collections import Counter, OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT/'electron-poc/assets/tiles/manifest.json'
STATUS = ROOT/'asset-generation/manifests/generation-status.json'
TRACKER = ROOT/'asset-generation/manifests/full-regeneration-tracker.md'
EVIDENCE = Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-nu-polishing-violin-32/next100-continuation-review')
BACKUP = ROOT/'asset-generation/backups'/('next100-continuation-boss-notes-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))

import sys
sys.path.insert(0, str(ROOT/'asset-generation/scripts'))
from upgrade_full_source_sprites import object_sprite, inferred_object_glyph  # noqa: E402

STYLE = ('A concept pixel art image in the style of a fantasy game asset of {subject} on a solid green background. '
         'Isolated transparent cutout sprite for a cohesive fantasy roguelike tileset, readable at 32px and 16px, '
         'bold centered silhouette, high contrast on dark dungeon stone, no text, no UI badge, no square card, '
         'no baked checkerboard, no fake transparency, final installed PNG has real alpha.')

COLORS = {
    'potion-blue': (70,150,235,255), 'potion-red': (220,55,70,255), 'potion-green': (70,190,95,255),
    'potion-gold': (235,190,70,255), 'metal': (185,190,195,255), 'dark': (25,25,32,255),
    'cloth': (18,18,26,255), 'leather': (150,90,45,255), 'gold': (230,180,55,255),
}

def now_iso(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
def transparent(): return Image.new('RGBA',(32,32),(0,0,0,0))
def outline_poly(d, pts, fill, outline=(22,22,26,235)):
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.polygon([(x+dx,y+dy) for x,y in pts], fill=outline)
    d.polygon(pts, fill=fill)
def outline_line(d, pts, fill, width=3, outline=(20,20,24,235)):
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.line([(x+dx,y+dy) for x,y in pts], fill=outline, width=width+2, joint='curve')
    d.line(pts, fill=fill, width=width, joint='curve')
def outline_ellipse(d, box, fill=None, outline=(20,20,24,235), width=2):
    if fill is None:
        d.ellipse(box, outline=outline, width=width+2)
    else:
        for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.ellipse(tuple(v+(dx if i%2==0 else dy) for i,v in enumerate(box)), fill=outline)
        d.ellipse(box, fill=fill)

def beartrap_sprite():
    im=transparent(); d=ImageDraw.Draw(im)
    # Two separated crescent jaws, hinge plates, visible triangular teeth, and chain.
    d.arc((3,6,29,28), 200, 340, fill=(55,58,62,255), width=5)
    d.arc((3,4,29,26), 20, 160, fill=(55,58,62,255), width=5)
    d.arc((3,6,29,28), 200, 340, fill=(190,198,202,255), width=2)
    d.arc((3,4,29,26), 20, 160, fill=(205,212,215,255), width=2)
    d.rectangle((14,14,18,20), fill=(80,80,84,255)); d.rectangle((15,15,17,19), fill=(210,210,205,255))
    for x in [7,11,15,19,23]:
        outline_poly(d, [(x,10),(x+2,15),(x-1,15)], (230,235,230,255), (55,58,62,255))
        outline_poly(d, [(x,24),(x+2,19),(x-1,19)], (220,225,220,255), (55,58,62,255))
    outline_line(d, [(18,18),(23,22),(27,27)], (120,123,126,255), width=2)
    d.ellipse((25,25,30,30), outline=(175,178,180,255), width=2)
    return im.filter(ImageFilter.UnsharpMask(radius=.4, percent=140, threshold=0))

def blindfold_sprite():
    im=transparent(); d=ImageDraw.Draw(im)
    # Single cloth strip, not goggles/mask: wide black band with tied tails and one highlight seam.
    outline_poly(d, [(5,12),(25,10),(28,16),(25,21),(5,20),(3,16)], (18,18,28,255), (75,75,90,255))
    d.line((7,14,24,13), fill=(95,95,115,255), width=1)
    d.line((7,18,24,17), fill=(5,5,10,255), width=1)
    outline_line(d, [(7,15),(4,12),(4,10)], (20,20,30,255), width=2, outline=(75,75,90,255))
    outline_line(d, [(24,15),(27,12)], (20,20,30,255), width=2, outline=(75,75,90,255))
    outline_line(d, [(23,18),(27,21)], (20,20,30,255), width=2, outline=(75,75,90,255))
    return im.filter(ImageFilter.UnsharpMask(radius=.4, percent=140, threshold=0))

def subject_for(a):
    n=a['name'].lower(); aid=a['id']
    if aid=='beartrap': return 'open silver steel jaw bear trap with triangular teeth, hinge, and chain'
    if aid=='blindfold': return 'simple black cloth blindfold eye-covering strip with tied tails'
    return n.replace('-', ' ')

def custom_or_object_sprite(a):
    if a['id']=='beartrap': return beartrap_sprite()
    if a['id']=='blindfold': return blindfold_sprite()
    g=inferred_object_glyph(a['name'], a.get('glyph','('))
    return object_sprite(a['name'], g)

def load_pending_ids():
    out=[]
    for line in TRACKER.read_text().splitlines():
        if '| transparent | pending | pending |' in line:
            m=re.match(r'\| `([^`]+)` \|', line)
            if m: out.append(m.group(1))
    return out

def backup_and_write(a, im):
    for key in ['installedPath','outputPath']:
        p=ROOT/a[key]
        if p.exists():
            b=BACKUP/p.relative_to(ROOT); b.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p,b)
        p.parent.mkdir(parents=True, exist_ok=True); im.save(p)

def floor_tile(size=32):
    im=Image.new('RGBA',(size,size),(40,38,38,255)); d=ImageDraw.Draw(im)
    step=max(4,size//4)
    for y in range(0,size,step): d.line((0,y,size,y), fill=(32,31,31,255), width=1)
    for x in range(0,size,step): d.line((x,0,x,size), fill=(46,44,44,255), width=1)
    return im

def font(size=8):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/TTF/DejaVuSans.ttf']:
        if Path(p).exists(): return ImageFont.truetype(p,size)
    return ImageFont.load_default()

def contact(assets, out, tile_size=32, scale=1, floor=False, checker=False, alpha=False, label=True, cols=10):
    cell=tile_size*scale; label_h=(10*scale if label else 0); rows=math.ceil(len(assets)/cols) or 1
    sheet=Image.new('RGBA',(cols*cell, rows*(cell+label_h)), (235,235,235,255)); d=ImageDraw.Draw(sheet)
    f=font(max(5,6*scale))
    for i,a in enumerate(assets):
        x=(i%cols)*cell; y=(i//cols)*(cell+label_h)
        if checker:
            sq=max(4,8*scale)
            for yy in range(y,y+cell,sq):
                for xx in range(x,x+cell,sq):
                    d.rectangle((xx,yy,xx+sq-1,yy+sq-1), fill=(190,190,190,255) if ((xx//sq+yy//sq)%2) else (240,240,240,255))
        if floor: sheet.alpha_composite(floor_tile(tile_size).resize((cell,cell), Image.Resampling.NEAREST),(x,y))
        im=Image.open(ROOT/a['installedPath']).convert('RGBA')
        if alpha:
            aa=im.getchannel('A'); im=Image.merge('RGBA',(aa,aa,aa,aa))
        im=im.resize((tile_size,tile_size), Image.Resampling.LANCZOS if tile_size==16 else Image.Resampling.NEAREST).resize((cell,cell), Image.Resampling.NEAREST)
        sheet.alpha_composite(im,(x,y))
        if label: d.text((x+1,y+cell), a['id'][:12], font=f, fill=(0,0,0,255))
    out.parent.mkdir(parents=True, exist_ok=True); sheet.convert('RGB').save(out)

def metrics(assets):
    rows=[]; issues=[]
    for a in assets:
        im=Image.open(ROOT/a['installedPath']).convert('RGBA'); alpha=im.getchannel('A'); data=list(im.getdata())
        non=sum(px[3]>0 for px in data); edge=[]
        for x in range(32): edge += [alpha.getpixel((x,0)), alpha.getpixel((x,31))]
        for y in range(32): edge += [alpha.getpixel((0,y)), alpha.getpixel((31,y))]
        small=im.resize((16,16), Image.Resampling.LANCZOS); snon=sum(px[3]>32 for px in small.getdata())
        green=sum(1 for r,g,b,aa in data if aa>0 and g>150 and r<110 and b<130)
        rec={'id':a['id'],'bbox':alpha.getbbox(),'nonTransparentRatio':round(non/1024,4),'opaqueEdgePixels':sum(v>250 for v in edge),'small16VisiblePixels':snon,'greenishVisiblePixels':green}
        rows.append(rec)
        if rec['opaqueEdgePixels']: issues.append({'id':a['id'],'issue':'opaque edge/card', 'opaqueEdgePixels':rec['opaqueEdgePixels']})
        if rec['nonTransparentRatio']>.72: issues.append({'id':a['id'],'issue':'too full/card-like', 'nonTransparentRatio':rec['nonTransparentRatio']})
        if rec['small16VisiblePixels']<8: issues.append({'id':a['id'],'issue':'too few 16px visible pixels','small16VisiblePixels':rec['small16VisiblePixels']})
        # Green is expected for some subjects; record, do not fail.
    return {'records':rows,'issues':issues}

def rewrite_tracker(manifest):
    by={a['id']:a for a in manifest['assets']}
    counts=Counter()
    lines=[]
    for line in TRACKER.read_text().splitlines():
        m=re.match(r'\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (.*)\|', line)
        if m and m.group(1) in by:
            aid=m.group(1); a=by[aid]
            workflow=a.get('coherentRestartWorkflow') or ('transparent' if a.get('categorySlug') in {'common-early-monsters','full-source-monsters','objects-inventory','full-source-objects','player-pets-identity','traps-hazards'} else 'non-transparent')
            gen=a.get('coherentRestartStatus') or ('generated' if a.get('status') in {'complete','installed'} else 'pending')
            qa=a.get('coherentRestartQaStatus') or ('pending' if gen=='pending' else 'needs-secretary-review')
            notes=(a.get('qaNote') or a.get('renderingNotes') or '').replace('|','/')
            lines.append(f'| `{aid}` | {a.get("categorySlug",m.group(2).strip())} | {workflow} | {gen} | {qa} | {notes} |')
            counts[(workflow,gen,qa)]+=1
        else:
            if line.startswith('- Updated:'):
                lines.append(f'- Updated: {now_iso()}')
            else:
                lines.append(line)
    # Replace count block.
    out=[]; in_counts=False
    for line in lines:
        if line.strip()=='## Counts':
            out.append(line); out.append('');
            for k,v in sorted(counts.items()): out.append(f'- {k}: {v}')
            in_counts=True; continue
        if in_counts:
            if line.strip()=='## Assets': in_counts=False; out.append(''); out.append(line)
            continue
        out.append(line)
    TRACKER.write_text('\n'.join(out)+'\n')

def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    manifest=json.loads(MANIFEST.read_text(), object_pairs_hook=OrderedDict)
    status=json.loads(STATUS.read_text(), object_pairs_hook=OrderedDict)
    by={a['id']:a for a in manifest['assets']}
    next100=load_pending_ids()[:100]
    special=['beartrap','blindfold']
    changed=[]; ts=now_iso()
    for aid in next100+special:
        a=by[aid]
        im=custom_or_object_sprite(a)
        backup_and_write(a, im)
        prompt=STYLE.format(subject=subject_for(a))
        note=('Boss note reapplied: clearly reads as '+subject_for(a)+'.' if aid in special else
              'Continuation batch deterministic concrete item silhouette; transparent cutout, no card/background; pending Secretary visual review.')
        a.update({'prompt':prompt,'status':'installed','workflow':'asset-generation/workflows/krea2_basic_rem_back.json','workflowLabel':'transparent-next100-continuation-deterministic-polish',
                  'coherentRestartStatus':'generated','coherentRestartQaStatus':'needs-secretary-review','qaNote':note})
        rec=status.setdefault('assets',{}).get(aid, OrderedDict()).copy(); rec.update(a); rec.update({'completedAt':ts,'artistDirectedPixelPolish':True})
        status['assets'][aid]=rec
        changed.append(aid)
    status.setdefault('runs',[]).append({'type':'next100-continuation-with-boss-notes','completedAt':ts,'changedIds':changed,'next100Ids':next100,'bossNoteIds':special,'evidenceDir':str(EVIDENCE),'backupRoot':str(BACKUP.relative_to(ROOT))})
    MANIFEST.write_text(json.dumps(manifest, indent=2)+'\n'); STATUS.write_text(json.dumps(status, indent=2)+'\n')
    rewrite_tracker(manifest)
    # Evidence sheets per 20-asset subbatch.
    for gi in range(5):
        group=[by[x] for x in next100[gi*20:(gi+1)*20]]
        prefix=f'group{gi+1:02d}-next100-continuation'
        contact(group,EVIDENCE/f'{prefix}-32px-floor.png',tile_size=32,scale=2,floor=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-16px-floor.png',tile_size=16,scale=4,floor=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-magnified-full-tile.png',tile_size=32,scale=5,floor=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-checker-alpha.png',tile_size=32,scale=3,checker=True,cols=10)
        met=metrics(group); (EVIDENCE/f'{prefix}-metrics.json').write_text(json.dumps(met,indent=2)+'\n')
    boss_assets=[by[x] for x in special]
    # before/after using backup just made for before, current for after.
    before=[]
    for a in boss_assets:
        b=a.copy(); b['installedPath']=str((BACKUP/Path(a['installedPath'])).relative_to(ROOT)) if (BACKUP/Path(a['installedPath'])).exists() else a['installedPath']
        before.append(b)
    contact(before+boss_assets,EVIDENCE/'boss-notes-beartrap-blindfold-before-after-32px-floor.png',tile_size=32,scale=5,floor=True,cols=2)
    contact(before+boss_assets,EVIDENCE/'boss-notes-beartrap-blindfold-before-after-16px-floor.png',tile_size=16,scale=8,floor=True,cols=2)
    contact(boss_assets,EVIDENCE/'boss-notes-beartrap-blindfold-checker-alpha.png',tile_size=32,scale=6,checker=True,cols=2)
    allm=metrics([by[x] for x in next100]+boss_assets); (EVIDENCE/'next100-continuation-alpha-green-readability-metrics.json').write_text(json.dumps(allm,indent=2)+'\n')
    (EVIDENCE/'changed-ids.json').write_text(json.dumps({'next100':next100,'bossNotes':special,'changedIds':changed,'remainingPendingAfter':len(load_pending_ids())},indent=2)+'\n')
    print(json.dumps({'changed':len(changed),'next100':next100[0]+'..'+next100[-1],'bossNotes':special,'remainingPendingAfter':len(load_pending_ids()),'evidence':str(EVIDENCE)},indent=2))

if __name__=='__main__': main()
