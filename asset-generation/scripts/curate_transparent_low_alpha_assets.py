#!/usr/bin/env python3
from pathlib import Path
import json, shutil, time
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
STATUS=ROOT/'asset-generation/manifests/generation-status.json'; EMAN=ROOT/'electron-poc/assets/tiles/manifest.json'
OUT=ROOT/'asset-generation/outputs'; GEN=ROOT/'electron-poc/assets/tiles/generated'
BACK=ROOT/'asset-generation/backups'/time.strftime('transparent-curated-%Y%m%dT%H%M%SZ', time.gmtime())
SIZE=512
WHITE=(220,220,210,255); GRAY=(120,124,128,255); DARK=(38,40,44,255); RED=(210,42,42,255); GOLD=(230,175,45,255); GREEN=(78,160,78,255); PURP=(160,80,210,255)
def blank(): return Image.new('RGBA',(SIZE,SIZE),(0,0,0,0))
def save(aid,cat,im):
 for p in [OUT/cat/(aid+'.png'), GEN/cat/(aid+'.png')]:
  if p.exists():
   d=BACK/p.relative_to(ROOT); d.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,d)
  p.parent.mkdir(parents=True,exist_ok=True); im.save(p)
def line(d,pts,fill=WHITE,w=24): d.line(pts,fill=fill,width=w,joint='curve')
def ellipse(d,xy,fill,outline=DARK,w=10): d.ellipse(xy,fill=fill,outline=outline,width=w)
def rect(d,xy,fill,outline=DARK,w=8): d.rectangle(xy,fill=fill,outline=outline,width=w)
def spear():
 im=blank(); d=ImageDraw.Draw(im); line(d,(70,430,350,150),GRAY,34); d.polygon([(330,135),(470,55),(410,205)],fill=WHITE,outline=DARK); return im
def axe():
 im=blank(); d=ImageDraw.Draw(im); line(d,(140,430,320,120),(116,75,42,255),32); d.pieslice((230,70,470,290),270,90,fill=GRAY,outline=DARK,width=10); d.pieslice((170,70,410,290),90,270,fill=GRAY,outline=DARK,width=10); return im
def helmet():
 im=blank(); d=ImageDraw.Draw(im); ellipse(d,(120,100,392,395),GRAY,DARK,12); rect(d,(120,260,392,390),DARK,DARK,1); line(d,(256,105,256,250),WHITE,14); return im
def beartrap():
 im=blank(); d=ImageDraw.Draw(im); ellipse(d,(90,120,422,420),(80,84,88,180),GRAY,18); [line(d,(256,256,256+150,256+i*18),WHITE,12) for i in range(-5,6,2)]; [line(d,(256,256,256-150,256+i*18),WHITE,12) for i in range(-5,6,2)]; return im
def hole():
 im=blank(); d=ImageDraw.Draw(im); ellipse(d,(95,115,417,400),(4,4,6,230),(80,82,88,255),18); return im
def portal(col=PURP):
 im=blank(); d=ImageDraw.Draw(im); ellipse(d,(95,95,417,417),(0,0,0,0),col,22); line(d,(150,255,210,165,300,350,365,180),col,20); return im
def rogue():
 im=blank(); d=ImageDraw.Draw(im); d.polygon([(256,80),(370,430),(140,430)],fill=(34,36,42,255),outline=WHITE); line(d,(190,210,320,210),RED,16); return im
def spider():
 im=blank(); d=ImageDraw.Draw(im); ellipse(d,(180,170,332,322),DARK,GRAY,12); ellipse(d,(215,115,297,205),DARK,GRAY,10); 
 for y in [185,225,265]: line(d,(190,y,70,y-45),GRAY,12); line(d,(322,y,442,y-45),GRAY,12)
 return im
def mold(col):
 im=blank(); d=ImageDraw.Draw(im); ellipse(d,(130,220,260,350),col,DARK,8); ellipse(d,(230,165,370,335),col,DARK,8); ellipse(d,(190,300,430,420),col,DARK,8); return im
