#!/usr/bin/env python3
"""Targeted semantic fixes for next100 continuation critique blockers."""
from __future__ import annotations
import json, shutil, math
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[2]
MANIFEST=ROOT/'electron-poc/assets/tiles/manifest.json'
STATUS=ROOT/'asset-generation/manifests/generation-status.json'
EVIDENCE=Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-nu-polishing-violin-32/next100-continuation-review')
BACKUP=ROOT/'asset-generation/backups'/('next100-continuation-semantic-fix-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))

TARGETS=['glob-of-black-pudding','glob-of-brown-pudding','glob-of-gray-ooze','glob-of-green-slime','grappling-hook','magic-mapping','magic-marker','hawaiian-shirt','iron-shoes','leather-jacket','katana','gold-dragon-scale-mail','gold-dragon-scales','green-dragon-scale-mail','green-dragon-scales','leather-cloak','leather-gloves','k-ration','kelp-frond','lump-of-royal-jelly','food-detection','fortune-cookie','blindfold']

def T(): return Image.new('RGBA',(32,32),(0,0,0,0))
def op(d, pts, fill, out=(20,20,24,235)):
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.polygon([(x+dx,y+dy) for x,y in pts], fill=out)
    d.polygon(pts, fill=fill)
def ol(d, pts, fill, w=3, out=(20,20,24,235)):
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.line([(x+dx,y+dy) for x,y in pts], fill=out, width=w+2, joint='curve')
    d.line(pts, fill=fill, width=w, joint='curve')
def oe(d, box, fill=None, out=(20,20,24,235), w=2):
    if fill is not None:
        for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.ellipse(tuple(v+(dx if i%2==0 else dy) for i,v in enumerate(box)), fill=out)
        d.ellipse(box, fill=fill)
    else:
        d.ellipse(box, outline=out, width=w+2)
        d.ellipse(box, outline=(190,190,200,255), width=w)

def armor(color, scales=False):
    im=T(); d=ImageDraw.Draw(im); dark=tuple(max(0,c-80) for c in color[:3])+(255,)
    if scales:
        op(d,[(16,4),(25,9),(25,22),(16,29),(7,22),(7,9)],color,dark)
        for y in [10,15,20]:
            for x in [10,15,20]: oe(d,(x,y,x+4,y+4),tuple(min(255,c+40) for c in color[:3])+(255,),dark,1)
    else:
        op(d,[(10,5),(22,5),(26,14),(22,28),(10,28),(6,14)],color,dark)
        d.line((16,7,16,27), fill=tuple(min(255,c+60) for c in color[:3])+(255,), width=2); d.line((10,14,22,14), fill=tuple(min(255,c+50) for c in color[:3])+(255,), width=2)
    return im

def slime(color):
    im=T(); d=ImageDraw.Draw(im); dark=tuple(max(0,c-75) for c in color[:3])+(255,); hi=tuple(min(255,c+65) for c in color[:3])+(255,)
    oe(d,(4,14,28,27),color,dark,2); oe(d,(9,9,21,21),hi,dark,1); d.ellipse((13,14,17,17), fill=(245,245,235,210)); d.ellipse((20,19,24,22), fill=hi)
    return im

def sprite(aid):
    im=T(); d=ImageDraw.Draw(im)
    if aid=='glob-of-black-pudding': return slime((45,42,55,255))
    if aid=='glob-of-brown-pudding': return slime((135,82,42,255))
    if aid=='glob-of-gray-ooze': return slime((150,155,160,255))
    if aid=='glob-of-green-slime': return slime((65,190,80,255))
    if aid=='grappling-hook':
        ol(d,[(16,27),(16,8)],(120,90,55,255),3); d.arc((6,5,16,18),250,80,fill=(210,215,215,255),width=4); d.arc((16,5,26,18),100,290,fill=(210,215,215,255),width=4); op(d,[(15,5),(20,2),(18,9)],(225,230,230,255)); return im
    if aid=='magic-mapping':
        op(d,[(6,8),(25,5),(27,23),(8,27)],(220,195,120,255),(90,65,35,255)); ol(d,[(10,20),(14,13),(19,16),(23,10)],(60,150,210,255),2); d.rectangle((15,17,18,20), fill=(70,190,80,255)); return im
    if aid=='magic-marker':
        ol(d,[(8,24),(24,8)],(80,55,130,255),5); ol(d,[(10,22),(22,10)],(210,180,245,255),2); op(d,[(23,6),(28,3),(26,11)],(60,60,70,255)); d.line((6,26,11,27),fill=(120,80,220,255),width=2); return im
    if aid=='hawaiian-shirt':
        op(d,[(9,8),(13,5),(16,9),(19,5),(23,8),(26,15),(22,17),(22,28),(10,28),(10,17),(6,15)],(45,155,220,255),(15,60,90,255))
        for x,y in [(11,13),(19,12),(15,20),(22,23)]: d.ellipse((x,y,x+3,y+3), fill=(255,210,75,255)); d.line((x+1,y,x+4,y-2),fill=(245,100,120,255),width=1)
        return im
    if aid=='iron-shoes':
        op(d,[(5,18),(15,18),(16,24),(12,27),(5,25)],(150,155,160,255),(55,58,65,255)); op(d,[(17,18),(27,18),(28,24),(24,27),(17,25)],(150,155,160,255),(55,58,65,255)); d.line((7,20,14,20),fill=(225,225,220,255)); d.line((19,20,26,20),fill=(225,225,220,255)); return im
    if aid=='leather-jacket':
        op(d,[(9,7),(14,5),(16,10),(18,5),(23,7),(26,16),(22,18),(22,28),(10,28),(10,18),(6,16)],(125,70,35,255),(55,30,15,255)); d.line((16,10,16,27),fill=(210,130,60,255),width=2); d.line((11,14,15,14),fill=(80,40,20,255)); d.line((17,14,21,14),fill=(80,40,20,255)); return im
    if aid=='katana':
        ol(d,[(8,27),(23,7)],(215,220,220,255),3); op(d,[(22,5),(28,3),(25,10)],(235,240,240,255),(70,75,80,255)); ol(d,[(7,23),(12,28)],(80,45,25,255),3); d.line((8,21,14,27),fill=(230,185,65,255),width=2); return im
    if aid=='gold-dragon-scale-mail': return armor((210,165,45,255),False)
    if aid=='gold-dragon-scales': return armor((220,180,55,255),True)
    if aid=='green-dragon-scale-mail': return armor((55,165,75,255),False)
    if aid=='green-dragon-scales': return armor((65,190,85,255),True)
    if aid=='leather-cloak':
        op(d,[(16,5),(25,13),(22,29),(10,29),(7,13)],(115,68,38,255),(50,28,16,255)); d.line((13,9,19,9),fill=(205,130,70,255),width=2); return im
    if aid=='leather-gloves':
        op(d,[(7,13),(13,9),(16,16),(14,26),(8,25),(5,18)],(140,82,42,255),(55,30,16,255)); op(d,[(25,13),(19,9),(16,16),(18,26),(24,25),(27,18)],(140,82,42,255),(55,30,16,255)); return im
    if aid=='k-ration':
        op(d,[(7,9),(25,9),(25,23),(7,23)],(115,95,65,255),(55,45,30,255)); d.rectangle((10,12,22,17),fill=(210,195,145,255)); d.line((11,20,21,20),fill=(75,65,45,255),width=2); return im
    if aid=='kelp-frond':
        ol(d,[(15,28),(16,21),(14,15),(17,8),(16,4)],(55,155,75,255),3); [op(d,pts,(70,190,85,255),(25,80,40,255)) for pts in [[(15,21),(7,17),(12,24)],[(16,18),(25,14),(20,22)],[(15,13),(7,9),(12,17)],[(17,10),(25,6),(21,14)]]]; return im
    if aid=='lump-of-royal-jelly':
        return slime((245,195,55,255))
    if aid=='food-detection':
        oe(d,(8,11,24,27),(190,110,65,255),(70,40,25,255),2); d.arc((6,5,26,23),200,340,fill=(80,210,110,255),width=3); d.arc((6,5,26,23),200,340,fill=(240,245,120,255),width=1); return im
    if aid=='fortune-cookie':
        op(d,[(5,17),(13,9),(20,11),(27,18),(20,26),(12,24)],(220,155,70,255),(100,55,25,255)); d.rectangle((14,14,25,17),fill=(245,235,190,255)); d.line((9,18,19,19),fill=(150,90,35,255),width=2); return im
    if aid=='blindfold':
        op(d,[(5,13),(21,10),(27,15),(24,21),(7,20),(4,16)],(24,24,36,255),(120,120,145,255)); d.line((8,15,22,13),fill=(175,175,195,255),width=1); op(d,[(23,15),(27,12),(26,17)],(20,20,30,255),(120,120,145,255)); op(d,[(22,18),(27,22),(26,17)],(20,20,30,255),(120,120,145,255)); return im
    raise KeyError(aid)

def write_asset(a, im):
    for key in ['installedPath','outputPath']:
        p=ROOT/a[key]
        if p.exists():
            bp=BACKUP/p.relative_to(ROOT); bp.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,bp)
        p.parent.mkdir(parents=True,exist_ok=True); im.save(p)

