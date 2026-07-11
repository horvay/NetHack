#!/usr/bin/env python3
"""Visual QA and cleanup for NetHack generated tile assets.

Checks alpha/background/readability and (unless --check) redraws concrete problem classes:
transparent overlays with opaque cards, stairs, engravings, traps, pets, and early assets.
"""
from __future__ import annotations
import argparse, json, math, sys
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageStat

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / 'electron-poc/assets/tiles/manifest.json'
STATUS_PATH = ROOT / 'asset-generation/manifests/generation-status.json'
DEFAULT_EVIDENCE = Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-epsilon-climbing-cat-76')

# Reuse the deterministic silhouette art system created for the source backlog.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from upgrade_full_source_sprites import monster_sprite, object_sprite, COLORS, shade, outline, draw_humanoid  # noqa: E402

def transparent():
    return Image.new('RGBA', (32, 32), (0, 0, 0, 0))

def floor_base(kind='floor'):
    base = {
        'floor': (40, 38, 38), 'stone': (42, 45, 50), 'branch': (34, 32, 42),
        'altar': (42, 38, 48), 'water': (22, 54, 78), 'lava': (70, 34, 20)
    }.get(kind, (40, 38, 38))
    img = Image.new('RGBA', (32, 32), (*base, 255)); d = ImageDraw.Draw(img)
    for y in range(0, 32, 8): d.line((0, y, 32, y), fill=shade(base, -8)+(255,), width=1)
    for x in range(0, 32, 8): d.line((x, 0, x, 32), fill=shade(base, 6)+(255,), width=1)
    return img

def stairs(name):
    branch = 'branch' in name
    up = 'up' in name
    img = floor_base('branch' if branch else 'stone'); d = ImageDraw.Draw(img)
    stone=(128,128,132,255); hi=(210,205,178,255); dark=(28,28,34,255)
    if up:
        steps=[(8,22,24,25),(10,18,24,21),(12,14,24,17),(14,10,24,13),(16,6,24,9)]
        arrow=[(16,4),(11,10),(14,10),(14,26),(18,26),(18,10),(21,10)]
        acol=(120,245,225,255) if branch else hi
    else:
        steps=[(8,7,24,10),(8,11,22,14),(8,15,20,18),(8,19,18,22),(8,23,16,26)]
        arrow=[(16,28),(11,22),(14,22),(14,6),(18,6),(18,22),(21,22)]
        acol=(40,150,160,255) if branch else (150,170,210,255)
    for r in steps:
        d.rectangle((r[0]+1,r[1]+1,r[2]+1,r[3]+1), fill=dark)
        d.rectangle(r, fill=stone)
        d.line((r[0],r[1],r[2],r[1]), fill=hi, width=1)
    d.line(arrow+[arrow[0]], fill=dark, width=3, joint='curve')
    d.polygon(arrow, fill=acol)
    return img

def engraving():
    img=floor_base('floor'); d=ImageDraw.Draw(img)
    # shallow scratch strokes/runes on floor, deliberately not a raised boulder slab/card
    scratch=(185,160,122,255); shadow=(18,17,16,255)
    lines=[((6,10),(14,18),(8,24)), ((17,8),(22,13),(18,20),(25,25)), ((8,27),(24,7)), ((11,7),(13,11)), ((23,21),(26,25))]
    for pts in lines:
        off=[(x+1,y+1) for x,y in pts]; d.line(off, fill=shadow, width=1); d.line(pts, fill=scratch, width=1)
    return img

def sink_feature():
    img=transparent(); d=ImageDraw.Draw(img)
    # Transparent cutout floor feature: no opaque terrain/card background.
    d.ellipse((7,23,25,28), fill=(0,0,0,72))
    outline=(34,25,22,255); dark=(76,49,42,255); mid=(137,86,66,255)
    light=(221,172,118,255); cream=(238,215,166,255); blue=(74,177,215,255); blue_dark=(29,78,104,245); brass=(202,145,66,255)
    d.rounded_rectangle((8,11,24,18), radius=2, fill=outline)
    d.rounded_rectangle((9,12,23,17), radius=2, fill=mid)
    d.rectangle((11,14,21,17), fill=dark)
    d.rectangle((12,14,20,15), fill=blue_dark)
    d.point([(14,14),(15,14),(16,14),(19,14)], fill=blue)
    d.polygon([(8,17),(24,17),(22,25),(10,25)], fill=outline)
    d.polygon([(10,18),(22,18),(20,23),(12,23)], fill=(159,94,67,255))
    d.line((11,18,21,18), fill=light, width=1)
    d.line((12,23,20,23), fill=(85,50,42,255), width=1)
    d.line((10,19,12,23), fill=(222,151,93,255), width=1)
    d.rectangle((17,5,20,7), fill=outline); d.rectangle((18,4,20,11), fill=outline); d.rectangle((19,5,19,10), fill=brass)
    d.rectangle((13,6,20,8), fill=outline); d.rectangle((13,7,18,8), fill=brass); d.point((14,9), fill=blue)
    d.rectangle((10,9,13,10), fill=outline); d.rectangle((10,8,13,8), fill=cream)
    d.rectangle((22,9,25,10), fill=outline); d.rectangle((22,8,25,8), fill=cream)
    d.point([(10,12),(11,12),(22,13),(13,19),(18,19)], fill=cream)
    return img

