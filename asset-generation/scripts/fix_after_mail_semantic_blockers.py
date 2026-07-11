#!/usr/bin/env python3
from __future__ import annotations
import json, re, sys, shutil
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[2]
EVIDENCE=Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-nu-carving-violin-80/next100-after-mail-review')
BACKUP=ROOT/'asset-generation/backups'/('next100-after-mail-semantic-fix-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
MANIFEST=ROOT/'electron-poc/assets/tiles/manifest.json'; STATUS=ROOT/'asset-generation/manifests/generation-status.json'; TRACKER=ROOT/'asset-generation/manifests/full-regeneration-tracker.md'
sys.path.insert(0,str(ROOT/'asset-generation/scripts'))
import continue_next100_after_mail as base
from full_tileset_regenerate import prompt_for, prompt_specificity_errors, verify_rmbg_inputs

def T(): return Image.new('RGBA',(32,32),(0,0,0,0))
def sh(c,d): return tuple(max(0,min(255,x+d)) for x in c[:3])+(255,)
def op(d,pts,fill,out=(20,20,24,235)):
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.polygon([(x+dx,y+dy) for x,y in pts], fill=out)
    d.polygon(pts, fill=fill)
def ol(d,pts,fill,w=3,out=(20,20,24,235)):
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.line([(x+dx,y+dy) for x,y in pts], fill=out, width=w+2, joint='curve')
    d.line(pts, fill=fill, width=w, joint='curve')
def oe(d,box,fill,out=(20,20,24,235)):
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.ellipse(tuple(v+(dx if i%2==0 else dy) for i,v in enumerate(box)), fill=out)
    d.ellipse(box, fill=fill)

def human_invisible():
    im=T(); d=ImageDraw.Draw(im); c=(120,210,235,150)
    oe(d,(12,4,20,12),c); op(d,[(11,13),(21,13),(23,25),(9,25)],c); d.line((8,11,4,7),fill=(230,245,255,210),width=1); d.line((24,8,28,4),fill=(230,245,255,210),width=1); d.point((5,20),fill=(255,255,255,220)); d.point((27,18),fill=(255,255,255,220)); return im

def spell_book(color=(110,70,180,255)):
    im=T(); d=ImageDraw.Draw(im); d.rounded_rectangle((6,5,25,28),2,fill=(24,20,28,235)); d.rounded_rectangle((8,6,23,27),2,fill=color); d.line((12,7,12,26),fill=sh(color,-60),width=2); d.arc((14,12,22,22),20,320,fill=(245,220,80,255),width=2); d.point((18,17),fill=(255,255,255,255)); return im

def lamp():
    im=T(); d=ImageDraw.Draw(im); op(d,[(10,14),(22,14),(24,25),(8,25)],(155,120,55,255)); d.arc((10,4,22,17),180,360,fill=(225,185,70,255),width=3); d.ellipse((13,15,19,22),fill=(255,225,90,240)); d.rectangle((13,10,19,15),fill=(80,75,65,255)); return im

def oil_drop():
    im=T(); d=ImageDraw.Draw(im); op(d,[(16,4),(23,15),(22,23),(16,28),(10,23),(9,15)],(45,45,55,255)); d.arc((12,10,20,22),110,250,fill=(155,150,100,255),width=2); return im

def ring(color, emblem=None):
    im=base.sprite_ring(color); d=ImageDraw.Draw(im)
    if emblem=='shield': op(d,[(16,7),(21,11),(19,18),(16,21),(13,18),(11,11)],(120,190,255,255))
    if emblem=='beast': d.ellipse((12,9,20,17),fill=(120,90,160,255)); d.polygon([(13,10),(11,6),(16,10)],fill=(120,90,160,255)); d.polygon([(19,10),(21,6),(16,10)],fill=(120,90,160,255))
    if emblem=='eye': d.ellipse((11,12,21,18),fill=(220,245,255,255)); d.ellipse((15,13,18,17),fill=(30,60,120,255))
    if emblem=='bolt': d.polygon([(17,7),(12,17),(17,16),(14,25),(23,13),(18,14)],fill=(255,245,80,255))
    if emblem=='leaf': d.ellipse((11,12,18,21),fill=(95,210,105,255)); d.ellipse((17,9,23,18),fill=(95,210,105,255))
    return im

def scroll(mark='lines', color=(226,202,108,255)):
    im=base.sprite_scroll(color); d=ImageDraw.Draw(im)
    if mark=='skull': d.ellipse((13,12,19,18),fill=(80,70,55,255)); d.rectangle((14,17,18,21),fill=(80,70,55,255)); d.point((15,15),fill=color); d.point((18,15),fill=color)
    elif mark=='door': d.rectangle((13,10,20,22),outline=(90,65,40,255),width=2); d.point((18,16),fill=(90,65,40,255))
    elif mark=='curse': d.line((13,12,20,19),fill=(90,45,80,255),width=2); d.line((20,12,13,19),fill=(90,45,80,255),width=2)
    elif mark=='read': d.line((12,12,21,12),fill=(80,55,35,255),width=1); d.line((12,15,21,15),fill=(80,55,35,255),width=1); d.line((12,18,19,18),fill=(80,55,35,255),width=1)
    return im

def armor(kind):
    im=T(); d=ImageDraw.Draw(im); c={'chain':(85,125,86,255),'ring':(82,118,86,255),'plate':(175,184,194,255),'splint':(150,164,178,255),'robe':(95,75,145,255),'dragon-orange':(224,106,40,255),'dragon-red':(210,45,45,255),'dragon-silver':(200,214,224,255),'dragon-shimmer':(170,150,235,255)}.get(kind,(160,170,180,255))
    if kind=='robe': op(d,[(16,4),(23,12),(25,28),(7,28),(9,12)],c); d.line((16,7,16,27),fill=sh(c,-50),width=2); d.line((10,13,22,13),fill=sh(c,35),width=1)
    else:
        op(d,[(11,5),(21,5),(25,14),(22,28),(10,28),(7,14)],c); d.line((10,15,23,15),fill=sh(c,-55),width=2)
        if kind=='chain':
            for x in [12,16,20]:
              for y in [11,18,23]: d.ellipse((x-2,y-2,x+2,y+2),outline=(210,215,200,255),width=1)
        elif kind=='ring':
            for x in [11,17]:
              for y in [11,18,24]: d.ellipse((x-2,y-2,x+3,y+3),outline=(220,225,210,255),width=1)
        elif kind=='splint':
            for x in [12,16,20]: d.line((x,8,x,27),fill=(220,225,230,255),width=1)
        elif kind.startswith('dragon'):
            for y in [11,16,21]: d.arc((10,y-4,22,y+8),0,180,fill=sh(c,45),width=2)
        else: d.line((13,9,19,9),fill=sh(c,45),width=2)
    return im

def shield(color=(150,165,180,255), emblem=None):
    im=T(); d=ImageDraw.Draw(im); op(d,[(16,4),(25,10),(22,24),(16,29),(10,24),(7,10)],color); d.line((16,7,16,25),fill=sh(color,-55),width=2)
    if emblem=='drain': d.polygon([(16,10),(20,17),(16,24),(12,17)],fill=(100,50,150,255))
    elif emblem=='shock': d.polygon([(17,8),(12,18),(17,17),(14,25),(23,13),(18,14)],fill=(250,235,70,255))
    elif emblem=='reflect': d.ellipse((12,10,20,18),fill=(235,245,255,230))
    return im

def weapon(kind):
    im=T(); d=ImageDraw.Draw(im); steel=(205,210,215,255); wood=(135,82,45,255)
    if kind=='staff': ol(d,[(9,27),(23,5)],wood,4); d.ellipse((21,4,25,8),fill=(100,210,180,255))
    elif kind=='hose': ol(d,[(7,22),(11,14),(18,14),(24,8)],(45,45,52,255),5); d.ellipse((22,6,28,12),outline=(95,95,105,255),width=2)
    elif kind=='mace': ol(d,[(9,26),(18,14)],wood,3); oe(d,(18,7,27,16),steel); d.line((20,9,25,14),fill=sh(steel,-60),width=1)
    elif kind=='saber': ol(d,[(8,26),(23,7)],steel,3); d.arc((8,6,26,28),-80,35,fill=(235,235,230,255),width=2); d.arc((5,19,14,28),180,360,fill=(230,190,80,255),width=2)
    elif kind=='dagger': ol(d,[(11,24),(21,8)],steel,3); op(d,[(20,7),(24,4),(23,10)],sh(steel,35)); d.line((9,23,13,27),fill=(110,70,42,255),width=3)
    elif kind=='stiletto': ol(d,[(10,26),(23,5)],(230,235,240,255),2); d.line((8,24,13,27),fill=(80,50,45,255),width=3)
    elif kind=='shortsword': ol(d,[(9,26),(23,6)],steel,4); op(d,[(21,5),(26,3),(24,10)],sh(steel,30)); d.line((7,22,13,28),fill=(120,80,45,255),width=2)
    elif kind=='scalpel': ol(d,[(8,25),(22,8)],steel,2); d.line((7,25,12,20),fill=(95,80,65,255),width=4)
    else: return base.sprite_weapon(kind)
    return im

def gem(kind):
    im=T(); d=ImageDraw.Draw(im); colors={'ruby':(215,34,62,255),'sapphire':(45,92,220,255),'obsidian':(35,32,48,255),'rock':(120,116,105,255)}; c=colors[kind]
    if kind=='rock': op(d,[(8,14),(14,8),(23,10),(27,19),(20,26),(10,24),(5,18)],c); d.line((10,16,20,12),fill=sh(c,35),width=1)
    else: op(d,[(16,5),(25,12),(22,23),(16,28),(9,23),(7,12)],c); d.line((16,5,16,27),fill=sh(c,-45),width=1); d.line((8,12,24,12),fill=sh(c,55),width=1); d.polygon([(12,10),(16,6),(20,10),(16,14)],fill=sh(c,70))
    return im

def splash(color, blind=False):
    im=T(); d=ImageDraw.Draw(im); pts=[(5,18),(10,14),(9,7),(15,12),(20,5),(21,13),(28,11),(23,17),(27,24),(19,22),(15,29),(13,22),(6,25)]
    op(d,pts,color)
    if blind: d.line((9,16,24,16),fill=(255,255,230,255),width=2); d.line((16,9,16,24),fill=(255,255,230,255),width=2)
    else: d.ellipse((12,14,18,20),fill=sh(color,45)); d.ellipse((22,20,26,24),fill=sh(color,50))
    return im

def boots_speed():
    im=T(); d=ImageDraw.Draw(im); c=(90,125,220,255); d.rounded_rectangle((5,17,14,25),2,fill=(20,20,26,235)); d.rounded_rectangle((18,17,27,25),2,fill=(20,20,26,235)); d.rounded_rectangle((6,16,14,24),2,fill=c); d.rounded_rectangle((18,16,26,24),2,fill=c); op(d,[(12,15),(4,10),(10,20)],(235,235,230,255)); op(d,[(24,15),(16,10),(22,20)],(235,235,230,255)); return im

def bag():
    im=T(); d=ImageDraw.Draw(im); c=(145,92,45,255); op(d,[(10,12),(22,12),(26,27),(6,27)],c); d.arc((11,5,21,17),180,360,fill=sh(c,30),width=2); d.line((11,13,21,13),fill=sh(c,-45),width=2); return im

def door_eye():
    im=T(); d=ImageDraw.Draw(im); d.rectangle((8,7,24,27),fill=(35,24,20,230)); d.rectangle((10,9,22,27),fill=(120,75,45,255)); d.point((20,18),fill=(230,190,70,255)); d.ellipse((11,11,21,17),fill=(220,245,255,255)); d.ellipse((15,12,18,16),fill=(40,60,120,255)); return im

def hourglass():
    im=T(); d=ImageDraw.Draw(im); op(d,[(9,5),(23,5),(18,16),(23,27),(9,27),(14,16)],(130,170,220,255)); d.polygon([(12,8),(20,8),(17,14),(15,14)],fill=(235,210,95,255)); d.polygon([(15,18),(17,18),(20,24),(12,24)],fill=(235,210,95,255)); return im

SPECIAL={
 'make-invisible':human_invisible,'mapiro-mahama-diromat':lambda:spell_book((115,70,180,255)),'oil':oil_drop,'oil-lamp':lamp,
 'protection':lambda:ring((95,145,235,255),'shield'),'protection-from-shape-changers':lambda:ring((120,90,180,255),'beast'),'see-invisible':lambda:ring((120,220,230,255),'eye'),'shock-resistance':lambda:ring((235,210,65,255),'bolt'),'poison-resistance':lambda:ring((92,190,85,255),'leaf'),
 'punishment':lambda:scroll('skull'),'read-me':lambda:scroll('read'),'remove-curse':lambda:scroll('curse'),'teleportation':lambda:scroll('door'),'scare-monster':lambda:scroll('skull',(210,170,90,255)),'secret-door-detection':door_eye,'stasis':hourglass,
 'orcish-chain-mail':lambda:armor('chain'),'orcish-ring-mail':lambda:armor('ring'),'plate-mail':lambda:armor('plate'),'splint-mail':lambda:armor('splint'),'robe':lambda:armor('robe'),'red-dragon-scale-mail':lambda:armor('dragon-red'),'orange-dragon-scale-mail':lambda:armor('dragon-orange'),'silver-dragon-scale-mail':lambda:armor('dragon-silver'),'shimmering-dragon-scale-mail':lambda:armor('dragon-shimmer'),
 'shield-of-drain-resistance':lambda:shield((145,125,180,255),'drain'),'shield-of-shock-resistance':lambda:shield((180,170,90,255),'shock'),'shield-of-reflection':lambda:shield((190,205,220,255),'reflect'),'small-shield':lambda:shield((145,155,165,255),None),
 'quarterstaff':lambda:weapon('staff'),'rubber-hose':lambda:weapon('hose'),'silver-mace':lambda:weapon('mace'),'silver-saber':lambda:weapon('saber'),'orcish-dagger':lambda:weapon('dagger'),'silver-dagger':lambda:weapon('dagger'),'stiletto':lambda:weapon('stiletto'),'short-sword':lambda:weapon('shortsword'),'orcish-short-sword':lambda:weapon('shortsword'),'scalpel':lambda:weapon('scalpel'),
 'ruby':lambda:gem('ruby'),'sapphire':lambda:gem('sapphire'),'obsidian':lambda:gem('obsidian'),'rock':lambda:gem('rock'),'sack':bag,'speed-boots':boots_speed,'splash-of-acid-venom':lambda:splash((105,220,70,255),False),'splash-of-blinding-venom':lambda:splash((245,245,100,255),True),
 'nothing':lambda:(lambda im: (ImageDraw.Draw(im).arc((8,8,24,24),20,320,fill=(170,205,245,190),width=2), im)[1])(T()),
}

def backup_and_write(a, im):
    for key in ['installedPath','outputPath']:
        p=ROOT/a[key]
        if p.exists():
            b=BACKUP/p.relative_to(ROOT); b.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,b)
        p.parent.mkdir(parents=True,exist_ok=True); im.save(p)

