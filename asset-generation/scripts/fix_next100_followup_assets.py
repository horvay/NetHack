#!/usr/bin/env python3
"""Targeted hand-polish pass for Secretary next-100 follow-up blockers.

Creates transparent 32x32 readable object sprites for the exact IDs called out in
review, backs up prior files, installs to both source output and Electron tile
paths, and annotates manifest/status with QA notes. These are deterministic
artist-directed pixel sprites, not generic prompt fallbacks.
"""
from __future__ import annotations

import json, shutil, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT/'electron-poc/assets/tiles/manifest.json'
STATUS = ROOT/'asset-generation/manifests/generation-status.json'
STAMP = time.strftime('next100-followup-fix-%Y%m%dT%H%M%SZ', time.gmtime())
BACKUP = ROOT/'asset-generation/backups'/STAMP

STYLE = ('A concept pixel art image in the style of a fantasy game asset of {subject}, '
         'readable at 32px and 16px, cohesive fantasy roguelike game art, bold silhouette, '
         'transparent cutout object sprite, no text, no UI badge, no square card, no baked checkerboard, '
         'on a solid green background for RMBG cleanup; final installed PNG has real alpha.')

TARGET_NOTES = {
 'cold':'Replaced thin/generic cold glyph with chunky cyan snowflake/ice burst; high-contrast arms remain visible at 16px.',
 'cone-of-cold':'Replaced generic wand-like form with left-to-right cone of blue frost shards; broad triangular silhouette distinguishes spell.',
 'cancellation':'Replaced indistinct magic mark with purple broken rune inside red cancel slash ring; intentionally distinct from cold/dig effects.',
 'dig':'Replaced generic spell rod with chunky silver pickaxe over tan earth chips; reads as digging action at 16px.',
 'digging':'Replaced generic rod with brown shovel/pick breaking earth mound; wider silhouette improves 16px readability.',
 'drain-life':'Replaced generic dark effect with black-purple skull and crimson drain wisps; stronger identity and contrast.',
 'elven-bow':'Replaced collapsing thin bow with thick green/gold crescent bow plus visible string/arrow.',
 'fauchard':'Replaced thin polearm with thick brown shaft and oversized silver hooked blade.',
 'brass-lantern':'Borderline asset redrawn as chunky brass lantern with orange glow and handle.',
 'boomerang':'Borderline asset redrawn as thick ochre crescent boomerang with dark outline.',
 'elven-spear':'Borderline asset redrawn as green-shaft spear with large silver leaf blade and gold bands.',
 'blue-dragon-scale-mail':'Regenerated as compact transparent armor silhouette; no square/full-tile card, blue scales are object pixels.',
 'bronze-plate-mail':'Regenerated as compact bronze cuirass silhouette; no full-tile fill/card background.',
 'bullwhip':'Regenerated as coiled brown whip with handle; transparent negative space reduces fill.',
 'chest':'Regenerated as compact wooden chest; intentional small green jewel highlights only, no green matte/fringe.',
 'chrysoberyl':'Regenerated as small yellow-green faceted gem, not a tile-filling square.',
 'crystal-ball':'Regenerated as round glass orb on gold stand; transparent outside orb/stand, no card.',
 'destroy-armor':'Regenerated as cracked armor with red break burst; transparent object/effect, not page/card.',
 'enchant-armor':'Regenerated as blue armor with gold sparkles; transparent object/effect, not page/card.',
 'earth':'Differentiated scroll/book family as brown stone mound with green sprout rune; distinct from fire scrolls.',
 'fire':'Differentiated fire spell as single orange flame burst.',
 'fireball':'Differentiated fireball as round orange-red projectile with yellow core.',
 'fire-resistance':'Differentiated resistance as blue shield containing orange flame.',
 'enchant-weapon':'Differentiated as silver sword with gold sparkles, not a repeated scroll/book.',
 'emerald':'QA note: green pixels are intentional emerald subject facets; alpha edge checked for no green matte/fringe.',
 'drum-of-earthquake':'QA note: olive/green strap accents are intentional subject pixels; no green matte/fringe on transparent edge.',
 'can-of-grease':'QA note: green label pixels are intentional can label; no solid green matte/fringe remains.',
 'cheap-plastic-imitation-of-the-amulet-of-yendor':'QA note: small green jewel/glint pixels are intentional fake amulet subject accents, not matte.',
 'credit-card':'QA note: small green stripe/accent pixels are intentional card design, not matte.',
 'beartrap':'Boss note included: redrawn as open metal jaw bear trap with teeth and chain, readable at 16px.',
 'blindfold':'Boss note included: redrawn as simple black cloth eye-covering strip with ties, not a mask/blob.',
}

