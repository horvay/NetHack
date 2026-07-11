#!/usr/bin/env python3
"""Install hand-curated cleanup tiles after targeted ComfyUI refinement.

This is intentionally narrow: it only touches the assets listed below, preserving the
organized Electron tile structure and recording backups/status entries. The cleanup
uses simple deterministic pixel-art geometry to correct ComfyUI outputs that were
still too noisy/text-like for the full-level NetHack renderer.
"""
from __future__ import annotations
import json, shutil, sys, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'asset-generation/outputs'
GEN=ROOT/'electron-poc/assets/tiles/generated'
STATUS=ROOT/'asset-generation/manifests/generation-status.json'
EMAN=ROOT/'electron-poc/assets/tiles/manifest.json'
MAN=ROOT/'asset-generation/manifests/early-level-assets.json'
BACK=ROOT/'asset-generation/backups'/time.strftime('curated-%Y%m%dT%H%M%SZ', time.gmtime())
SIZE=512
DARK=(10,11,14,255); FLOOR=(41,45,51,255); FLOOR2=(50,55,63,255); EDGE=(100,103,104,255); HI=(152,148,128,255)
WOOD=(113,67,37,255); WOOD2=(165,101,48,255); GOLD=(236,177,45,255)

def canvas(bg=DARK): return Image.new('RGBA',(SIZE,SIZE),bg)
def save(aid, cat, im):
    for p in [OUT/cat/(aid+'.png'), GEN/cat/(aid+'.png')]:
        if p.exists():
            dest=BACK/p.relative_to(ROOT); dest.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,dest)
    for p in [OUT/cat/(aid+'.png'), GEN/cat/(aid+'.png')]:
        p.parent.mkdir(parents=True,exist_ok=True); im.save(p)

def line(d, xy, fill, w=18): d.line(xy, fill=fill, width=w, joint='curve')
def rect(d, xy, fill, outline=None, w=1): d.rectangle(xy, fill=fill, outline=outline, width=w)
def floor_tile(dark=False):
    im=canvas((20,22,27,255) if dark else (33,36,42,255)); d=ImageDraw.Draw(im)
    base=(31,34,40,255) if dark else FLOOR
    for y in range(0,SIZE,128):
        for x in range(0,SIZE,128): rect(d,(x+2,y+2,x+124,y+124),base,(24,27,32,255),4)
    cracks=[(70,110,145,100,190,125),(290,65,330,88,390,80),(115,335,180,350,230,325),(330,360,370,405,430,395)]
    for pts in cracks: line(d, pts, (20,22,27,255) if not dark else (14,16,20,255), 7)
    return im

def corridor(dark=False):
    # Orientation-neutral, because NetHack exposes # without corridor direction.
    # Avoid vertical/horizontal slats that create zebra stripes in long passages.
    im=canvas((13,14,17,255) if not dark else (8,9,12,255)); d=ImageDraw.Draw(im)
    base=(38,37,33,255) if not dark else (24,25,29,255)
    edge=(24,24,23,255) if not dark else (13,14,17,255)
    rect(d,(0,0,SIZE,SIZE),edge)
    rect(d,(60,60,SIZE-60,SIZE-60),base,(18,19,22,255),6)
    stones=[(120,145,205,220),(260,110,365,205),(170,285,285,390),(325,285,405,365)]
    for xy in stones:
        rect(d,xy,(52,50,44,255) if not dark else (31,33,38,255),(20,21,22,255),5)
    line(d,(95,255,175,250,245,265),(28,29,30,255),5)
    line(d,(310,235,385,250,430,232),(28,29,30,255),5)
    return im

