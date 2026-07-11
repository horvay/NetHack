#!/usr/bin/env python3
"""Generate reviewed NetHack expansion tile batches with the local asset workflow.

This script is intentionally conservative: it only creates missing reviewed expansion
assets, records replacements under asset-generation/backups if --force is used, installs
into electron-poc/assets/tiles/generated, updates the Electron manifest, generation
status, and writes contact-sheet/alpha/downscale evidence.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "asset-generation" / "outputs"
ELECTRON_TILE_DIR = ROOT / "electron-poc" / "assets" / "tiles"
GENERATED_DIR = ELECTRON_TILE_DIR / "generated"
ELECTRON_MANIFEST = ELECTRON_TILE_DIR / "manifest.json"
STATUS_PATH = ROOT / "asset-generation" / "manifests" / "generation-status.json"
EXPANSION_MANIFEST = ROOT / "asset-generation" / "manifests" / "expansion-assets.json"
EVIDENCE_DIR = ROOT / "evidence" / "tile-expansion-batch-20260628"
RUN_EVIDENCE_DIR = Path("/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-epsilon-glowing-cat-80")
TILE = 32
SCALE = 16
OUT = TILE * SCALE

@dataclass
class AssetSpec:
    id: str
    name: str
    category: str
    categorySlug: str
    priority: str
    glyph: str
    why: str
    artDirection: str
    renderingNotes: str
    prompt: str
    status: str = "pending"
    outputPath: str = ""
    installedPath: str = ""
    workflow: str = "asset-generation/scripts/generate_expansion_assets.py"
    workflowLabel: str = "reviewed-local-expansion-batch"


def specs() -> list[AssetSpec]:
    rows = [
        ("throne", "Throne", "\\", "Special-room seat and loot/event feature", "Opaque dark stone dais with a gold high-backed throne silhouette; readable as furniture at 16 px."),
        ("ladder-up", "Ladder up", "<", "Mines and branch vertical travel", "Transparent wooden ladder with bright upward arrow cue and small stone lip."),
        ("ladder-down", "Ladder down", ">", "Mines and branch vertical travel", "Transparent wooden ladder descending into shadow with downward arrow cue."),
        ("branch-stairs-up", "Branch stairs up", "<", "Branch transition stair variant", "Opaque side-branch stone stair with blue-green branch glyph accent and upward glow."),
        ("branch-stairs-down", "Branch stairs down", ">", "Branch transition stair variant", "Opaque side-branch stone stair descending with blue-green branch glyph accent."),
        ("branch-ladder-up", "Branch ladder up", "<", "Branch transition ladder variant", "Transparent ladder with blue-green branch signpost and upward cue."),
        ("branch-ladder-down", "Branch ladder down", ">", "Branch transition ladder variant", "Transparent ladder down with blue-green branch signpost and shadowed bottom."),
        ("magic-portal", "Magic portal", "^", "Portal traps, Quest/Planes transitions", "Transparent violet/cyan oval portal ring with bright center sparkles; no letters."),
        ("vibrating-square", "Vibrating square", ".", "Endgame invocation position", "Opaque cracked floor square with gold vibration waves around a central glowing seam."),
        ("valid-position-marker", "Valid position marker", "*", "Targeting/placement overlay", "Transparent green check-ring/corner marker overlay that does not obscure base terrain."),
        ("air", "Air", " ", "Planes and open-air terrain", "Mostly transparent pale blue swirl wisps, distinct from unexplored stone."),
        ("cloud", "Cloud", "#", "Cloud/fog terrain", "Semi-transparent soft gray-blue cloud puffs with readable mass at 16 px."),
        ("moat-water", "Moat water", "}", "Castle/moat water variant", "Opaque dark blue water with stone edge highlights, distinct from ordinary pool."),
        ("water-wall", "Water wall", "|", "Plane of Water boundary/animated wall", "Opaque vertical wall of deep water with bright crest line and bubbles."),
        ("sea-water", "Sea water", "}", "Sea/large water variant", "Opaque larger-wave teal water tile, lower contrast than creatures/items."),
        ("lava-wall", "Lava wall", "|", "Gehennom/Plane of Fire lava boundary", "Opaque vertical molten rock wall with orange glowing cracks and dark basalt edges."),
        ("beam-north", "Beam north", "|", "Directional ray/zap effect", "Transparent vertical magic beam pointing upward, cyan core and small arrow tip."),
        ("beam-south", "Beam south", "|", "Directional ray/zap effect", "Transparent vertical magic beam pointing downward, cyan core and small arrow tip."),
        ("beam-east", "Beam east", "-", "Directional ray/zap effect", "Transparent horizontal magic beam pointing right, cyan core and arrow tip."),
        ("beam-west", "Beam west", "-", "Directional ray/zap effect", "Transparent horizontal magic beam pointing left, cyan core and arrow tip."),
        ("boom-north", "Boom north", "*", "Directional explosion/boom effect", "Transparent orange burst biased upward with small debris pixels."),
        ("boom-south", "Boom south", "*", "Directional explosion/boom effect", "Transparent orange burst biased downward with small debris pixels."),
        ("boom-east", "Boom east", "*", "Directional explosion/boom effect", "Transparent orange burst biased right with small debris pixels."),
        ("boom-west", "Boom west", "*", "Directional explosion/boom effect", "Transparent orange burst biased left with small debris pixels."),
        ("shield-north", "Shield north", ")", "Directional shield/deflection effect", "Transparent golden shield arc guarding the north side of the tile."),
        ("shield-south", "Shield south", ")", "Directional shield/deflection effect", "Transparent golden shield arc guarding the south side of the tile."),
        ("shield-east", "Shield east", ")", "Directional shield/deflection effect", "Transparent golden shield arc guarding the east side of the tile."),
        ("shield-west", "Shield west", ")", "Directional shield/deflection effect", "Transparent golden shield arc guarding the west side of the tile."),
        ("mines-floor", "Mines floor", ".", "Gnomish Mines branch base terrain", "Opaque rough slate floor with tiny ore flecks; darker and rougher than room floor."),
        ("mines-wall", "Mines wall", "|", "Gnomish Mines branch wall", "Opaque jagged rock wall face with gray/brown facets and readable blocking silhouette."),
        ("mines-corner", "Mines corner", "+", "Gnomish Mines wall junction", "Opaque jagged mine corner with two blocking rock bars meeting."),
        ("sokoban-floor", "Sokoban floor", ".", "Sokoban branch base terrain", "Opaque clean puzzle-room floor with square flagstone grid, low contrast."),
        ("sokoban-wall", "Sokoban wall", "|", "Sokoban branch wall", "Opaque tidy block wall with straight edges and puzzle-dungeon palette."),
        ("sokoban-goal", "Sokoban goal", ".", "Sokoban boulder target/marker", "Opaque floor tile with subtle golden target dot/corners that remains readable under boulders."),
    ]
    out=[]
    for aid,name,glyph,why,art in rows:
        out.append(AssetSpec(aid,name,"Terrain and features","terrain-features","P1",glyph,why,art,
            "Expansion asset; semantic renderer may map by tile id when Pyra's mapping work lands.",
            f"A single NetHack 32x32 readable tile for {name}. {art} Pixel-art/painted-pixel hybrid, no text, no UI frame."))
    return out


def new_tile(transparent=False, base=(28, 25, 28, 255)):
    return Image.new("RGBA", (TILE, TILE), (0,0,0,0) if transparent else base)


def draw_floor_noise(d, color=(45,43,45), accent=(65,62,60)):
    for x,y in [(3,7),(10,22),(21,5),(25,18),(15,14)]:
        d.line((x,y,x+4,y+1), fill=color, width=1)
    for x,y in [(6,25),(24,9),(13,4)]:
        d.point((x,y), fill=accent)


def draw_asset(aid):
    t = new_tile(aid in {"ladder-up","ladder-down","branch-ladder-up","branch-ladder-down","magic-portal","valid-position-marker","air","cloud"} or aid.startswith(("beam-","boom-","shield-")))
    d = ImageDraw.Draw(t, "RGBA")
    if aid in {"throne","vibrating-square","branch-stairs-up","branch-stairs-down","moat-water","water-wall","sea-water","lava-wall","mines-floor","mines-wall","mines-corner","sokoban-floor","sokoban-wall","sokoban-goal"}:
        draw_floor_noise(d)
    if aid == "throne":
        d.rectangle((7,18,24,24), fill=(73,55,38,255), outline=(151,112,45,255))
        d.rectangle((10,7,21,19), fill=(84,62,41,255), outline=(214,164,58,255))
        d.rectangle((12,4,19,8), fill=(188,137,43,255))
        d.point([(13,12),(18,12),(16,17)], fill=(245,216,97,255))
    elif "ladder" in aid:
        color=(147,92,42,255); hi=(226,172,91,255)
        d.line((10,5,10,27), fill=color, width=3); d.line((22,5,22,27), fill=color, width=3)
        for y in [8,13,18,23]: d.line((10,y,22,y), fill=hi, width=2)
        if "branch" in aid: d.polygon([(3,9),(9,6),(9,12)], fill=(50,191,173,230))
        if aid.endswith("up"): d.polygon([(16,1),(12,6),(20,6)], fill=(224,242,255,230))
        else: d.polygon([(16,31),(12,26),(20,26)], fill=(30,20,45,230))
    elif aid.startswith("branch-stairs"):
        for i in range(5): d.rectangle((7+i*3,22-i*3,24,25-i*3), fill=(62+i*8,58+i*7,62+i*5,255), outline=(103,98,111,255))
        d.arc((3,3,29,29), 200, 340, fill=(50,191,173,255), width=2)
        if aid.endswith("up"): d.polygon([(16,4),(12,9),(20,9)], fill=(196,251,241,255))
        else: d.polygon([(16,28),(12,23),(20,23)], fill=(25,79,91,255))
    elif aid == "magic-portal":
        d.ellipse((6,3,26,29), outline=(164,72,255,230), width=4)
        d.ellipse((10,7,22,25), outline=(66,231,245,210), width=2)
        d.point([(16,6),(19,12),(13,21),(23,17),(9,15)], fill=(245,245,255,255))
    elif aid == "vibrating-square":
        d.rectangle((5,5,26,26), outline=(168,132,42,255), width=2)
        d.line((8,16,24,14), fill=(237,191,56,255), width=2)
        for off in [0,3,6]: d.arc((4-off,4-off,28+off,28+off), 315, 45, fill=(216,174,52,255), width=1)
    elif aid == "valid-position-marker":
        c=(75,239,106,230)
        for x1,y1,x2,y2 in [(3,3,11,3),(3,3,3,11),(21,3,29,3),(29,3,29,11),(3,21,3,29),(3,29,11,29),(21,29,29,29),(29,21,29,29)]: d.line((x1,y1,x2,y2), fill=c, width=3)
        d.line((11,17,15,22,23,10), fill=c, width=3)
    elif aid == "air":
        for box in [(4,8,22,20),(10,14,30,27),(0,4,15,14)]: d.arc(box, 180, 350, fill=(158,225,255,165), width=3)
        d.point([(13,11),(20,20),(27,23)], fill=(225,246,255,185))
    elif aid == "cloud":
        for e in [(3,13,14,24),(9,8,22,23),(17,12,30,25),(7,17,25,29)]: d.ellipse(e, fill=(171,190,204,145), outline=(217,229,237,130))
    elif aid in {"moat-water","sea-water"}:
        bg=(12,45,74,255) if aid=="moat-water" else (8,77,93,255)
        d.rectangle((0,0,31,31), fill=bg)
        for y in [8,16,24]: d.arc((2,y-5,18,y+5), 15, 165, fill=(67,173,209,255), width=2); d.arc((15,y-4,33,y+6), 15, 165, fill=(124,215,226,255), width=1)
        if aid=="moat-water": d.line((0,0,31,0), fill=(89,79,67,255), width=3)
    elif aid == "water-wall":
        d.rectangle((7,0,24,31), fill=(10,66,102,255)); d.line((14,0,10,31), fill=(88,202,233,255), width=2); d.line((21,0,18,31), fill=(43,143,196,255), width=2)
    elif aid == "lava-wall":
        d.rectangle((6,0,25,31), fill=(53,32,25,255)); d.line((12,0,16,31), fill=(255,94,21,255), width=3); d.line((20,3,17,29), fill=(255,187,54,255), width=2)
    elif aid.startswith("beam-"):
        dir=aid.split('-')[1]; c=(99,232,255,220); core=(231,255,255,245)
        if dir in ["north","south"]:
            d.line((16,4,16,28), fill=c, width=5); d.line((16,4,16,28), fill=core, width=2)
            d.polygon([(16,1),(12,7),(20,7)] if dir=="north" else [(16,31),(12,25),(20,25)], fill=core)
        else:
            d.line((4,16,28,16), fill=c, width=5); d.line((4,16,28,16), fill=core, width=2)
            d.polygon([(31,16),(25,12),(25,20)] if dir=="east" else [(1,16),(7,12),(7,20)], fill=core)
    elif aid.startswith("boom-"):
        dir=aid.split('-')[1]
        vectors={"north":(0,-1),"south":(0,1),"east":(1,0),"west":(-1,0)}
        vx,vy=vectors[dir]; cx,cy=16+vx*5,16+vy*5
        # Deliberately asymmetric: a bright arrow-head burst in the named direction
        # plus a darker trailing plume opposite it, so direction survives 32px review.
        tip=(16+vx*15,16+vy*15); left=(cx-vy*7-vx*3,cy+vx*7-vy*3); right=(cx+vy*7-vx*3,cy-vx*7-vy*3)
        tail1=(16-vx*11-vy*4,16-vy*11+vx*4); tail2=(16-vx*11+vy*4,16-vy*11-vx*4)
        d.polygon([tip,left,tail1,(16-vx*3,16-vy*3),tail2,right], fill=(255,103,20,220), outline=(255,222,73,245))
        d.line((16-vx*12,16-vy*12, tip[0], tip[1]), fill=(255,238,107,245), width=3)
        d.ellipse((cx-3,cy-3,cx+3,cy+3), fill=(255,245,124,245))
    elif aid.startswith("shield-"):
        dir=aid.split('-')[1]; color=(255,211,78,225)
        boxes={"north":(4,1,28,25,200,340),"south":(4,7,28,31,20,160),"east":(7,4,31,28,110,250),"west":(1,4,25,28,290,70)}[dir]
        d.arc(boxes[:4], boxes[4], boxes[5], fill=color, width=4)
        d.arc((7,7,25,25), 0, 360, fill=(255,244,164,100), width=1)
    elif aid.startswith("mines"):
        if aid == "mines-floor": d.rectangle((0,0,31,31), fill=(36,35,38,255)); draw_floor_noise(d,(58,57,62),(126,105,61))
        elif aid == "mines-wall": d.rectangle((4,0,27,31), fill=(54,50,48,255)); d.line((8,2,24,12,13,30), fill=(93,88,84,255), width=2)
        else: d.rectangle((0,0,31,13), fill=(55,51,50,255)); d.rectangle((0,0,13,31), fill=(48,46,48,255)); d.line((0,13,13,13,13,31), fill=(103,98,91,255), width=2)
    elif aid.startswith("sokoban"):
        if aid == "sokoban-floor" or aid == "sokoban-goal":
            d.rectangle((0,0,31,31), fill=(48,45,50,255))
            for p in [8,16,24]: d.line((p,0,p,31), fill=(65,62,68,255)); d.line((0,p,31,p), fill=(65,62,68,255))
            if aid == "sokoban-goal": d.rectangle((13,13,18,18), outline=(223,174,57,255)); d.point((16,16), fill=(255,225,93,255))
        else:
            d.rectangle((3,0,28,31), fill=(69,64,71,255));
            for y in [5,14,23]: d.line((4,y,27,y), fill=(105,98,107,255), width=2)
    return t.resize((OUT, OUT), Image.Resampling.NEAREST)


def rel(p): return str(p.relative_to(ROOT))


def load_json(path, default):
    if path.exists():
        return json.loads(path.read_text())
    return default


def install(asset, force=False, backup_root=None):
    img = draw_asset(asset.id)
    out = OUTPUT_DIR / asset.categorySlug / f"{asset.id}.png"
    dest = GENERATED_DIR / asset.categorySlug / f"{asset.id}.png"
    for p in [out.parent, dest.parent]: p.mkdir(parents=True, exist_ok=True)
    for p in [out, dest]:
        if p.exists() and not force:
            raise SystemExit(f"Refusing to overwrite existing asset without --force: {rel(p)}")
        if p.exists() and backup_root:
            b = backup_root / rel(p)
            b.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, b)
    img.save(out); shutil.copy2(out, dest)
    link = ELECTRON_TILE_DIR / "by-category" / asset.categorySlug / f"{asset.id}.png"
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.exists() or link.is_symlink():
        if force and backup_root and not link.is_symlink():
            b = backup_root / rel(link); b.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(link,b)
        link.unlink()
    try:
        link.symlink_to(Path("..") / ".." / "generated" / asset.categorySlug / f"{asset.id}.png")
    except OSError:
        shutil.copy2(dest, link)
    asset.outputPath = rel(out); asset.installedPath = rel(dest); asset.status = "installed"


def update_manifests(assets):
    manifest = load_json(ELECTRON_MANIFEST, {"version":1,"tileSize":32,"assets":[]})
    existing = {a["id"]: a for a in manifest.get("assets", [])}
    for a in assets:
        d = asdict(a)
        existing[a.id] = d
    manifest["assets"] = sorted(existing.values(), key=lambda x: (x.get("categorySlug",""), x.get("id","")))
    ELECTRON_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")

    status = load_json(STATUS_PATH, {"assets":{},"runs":[]})
    now = time.strftime("%FT%TZ", time.gmtime())
    for a in assets:
        rec = asdict(a) | {"completedAt": now, "reviewedBatch": "developer-epsilon-glowing-cat-80"}
        status.setdefault("assets", {})[a.id] = rec
    status.setdefault("runs", []).append({"completedAt": now, "script": rel(Path(__file__)), "assetCount": len(assets), "ids": [a.id for a in assets]})
    STATUS_PATH.write_text(json.dumps(status, indent=2) + "\n")

    EXPANSION_MANIFEST.write_text(json.dumps({"source": rel(Path(__file__)), "count": len(assets), "assets": [asdict(a) for a in assets]}, indent=2) + "\n")


def evidence(assets):
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    cols=6; cell=96; label_h=16; rows=math.ceil(len(assets)/cols)
    sheet=Image.new("RGBA", (cols*cell, rows*(cell+label_h)), (18,18,22,255))
    smallsheet=Image.new("RGBA", (cols*48, rows*(48+label_h)), (18,18,22,255))
    d=ImageDraw.Draw(sheet); ds=ImageDraw.Draw(smallsheet)
    alpha=[]
    for i,a in enumerate(assets):
        img=Image.open(ROOT/a.installedPath).convert("RGBA")
        x=(i%cols)*cell; y=(i//cols)*(cell+label_h)
        thumb=img.resize((64,64), Image.Resampling.NEAREST); sheet.alpha_composite(thumb,(x+16,y+4)); d.text((x+2,y+70),a.id[:15],fill=(230,230,230,255))
        small=img.resize((32,32), Image.Resampling.NEAREST); sx=(i%cols)*48; sy=(i//cols)*(48+label_h); smallsheet.alpha_composite(small,(sx+8,sy+4)); ds.text((sx+1,sy+37),a.id[:7],fill=(230,230,230,255))
        ach=img.getchannel("A"); vals=list(ach.getdata())
        ae=ach.getextrema(); opaque=sum(1 for v in vals if v==255); transparent=sum(1 for v in vals if v==0); semi=len(vals)-opaque-transparent
        transparent_expected = a.id in {"ladder-up","ladder-down","branch-ladder-up","branch-ladder-down","magic-portal","valid-position-marker","air","cloud"} or a.id.startswith(("beam-","boom-","shield-"))
        alpha_pass = (transparent > 0 and ae[1] >= 100) if transparent_expected else (transparent == 0 and opaque == len(vals))
        alpha.append({"id":a.id,"size":img.size,"expectedAlpha":"transparent-overlay" if transparent_expected else "opaque-base","alphaExtrema":ae,"fullyOpaquePixels":opaque,"fullyTransparentPixels":transparent,"semiTransparentPixels":semi,"alphaPass":alpha_pass})
    sheet_path=EVIDENCE_DIR/"contact-sheet-expansion-batch.png"; small_path=EVIDENCE_DIR/"downscale-sheet-32px-expansion-batch.png"; alpha_path=EVIDENCE_DIR/"alpha-report-expansion-batch.json"
    sheet.save(sheet_path); smallsheet.save(small_path); alpha_path.write_text(json.dumps(alpha, indent=2)+"\n")
    if RUN_EVIDENCE_DIR.exists():
        for p in [sheet_path, small_path, alpha_path, EXPANSION_MANIFEST]:
            dest=RUN_EVIDENCE_DIR / p.name
            shutil.copy2(p, dest)
    return sheet_path, small_path, alpha_path


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--batch", default="terrain-effects-mines-sokoban")
    ap.add_argument("--force", action="store_true")
    args=ap.parse_args()
    assets=specs()
    existing_paths=[]
    for a in assets:
        for p in [OUTPUT_DIR/a.categorySlug/f"{a.id}.png", GENERATED_DIR/a.categorySlug/f"{a.id}.png"]:
            if p.exists(): existing_paths.append(rel(p))
    if existing_paths and not args.force:
        raise SystemExit("Existing generated outputs found; rerun with --force to replace after backup:\n"+"\n".join(existing_paths))
    backup_root=None
    if args.force:
        backup_root=ROOT/"asset-generation"/"backups"/("expansion-"+time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()))
    for a in assets: install(a, force=args.force, backup_root=backup_root)
    update_manifests(assets)
    sheet, small, alpha = evidence(assets)
    print(json.dumps({"installed":len(assets),"ids":[a.id for a in assets],"contactSheet":rel(sheet),"downscaleSheet":rel(small),"alphaReport":rel(alpha),"backupRoot":rel(backup_root) if backup_root else None}, indent=2))

if __name__ == "__main__":
    main()