def metrics(assets):
    rows=[]; issues=[]
    for a in assets:
        im=Image.open(ROOT/a['installedPath']).convert('RGBA'); alpha=im.getchannel('A'); data=list(im.getdata()); edge=[]
        for x in range(32): edge += [alpha.getpixel((x,0)), alpha.getpixel((x,31))]
        for y in range(32): edge += [alpha.getpixel((0,y)), alpha.getpixel((31,y))]
        non=sum(px[3]>0 for px in data); small=im.resize((16,16), Image.Resampling.LANCZOS); snon=sum(px[3]>32 for px in small.getdata())
        rec={'id':a['id'],'bbox':alpha.getbbox(),'nonTransparentRatio':round(non/1024,4),'opaqueEdgePixels':sum(v>250 for v in edge),'small16VisiblePixels':snon,'greenishVisiblePixels':sum(1 for r,g,b,aa in data if aa>0 and g>150 and r<110 and b<130)}; rows.append(rec)
        if rec['opaqueEdgePixels']: issues.append({'id':a['id'],'issue':'opaque edge/card'})
        if rec['nonTransparentRatio']>.72: issues.append({'id':a['id'],'issue':'too full/card-like'})
        if rec['small16VisiblePixels']<8: issues.append({'id':a['id'],'issue':'low 16px visible'})
    return {'records':rows,'issues':issues}

