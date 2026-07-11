#!/usr/bin/env python3
"""AI-refine legibility failures from the 50-up actual-size critique.

Uses the transparent/background-removal ComfyUI workflow for sprite-like map glyphs;
installs 32x32 PNGs back to the Electron tile manifest paths and records status.
"""
from __future__ import annotations
import json, shutil, sys, time, importlib.util
from dataclasses import asdict
from pathlib import Path
from PIL import Image, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('generate_assets_base', ROOT/'asset-generation/scripts/generate_assets.py')
base = importlib.util.module_from_spec(spec); sys.modules[spec.name] = base; spec.loader.exec_module(base)  # type: ignore
base.WORKFLOW_PATH = ROOT/'asset-generation/workflows/krea2_basic_rem_back.json'
STATUS = ROOT/'asset-generation/manifests/generation-status.json'
EMAN = ROOT/'electron-poc/assets/tiles/manifest.json'

STYLE = ('A single 32x32 NetHack roguelike dungeon tile sprite, AI-painted pixel-art/painted-pixel hybrid, '
         'readable at actual tiny 32x32 and 16px gameplay size, bold distinct silhouette, high contrast, '
         'cohesive hand-painted game art, no flat SVG/vector icon look, no emoji, no text, no letters, '
         'no warning triangle placeholder, no UI badge, no border, no square card, no baked shadow rectangle. ')
NEG = ' Transparent background unless the prompt explicitly asks for dungeon floor scratches; avoid photorealism and avoid generic placeholders.'

TARGETS = {
  # Boss/subagent failed traps: replace yellow-warning-triangle placeholders with semantic trap art.
  'arrow-trap': 'hidden wall/floor arrow trap: small dark dungeon mechanism with a sharp arrow/bolt shooting from one side, readable arrow silhouette, transparent background',
  'dart-trap': 'hidden dart trap: tiny blowgun nozzle or wall slit with two poison darts, distinct from arrow trap, transparent background',
  'land-mine': 'round buried land mine with small red pressure cap and metal prongs, dangerous but not a warning sign, transparent background',
  'polymorph-trap': 'magical polymorph trap: purple swirling transformation glyph/ring with tiny creature silhouette morphing, transparent background',
  'rolling-boulder-trap': 'rolling boulder trap: round gray boulder with motion dust and small trigger plate, transparent background',
  'rust-trap': 'rust trap: corroded orange-brown spray cloud and rusty metal grate/nozzle, transparent background',
  'sleeping-gas-trap': 'sleeping gas trap: green gas puff cloud rising from small floor vent, sleepy crescent/moon shape implied without text, transparent background',
  'spiked-pit': 'open dark pit with clear silver spikes pointing upward, top-down dungeon trap, transparent background',
  'squeaky-board': 'loose squeaky wooden floorboard trap: cracked plank with raised nail and vibration marks, transparent background',
  'statue-trap': 'stone statue trap: small gray statue bust with glowing eyes and hidden trigger base, transparent background',
  'trap-door': 'open trap door: square wooden hatch tilted open into black hole, top-down, transparent background',
  'trapped-chest-marker': 'trapped treasure chest marker: small chest with visible needle/spring trap and red glint, transparent background',
  'trapped-door-marker': 'trapped door marker: small wooden dungeon door with visible wire/needle trap and red glint, transparent background',
  # Focus questionable terrain/features.
  'engraving': 'dungeon floor engraving: readable pale scratched rune lines carved into a small transparent floor-scratch glyph, no boulder, no card, transparent background',
  'branch-stairs-up': 'branch stair up tile: compact stone stairs with clear upward arrow and side-branch fork symbol, readable as stairs not just an arrow, transparent background',
  # Pet/cat/dog consistency.
  'dog': 'medium brown dungeon dog monster, clear canine silhouette with floppy ears and tail, side three-quarter top-down pose, transparent background',
  'large-dog': 'large sturdy guard dog monster, darker brown canine, bigger muscular body and raised tail, distinct from small dog, transparent background',
  'wolf': 'gray wolf monster, pointed ears, long muzzle, bushy tail, lean wild canine silhouette, transparent background',
  'warg': 'dark black-gray fantasy warg, hulking wolf-like monster with red eyes and spiky fur, distinct from wolf, transparent background',
  'housecat': 'small adult house cat monster, gray-brown tabby stripes, arched back, pointed ears, long curved tail, distinct feline silhouette, transparent background',
  'large-cat': 'large tawny cat monster, mountain lion style, muscular feline body, round ears, long tail, crouched stalking pose, transparent background',
}