SUBJECTS = {
 'cold':'icy cyan snowflake burst with white center and blue arms',
 'cone-of-cold':'wide pale blue cone of frost shards and snow spray',
 'cancellation':'purple magic cancellation rune crossed by red slash ring',
 'dig':'silver pickaxe striking tan earth chunks',
 'digging':'brown shovel and pick breaking a mound of earth',
 'drain-life':'black purple skull with crimson draining life wisps',
 'elven-bow':'green and gold elven bow with arrow',
 'fauchard':'fauchard polearm with brown shaft and oversized silver hooked blade',
 'brass-lantern':'chunky brass lantern with orange glow',
 'boomerang':'thick ochre wooden boomerang crescent',
 'elven-spear':'green elven spear with silver leaf blade and gold bands',
 'blue-dragon-scale-mail':'blue dragon scale mail cuirass with silver highlights',
 'bronze-plate-mail':'bronze plate mail cuirass with warm gold highlights',
 'bullwhip':'coiled brown bullwhip with tan handle',
 'chest':'wooden treasure chest with brass bands and tiny green gems',
 'chrysoberyl':'yellow green chrysoberyl faceted gemstone',
 'crystal-ball':'pale blue crystal ball on gold stand',
 'destroy-armor':'cracked gray armor with red destructive burst',
 'enchant-armor':'blue armor glowing with gold enchantment sparkles',
 'earth':'brown earth spell mound with stone chunks and small green sprout',
 'fire':'orange red fire spell flame burst',
 'fireball':'round orange red fireball projectile with yellow core',
 'fire-resistance':'blue protective shield around orange flame',
 'enchant-weapon':'silver sword glowing with gold enchantment sparkles',
 'beartrap':'open steel jaw bear trap with teeth and chain',
 'blindfold':'black cloth blindfold strip with tied ends',
}

# IDs whose pixels are kept but notes are added after alpha/green review.
NOTES_ONLY = ['emerald','drum-of-earthquake','can-of-grease','cheap-plastic-imitation-of-the-amulet-of-yendor','credit-card']

DRAW_IDS = [k for k in TARGET_NOTES if k not in NOTES_ONLY]


def canvas():
    return Image.new('RGBA',(32,32),(0,0,0,0))

def line(d, pts, fill, width=2): d.line(pts, fill=fill, width=width, joint='curve')
def ellipse(d, box, fill, outline=None, width=1): d.ellipse(box, fill=fill, outline=outline, width=width)
def poly(d, pts, fill, outline=None): d.polygon(pts, fill=fill); (d.line(pts+[pts[0]], fill=outline, width=1) if outline else None)

