#!/usr/bin/env python3
"""Install the approved generated canine candidate as the canonical NetHack dog.

The original full-source dog output was a malformed, tiny side-on silhouette.
This targeted curation pass derives the medium dog from the already generated,
QA-approved large-dog candidate, scaling it down so little dog, dog, and large
dog remain visually distinct. It updates every canonical/runtime copy plus the
manifest, generation status, and tracker provenance.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "electron-poc/assets/tiles/manifest.json"
STATUS = ROOT / "asset-generation/manifests/generation-status.json"
TRACKER = ROOT / "asset-generation/manifests/full-regeneration-tracker.md"
SOURCE = ROOT / "asset-generation/outputs/full-source-monsters/large-dog.png"
TARGET_ID = "dog"
WORKFLOW = "asset-generation/scripts/fix_dog_asset.py"
PARENT_WORKFLOW = "asset-generation/workflows/krea2_basic_rem-background.json"
APPROVED_SOURCE_SHA256 = "38522db76a9c892ab527debfb14f53383945e92feac10bc04d3efbe901ec39b7"
PROMPT = (
    "A concept pixel art image in the style of a fantasy game asset of a medium domestic dog: "
    "a clearly recognizable warm brown and cream dog with floppy ears, raised tail, sturdy paws, "
    "tan highlights, amber eyes, and pale gold edge accents. on a solid green background. "
    "Isolated transparent cutout sprite for a cohesive fantasy roguelike tileset, bold centered "
    "canine silhouette, readable at 32px and 16px on dark dungeon stone, no text, no letters, "
    "no UI badge, no square card, no baked checkerboard, no fake transparency, no flat vector look."
)
NOTE = (
    "Boss dog visual repair: curated from the existing QA-approved full-source large-dog generation "
    "and scaled to a distinct medium 27px, left-facing, lighter canine silhouette; clearly recognizable at 32px/16px. "
    "Canonical output, generated runtime install, and by-category mirror are synchronized; real alpha, "
    "no opaque edge/card/green matte. Pet-state resolution preserves growth stage: little dog uses "
    "little-dog-pet, adult dog uses dog, and large dog uses large-dog."
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_stats(image: Image.Image) -> dict:
    alpha = list(image.getchannel("A").getdata())
    edge = alpha[:32] + alpha[-32:]
    edge += [alpha[y * 32] for y in range(1, 31)]
    edge += [alpha[y * 32 + 31] for y in range(1, 31)]
    pixels = list(image.getdata())
    return {
        "size": [32, 32],
        "transparentPixels": sum(value == 0 for value in alpha),
        "semiTransparentPixels": sum(0 < value < 255 for value in alpha),
        "opaquePixels": sum(value == 255 for value in alpha),
        "opaqueEdgePixels": sum(value == 255 for value in edge),
        "visibleGreenMattePixels": sum(
            a > 0 and g > 170 and g > r * 1.45 and g > b * 1.35
            for r, g, b, a in pixels
        ),
    }


def medium_dog_from_approved_candidate() -> Image.Image:
    source_digest = sha(SOURCE)
    if source_digest != APPROVED_SOURCE_SHA256:
        raise RuntimeError(
            f"approved source changed: expected {APPROVED_SOURCE_SHA256}, got {source_digest}"
        )
    source = Image.open(SOURCE).convert("RGBA")
    bbox = source.getbbox()
    if not bbox:
        raise RuntimeError("approved large-dog candidate is empty")
    subject = source.crop(bbox).resize((27, 27), Image.Resampling.LANCZOS)
    subject = ImageOps.mirror(ImageEnhance.Brightness(subject).enhance(1.08))
    result = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    result.alpha_composite(subject, (2, 3))
    return result


def update_tracker(note: str) -> None:
    text = TRACKER.read_text()
    pattern = re.compile(r"^(\| `dog` \| full-source-monsters \| transparent \| generated \| )[^|]+(\| ).*( \|)$", re.MULTILINE)
    replacement = rf"\1qa-reviewed \2{note}\3"
    updated, count = pattern.subn(replacement, text)
    if count != 1:
        raise RuntimeError(f"expected one dog tracker row, found {count}")
    TRACKER.write_text(updated)


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    status = json.loads(STATUS.read_text())
    by_id = {asset["id"]: asset for asset in manifest["assets"]}
    asset = by_id[TARGET_ID]
    timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    backup_root = ROOT / "asset-generation/backups" / datetime.now(timezone.utc).strftime("dog-visual-fix-%Y%m%dT%H%M%SZ")

    output = ROOT / asset["outputPath"]
    installed = ROOT / asset["installedPath"]
    mirror = ROOT / "electron-poc/assets/tiles/by-category" / asset["categorySlug"] / f"{TARGET_ID}.png"
    for path in (output, installed, mirror):
        if path.exists():
            backup = backup_root / path.relative_to(ROOT)
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, backup)

    image = medium_dog_from_approved_candidate()
    stats = alpha_stats(image)
    if stats["opaqueEdgePixels"] or stats["visibleGreenMattePixels"]:
        raise RuntimeError(f"dog transparency QA failed: {stats}")
    for path in (output, installed, mirror):
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path)

    digest = sha(output)
    source_digest = sha(SOURCE)
    updates = {
        "artDirection": "A readable medium domestic dog with a sturdy canine body, floppy ears, raised tail, and distinct muzzle; smaller and lighter-framed than large dog.",
        "prompt": PROMPT,
        "renderingNotes": NOTE,
        "status": "installed",
        "workflow": WORKFLOW,
        "workflowLabel": "transparent-approved-candidate-curation",
        "parentGenerationWorkflow": PARENT_WORKFLOW,
        "outputProcess": "PIL alpha-preserving crop, 27px resize, horizontal mirror, and 1.08 brightness adjustment", 
        "completedAt": timestamp,
        "coherentRestartAt": timestamp,
        "coherentRestartStatus": "generated",
        "coherentRestartQaStatus": "qa-reviewed",
        "coherentRestartQaAt": timestamp,
        "coherentRestartNotes": NOTE,
        "qaNote": NOTE,
        "sourceCandidatePath": str(SOURCE.relative_to(ROOT)),
        "sourceCandidateSha256": source_digest,
        "approvedSourceSha256": APPROVED_SOURCE_SHA256,
        "sha256": digest,
        "alphaStats": stats,
    }
    asset.update(updates)
    record = dict(status.setdefault("assets", {}).get(TARGET_ID, {}))
    record.update(asset)
    status["assets"][TARGET_ID] = record
    status["runs"] = [run for run in status.setdefault("runs", []) if run.get("type") != "targeted-dog-visual-fix"]
    status["runs"].append({
        "type": "targeted-dog-visual-fix",
        "startedAt": timestamp,
        "completedAt": timestamp,
        "targets": [TARGET_ID],
        "sourceCandidatePath": str(SOURCE.relative_to(ROOT)),
        "sourceCandidateSha256": source_digest,
        "outputSha256": digest,
        "backupRoot": str(backup_root.relative_to(ROOT)),
        "alphaStats": stats,
    })
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    STATUS.write_text(json.dumps(status, indent=2) + "\n")
    update_tracker(NOTE)
    print(json.dumps({
        "id": TARGET_ID,
        "source": str(SOURCE.relative_to(ROOT)),
        "output": str(output.relative_to(ROOT)),
        "installed": str(installed.relative_to(ROOT)),
        "mirror": str(mirror.relative_to(ROOT)),
        "sha256": digest,
        "sourceSha256": source_digest,
        "backupRoot": str(backup_root.relative_to(ROOT)),
        "alphaStats": stats,
    }, indent=2))


if __name__ == "__main__":
    main()
