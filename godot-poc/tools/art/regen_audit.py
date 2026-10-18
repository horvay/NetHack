#!/usr/bin/env python3
"""Regenerates the tiles the 2026-10-17 asset audit flagged (weird, unclear, wrong NetHack colour, or flat vector
placeholders) with the local AI model on the shared Arc Pro B70, then installs the ones picked by eye.

The audit lists are asset-generation/outputs/audit-2026-10-17/{A,B,C}/flagged.json: one entry per tile with the
problem and a ready prompt (`regen.prompt`), whether the tile is a sprite on a keyed matte or an opaque terrain tile
(`regen.background`), and whether to redraw from the current tile (`regen.use_reference`, Qwen edit mode with the
tile as image 1).

Krea2 (ASSET_GENERATION.md's ComfyUI workflows) was removed from this PC on 2026-10-17; the one local image model is
Qwen Image 2.1 through ~/ai/weeb/b70-image.sh, run under `b70-lease run` (it waits for the other holder and for free
VRAM). Sprites are generated on a solid green matte as ASSET_GENERATION.md asks, except subjects that are themselves
green, which get a magenta matte; the matte is removed by keying only the background connected to the image border,
so green inside a creature survives, and the edge is despilled. Every result is checked for real alpha and zero
greenish visible pixels before it can be installed.

  regen_audit.py queue [--ids a,b] [--severity high,medium,low] [--seeds 42,8,7] [--size 768] [--dry]
  regen_audit.py post [--ids a,b]              key, shrink to 32 px, contact sheets (current tile beside candidates)
  regen_audit.py install ID SEED [--note TEXT] copy into the shared tileset, update manifest, tracker, backup
"""
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)  # Pillow's getdata, still fine
import argparse, collections, datetime, hashlib, json, os, re, shlex, shutil, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
AUDIT = ROOT / "asset-generation/outputs/audit-2026-10-17"
WORK = ROOT / "asset-generation/outputs/godot-regen/audit"
CAND = WORK / "candidates"
SHEETS = WORK / "sheets"
REFS = WORK / "refs"
MANIFEST = ROOT / "electron-poc/assets/tiles/manifest.json"
TRACKER = ROOT / "asset-generation/manifests/full-regeneration-tracker.md"
BACKUP = ROOT / "asset-generation/backups/2026-10-17-audit-regen"
B70 = Path.home() / "ai/weeb/b70-image.sh"
NEG = ("photograph, realistic, 3d render, blurry, text, letters, numbers, watermark, logo, signature, frame, border, "
       "checkerboard, ui badge, card, icon background, vector clip-art, flat shapes, multiple subjects")
FLOOR = (74, 70, 64)
GREEN, MAGENTA = (0, 255, 0), (255, 0, 255)
# Not regenerated here: they need a front-end change too, or a decision from Greg first.
HOLD = {
    "wall-corner": "one image for all four corners: needs rotated variants and a tile-map change",
    "wall-tee-junction": "one image for all four tees: needs rotated variants and a tile-map change",
    "zap-beam": "one diagonal for both slants: needs a mirrored variant and a tile-map change",
    "newt": "regenerated and approved by Greg on 2026-10-17",
}


def entries():
    """Every flagged tile once; a later share overrides an earlier one (D: tiles Greg reported in play, redesigns and
    new tiles)."""
    out = {}
    for share in "ABCDEF":  # E: sticker-style monsters (Greg: gnomes look terrible); F: wrong-class objects
        path = AUDIT / share / "flagged.json"
        if path.exists():
            for e in json.loads(path.read_text()):
                e["share"] = share
                out[e["id"]] = e
    return list(out.values())


def green_subject(prompt):
    """True when the subject itself is green: a green matte would be keyed out of it."""
    subject = re.split(r"(?i)\bon a solid green background", prompt)[0]
    return re.search(r"(?i)\b(green|lime|emerald|olive|jade|chartreuse|mint|teal|moss)\b", subject) is not None