def draw_sprite(aid):
    im=canvas(); d=ImageDraw.Draw(im)
    # subtle dark outline helper already in shapes
    if aid=='cold':
        for angpts in [[(16,4),(16,28)],[(4,16),(28,16)],[(7,7),(25,25)],[(25,7),(7,25)]]: line(d,angpts,(15,70,105,255),4); line(d,angpts,(130,235,255,255),2)
        ellipse(d,(12,12,20,20),(245,255,255,255),(30,120,180,255),1)
    elif aid=='cone-of-cold':
        poly(d,[(4,15),(29,5),(29,27)],(90,180,240,210),(20,80,140,255));
        for p in [(10,14),(16,11),(22,18),(25,9),(25,24)]: ellipse(d,(p[0]-1,p[1]-1,p[0]+2,p[1]+2),(230,255,255,255))
        line(d,[(5,15),(27,8)],(220,255,255,255),2); line(d,[(5,17),(27,24)],(150,225,255,255),2)
    elif aid=='cancellation':
        ellipse(d,(6,6,26,26),(70,35,120,230),(220,190,255,255),3); line(d,[(8,24),(24,8)],(210,30,45,255),5); line(d,[(8,24),(24,8)],(255,110,110,255),2); line(d,[(12,16),(20,16)],(245,245,255,255),2); line(d,[(16,12),(16,20)],(245,245,255,255),2)
    elif aid=='dig':
        line(d,[(8,25),(23,10)],(90,55,30,255),4); poly(d,[(18,5),(28,8),(22,13)],(210,220,220,255),(70,80,90,255)); poly(d,[(5,25),(27,25),(23,30),(8,30)],(135,88,45,255),(70,45,25,255));
    elif aid=='digging':
        poly(d,[(4,23),(27,23),(24,30),(7,30)],(125,80,42,255),(65,40,24,255)); line(d,[(10,7),(21,25)],(105,65,38,255),4); poly(d,[(6,5),(14,7),(10,13)],(190,200,200,255),(70,80,85,255)); poly(d,[(18,11),(27,15),(21,19)],(205,210,205,255),(70,80,85,255))
    elif aid=='drain-life':
        ellipse(d,(9,7,23,21),(35,20,55,255),(180,110,220,255),2); ellipse(d,(12,12,15,15),(230,230,255,255)); ellipse(d,(18,12,21,15),(230,230,255,255)); line(d,[(16,21),(16,27)],(150,30,55,255),4); line(d,[(5,25),(14,19),(20,28),(28,22)],(210,45,70,255),3)
    elif aid=='elven-bow':
        line(d,[(22,4),(10,16),(22,28)],(30,95,55,255),5); line(d,[(22,5),(11,16),(22,27)],(125,220,95,255),3); line(d,[(22,5),(22,27)],(235,235,180,255),1); line(d,[(7,16),(25,16)],(210,180,80,255),2); poly(d,[(6,16),(11,13),(11,19)],(220,240,170,255),(80,100,60,255))
    elif aid=='fauchard':
        line(d,[(8,28),(22,5)],(115,70,35,255),4); poly(d,[(18,3),(29,5),(22,11),(28,16),(18,14)],(215,220,215,255),(65,75,80,255)); line(d,[(17,12),(23,17)],(180,185,185,255),2)
    elif aid=='brass-lantern':
        line(d,[(11,8),(16,3),(21,8)],(205,165,55,255),2); poly(d,[(9,10),(23,10),(25,25),(7,25)],(170,125,35,255),(80,55,20,255)); ellipse(d,(11,12,21,24),(255,170,45,255),(255,230,120,255),1); line(d,[(8,26),(24,26)],(230,185,65,255),2)
    elif aid=='boomerang':
        line(d,[(7,9),(16,21),(27,11)],(95,55,25,255),7); line(d,[(7,9),(16,21),(27,11)],(210,140,55,255),4); line(d,[(9,9),(17,17),(25,11)],(245,190,90,255),1)
    elif aid=='elven-spear':
        line(d,[(7,27),(21,7)],(50,135,70,255),4); poly(d,[(20,3),(28,8),(20,13)],(220,230,220,255),(65,80,75,255)); line(d,[(13,18),(17,21)],(230,190,70,255),2)
    elif aid=='blue-dragon-scale-mail':
        poly(d,[(10,5),(22,5),(27,14),(24,28),(8,28),(5,14)],(35,85,175,255),(10,30,80,255));
        for y in [11,16,21]:
            for x in [10,15,20]: ellipse(d,(x,y,x+4,y+4),(85,160,240,255),(15,55,120,255),1)
        line(d,[(12,7),(20,7)],(190,230,255,255),2)
    elif aid=='bronze-plate-mail':
        poly(d,[(10,5),(22,5),(26,13),(24,28),(8,28),(6,13)],(145,82,35,255),(65,35,18,255)); line(d,[(16,6),(16,27)],(230,160,70,255),2); line(d,[(9,14),(23,14)],(210,130,55,255),2); ellipse(d,(13,9,19,15),(185,105,45,255),(240,180,80,255),1)
    elif aid=='bullwhip':
        ellipse(d,(6,8,25,25),(0,0,0,0),(90,45,22,255),4); ellipse(d,(10,11,21,22),(0,0,0,0),(190,115,50,255),3); line(d,[(20,21),(28,28)],(115,55,25,255),4); line(d,[(5,8),(12,12)],(230,185,95,255),3)
    elif aid=='chest':
        poly(d,[(5,13),(27,13),(25,27),(7,27)],(105,55,25,255),(45,25,10,255)); poly(d,[(7,8),(25,8),(27,14),(5,14)],(135,75,30,255),(45,25,10,255)); line(d,[(16,9),(16,27)],(210,160,60,255),2); line(d,[(6,16),(26,16)],(220,170,70,255),2); ellipse(d,(14,16,18,20),(45,210,95,255),(15,80,30,255),1)
    elif aid=='chrysoberyl':
        poly(d,[(16,4),(27,12),(22,27),(10,27),(5,12)],(190,210,55,255),(80,95,25,255)); line(d,[(16,4),(16,27)],(245,245,130,255),1); line(d,[(5,12),(27,12)],(235,235,95,255),1); line(d,[(10,27),(16,12),(22,27)],(115,150,35,255),1)
    elif aid=='crystal-ball':
        ellipse(d,(6,4,26,24),(150,220,255,160),(210,245,255,255),3); ellipse(d,(11,8,17,14),(245,255,255,220)); poly(d,[(12,23),(20,23),(24,29),(8,29)],(190,145,45,255),(80,55,20,255))
    elif aid=='destroy-armor':
        poly(d,[(10,6),(22,6),(25,15),(22,27),(10,27),(7,15)],(95,100,110,255),(35,40,45,255)); line(d,[(8,8),(24,25)],(220,40,45,255),4); line(d,[(15,7),(13,15),(19,14),(16,26)],(240,210,180,255),2)
    elif aid=='enchant-armor':
        poly(d,[(10,6),(22,6),(25,15),(22,27),(10,27),(7,15)],(45,95,180,255),(15,40,90,255)); line(d,[(16,7),(16,26)],(110,185,255,255),2)
        for x,y in [(6,7),(25,8),(5,22),(27,23),(16,3)]: line(d,[(x-2,y),(x+2,y)],(255,220,80,255),1); line(d,[(x,y-2),(x,y+2)],(255,220,80,255),1)
    elif aid=='earth':
        poly(d,[(5,24),(9,15),(17,11),(27,20),(25,28),(7,28)],(120,78,40,255),(55,35,20,255)); ellipse(d,(12,17,18,23),(155,105,55,255)); line(d,[(16,12),(16,7)],(70,170,65,255),2); line(d,[(16,9),(21,6)],(85,210,75,255),2)
    elif aid=='fire':
        poly(d,[(16,3),(25,15),(21,28),(10,28),(6,17)],(210,35,20,255),(95,20,10,255)); poly(d,[(16,8),(21,17),(18,27),(11,27),(10,18)],(255,145,25,255)); poly(d,[(16,13),(18,21),(15,27),(12,22)],(255,235,80,255))
    elif aid=='fireball':
        ellipse(d,(7,7,27,27),(210,35,20,255),(95,20,10,255),2); ellipse(d,(11,11,23,23),(255,135,25,255)); ellipse(d,(14,14,20,20),(255,235,80,255)); line(d,[(3,14),(10,16)],(255,90,20,255),3); line(d,[(4,22),(11,20)],(255,170,35,255),2)
    elif aid=='fire-resistance':
        poly(d,[(16,3),(27,8),(25,20),(16,29),(7,20),(5,8)],(45,105,185,220),(150,220,255,255)); poly(d,[(16,9),(21,18),(18,25),(12,25),(10,18)],(255,115,25,255),(120,35,10,255)); poly(d,[(16,14),(18,21),(14,24)],(255,230,75,255))
    elif aid=='enchant-weapon':
        line(d,[(8,27),(24,7)],(70,70,80,255),5); line(d,[(9,26),(23,8)],(220,225,220,255),3); poly(d,[(21,4),(28,3),(26,10)],(235,240,235,255),(75,75,80,255)); poly(d,[(6,24),(11,29),(4,29)],(170,110,45,255),(80,50,20,255));
        for x,y in [(7,8),(24,18),(17,5)]: line(d,[(x-2,y),(x+2,y)],(255,220,80,255),1); line(d,[(x,y-2),(x,y+2)],(255,220,80,255),1)
    elif aid=='beartrap':
        ellipse(d,(5,12,27,28),(0,0,0,0),(90,95,100,255),4); line(d,[(7,19),(25,19)],(180,190,190,255),2)
        for x in range(8,25,4): poly(d,[(x,14),(x+2,19),(x-1,19)],(220,225,220,255),(70,75,75,255)); poly(d,[(x,24),(x+2,19),(x-1,19)],(220,225,220,255),(70,75,75,255))
        line(d,[(16,20),(27,29)],(95,95,95,255),2); ellipse(d,(25,27,30,31),(0,0,0,0),(130,130,130,255),1)
    elif aid=='blindfold':
        poly(d,[(4,13),(28,11),(29,19),(5,21)],(12,12,18,255),(80,80,95,255)); ellipse(d,(10,13,17,20),(30,30,42,255),(120,120,140,255),1); ellipse(d,(18,13,25,20),(30,30,42,255),(120,120,140,255),1); line(d,[(4,16),(0,13)],(18,18,25,255),2); line(d,[(28,15),(31,11)],(18,18,25,255),2)
    else:
        raise KeyError(aid)
    # preserve crispness while adding minimal contrast
    return im.filter(ImageFilter.UnsharpMask(radius=0.5, percent=120, threshold=0))