def trap_sprite(name):
    img=transparent(); d=ImageDraw.Draw(img); n=name.lower()
    c=(205,205,210,255); red=(230,75,55,255); blue=(70,190,230,255); purple=(185,90,230,255)
    if 'falling-rock' in n:
        for box in [(5,6,13,13),(16,5,25,14),(10,16,20,25),(22,18,29,27)]:
            outline(d,'poly',[(box[0],box[1]+3),(box[0]+4,box[1]),(box[2],box[1]+2),(box[2]-2,box[3]),(box[0]+2,box[3])],(135,135,145))
    elif 'pit' in n or 'hole' in n:
        outline(d,'ellipse',(5,10,27,26),(28,25,25,230)); d.arc((6,9,26,25),180,350,fill=(130,115,95,255),width=2)
    elif 'web' in n:
        for a in range(0,360,45):
            x=16+math.cos(math.radians(a))*13; y=16+math.sin(math.radians(a))*13; d.line((16,16,x,y), fill=c, width=1)
        for r in [5,9,13]: d.ellipse((16-r,16-r,16+r,16+r), outline=c, width=1)
    elif 'fire' in n:
        outline(d,'poly',[(16,3),(24,17),(18,28),(8,27),(7,16)],red); d.polygon([(16,9),(20,19),(16,25),(12,19)], fill=(255,205,70,255))
    elif 'magic' in n or 'polymorph' in n:
        d.ellipse((5,5,27,27), outline=purple, width=3); d.line((16,3,16,29), fill=blue, width=2); d.line((3,16,29,16), fill=blue, width=2)
    elif 'teleport' in n:
        for r in [6,10,14]: d.arc((16-r,16-r,16+r,16+r),20,320,fill=blue,width=2)
    elif 'bear' in n:
        outline(d,'ellipse',(5,8,27,24),c); d.rectangle((14,5,18,27), fill=(25,25,25,0)); d.line((6,16,26,16),fill=(45,45,50,255),width=2)
    else:
        outline(d,'poly',[(16,4),(28,26),(4,26)],(220,190,70)); d.line((16,10,16,19),fill=(35,30,20,255),width=3); d.rectangle((15,22,17,24),fill=(35,30,20,255))
    return img

def ui_overlay(name):
    img=transparent(); d=ImageDraw.Draw(img); n=name.lower()
    if 'stairs-up' in n: return stairs('up').convert('RGBA').resize((32,32), Image.Resampling.NEAREST).crop((0,0,32,32)).putalpha_mask if False else action_stair(True)
    if 'stairs-down' in n: return action_stair(False)
    if 'pickup' in n:
        outline(d,'ellipse',(9,15,23,27),(225,190,70)); outline(d,'line',[(16,5),(16,17)],(230,230,230),width=3); outline(d,'poly',[(10,13),(16,20),(22,13)],(230,230,230))
    elif 'badge' in n or 'confusion' in n or 'blind' in n:
        color=(210,80,80) if 'poison' in n or 'sick' in n else (170,90,230)
        outline(d,'ellipse',(5,5,27,27),color); d.line((10,10,22,22),fill=(255,255,255,255),width=3)
    elif 'cursor' in n or 'highlight' in n:
        d.rounded_rectangle((3,3,29,29), radius=4, outline=(255,230,90,255), width=3)
    else:
        outline(d,'ellipse',(7,7,25,25),(100,180,240)); d.rectangle((15,9,17,19), fill=(255,255,255,255)); d.rectangle((15,22,17,24), fill=(255,255,255,255))
    return img

def action_stair(up):
    img=transparent(); d=ImageDraw.Draw(img); c=(225,225,210,255)
    steps=[(7,22,24,25),(10,18,24,21),(13,14,24,17),(16,10,24,13)] if up else [(7,8,24,11),(7,12,21,15),(7,16,18,19),(7,20,15,23)]
    for r in steps: d.rectangle(r, fill=(35,35,40,230)); d.line((r[0],r[1],r[2],r[1]), fill=c, width=2)
    pts=[(17,4),(11,11),(15,11),(15,28),(19,28),(19,11),(23,11)] if up else [(17,28),(11,21),(15,21),(15,4),(19,4),(19,21),(23,21)]
    d.polygon(pts, fill=(120,235,220,255) if up else (90,150,230,255))
    return img