def contact(assets,out,tile=32,scale=4,floor=True,cols=8):
    rows=math.ceil(len(assets)/cols); sheet=Image.new('RGBA',(cols*tile*scale, rows*(tile*scale+10*scale)),(235,235,235,255)); d=ImageDraw.Draw(sheet)
    for i,a in enumerate(assets):
        x=(i%cols)*tile*scale; y=(i//cols)*(tile*scale+10*scale)
        if floor:
            bg=Image.new('RGBA',(tile,tile),(40,38,38,255)); bd=ImageDraw.Draw(bg)
            for z in range(0,tile,max(4,tile//4)): bd.line((0,z,tile,z),fill=(32,31,31,255)); bd.line((z,0,z,tile),fill=(46,44,44,255))
            sheet.alpha_composite(bg.resize((tile*scale,tile*scale),Image.Resampling.NEAREST),(x,y))
        else:
            sq=8*scale
            for yy in range(y,y+tile*scale,sq):
                for xx in range(x,x+tile*scale,sq): d.rectangle((xx,yy,xx+sq-1,yy+sq-1),fill=(190,190,190,255) if ((xx//sq+yy//sq)%2) else (240,240,240,255))
        im=Image.open(ROOT/a['installedPath']).convert('RGBA').resize((tile,tile),Image.Resampling.LANCZOS if tile==16 else Image.Resampling.NEAREST).resize((tile*scale,tile*scale),Image.Resampling.NEAREST)
        sheet.alpha_composite(im,(x,y)); d.text((x+1,y+tile*scale),a['id'][:12],fill=(0,0,0,255))
    out.parent.mkdir(parents=True,exist_ok=True); sheet.convert('RGB').save(out)

def main():
    manifest=json.load(open(MANIFEST)); status=json.load(open(STATUS)); by={a['id']:a for a in manifest['assets']}; ts=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    changed=[]
    for aid in TARGETS:
        a=by[aid]; im=sprite(aid); write_asset(a,im)
        a['qaNote']='Semantic cleanup after independent critique: redrawn as concrete '+aid.replace('-',' ')+' silhouette with transparent background, no card/matte; needs Secretary visual review.'
        a['workflowLabel']='transparent-next100-continuation-semantic-cleanup'; a['coherentRestartStatus']='generated'; a['coherentRestartQaStatus']='needs-secretary-review'
        status['assets'][aid].update(a); status['assets'][aid]['completedAt']=ts; changed.append(aid)
    status.setdefault('runs',[]).append({'type':'next100-continuation-semantic-cleanup','completedAt':ts,'changedIds':changed,'backupRoot':str(BACKUP.relative_to(ROOT))})
    MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n'); STATUS.write_text(json.dumps(status,indent=2)+'\n')
    assets=[by[x] for x in TARGETS]
    contact(assets,EVIDENCE/'semantic-cleanup-corrected-32px-floor.png',tile=32,scale=5,floor=True,cols=8)
    contact(assets,EVIDENCE/'semantic-cleanup-corrected-16px-floor.png',tile=16,scale=8,floor=True,cols=8)
    contact(assets,EVIDENCE/'semantic-cleanup-corrected-checker-alpha.png',tile=32,scale=5,floor=False,cols=8)
    met=metrics(assets); (EVIDENCE/'semantic-cleanup-metrics.json').write_text(json.dumps(met,indent=2)+'\n')
    # refresh combined metric file for all generated in this continuation + boss note
    cids=json.load(open(EVIDENCE/'changed-ids.json'))['next100']; all_assets=[by[x] for x in cids]+[by['beartrap'],by['blindfold']]
    (EVIDENCE/'next100-continuation-alpha-green-readability-metrics.json').write_text(json.dumps(metrics(all_assets),indent=2)+'\n')
    print(json.dumps({'changedIds':changed,'issues':met['issues'],'backupRoot':str(BACKUP)},indent=2))
if __name__=='__main__': main()
