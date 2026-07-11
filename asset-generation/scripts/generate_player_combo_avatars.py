#!/usr/bin/env python3
"""Generate 1024x1024 race/role/gender player-avatar inventory and PNG cutouts.

This is intentionally deterministic and source-derived: it reads NetHack role/race
allow masks from src/role.c, emits every playable race/class/gender combination,
and creates a transparent fantasy avatar for each combination.
"""
from __future__ import annotations

import json
import math
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
ROLE_C = ROOT / "src/role.c"
OUT_DIR = ROOT / "asset-generation/outputs/player-combo-avatars"
INSTALL_DIR = ROOT / "electron-poc/assets/tiles/generated/player-combo-avatars"
INVENTORY_MD = ROOT / "asset-generation/manifests/player-avatar-combo-inventory.md"
INVENTORY_JSON = ROOT / "asset-generation/manifests/player-avatar-combo-inventory.json"
TILE_DIR = ROOT / "electron-poc/assets/tiles/generated/player-pets-identity"
TEMPLATE_DIR = ROOT / "asset-generation/generated/player-combo-avatar-templates"
SIZE = 1024

BITS = {
    "MH_HUMAN": 0x0001,
    "MH_ELF": 0x0002,
    "MH_DWARF": 0x0004,
    "MH_GNOME": 0x0008,
    "MH_ORC": 0x0010,
    "ROLE_MALE": 0x1000,
    "ROLE_FEMALE": 0x2000,
    "ROLE_NEUTER": 0x4000,
    "ROLE_LAWFUL": 0x0100,
    "ROLE_NEUTRAL": 0x0200,
    "ROLE_CHAOTIC": 0x0400,
}
RACE_BITS = {"human": "MH_HUMAN", "elf": "MH_ELF", "dwarf": "MH_DWARF", "gnome": "MH_GNOME", "orc": "MH_ORC"}
GENDER_BITS = {"male": "ROLE_MALE", "female": "ROLE_FEMALE"}
ALIGN_MASK = BITS["ROLE_LAWFUL"] | BITS["ROLE_NEUTRAL"] | BITS["ROLE_CHAOTIC"]

ROLE_SLUGS = {
    "Archeologist": "archeologist",
    "Barbarian": "barbarian",
    "Caveman": "caveman",
    "Healer": "healer",
    "Knight": "knight",
    "Monk": "monk",
    "Priest": "priest",
    "Rogue": "rogue",
    "Ranger": "ranger",
    "Samurai": "samurai",
    "Tourist": "tourist",
    "Valkyrie": "valkyrie",
    "Wizard": "wizard",
}
ROLE_FEMALE_NAME = {"Caveman": "Cavewoman", "Priest": "Priestess"}

RACE_SKIN = {
    "human": (224, 166, 119, 255),
    "elf": (232, 205, 150, 255),
    "dwarf": (190, 132, 92, 255),
    "gnome": (198, 158, 130, 255),
    "orc": (108, 160, 94, 255),
}
RACE_HAIR = {
    "human": (92, 54, 33, 255),
    "elf": (238, 232, 190, 255),
    "dwarf": (128, 68, 34, 255),
    "gnome": (220, 125, 60, 255),
    "orc": (42, 59, 35, 255),
}
ROLE_COLORS = {
    "archeologist": ((171, 105, 45, 255), (236, 203, 122, 255)),
    "barbarian": ((142, 60, 40, 255), (224, 179, 87, 255)),
    "caveman": ((111, 82, 52, 255), (204, 174, 114, 255)),
    "healer": ((88, 180, 168, 255), (242, 248, 230, 255)),
    "knight": ((128, 142, 164, 255), (238, 226, 188, 255)),
    "monk": ((191, 113, 45, 255), (246, 192, 72, 255)),
    "priest": ((104, 92, 176, 255), (240, 228, 164, 255)),
    "rogue": ((58, 68, 88, 255), (196, 214, 234, 255)),
    "ranger": ((58, 132, 73, 255), (201, 151, 74, 255)),
    "samurai": ((98, 51, 150, 255), (229, 181, 72, 255)),
    "tourist": ((67, 154, 216, 255), (236, 61, 76, 255)),
    "valkyrie": ((202, 213, 226, 255), (235, 193, 64, 255)),
    "wizard": ((48, 75, 151, 255), (145, 70, 204, 255)),
}