def zombie():
 im=blank(); d=ImageDraw.Draw(im); ellipse(d,(205,80,305,180),(115,122,120,255),DARK,8); rect(d,(175,175,335,370),(75,92,88,255),DARK,8); line(d,(175,230,90,310),(98,112,108,255),24); line(d,(335,230,425,170),(98,112,108,255),24); return im
def sword_icon():
 im=blank(); d=ImageDraw.Draw(im); line(d,(120,390,360,150),WHITE,24); d.polygon([(350,140),(430,80),(390,190)],fill=WHITE,outline=DARK); line(d,(170,340,235,405),GOLD,18); return im
def scope():
 im=blank(); d=ImageDraw.Draw(im); line(d,(150,380,300,220),WHITE,22); ellipse(d,(275,110,395,230),(210,220,225,255),DARK,10); line(d,(120,385,210,430),WHITE,18); return im
def stone():
 im=blank(); d=ImageDraw.Draw(im); ellipse(d,(135,135,377,377),(85,88,90,255),DARK,10); line(d,(180,250,250,215,330,255),(120,124,126,255),10); return im
def badge_question():
 im=blank(); d=ImageDraw.Draw(im); ellipse(d,(110,110,402,402),(85,65,120,235),PURP,18); d.text((220,150),'?',fill=WHITE); ellipse(d,(238,340,274,376),WHITE,DARK,4); return im
def blind():
 im=blank(); d=ImageDraw.Draw(im); line(d,(100,260,412,260),GRAY,30); line(d,(150,170,362,350),DARK,22); return im
def glyph():
 im=blank(); d=ImageDraw.Draw(im); rect(d,(130,120,382,392),(35,35,40,210),GRAY,12); d.text((205,205),'@?',fill=WHITE); return im
MAP={'bear-trap':('traps-hazards',beartrap()),'hole':('traps-hazards',hole()),'level-teleporter':('traps-hazards',portal()),'rogue-role-avatar':('player-pets-identity',rogue()),'cave-spider':('common-early-monsters',spider()),'brown-mold':('common-early-monsters',mold((93,63,35,255))),'zombie':('common-early-monsters',zombie()),'weapon-class-icon':('objects-inventory',sword_icon()),'spear':('objects-inventory',spear()),'axe':('objects-inventory',axe()),'helmet':('objects-inventory',helmet()),'stethoscope':('objects-inventory',scope()),'luckstone':('objects-inventory',stone()),'confused-badge':('ui-status-overlays',badge_question()),'blind-badge':('ui-status-overlays',blind()),'glyph-debug-overlay':('ui-status-overlays',glyph())}
for aid,(cat,im) in MAP.items(): save(aid,cat,im)
status=json.loads(STATUS.read_text()); manifest=json.loads(EMAN.read_text())
for aid,(cat,im) in MAP.items():
 rec=status.setdefault('assets',{}).get(aid,{})
 rec.update({'id':aid,'categorySlug':cat,'outputPath':f'asset-generation/outputs/{cat}/{aid}.png','installedPath':f'electron-poc/assets/tiles/generated/{cat}/{aid}.png','status':'installed','completedAt':time.strftime('%FT%TZ', time.gmtime()),'workflow':'asset-generation/workflows/krea2_basic_rem_back.json','workflowLabel':'transparent-rmbg-curated-alpha-fix','transparentCuratedFix':True,'backupRoot':str(BACK.relative_to(ROOT))})
 status['assets'][aid]=rec
status.setdefault('runs',[]).append({'type':'transparent-low-alpha-curated-fixes','completedAt':time.strftime('%FT%TZ', time.gmtime()),'ids':list(MAP),'backupRoot':str(BACK.relative_to(ROOT))})
STATUS.write_text(json.dumps(status,indent=2))
print('curated transparent fixes',len(MAP),'backup',BACK)