def matte_of(e):
    if e["regen"].get("background") == "opaque":
        return None
    if e["regen"].get("background") == "magenta-key":
        return MAGENTA
    return MAGENTA if green_subject(e["regen"]["prompt"]) else GREEN


def prompt_of(e):
    p = e["regen"]["prompt"].strip()
    if matte_of(e) == MAGENTA:
        p = re.sub(r"(?i)solid green background", "solid magenta background", p)
        if "magenta background" not in p:
            p += " On a solid magenta background."
    elif matte_of(e) == GREEN and "solid green background" not in p:
        p += " On a solid green background."
    if e["regen"].get("use_reference"):
        p = "Edit image 1, the current game tile. " + p + (" Keep the chunky pixel-art style and outline weight of "
                                                           "image 1, but fix what is wrong.")
    return p


def make_ref(e, size):
    src = ROOT / e["installedPath"]
    out = REFS / f"{e['id']}.png"
    bg = matte_of(e) or FLOOR
    img = Image.open(src).convert("RGBA")
    base = Image.new("RGBA", img.size, bg + (255,))
    base.alpha_composite(img)
    base.convert("RGB").resize((size, size), Image.NEAREST).save(out)
    return out


def cmd_queue(a):
    for d in (WORK, CAND, SHEETS, REFS):
        d.mkdir(parents=True, exist_ok=True)
    seeds = [int(s) for s in a.seeds.split(",")]
    want = set(a.ids.split(",")) if a.ids else None
    sev = set(a.severity.split(","))
    lines = []
    for e in entries():
        if want is not None and e["id"] not in want:
            continue
        if want is None and (e["severity"] not in sev or e["id"] in HOLD):
            continue
        if want is None and e["category"] == "player-combo-avatars" and not a.avatars:
            continue
        for seed in e.get("seeds", seeds):
            out = WORK / f"{e['id']}-s{seed}.png"
            if out.exists():
                continue
            args = ["--seed", str(seed), "-o", str(out), "-p", prompt_of(e)]
            if e["regen"].get("use_reference"):
                args[2:2] = ["-r", str(make_ref(e, a.size))]
            lines.append(" ".join(shlex.quote(x) for x in args))
    jobs = WORK / ("jobs-%s.txt" % datetime.datetime.now().strftime("%H%M%S"))
    jobs.write_text("\n".join(lines) + ("\n" if lines else ""))
    print(f"{len(lines)} jobs in {jobs}")
    if not lines or a.dry:
        return
    env = dict(os.environ)
    env.setdefault("SD_XPU_QWEN21_LIB", str(Path.home() / "ai/stable-diffusion.cpp-b70-native/xpu_sdpa/libxpu_qwen21.so"))
    subprocess.run(["b70-lease", "run", "nethack-art", "--", str(B70), "--batch", str(jobs), "-m", "qwen", "--xpu",
                    "-W", str(a.size), "-H", str(a.size), "-n", NEG, "--cfg-steps", "15"], check=True, env=env)
    cmd_post(a)


