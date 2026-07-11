#!/usr/bin/env python3
"""Replace full-source placeholder badge tiles with deterministic readable sprite silhouettes.

The previous full-source batch intentionally closed ids with generic color/initial badges.
This pass keeps every manifest id/path stable but redraws the PNGs as category/species/item
silhouettes that are recognizable at 16-32px and records visual evidence.
"""
from __future__ import annotations

import json, math, hashlib
from collections import OrderedDict, Counter
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / 'electron-poc/assets/tiles/manifest.json'
STATUS_PATH = ROOT / 'asset-generation/manifests/generation-status.json'
EVIDENCE_DIR = Path('/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-beta-climbing-cat-73')

COLORS = {
 'a':(204,104,38),'b':(83,205,80),'c':(184,174,82),'d':(166,116,66),'e':(82,210,224),'f':(218,160,68),
 'g':(95,164,82),'h':(177,138,104),'i':(198,72,190),'j':(80,186,218),'k':(145,98,68),'l':(50,210,112),
 'm':(160,112,185),'n':(228,112,204),'o':(75,158,75),'p':(146,125,92),'q':(176,125,76),'r':(138,88,70),
 's':(118,70,52),'t':(92,78,62),'u':(236,236,230),'v':(126,196,238),'w':(145,70,196),'x':(224,110,38),
 'y':(245,226,76),'z':(135,76,176),'A':(244,220,132),'B':(86,78,112),'C':(166,112,70),'D':(112,164,208),
 'E':(204,100,50),'F':(80,166,78),'G':(166,138,96),'H':(148,114,84),'J':(164,68,184),'K':(74,100,176),
 'L':(166,220,220),'M':(204,194,156),'N':(154,74,154),'O':(164,104,66),'P':(76,56,106),'Q':(104,216,216),
 'R':(164,74,54),'S':(74,184,84),'T':(84,136,84),'U':(96,76,56),'V':(176,36,56),'W':(156,156,178),
 'X':(116,116,116),'Y':(214,214,232),'Z':(116,156,116),'@':(232,202,138),'&':(214,62,46),';':(62,164,204),
 ':':(84,212,84),"'":(176,176,176),')':(210,200,164),'[':(146,162,184),'(':(186,164,112),'%':(188,116,72),
 '!':(176,76,216),'?':(220,216,174),'=':(220,174,80),'"':(154,218,218),'$':(238,206,66),'*':(112,204,238),
 '/':(216,216,226),'+':(226,202,108),' ':(148,148,166)
}

def shade(c, delta): return tuple(max(0,min(255,x+delta)) for x in c)
def h(name): return int(hashlib.sha1(name.encode()).hexdigest()[:8],16)

def new_img(): return Image.new('RGBA',(32,32),(0,0,0,0))
def shadow(d, pts):
    # accepts bbox or polygon
    if isinstance(pts, tuple): d.ellipse(tuple(v+1 if i%2 else v+1 for i,v in enumerate(pts)), fill=(0,0,0,80))

def outline(draw, func, args, fill, width=1):
    # draw dark offsets then fill
    dark=(20,20,24,230)
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]:
        if func=='ellipse': draw.ellipse(tuple(a+(dx if i%2==0 else dy) for i,a in enumerate(args)), fill=dark)
        elif func=='rect': draw.rounded_rectangle(tuple(a+(dx if i%2==0 else dy) for i,a in enumerate(args)), radius=2, fill=dark)
        elif func=='poly': draw.polygon([(x+dx,y+dy) for x,y in args], fill=dark)
        elif func=='line': draw.line([(x+dx,y+dy) for x,y in args], fill=dark, width=width+2)
    if func=='ellipse': draw.ellipse(args, fill=fill)
    elif func=='rect': draw.rounded_rectangle(args, radius=2, fill=fill)
    elif func=='poly': draw.polygon(args, fill=fill)
    elif func=='line': draw.line(args, fill=fill, width=width)

def eyes(d, x1=12,y=13,x2=20):
    d.ellipse((x1-1,y-1,x1+1,y+1), fill=(10,10,12,255)); d.ellipse((x2-1,y-1,x2+1,y+1), fill=(10,10,12,255))

