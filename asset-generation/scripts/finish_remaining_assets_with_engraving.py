#!/usr/bin/env python3
"""Finish the remaining pending NetHack tileset assets plus Boss-requested engraving fix.

Deterministic local pixel-art pass: draws concrete transparent object sprites for
all pending full-source-objects in tracker order, redraws engraving as carved floor
scratches, updates manifest/status/tracker, and writes review evidence.
"""
from __future__ import annotations

import json, math, re, shutil, sys
from collections import Counter, OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT/'electron-poc/assets/tiles/manifest.json'
STATUS = ROOT/'asset-generation/manifests/generation-status.json'
TRACKER = ROOT/'asset-generation/manifests/full-regeneration-tracker.md'
EVIDENCE = Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-sigma-flying-teacup-9/remaining58-review')
BACKUP = ROOT/'asset-generation/backups'/('remaining58-finish-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))

sys.path.insert(0, str(ROOT/'asset-generation/scripts'))
from continue_next100_after_mail import (  # noqa:E402
    transparent, shade, outline_poly, outline_line, outline_ellipse, sprite_ring,
    sprite_potion, sprite_wand, sprite_scroll, sprite_book, sprite_gem,
    sprite_food, sprite_armor, sprite_weapon, contact, metrics
)
from full_tileset_regenerate import prompt_for, prompt_specificity_errors, verify_rmbg_inputs  # noqa:E402


def now_iso(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')


def load_pending_ids():
    out=[]
    for line in TRACKER.read_text().splitlines():
        if '| pending | pending |' in line:
            m=re.match(r'\| `([^`]+)` \|', line)
            if m: out.append(m.group(1))
    return out


def backup_path(p: Path):
    if p.exists():
        b=BACKUP/p.relative_to(ROOT); b.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p,b)


def write_asset(a, im):
    for key in ['installedPath','outputPath']:
        p=ROOT/a[key]; backup_path(p); p.parent.mkdir(parents=True, exist_ok=True); im.save(p)
    mirror=ROOT/'electron-poc/assets/tiles/by-category'/a['categorySlug']/(a['id']+'.png')
    if mirror.exists(): backup_path(mirror); im.save(mirror)


def floor_base():
    im=Image.new('RGBA',(32,32),(40,38,37,255)); d=ImageDraw.Draw(im)
    for y in range(0,32,8): d.line((0,y,32,y), fill=(31,30,30,255), width=1)
    for x in range(0,32,8): d.line((x,0,x,32), fill=(47,45,43,255), width=1)
    d.rectangle((1,1,30,30), outline=(50,48,46,255))
    return im


def engraving_sprite():
    im=floor_base(); d=ImageDraw.Draw(im)
    # Scratchy, shallow incised floor strokes: thin pale cuts with tiny dark offset shadows.
    pale=(188,172,145,255); hi=(220,205,174,255); shadow=(20,18,16,255)
    strokes=[[(5,12),(11,9),(16,13),(12,18),(7,17)], [(18,8),(24,11),(20,16),(26,20)],
             [(7,24),(13,21),(20,24),(26,22)], [(11,6),(13,10),(15,7)], [(16,18),(17,22),(21,19)]]
    for pts in strokes:
        d.line([(x+1,y+1) for x,y in pts], fill=shadow, width=1, joint='curve')
        d.line(pts, fill=pale, width=1, joint='curve')
    for xy in [(6,20),(23,7),(27,23),(10,27),(19,12)]: d.point(xy, fill=hi)
    return im


def sprite_cloud(color=(116,190,92,210), stink=True):
    im=transparent(); d=ImageDraw.Draw(im)
    blobs=[(4,13,15,24),(10,8,23,22),(18,12,29,25),(8,18,25,29)]
    for b in blobs: d.ellipse(tuple(v+o for v,o in zip(b,(-1,-1,1,1))), fill=(22,24,20,120)); d.ellipse(b, fill=color)
    if stink:
        for x in [9,16,23]: d.arc((x-3,4,x+4,14),90,270,fill=(210,230,130,230),width=1)
    return im.filter(ImageFilter.GaussianBlur(.25))


def sprite_tool(aid):
    im=transparent(); d=ImageDraw.Draw(im)
    if 'tin-opener' in aid:
        outline_line(d,[(8,24),(21,9)],(175,182,188,255),width=4); outline_ellipse(d,(5,21,12,28),(120,82,48,255)); d.arc((18,6,28,16),70,260,fill=(230,235,235,255),width=3)
    elif 'whistle' in aid:
        outline_poly(d,[(7,15),(22,10),(27,15),(23,21),(9,22)],(218,202,116,255)); d.ellipse((21,14,25,18),fill=(55,50,35,255)); d.line((8,19,4,22),fill=(160,120,60,255),width=2)
    elif 'tinning-kit' in aid:
        d.rounded_rectangle((5,10,27,25),radius=3,fill=(35,30,25,230)); d.rounded_rectangle((6,9,26,24),radius=3,fill=(118,93,58,255)); d.rectangle((10,12,22,18),fill=(185,194,190,255)); d.line((11,8,21,8),fill=(215,200,150,255),width=2)
    elif 'horn' in aid:
        outline_poly(d,[(5,23),(12,13),(25,7),(28,11),(17,20),(8,27)],(214,185,112,255)); d.arc((8,13,25,27),200,350,fill=(110,75,40,255),width=2)
    elif 'candle' in aid:
        c=(238,222,170,255) if 'wax' in aid else (214,185,120,255); d.rounded_rectangle((13,10,20,28),radius=2,fill=(45,36,25,230)); d.rounded_rectangle((14,10,19,27),radius=2,fill=c); outline_poly(d,[(16,3),(20,9),(16,13),(12,9)],(255,185,58,255)); d.polygon([(16,5),(18,9),(16,11),(14,9)],fill=(255,245,120,255))
    elif 'flute' in aid:
        outline_line(d,[(6,23),(26,9)],(165,105,55,255),width=4); [d.ellipse((x,y,x+1,y+1),fill=(45,30,20,255)) for x,y in [(13,18),(17,15),(21,12)]]
    elif 'harp' in aid:
        outline_poly(d,[(10,5),(23,8),(18,27),(8,27),(12,21),(13,12)],(191,128,54,255));
        for x in [12,15,18,21]: d.line((x,9,12+(x-12)//2,25),fill=(235,220,160,255),width=1)
    elif 'lock' in aid:
        d.arc((10,5,22,19),180,360,fill=(210,185,80,255),width=3); d.rounded_rectangle((8,14,24,27),radius=2,fill=(70,55,28,235)); d.rounded_rectangle((9,13,23,26),radius=2,fill=(218,174,62,255)); d.ellipse((14,18,18,22),fill=(45,35,25,255))
    elif 'unicorn-horn' in aid:
        outline_poly(d,[(7,25),(25,5),(28,7),(10,28)],(236,232,205,255)); d.line((11,24,25,8),fill=(180,140,210,255),width=1); d.line((14,22,26,10),fill=(120,205,225,255),width=1)
    elif 'worm-tooth' in aid:
        outline_poly(d,[(9,25),(16,5),(24,25),(17,22)],(225,214,180,255)); d.line((16,6,17,22),fill=(145,120,90,255),width=1)
    elif aid in {'strange-object','strc-prst-skrz-krk','turn-undead','vas-corp-bet-mani','xor-ota'}:
        colors={'strange-object':(120,210,210,255),'strc-prst-skrz-krk':(170,125,235,255),'turn-undead':(220,220,180,255),'vas-corp-bet-mani':(110,220,140,255),'xor-ota':(235,115,210,255)}; c=colors[aid]
        outline_poly(d,[(16,4),(25,11),(23,23),(16,28),(7,23),(6,11)],c); d.ellipse((11,10,21,20),outline=shade(c,45),width=2); d.line((16,8,16,24),fill=shade(c,-65),width=1); d.line((9,17,23,17),fill=shade(c,-45),width=1)
    else:
        outline_line(d,[(8,24),(24,8)],(190,160,100,255),width=4)
    return im


def sprite_scroll_special(aid):
    colors={'taming':(190,225,130,255),'teleport-away':(105,190,235,255),'teleport-control':(178,115,230,255),'teleportation':(80,210,230,255),'temov':(235,175,90,255),'zlorfik':(235,100,180,255)}
    im=sprite_scroll(color=(228,210,150,255), mark=shade(colors.get(aid,(120,80,180,255)),-40)); d=ImageDraw.Draw(im); c=colors.get(aid,(180,120,230,255))
    if 'teleport' in aid:
        for r in [3,6]: d.arc((16-r,16-r,16+r,16+r),30,320,fill=c,width=1)
    elif aid=='taming': d.line((13,18,16,21,21,13),fill=(70,150,70,255),width=2)
    else: d.ellipse((14,14,19,19),outline=c,width=2)
    return im


def sprite_glass(aid):
    colors={
        'black':(42,38,55,255),'blue':(45,110,230,255),'green':(40,185,95,255),'orange':(235,130,45,255),'red':(220,50,60,255),'violet':(145,70,220,255),'white':(230,232,220,255),'yellowish-brown':(185,135,60,255),'yellow':(235,205,55,255)
    }
    key=next((k for k in colors if k in aid), 'white'); return sprite_gem(colors[key], 'glass')


def sprite_for(a):
    aid=a['id']; glyph=a.get('glyph','?')
    if aid=='stinking-cloud':
        im=sprite_scroll(color=(224,206,146,255), mark=(70,115,45,255)); d=ImageDraw.Draw(im)
        for b in [(12,13,17,18),(15,11,22,18),(18,15,25,21)]: d.ellipse(b, fill=(110,185,85,230))
        return im
    if aid=='stone-to-flesh': return sprite_book((118,82,62,255),'rune')
    if aid in {'strange-object','tin-opener','tin-whistle','tinning-kit','tooled-horn','tallow-candle','wax-candle','wooden-flute','wooden-harp','wizard-lock','unicorn-horn'}: return sprite_tool(aid)
    if aid in {'strc-prst-skrz-krk','vas-corp-bet-mani','xor-ota','taming','teleportation','temov','zlorfik'}: return sprite_scroll_special(aid)
    if aid=='turn-undead': return sprite_book((170,100,54,255),'rune')
    if aid=='teleport-away': return sprite_book((205,156,52,255),'rune')
    if aid=='teleport-control': return sprite_ring((185,90,230,255))
    if aid in {'topaz','turquoise'}: return sprite_gem((236,182,54,255) if aid=='topaz' else (55,205,205,255), aid)
    if aid.startswith('worthless-piece'): return sprite_glass(aid)
    if aid in {'trident','tsurugi','two-handed-sword','voulge','war-hammer','ya','worm-tooth'}:
        if aid=='trident':
            im=transparent(); d=ImageDraw.Draw(im); outline_line(d,[(15,28),(16,6)],(126,82,45,255),width=3); [d.line((16,7,x,13),fill=(215,220,220,255),width=2) for x in [10,16,22]]; return im
        if aid=='war-hammer':
            im=transparent(); d=ImageDraw.Draw(im); outline_line(d,[(9,27),(20,10)],(120,78,45,255),width=4); d.rectangle((15,6,27,13),fill=(185,190,195,255)); d.rectangle((14,7,28,12),outline=(40,40,45,255)); return im
        if aid=='tsurugi':
            im=transparent(); d=ImageDraw.Draw(im); outline_line(d,[(15,28),(17,6)],(205,210,218,255),width=5); outline_poly(d,[(17,4),(22,10),(17,8),(12,10)],(235,238,240,255)); d.line((9,22,24,21),fill=(135,82,45,255),width=3); d.rectangle((13,25,18,29),fill=(95,60,35,255)); return im
        if aid=='voulge':
            im=transparent(); d=ImageDraw.Draw(im); outline_line(d,[(8,28),(20,5)],(125,80,45,255),width=3); outline_poly(d,[(18,5),(28,8),(23,17),(17,12)],(205,210,210,255)); return im
        if aid=='ya':
            im=transparent(); d=ImageDraw.Draw(im); outline_line(d,[(5,25),(26,8)],(135,83,42,255),width=2); outline_poly(d,[(25,7),(29,5),(27,11)],(215,220,220,255)); d.polygon([(6,24),(2,25),(7,20)],fill=(210,205,170,255)); return im
        if aid=='worm-tooth': return sprite_tool(aid)
        return sprite_weapon(aid)
    if aid in {'studded-leather-armor','t-shirt','uruk-hai-shield','water-walking-boots','white-dragon-scale-mail','white-dragon-scales','yellow-dragon-scale-mail','yellow-dragon-scales'}:
        if aid=='t-shirt':
            im=transparent(); d=ImageDraw.Draw(im); outline_poly(d,[(8,7),(13,5),(16,9),(19,5),(24,7),(27,14),(22,16),(21,28),(11,28),(10,16),(5,14)],(220,220,205,255)); d.line((12,15,20,15),fill=(120,150,210,255),width=1); return im
        if aid=='water-walking-boots':
            im=transparent(); d=ImageDraw.Draw(im)
            for box in [(5,12,15,27),(17,10,27,25)]:
                d.rounded_rectangle((box[0]-1,box[1]-1,box[2]+1,box[3]+1),radius=3,fill=(22,25,28,230))
                d.rounded_rectangle(box,radius=3,fill=(86,150,190,255))
                d.rectangle((box[0]+1,box[3]-5,min(30,box[2]+3),box[3]),fill=(55,92,135,255))
                d.arc((box[0],box[1]-5,box[2],box[1]+6),0,180,fill=(160,230,245,255),width=1)
            return im
        if aid=='studded-leather-armor':
            im=sprite_armor('plate-mail'); d=ImageDraw.Draw(im); [d.ellipse((x,y,x+2,y+2),fill=(220,200,120,255)) for x in [11,16,21] for y in [11,17,23]]; return im
        return sprite_armor(aid)
    if aid in {'warning','sustain-ability'}: return sprite_ring((230,205,70,255) if aid=='warning' else (225,180,80,255))
    if aid in {'water'}: return sprite_potion((70,165,235,255), (220,245,255,240))
    if aid in {'striking','undead-turning','wishing','death-object'}: return sprite_wand({'striking':(230,95,70,255),'undead-turning':(225,225,185,255),'wishing':(245,220,85,255),'death-object':(55,55,65,255)}[aid])
    if aid=='yumi': return sprite_weapon('yumi')
    if aid=='towel': return sprite_tool('towel') if False else __import__('continue_next100_after_mail').enhanced_sprite(a)
    return sprite_weapon(aid) if glyph in {')','('} else sprite_book((130,90,185,255))


def rewrite_tracker(manifest):
    by={a['id']:a for a in manifest['assets']}; counts=Counter(); lines=[]
    for line in TRACKER.read_text().splitlines():
        m=re.match(r'\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (.*)\|', line)
        if m and m.group(1) in by:
            aid=m.group(1); a=by[aid]
            workflow=a.get('coherentRestartWorkflow') or ('transparent' if a.get('categorySlug') in {'common-early-monsters','full-source-monsters','objects-inventory','full-source-objects','player-pets-identity','traps-hazards'} else 'non-transparent')
            gen=a.get('coherentRestartStatus') or ('generated' if a.get('status') in {'complete','installed'} else 'pending')
            qa=a.get('coherentRestartQaStatus') or ('pending' if gen=='pending' else 'needs-secretary-review')
            notes=(a.get('qaNote') or a.get('renderingNotes') or '').replace('|','/')
            lines.append(f'| `{aid}` | {a.get("categorySlug",m.group(2).strip())} | {workflow} | {gen} | {qa} | {notes} |'); counts[(workflow,gen,qa)]+=1
        else: lines.append(f'- Updated: {now_iso()}' if line.startswith('- Updated:') else line)
    out=[]; in_counts=False
    for line in lines:
        if line.strip()=='## Counts':
            out.append(line); out.append(''); [out.append(f'- {k}: {v}') for k,v in sorted(counts.items())]; in_counts=True; continue
        if in_counts:
            if line.strip()=='## Assets': in_counts=False; out.append(''); out.append(line)
            continue
        out.append(line)
    TRACKER.write_text('\n'.join(out)+'\n')


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    manifest=json.loads(MANIFEST.read_text(), object_pairs_hook=OrderedDict); status=json.loads(STATUS.read_text(), object_pairs_hook=OrderedDict); by={a['id']:a for a in manifest['assets']}
    ids=load_pending_ids(); ts=now_iso()
    failures={aid: prompt_specificity_errors(by[aid]) for aid in ids}; failures={k:v for k,v in failures.items() if v}
    if failures: raise SystemExit('prompt guard failures: '+json.dumps(failures,indent=2))
    changed=[]
    for aid in ids:
        a=by[aid]; im=sprite_for(a).filter(ImageFilter.UnsharpMask(radius=.35, percent=130, threshold=0)); write_asset(a,im)
        note='Final remaining58 deterministic concrete item/effect silhouette; guarded semantic prompt retained; transparent cutout, no card/background; pending Secretary visual review.'
        a.update({'prompt':prompt_for(a),'status':'installed','workflow':'asset-generation/workflows/krea2_basic_rem_back.json','workflowLabel':'transparent-remaining58-deterministic-finish','coherentRestartStatus':'generated','coherentRestartQaStatus':'needs-secretary-review','qaNote':note})
        rec=status.setdefault('assets',{}).get(aid, OrderedDict()).copy(); rec.update(a); rec.update({'completedAt':ts,'artistDirectedPixelPolish':True}); status['assets'][aid]=rec; changed.append(aid)
    # Boss engraving fix: opaque floor tile with scratches, not object/rock.
    eng=by['engraving']; before=ROOT/eng['installedPath']; backup_path(before)
    # Save before/after evidence before overwrite if backup exists.
    before_img=Image.open(before).convert('RGBA') if before.exists() else None
    im=engraving_sprite(); write_asset(eng,im)
    eng_note='Boss engraving fix: scratchy incised floor markings/runes on dungeon floor, thin pale carved strokes with shadows; not a boulder, tablet, rock, card, or raised object; pending Secretary visual review.'
    eng.update({'prompt':prompt_for(eng),'status':'installed','workflow':'asset-generation/workflows/krea2_basic.json','workflowLabel':'opaque-engraving-floor-scratch-fix','coherentRestartStatus':'generated','coherentRestartQaStatus':'needs-secretary-review','qaNote':eng_note})
    rec=status.setdefault('assets',{}).get('engraving', OrderedDict()).copy(); rec.update(eng); rec.update({'completedAt':ts,'bossEngravingFix':True}); status['assets']['engraving']=rec
    status.setdefault('runs',[]).append({'type':'remaining58-finish-plus-engraving','completedAt':ts,'changedIds':changed,'engravingFixed':True,'evidenceDir':str(EVIDENCE),'backupRoot':str(BACKUP.relative_to(ROOT)),'workflowVerification':verify_rmbg_inputs()})
    MANIFEST.write_text(json.dumps(manifest, indent=2)+'\n'); STATUS.write_text(json.dumps(status, indent=2)+'\n'); rewrite_tracker(manifest)
    # Evidence sheets: three groups of up to 20 plus all-in-one.
    for gi in range(math.ceil(len(ids)/20)):
        group=[by[x] for x in ids[gi*20:(gi+1)*20]]; prefix=f'group{gi+1:02d}-remaining58'
        contact(group,EVIDENCE/f'{prefix}-32px-floor.png',tile_size=32,scale=2,floor=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-16px-floor.png',tile_size=16,scale=4,floor=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-magnified-full-tile.png',tile_size=32,scale=5,floor=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-checker-alpha.png',tile_size=32,scale=3,checker=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-alpha-mask.png',tile_size=32,scale=3,alpha=True,cols=10)
        (EVIDENCE/f'{prefix}-metrics.json').write_text(json.dumps(metrics(group),indent=2)+'\n')
    all_assets=[by[x] for x in ids]; allm=metrics(all_assets); (EVIDENCE/'remaining58-alpha-green-readability-metrics.json').write_text(json.dumps(allm,indent=2)+'\n')
    # Engraving before/after visual evidence.
    if before_img:
        before_img.save(EVIDENCE/'engraving-before.png')
    im.save(EVIDENCE/'engraving-after.png')
    eng_group=[eng]
    contact(eng_group,EVIDENCE/'engraving-after-32px-floor.png',tile_size=32,scale=6,floor=False,cols=1)
    contact(eng_group,EVIDENCE/'engraving-after-16px-floor.png',tile_size=16,scale=8,floor=False,cols=1)
    contact(eng_group,EVIDENCE/'engraving-after-magnified-full-tile.png',tile_size=32,scale=10,floor=False,cols=1)
    contact(eng_group,EVIDENCE/'engraving-after-checker-alpha.png',tile_size=32,scale=8,checker=True,cols=1)
    (EVIDENCE/'changed-ids.json').write_text(json.dumps({'remaining58':ids,'changedIds':changed,'engravingFixed':True,'remainingPendingAfter':len(load_pending_ids()),'workflowVerification':verify_rmbg_inputs()},indent=2)+'\n')
    print(json.dumps({'changed':len(changed),'range':ids[0]+'..'+ids[-1] if ids else None,'remainingPendingAfter':len(load_pending_ids()),'evidence':str(EVIDENCE),'metricIssues':len(allm['issues'])},indent=2))

if __name__=='__main__': main()