def key_matte(img, matte):
    """Removes the matte connected to the border (flood fill), so matte-coloured pixels inside the subject stay, then
    pulls matte spill off the remaining edge pixels."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()

    def is_matte(c):
        r, g, b, _ = c
        if matte == GREEN:
            return g > 110 and g > r * 1.3 + 10 and g > b * 1.3 + 10
        # Qwen's "magenta" ranges from (255,0,255) to a dark (170,30,120).
        return r > 100 and b > 60 and g < min(r, b) * 0.6

    corners = sorted(px[x, y][:3] for x, y in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)))
    corner = corners[1]
    seen = bytearray(w * h)

    def flood(stack):
        while stack:
            x, y = stack.pop()
            i = y * w + x
            if seen[i]:
                continue
            seen[i] = 1
            if px[x, y][3] and not is_matte(px[x, y]):
                continue
            px[x, y] = (0, 0, 0, 0)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                    stack.append((nx, ny))

    flood([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    # Enclosed matte (a ring's hole, between a bow and its string): pixels very
    # close to the matte colour sampled at the corners, in sizeable patches
    # (not single matte-coloured pixels inside the subject).
    sr, sg, sb = corner
    close = Image.new("L", (w, h))
    cp = close.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] and abs(c[0] - sr) + abs(c[1] - sg) + abs(c[2] - sb) < 60 and is_matte(c):
                cp[x, y] = 255
    pp = close.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5)).load()
    holes = [(x, y) for y in range(h) for x in range(w) if pp[x, y] and cp[x, y]]
    for x, y in holes:
        seen[y * w + x] = 0
    flood(holes)  # and outward from each hole, as from the border
    # Despill pixels within 3 px of the keyed area.
    alpha = img.getchannel("A")
    near = alpha.point(lambda v: 255 if v == 0 else 0).filter(ImageFilter.MaxFilter(9))
    nb = near.load()
    for y in range(h):
        for x in range(w):
            r, g, b, al = px[x, y]
            if al == 0 or not nb[x, y]:
                continue
            if matte == GREEN and g > max(r, b):
                px[x, y] = (r, max(r, b), b, al)
            elif matte == GREEN and g > (r + b) // 2 + 24 and b > r * 0.6:
                px[x, y] = (r, (r + b) // 2 + 24, b, al)  # greenish-gray blend left by the matte
            elif matte == MAGENTA and min(r, b) > g:
                spill = min(r, b) - g  # the shared red+blue that is matte, not subject
                px[x, y] = (r - spill, g, b - spill, al)
    return img


def shrink_sprite(img):
    box = img.getbbox()
    if not box:
        return None
    img = img.crop(box)
    side = max(img.size)
    square = Image.new("RGBA", (side, side))
    square.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    # Premultiplied shrink (no dark or matte halo), then hard alpha for crisp pixel edges.
    small = square.resize((112, 112), Image.BOX).resize((28, 28), Image.LANCZOS)
    small = small.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=1))
    a = small.getchannel("A").point(lambda v: 0 if v < 100 else 255)
    small.putalpha(a)
    tile = Image.new("RGBA", (32, 32))
    tile.paste(small, (2, 2))
    return tile


def shrink_opaque(img):
    small = img.convert("RGB").resize((128, 128), Image.BOX).resize((32, 32), Image.LANCZOS)
    small = small.filter(ImageFilter.UnsharpMask(radius=0.6, percent=50, threshold=1))
    return small.convert("RGBA")


def alpha_stats(img):
    rgba = img.convert("RGBA")
    px = list(rgba.getdata())
    w, h = img.size
    return {"size": [w, h],
            "transparentPixels": sum(1 for p in px if p[3] == 0),
            "semiTransparentPixels": sum(1 for p in px if 0 < p[3] < 255),
            "opaquePixels": sum(1 for p in px if p[3] == 255),
            "greenishVisiblePixels": sum(1 for r, g, b, al in px if al > 0 and g > 150 and r < 80 and b < 120),
            "nonTransparentRatio": round(sum(1 for p in px if p[3] > 0) / (w * h), 4)}


def label(draw, xy, text, fill=(230, 220, 200)):
    draw.text(xy, text, fill=fill)


def cmd_post(a):
    CAND.mkdir(parents=True, exist_ok=True)
    SHEETS.mkdir(parents=True, exist_ok=True)
    want = set(a.ids.split(",")) if getattr(a, "ids", None) else None
    by_id = {e["id"]: e for e in entries()}
    groups = collections.defaultdict(list)
    for src in sorted(WORK.glob("*-s*.png")):
        m = re.match(r"(.+)-s(\d+)\.png$", src.name)
        if not m or m.group(1) not in by_id or (want and m.group(1) not in want):
            continue
        e = by_id[m.group(1)]
        out = CAND / src.name
        if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
            matte = matte_of(e)
            img = Image.open(src)
            small = img.convert("RGBA").resize((384, 384), Image.BOX)  # plenty for a 32 px tile, and 4x faster to key
            tile = shrink_opaque(img) if matte is None else shrink_sprite(key_matte(small, matte))
            if tile is None:
                print(f"{src.name}: nothing left after keying")
                continue
            tile.save(out)
        groups[e["category"]].append((e, int(m.group(2)), out))
    for category, items in groups.items():
        per_id = collections.OrderedDict()
        for e, seed, path in items:
            per_id.setdefault(e["id"], (e, []))[1].append((seed, path))
        rows = list(per_id.values())
        for page in range(0, len(rows), 12):
            chunk = rows[page:page + 12]
            cols = 1 + max(len(c[1]) for c in chunk)
            cw, ch = 150, 172
            sheet = Image.new("RGBA", (cols * cw + 10, len(chunk) * ch + 10), (24, 24, 30, 255))
            d = ImageDraw.Draw(sheet)
            for r, (e, cands) in enumerate(chunk):
                y = 6 + r * ch
                tiles = [("now", ROOT / e["installedPath"])] + [(f"s{s}", p) for s, p in sorted(cands)]
                for c, (name, path) in enumerate(tiles):
                    x = 6 + c * cw
                    t = Image.open(path).convert("RGBA") if Path(path).exists() else Image.new("RGBA", (32, 32))  # a new tile has no "now"
                    if t.size != (32, 32):
                        t = t.resize((32, 32), Image.LANCZOS)
                    cell = Image.new("RGBA", (128, 128), FLOOR + (255,))
                    cell.alpha_composite(t.resize((128, 128), Image.NEAREST))
                    sheet.paste(cell, (x, y + 14))
                    one = Image.new("RGBA", (32, 32), FLOOR + (255,))
                    one.alpha_composite(t)
                    sheet.paste(one, (x + 96, y + 142 - 4))
                    label(d, (x, y + 144), name if c else "now", (255, 200, 120) if c == 0 else (220, 220, 220))
                label(d, (6, y), f"{e['id']}  [{e['problem']}/{e['severity']}]")
            out = SHEETS / f"{category}-{page // 12 + 1:02d}.png"
            sheet.save(out)
            print(out)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def cmd_install(a):
    by_id = {e["id"]: e for e in entries()}
    e = by_id[a.id]
    cand = CAND / f"{a.id}-s{a.seed}.png"
    img = Image.open(cand).convert("RGBA")
    stats = alpha_stats(img)
    if matte_of(e) is None:
        if stats["opaquePixels"] != 1024:
            sys.exit(f"{a.id}: an opaque terrain tile must be fully opaque ({stats})")
    elif stats["transparentPixels"] == 0:
        sys.exit(f"{a.id}: needs real alpha ({stats})")
    elif matte_of(e) == GREEN and stats["greenishVisiblePixels"]:
        sys.exit(f"{a.id}: green matte left ({stats})")
    elif matte_of(e) == MAGENTA:
        # A green subject on a magenta matte: its green is the subject; no
        # magenta may be left.
        left = sum(1 for r, g, b, al in img.getdata() if al and r > 150 and b > 110 and g < 90)
        if left:
            sys.exit(f"{a.id}: {left} magenta matte pixels left")
    data = json.loads(MANIFEST.read_text())
    asset = next((x for x in data["assets"] if x["id"] == a.id), None)
    if asset is None:
        if not e.get("new"):
            sys.exit(f"{a.id}: not in the manifest")
        # A tile that never existed (e.g. the unidentified gray stone).
        asset = {"id": a.id, "name": e.get("name", a.id), "category": next((x["category"] for x in data["assets"] if x.get("categorySlug") == e["category"]), e["category"]),
                 "categorySlug": e["category"], "priority": "P1", "glyph": e.get("glyph", ""), "why": e["what_is_wrong"],
                 "outputPath": e["outputPath"], "installedPath": e["installedPath"], "workflow": "qwen-b70"}
        data["assets"].append(asset)
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    targets = [ROOT / asset["installedPath"], ROOT / asset["outputPath"]]
    backup = BACKUP / asset["categorySlug"] / f"{a.id}.png"
    backup.parent.mkdir(parents=True, exist_ok=True)
    if not backup.exists() and targets[0].exists():
        shutil.copy2(targets[0], backup)
    for t in targets:
        t.parent.mkdir(parents=True, exist_ok=True)
        img.save(t)
    previous = {k: asset[k] for k in ("qaNote", "provenance", "workflowLabel", "prompt") if k in asset}
    asset["previous"] = {"sha256": asset.get("sha256"), **previous, "backup": str(backup.relative_to(ROOT))}
    asset["previousSha256"] = asset.get("sha256")
    asset["sha256"] = sha(targets[0])
    asset["alphaStats"] = stats
    asset["prompt"] = prompt_of(e)
    asset["workflowLabel"] = "godot-audit-regen-qwen"
    asset["completedAt"] = now
    asset["status"] = "installed"
    matte = {None: "opaque terrain tile", GREEN: "green matte keyed from the border", MAGENTA:
             "magenta matte (green subject) keyed from the border"}[matte_of(e)]
    asset["qaNote"] = (f"Regenerated 2026-10-17 after the asset audit ({e['problem']}: {e['what_is_wrong']}) on the B70 "
                       f"with Qwen Image 2.1{' edit (reference: the previous tile)' if e['regen'].get('use_reference') else ''}, "
                       f"seed {a.seed}, via godot-poc/tools/art/regen_audit.py; {matte}; 32 px. "
                       + (a.note or "Picked by eye on the contact sheet and checked in game."))
    asset["provenance"] = {"source": "asset-generation/outputs/godot-regen/audit", "tool": "~/ai/weeb/b70-image.sh --batch -m qwen --xpu",
                           "seed": a.seed, "audit": f"asset-generation/outputs/audit-2026-10-17/{e['share']}/flagged.json",
                           "installedAt": now, "backup": str(backup.relative_to(ROOT))}
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n")
    lines = TRACKER.read_text().split("\n")
    note = (f"regenerated 2026-10-17 after the asset audit ({e['problem']}; Qwen on the B70, seed {a.seed}, "
            f"godot-poc/tools/art/regen_audit.py); {matte}; alpha verified ({stats['transparentPixels']} transparent, "
            f"{stats['greenishVisiblePixels']} greenish); previous tile in {backup.parent.relative_to(ROOT)}")
    row = [i for i, line in enumerate(lines) if line.startswith(f"| `{a.id}` |")]
    for i in row:
        cells = lines[i].split(" | ")
        cells[3:5] = ["generated", "qa-reviewed"]
        lines[i] = " | ".join(cells[:5]) + " | " + note + " |"
    if not row:
        last = max(i for i, line in enumerate(lines) if line.startswith("| `"))
        kind = "non-transparent" if matte_of(e) is None else "transparent"
        lines.insert(last + 1, f"| `{a.id}` | {e['category']} | {kind} | generated | qa-reviewed | new tile; {note} |")
    TRACKER.write_text("\n".join(lines))
    print(f"installed {a.id} s{a.seed}: {asset['sha256'][:12]}")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("queue")
    q.add_argument("--ids")
    q.add_argument("--severity", default="high,medium,low")
    q.add_argument("--seeds", default="42,8,7")
    q.add_argument("--size", type=int, default=768)
    q.add_argument("--avatars", action="store_true", help="include the hero combo avatars")
    q.add_argument("--dry", action="store_true")
    s = sub.add_parser("post")
    s.add_argument("--ids")
    i = sub.add_parser("install")
    i.add_argument("id")
    i.add_argument("seed", type=int)
    i.add_argument("--note")
    a = p.parse_args()
    {"queue": cmd_queue, "post": cmd_post, "install": cmd_install}[a.cmd](a)


if __name__ == "__main__":
    main()
