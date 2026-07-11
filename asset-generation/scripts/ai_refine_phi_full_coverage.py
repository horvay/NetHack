#!/usr/bin/env python3
"""AI-refine high-confidence failures from full 990 asset critique pass."""
from __future__ import annotations
import importlib.util, json, shutil, sys, time
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('generate_assets_base', ROOT / 'asset-generation/scripts/generate_assets.py')
base = importlib.util.module_from_spec(spec); sys.modules[spec.name] = base; spec.loader.exec_module(base)  # type: ignore
base.WORKFLOW_PATH = ROOT / 'asset-generation/workflows/krea2_basic_rem_back.json'
STATUS = ROOT / 'asset-generation/manifests/generation-status.json'
EMAN = ROOT / 'electron-poc/assets/tiles/manifest.json'
STYLE = ('A single 32x32 NetHack roguelike dungeon tile sprite, AI-painted pixel-art / painted-pixel hybrid, transparent background, centered bold silhouette, readable at 16px on a dark stone floor, high contrast, cohesive fantasy game art, no text, no letters, no UI frame, no border, no square card, no baked background rectangle, not a flat SVG icon. ')
NEG = ' Use chunky readable shapes; preserve transparent alpha; avoid tiny hairline details and generic placeholder recolor reuse.'
TARGETS = {
  'glyph-class-debug-overlay':'transparent debug overlay icon: small cyan bracketed glyph stack with magnifying-glass sparkle, clearly overlay not opaque black card',
  'glyph-debug-overlay':'transparent debug overlay icon: cyan crosshair over tiny tile glyph with corner handles, no filled card',
  'inventory-selected-item-highlight':'transparent selection highlight: golden corner brackets and soft glow ring only, hollow center, no filled square',
  'open-door-action-icon':'open wooden dungeon door action symbol, door ajar with bright opening arrow, not a red no sign',
  'movement-hint-icon':'movement hint icon: boot footprint with small blue directional arrow, clear movement cue',
  'zombie':'green shambling zombie humanoid with raised arms and ragged clothes, not tombstone',
  'paper-golem':'humanoid golem made from folded parchment sheets, visible paper limbs and scroll head',
  'straw-golem':'straw scarecrow golem with straw arms, tied waist, ragged hat, golden straw silhouette',
  'gas-spore':'round floating spore puffball with speckled cap and faint green gas halo',
  'fog-cloud':'soft pale gray fog cloud swirl, translucent cloudy mass',
  'cloud':'white airy cloud puff with blue rim, distinct from poison gas',
  'poison-cloud':'sickly green poison vapor cloud with skull-like holes, readable toxic gas',
  'expensive-camera':'chunky black vintage camera with large blue lens and silver flash cube',
  'stethoscope':'chunky black stethoscope with silver chestpiece and clear loop',
  'statue':'small gray stone humanoid statue on pedestal, clearly sculpted figure',
  'corpse':'fallen humanoid corpse silhouette with skull head and ragged brown body lying sideways',
  'queen-bee':'large golden queen bee with crown-like head, striped abdomen and clear wings',
  'cerberus':'three-headed black hellhound, three visible dog heads, red eyes',
  'flaming-sphere':'bright orange flaming orb with fire tongues, not blue ice sphere',
  'beholder':'floating eyeball monster, huge central eye with small eye stalks',
  'tengu':'crow-headed bird humanoid tengu with beak, wing cloak and small sword',
  'fire-vortex':'spinning orange fire tornado vortex with flame spiral',
  'xan':'insectoid xan monster: orange wasp-like insect with needle proboscis and legs',
  'angel':'winged angel humanoid with white wings, gold halo, small sword',
  'ki-rin':'celestial kirin unicorn-dragon horse with horn, gold mane and blue scales',
  'archon':'radiant archon celestial with large wings, halo and glowing sword',
  'air-elemental':'swirling pale wind elemental tornado with airy spiral',
  'fire-elemental':'humanoid fire elemental made of flames, bright orange body',
  'earth-elemental':'rock elemental humanoid made of chunky brown stones',
  'water-elemental':'blue water elemental wave humanoid with cresting splash arms',
  'minotaur':'bull-headed muscular humanoid with horns and axe, clear minotaur silhouette',
  'jabberwock':'strange dragon-bird jabberwock with beak, claws, wings and long tail',
  'vorpal-jabberwock':'menacing jabberwock with glowing severing blade aura and red eyes',
  'rust-monster':'orange rust monster insect with four legs and feathery antennae',
  'xorn':'gray three-legged xorn with huge toothy mouth and three arms around body',
  'rope-golem':'humanoid golem made of coiled rope loops and knots',
  'medusa':'snake-haired Medusa woman, green snakes clearly forming hair crown',
  'ghost':'white translucent ghost sheet figure with dark eyes and wavy tail',
  'shade':'dark purple ghostly shade silhouette with glowing eyes, visible on dark floor',
  'juiblex':'black green demon slime lord blob with eyes and dripping acid',
  'djinni':'blue genie djinni rising from smoke tail, turban and crossed arms',
  'long-worm-tail':'curved purple worm tail segment with tapered end, clearly tail',
  'chromatic-dragon':'dragon with rainbow multicolor scales and wings, not single-color blue',
  'scorpius':'large scorpion monster with claws and raised stinger tail',
}