def identity_sprite(a):
    n=a['name'].lower(); img=transparent(); d=ImageDraw.Draw(img)
    if 'kitten' in n or 'cat' in n: return monster_sprite('kitten cat', 'f')
    if 'dog' in n: return monster_sprite('little dog', 'd')
    if 'pony' in n or 'horse' in n: return monster_sprite('pony horse', 'u')
    if 'cursor' in n: return ui_overlay('cursor')
    draw_humanoid(d, COLORS.get('@',(232,202,138)), n); return img

def redraw_asset(a):
    slug=a.get('categorySlug'); name=a['name']; aid=a['id']
    if slug in ('common-early-monsters','full-source-monsters'):
        return monster_sprite(name, a.get('glyph','?'))
    if slug in ('objects-inventory','full-source-objects'):
        return object_sprite(name, a.get('glyph','?'))
    if slug == 'player-pets-identity':
        return identity_sprite(a)
    if slug == 'traps-hazards':
        return trap_sprite(aid)
    if slug == 'ui-status-overlays':
        # panels/bars are allowed to be opaque UI base widgets; icons/overlays must float.
        if any(w in aid for w in ['panel','bar']): return None
        return ui_overlay(aid)
    if slug == 'terrain-features':
        if 'stairs' in aid: return stairs(aid)
        if aid == 'engraving': return engraving()
        if aid == 'sink': return sink_feature()
    return None

def write_asset(a, img):
    for key in ('installedPath','outputPath'):
        p=ROOT/a[key]; p.parent.mkdir(parents=True, exist_ok=True); img.save(p)
    # Legacy by-category mirrors exist for some early assets; keep them in sync if present.
    mirror=ROOT/'electron-poc/assets/tiles/by-category'/a['categorySlug']/(a['id']+'.png')
    if mirror.exists(): img.save(mirror)

def qa_record(a):
    p=ROOT/a['installedPath']
    im=Image.open(p).convert('RGBA'); alpha=im.getchannel('A'); data=list(alpha.getdata()); w,h=im.size
    bbox=alpha.getbbox(); edge=[]
    for x in range(w): edge += [alpha.getpixel((x,0)), alpha.getpixel((x,h-1))]
    for y in range(h): edge += [alpha.getpixel((0,y)), alpha.getpixel((w-1,y))]
    non=sum(v>0 for v in data); opaque=sum(v==255 for v in data); edge_opaque=sum(v>250 for v in edge)
    small=im.resize((16,16), Image.Resampling.LANCZOS).convert('RGBA')
    s_alpha=small.getchannel('A'); sb=s_alpha.getbbox(); s_non=sum(v>32 for v in s_alpha.getdata())
    return {'id':a['id'],'categorySlug':a['categorySlug'],'path':a['installedPath'],'size':[w,h],'bbox':list(bbox) if bbox else None,'nonTransparentRatio':round(non/(w*h),4),'opaqueRatio':round(opaque/(w*h),4),'opaqueEdgePixels':edge_opaque,'small16NonTransparentPixels':s_non,'small16Bbox':list(sb) if sb else None}

def classify_issues(records):
    issues=[]
    transparent_slugs={'common-early-monsters','full-source-monsters','objects-inventory','full-source-objects','player-pets-identity','traps-hazards'}
    transparent_feature_ids={'sink','fountain','altar','grave','engraving'}
    for r in records:
        aid=r['id']; slug=r['categorySlug']; edge=r['opaqueEdgePixels']
        needs_transparency = slug in transparent_slugs or aid in transparent_feature_ids
        if needs_transparency and edge:
            issues.append({'id':aid,'issue':'transparent-overlay-has-opaque-edge/background-card','opaqueEdgePixels':edge})
        if needs_transparency and r['nonTransparentRatio']>0.72:
            issues.append({'id':aid,'issue':'transparent-overlay-too-full-card-like','nonTransparentRatio':r['nonTransparentRatio']})
        if aid in transparent_feature_ids and (not r['bbox'] or r['nonTransparentRatio'] >= 0.95):
            issues.append({'id':aid,'issue':'transparent-feature-lacks-real-alpha-cutout','nonTransparentRatio':r['nonTransparentRatio']})
        if r['small16NonTransparentPixels'] < 8:
            issues.append({'id':aid,'issue':'poor-16px-readability-too-few-visible-pixels','small16NonTransparentPixels':r['small16NonTransparentPixels']})
        if aid=='engraving' and r['categorySlug']=='terrain-features':
            # Engravings are intentionally transparent, low-profile scratches/runes
            # composited over the current floor.  Flag only invisible or card-like
            # results, not the absence of an opaque terrain background.
            if r['nonTransparentRatio'] < 0.05:
                issues.append({'id':aid,'issue':'engraving-too-faint-transparent-overlay','nonTransparentRatio':r['nonTransparentRatio']})
            if edge:
                issues.append({'id':aid,'issue':'engraving-transparent-overlay-has-opaque-edge/background-card','opaqueEdgePixels':edge})
    return issues

