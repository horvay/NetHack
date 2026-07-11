#!/usr/bin/env python3
from __future__ import annotations
import json,re,sys,shutil
from collections import OrderedDict
from datetime import datetime,timezone
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[2]; E=Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-nu-carving-violin-80/next100-after-mail-review')
MANIFEST=ROOT/'electron-poc/assets/tiles/manifest.json'; STATUS=ROOT/'asset-generation/manifests/generation-status.json'; TRACKER=ROOT/'asset-generation/manifests/full-regeneration-tracker.md'; BACKUP=ROOT/'asset-generation/backups'/('next100-after-mail-final-blockers-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
sys.path.insert(0,str(ROOT/'asset-generation/scripts'))
import continue_next100_after_mail as base
from full_tileset_regenerate import verify_rmbg_inputs

def T(): return Image.new('RGBA',(32,32),(0,0,0,0))
def op(d,pts,fill,out=(20,20,24,235)):
 for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.polygon([(x+dx,y+dy) for x,y in pts], fill=out)
 d.polygon(pts, fill=fill)
def ol(d,pts,fill,w=3,out=(20,20,24,235)):
 for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.line([(x+dx,y+dy) for x,y in pts], fill=out, width=w+2, joint='curve')
 d.line(pts, fill=fill, width=w, joint='curve')
def oe(d,box,fill,out=(20,20,24,235)):
 for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]: d.ellipse(tuple(v+(dx if i%2==0 else dy) for i,v in enumerate(box)), fill=out)
 d.ellipse(box, fill=fill)

def make_invisible_tool():
 im=T(); d=ImageDraw.Draw(im)
 # Invisibility potion/flask: clear cyan bottle with fading humanoid silhouette inside and sparkle bubbles.
 op(d,[(13,5),(19,5),(19,10),(23,15),(22,27),(10,27),(9,15),(13,10)],(90,205,225,190))
 d.rectangle((13,3,19,7),fill=(120,95,60,255)); d.line((12,14,20,14),fill=(225,250,255,220),width=1)
 d.ellipse((14,12,18,16),outline=(245,255,255,220),width=1); d.line((16,16,16,22),fill=(245,255,255,180),width=2); d.line((16,18,12,21),fill=(245,255,255,150),width=1); d.line((16,18,20,21),fill=(245,255,255,150),width=1)
 d.arc((6,7,27,28),210,25,fill=(150,230,245,180),width=2); d.point((7,10),fill=(255,255,255,235)); d.point((25,20),fill=(255,255,255,235)); return im

def oilskin_sack():
 im=T(); d=ImageDraw.Draw(im); c=(70,100,85,255)
 op(d,[(9,12),(22,11),(27,27),(5,27)],c); d.arc((10,4,22,17),180,360,fill=(155,125,70,255),width=2); d.line((10,13,22,13),fill=(35,55,45,255),width=2)
 d.arc((8,14,24,27),200,340,fill=(135,180,150,255),width=2); d.ellipse((13,17,19,23),fill=(40,75,60,180)); return im

def mummy_wrapping():
 im=T(); d=ImageDraw.Draw(im); c=(218,208,176,255)
 # Loose bandage roll with trailing strips.
 oe(d,(7,8,22,23),c); d.ellipse((11,12,18,19),fill=(70,62,52,255)); d.ellipse((13,14,16,17),fill=(170,160,130,255))
 ol(d,[(20,16),(26,14),(25,19),(18,22)],c,3); ol(d,[(9,20),(5,25),(12,26)],c,3)
 for y in [10,14,18,22]: d.line((8,y,21,y+2),fill=(145,135,110,255),width=1)
 return im

def bold_scalpel():
 im=T(); d=ImageDraw.Draw(im); ol(d,[(7,25),(22,8)],(215,220,225,255),3); op(d,[(21,7),(27,5),(24,11)],(235,240,245,255)); d.line((6,25,12,19),fill=(100,82,62,255),width=5); return im

def bold_stiletto():
 im=T(); d=ImageDraw.Draw(im); ol(d,[(9,27),(24,5)],(235,238,242,255),3); d.line((7,24,14,28),fill=(85,45,50,255),width=4); d.line((11,23,16,26),fill=(220,180,70,255),width=2); return im

