#!/usr/bin/env python3
"""How much human voice a take has: Demucs (htdemucs) splits off the vocal
stem, then
  - voiced_s: seconds where the vocal stem is loud in its own right and not
    far under the mix (a voice you'd hear, not the separator's bleed);
  - whisper: what WhisperX hears in the vocal stem alone (words that the
    instruments hid from it in the full mix).

    voices.py WAV...      prints one JSON line per take

Runs on the CPU with whisperx's torch (the 3080 is for games); Demucs lives
in ~/.cache/nethack-demucs/lib (see ASSET_GENERATION.md, Music).
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path.home() / ".cache/nethack-demucs/lib"))
from demucs.api import Separator, save_audio  # noqa: E402

STEMS = Path("/tmp/nethack-music-voices")
WINDOW = 0.5
# A window has a voice when the vocal stem is above this level (dBFS) and at
# most MIX_GAP dB under the whole mix there.
VOICE_DB = -38.0
MIX_GAP = 9.0


def db(x: np.ndarray) -> np.ndarray:
    return 20 * np.log10(np.maximum(x, 1e-9))


def window_rms(audio: torch.Tensor, rate: int) -> np.ndarray:
    mono = audio.mean(0).numpy()
    n = int(WINDOW * rate)
    frames = len(mono) // n
    return np.sqrt((mono[: frames * n].reshape(frames, n) ** 2).mean(1))


def whisper(wav: Path) -> list[str]:
    out = STEMS / "whisper"
    out.mkdir(parents=True, exist_ok=True)
    subprocess.run(["whisperx", str(wav), "--model", "large-v3", "--device", "cpu", "--compute_type", "int8", "--language", "en",
                    "--no_align", "--output_format", "json", "--output_dir", str(out)], capture_output=True, check=True)
    return [s["text"].strip() for s in json.loads((out / f"{wav.stem}.json").read_text()).get("segments", [])]


def main() -> None:
    torch.set_num_threads(16)
    separator = Separator(model="htdemucs", device="cpu")
    STEMS.mkdir(parents=True, exist_ok=True)
    for arg in sys.argv[1:]:
        wav = Path(arg)
        mix, stems = separator.separate_audio_file(wav)
        rate = separator.samplerate
        vocals = stems["vocals"]
        v, m = db(window_rms(vocals, rate)), db(window_rms(mix, rate))
        voiced = (v > VOICE_DB) & (v > m - MIX_GAP)
        stem = STEMS / f"{wav.stem}.vocals.wav"
        save_audio(vocals, str(stem), samplerate=rate)
        at = [round(i * WINDOW) for i in np.flatnonzero(voiced) if i == 0 or not voiced[i - 1]]
        print(json.dumps({"take": wav.stem, "voiced_s": round(float(voiced.sum() * WINDOW), 1), "at": at,
                          "vocal_db": round(float(np.percentile(v, 95)), 1), "whisper": whisper(stem)}), flush=True)


if __name__ == "__main__":
    main()