@dataclass
class Role:
    name: str
    code: str
    mask: int

@dataclass
class Race:
    name: str
    adjective: str
    code: str
    mask: int


def eval_mask(expr: str) -> int:
    mask = 0
    for token in re.findall(r"\b(?:MH|ROLE)_[A-Z]+\b", expr):
        mask |= BITS.get(token, 0)
    return mask


def matching_brace(text: str, start: int) -> int:
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    raise ValueError("unbalanced braces")


def split_top_level_entries(body: str) -> list[str]:
    entries = []
    depth = 0
    start = None
    for i, ch in enumerate(body):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                entries.append(body[start : i + 1])
                start = None
    return entries


def parse_roles_and_races() -> tuple[list[Role], list[Race]]:
    src = ROLE_C.read_text()
    roles_start = src.index("const struct Role roles")
    roles_open = src.index("{", roles_start)
    roles_close = matching_brace(src, roles_open)
    roles_body = src[roles_open + 1 : roles_close]
    roles = []
    for entry in split_top_level_entries(roles_body):
        if "UNDEFINED_ROLE" in entry:
            continue
        name_match = re.search(r'\{\s*\{\s*"([^"]+)"', entry)
        code_match = re.search(r'"([A-Z][a-z]{2})"\s*,', entry)
        allow_match = re.search(r'ART_[A-Z0-9_]+,\s*(.*?)\s*,\s*/\* Str Int Wis Dex Con Cha \*/', entry, re.S)
        if name_match and code_match and allow_match:
            roles.append(Role(name_match.group(1), code_match.group(1), eval_mask(allow_match.group(1))))

    races_start = src.index("const struct Race races")
    races_open = src.index("{", races_start)
    races_close = matching_brace(src, races_open)
    races_body = src[races_open + 1 : races_close]
    races = []
    for entry in split_top_level_entries(races_body):
        if "UNDEFINED_RACE" in entry:
            continue
        strings = re.findall(r'"([^"]*)"', entry)
        allow_match = re.search(r'PM_[A-Z_]+_ZOMBIE,\s*(.*?)\s*,\s*(?:MH_|0)', entry, re.S)
        if len(strings) >= 4 and allow_match:
            races.append(Race(strings[0], strings[1], strings[3], eval_mask(allow_match.group(1))))
    return roles, races


def combo_id(race: str, role_slug: str, gender: str) -> str:
    return f"{race}-{role_slug}-{gender}-avatar"


def current_state(role: Role, race: Race, gender: str) -> dict[str, str]:
    role_slug = ROLE_SLUGS[role.name]
    role_asset_name = ROLE_FEMALE_NAME.get(role.name, role.name) if gender == "female" else role.name
    role_asset_slug = ROLE_SLUGS.get(role_asset_name, role_slug)
    if role.name == "Priest" and gender == "female":
        role_asset_slug = "priestess"
    if role.name == "Caveman" and gender == "female":
        role_asset_slug = "cavewoman"
    role_path = TILE_DIR / f"{role_asset_slug}-role-avatar.png"
    race_path = TILE_DIR / f"{race.name}-player-variant.png"
    return {
        "runtimeTile": "hero-avatar (@ glyph maps globally to hero-avatar; no race/role/gender runtime selection found)",
        "existingRoleAvatar": str(role_path.relative_to(ROOT)) if role_path.exists() else "missing",
        "existingRaceVariant": str(race_path.relative_to(ROOT)) if race_path.exists() else "missing",
    }


