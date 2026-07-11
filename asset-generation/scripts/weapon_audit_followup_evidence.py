#!/usr/bin/env python3
from __future__ import annotations
import json, math, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
EMAN=ROOT/'electron-poc/assets/tiles/manifest.json'
EVID=Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-eta-mapping-comet-74/weapon-audit-followup')
IDS='bill-guisarme bullwhip elven-bow glaive guisarme halberd lance partisan two-handed-sword sling aklys bec-de-corbin dwarvish-short-sword elven-arrow javelin katana morning-star scimitar silver-mace yumi crossbow'.split()

def manifest_by_id():
    m=json.loads(EMAN.read_text())
    return {a['id']:a for a in m['assets']}

def floor():
    im=Image.new('RGBA',(32,32),(40,38,37,255)); d=ImageDraw.Draw(im)
    for y in range(0,32,8): d.line((0,y,32,y), fill=(31,30,30,255))
    for x in range(0,32,8): d.line((x,0,x,32), fill=(49,46,43,255))
    return im

def checker():
    im=Image.new('RGBA',(32,32),(230,230,230,255)); d=ImageDraw.Draw(im)
    for y in range(0,32,8):
        for x in range(0,32,8):
            if ((x+y)//8)%2: d.rectangle((x,y,x+7,y+7), fill=(145,145,145,255))
    return im

def metrics(ids, by):
    out={}; issues=[]
    for aid in ids:
        p=ROOT/by[aid]['installedPath']; im=Image.open(p).convert('RGBA'); pix=list(im.getdata()); al=[a for *_,a in pix]
        # Matte check is near-pure Comfy green. Some weapon prompts intentionally
        # use natural green (elven bow/arrow leaves), so report that separately.
        pure_green_matte=sum(1 for r,g,b,a in pix if a>0 and g>140 and r<20 and b<20)
        intentional_green_palette=sum(1 for r,g,b,a in pix if a>0 and g>150 and r<90 and b<120 and not (g>140 and r<20 and b<20))
        bbox=im.getbbox()
        edge=[]; w,h=im.size
        for x in range(w): edge += [im.getpixel((x,0))[3],im.getpixel((x,h-1))[3]]
        for y in range(h): edge += [im.getpixel((0,y))[3],im.getpixel((w-1,y))[3]]
        out[aid]={'path':str(p.relative_to(ROOT)),'mode':im.mode,'size':list(im.size),'hasAlpha':min(al)<255,'bbox':bbox,'pureGreenMattePixels':pure_green_matte,'intentionalGreenPalettePixels':intentional_green_palette,'transparentPixels':sum(a<16 for a in al),'semiTransparentPixels':sum(16<=a<240 for a in al),'opaquePixels':sum(a>=240 for a in al),'opaqueEdgePixels':sum(a>250 for a in edge),'nonTransparentRatio':round(sum(a>0 for a in al)/(len(al) or 1),4)}
        if min(al)==255: issues.append(f'{aid}: no transparent pixels')
        if pure_green_matte: issues.append(f'{aid}: {pure_green_matte} pure green matte pixels')
        if not bbox: issues.append(f'{aid}: empty image')
        if sum(a>250 for a in edge)>0: issues.append(f'{aid}: opaque edge pixels')
    return {'assets':out,'issues':issues}

def contact(ids, by, out, bg='floor', tile=32, mag=4, labels=True):
    font=ImageFont.load_default(); cols=7; cellw=max(94,tile*mag+8); cellh=tile*mag+(16 if labels else 4)
    sheet=Image.new('RGBA',(cols*cellw, math.ceil(len(ids)/cols)*cellh),(18,18,18,255)); d=ImageDraw.Draw(sheet)
    for idx, aid in enumerate(ids):
        im=Image.open(ROOT/by[aid]['installedPath']).convert('RGBA')
        if tile==16: im=im.resize((16,16), Image.Resampling.LANCZOS)
        base=floor().resize((tile,tile), Image.Resampling.NEAREST) if bg=='floor' else checker().resize((tile,tile), Image.Resampling.NEAREST)
        if bg=='light': base=Image.new('RGBA',(tile,tile),(220,214,200,255))
        comp=base.copy(); comp.alpha_composite(im if tile==32 else im, (0,0))
        big=comp.resize((tile*mag,tile*mag), Image.Resampling.NEAREST)
        x=(idx%cols)*cellw; y=(idx//cols)*cellh
        sheet.alpha_composite(big,(x+(cellw-big.width)//2,y+2))
        if labels: d.text((x+2,y+big.height+3), aid, fill=(255,255,255,255), font=font)
    out.parent.mkdir(parents=True, exist_ok=True); sheet.convert('RGB').save(out)

def main():
    import argparse
    ap=argparse.ArgumentParser(); ap.add_argument('phase', choices=['before','after']); args=ap.parse_args()
    by=manifest_by_id(); missing=[i for i in IDS if i not in by]
    if missing: raise SystemExit('missing ids '+','.join(missing))
    d=EVID/args.phase; d.mkdir(parents=True, exist_ok=True)
    for aid in IDS: shutil.copy2(ROOT/by[aid]['installedPath'], d/f'{aid}.png')
    contact(IDS,by,EVID/f'{args.phase}-contact-floor-32px-magnified.png','floor',32,4)
    contact(IDS,by,EVID/f'{args.phase}-contact-floor-16px-magnified.png','floor',16,8)
    contact(IDS,by,EVID/f'{args.phase}-contact-checker-32px-magnified.png','checker',32,4)
    contact(IDS,by,EVID/f'{args.phase}-contact-light-32px-magnified.png','light',32,4)
    (EVID/f'{args.phase}-alpha-green-metrics.json').write_text(json.dumps(metrics(IDS,by), indent=2)+'\n')
    print(json.dumps({'phase':args.phase,'ids':IDS,'evidence':str(EVID)}, indent=2))
if __name__=='__main__': main()
