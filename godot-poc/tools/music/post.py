#!/usr/bin/env python3
"""Turns generate.py's raw WAVs into the game's MP3s and music.json.

    post.py            process every new take, rewrite the manifest
    post.py --force    reprocess every take

For each take it checks the audio (long enough, not silent, not clipped
flat), then:
  - themes and pieces: trims leading/trailing silence, evens the loudness
    (EBU R128, -20 LUFS: under the game's effects), fades in 1.5 s and out
    4 s;
  - stingers: trims the leading silence, keeps the first seconds up to the
    first lull (at most 9 s), fades the tail; -17 LUFS.
Encoded as VBR MP3 (~130 kbit/s) in project/assets/music/<track>/<take>.mp3.
Takes listed in asset-generation/outputs/music/rejected.txt (one WAV stem per
line, e.g. "mines-calm-t2-s5321") are left out, as are takes that fail the
checks. Results go to asset-generation/outputs/music/qa.json.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import tracks  # noqa: E402

REPO = HERE.parents[2]
OUT = REPO / "asset-generation" / "outputs" / "music"
RAW = OUT / "raw"
ASSETS = REPO / "godot-poc" / "project" / "assets" / "music"
TAKE = re.compile(r"^(?P<id>.+)-t(?P<take>\d+)-s\d+$")


def probe(path: Path) -> dict:
    """Duration, mean and peak volume, and how much is near silence."""
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "volumedetect,silencedetect=n=-45dB:d=2", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    duration = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    seconds = int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3]) if duration else 0.0
    mean = float(re.search(r"mean_volume: (-?[\d.]+) dB", out)[1]) if "mean_volume" in out else -99.0
    peak = float(re.search(r"max_volume: (-?[\d.]+) dB", out)[1]) if "max_volume" in out else -99.0
    silent = sum(float(x) for x in re.findall(r"silence_duration: ([\d.]+)", out))
    lulls = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    return {"seconds": round(seconds, 1), "mean_db": mean, "peak_db": peak, "silent_s": round(silent, 1), "lulls": lulls}


def check(track: dict, info: dict) -> str:
    """Why a take is unusable, or ""."""
    if info["seconds"] < (8 if track["kind"] == "stinger" else 40):
        return f"too short ({info['seconds']} s)"
    if info["mean_db"] < -42:
        return f"nearly silent (mean {info['mean_db']} dB)"
    if info["silent_s"] > info["seconds"] * 0.35:
        return f"{info['silent_s']} s of silence"
    if info["mean_db"] > -6:
        return f"clipped flat (mean {info['mean_db']} dB)"
    return ""


def encode(track: dict, wav: Path, mp3: Path, info: dict) -> None:
    trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05"
    if track["kind"] == "stinger":
        # Up to the first lull after the cue (or 9 s).
        later = [t for t in info["lulls"] if t > 2.5]
        length = min(9.0, later[0] + 0.8 if later else 9.0)
        chain = f"{trim},atrim=0:{length:.2f},loudnorm=I=-17:TP=-1.5:LRA=11,afade=t=out:st={max(0.5, length - 1.8):.2f}:d=1.8"
    else:
        reverse_trim = f"areverse,{trim},areverse"
        chain = f"{trim},{reverse_trim},loudnorm=I=-20:TP=-2:LRA=11,afade=t=in:d=1.5,areverse,afade=t=in:d=4:curve=qsin,areverse"
    mp3.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav), "-af", chain,
                    "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-q:a", "5", str(mp3)], check=True)


def main() -> None:
    force = "--force" in sys.argv
    rejected = set()
    if (OUT / "rejected.txt").exists():
        rejected = {line.split("#")[0].strip() for line in (OUT / "rejected.txt").read_text().splitlines()} - {""}
    qa_path = OUT / "qa.json"
    qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
    manifest: dict[str, list[str]] = {}
    for wav in sorted(RAW.glob("*.wav")):
        m = TAKE.match(wav.stem)
        track = tracks.BY_ID.get(m["id"]) if m else None
        if track is None:
            continue
        mp3 = ASSETS / track["id"] / f"{m['take']}.mp3"
        entry = qa.get(wav.stem)
        if force or entry is None or entry.get("mtime") != wav.stat().st_mtime:
            info = probe(wav)
            entry = {**info, "mtime": wav.stat().st_mtime, "problem": check(track, info)}
            if not entry["problem"]:
                encode(track, wav, mp3, info)
                entry["mp3_seconds"] = probe(mp3)["seconds"]
            qa[wav.stem] = entry
            print(f"{wav.stem}: {entry['seconds']} s, mean {entry['mean_db']} dB" + (f"  REJECTED: {entry['problem']}" if entry["problem"] else ""), flush=True)
        if wav.stem in rejected or entry["problem"]:
            mp3.unlink(missing_ok=True)
            continue
        if mp3.exists():
            manifest.setdefault(track["id"], []).append(f"{track['id']}/{mp3.name}")
    qa_path.write_text(json.dumps(qa, indent=1) + "\n")
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "music.json").write_text(json.dumps({"tracks": dict(sorted(manifest.items()))}, indent=1) + "\n")
    missing = [t["id"] for t in tracks.TRACKS if t["id"] not in manifest]
    print(f"{len(manifest)} of {len(tracks.TRACKS)} tracks have music" + (f"; missing: {', '.join(missing)}" if missing else ""))


if __name__ == "__main__":
    main()