def valid_combos(roles: Iterable[Role], races: Iterable[Race]) -> list[dict]:
    combos = []
    for role in roles:
        role_slug = ROLE_SLUGS[role.name]
        for race in races:
            race_bit = BITS[RACE_BITS[race.name]]
            if not (role.mask & race.mask & race_bit):
                continue
            if not ((role.mask & race.mask & ALIGN_MASK) != 0):
                continue
            for gender, bit_name in GENDER_BITS.items():
                gender_bit = BITS[bit_name]
                if not (role.mask & race.mask & gender_bit):
                    continue
                state = current_state(role, race, gender)
                aid = combo_id(race.name, role_slug, gender)
                combos.append({
                    "id": aid,
                    "race": race.name,
                    "raceAdjective": race.adjective,
                    "raceCode": race.code,
                    "role": role.name,
                    "roleCode": role.code,
                    "roleSlug": role_slug,
                    "gender": gender,
                    "source": "src/role.c role/race/gender allow masks",
                    "currentState": state,
                    "outputPath": str((OUT_DIR / f"{aid}.png").relative_to(ROOT)),
                    "installedPath": str((INSTALL_DIR / f"{aid}.png").relative_to(ROOT)),
                    "status": "generated-1024" if (OUT_DIR / f"{aid}.png").exists() else "planned",
                })
    return combos


def ellipse(draw, bbox, fill, outline=None, width=1):
    draw.ellipse(tuple(map(int, bbox)), fill=fill, outline=outline, width=width)


def poly(draw, pts, fill, outline=None, width=1):
    draw.polygon([(int(x), int(y)) for x, y in pts], fill=fill, outline=outline)
    if outline and width > 1:
        draw.line([(int(x), int(y)) for x, y in pts + [pts[0]]], fill=outline, width=width, joint="curve")


def line(draw, pts, fill, width=12):
    draw.line([(int(x), int(y)) for x, y in pts], fill=fill, width=width, joint="curve")


def draw_weapon(draw: ImageDraw.ImageDraw, role: str, gender: str, accent, metal):
    # Large, readable prop silhouettes by role.
    if role == "archeologist":
        line(draw, [(245, 705), (390, 505)], fill=(109, 66, 32, 255), width=28)
        line(draw, [(330, 505), (455, 472)], fill=metal, width=22)
    elif role == "barbarian":
        line(draw, [(722, 710), (618, 470)], fill=(112, 67, 38, 255), width=36)
        ellipse(draw, (560, 400, 705, 520), fill=metal, outline=(40, 45, 56, 255), width=8)
    elif role == "caveman":
        line(draw, [(705, 730), (635, 475)], fill=(105, 73, 43, 255), width=50)
        ellipse(draw, (587, 405, 700, 520), fill=(115, 87, 58, 255), outline=(60, 45, 34, 255), width=8)
    elif role == "healer":
        line(draw, [(705, 740), (705, 440)], fill=(236, 246, 235, 255), width=24)
        line(draw, [(650, 505), (760, 505)], fill=(61, 191, 166, 255), width=24)
        line(draw, [(705, 452), (705, 560)], fill=(61, 191, 166, 255), width=24)
    elif role == "knight":
        line(draw, [(720, 725), (725, 360)], fill=metal, width=24)
        poly(draw, [(725, 300), (760, 380), (690, 380)], fill=(244, 248, 255, 255), outline=(74, 86, 102, 255), width=5)
    elif role == "monk":
        ellipse(draw, (665, 430, 705, 470), fill=accent)
        line(draw, [(685, 470), (690, 650)], fill=accent, width=10)
        for y in range(500, 635, 28):
            ellipse(draw, (675, y, 700, y + 25), fill=(245, 210, 120, 255))
    elif role == "priest":
        line(draw, [(704, 720), (704, 405)], fill=(232, 217, 136, 255), width=24)
        line(draw, [(650, 482), (758, 482)], fill=(232, 217, 136, 255), width=24)
    elif role == "rogue":
        poly(draw, [(705, 535), (805, 470), (740, 590)], fill=metal, outline=(30, 36, 47, 255), width=6)
        line(draw, [(690, 600), (740, 560)], fill=(90, 55, 34, 255), width=22)
    elif role == "ranger":
        draw.arc((610, 315, 850, 745), start=250, end=110, fill=(142, 85, 38, 255), width=28)
        line(draw, [(704, 330), (704, 730)], fill=(236, 218, 150, 255), width=8)
        line(draw, [(620, 522), (830, 500)], fill=metal, width=10)
        poly(draw, [(830, 500), (790, 482), (795, 523)], fill=metal)
    elif role == "samurai":
        draw.arc((610, 250, 890, 725), start=210, end=325, fill=metal, width=28)
        line(draw, [(670, 670), (735, 585)], fill=(92, 55, 33, 255), width=26)
    elif role == "tourist":
        ellipse(draw, (664, 478, 790, 604), fill=(33, 43, 54, 255), outline=(235, 235, 235, 255), width=8)
        ellipse(draw, (704, 510, 750, 556), fill=(79, 174, 222, 255), outline=(210, 236, 255, 255), width=6)
        line(draw, [(620, 425), (760, 470)], fill=(208, 52, 66, 255), width=30)
    elif role == "valkyrie":
        line(draw, [(710, 760), (642, 360)], fill=metal, width=24)
        poly(draw, [(642, 290), (680, 370), (605, 370)], fill=(244, 247, 255, 255), outline=(67, 79, 96, 255), width=6)
    elif role == "wizard":
        line(draw, [(707, 735), (660, 470)], fill=(124, 71, 36, 255), width=24)
        for a in range(0, 360, 45):
            x = 660 + math.cos(math.radians(a)) * 65
            y = 450 + math.sin(math.radians(a)) * 65
            line(draw, [(660, 450), (x, y)], fill=(124, 235, 255, 210), width=7)
        ellipse(draw, (637, 427, 683, 473), fill=(230, 160, 255, 240))


