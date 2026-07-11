#!/usr/bin/env python3
"""Smoke-check regenerated prompt text for semantic subject descriptions.

This does not contact ComfyUI or generate images. It verifies that representative
full-source monster prompts no longer pass through manifest placeholder text such
as "keyed from source glyph 'K'", and that known semantic/material words are
present for problematic glyph/golem/elf cases.
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'asset-generation/scripts/full_tileset_regenerate.py'
MANIFEST = ROOT / 'electron-poc/assets/tiles/manifest.json'
IDS = ['kop-lieutenant', 'lich', 'stone-golem', 'glass-golem', 'elf', 'green-elf', 'vrock', 'hezrou', 'bone-devil', 'ice-devil', 'nalfeshnee', 'pit-fiend', 'sandestin', 'balrog']
REQUIRED_TERMS = {
    'kop-lieutenant': ['Keystone Kop', 'police lieutenant', 'blue uniform', 'brass badge'],
    'lich': ['undead lich', 'skull face', 'robe'],
    'stone-golem': ['rough gray stone', 'granite', 'boulder fists'],
    'glass-golem': ['transparent glass', 'crystal shards', 'faceted'],
    'elf': ['pointed ears', 'green cloak', 'small bow'],
    'green-elf': ['pointed ears', 'emerald cloak', 'golden bow'],
    'vrock': ['vrock vulture demon', 'feathered wings', 'hooked beak'],
    'hezrou': ['hezrou toad demon', 'warty skin', 'swamp'],
    'bone-devil': ['bone devil', 'skeletal insectoid body', 'hooked bone tail'],
    'ice-devil': ['ice devil', 'insect fiend', 'frost spikes'],
    'nalfeshnee': ['nalfeshnee', 'boar-ape demon', 'tusked boar head'],
    'pit-fiend': ['pit fiend archdevil', 'broad bat wings', 'forked tail'],
    'sandestin': ['sandestin summoned spirit', 'vapor robes', 'magical wisps'],
    'balrog': ['balrog fire demon', 'blazing mane', 'flaming whip'],
}
FORBIDDEN = [
    'keyed from source glyph',
    'source glyph',
    'glyph class',
    'glyph-class',
    'no text/initial badge',
]
GLYPH_QUOTE_RE = re.compile(r"glyph\s*['\"][^'\"]+['\"]", re.IGNORECASE)


def load_regenerator():
    spec = importlib.util.spec_from_file_location('full_tileset_regenerate', SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def main() -> int:
    regen = load_regenerator()
    assets = {a['id']: a for a in json.loads(MANIFEST.read_text())['assets']}
    failures = []
    snippets = {}
    for aid in IDS:
        prompt = regen.prompt_for(assets[aid])
        snippets[aid] = prompt
        low = prompt.lower()
        for bad in FORBIDDEN:
            if bad in low:
                failures.append(f'{aid}: forbidden placeholder text present: {bad}')
        if GLYPH_QUOTE_RE.search(prompt):
            failures.append(f'{aid}: quoted glyph instruction present')
        for term in REQUIRED_TERMS[aid]:
            if term.lower() not in low:
                failures.append(f'{aid}: required semantic term missing: {term}')
    print(json.dumps({'ids': IDS, 'prompts': snippets}, indent=2))
    if failures:
        print('\nFAILURES:', file=sys.stderr)
        for failure in failures:
            print(f'- {failure}', file=sys.stderr)
        return 1
    print('\nPrompt semantic smoke check passed: no source-glyph placeholder instructions and required semantic descriptions are present.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