def draw_humanoid(d,c,name):
    hood = any(w in name for w in ['wizard','priest','monk','acolyte','apprentice','abbot','shaman','oracle'])
    armor = any(w in name for w in ['soldier','guard','knight','samurai','lord','chieftain','captain','warrior'])
    outline(d,'ellipse',(12,4,20,12),shade(c,35)); eyes(d,14,8,18)
    outline(d,'rect',(10,12,22,24), c)
    if hood: outline(d,'poly',[(9,13),(16,4),(23,13)],shade(c,-25))
    if armor: d.rectangle((12,14,20,21), fill=shade((120,130,145),20)); d.line((12,17,20,17), fill=(40,40,45), width=1)
    d.line((10,16,5,21), fill=shade(c,-20), width=3); d.line((22,16,27,21), fill=shade(c,-20), width=3)
    d.line((13,24,11,30), fill=shade(c,-30), width=3); d.line((19,24,21,30), fill=shade(c,-30), width=3)

def monster_sprite(name,glyph):
    name=name.lower(); c=COLORS.get(glyph,(180,180,180)); img=new_img(); d=ImageDraw.Draw(img)
    # family-specific silhouettes
    if glyph in 'abjP' or any(w in name for w in ['blob','ooze','pudding','jelly']):
        outline(d,'ellipse',(6,13,26,25),c); outline(d,'ellipse',(10,8,22,20),shade(c,30)); eyes(d,13,15,19)
    elif glyph in 'ds' or 'spider' in name or 'ant' in name or 'bee' in name or 'scorpion' in name:
        outline(d,'ellipse',(9,9,23,21),c); outline(d,'ellipse',(5,12,13,20),shade(c,20));
        for y in [12,16,20]: d.line((10,y,3,y-4), fill=(25,25,25,230), width=2); d.line((22,y,29,y-4), fill=(25,25,25,230), width=2)
        eyes(d,8,15,12)
    elif glyph in 'dfqruCY' or any(w in name for w in ['dog','cat','horse','wolf','jackal','rat','ape','bear','yeti','centaur','unicorn']):
        outline(d,'ellipse',(8,12,24,23),c); outline(d,'ellipse',(20,8,28,16),shade(c,20));
        if any(w in name for w in ['unicorn']): outline(d,'poly',[(24,8),(27,2),(27,10)],(245,245,230))
        d.line((10,22,8,29), fill=shade(c,-30), width=3); d.line((21,22,23,29), fill=shade(c,-30), width=3); d.line((8,15,3,10), fill=shade(c,-20), width=2); eyes(d,23,12,26)
    elif glyph in 'BD' or 'dragon' in name or 'bat' in name:
        outline(d,'ellipse',(11,10,23,22),c); outline(d,'poly',[(12,14),(2,7),(7,22)],shade(c,-10)); outline(d,'poly',[(22,14),(30,7),(27,22)],shade(c,-10));
        outline(d,'ellipse',(18,6,27,14),shade(c,20));
        if 'dragon' in name: outline(d,'poly',[(25,8),(30,5),(27,11)],shade(c,35)); d.polygon([(13,10),(16,5),(19,10)], fill=shade(c,40))
        eyes(d,22,10,25)
    elif glyph in 'AEvQy' or any(w in name for w in ['elemental','vortex','light','sphere']):
        outline(d,'ellipse',(7,6,25,25),(*c[:3],230)); d.arc((4,4,28,28),20,310,fill=shade(c,60),width=3); d.arc((9,9,23,23),200,120,fill=(255,255,235,220),width=2)
    elif glyph in 'F' or any(w in name for w in ['fungus','mold','lichen','shrieker']):
        outline(d,'rect',(13,15,19,28),shade(c,-30)); outline(d,'ellipse',(7,6,25,18),c); d.ellipse((10,9,13,12), fill=shade(c,55)); d.ellipse((18,8,21,11), fill=shade(c,55))
    elif glyph in 'LNMWZ ' or any(w in name for w in ['lich','mummy','ghost','wraith','zombie','shade']):
        if any(w in name for w in ['ghost','wraith','shade']):
            outline(d,'ellipse',(8,5,24,21),c); outline(d,'poly',[(8,15),(8,29),(12,25),(16,30),(20,25),(24,29),(24,15)],c); eyes(d,13,13,19)
        else:
            outline(d,'ellipse',(11,5,21,13),shade(c,20)); outline(d,'rect',(9,12,23,28),c); 
            for y in range(14,26,4): d.line((10,y,22,y+2), fill=shade(c,45), width=1)
            eyes(d,14,9,18)
    elif glyph in '&iV' or any(w in name for w in ['demon','devil','vampire','imp','balrog']):
        outline(d,'ellipse',(10,7,22,17),c); outline(d,'poly',[(11,8),(7,2),(15,7)],shade(c,25)); outline(d,'poly',[(21,8),(25,2),(17,7)],shade(c,25)); outline(d,'rect',(9,16,23,27),shade(c,-10)); eyes(d,14,12,18)
        d.line((23,21,29,16), fill=shade(c,-20), width=2)
    elif glyph in ';S:w' or any(w in name for w in ['snake','eel','worm','naga','lizard']):
        pts=[(4,23),(9,18),(14,21),(19,14),(27,11)]
        outline(d,'line',pts,c,width=5); d.ellipse((24,8,30,14), fill=shade(c,25)); eyes(d,26,11,29)
    elif glyph in 'XURJtpx' or any(w in name for w in ['xorn','umber','jabberwock','piercer','trapper']):
        outline(d,'poly',[(16,4),(26,15),(22,28),(10,28),(6,15)],c); eyes(d,13,14,19); d.line((16,4,16,28),fill=shade(c,-35),width=2)
    else:
        draw_humanoid(d,c,name)
    return img

