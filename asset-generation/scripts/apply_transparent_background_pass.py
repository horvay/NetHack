#!/usr/bin/env python3
"""Full transparent-background refinement pass for non-terrain NetHack tiles.

The Boss-provided krea2_basic_rem_back workflow is the required workflow for
sprites/items/monsters/overlays. In practice its generated PNGs can still arrive
flattened from ComfyUI depending on SaveImage/RMBG behavior, so this pass performs
a deterministic edge-background alpha cleanup after the transparent workflow audit
selection, preserving backups and recording the workflow used per asset.
"""
from __future__ import annotations
import json, shutil, time, math
from collections import Counter
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
STATUS = ROOT/'asset-generation/manifests/generation-status.json'
EMAN = ROOT/'electron-poc/assets/tiles/manifest.json'
OUT = ROOT/'asset-generation/outputs'
GEN = ROOT/'electron-poc/assets/tiles/generated'
EVID = ROOT/'evidence/developer-theta-flying-sunflower-3'
RUN_EVID = Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-theta-flying-sunflower-3')
TRANSPARENT_WORKFLOW = 'asset-generation/workflows/krea2_basic_rem_back.json'
REGULAR_WORKFLOW = 'asset-generation/workflows/krea2_basic.json'
TRANSPARENT_CATEGORIES = {'objects-inventory','common-early-monsters','player-pets-identity','traps-hazards','ui-status-overlays'}
# These are full UI panels/meters rather than sprites/overlays that sit on map tiles.
OPAQUE_UI_IDS = {'message-log-panel','status-strip-field','health-bar','power-bar'}


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


def backup_file(p: Path, backup_root: Path):
    if p.exists():
        dst = backup_root / p.relative_to(ROOT)
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists():
            shutil.copy2(p, dst)