def contact_sheet(assets, out, cols=16, scale=2, checker=False, floor=False):
    rows=math.ceil(len(assets)/cols) or 1; label_h=12*scale; tile=32*scale
    sheet=Image.new('RGBA',(cols*tile,rows*(tile+label_h)),(238,238,238,255)); d=ImageDraw.Draw(sheet)
    try: font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',5*scale)
    except Exception: font=ImageFont.load_default()
    for i,a in enumerate(assets):
        x=(i%cols)*tile; y=(i//cols)*(tile+label_h)
        if checker:
            for yy in range(y,y+tile,8):
                for xx in range(x,x+tile,8):
                    d.rectangle((xx,yy,xx+7,yy+7), fill=(190,190,190,255) if ((xx+yy)//8)%2 else (235,235,235,255))
        if floor:
            bg=floor_base('floor').resize((tile,tile), Image.Resampling.NEAREST); sheet.alpha_composite(bg,(x,y))
        im=Image.open(ROOT/a['installedPath']).convert('RGBA').resize((tile,tile), Image.Resampling.NEAREST)
        sheet.alpha_composite(im,(x,y)); d.text((x+1,y+tile),a['id'][:11],font=font,fill=(0,0,0,255))
    out.parent.mkdir(parents=True, exist_ok=True); sheet.convert('RGB').save(out)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--check', action='store_true'); ap.add_argument('--evidence-dir', default=str(DEFAULT_EVIDENCE)); args=ap.parse_args()
    evidence=Path(args.evidence_dir); evidence.mkdir(parents=True, exist_ok=True)
    manifest=json.loads(MANIFEST_PATH.read_text(), object_pairs_hook=OrderedDict)
    status=json.loads(STATUS_PATH.read_text(), object_pairs_hook=OrderedDict) if STATUS_PATH.exists() else OrderedDict()
    changed=[]; now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    if not args.check:
        for a in manifest['assets']:
            img=redraw_asset(a)
            if img is None: continue
            write_asset(a,img); changed.append(a['id'])
            a['renderingNotes']=(a.get('renderingNotes','') + ' Visual QA cleanup: deterministic semantic 32px tile; transparent overlays have no background card; stairs/engraving normalized where applicable.').strip()
            a['workflow']='asset-generation/scripts/asset_visual_qa.py'; a['workflowLabel']='visual-qa-cleanup-transparent-semantic-v1'; a['status']='complete'
            if a['id'] in status.get('assets',{}):
                status['assets'][a['id']]['status']='complete'; status['assets'][a['id']]['updatedAt']=now; status['assets'][a['id']]['workflowLabel']=a['workflowLabel']
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + '\n')
        if status: STATUS_PATH.write_text(json.dumps(status, indent=2) + '\n')
    records=[qa_record(a) for a in manifest['assets']]
    issues=classify_issues(records)
    report={'checkedAt':now,'mode':'check' if args.check else 'cleanup','assetCount':len(records),'changedCount':len(changed),'changedIds':changed,'issueCount':len(issues),'issues':issues,'records':records}
    (evidence/'asset-visual-qa-report.json').write_text(json.dumps(report, indent=2) + '\n')
    cats=['common-early-monsters','objects-inventory','player-pets-identity','traps-hazards','ui-status-overlays','terrain-features','full-source-monsters','full-source-objects']
    for slug in cats:
        aset=[a for a in manifest['assets'] if a.get('categorySlug')==slug]
        if not aset: continue
        contact_sheet(aset, evidence/f'{slug}-checker-contact.png', checker=True)
        contact_sheet(aset, evidence/f'{slug}-floor-composite-32px.png', floor=True)
    # focused problem sheet
    focus_ids={'kitten','kitten-pet','little-dog-pet','pony-pet','up-stairs','branch-stairs-up','down-stairs','branch-stairs-down','engraving','sink','fountain','altar','grave','falling-rock-trap'}
    contact_sheet([a for a in manifest['assets'] if a['id'] in focus_ids], evidence/'boss-reported-issues-after-cleanup.png', checker=True)
    print(json.dumps({'changedCount':len(changed),'issueCount':len(issues),'report':str(evidence/'asset-visual-qa-report.json')}))
    if args.check and issues:
        print(json.dumps(issues[:20], indent=2), file=sys.stderr); return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