def draw_avatar(combo: dict, path: Path):
    role = combo["roleSlug"]
    race = combo["race"]
    gender = combo["gender"]
    if role == "valkyrie" and gender == "female":
        # The generic vector construction below was not feminine/readable enough
        # for the one role that is female-only in NetHack. Preserve the revised
        # high-detail fantasy Valkyrie template so rerunning this generator does
        # not regress the explicit Valkyrie acceptance criterion.
        template = TEMPLATE_DIR / "valkyrie-female-1024.png"
        if template.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            Image.open(template).convert("RGBA").save(path)
            return
    primary, accent = ROLE_COLORS[role]
    skin = RACE_SKIN[race]
    hair = RACE_HAIR[race]
    metal = (208, 218, 229, 255)
    outline = (28, 31, 42, 255)

    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    ellipse(sd, (270, 800, 760, 925), fill=(0, 0, 0, 72))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(shadow)
    d = ImageDraw.Draw(img)

    # Back cloak / hair mass.
    cloak = primary if role not in {"knight", "valkyrie"} else (72, 99, 154, 255)
    poly(d, [(370, 350), (655, 350), (775, 855), (250, 855)], fill=cloak, outline=outline, width=10)

    # Body silhouette. Female forms are explicitly feminine but armored/clothed.
    if gender == "female":
        torso = [(425, 380), (595, 380), (650, 590), (590, 785), (430, 785), (370, 590)]
        waist = [(410, 565), (610, 565), (570, 665), (450, 665)]
    else:
        torso = [(390, 380), (630, 380), (690, 785), (330, 785)]
        waist = [(375, 560), (645, 560), (625, 670), (395, 670)]
    poly(d, torso, fill=primary, outline=outline, width=12)

    # Armor/garb layer. Female uses fantasy chainmail bodice/skirt styling, not nudity.
    if gender == "female":
        poly(d, [(430, 410), (590, 410), (615, 555), (405, 555)], fill=metal if role in {"valkyrie", "knight", "samurai"} else accent, outline=outline, width=7)
        for x in range(430, 600, 26):
            line(d, [(x, 425), (x + 60, 548)], fill=(145, 154, 166, 150), width=5)
        poly(d, waist, fill=accent, outline=outline, width=8)
        poly(d, [(410, 660), (610, 660), (665, 825), (555, 800), (512, 842), (465, 800), (355, 825)], fill=primary, outline=outline, width=8)
    else:
        poly(d, [(395, 410), (625, 410), (655, 610), (365, 610)], fill=metal if role in {"knight", "samurai", "valkyrie"} else primary, outline=outline, width=8)
        poly(d, waist, fill=accent, outline=outline, width=8)

    # Legs / boots.
    boot = (76, 50, 37, 255)
    line(d, [(450, 770), (430, 890)], fill=outline, width=56)
    line(d, [(575, 770), (602, 890)], fill=outline, width=56)
    line(d, [(450, 770), (430, 878)], fill=primary, width=36)
    line(d, [(575, 770), (602, 878)], fill=primary, width=36)
    ellipse(d, (374, 858, 470, 912), fill=boot, outline=outline, width=5)
    ellipse(d, (570, 858, 672, 912), fill=boot, outline=outline, width=5)

    # Arms.
    armw = 44 if gender == "male" else 36
    line(d, [(390, 440), (300, 650)], fill=outline, width=armw + 16)
    line(d, [(630, 440), (710, 650)], fill=outline, width=armw + 16)
    line(d, [(390, 440), (300, 650)], fill=skin, width=armw)
    line(d, [(630, 440), (710, 650)], fill=skin, width=armw)
    ellipse(d, (270, 630, 325, 690), fill=skin, outline=outline, width=5)
    ellipse(d, (690, 630, 745, 690), fill=skin, outline=outline, width=5)

    # Neck/head.
    ellipse(d, (455, 260, 570, 390), fill=skin, outline=outline, width=10)
    ellipse(d, (415, 180, 610, 365), fill=skin, outline=outline, width=12)

    # Race traits.
    if race == "elf":
        poly(d, [(420, 255), (335, 220), (405, 315)], fill=skin, outline=outline, width=6)
        poly(d, [(600, 255), (690, 220), (615, 315)], fill=skin, outline=outline, width=6)
    elif race == "dwarf":
        ellipse(d, (405, 295, 620, 455), fill=hair, outline=outline, width=7)
    elif race == "gnome":
        poly(d, [(430, 188), (512, 55), (595, 188)], fill=accent, outline=outline, width=9)
    elif race == "orc":
        poly(d, [(442, 338), (402, 408), (485, 370)], fill=(238, 232, 198, 255), outline=outline, width=4)
        poly(d, [(580, 338), (620, 408), (535, 370)], fill=(238, 232, 198, 255), outline=outline, width=4)

    # Hair/helm/hat by role.
    if role in {"knight", "samurai", "valkyrie"}:
        helm = metal if role != "samurai" else (74, 63, 122, 255)
        poly(d, [(410, 235), (512, 145), (615, 235), (592, 315), (432, 315)], fill=helm, outline=outline, width=8)
        if role == "valkyrie":
            # Clearly feminine valkyrie: visible braids plus winged helm.
            poly(d, [(420, 215), (290, 170), (382, 282)], fill=(244, 247, 255, 255), outline=outline, width=6)
            poly(d, [(604, 215), (735, 170), (642, 282)], fill=(244, 247, 255, 255), outline=outline, width=6)
            line(d, [(438, 330), (392, 505)], fill=hair, width=28)
            line(d, [(585, 330), (635, 505)], fill=hair, width=28)
            for y in range(350, 500, 32):
                ellipse(d, (382, y, 420, y + 34), fill=(236, 202, 95, 255), outline=outline, width=3)
                ellipse(d, (612, y, 650, y + 34), fill=(236, 202, 95, 255), outline=outline, width=3)
    elif role == "archeologist":
        ellipse(d, (375, 200, 650, 285), fill=(151, 91, 40, 255), outline=outline, width=8)
        poly(d, [(430, 145), (590, 145), (635, 245), (390, 245)], fill=(177, 113, 54, 255), outline=outline, width=8)
    elif role == "wizard":
        poly(d, [(410, 210), (512, 45), (620, 210)], fill=accent, outline=outline, width=10)
        ellipse(d, (382, 215, 642, 280), fill=accent, outline=outline, width=8)
    elif role == "tourist":
        ellipse(d, (360, 200, 670, 270), fill=(238, 198, 78, 255), outline=outline, width=8)
        poly(d, [(420, 155), (600, 155), (640, 245), (380, 245)], fill=(238, 198, 78, 255), outline=outline, width=8)
    elif role == "rogue":
        poly(d, [(390, 250), (512, 130), (635, 250), (604, 350), (420, 350)], fill=(41, 49, 67, 255), outline=outline, width=9)
    else:
        # Hair visible for non-helmet roles.
        if gender == "female":
            ellipse(d, (385, 172, 635, 345), fill=hair, outline=outline, width=8)
            ellipse(d, (420, 205, 605, 365), fill=skin, outline=None)
        else:
            ellipse(d, (400, 160, 625, 305), fill=hair, outline=outline, width=8)
            ellipse(d, (420, 205, 605, 365), fill=skin, outline=None)

    # Face.
    ellipse(d, (465, 270, 485, 292), fill=outline)
    ellipse(d, (540, 270, 560, 292), fill=outline)
    line(d, [(485, 333), (530, 345), (565, 328)], fill=(112, 55, 62, 255), width=8)

    # Shield/prop before foreground weapon for warrior classes.
    if role in {"knight", "valkyrie"}:
        shield_color = accent if role == "valkyrie" else (175, 58, 58, 255)
        ellipse(d, (240, 510, 405, 735), fill=shield_color, outline=outline, width=10)
        ellipse(d, (292, 575, 352, 650), fill=(244, 230, 154, 255), outline=(96, 73, 30, 255), width=5)

    draw_weapon(d, role, gender, accent, metal)

    # High contrast rim light. Keep true transparent canvas edges: tint only
    # the expanded subject alpha, never a full-canvas rectangle.
    alpha = img.getchannel("A")
    expanded = alpha.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(2))
    rim_alpha = expanded.point(lambda v: min(70, v // 3))
    rim = Image.new("RGBA", (SIZE, SIZE), (255, 230, 155, 0))
    rim.putalpha(rim_alpha)
    final = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    final.alpha_composite(rim)
    final.alpha_composite(img)
    path.parent.mkdir(parents=True, exist_ok=True)
    final.save(path)


def alpha_stats(path: Path) -> dict:
    im = Image.open(path).convert("RGBA")
    alpha = im.getchannel("A")
    vals = list(alpha.getdata())
    opaque = sum(1 for v in vals if v == 255)
    semi = sum(1 for v in vals if 0 < v < 255)
    transparent = sum(1 for v in vals if v == 0)
    return {
        "size": list(im.size),
        "mode": im.mode,
        "transparentPixels": transparent,
        "semiTransparentPixels": semi,
        "opaquePixels": opaque,
        "nonTransparentRatio": round((opaque + semi) / len(vals), 4),
    }


def write_inventory(combos: list[dict]):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for c in combos:
        out = ROOT / c["outputPath"]
        c["status"] = "generated-1024" if out.exists() else "planned"
        if out.exists():
            c["alphaStats"] = alpha_stats(out)
    INVENTORY_JSON.write_text(json.dumps({"generatedAt": now, "count": len(combos), "combos": combos}, indent=2))
    lines = [
        "# Player avatar race/class/gender inventory",
        "",
        f"Generated: {now}",
        "",
        "Source of possibilities: `src/role.c` role/race/gender/align allow masks. Alignment was only used to reject impossible role/race pairs; rows below enumerate race, class, and gender combinations.",
        "",
        f"Total playable combinations found: **{len(combos)}**.",
        "",
        "Current renderer state: the Electron tile map still maps `@`/hero glyphs to `hero-avatar`; existing 32x32 role and race assets are present but are not selected by race/role/gender at runtime. This inventory records those existing assets plus the new 1024x1024 combination avatar path.",
        "",
        "| # | Race | Class | Gender | Current runtime avatar state | Existing role avatar | Existing race variant | 1024 combo avatar | QA |",
        "|---:|---|---|---|---|---|---|---|---|",
    ]
    for idx, c in enumerate(combos, 1):
        st = c["currentState"]
        qa = "size 1024x1024, RGBA alpha" if c.get("alphaStats", {}).get("size") == [1024, 1024] else "not generated"
        lines.append(
            f"| {idx} | {c['race']} | {c['role']} | {c['gender']} | {st['runtimeTile']} | `{st['existingRoleAvatar']}` | `{st['existingRaceVariant']}` | `{c['outputPath']}` | {qa} |"
        )
    INVENTORY_MD.write_text("\n".join(lines) + "\n")


def main():
    roles, races = parse_roles_and_races()
    combos = valid_combos(roles, races)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    for c in combos:
        out = OUT_DIR / f"{c['id']}.png"
        draw_avatar(c, out)
        shutil.copy2(out, INSTALL_DIR / out.name)
    write_inventory(combos)
    print(json.dumps({"count": len(combos), "inventory": str(INVENTORY_MD.relative_to(ROOT)), "outputDir": str(OUT_DIR.relative_to(ROOT)), "installDir": str(INSTALL_DIR.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