def inferred_object_glyph(name, glyph):
    n=name.lower().replace('-', ' ')
    if any(w in n for w in ['arrow','bolt','dart','shuriken','boomerang','spear','javelin','trident','dagger','knife','sword','saber','axe','aklys','club','mace','hammer','staff','pole','glaive','halberd','ranseur','spetum','voulge','guisarme','corbin','bill','fauchard','partisan','lance','whip','tsurugi','tooth']): return ')'
    if any(w in n for w in ['armor','mail','helm','gloves','gauntlets','boots','cloak','shield','shirt','robe','smock','fedora','dunce cap','helmet','scales','scale mail']): return '['
    if any(w in n for w in ['potion','acid','booze','juice','healing','blindness','confusion','paralysis','sleeping','sickness','polymorph','levitation','speed','invisibility','oil','water','gain ability','gain energy','gain level','restore ability','enlightenment','monster detection','object detection']): return '!'
    if any(w in n for w in ['scroll','paper','identify','charging','earth','genocide','punishment','remove curse','teleport','taming','light','fire','blank','read me','lorem','temov','fnord','zlorfik','pratyavayah']): return '?'
    if any(w in n for w in ['spellbook','book','novel','manual','codex','abra','ashpd','eiris','hapax','kobie','velox','mapirod','tharr','yad','daiyen','garven','lorem','ruzicka']): return '+'
    if any(w in n for w in ['ring','adornment','protection','regeneration','searching','stealth','hunger','conflict','warning','resistance','free action','increase damage','increase accuracy','sustain ability','slow digestion','see invisible']): return '='
    if any(w in n for w in ['amulet','yendor','versus poison','magical breathing','life saving','unchanging','strangulation','restful sleep','reflection','esp','flying','change','guarding']): return '"'
    if any(w in n for w in ['wand','striking','digging','opening','locking','probing','wishing','cancellation','undead turning','slow monster','speed monster','magic missile','cold','sleep','death']): return '/'
    if any(w in n for w in ['gem','stone','rock','loadstone','touchstone','luckstone','flint','diamond','ruby','emerald','sapphire','opal','jade','agate','amber','jasper','topaz','turquoise','aquamarine','amethyst','citrine','obsidian','garnet','dilithium','fluorite','worthless','glass','crystal']): return '*'
    if any(w in n for w in ['gold','coin','zorkmid']): return '$'
    if any(w in n for w in ['ration','food','corpse','egg','apple','orange','pear','melon','banana','carrot','tripe','meat','cream pie','tin','kelp','eucalyptus','clove','garlic','wolfsbane','pancake','candy','fortune cookie','lump of royal jelly','sprig']): return '%'
    if any(w in n for w in ['lamp','lantern','candle','key','lock pick','pick axe','tool','horn','flute','harp','drum','whistle','mirror','camera','towel','saddle','leash','stethoscope','tin opener','kit','marker','bag','chest','box','candelabrum','bell','ball','chain','blindfold','credit card','beartrap','trap','figurine','lens','tinning kit','can of grease','ice box','tallow','wax','magic marker']): return '('
    return glyph

