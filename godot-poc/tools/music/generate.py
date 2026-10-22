#!/usr/bin/env python3
"""Writes the game's music with MiniMax Music 3 on the B70 (xpu_music3).

    generate.py [track-id ...]            all tracks when none given
    generate.py --replace [track-id ...]  then replace rejected takes

One process per take, each its own `b70-lease run` job, so a batch never
holds the B70 for hours: the queue gives other owners the card between
takes once this owner's 30-minute turn is over (~/ai/b70q/README.md).
Run from inside a queued job, each take runs at once under that job. Takes that already have a WAV are skipped; delete one to
regenerate it. A take post.py rejected (qa.json) or listed in rejected.txt
doesn't count: the track gets another take with a new seed, up to
MAX_EXTRA more. Raw WAVs, captions and logs go to
asset-generation/outputs/music/raw/ (not in git); post.py turns them into
the game's MP3s.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import tracks  # noqa: E402

REPO = HERE.parents[2]
RAW = REPO / "asset-generation" / "outputs" / "music" / "raw"
QA = RAW.parent / "qa.json"
REJECTED = RAW.parent / "rejected.txt"
MAX_EXTRA = 3
TOOL = Path.home() / "b70/engines/sd.cpp/xpu_sdpa/xpu_music3"


def seed_for(track_id: str, take: int) -> int:
    # Round 2 (MiniMax-format captions, 2026-10-19): new seeds, new file names.
    return 20000 + sum(ord(c) for c in track_id) * 7 + take * 1009


def wav_seconds(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / float(w.getframerate())


def take_path(track: dict, take: int) -> Path:
    return RAW / f"{track['id']}-t{take}-s{seed_for(track['id'], take)}.wav"


def generate(track: dict, take: int) -> None:
    out = take_path(track, take)
    if out.exists() and out.stat().st_size > 0:
        return
    stem = out.with_suffix("")
    caption, lyrics = stem.with_suffix(".caption.txt"), stem.with_suffix(".lyrics.txt")
    caption.write_text(tracks.caption(track, take))
    lyrics.write_text(tracks.lyrics(track))
    started = time.time()
    with open(stem.with_suffix(".log"), "w") as log:
        code = subprocess.call(
            ["b70-lease", "run", "nethack-music", "--note", out.stem, "--", str(TOOL),
             "--caption-file", str(caption), "--lyrics-file", str(lyrics),
             "--seconds", str(track["seconds"]), "--seed", str(seed_for(track["id"], take)), "--out", str(out)],
            stdout=log, stderr=subprocess.STDOUT)
    if code != 0 or not out.exists():
        print(f"FAILED {out.name} (exit {code}); see {stem.with_suffix('.log')}", flush=True)
        out.unlink(missing_ok=True)
        return
    print(f"{out.name}: {wav_seconds(out):.1f}s in {time.time() - started:.0f}s", flush=True)


def usable(track: dict, take: int) -> bool | None:
    """Whether a generated take passed post.py's checks (None: not checked)."""
    qa = json.loads(QA.read_text()) if QA.exists() else {}
    rejected = set(REJECTED.read_text().split()) if REJECTED.exists() else set()
    stem = take_path(track, take).stem
    if stem in rejected:
        return False
    if stem not in qa:
        return None
    return not qa[stem]["problem"]


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    todo = [t for t in tracks.TRACKS if not args or t["id"] in args]
    if "--replace" in sys.argv:
        # Replace the takes post.py rejected with new seeds.
        for track in todo:
            take = 1
            good = 0
            while good < track["takes"] and take <= track["takes"] + MAX_EXTRA:
                generate(track, take)
                if usable(track, take) is None:
                    subprocess.call([sys.executable, str(HERE / "post.py")], stdout=subprocess.DEVNULL)
                good += 1 if usable(track, take) else 0
                take += 1
        return
    # First take of everything, then the second takes: the game has a full
    # set early.
    for take in range(1, max(t["takes"] for t in todo) + 1):
        for track in todo:
            if take <= track["takes"]:
                generate(track, take)


if __name__ == "__main__":
    main()