def backup(p: Path, root: Path):
    if p.exists():
        dst = root / p.relative_to(ROOT); dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists(): shutil.copy2(p, dst)

def alpha_cleanup(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    alpha = im.getchannel('A')
    if alpha.getextrema()[0] < 250:
        return im
    w,h=im.size; pix=im.load(); edge=[]
    for x in range(w): edge += [pix[x,0][:3], pix[x,h-1][:3]]
    for y in range(h): edge += [pix[0,y][:3], pix[w-1,y][:3]]
    bg=tuple(sum(c[i] for c in edge)//len(edge) for i in range(3))
    stack=[(x,0) for x in range(w)] + [(x,h-1) for x in range(w)] + [(0,y) for y in range(h)] + [(w-1,y) for y in range(h)]
    seen=set(); tol=72
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
    bbox = im.getbbox()
    if bbox: im = im.crop(bbox)
    im.thumbnail((29,29), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (32,32), (0,0,0,0))
    canvas.alpha_composite(im, ((32-im.width)//2, (32-im.height)//2))
    rgb = ImageEnhance.Contrast(canvas.convert('RGB')).enhance(1.08)
    canvas = Image.merge('RGBA', (*rgb.split(), canvas.getchannel('A'))).filter(ImageFilter.UnsharpMask(radius=0.6, percent=105, threshold=3))
    for d in dests:
        d.parent.mkdir(parents=True, exist_ok=True); canvas.save(d)
    hist=canvas.getchannel('A').histogram()
    return {'transparentPixels': sum(hist[:16]), 'semiTransparentPixels': sum(hist[16:240]), 'opaquePixels': sum(hist[240:]), 'size': list(canvas.size)}

def main():
    endpoint = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8188'
    wanted = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else set(TARGETS)
    manifest = json.loads(EMAN.read_text())
    assets = {a['id']: a for a in manifest['assets']}
    status = json.loads(STATUS.read_text())
    stamp=time.strftime('ai-legibility-refine-%Y%m%dT%H%M%SZ', time.gmtime())
    backup_root=ROOT/'asset-generation/backups'/stamp
    stats=base.check_comfy(endpoint); print('ComfyUI reachable:', stats.get('system',{}).get('comfyui_version'))
    run={'type':'ai-transparent-legibility-refinement','startedAt':time.strftime('%FT%TZ', time.gmtime()), 'workflow':'asset-generation/workflows/krea2_basic_rem_back.json', 'targets':[], 'backupRoot':str(backup_root.relative_to(ROOT))}
    status.setdefault('runs', []).append(run)
    for i, aid in enumerate([x for x in TARGETS if x in wanted]):
        if aid not in assets: print('missing', aid); continue
        a=assets[aid]; desc=TARGETS[aid]
        for p in [ROOT/a['installedPath'], ROOT/a.get('outputPath','')]:
            if str(p) != str(ROOT): backup(p, backup_root)
        prompt=STYLE + desc + NEG
        asset=base.Asset(aid, a.get('name', aid), a.get('category',''), a['categorySlug'], a.get('priority','P1'), a.get('glyph',''), a.get('why',''), desc, a.get('renderingNotes',''), prompt)
        asset.outputPath = a.get('outputPath') or f'asset-generation/outputs/{asset.categorySlug}/{aid}.png'
        asset.installedPath = a['installedPath']
        print('AI refine', aid)
        raw=base.comfy_generate(endpoint, asset, seed=991200+i)
        alpha=fit_to_32(raw, [ROOT/asset.outputPath, ROOT/asset.installedPath])
        rec={**a, 'prompt': prompt, 'status':'installed', 'workflow':'asset-generation/workflows/krea2_basic_rem_back.json', 'workflowLabel':'transparent-rmbg-ai-legibility-refine', 'aiRefinement':True, 'backupRoot':str(backup_root.relative_to(ROOT)), 'completedAt':time.strftime('%FT%TZ', time.gmtime()), 'alphaStats':alpha}
        status['assets'][aid]=rec
        a.update({k:rec[k] for k in ['prompt','workflow','workflowLabel','status'] if k in rec})
        run['targets'].append({'id': aid, 'alphaStats': alpha})
        print('installed', a['installedPath'], alpha)
    run['completedAt']=time.strftime('%FT%TZ', time.gmtime())
    STATUS.write_text(json.dumps(status, indent=2))
    EMAN.write_text(json.dumps(manifest, indent=2))

if __name__ == '__main__': main()
