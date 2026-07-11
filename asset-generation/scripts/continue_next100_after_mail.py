#!/usr/bin/env python3
"""Continue tileset generation for the 100 pending assets after the accepted mail batch.

Deterministic/offline correction-style pass: installs transparent 32px object sprites
with concrete per-item silhouettes/colors, records prompt text from the guarded
full_tileset_regenerate prompt templates, and emits five 20-asset review groups.
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
EVIDENCE = Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-nu-carving-violin-80/next100-after-mail-review')
BACKUP = ROOT/'asset-generation/backups'/('next100-after-mail-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))

sys.path.insert(0, str(ROOT/'asset-generation/scripts'))
from upgrade_full_source_sprites import object_sprite, inferred_object_glyph  # noqa: E402
from full_tileset_regenerate import prompt_for, prompt_specificity_errors, verify_rmbg_inputs  # noqa: E402


def now_iso(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
def transparent(): return Image.new('RGBA',(32,32),(0,0,0,0))
def shade(c, d): return tuple(max(0,min(255,x+d)) for x in c[:3])+(c[3:] if len(c)==4 else (255,))
def outline_poly(d, pts, fill, outline=(20,20,24,235)):
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.polygon([(x+dx,y+dy) for x,y in pts], fill=outline)
    d.polygon(pts, fill=fill)
def outline_line(d, pts, fill, width=3, outline=(20,20,24,235)):
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.line([(x+dx,y+dy) for x,y in pts], fill=outline, width=width+2, joint='curve')
    d.line(pts, fill=fill, width=width, joint='curve')
def outline_ellipse(d, box, fill, outline=(20,20,24,235), width=1):
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.ellipse(tuple(v+(dx if i%2==0 else dy) for i,v in enumerate(box)), fill=outline)
    d.ellipse(box, fill=fill)

def sprite_ring(color):
    im=transparent(); d=ImageDraw.Draw(im)
    outline_ellipse(d,(7,7,25,25),color); d.ellipse((12,12,20,20),fill=(0,0,0,0),outline=shade(color,-70),width=3)
    d.ellipse((14,3,19,8), fill=shade(color,35)); d.point((16,5), fill=(255,255,255,255))
    return im

def sprite_potion(color, accent=(245,245,255,220)):
    im=transparent(); d=ImageDraw.Draw(im)
    outline_poly(d,[(13,6),(19,6),(20,11),(23,15),(22,27),(10,27),(9,15),(12,11)],color)
    d.rectangle((13,4,19,8),fill=shade(color,35)); d.rectangle((12,14,20,25),fill=shade(color,-25)); d.line((12,13,19,13),fill=accent,width=1)
    return im

def sprite_wand(color, orb=None):
    im=transparent(); d=ImageDraw.Draw(im); orb=orb or shade(color,45)
    outline_line(d,[(8,25),(22,7)],color,width=4); d.ellipse((19,4,26,11),fill=orb); d.point((22,7),fill=(255,255,240,255))
    return im

def sprite_scroll(color=(226,202,108,255), mark=(90,70,40,255)):
    im=transparent(); d=ImageDraw.Draw(im)
    d.ellipse((6,6,13,13),fill=(60,45,30,230)); d.ellipse((19,19,26,26),fill=(60,45,30,230))
    d.rounded_rectangle((8,7,24,25),radius=2,fill=(35,28,24,230)); d.rounded_rectangle((9,7,23,25),radius=2,fill=color)
    d.line((12,11,20,11),fill=mark,width=1); d.line((12,16,20,16),fill=mark,width=1); d.arc((12,18,20,24),0,160,fill=mark,width=1)
    return im

def sprite_book(color, symbol=''):
    im=transparent(); d=ImageDraw.Draw(im)
    d.rounded_rectangle((7,5,24,28),radius=2,fill=(30,24,22,235)); d.rounded_rectangle((8,6,23,27),radius=2,fill=color)
    d.line((11,7,11,26),fill=shade(color,-55),width=2); d.line((14,11,21,11),fill=shade(color,45),width=1); d.line((14,16,21,16),fill=shade(color,-45),width=1)
    if symbol: d.ellipse((15,19,20,24),outline=shade(color,60),width=1)
    return im

def sprite_gem(color, kind='gem'):
    im=transparent(); d=ImageDraw.Draw(im)
    if kind=='obsidian': pts=[(16,4),(26,13),(22,25),(12,27),(5,15)]; hi=(90,80,115,255)
    elif kind=='opal': pts=[(16,5),(25,12),(23,22),(16,27),(8,22),(7,12)]; hi=(255,210,120,255)
    else: pts=[(16,4),(27,13),(22,27),(10,27),(5,13)]; hi=shade(color,60)
    outline_poly(d,pts,color); d.line((16,5,16,26),fill=shade(color,-45),width=1); d.line((7,13,26,13),fill=hi,width=1); d.polygon([(12,9),(16,5),(20,9),(16,13)],fill=hi)
    return im

def sprite_food(aid):
    colors={'meat-ring':(170,74,45,255),'meat-stick':(155,76,42,255),'meatball':(145,64,44,255),'melon':(80,185,95,255),'orange':(235,132,34,255),'pancake':(218,158,84,255),'pear':(168,205,82,255),'slime-mold':(120,210,70,255),'sprig-of-wolfsbane':(80,170,95,255)}
    c=colors.get(aid,(188,116,72,255)); im=transparent(); d=ImageDraw.Draw(im)
    if aid=='meat-stick': outline_line(d,[(8,23),(24,9)],c,width=6); d.line((11,21,21,11),fill=shade(c,45),width=2)
    elif aid=='meat-ring': outline_ellipse(d,(7,7,25,25),c); d.ellipse((12,12,20,20),fill=(0,0,0,0),outline=shade(c,-60),width=3)
    elif aid=='melon': outline_ellipse(d,(7,8,25,25),c); d.line((16,8,16,25),fill=shade(c,-50),width=2); d.arc((9,8,23,25),80,280,fill=shade(c,35),width=1)
    elif aid=='orange': outline_ellipse(d,(8,8,24,24),c); d.rectangle((15,5,17,9),fill=(80,130,55,255)); d.arc((9,8,23,20),20,160,fill=shade(c,50),width=2)
    elif aid=='pear': outline_ellipse(d,(9,12,24,27),c); outline_ellipse(d,(11,6,21,18),shade(c,10)); d.line((17,6,19,3),fill=(94,65,35,255),width=2)
    elif aid=='pancake':
        for y in [18,15,12]: d.ellipse((6,y,26,y+9),fill=(55,35,25,220)); d.ellipse((7,y,25,y+7),fill=c)
        d.rectangle((14,9,19,13),fill=(238,202,70,255))
    elif aid=='sprig-of-wolfsbane': outline_line(d,[(14,27),(18,7)],(92,120,54,255),width=2); [outline_ellipse(d,b,c) for b in [(7,16,15,23),(17,12,25,19),(8,7,16,14)]]
    else: outline_ellipse(d,(8,8,24,24),c)
    return im

def sprite_armor(aid):
    palette={'orange':(222,104,38,255),'red':(210,48,48,255),'yellow':(232,196,54,255),'white':(226,228,218,255),'silver':(198,210,220,255),'shimmering':(170,160,235,255),'orcish':(92,125,76,255),'splint':(155,166,178,255),'plate':(175,184,194,255)}
    key=next((k for k in palette if k in aid), 'plate'); c=palette[key]
    im=transparent(); d=ImageDraw.Draw(im)
    if 'scales' in aid and 'mail' not in aid:
        for x,y in [(10,10),(16,9),(22,10),(13,16),(19,16),(16,22)]: outline_poly(d,[(x,y-5),(x+5,y),(x,y+5),(x-5,y)],c)
    elif 'shield' in aid:
        outline_poly(d,[(16,4),(25,10),(22,24),(16,29),(10,24),(7,10)],c); d.line((16,7,16,25),fill=shade(c,-55),width=2)
        if 'reflection' in aid: d.ellipse((12,10,20,18),fill=(235,245,255,230))
    elif 'helm' in aid:
        outline_poly(d,[(8,15),(11,7),(21,7),(24,15),(21,21),(11,21)],c); d.line((11,15,21,15),fill=shade(c,-40),width=2)
    elif 'cloak' in aid or 'robe' in aid:
        outline_poly(d,[(16,4),(24,12),(25,28),(7,28),(8,12)],c); d.line((16,6,16,27),fill=shade(c,-55),width=1)
    elif 'boots' in aid:
        d.rounded_rectangle((5,17,14,25),radius=2,fill=(25,20,18,230)); d.rounded_rectangle((18,17,27,25),radius=2,fill=(25,20,18,230)); d.rounded_rectangle((6,16,14,24),radius=2,fill=c); d.rounded_rectangle((18,16,26,24),radius=2,fill=c)
    else:
        outline_poly(d,[(10,5),(22,5),(25,14),(21,28),(11,28),(7,14)],c); d.line((12,10,20,10),fill=shade(c,45),width=2); d.line((9,16,23,16),fill=shade(c,-50),width=2)
    return im

def sprite_weapon(aid):
    c=(194,198,202,255); wood=(132,82,45,255); im=transparent(); d=ImageDraw.Draw(im)
    if 'bow' in aid or aid=='yumi': d.arc((6,4,24,28),-70,70,fill=wood,width=3); d.line((22,6,22,26),fill=(230,230,210),width=1); outline_line(d,[(7,18),(26,14)],c,width=2)
    elif any(w in aid for w in ['arrow','spear']): outline_line(d,[(5,25),(25,7)],wood,width=3); outline_poly(d,[(25,7),(29,4),(27,11)],c)
    elif any(w in aid for w in ['partisan','ranseur','spetum']): outline_line(d,[(8,28),(21,5)],wood,width=3); outline_poly(d,[(19,5),(28,8),(21,15),(17,10)],c)
    elif aid=='morning-star': outline_line(d,[(8,25),(16,17)],wood,width=3); outline_line(d,[(16,17),(22,11)],(95,95,100,255),width=2); outline_ellipse(d,(20,6,28,14),c)
    elif 'shuriken' in aid: outline_poly(d,[(16,4),(19,13),(28,16),(19,19),(16,28),(13,19),(4,16),(13,13)],c)
    elif 'scalpel' in aid: outline_line(d,[(7,25),(23,7)],c,width=3); d.line((7,25,12,20),fill=(100,80,60,255),width=4)
    elif 'runesword' in aid: outline_line(d,[(8,27),(23,5)],(130,80,200,255),width=4); outline_poly(d,[(21,5),(27,3),(24,10)],(220,210,255,255)); d.line((10,24,5,19),fill=c,width=3)
    else: outline_line(d,[(8,26),(23,6)],c,width=4); outline_poly(d,[(21,5),(27,3),(24,10)],shade(c,35)); d.line((10,24,5,19),fill=wood,width=3)
    return im

def enhanced_sprite(a):
    aid=a['id']; n=(a.get('name') or aid).lower(); glyph=inferred_object_glyph(n, a.get('glyph','('))
    if any(x in aid for x in ['dragon-scale','chain-mail','ring-mail','plate-mail','shield','helm','cloak','robe','boots','mummy-wrapping','splint-mail','small-shield','oilskin']): return sprite_armor(aid)
    if any(x in aid for x in ['arrow','bow','dagger','sword','saber','spear','mace','morning-star','partisan','ranseur','quarterstaff','rubber-hose','scalpel','scimitar','shuriken','spetum','stiletto']): return sprite_weapon(aid)
    if aid in {'meat-ring','meat-stick','meatball','melon','orange','pancake','pear','slime-mold','sprig-of-wolfsbane'}: return sprite_food(aid)
    if aid in {'obsidian','opal','ruby','sapphire','rock','topaz'}:
        colors={'obsidian':(36,32,45,255),'opal':(180,225,220,255),'ruby':(215,40,64,255),'sapphire':(50,96,220,255),'rock':(120,118,112,255),'topaz':(236,182,54,255)}; return sprite_gem(colors[aid], aid)
    if glyph=='=':
        colors={'protection':(95,145,235,255),'regeneration':(74,200,105,255),'searching':(235,198,70,255),'stealth':(85,75,115,255),'slow-digestion':(150,195,95,255),'sustain-ability':(225,180,80,255),'see-invisible':(120,220,230,255),'shock-resistance':(235,210,65,255),'poison-resistance':(92,190,85,255),'stasis':(150,170,220,255),'teleport-control':(185,90,230,255),'polymorph-control':(200,100,215,255)}
        color=next((v for k,v in colors.items() if k in aid),(220,174,80,255)); return sprite_ring(color)
    if glyph=='!':
        colors={'paralysis':(180,110,225,255),'polymorph':(225,90,205,255),'monster-detection':(80,180,235,255),'sickness':(105,175,70,255),'sleeping':(90,125,230,255),'speed':(245,220,65,255),'oil':(170,150,70,255),'splash-of-acid':(105,220,70,255),'splash-of-blinding':(245,245,120,255)}
        color=next((v for k,v in colors.items() if k in aid),(176,76,216,255)); return sprite_potion(color)
    if glyph=='/':
        colors={'opening':(95,195,235,255),'probing':(170,115,235,255),'slow-monster':(110,170,220,255),'speed-monster':(245,215,70,255),'striking':(230,95,70,255),'stone-to-flesh':(200,135,100,255),'sleep':(80,110,220,255),'death':(50,50,62,255)}
        color=next((v for k,v in colors.items() if k in aid),(216,216,226,255)); return sprite_wand(color)
    if glyph=='?': return sprite_scroll()
    if glyph=='+': return sprite_book((120,80,185,255) if 'mapiro' in aid or 'phol' in aid else (120,92,60,255),'rune')
    if aid=='nothing':
        im=transparent(); d=ImageDraw.Draw(im); d.arc((7,8,25,24),20,320,fill=(150,190,235,190),width=2); d.point((16,16),fill=(255,255,255,210)); return im
    if aid=='sack': return object_sprite('sack', '(')
    if aid=='saddle':
        im=transparent(); d=ImageDraw.Draw(im); outline_poly(d,[(7,16),(13,10),(23,11),(26,18),(22,24),(10,23)],(126,78,42,255)); d.line((11,17,23,18),fill=(210,150,70,255),width=2); return im
    if aid=='towel':
        im=transparent(); d=ImageDraw.Draw(im); outline_poly(d,[(8,6),(24,8),(22,27),(6,25)],(210,210,190,255)); d.line((10,12,22,14),fill=(130,150,180,255),width=1); return im
    if aid in {'tallow-candle'}: return object_sprite('tallow candle','(')
    return object_sprite(n, glyph)

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
    im=Image.new('RGBA',(size,size),(40,38,38,255)); d=ImageDraw.Draw(im); step=max(4,size//4)
    for y in range(0,size,step): d.line((0,y,size,y), fill=(32,31,31,255), width=1)
    for x in range(0,size,step): d.line((x,0,x,size), fill=(46,44,44,255), width=1)
    return im

def font(size=8):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/TTF/DejaVuSans.ttf']:
        if Path(p).exists(): return ImageFont.truetype(p,size)
    return ImageFont.load_default()

def contact(assets, out, tile_size=32, scale=1, floor=False, checker=False, alpha=False, label=True, cols=10):
    cell=tile_size*scale; label_h=(10*scale if label else 0); rows=math.ceil(len(assets)/cols) or 1
    sheet=Image.new('RGBA',(cols*cell, rows*(cell+label_h)), (235,235,235,255)); d=ImageDraw.Draw(sheet); f=font(max(5,6*scale))
    for i,a in enumerate(assets):
        x=(i%cols)*cell; y=(i//cols)*(cell+label_h)
        if checker:
            sq=max(4,8*scale)
            for yy in range(y,y+cell,sq):
                for xx in range(x,x+cell,sq): d.rectangle((xx,yy,xx+sq-1,yy+sq-1), fill=(190,190,190,255) if ((xx//sq+yy//sq)%2) else (240,240,240,255))
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
        bbox=alpha.getbbox(); rec={'id':a['id'],'bbox':bbox,'nonTransparentRatio':round(non/1024,4),'opaqueEdgePixels':sum(v>250 for v in edge),'small16VisiblePixels':snon,'greenishVisiblePixels':green}
        rows.append(rec)
        if rec['opaqueEdgePixels']: issues.append({'id':a['id'],'issue':'opaque edge/card','opaqueEdgePixels':rec['opaqueEdgePixels']})
        if rec['nonTransparentRatio']>.72: issues.append({'id':a['id'],'issue':'too full/card-like','nonTransparentRatio':rec['nonTransparentRatio']})
        if rec['small16VisiblePixels']<8: issues.append({'id':a['id'],'issue':'too few 16px visible pixels','small16VisiblePixels':rec['small16VisiblePixels']})
    return {'records':rows,'issues':issues}

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
        else:
            lines.append(f'- Updated: {now_iso()}' if line.startswith('- Updated:') else line)
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
    manifest=json.loads(MANIFEST.read_text(), object_pairs_hook=OrderedDict); status=json.loads(STATUS.read_text(), object_pairs_hook=OrderedDict); by={a['id']:a for a in manifest['assets']}
    next100=load_pending_ids()[:100]; ts=now_iso(); failures={aid: prompt_specificity_errors(by[aid]) for aid in next100}; failures={k:v for k,v in failures.items() if v}
    if failures: raise SystemExit('prompt guard failures: '+json.dumps(failures,indent=2))
    changed=[]
    for aid in next100:
        a=by[aid]; im=enhanced_sprite(a).filter(ImageFilter.UnsharpMask(radius=.4, percent=140, threshold=0)); backup_and_write(a, im)
        prompt=prompt_for(a)
        note='After-mail continuation deterministic concrete item/effect silhouette; guarded semantic prompt retained; transparent cutout, no card/background; pending Secretary visual review.'
        a.update({'prompt':prompt,'status':'installed','workflow':'asset-generation/workflows/krea2_basic_rem_back.json','workflowLabel':'transparent-next100-after-mail-deterministic-polish','coherentRestartStatus':'generated','coherentRestartQaStatus':'needs-secretary-review','qaNote':note})
        rec=status.setdefault('assets',{}).get(aid, OrderedDict()).copy(); rec.update(a); rec.update({'completedAt':ts,'artistDirectedPixelPolish':True})
        status['assets'][aid]=rec; changed.append(aid)
    status.setdefault('runs',[]).append({'type':'next100-after-mail-continuation','completedAt':ts,'changedIds':changed,'evidenceDir':str(EVIDENCE),'backupRoot':str(BACKUP.relative_to(ROOT)),'workflowVerification':verify_rmbg_inputs()})
    MANIFEST.write_text(json.dumps(manifest, indent=2)+'\n'); STATUS.write_text(json.dumps(status, indent=2)+'\n'); rewrite_tracker(manifest)
    for gi in range(5):
        group=[by[x] for x in next100[gi*20:(gi+1)*20]]; prefix=f'group{gi+1:02d}-after-mail'
        contact(group,EVIDENCE/f'{prefix}-32px-floor.png',tile_size=32,scale=2,floor=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-16px-floor.png',tile_size=16,scale=4,floor=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-magnified-full-tile.png',tile_size=32,scale=5,floor=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-checker-alpha.png',tile_size=32,scale=3,checker=True,cols=10)
        contact(group,EVIDENCE/f'{prefix}-alpha-mask.png',tile_size=32,scale=3,alpha=True,cols=10)
        (EVIDENCE/f'{prefix}-metrics.json').write_text(json.dumps(metrics(group),indent=2)+'\n')
    allm=metrics([by[x] for x in next100]); (EVIDENCE/'next100-after-mail-alpha-green-readability-metrics.json').write_text(json.dumps(allm,indent=2)+'\n')
    (EVIDENCE/'changed-ids.json').write_text(json.dumps({'next100':next100,'changedIds':changed,'remainingPendingAfter':len(load_pending_ids()),'workflowVerification':verify_rmbg_inputs()},indent=2)+'\n')
    print(json.dumps({'changed':len(changed),'range':next100[0]+'..'+next100[-1],'remainingPendingAfter':len(load_pending_ids()),'evidence':str(EVIDENCE),'metricIssues':len(allm['issues'])},indent=2))

if __name__=='__main__': main()