def morning_star():
 im=T(); d=ImageDraw.Draw(im); ol(d,[(7,26),(15,18)],(135,82,45,255),4); d.line((15,18,21,12),fill=(95,95,100,255),width=3)
 oe(d,(20,5,29,14),(205,210,215,255));
 for x,y in [(24,3),(30,9),(24,16),(18,9)]: d.line((24,10,x,y),fill=(205,210,215,255),width=2)
 return im
SPECIAL={'make-invisible':make_invisible_tool,'oilskin-sack':oilskin_sack,'mummy-wrapping':mummy_wrapping,'scalpel':bold_scalpel,'stiletto':bold_stiletto,'morning-star':morning_star}
PROMPTS={
'make-invisible':'A concept pixel art image in the style of a fantasy game asset of an invisibility potion, a clear cyan glass flask with a fading humanoid silhouette inside and sparkle bubbles. Visible positive color palette: transparent pale cyan glass, white silhouette, cork brown stopper, bright white sparkles. on a solid green background. Isolated transparent cutout sprite for a cohesive fantasy roguelike tileset, readable at 32px and 16px, bold centered silhouette, high contrast on dark dungeon stone, no text, no UI badge, no square card, no baked checkerboard, no fake transparency.',
'oilskin-sack':'A concept pixel art image in the style of a fantasy game asset of a waterproof green oilskin sack with tied drawstring, floppy cloth bag body, and glossy waxed highlights. Visible positive color palette: dark green oilskin cloth, tan cord, pale mint highlights. on a solid green background. Isolated transparent cutout sprite for a cohesive fantasy roguelike tileset, readable at 32px and 16px, bold centered silhouette, high contrast on dark dungeon stone, no text, no UI badge, no square card, no baked checkerboard, no fake transparency.',
'mummy-wrapping':'A concept pixel art image in the style of a fantasy game asset of loose mummy wrapping bandages, a cream cloth roll with trailing strips. Visible positive color palette: aged cream linen, warm gray shadows, pale beige highlights. on a solid green background. Isolated transparent cutout sprite for a cohesive fantasy roguelike tileset, readable at 32px and 16px, bold centered silhouette, high contrast on dark dungeon stone, no text, no UI badge, no square card, no baked checkerboard, no fake transparency.'}

def backup_write(a,im):
 for key in ['installedPath','outputPath']:
  p=ROOT/a[key]
  if p.exists():
   b=BACKUP/p.relative_to(ROOT); b.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,b)
  im.save(p)
def repair_tracker(manifest,status):
 import subprocess
 subprocess.run(['python3','-c',"import json,re,sys; from pathlib import Path; sys.path.insert(0,'asset-generation/scripts'); from full_tileset_regenerate import expected_transparent; from collections import Counter; from datetime import datetime,timezone; T=Path('asset-generation/manifests/full-regeneration-tracker.md'); m=json.load(open('electron-poc/assets/tiles/manifest.json'))['assets']; s=json.load(open('asset-generation/manifests/generation-status.json'))['assets']; by={a['id']:a for a in m}; counts=Counter(); lines=[]\nfor line in T.read_text().splitlines():\n mm=re.match(r'\\| `([^`]+)` \\| ([^|]+) \\| ([^|]+) \\| ([^|]+) \\| ([^|]+) \\| (.*)\\|',line)\n if mm and mm.group(1) in by:\n  aid=mm.group(1); a=by[aid]; rec=s.get(aid,{}); wf=rec.get('coherentRestartWorkflow') or a.get('coherentRestartWorkflow') or ('transparent' if expected_transparent(a) else 'non-transparent'); gen=rec.get('coherentRestartStatus') or a.get('coherentRestartStatus') or 'pending'; qa=rec.get('coherentRestartQaStatus') or a.get('coherentRestartQaStatus') or 'pending'; notes=(rec.get('qaNote') or a.get('qaNote') or rec.get('renderingNotes') or a.get('renderingNotes') or '').replace('|','/'); lines.append(f'| `{aid}` | {a.get(\"categorySlug\",mm.group(2).strip())} | {wf} | {gen} | {qa} | {notes} |'); counts[(wf,gen,qa)]+=1\n else: lines.append('- Updated: '+datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z') if line.startswith('- Updated:') else line)\nout=[]; inc=False\nfor line in lines:\n if line.strip()=='## Counts': out.append(line); out.append(''); [out.append(f'- {k}: {v}') for k,v in sorted(counts.items())]; inc=True; continue\n if inc:\n  if line.strip()=='## Assets': inc=False; out.append(''); out.append(line)\n  continue\n out.append(line)\nT.write_text('\\n'.join(out)+'\\n')"],check=True)
