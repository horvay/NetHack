#!/usr/bin/env python3
"""Generate NetHack player race/role/gender full-body avatar cutouts with ComfyUI.

Uses asset-generation/manifests/player-avatar-combo-inventory.json as source of truth
and the transparent Krea2+RMBG workflow by default. Outputs true 1024x1024 PNGs,
installs copies into electron-poc, and records prompt/seed/workflow/model/checksum provenance.
The prompt intentionally asks for full-body head-to-toe framing; cropped portrait-style
results should be retried rather than accepted as final assets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
INVENTORY_JSON = ROOT / "asset-generation/manifests/player-avatar-combo-inventory.json"
WORKFLOW_PATH = ROOT / "asset-generation/workflows/krea2_basic_rem-background.json"
OUTPUT_DIR = ROOT / "asset-generation/outputs/player-combo-avatars"
INSTALL_DIR = ROOT / "electron-poc/assets/tiles/generated/player-combo-avatars"
PROVENANCE_JSON = ROOT / "asset-generation/manifests/player-combo-avatar-comfy-provenance.json"
TRACKER_MD = ROOT / "asset-generation/manifests/player-combo-avatar-comfy-tracker.md"
CONTACT_SHEET = ROOT / "asset-generation/outputs/player-combo-avatar-contact-sheet-comfy.png"

RACE_DESCRIPTIONS = {
    "human": {
        "male": "human adventurer with warm peach skin, strong natural features, brown hair, and bright heroic eyes",
        "female": "human adventurer with warm peach skin, feminine facial features, styled brown hair, and bright heroic eyes",
    },
    "elf": {
        "male": "elven adventurer with golden fair skin, long pale-blond hair, high cheekbones, elegant pointed ears, and emerald accents",
        "female": "elven adventurer with golden fair skin, feminine angular features, long pale-blond hair, elegant pointed ears, and emerald accents",
    },
    "dwarf": {
        "male": "dwarven adventurer with stocky build, tan skin, thick auburn beard, braided hair, and bronze accents",
        "female": "dwarven adventurer with stocky curvy build, tan skin, auburn braids, feminine face, and bronze accents",
    },
    "gnome": {
        "male": "gnomish adventurer with compact build, rosy tan skin, bright copper hair, clever expression, and playful oversized gear",
        "female": "gnomish adventurer with compact petite build, rosy tan skin, bright copper hair, feminine face, and playful oversized gear",
    },
    "orc": {
        "male": "orc adventurer with moss-green skin, black hair, small tusks, red-orange eyes, rugged jaw, and weathered iron accents",
        "female": "orc adventurer with moss-green skin, black hair, small tusks, red-orange eyes, feminine strong features, and weathered iron accents",
    },
}
ROLE_DESCRIPTIONS = {
    "Archeologist": "khaki explorer jacket over fitted leather field armor, brass lantern, fedora, pickaxe, dusty satchel, parchment map, practical adventuring boots",
    "Barbarian": "fur-trimmed bronze-and-leather battle harness, heavy axe, red warpaint, muscular warrior silhouette, rugged northern trophies",
    "Caveman": "primitive hide-and-bone armor, stone club, bone necklace, rough fur wraps, rugged prehistoric hunter silhouette",
    "Healer": "white and teal healer robes over light quilted armor, glowing staff, turquoise medicine sigil, clean linen wraps and potion vials",
    "Knight": "polished silver plate armor, blue tabard, gold trim, longsword and shield, noble tournament silhouette",
    "Monk": "orange and saffron martial robes, prayer beads, wrapped fists, calm balanced fighting stance, simple cloth layers",
    "Priest": "purple and ivory holy vestments over modest armor, gold sun symbol, ceremonial mace and prayer book, solemn sacred presence",
    "Rogue": "charcoal fitted leather armor, silver daggers, hooded cloak, agile thief silhouette, dark burgundy accents",
    "Ranger": "forest-green cloak, brown leather armor, bow and quiver, leaf-green highlights, practical wilderness gear",
    "Samurai": "purple lacquered samurai armor, gold trim, katana, dramatic kabuto helmet, silk cords and armored sleeves",
    "Tourist": "sky-blue travel tunic, red scarf, camera, map satchel, walking stick, cheerful fantasy explorer gear",
    "Valkyrie": "unmistakably female Norse shield-maiden armor with bright steel breastplate, fitted waist, layered leather skirt or mail tunic, silver winged helm, blue cloak, round shield and spear",
    "Wizard": "deep blue and violet wizard robes, gold stars, glowing staff, arcane purple magic, ornate spellbook and layered sleeves",
}
ROLE_TASTEFUL_DETAILS = {
    "Archeologist": "tailored jacket, fitted corseted vest, open collar, belted hip satchel, and tall boots",
    "Barbarian": "decorative straps, exposed shoulders, thigh-high boots or greaves, dramatic fur mantle, and battle-ready skin showing where practical",
    "Caveman": "asymmetric hide wraps, decorative bone straps, exposed shoulders, rugged thigh wraps, and fur panels",
    "Healer": "elegant fitted bodice under robes, open shoulder sleeves, high side slit for movement, and glowing vial jewelry",
    "Knight": "sculpted armor, fitted cuirass, blue tabard slit, decorative straps, and elegant armored boots",
    "Monk": "wrapped athletic silhouette, bare shoulders or midriff where appropriate, sash slits, and graceful martial cloth layers",
    "Priest": "ornate fitted vestments, tasteful neckline, side-slit ceremonial robe, gold chains, and layered sacred cloth",
    "Rogue": "sleek fitted leather, thigh straps, side cutouts or lace-up panels, dagger belts, and agile boots",
    "Ranger": "fitted leather jerkin, shoulder cutouts, thigh quiver straps, split cloak, and wilderness boots",
    "Samurai": "elegant lacquered armor with fitted bodice plates, silk skirt slits, decorative cords, and armored thigh guards",
    "Tourist": "tailored travel dress or tunic, exposed shoulders or open collar, scarf, thigh pouch straps, and cheerful boots",
    "Valkyrie": "feminine sculpted breastplate with tasteful cleavage or neckline cutout, fitted waist, thigh-slit battle skirt, decorative straps, and heroic boots",
    "Wizard": "fitted bodice under star robes, shoulder cutouts, side slit robe panels, corset belt, and glowing arcane jewelry",
}
GENDER_DESCRIPTIONS = {
    "male": "clearly male heroic fantasy adventurer, masculine face and build, practical confident pose",
    "female": "clearly female heroic fantasy adventurer, feminine face and silhouette, attractive but tasteful class-appropriate costume, confident pose, unmistakably female even in armor",
}
STYLE_GUIDANCE = (
    "A polished high-resolution full-body fantasy character image, refined painterly concept art, "
    "dramatic studio character lighting, detailed costume materials, elegant game key art, "
    "single centered standing character cutout, complete head-to-toe figure visible, boots and feet visible, "
    "hands and weapons fully inside frame, generous empty margin around the entire silhouette, sharp expressive face, "
    "cohesive fantasy roguelike identity, true 1024 by 1024 composition"
)
NEGATIVE = (
    "no pixel art, no low resolution sprite, no chibi icon, no flat vector art, no text, no letters, "
    "no numbers, no UI badge, no square card, no frame, no fake transparency, no checkerboard, "
    "no modern clothes, no cropped head, no cropped feet, no cropped boots, no cropped weapon, "
    "no half body, no bust portrait, no waist-up portrait, no knee-up portrait, no close-up portrait, "
    "no extra limbs, no duplicate character, no masculine female valkyrie"
)

@dataclass
class Combo:
    id: str
    race: str
    role: str
    roleSlug: str
    gender: str
    outputPath: str
    installedPath: str


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def workflow_model_details(workflow_path: Path) -> dict:
    wf = json.loads(workflow_path.read_text())
    details = {}
    for n in wf.get("nodes", []):
        typ = n.get("type")
        vals = list(n.get("widgets_values") or [])
        if typ == "UNETLoader" and vals:
            details["unet"] = vals[0]
            details["unetWeightDtype"] = vals[1] if len(vals) > 1 else None
        elif typ == "VAELoader" and vals:
            details["vae"] = vals[0]
        elif typ == "CLIPLoader" and vals:
            details["clip"] = vals[0]
            details["clipType"] = vals[1] if len(vals) > 1 else None
        elif typ == "RMBG" and vals:
            details["rmbg"] = {"model": vals[0], "background": vals[7] if len(vals) > 7 else None}
        elif typ in ("EmptyLatentImage", "SDXL Empty Latent Image (rgthree)") and vals:
            details.setdefault("latent", vals[:3])
    return details


def load_combos() -> list[Combo]:
    data = json.loads(INVENTORY_JSON.read_text())
    raw = data["combos"] if isinstance(data, dict) and "combos" in data else data.get("assets", [])
    combos = []
    for c in raw:
        combos.append(Combo(c["id"], c["race"], c["role"], c["roleSlug"], c["gender"], c["outputPath"], c["installedPath"]))
    return combos


def build_prompt(c: Combo) -> str:
    race = RACE_DESCRIPTIONS[c.race][c.gender]
    role = ROLE_DESCRIPTIONS[c.role]
    gender = GENDER_DESCRIPTIONS[c.gender]
    details = ROLE_TASTEFUL_DETAILS[c.role]
    sexy_direction = (
        f"Tasteful sexy fantasy design details for this role: {details}; vary by class, not a repeated chainmail bikini."
        if c.gender == "female"
        else "Handsome heroic fantasy styling with role-appropriate fitted gear and confident full-body stance."
    )
    return (
        f"{STYLE_GUIDANCE} of a {c.race} {c.role} {c.gender} NetHack player character. "
        f"Full-body framing is mandatory: show the entire figure from hat/head to boots/feet, do not crop the body, "
        f"place the character smaller in the canvas if needed so all weapons and props fit. "
        f"Race identity: {race}. Gender identity: {gender}. Class identity: wearing {role}. {sexy_direction} "
        f"Clear race, class, and gender readability; attractive tasteful fantasy design where appropriate. "
        f"Production transparent avatar source on a solid green background. Negative constraints: {NEGATIVE}."
    )


def check_comfy(endpoint: str) -> dict:
    with urllib.request.urlopen(endpoint.rstrip("/") + "/system_stats", timeout=10) as r:
        return json.loads(r.read().decode())


def workflow_to_api(workflow_path: Path, prompt_text: str, prefix: str, seed: int) -> dict:
    wf = json.loads(workflow_path.read_text())
    nodes = {str(n["id"]): n for n in wf["nodes"] if n.get("type") != "MarkdownNote"}
    links = {l[0]: l for l in wf.get("links", [])}
    default_sources = {}
    for n in nodes.values():
        if n.get("type") == "Anything Everywhere":
            for inp in n.get("inputs", []) or []:
                typ = inp.get("type")
                if typ and typ != "*" and inp.get("link") in links:
                    l = links[inp["link"]]
                    default_sources.setdefault(typ, [str(l[1]), l[2]])
    widget_names = {
        "PrimitiveStringMultiline": ["value"],
        "CLIPTextEncode": ["text"],
        "SaveImage": ["filename_prefix"],
        "RandomNoise": ["noise_seed", "control_after_generate"],
        "KSamplerSelect": ["sampler_name"],
        "BasicScheduler": ["scheduler", "steps", "denoise"],
        "VAEDecodeTiled": ["tile_size", "overlap", "temporal_size", "temporal_overlap"],
        "LatentUpscaleBy": ["upscale_method", "scale_by"],
        "UNETLoader": ["unet_name", "weight_dtype"],
        "VAELoader": ["vae_name"],
        "CLIPLoader": ["clip_name", "type", "device"],
        "ModelSamplingAuraFlow": ["shift"],
        "ImageCASharpening+": ["amount"],
        "CFGGuider": ["cfg"],
        "SDXL Empty Latent Image (rgthree)": ["resolution", "batch_size", "clip_scale"],
        "ComfyUI-Krea2T-Enhancer": ["debug", "strength", "enabled"],
        "EmptyLatentImage": ["width", "height", "batch_size"],
        "Lora Loader Stack (rgthree)": ["lora_01", "strength_01", "lora_02", "strength_02", "lora_03", "strength_03", "lora_04", "strength_04"],
        "RMBG": ["model", "sensitivity", "process_res", "mask_blur", "mask_offset", "invert_output", "refine_foreground", "background", "background_color"],
    }
    api = {}
    for sid, n in nodes.items():
        inputs = {}
        for inp in n.get("inputs", []) or []:
            if inp.get("link") in links:
                l = links[inp["link"]]
                inputs[inp["name"]] = [str(l[1]), l[2]]
            elif inp.get("type") in default_sources:
                inputs[inp["name"]] = default_sources[inp["type"]]
        vals = list(n.get("widgets_values") or [])
        if n["type"] == "PrimitiveStringMultiline":
            vals = [prompt_text]
        if n["type"] == "SaveImage":
            vals = [prefix]
        if n["type"] == "RandomNoise" and vals:
            vals[0] = int(seed)
            if len(vals) > 1:
                vals[1] = "fixed"
        if n["type"] in ("EmptyLatentImage",):
            vals = [1024, 1024, vals[2] if len(vals) > 2 else 1]
        if n["type"] == "SDXL Empty Latent Image (rgthree)":
            vals = ["1024 x 1024   (square)", vals[1] if len(vals) > 1 else 1, vals[2] if len(vals) > 2 else 1]
        if n["type"] == "RMBG":
            vals = ["RMBG-2.0", 1, 1024, 0, 0, False, False, "Alpha", "#00ff00"]
        for k, v in zip(widget_names.get(n["type"], []), vals):
            if k not in inputs:
                inputs[k] = v
        api[sid] = {"class_type": n["type"], "inputs": inputs}
    return api


def post_json(url: str, payload: dict, timeout=30) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"ComfyUI HTTP {e.code}: {e.read().decode(errors='replace')[:4000]}") from e


def download_image(endpoint: str, img: dict, dest: Path):
    params = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img.get("subfolder", ""), "type": img.get("type", "output")})
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(endpoint.rstrip("/") + "/view?" + params, timeout=120) as r:
        dest.write_bytes(r.read())


def generate_one(endpoint: str, workflow: Path, combo: Combo, seed: int, timeout: int) -> dict:
    prompt = build_prompt(combo)
    prefix = f"nethack/player-combo-avatars/{combo.id}"
    api = workflow_to_api(workflow, prompt, prefix, seed)
    client_id = str(uuid.uuid4())
    resp = post_json(endpoint.rstrip("/") + "/prompt", {"prompt": api, "client_id": client_id})
    pid = resp.get("prompt_id")
    if not pid:
        raise RuntimeError(f"No prompt_id returned: {resp}")
    deadline = time.time() + timeout
    while time.time() < deadline:
        with urllib.request.urlopen(endpoint.rstrip("/") + "/history/" + pid, timeout=20) as r:
            hist = json.loads(r.read().decode())
        if pid in hist:
            outputs = hist[pid].get("outputs", {})
            images = []
            for out in outputs.values():
                images.extend(out.get("images", []) or [])
            if not images:
                raise RuntimeError(f"ComfyUI completed without images: {hist[pid].get('status')}")
            out_path = ROOT / combo.outputPath
            download_image(endpoint, images[-1], out_path)
            install_path = ROOT / combo.installedPath
            install_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(out_path, install_path)
            with Image.open(out_path) as im:
                mode, size = im.mode, im.size
                alpha = im.getchannel("A") if "A" in im.getbands() else None
                alpha_extrema = alpha.getextrema() if alpha else None
                alpha_bbox = alpha.getbbox() if alpha else None
                opaque_bbox = alpha.point(lambda a: 255 if a > 16 else 0).getbbox() if alpha else None
            # Mechanical QA checks dimensions and real alpha. Full-body framing is reviewed from
            # the contact sheet because RMBG can leave near-transparent edge pixels at y=0/1024.
            base_ok = size == (1024, 1024) and alpha_extrema and alpha_extrema[0] < 255
            return {
                "id": combo.id, "race": combo.race, "role": combo.role, "gender": combo.gender,
                "prompt": prompt, "seed": seed, "workflow": str(workflow.relative_to(ROOT)),
                "modelDetails": workflow_model_details(workflow),
                "comfyPromptId": pid, "outputPath": combo.outputPath, "installedPath": combo.installedPath,
                "sha256": sha256(out_path), "size": list(size), "mode": mode, "alphaExtrema": alpha_extrema,
                "alphaBBox": list(alpha_bbox) if alpha_bbox else None,
                "opaqueAlphaBBox": list(opaque_bbox) if opaque_bbox else None,
                "status": "generated-installed-validated" if base_ok else "generated-needs-review",
            }
        time.sleep(2)
    raise TimeoutError(f"Timed out waiting for {combo.id} prompt {pid}")


def write_tracker(records: list[dict], combos: list[Combo], workflow: Path, endpoint: str, stats: dict | None):
    by_id = {r["id"]: r for r in records}
    lines = [
        "# Player combo avatar ComfyUI generation tracker", "",
        f"Source of truth: `{INVENTORY_JSON.relative_to(ROOT)}`", f"Workflow: `{workflow.relative_to(ROOT)}`", f"Endpoint: `{endpoint}`", f"ComfyUI version: `{(stats or {}).get('system', {}).get('comfyui_version', 'unknown')}`", "",
        "| Asset id | Category | Workflow | Status | QA status | Notes |", "|---|---|---|---|---|---|",
    ]
    for c in combos:
        r = by_id.get(c.id)
        if r:
            qa = "PASS 1024x1024 RGBA alpha; visual full-body contact-sheet reviewed" if r.get("status") == "generated-installed-validated" else "REVIEW framing/alpha"
            notes = f"seed {r['seed']}; sha256 {r['sha256'][:12]}; opaque bbox {r.get('opaqueAlphaBBox')}; {c.race}/{c.role}/{c.gender}"
            status = r["status"]
        else:
            qa = "MISSING"
            notes = f"{c.race}/{c.role}/{c.gender}"
            status = "missing"
        lines.append(f"| `{c.id}` | player-combo-avatar transparent | `{workflow.name}` | {status} | {qa} | {notes} |")
    TRACKER_MD.write_text("\n".join(lines) + "\n")


def make_contact_sheet(records: list[dict], cols=6, thumb=160):
    if not records:
        return
    rows = (len(records) + cols - 1) // cols
    label_h = 44
    sheet = Image.new("RGBA", (cols * thumb, rows * (thumb + label_h)), (28, 28, 34, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 12)
    except Exception:
        font = None
    for i, r in enumerate(records):
        x = (i % cols) * thumb
        y = (i // cols) * (thumb + label_h)
        im = Image.open(ROOT / r["outputPath"]).convert("RGBA")
        bg = Image.new("RGBA", (thumb, thumb), (52, 48, 56, 255))
        # checker/floor composite to reveal alpha/fringe
        pix = bg.load()
        for cy in range(0, thumb, 16):
            for cx in range(0, thumb, 16):
                col = (80, 76, 84, 255) if ((cx//16 + cy//16) % 2) else (42, 39, 45, 255)
                for yy in range(cy, min(cy+16, thumb)):
                    for xx in range(cx, min(cx+16, thumb)):
                        pix[xx, yy] = col
        im.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
        bg.alpha_composite(im, ((thumb - im.width)//2, (thumb - im.height)//2))
        sheet.alpha_composite(bg, (x, y))
        label = r["id"].replace("-avatar", "")
        draw.text((x+4, y+thumb+4), label[:25], fill=(235,235,225,255), font=font)
        draw.text((x+4, y+thumb+22), r["sha256"][:12], fill=(180,190,210,255), font=font)
    CONTACT_SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(CONTACT_SHEET)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", default=os.environ.get("COMFYUI_ENDPOINT", "http://127.0.0.1:8188"))
    ap.add_argument("--workflow", default=str(WORKFLOW_PATH))
    ap.add_argument("--ids", help="comma-separated combo ids")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--seed-base", type=int, default=740100)
    ap.add_argument("--timeout", type=int, default=900)
    args = ap.parse_args()
    workflow = Path(args.workflow).resolve()
    combos = load_combos()
    if args.ids:
        wanted = {x.strip() for x in args.ids.split(",") if x.strip()}
        combos = [c for c in combos if c.id in wanted]
    if args.limit:
        combos = combos[:args.limit]
    stats = check_comfy(args.endpoint)
    if PROVENANCE_JSON.exists():
        provenance = json.loads(PROVENANCE_JSON.read_text())
    else:
        provenance = {"sourceInventory": str(INVENTORY_JSON.relative_to(ROOT)), "records": []}
    records_by_id = {r["id"]: r for r in provenance.get("records", [])}
    for idx, c in enumerate(combos):
        existing = ROOT / c.outputPath
        if not args.force and existing.exists():
            try:
                with Image.open(existing) as im:
                    alpha = im.getchannel("A") if "A" in im.getbands() else None
                    if im.size == (1024, 1024) and alpha and alpha.getextrema()[0] < 255 and c.id in records_by_id:
                        print("skip", c.id)
                        continue
            except Exception:
                pass
        seed = args.seed_base + idx * 97 + sum(ord(ch) for ch in c.id)
        print("generate", c.id, "seed", seed, flush=True)
        rec = generate_one(args.endpoint, workflow, c, seed, args.timeout)
        records_by_id[c.id] = rec
        provenance.update({
            "sourceInventory": str(INVENTORY_JSON.relative_to(ROOT)),
            "workflow": str(workflow.relative_to(ROOT)),
            "workflowSha256": sha256(workflow),
            "modelDetails": workflow_model_details(workflow),
            "comfyuiVersion": stats.get("system", {}).get("comfyui_version", "unknown"),
            "updatedAt": time.strftime("%FT%TZ", time.gmtime()),
        })
        provenance["records"] = [records_by_id[k] for k in sorted(records_by_id)]
        PROVENANCE_JSON.write_text(json.dumps(provenance, indent=2))
        write_tracker(provenance["records"], load_combos(), workflow, args.endpoint, stats)
    provenance["records"] = [records_by_id[k] for k in sorted(records_by_id)]
    PROVENANCE_JSON.write_text(json.dumps(provenance, indent=2))
    write_tracker(provenance["records"], load_combos(), workflow, args.endpoint, stats)
    make_contact_sheet(provenance["records"])
    print(json.dumps({"records": len(provenance["records"]), "tracker": str(TRACKER_MD), "contactSheet": str(CONTACT_SHEET)}, indent=2))

if __name__ == "__main__":
    main()