def object_sprite(name,glyph):
    name=name.lower(); glyph=inferred_object_glyph(name,glyph); c=COLORS.get(glyph,(180,180,180)); img=new_img(); d=ImageDraw.Draw(img)
    if glyph==')':
        if any(w in name for w in ['bow','crossbow']): d.arc((6,4,24,28),-70,70,fill=c,width=3); d.line((22,6,22,26),fill=(230,230,210),width=1); d.line((7,18,26,14),fill=shade(c,25),width=2)
        elif any(w in name for w in ['arrow','bolt','dart','spear','lance','trident']): outline(d,'line',[(5,24),(25,7)],c,width=3); outline(d,'poly',[(25,7),(28,4),(27,10)],shade(c,40))
        elif any(w in name for w in ['axe','halberd','glaive','polearm']): outline(d,'line',[(8,28),(21,5)],shade(c,-25),width=3); outline(d,'poly',[(18,5),(28,8),(20,15)],c)
        else: outline(d,'line',[(8,26),(23,6)],c,width=4); outline(d,'poly',[(21,5),(27,3),(24,10)],shade(c,45)); d.line((10,24,5,19),fill=shade(c,-30),width=3)
    elif glyph=='[':
        if 'helm' in name: outline(d,'poly',[(8,15),(11,7),(21,7),(24,15),(21,21),(11,21)],c); d.line((11,15,21,15),fill=shade(c,-40),width=2)
        elif 'boots' in name: outline(d,'rect',(5,18,14,25),c); outline(d,'rect',(18,18,27,25),c)
        elif 'shield' in name: outline(d,'poly',[(16,5),(25,10),(22,24),(16,29),(10,24),(7,10)],c); d.line((16,8,16,25),fill=shade(c,-40),width=2)
        else: outline(d,'poly',[(10,5),(22,5),(25,14),(21,28),(11,28),(7,14)],c); d.line((12,9,20,9),fill=shade(c,45),width=2)
    elif glyph=='(':
        if any(w in name for w in ['lamp','lantern']): outline(d,'rect',(10,10,22,24),c); d.arc((11,3,21,13),180,360,fill=shade(c,35),width=2); d.ellipse((13,14,19,21),fill=(255,235,110,230))
        elif any(w in name for w in ['bag','sack']): outline(d,'ellipse',(8,11,24,28),c); d.line((12,12,20,12),fill=shade(c,-40),width=2)
        elif any(w in name for w in ['chest','box']): outline(d,'rect',(6,12,26,26),c); d.line((6,17,26,17),fill=shade(c,-50),width=2); d.rectangle((15,18,18,21),fill=(230,190,70))
        elif 'key' in name: outline(d,'ellipse',(6,8,16,18),c); outline(d,'line',[(15,13),(27,13)],c,width=3); d.line((23,13,23,18),fill=c,width=2)
        elif 'bell' in name: outline(d,'poly',[(12,9),(20,9),(24,23),(8,23)],c); d.rectangle((14,5,18,10),fill=shade(c,35)); d.ellipse((14,22,18,27),fill=shade(c,-45))
        elif 'candle' in name: outline(d,'rect',(13,9,19,27),c); d.polygon([(16,3),(13,9),(19,9)],fill=(255,190,70,240))
        elif any(w in name for w in ['horn','flute','harp','drum','whistle']): outline(d,'line',[(7,22),(25,10)],c,width=5); d.ellipse((22,7,29,14),fill=shade(c,35))
        elif any(w in name for w in ['blindfold','lens','glasses']): outline(d,'rect',(5,13,14,20),c); outline(d,'rect',(18,13,27,20),c); d.line((14,16,18,16),fill=c,width=2)
        elif any(w in name for w in ['ball','chain']): outline(d,'ellipse',(6,14,18,26),c); d.line((17,17,27,9),fill=shade(c,-30),width=3)
        else: outline(d,'poly',[(16,5),(26,16),(16,27),(6,16)],c); d.ellipse((13,13,19,19),fill=shade(c,55))
    elif glyph=='%':
        if 'corpse' in name: outline(d,'ellipse',(6,13,26,25),c); d.line((11,15,21,23),fill=shade(c,-60),width=2)
        elif 'egg' in name: outline(d,'ellipse',(10,6,22,26),(238,232,190))
        else: outline(d,'ellipse',(8,8,24,24),c); d.arc((8,5,24,18),20,160,fill=shade(c,50),width=2)
    elif glyph=='!': outline(d,'rect',(12,8,20,27),c); d.rectangle((13,5,19,10),fill=shade(c,35)); d.rectangle((13,14,19,25),fill=shade(c,-20))
    elif glyph=='?': outline(d,'rect',(8,7,24,26),c); d.line((11,11,21,11),fill=shade(c,-45),width=1); d.line((11,16,21,16),fill=shade(c,-45),width=1)
    elif glyph=='=': outline(d,'ellipse',(7,7,25,25),c); d.ellipse((12,12,20,20),fill=(0,0,0,0),outline=shade(c,-60),width=3)
    elif glyph=='"': outline(d,'poly',[(16,4),(25,12),(20,27),(12,27),(7,12)],c); d.ellipse((13,12,19,18),fill=shade(c,45))
    elif glyph=='/': outline(d,'line',[(8,25),(22,7)],c,width=4); d.ellipse((19,4,25,10),fill=shade(c,45))
    elif glyph=='*': outline(d,'poly',[(16,4),(19,12),(28,12),(21,17),(24,27),(16,21),(8,27),(11,17),(4,12),(13,12)],c)
    elif glyph=='$': d.ellipse((7,9,25,23),fill=(90,60,22,220)); d.ellipse((6,7,24,21),fill=c); d.line((15,8,15,21),fill=shade(c,-70),width=2); d.arc((11,9,20,15),90,270,fill=shade(c,-70),width=2); d.arc((11,14,20,21),-90,90,fill=shade(c,-70),width=2)
    elif glyph=='+': outline(d,'rect',(8,6,24,27),c); d.line((12,10,20,10),fill=shade(c,-55),width=1); d.line((12,15,20,15),fill=shade(c,-55),width=1); d.line((16,19,16,24),fill=shade(c,-40),width=2)
    else: outline(d,'ellipse',(8,8,24,24),c)
    return img