def wall(kind):
    im=canvas((8,9,12,255)); d=ImageDraw.Draw(im); stone=(74,78,80,255); shade=(35,38,42,255); light=(128,130,124,255)
    if kind=='v': rect(d,(190,0,322,SIZE),stone,shade,8); line(d,(210,0,210,SIZE),light,8); line(d,(302,0,302,SIZE),shade,10)
    if kind=='h': rect(d,(0,190,SIZE,322),stone,shade,8); line(d,(0,210,SIZE,210),light,8); line(d,(0,302,SIZE,302),shade,10)
    if kind=='corner': rect(d,(190,190,322,SIZE),stone,shade,8); rect(d,(190,190,SIZE,322),stone,shade,8); line(d,(210,210,210,SIZE),light,8); line(d,(210,210,SIZE,210),light,8)
    if kind=='tee': rect(d,(190,0,322,SIZE),stone,shade,8); rect(d,(0,190,SIZE,322),stone,shade,8); line(d,(210,0,210,SIZE),light,8); line(d,(0,210,SIZE,210),light,8)
    # broad masonry divisions only
    for n in range(80, SIZE, 120):
        if kind in ('v','tee'): line(d,(190,n,322,n),shade,5)
        if kind in ('h','tee'): line(d,(n,190,n,322),shade,5)
    return im

def closed_door():
    im=canvas((20,22,27,255)); d=ImageDraw.Draw(im); rect(d,(150,96,362,416),WOOD,(56,35,24,255),10); rect(d,(180,126,332,386),(133,78,37,255),(66,40,24,255),6); d.ellipse((300,246,326,272),fill=GOLD); return im

def open_v():
    im=floor_tile(True); d=ImageDraw.Draw(im); rect(d,(80,0,160,SIZE),EDGE,(36,38,40,255),8); rect(d,(352,0,432,SIZE),EDGE,(36,38,40,255),8); rect(d,(172,0,340,SIZE),(18,20,24,255)); return im

def open_h():
    im=floor_tile(True); d=ImageDraw.Draw(im); rect(d,(0,80,SIZE,160),EDGE,(36,38,40,255),8); rect(d,(0,352,SIZE,432),EDGE,(36,38,40,255),8); rect(d,(0,172,SIZE,340),(18,20,24,255)); return im

def broken():
    im=floor_tile(True); d=ImageDraw.Draw(im); pts=[(120,170),(380,120),(410,360),(150,400)]; d.polygon(pts,fill=WOOD,outline=(48,29,19,255)); line(d,(150,190,250,260,360,180),WOOD2,10); line(d,(180,355,260,260,360,330),WOOD2,10); line(d,(250,130,250,390),(42,25,17,255),9); return im

def doorway():
    im=floor_tile(True); d=ImageDraw.Draw(im); rect(d,(0,0,110,SIZE),EDGE,(38,40,42,255),8); rect(d,(402,0,SIZE,SIZE),EDGE,(38,40,42,255),8); return im

def stairs(up=True):
    im=canvas((18,20,24,255)); d=ImageDraw.Draw(im)
    for i in range(6):
        y=(340-i*40) if up else (130+i*40); x=128+i*28
        rect(d,(x,y,384,y+32),(128+i*12,128+i*12,120+i*10,255),(55,55,58,255),4)
    if up: line(d,(256,340,256,150,210,200,256,150,302,200),HI,14)
    else: line(d,(256,150,256,352,210,302,256,352,302,302),(92,96,108,255),14)
    return im

def boulder():
    im=floor_tile(True); d=ImageDraw.Draw(im); d.ellipse((92,88,420,420),fill=(105,101,91,255),outline=(42,42,43,255),width=12); d.ellipse((150,130,280,220),fill=(150,145,130,255)); line(d,(170,340,250,370,335,320),(70,68,65,255),9); return im

def coins():
    im=floor_tile(True); d=ImageDraw.Draw(im)
    for x,y,r in [(220,260,34),(275,250,32),(250,210,30),(205,215,25),(300,300,28),(240,305,30)]: d.ellipse((x-r,y-r,x+r,y+r),fill=GOLD,outline=(134,88,22,255),width=5)
    line(d,(340,150,355,190,395,205,355,220,340,260,325,220,285,205,325,190), (255,232,111,255),8); return im

def hero():
    im=floor_tile(True); d=ImageDraw.Draw(im); d.ellipse((210,80,302,172),fill=(218,188,132,255),outline=(50,36,28,255),width=6); rect(d,(190,170,322,330),(63,103,144,255),(20,30,45,255),7); line(d,(190,210,110,285),HI,18); line(d,(322,210,400,285),HI,18); line(d,(225,328,190,430),HI,18); line(d,(287,328,322,430),HI,18); d.ellipse((184,72,328,184),outline=GOLD,width=12); return im