def backup(path, root):
    if not path:
        return
    path = Path(path)
    if str(path) in ('.', ''):
        return
    src = ROOT / path
    if src.is_file():
        dst = root / path
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists():
            shutil.copy2(src, dst)

def fit(src, dests):
    im=Image.open(src).convert('RGBA')
    alpha=im.getchannel('A')
    if alpha.getextrema()[0] >= 250:
        pix=im.load(); w,h=im.size; edge=[]
        for x in range(w): edge += [pix[x,0][:3], pix[x,h-1][:3]]
        for y in range(h): edge += [pix[0,y][:3], pix[w-1,y][:3]]
        bg=tuple(sum(c[i] for c in edge)//len(edge) for i in range(3)); stack=[(x,0) for x in range(w)]+[(x,h-1) for x in range(w)]+[(0,y) for y in range(h)]+[(w-1,y) for y in range(h)]; seen=set(); tol=72
        while stack:
            x,y=stack.pop()
            if x<0 or y<0 or x>=w or y>=h or (x,y) in seen: continue
            r,g,b,a=pix[x,y]
            if (r-bg[0])**2+(g-bg[1])**2+(b-bg[2])**2 > tol*tol: continue
            seen.add((x,y)); pix[x,y]=(r,g,b,0); stack += [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]
    bbox=im.getbbox()
    if bbox: im=im.crop(bbox)
    im.thumbnail((30,30), Image.Resampling.LANCZOS)
    can=Image.new('RGBA',(32,32),(0,0,0,0)); can.alpha_composite(im,((32-im.width)//2,(32-im.height)//2))
    rgb=ImageEnhance.Contrast(can.convert('RGB')).enhance(1.12)
    can=Image.merge('RGBA',(*rgb.split(),can.getchannel('A'))).filter(ImageFilter.UnsharpMask(radius=.6,percent=110,threshold=3))
    for d in dests: d.parent.mkdir(parents=True, exist_ok=True); can.save(d)
    hist=can.getchannel('A').histogram(); return {'size':[32,32],'transparentPixels':sum(hist[:16]),'semiTransparentPixels':sum(hist[16:240]),'opaquePixels':sum(hist[240:])}

def main():
    endpoint=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8188'
    wanted=list(TARGETS) if len(sys.argv)<3 else [x for x in sys.argv[2].split(',') if x]
    manifest=json.loads(EMAN.read_text()); assets={a['id']:a for a in manifest['assets']}; status=json.loads(STATUS.read_text())
    stamp=time.strftime('ai-phi-full-coverage-refine-%Y%m%dT%H%M%SZ', time.gmtime()); broot=ROOT/'asset-generation/backups'/stamp
    print('ComfyUI reachable:', base.check_comfy(endpoint).get('system',{}).get('comfyui_version'))
    run={'type':'ai-phi-full-coverage-refinement','startedAt':time.strftime('%FT%TZ',time.gmtime()),'workflow':'asset-generation/workflows/krea2_basic_rem_back.json','backupRoot':str(broot.relative_to(ROOT)),'targets':[]}
    status.setdefault('runs',[]).append(run)
    for i,aid in enumerate(wanted):
        if aid not in TARGETS or aid not in assets: print('skip',aid); continue
        a=assets[aid]
        backup(a.get('installedPath'), broot); backup(a.get('outputPath'), broot)
        prompt=STYLE+TARGETS[aid]+'. '+NEG
        asset=base.Asset(aid,a.get('name',aid),a.get('category',''),a['categorySlug'],a.get('priority','P1'),a.get('glyph',''),a.get('why',''),TARGETS[aid],a.get('renderingNotes',''),prompt)
        asset.outputPath=a.get('outputPath') or f'asset-generation/outputs/{asset.categorySlug}/{aid}.png'; asset.installedPath=a['installedPath']
        print('AI refine',aid, flush=True)
        raw=base.comfy_generate(endpoint, asset, seed=932100+i)
        alpha=fit(raw,[ROOT/asset.outputPath,ROOT/asset.installedPath])
        rec={**a,'prompt':prompt,'status':'installed','workflow':'asset-generation/workflows/krea2_basic_rem_back.json','workflowLabel':'transparent-rmbg-ai-phi-full-coverage-refine','aiRefinement':True,'backupRoot':str(broot.relative_to(ROOT)),'completedAt':time.strftime('%FT%TZ',time.gmtime()),'alphaStats':alpha}
        status.setdefault('assets',{})[aid]=rec; a.update({k:rec[k] for k in ['prompt','workflow','workflowLabel','status']})
        run['targets'].append({'id':aid,'alphaStats':alpha}); print('installed',aid,alpha, flush=True)
    run['completedAt']=time.strftime('%FT%TZ',time.gmtime())
    STATUS.write_text(json.dumps(status,indent=2)+'\n'); EMAN.write_text(json.dumps(manifest,indent=2)+'\n')
if __name__=='__main__': main()