def main():
    manifest=json.loads(MANIFEST.read_text(), object_pairs_hook=OrderedDict); status=json.loads(STATUS.read_text(), object_pairs_hook=OrderedDict); assets=manifest['assets']; by={a['id']:a for a in assets}
    changed=json.load(open(EVIDENCE/'changed-ids.json'))['next100']; fixed=[]; ts=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    for aid in changed:
        a=by[aid]
        if aid in SPECIAL:
            im=SPECIAL[aid]().filter(ImageFilter.UnsharpMask(radius=.4,percent=140,threshold=0)); backup_and_write(a,im); fixed.append(aid)
            a['qaNote']='Semantic cleanup after independent critique: distinctive concrete silhouette/color; transparent cutout, no card/green matte; pending Secretary review.'
        if prompt_specificity_errors(a): raise SystemExit(f'prompt guard failure {aid}: {prompt_specificity_errors(a)}')
        a.update({'prompt':prompt_for(a),'status':'installed','workflow':'asset-generation/workflows/krea2_basic_rem_back.json','workflowLabel':'transparent-next100-after-mail-semantic-cleanup','coherentRestartStatus':'generated','coherentRestartQaStatus':'needs-secretary-review'})
        rec=status.setdefault('assets',{}).get(aid, OrderedDict()).copy(); rec.update(a); rec.update({'completedAt':ts,'artistDirectedPixelPolish':True}); status['assets'][aid]=rec
    status.setdefault('runs',[]).append({'type':'next100-after-mail-semantic-cleanup','completedAt':ts,'fixedIds':fixed,'evidenceDir':str(EVIDENCE),'backupRoot':str(BACKUP.relative_to(ROOT)),'workflowVerification':verify_rmbg_inputs()})
    MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n'); STATUS.write_text(json.dumps(status,indent=2)+'\n'); base.rewrite_tracker(manifest)
    # repair tracker from status with exact remaining pending count
    import subprocess; subprocess.run(['python3','-c',"import json,re,sys; from pathlib import Path; sys.path.insert(0,'asset-generation/scripts'); from full_tileset_regenerate import expected_transparent; from collections import Counter; from datetime import datetime,timezone; T=Path('asset-generation/manifests/full-regeneration-tracker.md'); m=json.load(open('electron-poc/assets/tiles/manifest.json'))['assets']; s=json.load(open('asset-generation/manifests/generation-status.json'))['assets']; by={a['id']:a for a in m}; counts=Counter(); lines=[]\nfor line in T.read_text().splitlines():\n import re\n mm=re.match(r'\\| `([^`]+)` \\| ([^|]+) \\| ([^|]+) \\| ([^|]+) \\| ([^|]+) \\| (.*)\\|',line)\n if mm and mm.group(1) in by:\n  aid=mm.group(1); a=by[aid]; rec=s.get(aid,{}); wf=rec.get('coherentRestartWorkflow') or a.get('coherentRestartWorkflow') or ('transparent' if expected_transparent(a) else 'non-transparent'); gen=rec.get('coherentRestartStatus') or a.get('coherentRestartStatus') or 'pending'; qa=rec.get('coherentRestartQaStatus') or a.get('coherentRestartQaStatus') or 'pending'; notes=(rec.get('qaNote') or a.get('qaNote') or rec.get('renderingNotes') or a.get('renderingNotes') or '').replace('|','/'); lines.append(f'| `{aid}` | {a.get(\"categorySlug\",mm.group(2).strip())} | {wf} | {gen} | {qa} | {notes} |'); counts[(wf,gen,qa)]+=1\n else: lines.append('- Updated: '+datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z') if line.startswith('- Updated:') else line)\nout=[]; inc=False\nfor line in lines:\n if line.strip()=='## Counts': out.append(line); out.append(''); [out.append(f'- {k}: {v}') for k,v in sorted(counts.items())]; inc=True; continue\n if inc:\n  if line.strip()=='## Assets': inc=False; out.append(''); out.append(line)\n  continue\n out.append(line)\nT.write_text('\\n'.join(out)+'\\n')\n"],check=True)
    # Rewrite evidence for all five groups.
    for gi in range(5):
        group=[by[x] for x in changed[gi*20:(gi+1)*20]]; prefix=f'group{gi+1:02d}-after-mail'
        base.contact(group,EVIDENCE/f'{prefix}-32px-floor.png',tile_size=32,scale=2,floor=True,cols=10)
        base.contact(group,EVIDENCE/f'{prefix}-16px-floor.png',tile_size=16,scale=4,floor=True,cols=10)
        base.contact(group,EVIDENCE/f'{prefix}-magnified-full-tile.png',tile_size=32,scale=5,floor=True,cols=10)
        base.contact(group,EVIDENCE/f'{prefix}-checker-alpha.png',tile_size=32,scale=3,checker=True,cols=10)
        base.contact(group,EVIDENCE/f'{prefix}-alpha-mask.png',tile_size=32,scale=3,alpha=True,cols=10)
        (EVIDENCE/f'{prefix}-metrics.json').write_text(json.dumps(base.metrics(group),indent=2)+'\n')
    allm=base.metrics([by[x] for x in changed]); (EVIDENCE/'next100-after-mail-alpha-green-readability-metrics.json').write_text(json.dumps(allm,indent=2)+'\n')
    pending=[re.match(r'\| `([^`]+)`',l).group(1) for l in open(TRACKER) if '| transparent | pending | pending |' in l]
    (EVIDENCE/'changed-ids.json').write_text(json.dumps({'next100':changed,'changedIds':changed,'semanticCleanupFixedIds':fixed,'remainingPendingAfter':len(pending),'remainingPendingIds':pending,'workflowVerification':verify_rmbg_inputs()},indent=2)+'\n')
    print(json.dumps({'fixed':len(fixed),'remainingPendingAfter':len(pending),'metricIssues':len(allm['issues']),'fixedIds':fixed},indent=2))
if __name__=='__main__': main()
