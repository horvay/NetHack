#!/usr/bin/env python3
"""AI-refine NetHack cat/pet tiles with the transparent ComfyUI workflow.

Targets Boss-rejected deterministic/simple cat placeholders and installs real
AI-painted transparent sprites at production paths.
"""
from __future__ import annotations
import json, shutil, sys, time, importlib.util
from dataclasses import asdict
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('generate_assets_base', ROOT/'asset-generation/scripts/generate_assets.py')
base = importlib.util.module_from_spec(spec); sys.modules[spec.name] = base; spec.loader.exec_module(base)  # type: ignore
base.WORKFLOW_PATH = ROOT/'asset-generation/workflows/krea2_basic_rem_back.json'
STATUS = ROOT/'asset-generation/manifests/generation-status.json'
EMAN = ROOT/'electron-poc/assets/tiles/manifest.json'
TARGETS = {
  'kitten-pet': 'friendly tiny kitten pet, warm ginger and cream fur, pointed ears, curled tail, tiny blue collar glint, cute alert pose, three-quarter top-down roguelike sprite, transparent background only',
  'kitten': 'tiny dungeon kitten monster, tan gray fur, pointed ears, curled tail, cautious low pose, three-quarter top-down roguelike sprite, transparent background only',
  'housecat': 'small adult house cat monster, tabby gray-brown fur stripes, arched back, pointed ears, long curved tail, three-quarter top-down roguelike sprite, transparent background only',
  'large-cat': 'large cat monster, tawny mountain-lion style feline, muscular body, pointed ears, long tail, crouched stalking pose, three-quarter top-down roguelike sprite, transparent background only',
}
STYLE = ('A single NetHack game tile sprite, AI-painted pixel-art/painted-pixel hybrid, '
         'readable at actual tiny 32x32 and 9-16px map size, cohesive hand-painted game art, '
         'strong feline silhouette, no SVG/vector flat icon look, no procedural simple shapes, '
         'no text, no letters, no UI badge, no border, no square card, no floor, no shadow rectangle, '
         'transparent/removed background. ')
NEG = (' Avoid photorealism, avoid plush toy, avoid logo, avoid emoji, avoid flat vector icon, '
       'avoid simple silhouette-only placeholder, avoid background card, avoid dungeon floor baked into sprite.')

def backup(p: Path, root: Path):
    if p.exists():
        dst = root / p.relative_to(ROOT); dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists(): shutil.copy2(p, dst)

def alpha_cleanup(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    # If Comfy/RMBG produced no alpha, remove contiguous near-white/near-edge bg.
    alpha = im.getchannel('A')
    if alpha.getextrema()[0] < 250:
        return im
    w,h = im.size; pix = im.load()
    edge=[]
    for x in range(w): edge += [pix[x,0][:3], pix[x,h-1][:3]]
    for y in range(h): edge += [pix[0,y][:3], pix[w-1,y][:3]]
    bg = tuple(sum(c[i] for c in edge)//len(edge) for i in range(3))
    stack=[(x,0) for x in range(w)] + [(x,h-1) for x in range(w)] + [(0,y) for y in range(h)] + [(w-1,y) for y in range(h)]
    seen=set(); tol=70
    while stack:
        x,y=stack.pop()
        if x<0 or y<0 or x>=w or y>=h or (x,y) in seen: continue
        r,g,b,a=pix[x,y]; dist=(r-bg[0])**2+(g-bg[1])**2+(b-bg[2])**2
        if dist > tol*tol: continue
        seen.add((x,y)); pix[x,y]=(r,g,b,0)
        stack += [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]
    return im

def fit_to_32(src: Path, dests: list[Path]) -> dict:
    im = alpha_cleanup(Image.open(src))
    # crop transparent margin, then pad to retain full sprite with breathing room
    bbox = im.getbbox()
    if bbox: im = im.crop(bbox)
    im.thumbnail((28,28), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (32,32), (0,0,0,0))
    canvas.alpha_composite(im, ((32-im.width)//2, (32-im.height)//2))
    canvas = canvas.filter(ImageFilter.UnsharpMask(radius=0.7, percent=120, threshold=3))
    for d in dests:
        d.parent.mkdir(parents=True, exist_ok=True); canvas.save(d)
    hist = canvas.getchannel('A').histogram()
    return {'transparentPixels': sum(hist[:16]), 'semiTransparentPixels': sum(hist[16:240]), 'opaquePixels': sum(hist[240:]), 'size': canvas.size}

def main():
    endpoint = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8188'
    manifest = json.loads(EMAN.read_text())
    assets = {a['id']: a for a in manifest['assets']}
    status = json.loads(STATUS.read_text())
    stamp = time.strftime('ai-cat-refine-%Y%m%dT%H%M%SZ', time.gmtime())
    backup_root = ROOT/'asset-generation/backups'/stamp
    stats = base.check_comfy(endpoint); print('ComfyUI reachable:', stats.get('system',{}).get('comfyui_version'))
    run = {'type':'ai-transparent-cat-family-refinement','startedAt':time.strftime('%FT%TZ', time.gmtime()), 'workflow':'asset-generation/workflows/krea2_basic_rem_back.json', 'targets':list(TARGETS), 'backupRoot':str(backup_root.relative_to(ROOT))}
    status.setdefault('runs', []).append(run)
    for i,(aid, desc) in enumerate(TARGETS.items()):
        a = assets[aid]
        for p in [ROOT/a['installedPath'], ROOT/a.get('outputPath','')]:
            if str(p) != str(ROOT): backup(p, backup_root)
        asset = base.Asset(aid, a.get('name', aid), a.get('category',''), a['categorySlug'], a.get('priority','P0'), a.get('glyph',''), a.get('why',''), desc, a.get('renderingNotes',''), STYLE + desc + NEG)
        asset.outputPath = a.get('outputPath') or f'asset-generation/outputs/{asset.categorySlug}/{aid}.png'
        asset.installedPath = a['installedPath']
        print('AI refine', aid)
        raw = base.comfy_generate(endpoint, asset, seed=87087+i)
        out = ROOT/asset.outputPath; inst = ROOT/asset.installedPath
        alpha = fit_to_32(raw, [out, inst])
        rec = {**a, 'prompt': asset.prompt, 'status':'installed', 'workflow':'asset-generation/workflows/krea2_basic_rem_back.json', 'workflowLabel':'transparent-rmbg-ai-cat-refine', 'aiRefinement':True, 'backupRoot':str(backup_root.relative_to(ROOT)), 'completedAt':time.strftime('%FT%TZ', time.gmtime()), 'alphaStats':alpha}
        status['assets'][aid] = rec
        # Keep manifest in sync with prompt/workflow metadata.
        a.update({k:rec[k] for k in ['prompt','workflow','workflowLabel','status'] if k in rec})
        print('installed', asset.installedPath, alpha)
    run['completedAt'] = time.strftime('%FT%TZ', time.gmtime())
    STATUS.write_text(json.dumps(status, indent=2))
    EMAN.write_text(json.dumps(manifest, indent=2))

if __name__ == '__main__': main()
