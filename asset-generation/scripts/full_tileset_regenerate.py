#!/usr/bin/env python3
"""Restart/regenerate the full 990 NetHack Electron tileset with coherent workflow choices.

This script is intentionally resume-friendly. It builds prompts from the current
Electron manifest/generation-status, chooses transparent RMBG workflow for cutout
overlays and regular workflow for opaque terrain/base tiles, installs 32x32 PNGs,
updates generation-status/electron manifest, and rewrites a full markdown tracker.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import sys
import time
from collections import Counter, OrderedDict
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
EMAN = ROOT / 'electron-poc/assets/tiles/manifest.json'
STATUS = ROOT / 'asset-generation/manifests/generation-status.json'
BASE_SCRIPT = ROOT / 'asset-generation/scripts/generate_assets.py'
TRANSPARENT_WF = ROOT / 'asset-generation/workflows/krea2_basic_rem-background.json'
TRANSPARENT_WF_CANONICAL = ROOT / 'asset-generation/workflows/krea2_basic_rem_back.json'
OPAQUE_WF = ROOT / 'asset-generation/workflows/krea2_basic.json'
OUTPUT_DIR = ROOT / 'asset-generation/outputs'
ELECTRON_GENERATED_DIR = ROOT / 'electron-poc/assets/tiles/generated'
BY_CATEGORY_DIR = ROOT / 'electron-poc/assets/tiles/by-category'

spec = importlib.util.spec_from_file_location('generate_assets_base', BASE_SCRIPT)
base = importlib.util.module_from_spec(spec); sys.modules[spec.name] = base; spec.loader.exec_module(base)  # type: ignore

TRANSPARENT_SLUGS = {
    'common-early-monsters', 'full-source-monsters', 'objects-inventory',
    'full-source-objects', 'player-pets-identity', 'traps-hazards',
}
OPAQUE_UI_IDS = {'message-panel', 'stats-panel', 'inventory-panel', 'hp-bar', 'power-bar', 'health-bar', 'message-log-panel'}
TRANSPARENT_TERRAIN_IDS = {
    'zap-beam', 'flash-effect', 'poison-cloud', 'shield-effect',
    'beam-north', 'beam-south', 'beam-east', 'beam-west',
    'boom-north', 'boom-south', 'boom-east', 'boom-west',
    'shield-north', 'shield-south', 'shield-east', 'shield-west',
    'magic-portal', 'vibrating-square', 'valid-position-marker', 'cloud', 'air',
}

STYLE_PREFIX = 'A concept pixel art image in the style of a fantasy game asset of '
STYLE_SUFFIX_TRANSPARENT = (
    ' on a solid green background. Isolated transparent cutout sprite for a cohesive fantasy roguelike tileset, '
    'bold centered silhouette with a clean removable green matte, readable at 32px and 16px, high contrast on a dark dungeon floor, '
    'compact subject occupying about 24 to 28 pixels, strong mid-tone local color, bright highlights, colored rim light, and light edge accents, '
    'draw the concrete creature or object only; do not draw literal glyph marks, alphabet letters, punctuation symbols, initial badges, or placeholder class marks, '
    'no text, no UI badge, no square card, no baked checkerboard, no fake transparency, '
    'no flat SVG/vector placeholder look.'
)
STYLE_SUFFIX_OPAQUE = (
    '. Opaque 32x32 terrain/base dungeon tile for a cohesive fantasy roguelike tileset, '
    'readable at 32px and 16px, painted pixel-art texture, strong mid-tone local color, bright highlights, '
    'colored rim light, and clear contrast, draw the concrete subject only; do not draw literal glyph marks, alphabet letters, punctuation symbols, or initial badges, '
    'no text, no UI badge, no flat SVG/vector placeholder look.'
)

PALETTE_OVERRIDES = {
    'acid-blob': 'translucent yellow-green slime with lime highlights and pale chartreuse edge glow',
    'bat': 'warm brown bat wings with tan wing membranes, amber face highlights, and pale cream edge pixels',
    'brown-mold': 'brown and ochre mold cluster with tan caps, cream speckles, and warm golden highlights',
    'bugbear': 'russet-brown bugbear fur with tan muzzle, brass armor accents, and amber rim highlights',
    'cave-spider': 'slate-gray spider with silver-blue leg highlights, violet rim light, and small amber eyes',
    'centipede': 'red-brown centipede with copper segments, amber legs, and cream mandible highlights',
    'coyote': 'sandy tan and gray coyote with cream chest, amber eyes, and pale gold edge highlights',
    'dog': 'warm brown and cream dog with tan highlights, amber eyes, dark brown outline, and pale gold edge accents',
    'large-dog': 'deep chestnut-brown and cream large dog with dark umber ears, amber eyes, sturdy tan paws, and bright cream edge accents',
    'dwarf': 'copper-bearded dwarf with blue-gray tunic, steel helmet, and warm gold highlights',
    'fire-ant': 'red-orange fire ant with amber shell highlights, yellow mandibles, and hot gold rim light',
    'floating-eye': 'pale blue floating eye with violet iris, turquoise glow, and white specular highlights',
    'air-elemental': 'living translucent air vortex creature with spiral humanoid torso, misty arm shapes, pale cyan and pearl-white wind bands, silver-blue rim highlights, clear creature silhouette not a rune or letter',
    'fire-elemental': 'swirling fire humanoid elemental being with flame head, raised flame arms, orange-red body, golden yellow core highlights, ember sparks, clear creature silhouette not a gem or token',
    'earth-elemental': 'stocky living stone and earth creature with boulder head, rocky arms, brown granite body, moss green cracks, tan edge highlights, clear golem-like silhouette not a flat pebble token',
    'water-elemental': 'living water spirit creature with wave-shaped humanoid torso, flowing arms, bright blue and turquoise body, white foam highlights, cyan rim light, clear creature silhouette not a droplet icon',
    'fog-cloud': 'soft pearl-gray fog cloud with pale blue shadows, white mist highlights, and lavender rim light',
    'fox': 'rust-orange fox with cream chest and tail tip, amber eyes, and pale gold edge highlights',
    'garter-snake': 'olive-green garter snake with bright yellow racing stripes, cream belly, and lime edge highlights',
    'gas-spore': 'pale mint-green gas spore orb with yellow-green pores, aqua glow, and cream highlights',
    'gecko': 'bright teal-green gecko with lime toes, cream belly, and turquoise rim highlights',
    'giant-ant': 'burnt-orange six-legged ant insect with copper segmented carapace, amber legs, pale gold mandibles, and bright cream edge highlights',
    'giant-rat': 'warm gray giant rat with tan belly, pink ears and tail, and silver-blue edge highlights',
    'gnome': 'rosy-cheeked gnome with red cap, blue tunic, tan boots, and warm cream highlights',
    'goblin': 'olive-green goblin with rusty-orange vest, yellow eyes, and tan ear and nose highlights',
    'gray-ooze': 'silvery gray ooze with pearl highlights, cool blue shadows, and pale lavender edge glow',
    'green-mold': 'emerald green mold with lime highlights, yellow-green spores, and pale mint edge glow',
    'grid-bug': 'electric blue grid bug with cyan body plates, yellow spark nodes, and white-blue glow',
    'hill-orc': 'moss-green hill orc with tan leather armor, rust-red cloth, and warm brass highlights',
    'hobbit': 'tan-skinned hobbit with curly chestnut hair, forest-green cloak, cream shirt, and copper highlights',
    'hobgoblin': 'brick-red hobgoblin with olive shadows, brass helmet, tan leather straps, and amber rim highlights',
    'homunculus': 'violet-blue homunculus with lavender wings, pink ears, and pale cyan magical highlights',
    'iguana': 'leaf-green iguana with yellow crest, cream belly, and turquoise edge highlights',
    'imp': 'crimson imp with orange horns, violet wing shadows, yellow eyes, and hot pink rim light',
    'jackal': 'golden-brown jackal with cream chest, dark umber ears, amber eyes, and pale tan highlights',
    'killer-bee': 'golden-yellow killer bee with warm brown stripes, translucent pale blue wings, and white wing highlights',
    'kitten': 'cream and orange kitten with pink ears, amber eyes, and soft white whisker highlights',
    'kobold': 'rust-brown kobold with ochre scales, tan belly, greenish bronze dagger, and amber edge highlights',
    'kobold-mummy': 'ivory linen-wrapped kobold mummy with tan bandage shadows, ochre scales peeking through, turquoise eye glow, and pale gold edge highlights',
    'kobold-shaman': 'rust-brown kobold shaman with ochre scales, teal ritual robe, violet spell glow, bone charms, and amber edge highlights',
    'large-kobold': 'large rust-brown kobold with ochre scales, tan belly, bronze shoulder plates, greenish spear, and warm amber highlights',
    'leprechaun': 'bright emerald leprechaun with green coat, gold buckles, copper-orange beard, cream face highlights, and yellow-gold edge accents',
    'lichen': 'flat pale mint and sage-green crust lichen rosette with lime scalloped lobes, cream spores, yellow-green speckles, and soft mint edge glow',
    'little-dog': 'small tan and cream dog with warm brown ears, pink tongue, amber eyes, and pale gold edge highlights',
    'manes': 'pale gray demonic manes with lavender shadows, pink wounds, cream claws, and faint cyan spectral rim light',
    'newt': 'orange-red newt with cream belly, yellow spots, wet white highlights, and coral edge accents',
    'nymph': 'forest nymph with peach skin, aqua-green hair, leaf-green dress, pink flower accents, and pale teal magical highlights',
    'orc-shaman': 'moss-green orc shaman with tan leather robe, purple ritual mask, bone staff, red-orange beads, and warm brass highlights',
    'paper-golem': 'folded parchment paper golem with cream paper planes, warm tan creases, ink-blue rune accents, and pale gold highlights',
    'pony': 'chestnut brown pony with cream mane and muzzle, tan hooves, amber eyes, and pale gold edge highlights',
    'quasit': 'violet quasit demon with crimson wing membranes, orange horns, yellow eyes, and hot pink rim light',
    'rabid-rat': 'scruffy light warm-gray rabid rat with big pink tail and ears, bright red irritated eyes, oversized cream teeth, pale silver-blue outline, and yellow slime highlights for 16px readability',
    'red-mold': 'fuzzy ruby-red mold mound with coral fuzz, orange spore caps, cream speckles, warm yellow highlights, and soft red-orange edge glow',
    'rock-mole': 'earth-brown mole clearly emerging from a gray rock burrow, large tan snout, huge slate-gray digging claws, copper nose, cream whisker highlights, and pale cream outline',
    'rock-piercer': 'stalactite-like rock piercer with slate-gray stone body, tan underside, quartz-white facets, and cool blue rim highlights',
    'rothe': 'shaggy rust-brown rothe beast with cream horns, tan muzzle, dark auburn mane, and warm gold highlights',
    'sewer-rat': 'mucky tan-brown sewer rat with lighter gray belly, long bright pink tail, yellow teeth, amber eyes, pale mint slime streaks, and strong silver-green edge highlights for 16px readability',
    'shrieker': 'tall violet mushroom shrieker with lavender cap, cream gills, magenta mouth opening, and pale cyan edge glow',
    'soldier-ant': 'armored crimson soldier ant with copper segmented shell, golden mandibles, amber legs, and cream edge highlights',
    'straw-golem': 'woven golden straw golem with honey-yellow stalks, tan rope bindings, warm cream highlights, and amber edge glow',
    'violet-fungus': 'plump violet fungus with lavender cap, lilac stalk, cream gills, magenta spores, and pale cyan rim glow',
    'werejackal': 'golden-brown werejackal with cream chest, russet mane, amber eyes, ivory claws, and pale moon-blue edge highlights',
    'wererat': 'mangy taupe-gray wererat with pink tail and ears, yellow teeth, red-orange eyes, and silver-blue rim light',
    'yellow-light': 'glowing yellow light orb with warm gold core, lemon-yellow rays, white highlights, and soft amber halo',
    'yellow-mold': 'mustard-yellow mold mound with lemon spores, ochre shadows, cream speckles, and pale gold edge glow',
    'zombie': 'rotting green-gray zombie with tattered brown clothes, bone-white hands, dull red eyes, and sickly lime highlights',
    'archeologist': 'tan canvas hat and khaki coat with brown leather satchel, steel pickaxe, cream highlights, and amber rim light',
    'barbarian': 'bronze skin and chestnut fur cloak with steel axe, red leather straps, cream edge highlights, and warm gold rim light',
    'healer': 'white and pale green healer robes with teal sash, brown medicine satchel, gold staff tip, and mint rim light',
    'knight': 'blue-gray steel armor with royal blue tabard, silver shield, red plume, cream highlights, and pale cyan rim light',
    'monk': 'saffron and warm ivory cloth robe with brown prayer beads, tan sandals, peach skin, and gold edge highlights',
    'ranger': 'forest green cloak and brown leather armor with golden bow, silver arrow tips, tan boots, and lime rim highlights',
    'rogue': 'dark burgundy hood and black leather armor with bright silver dagger, violet face shadow, amber eyes, and copper highlights',
    'samurai': 'deep purple lacquer armor with crimson cords, gold trim, steel katana, cream helmet crest, and white highlights',
    'tourist': 'straw yellow hat, bright sky-blue shirt, red backpack, tan shorts, black camera, and cream highlights',
    'valkyrie': 'bright silver helm and armor with ivory cloak, gold round shield, steel spear, blue shadows, and warm gold highlights',
    'wizard': 'deep emerald robe with purple pointed hat, brown wand, peach face, cyan spell glow, and lavender rim light',
    'lord-carnarvon': 'cream expedition suit and tan pith helmet with brown leather satchel, brass cane, khaki shadows, and warm gold highlights',
    'pelias': 'gray beard and russet fur mantle with bronze axe, dark leather armor, tan skin, and amber edge highlights',
    'shaman-karnov': 'ochre hide robe and bone headdress with turquoise charms, brown staff, copper skin, and pale gold rim light',
    'earendil': 'silver hair and sapphire cloak with pearl armor, gold star staff, peach skin, and bright cyan rim light',
    'elwing': 'pearl-white feather cloak with teal gown, silver hair, peach skin, gold accents, and pale cyan highlights',
    'hippocrates': 'white physician robe and teal sash with tan scroll satchel, gold staff, peach face, and mint edge highlights',
    'king-arthur': 'polished silver armor with crimson cloak, gold crown, blue shield, shining steel sword, and white-blue highlights',
    'grand-master': 'warm ivory and saffron robes with brown beads, peach skin, gray eyebrows, tan sandals, and gold rim light',
    'arch-priest': 'cream and deep violet holy robes with gold mitre, silver staff, peach face, and pale yellow highlights',
    'orion': 'midnight blue star cloak and brown leather armor with golden bow, silver arrows, tan boots, and cyan star highlights',
    'master-of-thieves': 'charcoal hood and dark leather armor with silver daggers, burgundy sash, gold coin pouch, and violet rim light',
    'lord-sato': 'indigo lacquer armor with red cords, gold crest, steel katana, cream face highlights, and white blade glints',
    'twoflower': 'straw hat and bright red shirt with blue backpack, tan shorts, black camera, brown luggage, and cream highlights',
    'norn': 'pale blue-gray robe with silver hair, gold thread, ivory spindle staff, lavender shadows, and cyan rim light',
    'neferet-the-green': 'emerald robe and green mantle with gold circlet, peach face, lime spell glow, and pale mint highlights',
    'minion-of-huhetotl': 'jaguar gold and black spotted mask with turquoise feathers, obsidian claws, red ritual cloth, and amber rim light',
    'thoth-amon': 'black-purple sorcerer robe with gold collar, bronze skin, green serpent staff, crimson gem, and violet rim light',
    'chromatic-dragon': 'rainbow red blue green and gold scales with cream claws, white horn tips, violet wing shadows, and cyan rim highlights',
    'goblin-king': 'olive green goblin skin with gold crown, burgundy fur cloak, jagged steel sword, and brass highlights',
    'cyclops': 'warm tan giant skin with single amber eye, brown hide tunic, gray stone club, cream toenails, and gold rim light',
    'ixoth': 'crimson red dragon scales with orange wing membranes, cream horns and claws, yellow eyes, and hot gold highlights',
    'master-kaen': 'crimson monk robe with saffron sash, peach skin, brown beads, orange flaming fists, and gold rim light',
    'nalzok': 'deep red demon hide with black wings, bone skull staff, orange horns, yellow eyes, and ember-gold edge light',
    'scorpius': 'dark bronze scorpion chitin with amber claws, black tail stinger, yellow eyes, cream leg tips, and orange rim highlights',
    'master-assassin': 'black hood and charcoal leather with silver poisoned dagger, deep purple cloak, green vial glow, and violet edge light',
    'ashikaga-takauji': 'black and crimson samurai armor with gold horned helmet, steel katana, ivory face, and white blade highlights',
    'lord-surtur': 'charcoal giant armor with blazing orange hair, red-hot skin cracks, huge steel sword, and yellow flame highlights',
    'dark-one': 'black and deep violet robes with pale face, silver horn crown, purple-black staff, crimson eyes, and blue rim light',
    'student': 'plain tan cloth gi with white belt, peach skin, brown hair, warm sandals, and pale gold highlights',
    'chieftain': 'warm brown hide armor with red feather crest, bone necklace, gray stone axe, copper skin, and amber highlights',
    'neanderthal': 'tan skin and shaggy brown fur tunic with gray stone club, dark hair, cream teeth, and warm gold highlights',
    'high-elf': 'silver hair and blue-green cloak with peach skin, golden bow, pale leather boots, and moon-blue rim light',
    'attendant': 'pale cream robe and teal apron with brown medicine pouch, peach face, tan sandals, and mint edge highlights',
    'page': 'bright blue tunic with small silver shield, wooden practice sword, tan boots, peach face, and gold edge accents',
    'abbot': 'ivory monk robe with saffron sash, brown prayer beads, peach skin, gray beard, and warm gold highlights',
    'acolyte': 'cream novice robe with violet sash, golden candle flame, peach face, tan sandals, and pale yellow rim light',
    'hunter': 'forest green cloak and brown leather with golden bow, silver arrows, tan boots, and lime edge highlights',
    'thug': 'muddy brown leather vest with gray club, tan skin, dark hood, brass buckle, and amber rim light',
    'ninja': 'charcoal-black cloth armor with indigo shadows, silver short blade, red sash, visible eyes, and blue rim highlights',
    'roshi': 'warm gray beard and ivory robe with brown staff, saffron beads, tan sandals, and gold highlights',
    'guide': 'sage green cloak with tan map satchel, brown walking staff, leather boots, peach face, and lime highlights',
    'warrior': 'blue-gray chain armor with red cloak, gold round shield, steel spear, tan skin, and bright silver highlights',
    'apprentice': 'purple oversized hat and cobalt robe with brown book satchel, small gold wand, peach face, and cyan spell glow',
    'minotaur': 'bull-brown fur with cream horns, tan muzzle, bronze nose ring, red cloth belt, steel axe edge, and warm gold highlights',
    'jabberwock': 'emerald and teal dragon-wyvern body with purple wing membranes, cream claws, yellow eyes, and cyan rim highlights',
    'vorpal-jabberwock': 'deep violet and teal jabberwock dragon with silver-blue vorpal glow, magenta wing shadows, white claw highlights, and cyan edge light',
    'keystone-kop': 'navy blue police uniform with brass badge, tan face, black moustache, pale blue shirt cuffs, silver baton, and cream highlights',
    'kop-sergeant': 'navy blue sergeant uniform with brass chevrons, tan face, black moustache, red nose, silver baton, and warm cream highlights',
    'kop-lieutenant': 'navy blue officer uniform with brass yellow badge, tan skin highlights, black moustache, peaked cap, and silver baton edge pixels',
    'kop-kaptain': 'dark navy captain uniform with gold trim, brass badge, tan face, black moustache, red sash, silver baton, and cream edge highlights',
    'demilich': 'bone-white skull with floating ivory bone fragments, violet jewel brow, icy cyan ghost glow, and silver-blue rim highlights',
    'master-lich': 'bone-white skull and hands with ornate purple-black robe, gold crown trim, icy cyan magic staff glow, and silver highlights',
    'arch-lich': 'bone-white skull and claws with deep royal violet robe, tall gold crown, turquoise necromancy aura, and white-blue rim light',
    'gnome-mummy': 'short ivory-bandaged gnome mummy with red cap scraps, tan linen shadows, amber glowing eyes, and pale gold edge highlights',
    'orc-mummy': 'stocky ivory-bandaged orc mummy with green-gray skin peeking through, tan wraps, yellow eyes, and dusty gold highlights',
    'dwarf-mummy': 'compact ivory-bandaged dwarf mummy with copper beard showing, tan linen wraps, blue ghost eyes, and cream edge highlights',
    'elf-mummy': 'slender ivory-bandaged elf mummy with pointed ears, pale green cloth scraps, cyan eyes, tan linen shadows, and moon-blue highlights',
    'human-mummy': 'upright ivory-bandaged human mummy with tan linen strips, hollow amber eyes, warm gray shadows, and pale gold edge accents',
    'ettin-mummy': 'large two-headed ivory-bandaged ettin mummy with bulky shoulders, tan linen strips, twin amber eyes, and cream edge highlights',
    'giant-mummy': 'towering bulky ivory-bandaged giant mummy with broad wrapped arms, tan dust shadows, golden eyes, and pale cream highlights',
    'red-naga-hatchling': 'small red serpent naga hatchling with crimson scales, orange hood, cream belly, yellow eyes, and hot gold highlights',
    'black-naga-hatchling': 'small charcoal-black serpent naga hatchling with violet rim light, silver scale edges, red-orange eyes, and blue-gray belly highlights',
    'golden-naga-hatchling': 'small golden serpent naga hatchling with amber scales, cream belly, orange hood, yellow eyes, and white-gold highlights',
    'guardian-naga-hatchling': 'small guardian serpent naga hatchling with bronze scales, tan belly, red-orange hood, jade eye glow, and gold edge highlights',
    'red-naga': 'large red serpent naga with crimson scales, orange hood, cream belly, yellow eyes, and hot gold highlights',
    'black-naga': 'large charcoal-black serpent naga with violet rim light, silver scale edges, red-orange eyes, and blue-gray belly highlights',
    'golden-naga': 'large golden serpent naga with amber scales, cream belly, orange hood, yellow eyes, and white-gold highlights',
    'guardian-naga': 'large guardian serpent naga with bronze scales, tan belly, red-orange hood, jade eye glow, and gold edge highlights',
    'ogre': 'moss-green ogre skin with tan belly, cream tusks, brown loincloth, gray club, and warm amber edge highlights',
    'quantum-mechanic': 'blue lab coat, tan face, wild white hair, brass goggles, silver wrench, violet atom sparks, and cyan rim highlights',
    'genetic-engineer': 'green lab coat, tan face, teal vial glow, blue gloves, white boots, lime gene sparks, and cream highlights',
    'rust-monster': 'rust-orange carapace with copper segments, tan antennae, cream claws, yellow eyes, and pale gold edge highlights',
    'disenchanter': 'dusky purple-gray hide with bronze horn plates, teal anti-magic glow, cream claws, and violet rim highlights',
    'ice-troll': 'icy blue-gray troll hide with white frost highlights, pale cyan claws, blue-violet shadows, and silver rim light',
    'rock-troll': 'granite-gray rocky troll hide with tan stone cracks, quartz-white knuckles, moss-green flecks, and cool blue rim light',
    'water-troll': 'deep teal-blue wet troll hide with turquoise highlights, white foam accents, sea-green claws, and cyan rim light',
    'olog-hai': 'charcoal-gray armored troll hide with rusty iron plates, red-orange eyes, cream tusks, and silver edge highlights',
    'umber-hulk': 'umber-brown insectoid hulk carapace with tan mandibles, amber compound eyes, cream claws, and gold edge highlights',
    'vampire': 'pale ivory skin with black cloak, crimson cape lining, dark plum shadows, red eyes, and silver-blue edge highlights',
    'vampire-mage': 'pale ivory skin with deep violet robe, crimson cape trim, cyan spell glow, red eyes, and silver highlights',
    'vlad-the-impaler': 'pale ivory vampire lord with black armor, crimson cape lining, silver spear, ruby accents, and cold blue edge highlights',
    'barrow-wight': 'desaturated bone-gray undead with ancient bronze armor, tattered teal cloak, icy blue eyes, and pale gold edge highlights',
    'wraith': 'smoky blue-gray ghost robes with pale cyan face glow, lavender shadows, white spectral hands, and silver rim light',
    'nazgul': 'charcoal-black hooded wraith cloak with violet rim light, red-orange eye slits, silver sword glint, and blue-gray edge highlights',
    'xorn': 'rust-red and slate-stone three-legged xorn body with brass claws, cream teeth, amber eyes, and orange edge highlights',
    'monkey': 'warm brown monkey fur with tan face and belly, pink ears, amber eyes, and cream hand highlights',
    'ape': 'dark umber ape fur with tan chest, gray muzzle, amber eyes, and pale gold edge highlights',
    'owlbear': 'brown bear body with cream owl face, golden beak, tan feather chest, amber eyes, and pale gold edge highlights',
    'yeti': 'snow-white yeti fur with pale blue shadows, icy cyan claws, lavender face shadows, and silver-blue rim light',
    'carnivorous-ape': 'reddish-brown ape fur with cream fangs, tan chest, red-orange eyes, dark claws, and amber rim highlights',
    'sasquatch': 'chestnut-brown shaggy sasquatch fur with tan face, cream hands and feet, amber eyes, and pale gold edge highlights',
    'kobold-zombie': 'rotting ochre-brown kobold zombie skin with exposed bone-white claws, tattered rust cloth, sickly lime highlights, and dull red eyes',
    'gnome-zombie': 'short green-gray gnome zombie skin with torn red cap, blue ragged tunic, bone-white hands, and sickly lime edge highlights',
    'ghoul': 'gaunt purple-gray ghoul flesh with bone-white claws, dull yellow eyes, ragged brown loincloth, and sickly lime highlights',
    'skeleton': 'bone-white skeleton bones with warm gray joints, hollow amber eyes, bronze sword hilt accents, and pale gold edge highlights',
    'human': 'peach-skinned human adventurer with chestnut hair, cobalt-blue tunic, red scarf, tan boots, silver buckle, and cream highlights',
    'lich': 'bone-white skull and hands with deep violet robe, icy cyan magical glow, and silver-blue rim highlights',
    'lich': 'bone-white skull and hands with deep violet robe, icy cyan magical glow, and silver-blue rim highlights',
    'stone-golem': 'warm gray granite and slate stone with quartz-white chipped edges, tan dust, and cool blue rim highlights',
    'glass-golem': 'transparent pale cyan and ice-blue glass with white specular glints, lavender refraction shadows, and silver edge highlights',
    'clay-golem': 'reddish brown clay with terracotta shadows, tan wet highlights, and warm cream cracked edges',
    'iron-golem': 'dark iron and blue-gray steel with orange furnace seams, silver highlights, and pale cyan edge shine',
    'gold-golem': 'bright gold metal with amber shadows, white shine pixels, and ruby-red accent glints',
    'leather-golem': 'brown leather patches with tan stitching, brass buckles, amber highlights, and cream edge pixels',
    'wood-golem': 'brown bark and honey wood with green leaf accents, tan rings, and pale gold highlights',
    'flesh-golem': 'mottled peach and gray-green flesh with dark stitch lines, red scars, and pale cream highlights',
    'rope-golem': 'tan rope fibers with warm brown knots, cream strand highlights, and amber edge accents',
    'elf': 'peach skin, silver-blond hair, emerald cloak, brown leather boots, golden bow, and pale cyan rim light',
    'woodland-elf': 'leaf green hood and cloak, brown leather armor, peach skin, chestnut hair, and pale lime highlights',
    'green-elf': 'emerald green cloak and tunic with peach skin, golden bow, leaf-yellow trim, and bright lime edge highlights',
    'grey-elf': 'silver-gray cloak with pale lavender shadows, ivory hair, peach skin, moon-blue staff glow, and white highlights',
    'doppelganger': 'iridescent teal and violet shifting skin, peach face mask highlight, pale cyan magical edges, and white morph glow accents',
    'shopkeeper': 'warm tan face, burgundy vest, cream shirt, brown apron, brass coin pouch, and gold counter-trade highlights',
    'guard': 'blue-gray steel helmet and armor, royal-blue tabard, tan face, silver spear, red shield trim, brass belt, and bright white-blue edge highlights',
    'prisoner': 'tan skin and brown torn striped rags with iron-gray shackles, cream highlights, and amber edge accents',
    'oracle': 'deep violet robe with silver hair, aqua crystal glow, pale skin highlights, gold staff accents, and cyan rim light',
    'soldier': 'polished steel armor with blue-gray shadows, red cloth tabard, tan face, silver sword, and cream highlights',
    'sergeant': 'bronze steel armor with crimson command sash, tan face, gold chevrons, silver sword, and warm cream highlights',
    'nurse': 'ivory white apron and teal robe with peach face, red medical pouch, pale mint rim light, and warm cream highlights',
    'lieutenant': 'bright silver breastplate with royal blue cloak, tan face, gold plume, blue-gray shadows, and white edge shine',
    'captain': 'gold-trim silver armor with crimson cape, tan face, red plume, brass shield boss, and bright cream highlights',
    'watchman': 'blue-gray watch tabard with gray kettle helmet, warm lantern gold, silver spear, tan face, and cream edge highlights',
    'watch-captain': 'emerald guard tabard with gold trim, polished silver helm and spear, tan face, brass shield, and mint rim light',
    'medusa': 'emerald snake hair and scaled tail with peach-green skin, bronze mirror shield, gold jewelry, and pale cyan highlights',
    'wizard-of-yendor': 'deep purple-black wizard robe with gold stars, pale face, white beard, cyan staff glow, and magenta magic accents',
    'croesus': 'royal purple robe with bright gold crown and scepter, tan face, ruby jewels, coin-gold accents, and cream highlights',
    'charon': 'charcoal-black hooded robe with bone-white face, dark oar pole, blue-gray shadows, and pale cyan ghost rim light',
    'ghost': 'translucent pearl-white ectoplasm with pale blue shadows, hollow lavender eyes, white highlights, and soft cyan glow',
    'shade': 'smoky charcoal-gray shadow with violet rim light, pale blue eye glow, silver edge highlights, and blue-gray wisps',
    'water-demon': 'deep teal-blue wet demon body with turquoise fins, white foam highlights, coral eyes, and cyan rim light',
    'horned-devil': 'crimson red devil skin with orange horns, dark bat wings, yellow eyes, black claws, and hot gold rim light',
    'erinys': 'bronze armor and crimson cloth with dark feather wings, tan face, fiery orange whip, gold highlights, and violet shadows',
    'barbed-devil': 'rust-red fiend hide with dark hooked barbs, orange horn tips, yellow eyes, cream claws, and ember rim light',
    'marilith': 'copper-red serpent scales on the tail with tan humanoid torso, six silver swords, gold jewelry, emerald accents, and warm cream highlights',
    'vrock': 'vulture-demon colors with dusty charcoal feathers, gray-black wing tips, bone-white hooked beak and talons, red-orange eyes, and violet rim light',
    'hezrou': 'swampy green-brown toad demon hide with ochre warts, tan belly, cream claws, yellow eyes, and sickly lime edge highlights',
    'bone-devil': 'bone-white skeletal devil body with warm gray shadows, rust-red wing membranes, orange eyes, ivory tail barb, and pale gold edge highlights',
    'ice-devil': 'pale icy blue insectoid devil carapace with white frost spikes, cyan wing glints, dark blue shadows, and silver-blue rim light',
    'nalfeshnee': 'boar-headed demon colors with mauve-gray flesh, dark brown bristles, tan tusks, small crimson wings, gold jewelry, and violet-blue rim light',
    'pit-fiend': 'deep crimson archdevil hide with black bat wings, orange horn tips, yellow eyes, ember cracks, cream claws, and hot gold rim light',
    'sandestin': 'opalescent summoned spirit body with pearl-white robes, pale lavender shadows, cyan magical edges, gold spark motes, and translucent blue highlights',
    'balrog': 'charcoal-black fire demon body with blazing orange mane and whip, red-hot cracks, yellow eyes, black wings, and bright ember-gold edge light',
    'juiblex': 'glossy toxic slime demon with emerald and acid-green ooze, yellow bubbles, purple shadow pockets, cream eye glints, and lime glow edges',
    'yeenoghu': 'high-contrast sandy gold hyena demon lord with cream muzzle, bone-white fangs, bright red eyes, silver flail head, pale tan chest, and amber-gold rim highlights',
    'orcus': 'corpulent goat-headed demon lord with deep red-brown hide, black bat wings, ivory horns, skull wand, purple shadows, and ember edge light',
    'geryon': 'serpentine archdevil with rust-red armored torso, coiled green-black snake tail, ivory horns, brass armor, and orange infernal highlights',
    'dispater': 'bright readable iron-crowned archdevil with blue-gray steel armor, crimson cloak, pale ivory face, white-hot spear tip, orange forge glow, and strong silver-blue edge highlights',
    'baalzebub': 'lord of flies demon with glossy black-green chitin, translucent amber wings, red compound eyes, cream mandibles, and sickly lime rim light',
    'asmodeus': 'regal archdevil with crimson skin, black-and-gold armor, ivory horns, ruby staff, dark cape, and hot gold infernal highlights',
    'demogorgon': 'two-headed demon prince with green-purple reptile hide, twin baboon-like heads, tentacle arms, yellow eyes, and cyan-violet rim light',
    'death': 'skeletal rider avatar with bone-white skull and hands, black hooded robe, silver scythe, pale horse-skull motif, and cold blue rim light',
    'pestilence': 'sickly plague rider with yellow-green tattered robes, gray-green gaunt face, dark sores, bone staff, and toxic lime aura highlights',
    'famine': 'emaciated hunger rider with ash-gray skin, ragged tan robes, hollow amber eyes, bone-white hands, and dusty gold edge highlights',
    'mail-daemon': 'bright blue-gray winged courier daemon with oversized cream parchment satchel, visible white envelope bundle, brown leather strap, brass buckles, tan face, and cyan rim highlights',
    'djinni': 'turquoise and sapphire djinni spirit with smoky lower body, gold cuffs, tan face, black beard, white teeth, and cyan magical glow',
    'jellyfish': 'translucent pink and aqua jellyfish bell with lavender shadows, white sparkle highlights, and long pale cyan trailing tentacles',
    'piranha': 'silver-blue scaled piranha fish with red belly, sharp cream teeth, yellow eye, dark fins, and bright water-cyan edge highlights',
    'shark': 'blue-gray shark with slick skin, white belly, slate dorsal fin, black eye, cream teeth, and silver-blue water rim highlights',
    'giant-eel': 'single long S-curved olive-gold giant eel with one narrow head, continuous cream belly stripe, yellow eyes, wet white dorsal highlights, and bright teal edge glow',
    'electric-eel': 'long dark teal electric eel with slick skin, bright cyan lightning bands, yellow eye, white sparks, and blue glow highlights',
    'kraken': 'deep purple kraken with rubbery skin, teal suckered tentacles, yellow eyes, cream beak, sea-blue highlights, and cyan foam rim light',
    'baby-crocodile': 'small olive-green baby crocodile with oversized tan snout, clear squat body, four tiny legs, curved tail, bright yellow belly, cream teeth, amber eyes, and lime edge highlights',
    'lizard': 'bright green lizard with small scales, yellow belly, orange crest, tiny claws, black eyes, and turquoise edge highlights',
    'chameleon': 'rainbow chameleon with pebbled scales, emerald body, yellow-orange stripes, curled tail, bulging eyes, and cyan edge highlights',
    'crocodile': 'large olive crocodile with armored scales, tan belly, cream teeth, amber eyes, and swamp-green rim light',
    'salamander': 'fiery salamander humanoid with red-orange scales, yellow flame tail, black claws, molten gold belly, and ember rim light',
    'long-worm-tail': 'segmented purple-brown worm tail with magenta underside, tan ring ridges, cream slime highlights, and violet rim light',
    'acid': 'glass vial with neon yellow-green acid liquid, silver cork, pale mint fumes, white shine, and dark green bubble accents',
    'adornment': 'bright gold ring with sapphire-blue gem, ruby side beads, white sparkle glints, and warm amber band highlights',
    'agate': 'banded agate gemstone with cream, rust-orange, and chocolate-brown stripes, glossy white glints, and tan edge highlights',
    'aggravate-monster': 'dark glass potion with red-orange liquid, angry crimson vapor beast, yellow sparks, silver cork, and white bottle shine',
    'aklys': 'oak-brown throwing club with dark leather cord, bronze studs, tan wood highlights, and cream edge accents',
    'alchemy-smock': 'off-white alchemy smock with teal stains, tan apron shadows, brown belt tie, and cream cloth highlights',
    'amber': 'small honey-orange amber shard cluster with transparent gaps, golden facets, cream glints, warm brown inner flecks, and bright yellow edge highlights',
    'amethyst': 'violet amethyst crystal with lavender facets, purple shadows, white sparkle glints, and pale magenta rim highlights',
    'amnesia': 'round glass flask with pale blue amnesia liquid, silver cork, white cloud swirl, cyan shine, and lavender fading sparkles',
    'amulet-of-change': 'gold chain amulet with split ruby-and-sapphire shifting gem, orange morph sparks, cream highlights, and amber rim light',
    'amulet-of-esp': 'gold chain amulet with blue eye-shaped gem, cyan thought waves, white glints, and purple shadow accents',
    'amulet-of-flying': 'gold chain amulet with white wing ornaments, sky-blue gem, pale cyan feather sparks, and cream highlights',
    'aquamarine': 'clear aquamarine gem with cyan-blue facets, pale teal highlights, white glints, and cool blue rim light',
    'black-opal': 'black opal gem with charcoal body, rainbow red-blue-green fire flashes, white pin glints, and violet rim highlights',
    'amulet-of-guarding': 'gold amulet with shield-shaped blue steel pendant, brass chain loop, silver guard rim, and white protective spark highlights',
    'amulet-of-life-saving': 'gold amulet with bright red heart-shaped ruby pendant, white-gold life rays, cream chain highlights, and warm amber rim light',
    'amulet-of-magical-breathing': 'silver amulet with turquoise bubble pendant, tiny air bubbles, cyan water-glass highlights, and pale blue rim light',
    'amulet-of-reflection': 'polished silver mirror amulet with round reflective disk, blue-white shine slash, gold chain, and bright cyan glints',
    'amulet-of-restful-sleep': 'moon-and-star amulet with crescent silver pendant, deep blue gem, tiny pale yellow stars, and lavender sleep glow',
    'amulet-of-strangulation': 'dark iron amulet shaped like a tightening collar ring, red cord loop, violet shadow, and sharp silver choke clasp highlights',
    'amulet-of-unchanging': 'solid stone-gray amulet with square anchor-like pendant, bronze chain, pale blue stasis ring, and ivory edge highlights',
    'amulet-of-yendor': 'legendary golden Yendor amulet with large central sapphire, four ruby points, sunburst pendant silhouette, white holy glints, and amber aura',
    'amulet-versus-poison': 'gold amulet with purple antidote vial pendant, small serpent charm, lime liquid glints kept inside the gem, and cream chain highlights',
    'ashpd-sodalg': 'closed gray spellbook titled only by shape: slate cover, blue crystal clasp, cream page block, purple arcane glow, and no lettering',
    'athame': 'ritual athame dagger with bright silver triangular blade, black handle, gold pommel, blue rune glints, and white edge highlights',
    'bag-of-holding': 'bulging tan canvas magic sack with drawstring neck, dark brown straps, tiny blue pocket-dimension glow from opening, and cream cloth highlights',
    'bag-of-tricks': 'purple cloth trickster bag with cinched gold cord, tan patches, cream highlights, and two white rabbit ears clearly peeking from the open bag mouth',
    'banana': 'curved yellow banana with brown stem, pale cream underside, golden highlights, and readable crescent fruit silhouette',
    'banded-mail': 'silver banded mail armor shirt with horizontal steel bands, blue-gray chain gaps, brass shoulder rivets, and bright white metal highlights',
    'bardiche': 'long bardiche polearm with brown wooden shaft, huge crescent silver axe blade along the side, red leather wrap, and white blade glints',
    'battle-axe': 'two-handed battle axe with broad double silver blades, dark wooden haft, brass bindings, red grip wrap, and white edge shine',
    'beartrap': 'open steel bear trap with two toothed jaws, round spring hinge, blue-gray metal shadows, rust-brown base, and white tooth highlights',
    'bec-de-corbin': 'long bec-de-corbin polearm with straight brown shaft, hammer head, curved beak spike, small top spear, steel-blue metal and white glints',
    'bell': 'small brass hand bell with flared skirt, dark clapper visible underneath, brown handle, golden shine, and cream edge highlights',
    'bell-of-opening': 'ornate golden Bell of Opening with flared bell body, keyhole-shaped blue gem, visible clapper, magic unlocking sparkles, and white-gold highlights',
    'bill-guisarme': 'long bill-guisarme polearm with wooden shaft, hooked pruning blade, forward spear tip, silver crescent hook, red binding, and white blade highlights',
    'black-dragon-scale-mail': 'front-facing black dragon scale mail cuirass with clear neck hole, two shoulder plates, waist opening, overlapping charcoal scales, purple-blue edge light, and white scale glints',
    'black-dragon-scales': 'loose pile of black dragon scales with charcoal overlapping scale plates, purple-blue sheen, silver edges, and crimson tiny glints',
    'blank-paper': 'small curled loose scrap of blank parchment, diagonal torn strip silhouette with ragged uneven edges, visible transparent gaps around it, tan fiber speckles, and cream center',
    'blindfold': 'black cloth blindfold strip with tied knot and trailing ends, soft gray fold highlights, small tan stitch accents, and clear ribbon silhouette',
    'amulet-class-icon': 'gold amulet with emerald center gem, ruby side beads, cream sparkle highlights, and warm amber edge accents',
    'apple': 'bright red apple with yellow highlights, green leaf, brown stem, and cream shine pixels',
    'armor-class-icon': 'steel breastplate armor with blue-gray shadows, silver highlights, brass rivets, and pale cyan rim light',
    'arrow': 'wooden brown arrow with silver steel tip, red fletching, tan shaft highlights, and cream edge pixels',
    'axe': 'steel battle axe with silver-blue blade, brown wooden handle, brass bindings, and white edge highlights',
    'boots': 'brown leather boots with tan cuffs, brass buckles, amber highlights, and cream sole edge pixels',
    'boulder': 'round gray boulder with slate shadows, quartz-white facets, tan dust accents, and cool blue rim highlights',
    'bow': 'curved yew-brown bow with golden string, tan grip wrapping, amber highlights, and cream edge accents',
    'candle': 'cream wax candle with golden flame, orange core glow, blue-gray base shadow, and warm yellow highlights',
    'carrot': 'bright orange carrot with yellow ridges, leafy green top, cream highlights, and warm amber edge pixels',
    'chain-mail': 'interlocking silver chain mail shirt with blue-gray shadows, steel highlights, brass collar clasp, and pale cyan edge shine',
    'cloak': 'deep royal-blue cloak with purple shadows, gold clasp, pale cyan folds, and cream edge highlights',
    'coin-pile': 'stacked gold coins with amber shadows, bright yellow highlights, copper edge pixels, and white sparkle accents',
    'corpse': 'fallen adventurer corpse with muted brown clothing, pale gray-green skin, dark red wounds, tan bones, and sickly lime edge highlights',
    'crossbow': 'dark walnut crossbow with silver steel bow arms, tan string, brass trigger, and cream edge highlights',
    'crossbow-bolt': 'short wooden crossbow bolt with silver steel tip, blue-gray fletching, tan shaft highlights, and cream edge pixels',
    'dagger': 'silver dagger with blue-gray blade shadows, brown leather grip, brass pommel, and white edge shine',
    'dart': 'small bronze dart with silver tip, red feather fletching, warm tan shaft, and cream highlight pixels',
    'egg': 'cream-white egg with warm tan speckles, pale yellow highlights, soft blue-gray shadows, and ivory edge glow',
    'expensive-camera': 'black and charcoal camera with silver lens ring, blue glass lens, brass button, and bright white highlights',
    'flail': 'spiked steel flail with blue-gray metal ball, brown wooden handle, brass chain links, and white edge highlights',
    'flint-stone': 'dark slate flint stone with gray facets, pale blue chips, tan dust accents, and quartz-white edge highlights',
    'food-class-icon': 'golden roasted drumstick and bread icon with warm brown crust, cream highlights, leafy green garnish, and amber edge accents',
    'food-ration': 'wrapped tan food ration bundle with brown straps, cream cloth folds, red wax seal, and warm gold highlights',
    'fruit': 'round purple-red fantasy fruit with magenta skin, yellow-orange highlights, green leaf, brown stem, and cream shine pixels',
    'gem-class-icon': 'faceted sapphire and ruby gems with teal-blue and crimson faces, white sparkle highlights, and pale cyan edge glints',
    'gloves': 'paired tan leather gloves with brown seams, brass studs, amber highlights, and cream fingertip edge pixels',
    'helmet': 'steel helmet with blue-gray shadows, silver highlights, brass nasal guard, red plume, and pale cyan rim light',
    'knife': 'small steel knife with silver blade, brown handle, brass rivets, blue-gray shadow, and white edge highlights',
    'lamp': 'brass oil lamp with golden body, orange flame glow, blue-gray smoke shadow, and cream shine highlights',
    'lantern': 'bronze lantern with golden flame, amber glass panes, dark brown handle, and warm cream highlights',
    'leash': 'coiled red-brown leather leash with brass clasp, tan edge highlights, amber buckle shine, and cream outline pixels',
    'rare-ring-variant': 'rare jeweled ring with bright gold band, sapphire-blue gem, ruby side sparks, and white sparkle highlights',
    'rare-spellbook-variant': 'ornate violet spellbook with gold corner guards, teal rune glow, cream page edges, and amber highlights',
    'rare-weapon-variant': 'enchanted silver sword with blue-gray blade, purple magic glow, gold hilt, and white edge shine',
    'ring-class-icon': 'gold ring icon with emerald gem, amber band shadows, pale yellow highlights, and white sparkle pixels',
    'ring-mail': 'silver ring mail shirt with blue-gray shadows, brass collar links, pale cyan edge shine, and white metal highlights',
    'scale-mail': 'overlapping steel scale mail with slate-blue shadows, silver scale highlights, brass trim, and pale cyan rim light',
    'scroll-class-icon': 'rolled parchment scroll with tan paper, red wax seal, brown wooden rods, and cream edge highlights',
    'scroll-of-enchant-armor': 'glowing parchment armor scroll with tan paper, blue arcane armor rune, gold sparkles, and cream highlights',
    'scroll-of-enchant-weapon': 'glowing parchment weapon scroll with tan paper, crimson sword rune, gold sparkles, and cream highlights',
    'scroll-of-identify': 'open parchment identify scroll with tan paper, blue eye rune, purple ink marks, and cream highlights',
    'scroll-of-light': 'radiant parchment light scroll with tan paper, golden sun rune, lemon-yellow glow, and cream highlights',
    'scroll-of-teleportation': 'swirling parchment teleportation scroll with tan paper, violet spiral rune, cyan magic glow, and cream highlights',
    'shield': 'round steel shield with blue-gray face, silver rim, brass boss, red leather strap, and white edge shine',
    'skeleton-key': 'old brass skeleton key with warm gold highlights, dark bronze shadows, cream edge pixels, and tiny ruby ribbon accent',
    'sling': 'brown leather sling with tan pouch, braided cord, brass bead accents, and cream edge highlights',
    'spear': 'wooden spear with brown shaft, silver steel leaf blade, red binding, tan grip highlights, and white blade edge shine',
    'spellbook-class-icon': 'closed blue spellbook with gold clasp, purple rune glow, cream page edges, and cyan highlights',
    'statue': 'small stone statue with warm gray body, slate shadows, ivory chipped highlights, moss-free pale blue rim light, and tan base dust',
    'stethoscope': 'healer stethoscope with silver metal chestpiece, blue-gray tubing, brass accents, and white shine highlights',
    'throwable-rock': 'small throwable rock with slate-gray facets, tan dust chips, quartz-white highlights, and cool blue edge accents',
    'tin': 'compact small sealed tin can in three-quarter view with blue-gray metal sides, silver lid ridges, warm cream highlights, and small brass pull tab',
    'tool-class-icon': 'fantasy tool bundle with brown wooden handle, silver wrench head, brass hammer cap, tan leather wrap, and cream edge highlights',
    'touchstone': 'smooth black basalt touchstone with charcoal-gray body, violet-blue rim light, silver scratch marks, and quartz-white highlights',
    'tripe-ration': 'folded pale pink tripe ration with warm tan butcher paper, red twine, cream fatty highlights, and amber edge accents',
    'wand-class-icon': 'slender magic wand icon with dark walnut shaft, gold ferrules, purple crystal tip, cyan sparkles, and cream edge highlights',
    'wand-of-create-monster': 'summoning wand with walnut shaft, emerald-green crystal tip, gold bands, lime creature-shaped sparks, and cream highlights',
    'wand-of-light': 'light wand with honey-brown shaft, bright golden crystal tip, amber bands, lemon-yellow glow, and white shine pixels',
    'wand-of-magic-missile': 'magic missile wand with dark brown shaft, sapphire-blue crystal tip, silver bands, violet-blue missile spark, and white highlights',
    'wand-of-slow-monster': 'slow monster wand with purple-brown shaft, amethyst crystal tip, bronze bands, teal spiral aura, and pale cyan highlights',
    'weapon-class-icon': 'crossed fantasy weapon icon with silver sword blade, steel axe head, brown handles, red leather wraps, brass pommels, and white edge shine',
    'whistle': 'small brass whistle with warm gold body, red cord loop, dark bronze mouth slot, cream shine, and amber edge pixels',
    'worthless-glass-gem': 'small irregular dull glass gemstone shard with pale cyan and lavender facets, gray cracks, faint white glints, transparent-looking angled edges, and cool blue highlights',
    'archeologist-role-avatar': 'archeologist adventurer with tan fedora, khaki coat, brown leather satchel, copper pick, cream face highlights, and amber rim accents',
    'barbarian-role-avatar': 'barbarian warrior with bronze skin, auburn hair, fur cloak, steel axe, crimson cloth, and warm gold highlights',
    'caveman-role-avatar': 'caveman adventurer with tan skin, dark brown hair, spotted ochre hide tunic, gray stone club, and cream highlights',
    'cavewoman-role-avatar': 'cavewoman adventurer with warm brown skin, black braided hair, amber hide tunic, gray stone spear, and cream edge highlights',
    'cursor-indicator': 'freestanding small bright cyan triangular arrow cursor silhouette with white center glint, cobalt-blue outline, and pale aqua glow',
    'dwarf-player-variant': 'dwarf player adventurer with copper beard, blue steel helmet, forest-green tunic, brown boots, silver axe, and warm gold highlights',
    'elf-player-variant': 'elf player adventurer with peach skin, silver-blond hair, emerald cloak, golden bow, tan boots, and pale cyan rim light',
    'gnome-player-variant': 'gnome player adventurer with rosy face, bright red cap, cobalt-blue coat, tan boots, brass belt buckle, and cream highlights',
    'healer-role-avatar': 'healer adventurer in ivory and soft teal robes with a small rose-red medical cross charm, silver stethoscope loop, peach face highlights, and pale mint rim light',
    'hero-avatar': 'heroic human adventurer with peach face, chestnut hair, cobalt-blue tunic, red cloak, silver sword glint, tan boots, and warm gold edge highlights',
    'human-player-variant': 'baseline human adventurer with peach skin, brown hair, purple-blue tunic, tan belt and boots, silver gear accents, and cream face highlights',
    'kitten-pet': 'small orange and cream kitten with pink ears, amber eyes, blue collar badge, white whisker highlights, and pale gold edge accents',
    'knight-role-avatar': 'knight adventurer in bright silver armor with blue-gray shadows, emerald tabard, brass shield boss, red helm plume, and white edge shine',
    'little-dog-pet': 'small gray and cream dog with warm brown collar badge, pink tongue, amber eyes, silver-blue edge highlights, and pale cream paws',
    'monk-role-avatar': 'unarmed monk adventurer with peach face, dark hair, warm ivory robe, saffron sash, brown prayer beads, tan sandals, and gold edge highlights',
    'orc-player-variant': 'orc player adventurer with moss-green skin, small ivory tusks, dark leather armor, rust-red cloth, brass buckles, and pale green edge highlights',
    'pony-pet': 'chestnut pony pet with cream mane, tan muzzle and hooves, blue collar badge, amber eyes, and pale gold edge highlights',
    'priest-role-avatar': 'priest adventurer with peach face, deep green robe, gold abstract holy symbol, cream hood lining, tan staff, and pale mint rim light',
    'priestess-role-avatar': 'priestess adventurer with peach face, violet and cream robes, gold abstract holy symbol badge, lavender hood, and pale cyan edge highlights',
    'ranger-role-avatar': 'ranger adventurer with peach face, forest-green cloak, clear brown bow arc, tan leather armor, silver arrow tip, and lime edge highlights',
    'rogue-role-avatar': 'rogue adventurer with dark burgundy hooded cloak, visible violet face shadow, yellow eyes, bright silver dagger, brown leather straps, and amber rim light',
    'samurai-role-avatar': 'samurai adventurer with purple lacquer armor, gold trim, steel curved katana, cream helmet crest, and white blade highlights',
    'tourist-role-avatar': 'tourist adventurer with peach face, straw-yellow sunhat, bright sky-blue shirt, red backpack, black camera with blue lens, tan shorts, and cream highlights',
    'valkyrie-role-avatar': 'valkyrie adventurer with bright silver winged helm, gold round shield, ivory cloak, steel spear, blue-gray shadows, and warm gold highlights',
    'wizard-role-avatar': 'wizard adventurer with deep emerald robe, purple pointed hat, peach face shadow, brown wand, deliberate violet and cyan magic sparkle, and pale cyan edge glow',
    'air': 'transparent pale blue and pearl-white air swirl wisps with soft cyan highlights, silver mist shadows, and faint lavender rim glow',
    'altar': 'low solemn stone altar plinth with warm gray blocks, ivory carved rune, soft golden alignment glow, tan dust, and cool blue stone shadows',
    'beam-east': 'transparent horizontal magic beam pointing east with bright cyan core, white arrow tip, violet tail flare, electric blue rim, and pale aqua sparks',
}

GENERIC_PALETTES = [
    'warm brown and cream with tan highlights and amber edge accents',
    'cool gray with silver-blue rim light, pale highlights, and blue-violet shadows',
    'emerald green with lime highlights, mint edge glow, and yellow-green accents',
    'purple and gold with lavender shadows, cream highlights, and bright amber accents',
    'bone-white with warm gray shadows, ivory highlights, and pale gold edge accents',
    'rust red and copper with orange highlights, brass accents, and warm cream edge pixels',
]

SUBJECT_OVERRIDES = {
    'abra-ka-dabra': 'a closed enchanted spellbook with purple cover, gold corner guards, cyan magical burst, cream pages, and floating sparkle effects but no writing or letters',
    'acid': 'a small glass potion vial of bubbling acid with cork stopper, sharp droplet splash, corrosive mist, and readable liquid silhouette',
    'adornment': 'a jeweled gold ring of adornment with bright gemstone, tiny sparkle cluster, rounded band, and compact treasure silhouette',
    'agate': 'a polished banded agate gemstone with oval cabochon shape, layered stripes, glossy facets, and small shine pixels',
    'aggravate-monster': 'a cursed potion bottle with red-orange vapor forming a tiny angry beast silhouette above the cork, jagged magic sparks, and clear bottle shape',
    'aklys': 'an aklys throwing club with short hooked wooden shaft, leather wrist cord, bronze studs, and heavy blunt head',
    'alchemy-smock': 'a folded alchemy smock robe with stained cloth sleeves, small potion pocket, belt tie, and protective apron silhouette',
    'amber': 'three small translucent amber gemstone shards clustered together with visible transparent gaps between facets, honey glow, glossy angled edges, and warm shine pixels',
    'amethyst': 'a cut amethyst gemstone with purple facets, lavender highlights, white sparkle glints, and compact crystal silhouette',
    'amnesia': 'a smoky potion of amnesia in a round glass flask with pale blue liquid, silver cork, cloud swirl, and fading sparkle trail',
    'amulet-of-change': 'a gold amulet with shifting split-color gem, tiny morphing sparkle aura, sturdy chain loop, and oval pendant silhouette',
    'amulet-of-esp': 'a gold amulet with blue psychic eye-shaped gem, cyan thought-wave sparkle, chain loop, and compact pendant silhouette',
    'amulet-of-flying': 'a gold amulet with small white wing ornaments, sky-blue gem, airy feather sparkle, chain loop, and readable pendant shape',
    'amulet-of-guarding': 'a protective amulet with shield-shaped pendant, visible chain loop, raised metal rim, and compact amulet silhouette, not a pouch or armor piece',
    'amulet-of-life-saving': 'a life-saving amulet with heart-shaped ruby pendant, small chain loop, radiant life sparks, and clear distinctive jewelry silhouette',
    'amulet-of-magical-breathing': 'a magical breathing amulet with bubble-shaped turquoise pendant, tiny air bubbles, visible chain loop, and watery glass silhouette, not a skull or round token',
    'amulet-of-reflection': 'a reflection amulet with polished mirror disk pendant, chain loop, diagonal shine slash, and clear reflective metal jewelry silhouette',
    'amulet-of-restful-sleep': 'a restful sleep amulet with crescent moon pendant, tiny star charm, chain loop, and sleepy night-sky jewelry silhouette, distinct from other amulets',
    'amulet-of-strangulation': 'a cursed strangulation amulet shaped like a tightening iron collar with red cord, small clasp, chain loop, and ominous choke-ring silhouette',
    'amulet-of-unchanging': 'an amulet of unchanging with heavy square stone anchor pendant, bronze chain loop, stasis ring detail, and immovable blocky jewelry silhouette',
    'amulet-of-yendor': 'the unique Amulet of Yendor as a radiant sunburst golden pendant with large central sapphire, four ruby points, sturdy chain loop, and artifact silhouette',
    'amulet-versus-poison': 'an anti-poison amulet with small serpent charm wrapped around a purple vial-shaped pendant, chain loop, and antidote jewelry silhouette',
    'aquamarine': 'a faceted aquamarine gemstone cut as a teardrop crystal with angled facets and sharp sparkle glints, isolated gem silhouette',
    'ashpd-sodalg': 'a closed gray magical spellbook with thick cream page block, blue crystal clasp, arcane glow, and absolutely no letters or title text',
    'athame': 'a ritual athame dagger with triangular blade, dark handle, gold pommel, and compact knife silhouette',
    'bag-of-holding': 'a bulging magical canvas sack with drawstring neck, shoulder strap, pocket-dimension glow inside the opening, and readable bag silhouette',
    'bag-of-tricks': 'a trickster cloth bag with cinched cord, patched sides, open mouth, two white rabbit ears peeking out, and sparkling surprise silhouette, clearly a bag not a bottle',
    'banana': 'a single curved banana fruit with crescent body, brown stem, peel ridges, and bright readable fruit silhouette',
    'banded-mail': 'a banded mail armor shirt with horizontal steel bands across a torso cuirass, shoulder plates, waist opening, and readable wearable armor silhouette',
    'bardiche': 'a bardiche polearm with long wooden shaft and huge crescent axe blade mounted along one side, readable long weapon silhouette',
    'battle-axe': 'a heavy two-handed battle axe with broad double blades, long haft, wrapped grip, and readable axe silhouette',
    'beartrap': 'an open toothed steel bear trap with two semicircle jaws, central hinge spring, and readable trap silhouette',
    'bec-de-corbin': 'a bec-de-corbin polearm with long shaft, hammer head, curved beak spike, top spear point, and unmistakable long pole weapon silhouette',
    'bell': 'a small hand bell with flared bell skirt, handle, visible clapper, and readable bell silhouette',
    'bell-of-opening': 'the Bell of Opening as an ornate hand bell with flared golden body, keyhole gem, visible clapper, handle, and unlocking sparkle silhouette',
    'bill-guisarme': 'a bill-guisarme polearm with very long shaft, hooked crescent blade, forward spear tip, and readable polearm silhouette, not a shield or helmet',
    'black-dragon-scale-mail': 'front-facing black dragon scale mail armor as a torso cuirass with neck hole, shoulder plates, waist opening, rows of overlapping scales, and readable wearable armor silhouette, not claws or bones',
    'black-dragon-scales': 'a small loose pile of overlapping black dragon scales, each scale visible as curved plate chips with shiny edges, readable scale-pile silhouette',
    'black-opal': 'a polished black opal gemstone with oval cabochon shape, rainbow fire flashes, glossy highlight, and compact gem silhouette',
    'blank-paper': 'one small curled blank parchment scrap shown diagonally with ragged torn uneven edges and transparent space around it, no border, no frame, no square card fill, no text',
    'blindfold': 'a tied cloth blindfold strip with central eye-cover band, knot, two trailing ends, and readable ribbon silhouette',
    'dog': 'a medium domestic dog with short warm-brown fur, clearly canine muzzle, floppy ears, sturdy four-legged body, raised curled tail, visible paws, and friendly alert posture',
    'large-dog': 'a large broad-chested guard dog with thick chestnut fur, clearly canine muzzle, floppy ears, muscular four-legged body, thick raised tail, large visible paws, and sturdy alert posture',
    'archeologist': 'an archeologist adventurer with tan expedition hat, leather jacket, satchel, small pickaxe, boots, and scholarly explorer humanoid stance',
    'barbarian': 'a barbarian warrior with muscular humanoid body, fur cloak, horned helm, leather boots, huge axe, and fierce battle stance',
    'healer': 'a healer adventurer with white robe, green sash, medical satchel, staff, visible kind face, and calm humanoid support stance',
    'knight': 'a knight adventurer humanoid in steel armor with blue tabard, crested helmet, kite shield, lance, boots, visible face, and upright chivalric stance',
    'monk': 'a monk martial artist with saffron robe, prayer beads, bare hands, shaved head, sandals, and balanced humanoid fighting stance',
    'ranger': 'a ranger adventurer with forest cloak, leather armor, curved bow, quiver, boots, and alert archer humanoid stance',
    'rogue': 'a rogue adventurer with dark hooded cloak, leather armor, silver dagger, masked face, boots, and sneaking humanoid stance',
    'samurai': 'a samurai warrior humanoid with lacquered armor, kabuto helmet, curved katana, sash, visible face, armored boots, and disciplined battle stance',
    'tourist': 'a tourist adventurer with cloth sunhat, bright shirt, backpack, camera, shorts, boots, visible face, and cheerful humanoid explorer stance',
    'valkyrie': 'a valkyrie warrior with winged helmet, round shield, spear, braided hair, armored boots, and heroic humanoid stance',
    'wizard': 'a wizard adventurer with pointed hat, long robe, wand, spellbook pouch, beard, boots, and magical humanoid casting stance',
    'lord-carnarvon': 'Lord Carnarvon as a noble archeologist humanoid with pith helmet, cream expedition suit, map satchel, cane, boots, visible face, and dignified explorer stance',
    'pelias': 'Pelias as an elderly barbarian chieftain humanoid with fur mantle, braided gray beard, bronze axe, leather armor, boots, visible face, and wise warrior stance',
    'shaman-karnov': 'Shaman Karnov as a cave shaman with bone headdress, hide robe, carved staff, charm necklace, bare feet, and ritual humanoid stance',
    'earendil': 'Earendil as a radiant elven lord with silver hair, star-tipped staff, blue cloak, slim armor, boots, and graceful humanoid stance',
    'elwing': 'Elwing as an elven lady with white feather cloak, silver hair, teal gown, small wand, boots, and graceful wing-like humanoid silhouette',
    'hippocrates': 'Hippocrates as a master healer with white physician robe, teal sash, medicine staff, scroll satchel, sandals, and wise humanoid stance',
    'king-arthur': 'King Arthur as a crowned knight king with plate armor, red cloak, golden crown, shining sword, shield, and commanding humanoid stance',
    'grand-master': 'a Grand Master monk with aged face, saffron and ivory robes, prayer beads, raised open hands, sandals, and serene martial stance',
    'arch-priest': 'an Arch Priest with ornate holy robes, gold mitre, ceremonial staff, visible face, layered cloth sleeves, and solemn humanoid stance',
    'orion': 'Orion as a legendary ranger with starry cloak, leather armor, great bow, quiver, boots, and hunter humanoid stance',
    'master-of-thieves': 'a Master of Thieves with black hooded cloak, leather armor, silver twin daggers, coin pouch, boots, and sly crouched humanoid stance',
    'lord-sato': 'Lord Sato as a samurai lord with ornate lacquer armor, kabuto crest, katana, command fan, boots, and noble warrior stance',
    'twoflower': 'Twoflower as an eager tourist with colorful cloth shirt, straw hat, huge backpack, camera, luggage chest, boots, visible face, and curious humanoid stance',
    'norn': 'a Norn fate-weaver with long robe, braided hair, spindle staff, thread of fate, boots, and mystical humanoid stance',
    'neferet-the-green': 'Neferet the Green as an emerald wizard queen with green robe, gold circlet, staff, spell glow, boots, and regal humanoid casting stance',
    'minion-of-huhetotl': 'the Minion of Huhetotl as a jaguar-masked temple demon humanoid with feather headdress, obsidian claws, ritual armor, tail, and crouched menace',
    'thoth-amon': 'Thoth Amon as a dark sorcerer with black-purple robe, serpent staff, bald stern face, gold collar, boots, and sinister casting stance',
    'chromatic-dragon': 'a Chromatic Dragon with multi-colored scaled body, horned head, broad wings, clawed feet, long tail, and prismatic dragon stance',
    'goblin-king': 'a Goblin King with green goblin face, crown, fur cloak, jagged sword, small shield, boots, and squat royal monster stance',
    'cyclops': 'a Cyclops giant with one huge eye, bulky humanoid body, rough hide tunic, heavy club, broad feet, and looming monster stance',
    'ixoth': 'Ixoth as a red dragon with horned reptile head, broad wings, scaled body, clawed feet, long tail, and fiery dragon boss posture',
    'master-kaen': 'Master Kaen as a powerful martial monk with crimson robe, prayer beads, bald head, flaming fists, sandals, and aggressive humanoid stance',
    'nalzok': 'Nalzok as a horned demon prince with red hide, black wings, skull staff, clawed hands, hooved feet, and infernal humanoid stance',
    'scorpius': 'Scorpius as a giant scorpion lord with chitin body, raised stinger tail, large pincers, many legs, and venomous monster stance',
    'master-assassin': 'a Master Assassin with dark hood, leather armor, face mask, poisoned dagger, short cloak, boots, and lethal crouched humanoid stance',
    'ashikaga-takauji': 'Ashikaga Takauji as a warlord samurai with ornate armor, horned kabuto helmet, katana, battle fan, boots, and commanding warrior stance',
    'lord-surtur': 'Lord Surtur as a fire giant king with flaming hair, giant humanoid body, charred armor, massive sword, boots, and blazing boss stance',
    'dark-one': 'the Dark One as a shadowy archwizard with black robe, pale face, horned crown, dark staff, boots, and ominous magical humanoid stance',
    'student': 'a student martial monk with simple cloth gi, tied belt, short hair, bare hands, sandals, and learning combat stance',
    'chieftain': 'a tribal chieftain with hide armor, feather crest, bone necklace, stone axe, boots, and proud humanoid leader stance',
    'neanderthal': 'a neanderthal cave warrior with stocky humanoid body, fur tunic, heavy brow, stone club, bare feet, and primitive stance',
    'high-elf': 'a High-elf noble archer with pointed ears, silver hair, blue-green cloak, fine bow, leather boots, and graceful humanoid stance',
    'attendant': 'a healer attendant with pale robe, teal apron, small medicine pouch, gentle face, sandals, and helpful humanoid stance',
    'page': 'a young knight page with simple cloth tunic, small round shield, practice sword, boots, visible face, and upright apprentice humanoid stance',
    'abbot': 'an abbot monk elder with ivory robe, prayer beads, shaved head, wooden staff, sandals, and serene humanoid stance',
    'acolyte': 'a temple acolyte with novice robe, candle staff, rope belt, visible face, sandals, and humble humanoid stance',
    'hunter': 'a hunter ranger with leather armor, fur-lined cloak, bow, quiver, boots, and tracking humanoid stance',
    'thug': 'a thug rogue with rough leather vest, club, scarred face, hood, boots, and brutish humanoid stance',
    'ninja': 'a ninja warrior with dark cloth armor, face mask, short blade, tabi boots, and agile crouched humanoid stance',
    'roshi': 'a roshi monk master humanoid with gray beard, simple robe, wooden staff, prayer beads, sandals, visible face, and calm teaching stance',
    'guide': 'a guide ranger with green cloak, walking staff, map satchel, boots, and alert pathfinder humanoid stance',
    'warrior': 'a warrior valkyrie with chain armor, round shield, spear, braided hair, boots, and strong humanoid battle stance',
    'apprentice': 'a wizard apprentice with oversized pointed hat, short robe, small wand, book satchel, boots, and eager casting stance',
    'minotaur': 'a muscular bull-headed minotaur monster with cream horns, broad shoulders, hooved legs, snout, nose ring, and heavy axe',
    'jabberwock': 'a whimsical fierce jabberwock dragon-wyvern with long neck, toothy beak, clawed arms, wings, curled tail, and storybook monster posture',
    'vorpal-jabberwock': 'a fierce jabberwock dragon-wyvern recoiling from a shimmering vorpal blade aura, long neck, wings, claws, toothy beak, and curled tail',
    'keystone-kop': 'a Keystone Kop police officer, stout comic fantasy humanoid with blue uniform, brass badge, peaked cap, baton, boots, and moustache',
    'kop-sergeant': 'a Keystone Kop police sergeant, stout comic fantasy humanoid officer with blue uniform, brass chevrons, peaked cap, baton, boots, and moustache',
    'kop-lieutenant': 'a Keystone Kop police lieutenant, small stern humanoid officer with blue uniform, brass badge, baton, peaked cap, and moustache',
    'kop-kaptain': 'a Keystone Kop police captain, stout fantasy humanoid officer with dark blue uniform, gold-trim cap, brass badge, red sash, baton, and moustache',
    'lich': 'an undead lich wizard with skull face, tattered dark robe, bony hands, small crown, and eerie magical aura',
    'demilich': 'an ancient demilich skull with floating bone fragments, jeweled brow, and eerie magical aura',
    'master-lich': 'a powerful undead lich sorcerer with skull face, ornate robe, bone staff, and cold magical aura',
    'arch-lich': 'a supreme undead arch-lich with skull face, tall crown, ornate dark robe, bone staff, and intense magical aura',
    'stone-golem': 'a heavy humanoid golem built from rough gray stone blocks, cracked granite shoulders, boulder fists, and moss-free chiseled edges',
    'glass-golem': 'a humanoid golem made from transparent glass plates and crystal shards, clear faceted limbs, refracted blue highlights, and bright white glints',
    'clay-golem': 'a bulky humanoid golem sculpted from wet reddish clay, rounded pottery limbs, thumbprint dents, and earthen cracks',
    'iron-golem': 'a massive humanoid golem forged from dark iron plates, riveted shoulders, heavy metal fists, and furnace-orange seams',
    'gold-golem': 'a compact humanoid golem made of gold plates and coin-like joints, bright metallic shoulders, and jewel-like highlights',
    'leather-golem': 'a stitched humanoid golem made from brown leather patches, straps, seams, buckles, and soft folded limbs',
    'wood-golem': 'a humanoid golem carved from wooden logs and branches, bark shoulders, twig fingers, and leaf accents',
    'flesh-golem': 'a hulking stitched flesh golem with mismatched limbs, scar seams, heavy boots, and broad monster silhouette',
    'rope-golem': 'a humanoid golem twisted from thick rope coils, knot fists, braided limbs, and dangling fiber ends',
    'ghoul': 'a gaunt crouching ghoul humanoid with skull-like face, long clawed hands, hunched shoulders, torn rags, exposed ribs, and predatory undead stance',
    'skeleton': 'a standing humanoid skeleton warrior made of separate visible bones, skull head, rib cage, arm bones, leg bones, small round shield, and short sword',
    'human': 'a baseline human adventurer with visible peach face, chestnut hair, blue tunic, red scarf, tan boots, belt, and upright humanoid explorer stance',
    'ogre': 'a bulky ogre brute humanoid with broad shoulders, heavy arms, tusks, simple club, ragged loincloth, bare feet, and hunched monster stance',
    'quantum-mechanic': 'an eccentric human quantum mechanic scientist with wild white hair, goggles, blue lab coat, small wrench, glowing atom sparks, boots, and readable humanoid silhouette',
    'genetic-engineer': 'a human genetic engineer scientist with green lab coat, goggles, teal vial, small gene helix glow, gloves, boots, and readable humanoid silhouette',
    'rust-monster': 'a rust monster insect beast with four legs, long feathery antennae, shovel tail, segmented body, and hungry snout',
    'disenchanter': 'a disenchanter beast with stocky armored animal body, horned head, glowing anti-magic aura, claws, and clear monster silhouette',
    'ice-troll': 'a bulky ice troll monster with long arms, hunched posture, icicle tusks, frosted claws, shaggy frozen hide, and heavy feet',
    'rock-troll': 'a bulky rock troll monster with long arms, hunched posture, stone-plate hide, craggy shoulders, tusks, and heavy clawed hands',
    'water-troll': 'a bulky water troll monster with long arms, hunched wet posture, dripping seaweed hair, webbed claws, tusks, and splashing feet',
    'olog-hai': 'a massive armored Olog-hai troll warrior with long arms, hunched shoulders, tusks, iron shoulder plates, heavy claws, and brutal stance',
    'umber-hulk': 'an umber hulk burrowing monster with insectoid mandibles, broad armored body, huge digging claws, hunched back, and glaring compound eyes',
    'barrow-wight': 'an ancient barrow wight undead warrior with gaunt humanoid body, tattered burial cloak, old bronze armor, bony hands, and glowing eyes',
    'wraith': 'a floating wraith specter with torn hooded robes, ghostly face glow, long spectral hands, trailing mist tail, and clear humanoid silhouette',
    'nazgul': 'a hooded Nazgul ringwraith with black torn cloak, red eye slits inside the hood, skeletal hands, thin sword, and ominous floating stance',
    'xorn': 'a squat xorn earth monster with round stony body, three clawed legs, three arms, wide toothy mouth, and multiple gem-like eyes',
    'owlbear': 'an owlbear monster with bulky bear body, owl head, round eyes, hooked beak, feathered chest, bear claws, and strong beast silhouette',
    'elf': 'a slim elf adventurer with pointed ears, peach face, silver-blond hair, green cloak, leather boots, and a small bow',
    'woodland-elf': 'a woodland elf archer with pointed ears, leaf-green hood, brown leather armor, curved bow, and forest accents',
    'green-elf': 'a green elf warrior with pointed ears, emerald cloak, green tunic, golden bow, and leaf-shaped armor accents',
    'grey-elf': 'a grey elf mage with pointed ears, silver-gray cloak, pale hair, slender staff, and cool moonlit accents',
    'doppelganger': 'a shapeshifting doppelganger humanoid mid-transformation with two overlapping face silhouettes, melting cloak edges, one arm becoming a claw, and magical morph aura',
    'shopkeeper': 'a friendly fantasy shopkeeper humanoid merchant with apron, coin pouch, tiny ledger book, upright pose, moustache, and market-stall trader silhouette',
    'guard': 'a stern dungeon guard humanoid soldier with helmet, royal tabard, upright shielded stance, short silver spear, boots, and watchman posture distinct from a merchant',
    'prisoner': 'a ragged dungeon prisoner humanoid with striped torn tunic, shackled wrists, bare feet, tired face, and hunched captive posture',
    'oracle': 'a wise cave oracle seer with hooded robe, glowing crystal ball, silver hair, staff, and calm mystical humanoid silhouette',
    'soldier': 'a disciplined dungeon soldier with steel helmet, chain shirt, round shield, short sword, boots, and upright marching stance',
    'sergeant': 'a veteran dungeon sergeant with crested helmet, striped command sash, bronze shield, short sword, boots, and authoritative stance',
    'nurse': 'a healer nurse humanoid with white apron, teal robe, small red medical pouch, visible face, and gentle helping pose',
    'lieutenant': 'a dungeon lieutenant officer with polished breastplate, blue cloak, plumed helmet, slender sword, and confident command posture',
    'captain': 'a dungeon captain officer with ornate gold-trim armor, red cape, crested helm, broad shield, and commanding sword-raised pose',
    'watchman': 'a town watchman guard with kettle helmet, lantern, spear, blue-gray tabard, boots, and alert patrol stance',
    'watch-captain': 'a town watch captain with ornate guard helm, emerald tabard, gold-trim shield, silver spear, and stern patrol leader posture',
    'medusa': 'Medusa gorgon with humanoid torso, snake hair, scaled green tail, bronze mirror shield, clawed hands, and petrifying stare',
    'wizard-of-yendor': 'the Wizard of Yendor, an evil archwizard with tall pointed hat, dark purple robe, glowing staff, long beard, and crackling magic aura',
    'croesus': 'Croesus wealthy king with gold crown, purple royal robe, coin pouch, jeweled scepter, curled beard, and opulent noble posture',
    'charon': 'Charon underworld ferryman with hooded black robe, skeletal face, long pole oar, ragged cloak, and ghostly boatman silhouette',
    'ghost': 'a translucent floating ghost with rounded head, hollow eyes, wispy trailing tail, raised spectral hands, and soft ectoplasm aura',
    'shade': 'a darker shadow shade specter with smoky hood, pale eye glow, tattered mist body, clawed spectral hands, and trailing shadow wisps',
    'water-demon': 'a water demon with horned humanoid torso rising from waves, webbed claws, fin ears, curling tail, and splashing aquatic posture',
    'horned-devil': 'a horned devil fiend with large curled horns, bat wings, forked tail, clawed hands, hooved feet, and menacing stance',
    'erinys': 'an erinys winged devil warrior with feathered dark wings, bronze armor, fiery whip, humanoid face, and avenging aerial stance',
    'barbed-devil': 'a barbed devil covered in hooked spikes, hunched fiend body, long claws, forked tail, horned head, and bristling silhouette',
    'marilith': 'a marilith serpent demon with six sword-wielding arms, humanoid torso, coiled snake tail, crown-like hair, and battle dance pose',
    'vrock': 'a vrock vulture demon with hunched birdlike torso, ragged feathered wings, hooked beak, taloned feet, clawed hands, and carrion-fiend posture',
    'hezrou': 'a hezrou toad demon with squat amphibian body, huge fanged frog mouth, warty skin folds, clawed hands, thick legs, and swamp-fiend stance',
    'bone-devil': 'a bone devil with skeletal insectoid body, hooked bone tail, long bony limbs, bat-like wings, skull face, and spined silhouette',
    'ice-devil': 'an ice devil insect fiend with mantis-like limbs, icy carapace plates, tall horned head, frost spikes, thin wings, and freezing battle stance',
    'nalfeshnee': 'a nalfeshnee boar-ape demon with massive belly, tusked boar head, small feathered wings, clawed arms, squat legs, and cruel judge posture',
    'pit-fiend': 'a pit fiend archdevil with towering horned body, broad bat wings, muscular arms, forked tail, flaming aura, and commanding infernal stance',
    'sandestin': 'a sandestin summoned spirit servitor with elegant humanoid upper body, flowing vapor robes, magical wisps, outstretched hands, and otherworldly posture',
    'balrog': 'a balrog fire demon with horned shadow body, blazing mane, wide dark wings, flaming whip, heavy sword, clawed feet, and ancient infernal silhouette',
    'juiblex': 'Juiblex demon lord of slime as a towering amorphous ooze mass with many bubbling eyes, dripping pseudopods, sagging mouth, and toxic puddle base',
    'yeenoghu': 'Yeenoghu gnoll demon lord with oversized hyena head, pale muzzle, hunched muscular body, raised spiked flail, cream fangs, clawed feet, and broad readable savage stance',
    'orcus': 'Orcus demon prince with goat skull face, obese red body, huge bat wings, skull-tipped wand, clawed hands, and heavy tyrant posture',
    'geryon': 'Geryon archdevil with armored humanoid torso, horned head, coiled serpentine lower body, shielded shoulders, and threatening spear-ready pose',
    'dispater': 'Dispater archdevil as a bright iron-armored ruler with tall crown, broad crimson cloak, pale face, long spear held diagonally, and rigid commanding silhouette',
    'baalzebub': 'Baalzebub lord of flies with bloated insect-demon body, fly wings, compound eyes, mandibles, clawed limbs, and buzzing plague aura',
    'asmodeus': 'Asmodeus regal archdevil with horned humanoid body, ornate armor, dark cape, ruby staff, barbed tail, and supreme infernal ruler stance',
    'demogorgon': 'Demogorgon demon prince with two snarling heads, reptilian torso, tentacle arms, clawed feet, forked tail, and chaotic monster posture',
    'death': 'Death as a skeletal hooded rider-avatar with skull face, bony hands, long scythe, torn black robe, and cold reaper silhouette',
    'pestilence': 'Pestilence as a plague rider-avatar with gaunt diseased humanoid body, tattered robe, fly swarm, bone staff, and toxic miasma posture',
    'famine': 'Famine as an emaciated rider-avatar with skeletal thin limbs, hollow face, ragged robes, empty bowl, and starving specter silhouette',
    'mail-daemon': 'a mail daemon courier with small winged humanoid body, oversized parchment mail satchel across the chest, visible white envelope bundle, messenger cap, quick boots, and impish delivery pose',
    'djinni': 'a djinni genie spirit with humanoid torso, folded arms, curled smoky lower body, gold cuffs, turban-like hair, and magical floating posture',
    'jellyfish': 'a jellyfish sea creature with translucent bell body, dangling tentacles, soft glow, rounded top, and drifting aquatic silhouette',
    'piranha': 'a piranha fish with oval body, aggressive open mouth, triangular teeth, sharp fins, and compact swimming silhouette',
    'shark': 'a shark with streamlined body, tall dorsal fin, pointed snout, crescent tail, open toothy mouth, and strong swimming silhouette',
    'giant-eel': 'one single giant eel in a clean S-curve with continuous long serpentine fish body, slick wet skin, one narrow head, small fins, cream belly stripe, and open mouth',
    'electric-eel': 'an electric eel with long serpentine fish body, lightning arcs along its back, small fins, narrow head, and crackling aquatic posture',
    'kraken': 'a kraken sea monster with central squid head, many curling tentacles with suckers, glaring eyes, beak mouth, and rising-from-depths posture',
    'baby-crocodile': 'a baby crocodile in clear side view with oversized long snout, squat armored body, four short legs, tiny teeth, curved tail, and low crawling posture',
    'lizard': 'a small lizard with four splayed legs, long tail, alert head, tiny claws, bright crest, and readable reptile silhouette',
    'chameleon': 'a chameleon with curled tail, casque head, bulging eyes, gripping feet, arched back, and colorful lizard silhouette',
    'crocodile': 'a crocodile with long armored reptile body, huge toothy snout, squat legs, ridged back, heavy tail, and low predator stance',
    'salamander': 'a fiery salamander monster with humanoid torso, lizard tail made of flame, clawed hands, crested head, and coiling elemental stance',
    'long-worm-tail': 'a long worm tail segment with ringed cylindrical body, tapered end, slime sheen, curling motion, and clear segmented monster-part silhouette',
}

FAMILY_SUBJECT_TEMPLATES = [
    ('-mummy', 'a wrapped {name} mummy with linen bandages, visible creature silhouette, glowing eyes, and ancient tomb dust'),
    ('-zombie', 'a shambling undead {name} zombie with torn clothing, slack posture, exposed bone details, and eerie eyes'),
    ('-naga-hatchling', 'a small serpent naga hatchling with coiled body, young hooded head, bright eyes, and tiny crest'),
    ('-naga', 'a serpent-bodied naga with coiled tail, raised hooded head, fangs, and fantasy monster posture'),
]

GEM_IDS = {'agate', 'amber', 'amethyst', 'aquamarine', 'black-opal', 'chrysoberyl', 'citrine', 'diamond', 'dilithium-crystal', 'emerald', 'flint', 'fluorite', 'garnet'}
POLEARM_IDS = {'aklys', 'bardiche', 'bec-de-corbin', 'bill-guisarme', 'fauchard'}
ARMOR_TERMS = ('mail', 'armor', 'smock', 'scale', 'cloak', 'helm', 'shield', 'boots', 'gauntlets', 'gloves', 'cap')
WEAPON_TERMS = ('sword', 'knife', 'dagger', 'arrow', 'bow', 'spear', 'club', 'whip', 'boomerang', 'mattock')
FOOD_TERMS = ('ration', 'food', 'candy', 'garlic', 'pie', 'meatball', 'leaf', 'cookie')
TOOL_TERMS = ('lantern', 'bugle', 'grease', 'candelabrum', 'chest', 'ball', 'horn', 'drum', 'figurine', 'card')
SCROLLISH_IDS = {'chain-lightning', 'charging', 'destroy-armor', 'detect-food', 'detect-monsters', 'detect-treasure', 'detect-unseen', 'earth', 'enchant-armor', 'enchant-weapon', 'fire', 'food-detection'}
POTION_IDS = {'blindness', 'booze', 'confusion', 'cure-blindness', 'cure-sickness', 'extra-healing', 'fruit-juice', 'full-healing', 'gain-ability', 'gain-energy', 'gain-level'}
RING_IDS = {'cold-resistance', 'conflict', 'fire-resistance', 'free-action', 'gain-constitution', 'gain-strength'}
WAND_IDS = {'cancellation', 'cold', 'cone-of-cold', 'dig', 'digging', 'drain-life', 'finger-of-death'}
SPELLBOOK_IDS = {'book-of-the-dead', 'cause-fear', 'charm-monster', 'clairvoyance', 'confuse-monster', 'create-familiar', 'create-monster', 'cure-blindness', 'cure-sickness', 'detect-food', 'detect-monsters', 'detect-treasure', 'detect-unseen', 'enlightenment', 'finger-of-death', 'fireball', 'flame-sphere', 'force-bolt', 'freeze-sphere'}


def class_subject_for_object(aid: str, lname: str, glyph: str | None = None) -> str | None:
    """Concrete fallbacks for object classes; never return generic inventory-object text."""
    glyph = glyph or ''
    if aid in GEM_IDS or glyph == '*' or lname.endswith(' gem') or 'crystal' in aid:
        return f'a faceted {lname} gemstone with a distinct cut crystal silhouette, angled facets, bright glints, and transparent jewel material'
    if 'amulet' in aid or glyph == '"':
        effect = lname.replace('amulet of ', '').replace('amulet versus ', 'versus ')
        return f'a fantasy amulet for {effect} with visible chain loop, distinctive shaped pendant, gem setting, and readable jewelry silhouette'
    if aid == 'fauchard':
        return f'a fauchard polearm cropped as a broad crescent steel blade head with short thick wooden shaft, large hooked cutting edge, spear point, bindings, and readable pole weapon silhouette at 16px'
    if aid in POLEARM_IDS:
        return f'a long {lname} polearm with wooden shaft, distinctive hooked or axe-like steel head, spear point, bindings, and readable pole weapon silhouette'
    if any(term in aid for term in ARMOR_TERMS) or glyph == '[':
        if 'scales' in aid and 'mail' not in aid:
            return f'a loose pile of {lname} dragon scales with overlapping scale plates, claw-like edges, metallic shine, and readable scale-pile silhouette'
        if 'cloak' in aid:
            return f'a folded wearable {lname} cloak with hood opening, draped cloth folds, clasp, fluttering hem, and readable garment silhouette'
        if 'boots' in aid:
            return f'a pair of {lname} boots with cuffs, soles, straps, and readable footwear silhouette'
        if 'helm' in aid or 'cap' in aid or 'cornuthaum' in aid or 'fedora' in aid:
            return f'a wearable {lname} headgear piece with brim or crown, face opening, highlights, and readable helmet or hat silhouette'
        if 'shield' in aid:
            return f'a handheld {lname} shield with rim, boss, straps, curved face, and readable defensive gear silhouette'
        if 'gauntlets' in aid or 'gloves' in aid:
            return f'a pair of {lname} gauntlets with finger shapes, wrist cuffs, knuckle plates, and readable glove silhouette'
        return f'a wearable {lname} armor torso piece with shoulder openings, layered plates or cloth folds, waist opening, and readable equipment silhouette'
    if 'scroll' in aid or glyph == '?' or aid in SCROLLISH_IDS:
        return f'a rolled parchment {lname} scroll with uneven paper ends, wax seal, wooden rods, curled edges, diagonal roll shape, and readable scroll silhouette'
    if 'paper' in aid:
        return f'a single irregular loose {lname} sheet with curled corner, torn uneven edges, visible paper fibers, and no border or square card fill'
    if 'spellbook' in aid or glyph == '+' or aid in SPELLBOOK_IDS or aid in {'abra-ka-dabra', 'ashpd-sodalg', 'eiris-sazun-idisi', 'etaoin-shrdlu', 'fnord', 'foobie-bletch', 'garven-deh'}:
        return f'a closed {lname} spellbook with thick cover, cream page block, clasp, magical glow, and no letters or title text'
    if 'bag' in aid:
        return f'a cinched cloth {lname} sack with drawstring neck, soft bulging sides, strap or patches, and readable bag silhouette'
    if 'bell' in aid:
        return f'a hand {lname} with flared bell skirt, small handle, visible clapper, and readable bell silhouette'
    if any(term in aid for term in WEAPON_TERMS) or glyph == ')':
        if aid == 'elven-bow':
            return f'a thick luminous crescent {lname} bow weapon with taut string, nocked silver arrow crossing the center, wrapped grip, carved limb tips, and broad readable archery silhouette at 16px'
        if 'bow' in aid:
            return f'a curved {lname} bow weapon with taut string, wrapped grip, carved limb tips, and readable archery silhouette'
        if 'arrow' in aid:
            return f'a small bundle of {lname} arrows with pointed metal tips, feather fletching, tied shafts, and readable ammunition silhouette'
        if 'boomerang' in aid:
            return f'a curved wooden {lname} throwing weapon with crescent shape, carved edge highlights, and readable boomerang silhouette'
        if 'whip' in aid:
            return f'a coiled {lname} whip with braided leather cord, handle, tail tip, and readable flexible weapon silhouette'
        return f'a {lname} weapon with distinctive blade or striking head, wrapped grip, metal shine, and readable weapon silhouette'
    if 'potion' in aid or glyph == '!' or aid in POTION_IDS:
        return f'a glass {lname} potion vial with cork stopper, rounded bottle silhouette, colored liquid fill, shine glints, and readable potion shape'
    if 'ring' in aid or glyph == '=' or aid in RING_IDS:
        return f'a {lname} magic ring with circular band, raised gem setting, inner hole, metallic shine, and readable jewelry silhouette'
    if 'wand' in aid or glyph == '/' or aid in WAND_IDS:
        return f'a short thick {lname} magic wand with oversized glowing crystal tip, chunky carved rod, bright aura plume, grip bands, and readable wand silhouette at 16px'
    if any(term in aid for term in FOOD_TERMS) or glyph == '%':
        return f'a distinct {lname} food item with edible silhouette, wrapper or natural texture details, bright highlights, and readable ration or food shape'
    if any(term in aid for term in TOOL_TERMS) or glyph == '(':
        if 'lantern' in aid:
            return f'a brass {lname} with arched handle, glass window, warm flame core, metal base, and readable lantern silhouette'
        if 'bugle' in aid or 'horn' in aid:
            return f'a curved {lname} instrument with flared bell, mouthpiece, brass tubing, and readable horn silhouette'
        if 'candelabrum' in aid:
            return f'a golden {lname} with branched candle arms, small flames, central stem, base, and readable ritual candelabrum silhouette'
        if 'chest' in aid:
            return f'a wooden {lname} container with arched lid, metal bands, latch, short feet, and readable treasure chest silhouette'
        if 'card' in aid:
            return f'a small angled {lname} tool with rounded corners, embossed chip detail, visible thickness, hand-held proportions, and clear payment-tool silhouette'
        if 'ball' in aid:
            return f'a heavy iron {lname} sphere with chain link, glossy highlights, and readable weighted ball silhouette'
        return f'a concrete {lname} tool with distinctive handle, functional parts, material details, and readable tool silhouette'
    return None


def object_palette_for(aid: str, lname: str, glyph: str | None = None) -> str:
    glyph = glyph or ''
    if any(color in aid for color in ('blue', 'sapphire')):
        return 'cobalt blue and silver with cyan highlights, white shine pixels, and pale blue rim light'
    if any(color in aid for color in ('bronze', 'brass')):
        return 'warm bronze and brass gold with amber highlights, dark brown shadows, and cream edge glints'
    if aid == 'flint':
        return 'charcoal gray and smoky black stone with slate facets, cream chipped edges, and cool blue rim highlights'
    if aid == 'fluorite':
        return 'violet purple and icy blue fluorite crystal with magenta shadows, white glints, and pale lavender rim light'
    if any(color in aid for color in ('crystal', 'diamond', 'dilithium')):
        return 'clear icy cyan and white crystal with lavender refraction shadows, silver-blue rim light, and bright white glints'
    if any(color in aid for color in ('citrine', 'chrysoberyl', 'gold')):
        return 'golden yellow jewel tones with amber shadows, lemon highlights, and white sparkle glints'
    if 'emerald' in aid:
        return 'emerald green jewel tones with lime highlights, deep teal shadows, and white sparkle glints'
    if 'garnet' in aid:
        return 'deep red garnet with ruby highlights, burgundy shadows, and pink-white sparkle glints'
    if glyph == '!' or aid in POTION_IDS:
        return 'colored glass vial tones of violet, aqua, and rose liquid with white glints and cork brown accents'
    if glyph == '?' or aid in SCROLLISH_IDS:
        return 'warm parchment cream and tan with red wax seal, brown rods, gold edge highlights, and soft blue magic glow'
    if glyph == '/' or aid in WAND_IDS:
        return 'dark polished wood and silver bands with colored crystal tip, cyan magic sparkle, and cream edge highlights'
    if glyph == '=' or aid in RING_IDS:
        return 'bright gold ring metal with colored gemstone accent, amber shadows, and white shine pixels'
    if glyph == '+' or aid in SPELLBOOK_IDS:
        return 'deep indigo and burgundy leather cover with cream pages, gold clasp, cyan magical glow, and pale edge highlights'
    if glyph == '[' or any(term in aid for term in ARMOR_TERMS):
        return 'blue-gray steel and polished silver with leather brown straps, cream highlights, and colored magical rim light'
    if glyph == ')' or any(term in aid for term in WEAPON_TERMS):
        return 'silver steel blade or head with warm brown grip, brass bindings, cream highlights, and cool blue edge shine'
    if glyph == '%' or any(term in aid for term in FOOD_TERMS):
        return 'warm tan, cream, and honey-brown food colors with red wrapper accents, golden highlights, and soft shadows'
    if glyph == '"' or 'amulet' in aid:
        return 'bright gold chain and pendant with colored gem core, amber shadows, cyan magic glow, and white highlights'
    if glyph == '*' or aid in GEM_IDS:
        return 'saturated jewel colors with transparent facets, white sparkle highlights, deep colored shadows, and pale rim light'
    return 'warm brass, leather brown, cream highlights, colored gem accents, and pale cyan rim light'


# Follow-up weapon audit regeneration overrides: these force the report's
# concrete "what it should look like" semantics instead of generic weapon-class
# fallbacks for 16px readability.
SUBJECT_OVERRIDES.update({
    'sling': 'a leather sling weapon with one clearly visible tan pouch and two long braided cords spread apart, readable as a thrown-stone sling not jewelry',
    'aklys': 'a short hooked aklys throwing club with heavy blunt wooden head, curved hook, leather wrist strap cord, and compact readable club silhouette',
    'bec-de-corbin': 'a crow-beak bec-de-corbin polearm with long straight shaft, hammer face, rear curved pick beak, top spear point, and clear polearm silhouette',
    'bill-guisarme': 'a bill-guisarme polearm with very long shaft, large billhook crescent blade, forward spear spike, rear hook, and clear hybrid hook-and-spear silhouette',
    'bullwhip': 'a long coiled bullwhip with short handle, spiral leather lash, tapering tail tip, and readable flexible whip silhouette',
    'dwarvish-short-sword': 'a short sturdy dwarvish sword with broad compact steel blade, stout crossguard, thick wrapped grip, and squat durable silhouette',
    'elven-arrow': 'a slender elven arrow with silver leaf-shaped point, long straight shaft, green leaf-like fletching, and elegant readable arrow silhouette',
    'elven-bow': 'an elegant curved elven bow with warm golden wood limbs, taut pale string, leaf-carved tips, wrapped grip, and natural bow silhouette not a neon UI marker',
    'glaive': 'a glaive polearm with long wooden shaft and one single-edged sweeping steel blade mounted at the top, clear readable long weapon silhouette',
    'guisarme': 'a guisarme polearm with long shaft and pronounced hooked steel blade for pulling riders, clear hook silhouette and spear-like top',
    'halberd': 'a halberd polearm with long shaft, broad axe blade, top spear point, rear hook, and unmistakable axe-plus-spike silhouette',
    'javelin': 'a light straight throwing javelin with slim wooden shaft, small sharp steel point, tied grip wrap, and clean straight missile silhouette',
    'katana': 'a curved single-edged katana with long silver blade, distinct square guard, dark wrapped two-hand hilt, and readable Japanese sword silhouette',
    'lance': 'a long cavalry lance with very long straight shaft, sharp conical metal point, small pennant wrap, and clear jousting weapon silhouette',
    'morning-star': 'a morning star weapon with short handle, chain or socket, round spiked steel ball, and visible spikes at 16px',
    'partisan': 'a partisan polearm with broad spearhead and two side projections/lugs on a long shaft, clear spear-like polearm silhouette',
    'scimitar': 'a strongly curved single-edged scimitar sword with broad crescent blade, small guard, wrapped grip, and readable curved-sword silhouette',
    'silver-mace': 'a silver mace with short handle and bright spiked or flanged metal head, clear blunt weapon silhouette not a smooth mallet',
    'two-handed-sword': 'a large long two-handed sword with oversized straight blade, wide crossguard, long two-hand grip, and heavy greatsword silhouette',
    'yumi': 'a tall asymmetric Japanese yumi bow with grip below center, long upper limb, shorter lower limb, taut string, and readable asymmetric bow silhouette',
    'crossbow': 'a compact horizontal crossbow with walnut stock, steel bow arms spanning left-right, taut string, small trigger, and uncluttered readable crossbow silhouette',
})
PALETTE_OVERRIDES.update({
    'sling': 'warm brown leather cords, tan pouch, cream edge highlights, small gray stone accent, and amber shadows',
    'aklys': 'oak brown wood, dark leather cord, bronze studs, tan wood grain highlights, and cream edge accents',
    'bec-de-corbin': 'warm brown shaft, silver-blue steel hammer and beak, brass collars, white edge glints, and cool gray shadows',
    'bill-guisarme': 'warm brown shaft, bright silver crescent hook and spear, red leather binding, brass socket, and cream blade highlights',
    'bullwhip': 'reddish brown braided leather, dark walnut handle, tan lash highlights, brass pommel, and cream edge pixels',
    'dwarvish-short-sword': 'blue-gray steel blade, dark brown wrapped grip, brass crossguard, tan leather, and white blade glints',
    'elven-arrow': 'silver leaf point, honey-brown shaft, emerald green leaf fletching, pale gold bands, and cream highlights',
    'elven-bow': 'golden yew wood, forest green grip wrap, pale cream string, leaf-green carved tips, and warm amber highlights',
    'glaive': 'warm brown shaft, silver steel blade, brass socket, cream cutting edge, and cool blue steel shadows',
    'guisarme': 'warm brown shaft, silver hooked blade, brass collar, cream sharpened edge, and blue-gray shadows',
    'halberd': 'warm brown shaft, polished silver axe blade and spear point, brass bindings, cream edge highlights, and cool blue shadows',
    'javelin': 'tan wooden shaft, silver steel point, red leather grip wrap, cream highlights, and cool gray tip shadows',
    'katana': 'bright silver curved blade, dark indigo wrapped hilt, gold square guard, white blade highlights, and cool blue steel shine',
    'lance': 'long tan wooden shaft, silver conical tip, red pennant wrap, brass bands, and cream highlights',
    'morning-star': 'silver spiked steel ball, warm brown handle, brass socket or chain, white spike highlights, and cool blue shadows',
    'partisan': 'warm brown shaft, broad silver spearhead with side lugs, brass collar, cream edge highlights, and blue-gray shadows',
    'scimitar': 'bright silver crescent blade, gold guard, dark red grip, white edge highlights, and cool blue steel shine',
    'silver-mace': 'bright silver flanged mace head, dark brown handle, brass grip bands, white metal glints, and cool blue shadows',
    'two-handed-sword': 'long silver steel blade, dark leather two-hand grip, brass crossguard, white highlights, and blue-gray shadows',
    'yumi': 'warm bamboo tan and golden wood, dark brown grip wrap, pale cream string, amber highlights, and subtle green accent',
    'crossbow': 'dark walnut wood stock, silver steel bow arms, tan string, brass trigger, cream edge highlights, and cool gray shadows',
})


def semantic_subject_for(a: dict) -> str:
    """Return concrete visual subject text safe for image generation.

    Full-source NetHack manifest artDirection records often contain bookkeeping text
    such as "keyed from source glyph 'K'". Those source glyph instructions caused
    literal letter sprites, so generated prompts must not pass that text through.
    """
    aid = a['id']
    name = a.get('name') or aid.replace('-', ' ')
    if aid in SUBJECT_OVERRIDES:
        return SUBJECT_OVERRIDES[aid]
    lname = name.lower()
    if aid.startswith('kop-') or aid == 'keystone-kop':
        rank = lname.replace('kop ', '').replace('keystone kop', 'keystone kop police officer')
        return f'a Keystone Kop {rank}, comic fantasy police officer with blue uniform, brass badge, peaked cap, baton, and stout humanoid silhouette'
    for suffix, template in FAMILY_SUBJECT_TEMPLATES:
        if aid.endswith(suffix):
            return template.format(name=lname)
    if 'golem' in aid:
        material = lname.replace(' golem', '')
        return f'a humanoid {lname} built from clearly visible {material} material, broad shoulders, heavy fists, and animated construct posture'
    if 'elf' in aid:
        return f'a slim {lname} with pointed ears, visible humanoid face, fantasy cloak, leather boots, and archer or mage gear'
    if 'lich' in aid:
        return f'an undead {lname} with skull face, tattered sorcerer robe, bony hands, and magical aura'
    if 'vampire' in aid or aid == 'vlad-the-impaler':
        return f'a pale aristocratic vampire humanoid, dark cloak, sharp fangs, red-lined cape, and predatory stance representing {lname}'
    if 'troll' in aid or aid == 'olog-hai':
        return f'a bulky {lname} troll-like monster with long arms, hunched posture, tusks, rough hide, and heavy claws'
    if 'pudding' in aid or 'slime' in aid:
        return f'a glossy amorphous {lname} ooze creature with lumpy body, wet highlights, and creeping puddle shape'
    if aid in {'snake', 'water-moccasin', 'python', 'pit-viper', 'cobra'}:
        return f'a coiled {lname} snake with raised head, visible eyes, forked tongue, patterned scales, and readable serpent silhouette'
    if aid in {'monkey', 'ape', 'carnivorous-ape', 'sasquatch', 'yeti'}:
        return f'a hairy {lname} primate creature with arms, face, hands, feet, and crouched monster posture'
    if a.get('categorySlug') == 'full-source-objects':
        class_subject = class_subject_for_object(aid, lname, a.get('glyph'))
        if class_subject:
            return class_subject
        return f'a concrete fantasy roguelike inventory object representing {lname}, with readable item silhouette, material details, magical glow or shine, and no symbolic lettering'
    return f'a concrete fantasy roguelike creature: {lname}, with readable anatomy, face or focal feature, limbs or body shape, and species-specific gear or texture'


def palette_for(a: dict) -> str:
    aid = a['id']
    if aid in PALETTE_OVERRIDES:
        return PALETTE_OVERRIDES[aid]
    if a.get('categorySlug') == 'full-source-objects':
        return object_palette_for(aid, (a.get('name') or aid.replace('-', ' ')).lower(), a.get('glyph'))
    idx = sum(ord(ch) for ch in aid) % len(GENERIC_PALETTES)
    return GENERIC_PALETTES[idx]

def now() -> str:
    return time.strftime('%FT%TZ', time.gmtime())

def load_assets() -> list[dict]:
    return json.loads(EMAN.read_text(), object_pairs_hook=OrderedDict)['assets']

def load_status() -> dict:
    return json.loads(STATUS.read_text()) if STATUS.exists() else {'assets': {}, 'runs': []}

def expected_transparent(a: dict) -> bool:
    slug = a.get('categorySlug')
    if slug in TRANSPARENT_SLUGS:
        return True
    if slug == 'terrain-features' and a['id'] in TRANSPARENT_TERRAIN_IDS:
        return True
    if slug == 'ui-status-overlays' and a['id'] not in OPAQUE_UI_IDS and not any(t in a['id'] for t in ('panel', 'bar', 'log')):
        return True
    return False

def workflow_for(a: dict) -> Path:
    return TRANSPARENT_WF if expected_transparent(a) else OPAQUE_WF

def workflow_label_for(a: dict) -> str:
    return 'transparent-rmbg-coherent-restart' if expected_transparent(a) else 'opaque-terrain-coherent-restart'

def prompt_for(a: dict) -> str:
    name = a.get('name') or a['id'].replace('-', ' ')
    # Never pass manifest artDirection placeholder/glyph-class text into image prompts.
    # The prompt subject must be a concrete creature/material description.
    subject = semantic_subject_for(a)
    palette = palette_for(a)
    color_clause = f' Visible positive color palette: {palette}.'
    if expected_transparent(a):
        return f'{STYLE_PREFIX}{name}: {subject}{color_clause}{STYLE_SUFFIX_TRANSPARENT}'
    return f'{STYLE_PREFIX}{name}: {subject}{color_clause}{STYLE_SUFFIX_OPAQUE}'


def prompt_specificity_errors(a: dict) -> list[str]:
    """Guard against full-source monster prompts silently falling to generic text.

    The accepted marilith/barbed-devil recovery style uses hand-authored species
    anatomy plus positive palette/material guidance. Full-source monsters that hit
    the final generic creature fallback or generic palette rotation should be
    stopped during dry-run review before any ComfyUI generation starts.
    """
    if a.get('categorySlug') not in {'full-source-monsters', 'full-source-objects'}:
        return []
    aid = a['id']
    subject = semantic_subject_for(a)
    palette = palette_for(a)
    errors = []
    if a.get('categorySlug') == 'full-source-objects':
        combined = f'{subject} {palette}'.lower()
        if subject.startswith('a concrete fantasy roguelike inventory object'):
            errors.append('generic object subject fallback used')
        if palette in GENERIC_PALETTES and aid not in PALETTE_OVERRIDES:
            errors.append('generic object palette rotation used')
        if any(bad in combined for bad in ('square card', 'card fill', 'full-tile fill', 'medallion blob')) and 'no square card' not in combined:
            errors.append('object prompt contains card/blob risk wording')
        object_terms = ['gem', 'crystal', 'facets', 'amulet', 'pendant', 'chain', 'armor', 'mail', 'shirt', 'polearm', 'shaft', 'blade', 'weapon', 'bow', 'arrow', 'whip', 'boomerang', 'paper', 'parchment', 'scroll', 'spellbook', 'book', 'bag', 'bell', 'dagger', 'axe', 'trap', 'blindfold', 'banana', 'potion', 'vial', 'flask', 'bottle', 'ring', 'wand', 'smock', 'cloak', 'boots', 'helm', 'shield', 'gauntlets', 'scales', 'scale-pile', 'food', 'ration', 'lantern', 'horn', 'bugle', 'candelabrum', 'chest', 'tool']
        if not any(term in combined for term in object_terms):
            errors.append('missing concrete object-class silhouette terms')
        if aid not in SUBJECT_OVERRIDES and not class_subject_for_object(aid, (a.get('name') or aid.replace('-', ' ')).lower(), a.get('glyph')):
            errors.append('missing full-source object subject override or class template')
        return errors
    if subject.startswith('a concrete fantasy roguelike creature:'):
        errors.append('generic subject fallback used')
    if palette in GENERIC_PALETTES:
        errors.append('generic palette rotation used')
    anatomy_terms = [
        'body', 'torso', 'head', 'face', 'wings', 'wing', 'tail', 'limbs',
        'arms', 'hands', 'legs', 'feet', 'claws', 'beak', 'horn', 'horned',
        'skull', 'serpent', 'fish', 'reptile', 'humanoid', 'ooze', 'spirit',
        'demon', 'devil', 'rider', 'golem', 'elf', 'troll', 'snake', 'tentacle',
    ]
    material_terms = [
        'hide', 'skin', 'fur', 'feather', 'bone', 'skeletal', 'carapace',
        'armor', 'robe', 'cloth', 'leather', 'parchment', 'slime', 'ooze',
        'scale', 'scaled', 'scales', 'stone', 'metal', 'frost', 'fire',
        'flame', 'smoky', 'translucent', 'spirit', 'chitin',
    ]
    combined = f'{subject} {palette}'.lower()
    if not any(term in combined for term in anatomy_terms):
        errors.append('missing concrete species/anatomy/role terms')
    if not any(term in combined for term in material_terms):
        errors.append('missing material/texture guidance')
    if aid not in SUBJECT_OVERRIDES and not any(aid.endswith(suffix) for suffix, _ in FAMILY_SUBJECT_TEMPLATES):
        # Family templates are semantic enough for mummies/zombies/nagas; all
        # other full-source monsters should have explicit reviewed overrides.
        errors.append('missing full-source monster subject override')
    if aid not in PALETTE_OVERRIDES:
        errors.append('missing full-source monster palette override')
    return errors


def validate_dry_run_prompts(assets: list[dict]) -> None:
    failures = {a['id']: prompt_specificity_errors(a) for a in assets}
    failures = {aid: errs for aid, errs in failures.items() if errs}
    if failures:
        raise SystemExit('Dry-run prompt specificity guard failed: ' + json.dumps(failures, indent=2))


def alpha_stats(path: Path) -> dict:
    im = Image.open(path).convert('RGBA')
    a = im.getchannel('A')
    hist = a.histogram()
    edge = []
    w,h = im.size
    for x in range(w): edge += [a.getpixel((x,0)), a.getpixel((x,h-1))]
    for y in range(h): edge += [a.getpixel((0,y)), a.getpixel((w-1,y))]
    return {
        'size': [w,h], 'transparentPixels': sum(hist[:16]),
        'semiTransparentPixels': sum(hist[16:240]), 'opaquePixels': sum(hist[240:]),
        'opaqueEdgePixels': sum(v > 250 for v in edge),
        'nonTransparentRatio': round(sum(hist[1:])/(w*h), 4),
    }

def normalize_transparent(src: Path, dests: list[Path]) -> dict:
    im = Image.open(src).convert('RGBA')
    bbox = im.getchannel('A').getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((30,30), Image.Resampling.LANCZOS)
    can = Image.new('RGBA', (32,32), (0,0,0,0))
    can.alpha_composite(im, ((32-im.width)//2, (32-im.height)//2))
    rgb = ImageEnhance.Contrast(can.convert('RGB')).enhance(1.08)
    can = Image.merge('RGBA', (*rgb.split(), can.getchannel('A'))).filter(ImageFilter.UnsharpMask(radius=.5, percent=80, threshold=3))
    for d in dests:
        d.parent.mkdir(parents=True, exist_ok=True); can.save(d)
    return alpha_stats(dests[0])

def normalize_opaque(src: Path, dests: list[Path]) -> dict:
    im = Image.open(src).convert('RGBA').resize((32,32), Image.Resampling.LANCZOS)
    bg = Image.new('RGBA', (32,32), (0,0,0,255)); bg.alpha_composite(im)
    for d in dests:
        d.parent.mkdir(parents=True, exist_ok=True); bg.save(d)
    return alpha_stats(dests[0])

def install_paths(a: dict) -> tuple[Path, Path]:
    out = OUTPUT_DIR / a['categorySlug'] / f"{a['id']}.png"
    inst = ELECTRON_GENERATED_DIR / a['categorySlug'] / f"{a['id']}.png"
    return out, inst

def ensure_by_category(a: dict, inst: Path):
    link = BY_CATEGORY_DIR / a['categorySlug'] / f"{a['id']}.png"
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.exists() or link.is_symlink(): link.unlink()
    try:
        link.symlink_to(Path('..')/'..'/'generated'/a['categorySlug']/f"{a['id']}.png")
    except OSError:
        shutil.copy2(inst, link)

def tracker_rows(assets: list[dict], status: dict) -> list[dict]:
    rows=[]
    for a in assets:
        rec=status.get('assets',{}).get(a['id'], {})
        regen=rec.get('coherentRestartStatus') or ('generated' if rec.get('coherentRestartAt') else 'pending')
        qa=rec.get('coherentRestartQaStatus') or ('qa-reviewed' if rec.get('coherentRestartQaAt') else 'pending')
        rows.append({
            'id': a['id'], 'category': a.get('categorySlug') or a.get('category'),
            'workflow': 'transparent' if expected_transparent(a) else 'non-transparent',
            'generation': regen, 'qa': qa, 'notes': rec.get('coherentRestartNotes',''),
        })
    return rows

def write_tracker(path: Path, assets: list[dict], status: dict):
    rows=tracker_rows(assets,status)
    counts=Counter((r['workflow'], r['generation'], r['qa']) for r in rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    md=['# NetHack coherent full tileset regeneration tracker\n\n']
    md.append(f'- Updated: {now()}\n')
    md.append(f'- Asset count: {len(rows)}\n')
    md.append(f'- Transparent workflow: `{TRANSPARENT_WF.relative_to(ROOT)}` (canonical copy `{TRANSPARENT_WF_CANONICAL.relative_to(ROOT)}`)\n')
    md.append(f'- Non-transparent workflow: `{OPAQUE_WF.relative_to(ROOT)}`\n')
    md.append('- Prompt basis: `A concept pixel art image in the style of a fantasy game asset of [SUBJECT]`\n\n')
    md.append('## Counts\n\n')
    for key,val in sorted(counts.items()): md.append(f'- {key}: {val}\n')
    md.append('\n## Assets\n\n')
    md.append('| id | category | intended workflow | generation status | QA status | notes |\n')
    md.append('|---|---|---|---|---|---|\n')
    for r in rows:
        note=str(r['notes']).replace('|','\\|')
        md.append(f"| `{r['id']}` | {r['category']} | {r['workflow']} | {r['generation']} | {r['qa']} | {note} |\n")
    path.write_text(''.join(md))

def verify_rmbg_inputs() -> dict:
    found=[]
    for p in [TRANSPARENT_WF, TRANSPARENT_WF_CANONICAL]:
        wf=json.loads(p.read_text())
        for n in wf.get('nodes',[]):
            if n.get('type')=='RMBG':
                vals=n.get('widgets_values') or []
                found.append({'workflow': str(p.relative_to(ROOT)), 'node': n.get('id'), 'model': vals[0] if len(vals)>0 else None, 'background': vals[7] if len(vals)>7 else None})
    bad=[x for x in found if x.get('model')!='RMBG-2.0' or x.get('background')!='Alpha']
    if bad: raise SystemExit(f'RMBG workflow inputs invalid: {bad}')
    return {'rmbgNodes': found}

CURATED_ASSET_IDS = {'dog'}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--endpoint', default='http://127.0.0.1:8188')
    ap.add_argument('--tracker', default=str(ROOT/'asset-generation/manifests/full-regeneration-tracker.md'))
    ap.add_argument('--ids', help='comma-separated ids')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--replace-curated', action='store_true', help='allow replacing pinned curated assets; rerun their canonical curation/install workflow afterward')
    ap.add_argument('--init-tracker-only', action='store_true')
    ap.add_argument('--dry-run-prompts', action='store_true', help='print prompts for selected ids without contacting ComfyUI or writing outputs')
    ap.add_argument('--seed', type=int, default=440000)
    args=ap.parse_args()
    assets=load_assets(); status=load_status(); tracker=Path(args.tracker)
    if args.dry_run_prompts:
        wanted=assets
        if args.ids:
            ids={x.strip() for x in args.ids.split(',') if x.strip()}; wanted=[a for a in wanted if a['id'] in ids]
        if args.limit: wanted=wanted[:args.limit]
        validate_dry_run_prompts(wanted)
        print(json.dumps([{'id': a['id'], 'prompt': prompt_for(a)} for a in wanted], indent=2))
        return 0
    verify=verify_rmbg_inputs(); print(json.dumps(verify, indent=2))
    write_tracker(tracker, assets, status)
    if args.init_tracker_only:
        print(json.dumps({'tracker': str(tracker), 'assetCount': len(assets)}, indent=2)); return 0
    base.check_comfy(args.endpoint)
    wanted=assets
    if args.ids:
        ids={x.strip() for x in args.ids.split(',') if x.strip()}; wanted=[a for a in wanted if a['id'] in ids]
    if not args.force:
        wanted=[a for a in wanted if not status.get('assets',{}).get(a['id'],{}).get('coherentRestartAt')]
    if not args.replace_curated:
        preserved=[a['id'] for a in wanted if a['id'] in CURATED_ASSET_IDS]
        wanted=[a for a in wanted if a['id'] not in CURATED_ASSET_IDS]
        if preserved: print(json.dumps({'preservedCuratedAssets': preserved, 'reason': 'use --replace-curated only with visual re-approval and canonical postprocess'}), flush=True)
    if args.limit: wanted=wanted[:args.limit]
    run={'type':'coherent-full-tileset-restart','startedAt':now(),'transparentWorkflow':str(TRANSPARENT_WF.relative_to(ROOT)),'opaqueWorkflow':str(OPAQUE_WF.relative_to(ROOT)),'assetCountPlanned':len(wanted),'assets':[]}
    status.setdefault('runs',[]).append(run)
    for idx,a in enumerate(wanted):
        wf=workflow_for(a); label=workflow_label_for(a); prompt=prompt_for(a)
        base.WORKFLOW_PATH = wf
        asset=base.Asset(a['id'], a.get('name',a['id']), a.get('category',''), a['categorySlug'], a.get('priority',''), a.get('glyph',''), a.get('why',''), a.get('artDirection',''), a.get('renderingNotes',''), prompt)
        print(f"[{idx+1}/{len(wanted)}] generate {a['id']} via {wf.name}", flush=True)
        rec={**a, 'prompt': prompt, 'workflow': str(wf.relative_to(ROOT)), 'workflowLabel': label, 'status':'running', 'coherentRestartStatus':'running', 'coherentRestartStartedAt':now()}
        status.setdefault('assets',{})[a['id']]=rec; STATUS.write_text(json.dumps(status,indent=2)+'\n'); write_tracker(tracker, assets, status)
        try:
            raw=base.comfy_generate(args.endpoint, asset, seed=args.seed+idx)
            out,inst=install_paths(a)
            stats=normalize_transparent(raw,[out,inst]) if expected_transparent(a) else normalize_opaque(raw,[out,inst])
            ensure_by_category(a, inst)
            a.update({'prompt':prompt,'outputPath':str(out.relative_to(ROOT)),'installedPath':str(inst.relative_to(ROOT)),'status':'installed','workflow':str(wf.relative_to(ROOT)),'workflowLabel':label})
            alpha_pass = (stats['transparentPixels']>0 and stats['nonTransparentRatio']<0.72 and stats['opaqueEdgePixels']==0)
            qa_status='alpha-pass' if expected_transparent(a) and alpha_pass else ('needs-visual-review' if not expected_transparent(a) else 'needs-alpha-review')
            notes='alpha transparency passed; visual semantic review still required before qa-reviewed' if expected_transparent(a) and alpha_pass else ('opaque terrain/base tile generated; visual semantic review still required before qa-reviewed' if not expected_transparent(a) else 'alpha/card heuristic needs review; visual semantic review not complete')
            rec={**a,'completedAt':now(),'coherentRestartAt':now(),'coherentRestartStatus':'generated','coherentRestartQaStatus':qa_status,'coherentRestartQaAt':now(),'coherentRestartNotes':notes,'alphaStats':stats}
            status['assets'][a['id']]=rec; run['assets'].append({'id':a['id'],'qa':qa_status,'alphaStats':stats})
            EMAN.write_text(json.dumps({'version':1,'tileSize':32,'assets':assets},indent=2)+'\n')
            STATUS.write_text(json.dumps(status,indent=2)+'\n'); write_tracker(tracker, assets, status)
        except Exception as e:
            status['assets'][a['id']]={**rec,'status':'error','coherentRestartStatus':'backlog','coherentRestartQaStatus':'not-reviewed','coherentRestartNotes':f'generation error: {e}','failedAt':now()}
            STATUS.write_text(json.dumps(status,indent=2)+'\n'); write_tracker(tracker, assets, status)
            raise
    run['completedAt']=now(); STATUS.write_text(json.dumps(status,indent=2)+'\n'); write_tracker(tracker, assets, status)
    print(json.dumps({'tracker':str(tracker),'generated':len(run['assets'])}, indent=2))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