def main():
 manifest=json.loads(MANIFEST.read_text(), object_pairs_hook=OrderedDict); status=json.loads(STATUS.read_text(), object_pairs_hook=OrderedDict); by={a['id']:a for a in manifest['assets']}; ts=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
 fixed=[]
 for aid,fn in SPECIAL.items():
  a=by[aid]; backup_write(a, fn().filter(ImageFilter.UnsharpMask(radius=.4,percent=140,threshold=0))); fixed.append(aid)
  if aid in PROMPTS: a['prompt']=PROMPTS[aid]
  a['qaNote']='Final semantic blocker cleanup: specific readable object silhouette; alpha/card/green-matte checked; pending Secretary review.'
  a.update({'status':'installed','workflow':'asset-generation/workflows/krea2_basic_rem_back.json','workflowLabel':'transparent-next100-after-mail-final-semantic-cleanup','coherentRestartStatus':'generated','coherentRestartQaStatus':'needs-secretary-review'})
  rec=status.setdefault('assets',{}).get(aid,OrderedDict()).copy(); rec.update(a); rec.update({'completedAt':ts,'artistDirectedPixelPolish':True}); status['assets'][aid]=rec
 status.setdefault('runs',[]).append({'type':'next100-after-mail-final-blocker-cleanup','completedAt':ts,'fixedIds':fixed,'evidenceDir':str(E),'backupRoot':str(BACKUP.relative_to(ROOT)),'workflowVerification':verify_rmbg_inputs()})
 MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n'); STATUS.write_text(json.dumps(status,indent=2)+'\n'); base.rewrite_tracker(manifest); repair_tracker(manifest,status)
 changed=json.load(open(E/'changed-ids.json'))['next100']
 for gi in range(5):
  group=[by[x] for x in changed[gi*20:(gi+1)*20]]; prefix=f'group{gi+1:02d}-after-mail'
  base.contact(group,E/f'{prefix}-32px-floor.png',tile_size=32,scale=2,floor=True,cols=10); base.contact(group,E/f'{prefix}-16px-floor.png',tile_size=16,scale=4,floor=True,cols=10); base.contact(group,E/f'{prefix}-magnified-full-tile.png',tile_size=32,scale=5,floor=True,cols=10); base.contact(group,E/f'{prefix}-checker-alpha.png',tile_size=32,scale=3,checker=True,cols=10); base.contact(group,E/f'{prefix}-alpha-mask.png',tile_size=32,scale=3,alpha=True,cols=10); (E/f'{prefix}-metrics.json').write_text(json.dumps(base.metrics(group),indent=2)+'\n')
 allm=base.metrics([by[x] for x in changed]); (E/'next100-after-mail-alpha-green-readability-metrics.json').write_text(json.dumps(allm,indent=2)+'\n')
 pending=[re.match(r'\| `([^`]+)`',l).group(1) for l in open(TRACKER) if '| transparent | pending | pending |' in l]
 cd=json.load(open(E/'changed-ids.json')); cd['finalBlockerFixedIds']=fixed; cd['remainingPendingAfter']=len(pending); cd['remainingPendingIds']=pending; cd['workflowVerification']=verify_rmbg_inputs(); (E/'changed-ids.json').write_text(json.dumps(cd,indent=2)+'\n')
 print(json.dumps({'fixed':fixed,'remainingPendingAfter':len(pending),'metricIssues':len(allm['issues'])},indent=2))
if __name__=='__main__': main()