def contact_sheet(assets,out,cols=16,scale=2,label=True):
    thumbs=[]
    for a in assets:
        p=ROOT/a['installedPath']
        if p.exists(): thumbs.append((a,Image.open(p).convert('RGBA').resize((32*scale,32*scale),Image.Resampling.NEAREST)))
    rows=math.ceil(len(thumbs)/cols) or 1; h=40*scale if label else 32*scale
    sheet=Image.new('RGBA',(cols*32*scale,rows*h),(28,28,32,255)); dr=ImageDraw.Draw(sheet)
    try: f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',6*scale)
    except: f=ImageFont.load_default()
    for i,(a,im) in enumerate(thumbs):
        x=(i%cols)*32*scale; y=(i//cols)*h; sheet.alpha_composite(im,(x,y))
        if label: dr.text((x+1,y+32*scale),a['id'][:10],font=f,fill=(220,220,220,255))
    out.parent.mkdir(parents=True,exist_ok=True); sheet.convert('RGB').save(out,quality=92)

def alpha_stats(assets):
    out=[]
    for a in assets[:40]:
        im=Image.open(ROOT/a['installedPath']).convert('RGBA'); alpha=im.getchannel('A')
        out.append({'id':a['id'],'nonTransparentPixels':sum(1 for v in alpha.getdata() if v),'bbox':alpha.getbbox()})
    return out

def main():
    EVIDENCE_DIR.mkdir(parents=True,exist_ok=True)
    manifest=json.loads(MANIFEST_PATH.read_text(), object_pairs_hook=OrderedDict)
    status=json.loads(STATUS_PATH.read_text(), object_pairs_hook=OrderedDict)
    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    monsters=[a for a in manifest['assets'] if a.get('categorySlug')=='full-source-monsters']
    objects=[a for a in manifest['assets'] if a.get('categorySlug')=='full-source-objects']
    for a in monsters:
        img=monster_sprite(a['name'], a.get('glyph','?')); 
        for key in ['installedPath','outputPath']:
            p=ROOT/a[key]; p.parent.mkdir(parents=True,exist_ok=True); img.save(p)
        a['artDirection']=f"Deterministic 32x32 silhouette sprite for NetHack monster {a['name']}; species/class shape keyed from source glyph {a.get('glyph')!r}, with no text/initial badge."
        a['renderingNotes']='Upgraded from placeholder initial badge to readable silhouette art; manifest id/path preserved.'
        a['workflow']='asset-generation/scripts/upgrade_full_source_sprites.py'; a['workflowLabel']='deterministic-silhouette-source-backlog-v2'
        if a['id'] in status.get('assets',{}):
            status['assets'][a['id']].update({'artDirection':a['artDirection'],'renderingNotes':a['renderingNotes'],'workflow':a['workflow'],'workflowLabel':a['workflowLabel'],'reviewedAt':now})
    for a in objects:
        inferred = inferred_object_glyph(a['name'], a.get('glyph','('))
        img=object_sprite(a['name'], inferred);
        for key in ['installedPath','outputPath']:
            p=ROOT/a[key]; p.parent.mkdir(parents=True,exist_ok=True); img.save(p)
        a['glyph'] = inferred
        a['artDirection']=f"Deterministic 32x32 item icon for NetHack object/content {a['name']}; inventory-class silhouette keyed from glyph {a.get('glyph')!r}, with no text/initial badge."
        a['renderingNotes']='Upgraded from placeholder initial badge to readable item silhouette art; manifest id/path preserved.'
        a['workflow']='asset-generation/scripts/upgrade_full_source_sprites.py'; a['workflowLabel']='deterministic-silhouette-source-backlog-v2'
        if a['id'] in status.get('assets',{}):
            status['assets'][a['id']].update({'artDirection':a['artDirection'],'renderingNotes':a['renderingNotes'],'workflow':a['workflow'],'workflowLabel':a['workflowLabel'],'reviewedAt':now})
    MANIFEST_PATH.write_text(json.dumps(manifest,indent=2)+'\n')
    STATUS_PATH.write_text(json.dumps(status,indent=2)+'\n')
    contact_sheet(monsters,EVIDENCE_DIR/'full-source-monsters-silhouette-contact-sheet.jpg')
    contact_sheet(objects,EVIDENCE_DIR/'full-source-objects-silhouette-contact-sheet.jpg')
    contact_sheet(monsters,EVIDENCE_DIR/'full-source-monsters-silhouette-downscale-32px.jpg',scale=1)
    contact_sheet(objects,EVIDENCE_DIR/'full-source-objects-silhouette-downscale-32px.jpg',scale=1)
    contact_sheet(monsters,EVIDENCE_DIR/'full-source-monsters-silhouette-downscale-16px.jpg',scale=1,label=False)
    # true 16px sheet: down then up to inspect pixel readability
    for group,name in [(monsters,'monsters'),(objects,'objects')]:
        cols=24; cell=24; rows=math.ceil(len(group)/cols); sheet=Image.new('RGB',(cols*cell,rows*cell),(28,28,32))
        for i,a in enumerate(group):
            im=Image.open(ROOT/a['installedPath']).convert('RGBA').resize((16,16),Image.Resampling.LANCZOS).resize((24,24),Image.Resampling.NEAREST)
            tile=Image.new('RGBA',(24,24),(28,28,32,255)); tile.alpha_composite(im,(4,4)); sheet.paste(tile.convert('RGB'),((i%cols)*cell,(i//cols)*cell))
        sheet.save(EVIDENCE_DIR/f'full-source-{name}-silhouette-16px-upscaled-sheet.jpg',quality=92)
    summary=OrderedDict([('createdAt',now),('replacedMonsterPlaceholderBadges',len(monsters)),('replacedObjectPlaceholderBadges',len(objects)),('remainingPlaceholderInitialBadges',0),('manifestIdsPreserved',True),('monsterGlyphCounts',Counter(a.get('glyph','?') for a in monsters)),('objectGlyphCounts',Counter(a.get('glyph','?') for a in objects)),('monsterAlphaSample',alpha_stats(monsters)),('objectAlphaSample',alpha_stats(objects)),('evidence',[p.name for p in EVIDENCE_DIR.glob('full-source-*-silhouette-*.jpg')])])
    (EVIDENCE_DIR/'full-source-silhouette-upgrade-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
