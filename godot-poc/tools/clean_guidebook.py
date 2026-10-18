#!/usr/bin/env python3
"""Turns NetHack's paginated, justified doc/Guidebook.txt into a readable
manual for the in-game help (project/assets/text/manual.txt).

- page headers ("NetHack Guidebook 12") and footers ("NetHack 5.0.0 ...")
  are removed, and paragraphs split by a page break are joined again;
- justified paragraphs are reflowed into one line each (the help screen
  wraps them), with the justification's double spaces collapsed;
- words hyphenated at a line end: the
  hyphen stays when the guide writes that compound with a hyphen mid-line
  elsewhere ("two-" + "handed" -> "two-handed"), otherwise the word is
  rejoined ("bat-" + "tle" -> "battle");
- section headings ("4.  Commands") stay on their own line; command lists
  ("/    The whatis command ...") become "/   text"; anything else that
  isn't plain prose (tables, examples) keeps its line breaks.

Usage: tools/clean_guidebook.py [doc/Guidebook.txt] [output]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "doc" / "Guidebook.txt"
OUTPUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "godot-poc" / "project" / "assets" / "text" / "manual.txt"

HEADER = re.compile(r"^\s+NetHack Guidebook\s+\d+\s*$")
FOOTER = re.compile(r"^\s+NetHack \d+\.\d+\.\d+\s+.*\d{4}\s*$")
HEADING = re.compile(r"^ {5}(\d+(?:\.\d+)*\.)\s+(\S.*)$")
ENTRY = re.compile(r"^ {5}(\S(?:\S| \S)*?)\s{2,}(\S.*)$")


def indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def remove_pages(lines: list[str]) -> list[str]:
    """Drops headers/footers and the blank lines around them, keeping a
    paragraph break only where the text after the break starts one."""
    out: list[str] = []
    i = 0
    while i < len(lines):
        if HEADER.match(lines[i]) or FOOTER.match(lines[i]):
            # Swallow the whole page-break region.
            while out and out[-1].strip() == "":
                out.pop()
            i += 1
            while i < len(lines) and (lines[i].strip() == "" or HEADER.match(lines[i]) or FOOTER.match(lines[i])):
                i += 1
            if i < len(lines) and out:
                nxt = lines[i]
                # A sentence carried over the break starts lower-case.
                continues = nxt.strip()[:1].islower() and not out[-1].rstrip().endswith(":")
                if not continues:
                    out.append("")
            continue
        out.append(lines[i].rstrip())
        i += 1
    return out


def is_figure(line: str) -> bool:
    return line.strip()[:1] in ("+", "|")


def blocks(lines: list[str]) -> list[list[str]]:
    """Blank-line separated blocks; a figure (+--- / | rows) is always its
    own block, even when no blank line separates it from the text."""
    result: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if current and line.strip() != "" and is_figure(line) != is_figure(current[-1]):
            result.append(current)
            current = []
        if line.strip() == "":
            if current:
                result.append(current)
                current = []
        else:
            current.append(line)
    if current:
        result.append(current)
    return result


def join_lines(parts: list[str], compounds: set[str]) -> str:
    text = ""
    for part in parts:
        part = re.sub(r"\s{2,}", " ", part.strip())
        if not text:
            text = part
            continue
        m = re.search(r"([A-Za-z]+)-$", text)
        first = re.match(r"([a-z]+)", part)
        if m and first:
            compound = f"{m.group(1)}-{first.group(1)}".lower()
            text = text + part if compound in compounds else text[:-1] + part
            continue
        text = text + " " + part
    return text


def is_prose(block: list[str]) -> bool:
    """Justified prose at any depth: every line at one base indent (the
    first may be indented 5 more), with mostly full-width lines."""
    base = min(indent(l) for l in block)
    body = block[1:] if len(block) > 1 and indent(block[0]) == base + 5 else block
    if any(indent(l) != base for l in body) or base < 5 or any(is_figure(l) for l in block):
        return False
    if len(block) == 1:
        return len(block[0].strip()) > 40 and not ENTRY.match(block[0])
    long_lines = sum(1 for l in body[:-1] if len(l) >= 60)
    return len(body) == 1 or long_lines >= max(1, (len(body) - 1) * 2 // 3)


def entry_of(block: list[str]) -> tuple[str, list[str]] | None:
    """A key and its description: "/    The whatis command..." (more lines
    indented deeper), or a key alone on its line with the text below it."""
    first = block[0]
    if indent(first) != 5 or any(indent(l) <= 5 for l in block[1:]):
        return None
    m = ENTRY.match(first)
    if m and len(m.group(1)) <= 16:
        return m.group(1), [m.group(2)] + block[1:]
    key = first.strip()
    if " " not in key and len(key) <= 16 and len(block) > 1:
        return key, block[1:]
    return None


def main() -> None:
    raw = SOURCE.read_text(encoding="utf-8", errors="replace").replace("\f", "\n").splitlines()
    lines = remove_pages(raw)
    # Compounds the guide hyphenates mid-line ("two-handed"): a line-end
    # hyphen splitting one of these is a real hyphen.
    compounds = {c.lower() for c in re.findall(r"[A-Za-z]+-[A-Za-z]+", "\n".join(lines))}
    out: list[str] = []
    for block in blocks(lines):
        heading = HEADING.match(block[0])
        if heading and len(block) == 1:
            out += ["", f"{heading.group(1)}  {heading.group(2).strip()}", ""]
            continue
        entry = entry_of(block)
        if entry:
            out.append(f"{entry[0]}   {join_lines(entry[1], compounds)}")
            out.append("")
            continue
        if is_prose(block):
            out.append(join_lines(block, compounds))
            out.append("")
            continue
        base = min(indent(l) for l in block)
        out += [l[base:] for l in block]
        out.append("")
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"
    OUTPUT.write_text(text, encoding="utf-8")
    print(f"{OUTPUT}: {len(text.splitlines())} lines (from {len(raw)})")


if __name__ == "__main__":
    main()