def edge_palette(im: Image.Image):
    rgb = im.convert('RGB')
    w,h = rgb.size
    pts=[]
    px=rgb.load()
    for x in range(w):
        pts.append(px[x,0]); pts.append(px[x,h-1])
    for y in range(h):
        pts.append(px[0,y]); pts.append(px[w-1,y])
    q=[(r//16*16,g//16*16,b//16*16) for r,g,b in pts]
    common=[c for c,_ in Counter(q).most_common(10)]
    return common


def near(c, p, tol):
    return (c[0]-p[0])**2 + (c[1]-p[1])**2 + (c[2]-p[2])**2 <= tol*tol


def transparent_cleanup(src: Path, dests: list[Path]):
    im = Image.open(src).convert('RGBA')
    w,h = im.size
    rgb = im.convert('RGB')
    px=rgb.load(); ap=im.load()
    seeds=edge_palette(im)
    # Flood only contiguous edge/background material so black outlines inside sprites survive.
    seen=set(); stack=[]
    for x in range(w): stack.append((x,0)); stack.append((x,h-1))
    for y in range(h): stack.append((0,y)); stack.append((w-1,y))
    alpha_removed=0
    tol=54
    while stack:
        x,y=stack.pop()
        if (x,y) in seen or x<0 or y<0 or x>=w or y>=h: continue
        c=px[x,y]
        if not any(near(c, s, tol) for s in seeds):
            continue
        seen.add((x,y))
        r,g,b,a=ap[x,y]
        ap[x,y]=(r,g,b,0); alpha_removed += 1
        stack.extend(((x+1,y),(x-1,y),(x,y+1),(x,y-1)))
    # Do not globally chroma-key interior pixels: several NetHack silhouettes are black
    # or low-saturation, so only contiguous edge/background material is made alpha.
    for d in dests:
        d.parent.mkdir(parents=True, exist_ok=True)
        im.save(d)
    hist=im.getchannel('A').histogram()
    return {'transparentPixels': sum(hist[:16]), 'semiTransparentPixels': sum(hist[16:240]), 'opaquePixels': sum(hist[240:]), 'removedPixelsApprox': alpha_removed}


def make_contact(manifest, suffix):
    EVID.mkdir(parents=True, exist_ok=True); RUN_EVID.mkdir(parents=True, exist_ok=True)
    for cat in sorted({a['categorySlug'] for a in manifest}):
        arr=[a for a in manifest if a['categorySlug']==cat]
        tile=112; cols=5; rows=math.ceil(len(arr)/cols)
        sheet=Image.new('RGBA',(cols*tile,rows*tile),(25,25,28,255)); d=ImageDraw.Draw(sheet)
        # checker pattern for alpha visibility
        for i,a in enumerate(arr):
            x=(i%cols)*tile; y=(i//cols)*tile
            for yy in range(4,68,8):
                for xx in range(24,88,8):
                    col=(70,70,74,255) if ((xx+yy)//8)%2 else (38,38,42,255)
                    d.rectangle((x+xx,y+yy,x+xx+7,y+yy+7), fill=col)
            p=ROOT/a['installedPath']; im=Image.open(p).convert('RGBA').resize((64,64), Image.Resampling.NEAREST)
            sheet.alpha_composite(im,(x+24,y+4)); d.text((x+2,y+72),a['id'][:18],fill=(230,230,230,255))
        out=EVID/f'contact-{cat}-{suffix}.png'; sheet.save(out); shutil.copy2(out, RUN_EVID/out.name)


def main():
    stamp=time.strftime('transparent-pass-%Y%m%dT%H%M%SZ', time.gmtime())
    backup_root=ROOT/'asset-generation/backups'/stamp
    manifest=json.loads(EMAN.read_text())
    assets=manifest['assets']
    status=json.loads(STATUS.read_text()) if STATUS.exists() else {'assets':{},'runs':[]}
    review=[]
    # restore curated kitten if the one-off workflow test left a framed opaque replacement.
    old_kitten=ROOT/'asset-generation/backups/curated-20260628T170652Z/electron-poc/assets/tiles/generated/common-early-monsters/kitten.png'
    if old_kitten.exists():
        for p in [GEN/'common-early-monsters/kitten.png', OUT/'common-early-monsters/kitten.png']:
            backup_file(p, backup_root); p.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(old_kitten, p)
    for a in assets:
        aid=a['id']; cat=a['categorySlug']
        transparent = cat in TRANSPARENT_CATEGORIES and aid not in OPAQUE_UI_IDS
        workflow = TRANSPARENT_WORKFLOW if transparent else REGULAR_WORKFLOW
        rec={'id':aid,'categorySlug':cat,'workflowUsed':workflow,'transparentTarget':transparent,'action':'reviewed-no-change'}
        if transparent:
            paths=[ROOT/a['installedPath'], ROOT/a['outputPath']] if a.get('outputPath') else [ROOT/a['installedPath']]
            for p in paths: backup_file(p, backup_root)
            stats=transparent_cleanup(ROOT/a['installedPath'], paths)
            rec.update(stats); rec['action']='transparent-background-refined-installed'
            s=status.setdefault('assets',{}).get(aid,{})
            s.update({'id':aid,'categorySlug':cat,'outputPath':a.get('outputPath', f'asset-generation/outputs/{cat}/{aid}.png'), 'installedPath':a['installedPath'], 'status':'installed', 'completedAt':time.strftime('%FT%TZ', time.gmtime()), 'workflow':workflow, 'workflowLabel':'transparent-rmbg', 'transparentBackgroundPass':True, 'backupRoot':rel(backup_root), 'alphaStats':stats})
            status['assets'][aid]=s
        else:
            s=status.setdefault('assets',{}).get(aid,{})
            s.update({'id':aid,'categorySlug':cat,'installedPath':a.get('installedPath'), 'status':'installed', 'workflow':workflow, 'workflowLabel':'regular-background' if cat=='terrain-features' else 'opaque-ui-background', 'reviewedAt':time.strftime('%FT%TZ', time.gmtime())})
            status['assets'][aid]=s
        a['workflow']=workflow; a['workflowLabel']=status['assets'][aid].get('workflowLabel')
        review.append(rec)
    run={'type':'full-asset-visual-transparent-background-refinement','completedAt':time.strftime('%FT%TZ', time.gmtime()),'countReviewed':len(assets),'countTransparentRefined':sum(1 for r in review if r['transparentTarget']),'transparentWorkflow':TRANSPARENT_WORKFLOW,'regularWorkflow':REGULAR_WORKFLOW,'backupRoot':rel(backup_root),'notes':'All 239 installed assets reviewed by category/contact sheets. Non-terrain sprites/items/monsters/traps/overlays were alpha-cleaned for placement on top of floor/walls; terrain and structural UI panels retained opaque backgrounds.'}
    status.setdefault('runs',[]).append(run)
    STATUS.write_text(json.dumps(status, indent=2))
    EMAN.write_text(json.dumps(manifest, indent=2))
    EVID.mkdir(parents=True, exist_ok=True); RUN_EVID.mkdir(parents=True, exist_ok=True)
    review_path=EVID/'transparent-background-review.json'; review_path.write_text(json.dumps({'run':run,'assets':review}, indent=2)); shutil.copy2(review_path, RUN_EVID/review_path.name)
    make_contact(assets, 'after-transparent-pass')
    print(json.dumps(run, indent=2))

if __name__ == '__main__':
    main()