def kitten(pet=True):
    im=floor_tile(True); d=ImageDraw.Draw(im); col=(154,142,124,255); d.ellipse((150,185,360,350),fill=col,outline=(45,43,40,255),width=8); d.polygon([(190,200),(220,120),(250,205)],fill=col,outline=(45,43,40,255)); d.polygon([(285,205),(320,120),(338,220)],fill=col,outline=(45,43,40,255)); line(d,(340,280,435,230,410,180),col,20); d.ellipse((215,245,230,260),fill=(10,10,10,255)); d.ellipse((285,245,300,260),fill=(10,10,10,255));
    if pet: d.ellipse((245,350,272,377),fill=(74,161,255,255)); d.ellipse((110,120,400,410),outline=(91,170,255,255),width=10)
    return im

def newt():
    im=floor_tile(True); d=ImageDraw.Draw(im); green=(72,154,86,255); d.ellipse((160,210,350,302),fill=green,outline=(24,62,35,255),width=8); line(d,(330,255,430,230,480,255),green,18); line(d,(190,285,130,340),green,13); line(d,(260,285,230,360),green,13); d.ellipse((180,230,194,244),fill=(240,230,120,255)); return im

MAP={
 'room-floor':('terrain-features',floor_tile(False)), 'dark-room-floor':('terrain-features',floor_tile(True)), 'lit-corridor':('terrain-features',corridor(False)), 'dark-corridor':('terrain-features',corridor(True)),
 'vertical-wall':('terrain-features',wall('v')), 'horizontal-wall':('terrain-features',wall('h')), 'wall-corner':('terrain-features',wall('corner')), 'wall-tee-junction':('terrain-features',wall('tee')), 'closed-door':('terrain-features',closed_door()), 'open-vertical-door':('terrain-features',open_v()), 'open-horizontal-door':('terrain-features',open_h()), 'broken-door':('terrain-features',broken()), 'no-door-doorway':('terrain-features',doorway()), 'up-stairs':('terrain-features',stairs(True)), 'down-stairs':('terrain-features',stairs(False)),
 'boulder':('objects-inventory',boulder()), 'coin-pile':('objects-inventory',coins()), 'hero-avatar':('player-pets-identity',hero()), 'kitten-pet':('player-pets-identity',kitten(True)), 'kitten':('common-early-monsters',kitten(False)), 'newt':('common-early-monsters',newt())
}
ids=sys.argv[1].split(',') if len(sys.argv)>1 else list(MAP)
for aid in ids:
    cat, im=MAP[aid]; save(aid,cat,im)
status=json.loads(STATUS.read_text()) if STATUS.exists() else {'assets':{},'runs':[]}
status.setdefault('runs',[]).append({'type':'curated-cleanup-after-comfy-refinement','completedAt':time.strftime('%FT%TZ', time.gmtime()),'ids':ids,'backupRoot':str(BACK.relative_to(ROOT)),'notes':'Deterministic pixel-art cleanup installed after targeted ComfyUI refinement; fixes text-like/noisy artifacts and improves full-level readability.'})
for aid in ids:
    cat,_=MAP[aid]
    rec=status.setdefault('assets',{}).get(aid,{})
    rec.update({'id':aid,'categorySlug':cat,'outputPath':f'asset-generation/outputs/{cat}/{aid}.png','installedPath':f'electron-poc/assets/tiles/generated/{cat}/{aid}.png','status':'installed','completedAt':time.strftime('%FT%TZ', time.gmtime()),'curatedCleanup':True,'backupRoot':str(BACK.relative_to(ROOT))})
    status['assets'][aid]=rec
STATUS.write_text(json.dumps(status,indent=2))
# Preserve manifest fields, just keep paths/count from current manifest if already complete.
manifest=json.loads(EMAN.read_text())
for a in manifest.get('assets',[]):
    aid=a.get('id')
    if aid in MAP:
        cat,_=MAP[aid]; a['outputPath']=f'asset-generation/outputs/{cat}/{aid}.png'; a['installedPath']=f'electron-poc/assets/tiles/generated/{cat}/{aid}.png'; a['status']='installed'
EMAN.write_text(json.dumps(manifest,indent=2))
print('installed curated cleanup', len(ids), 'assets; backup', BACK)