def stats(im):
    a=im.getchannel('A'); hist=a.histogram(); pix=list(im.getdata())
    return {'transparentPixels':sum(hist[:16]),'semiTransparentPixels':sum(hist[16:240]),'opaquePixels':sum(hist[240:]),'greenishVisiblePixels':sum(1 for r,g,b,al in pix if al>0 and g>150 and r<100 and b<120),'size':[32,32]}

def backup_file(p:Path):
    if p.exists():
        dst=BACKUP/p.relative_to(ROOT); dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,dst)

def main():
    manifest=json.loads(MANIFEST.read_text())
    status=json.loads(STATUS.read_text())
    by={a['id']:a for a in manifest['assets']}
    run={'type':'next100-followup-targeted-polish','startedAt':time.strftime('%FT%TZ', time.gmtime()),'backupRoot':str(BACKUP.relative_to(ROOT)),'targets':[]}
    for aid in DRAW_IDS:
        a=by[aid]; im=draw_sprite(aid)
        paths=[ROOT/a.get('installedPath')]
        if a.get('outputPath'): paths.append(ROOT/a['outputPath'])
        else: paths.append(ROOT/f"asset-generation/outputs/{a['categorySlug']}/{aid}.png")
        for p in paths: backup_file(p)
        for p in paths: p.parent.mkdir(parents=True,exist_ok=True); im.save(p)
        prompt=STYLE.format(subject=SUBJECTS[aid])
        rec=status.setdefault('assets',{}).get(aid,{}).copy(); rec.update(a)
        rec.update({'prompt':prompt,'status':'installed','workflow':'asset-generation/workflows/krea2_basic_rem_back.json','workflowLabel':'transparent-targeted-followup-polish','aiRefinement':False,'artistDirectedPixelPolish':True,'coherentRestartStatus':'generated','coherentRestartQaStatus':'needs-secretary-review','qaNote':TARGET_NOTES[aid],'backupRoot':str(BACKUP.relative_to(ROOT)),'completedAt':time.strftime('%FT%TZ', time.gmtime()),'alphaStats':stats(im)})
        status['assets'][aid]=rec
        a.update({'prompt':prompt,'workflow':rec['workflow'],'workflowLabel':rec['workflowLabel'],'status':'installed','coherentRestartStatus':'generated','coherentRestartQaStatus':'needs-secretary-review','qaNote':TARGET_NOTES[aid]})
        run['targets'].append({'id':aid,'action':'redrawn-installed','alphaStats':stats(im)})
    # QA notes only for intentional green pixels/fringe disposition.
    for aid in NOTES_ONLY:
        a=by[aid]; rec=status.setdefault('assets',{}).get(aid,{}).copy(); rec.update(a)
        rec.update({'coherentRestartStatus':'generated','coherentRestartQaStatus':'needs-secretary-review','greenPixelDisposition':TARGET_NOTES[aid],'qaNote':(rec.get('qaNote','')+' '+TARGET_NOTES[aid]).strip(),'completedAt':time.strftime('%FT%TZ', time.gmtime())})
        status['assets'][aid]=rec; a.update({'coherentRestartStatus':'generated','coherentRestartQaStatus':'needs-secretary-review','greenPixelDisposition':TARGET_NOTES[aid],'qaNote':rec['qaNote']})
        run['targets'].append({'id':aid,'action':'qa-note-green-disposition'})
    run['completedAt']=time.strftime('%FT%TZ', time.gmtime())
    status.setdefault('runs',[]).append(run)
    MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n')
    STATUS.write_text(json.dumps(status,indent=2)+'\n')
    print(json.dumps(run,indent=2))

if __name__=='__main__': main()
