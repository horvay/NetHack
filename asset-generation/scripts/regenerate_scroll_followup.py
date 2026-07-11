#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, json, shutil, sys, time, hashlib
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'asset-generation/scripts/generate_assets.py'
spec=importlib.util.spec_from_file_location('basegen', BASE)
base=importlib.util.module_from_spec(spec); sys.modules[spec.name]=base; spec.loader.exec_module(base)  # type: ignore
base.WORKFLOW_PATH=(ROOT/'asset-generation/workflows/krea2_basic_rem-background.json').resolve()
EMAN=ROOT/'electron-poc/assets/tiles/manifest.json'
STATUS=ROOT/'asset-generation/manifests/generation-status.json'
PROV=ROOT/'asset-generation/manifests/scroll-followup-provenance.json'
BACKUP=ROOT/'asset-generation/backups/scroll-followup-before-20260701T000000Z'

TARGETS={
 'food-detection': ('scroll of food detection: an unmistakable fantasy parchment scroll unrolled diagonally with curled top and bottom ends, warm cream parchment, tan shadows, tiny red apple and bread icon rune, amber crumb sparkles, red wax seal, brown wooden rods, gold edge highlights, soft green divination glow'),
 'punishment': ('scroll of punishment: unmistakable fantasy parchment scroll with curled ends, iron ball-and-chain rune, warm cream parchment, tan shadows, red wax seal, brown rods, gold edge highlights, crimson curse sparks'),
 'read-me': ('mysterious READ ME scroll: unmistakable fantasy parchment scroll with curled ends, simple dark ink horizontal marks not readable letters, warm cream parchment, tan shadows, red wax seal, brown rods, gold edge highlights, blue magical glint'),
 'remove-curse': ('scroll of remove curse: unmistakable fantasy parchment scroll with curled ends, broken black curse shackle rune, warm cream parchment, tan shadows, red wax seal, brown rods, gold edge highlights, pale blue cleansing glow'),
 'taming': ('scroll of taming: unmistakable fantasy parchment scroll with curled ends, tiny green paw and heart rune, warm cream parchment, tan shadows, red wax seal, brown rods, gold edge highlights, emerald charm glow'),
 'teleport-away': ('scroll of teleport away: unmistakable fantasy parchment scroll with curled ends, violet outward arrow spiral rune, warm cream parchment, tan shadows, red wax seal, brown rods, gold edge highlights, cyan teleport shimmer'),
 'teleport-control': ('scroll of teleport control: unmistakable fantasy parchment scroll with curled ends, purple anchor inside spiral rune, warm cream parchment, tan shadows, red wax seal, brown rods, gold edge highlights, magenta-cyan magic rim light'),
 'teleportation': ('scroll of teleportation: unmistakable fantasy parchment scroll with curled ends, bright cyan portal spiral rune, warm cream parchment, tan shadows, red wax seal, brown rods, gold edge highlights, violet teleport glow'),
 'temov': ('mysterious TEMOV scroll: unmistakable fantasy parchment scroll with curled ends, abstract orange diamond rune marks not readable letters, warm cream parchment, tan shadows, red wax seal, brown rods, gold edge highlights, amber magic sparkles'),
 'zlorfik': ('mysterious ZLORFIK scroll: unmistakable fantasy parchment scroll with curled ends, abstract magenta star rune marks not readable letters, warm cream parchment, tan shadows, red wax seal, brown rods, gold edge highlights, pink-violet magic glow'),
}
SEEDS={k: 2701070100+i*97 for i,k in enumerate(TARGETS)}
STYLE='A concept pixel art image in the style of a fantasy game asset of '
SUFFIX='. on a solid green background. Isolated transparent cutout sprite for a cohesive fantasy roguelike tileset, bold centered silhouette, clearly rolled parchment/scroll silhouette, readable at 32px and 16px, high contrast on a dark dungeon floor, compact subject occupying about 24 to 28 pixels, no text, no alphabet letters, no UI badge, no square card, no baked checkerboard, no fake transparency, no flat SVG/vector placeholder look.'

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def load_assets():
 data=json.load(open(EMAN)); return data

def write_assets(data): EMAN.write_text(json.dumps(data, indent=2))

def alpha_stats(p):
 im=Image.open(p).convert('RGBA')
 px=list(im.getdata()); w,h=im.size
 trans=sum(1 for *_,a in px if a==0); semi=sum(1 for *_,a in px if 0<a<255); opaque=sum(1 for *_,a in px if a==255)
 green=sum(1 for r,g,b,a in px if a>0 and g>150 and r<80 and b<120)
 return {'size':[w,h],'transparentPixels':trans,'semiTransparentPixels':semi,'opaquePixels':opaque,'greenishVisiblePixels':green}

def main(endpoint='http://127.0.0.1:8188'):
 stats=base.check_comfy(endpoint)
 model_details={'endpoint':endpoint,'comfyui_version':stats.get('system',{}).get('comfyui_version','unknown'),'workflow':'asset-generation/workflows/krea2_basic_rem-background.json','rmbgModel':'RMBG-2.0','rmbgBackground':'Alpha'}
 data=load_assets(); assets=data['assets']
 status=json.load(open(STATUS)) if STATUS.exists() else {'assets':{},'runs':[]}
 prov=[]; BACKUP.mkdir(parents=True,exist_ok=True)
 for aid,subject in TARGETS.items():
  a=next(x for x in assets if x['id']==aid)
  oldp=ROOT/a['installedPath']; outp=ROOT/a['outputPath']
  for p in [oldp,outp]:
   if p.exists():
    rel=p.relative_to(ROOT); bp=BACKUP/rel; bp.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,bp)
  prompt=STYLE+subject+SUFFIX
  asset=base.Asset(aid,a['name'],a['category'],a['categorySlug'],a['priority'],a['glyph'],a['why'],a.get('artDirection',''),a.get('renderingNotes',''),prompt)
  seed=SEEDS[aid]
  print('generate',aid,seed)
  src=base.comfy_generate(endpoint, asset, seed=seed, timeout=900)
  base.install_asset(src, asset)
  rec={**a, 'prompt':prompt, 'outputPath':asset.outputPath, 'installedPath':asset.installedPath, 'status':'installed', 'workflow':model_details['workflow'], 'workflowLabel':'transparent-scroll-followup-regeneration', 'completedAt':time.strftime('%FT%TZ', time.gmtime()), 'scrollFollowup':True, 'seed':seed, 'modelDetails':model_details, 'alphaStats':alpha_stats(ROOT/asset.installedPath), 'sha256':sha(ROOT/asset.installedPath), 'qaNote':'Regenerated in scroll follow-up because prior asset did not clearly read as a fantasy scroll/parchment.'}
  idx=assets.index(a); assets[idx]=rec; status.setdefault('assets',{})[aid]=rec; prov.append(rec)
  write_assets(data); STATUS.write_text(json.dumps(status,indent=2)); PROV.write_text(json.dumps({'generatedAt':time.strftime('%FT%TZ', time.gmtime()),'modelDetails':model_details,'assets':prov},indent=2))
 print('done')
if __name__=='__main__': main(*(sys.argv[1:] or []))
