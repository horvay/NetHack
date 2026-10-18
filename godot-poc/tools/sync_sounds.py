#!/usr/bin/env python3
"""Decodes NetHack's uuencoded sound clips (sound/wav/*.uu) into the Godot
project with their attribution file (CC0 / CC-BY, see attributions.txt)."""
import binascii
import shutil
import sys
from pathlib import Path

GODOT = Path(__file__).resolve().parent.parent
SOURCE = GODOT.parent / "sound" / "wav"
OUT = GODOT / "project" / "assets" / "sound" / "nethack"


def uudecode(path: Path) -> bytes:
    data = bytearray()
    started = False
    for line in path.read_text(encoding="latin-1").splitlines():
        if line.startswith("begin "):
            started = True
            continue
        if not started:
            continue
        if line.strip() == "end":
            break
        if not line:
            continue
        try:
            data += binascii.a2b_uu(line)
        except binascii.Error:
            nbytes = (((ord(line[0]) - 32) & 63) * 4 + 5) // 3
            data += binascii.a2b_uu(line[:nbytes])
    return bytes(data)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    count = 0
    for uu in sorted(SOURCE.glob("*.uu")):
        (OUT / (uu.stem + ".wav")).write_bytes(uudecode(uu))
        count += 1
    shutil.copyfile(SOURCE / "attributions.txt", OUT / "attributions.txt")
    print(f"decoded {count} clips into {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
