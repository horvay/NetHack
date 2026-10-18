# Audit C: object tiles

Scope: 476 object tiles; contact sheets `sheet-01.png` to `sheet-10.png`. 121 flagged.

## Counts

| problem | count |
|---|---|
| wrong (wrong object or wrong class) | 61 |
| vector (flat placeholder art) | 17 |
| unclear | 17 |
| duplicate | 16 |
| inconsistent (matte, fringe, baked background, off-style) | 10 |
| **total** | **121** |

By severity: 48 high, 57 medium, 16 low.

## Worst 15

1. `ghoti`: an unidentified scroll label drawn as a fish (a pun on the word "ghoti").
2. `foobie-bletch`: unidentified scroll label drawn as a bomb.
3. `vas-corp-bet-mani`: unidentified scroll label drawn as a flat vector skull in a red capsule.
4. `abra-ka-dabra`: unidentified scroll label drawn as a spellbook. 14 more labels have the same problem.
5. `ring-class-icon`: the tile every unidentified ring uses. It looks like a gold blob with no ring hole.
6. `rock`: drawn as a faceted cut gem, and rocks are everywhere.
7. `whistle`: the tile every unidentified whistle uses. It's an unreadable gadget with a green fringe.
8. `corpse`: the fallback corpse is a jumble of brown shapes and skulls.
9. `cloak-of-displacement`: one of six cloaks that share identical crumpled-foil art.
10. `blindfold`: a flat 4-color black blob.
11. `bronze-plate-mail`: flat 8-color programmer art.
12. `crystal-plate-mail`: drawn as a gem.
13. `cancellation`: a wand drawn as a flat vector "no" sign.
14. `enchant-armor`: a scroll drawn as a flat blue rectangle with plus signs.
15. `elven-bow`: the space between bow and string is filled with green matte.

## What keeps going wrong

1. **About 45 tiles show the wrong kind of object.** The generator only had bare names like "knock", "stasis" or "fire resistance" and guessed the class, and the manifest's `glyph` field is often wrong too. So spellbooks became scrolls, wands, keys or stones; rings became potions or scrolls; wands became potions, a bubble, a door or a hammer; tools became scrolls; and `mail` (the scroll of mail) became chain armor. I checked every name against `include/objects.h`. Future prompts should take the class from there and name it.
2. **Unidentified scroll labels show the wrong things (16 tiles).** The resolver only checks a label's id and name for banned words, so all of these reach the map. Every label should be the same plain scroll, differing only in seal and ribbon color, and the regen prompts give each one its own pair. `read-me`, `temov` and `zlorfik` are already fine. `fnord` just needs its glow removed.
3. **Every flat vector tile comes from the "deterministic" or "targeted-followup" passes** (by `workflowLabel`). That covers blindfold, grappling-hook, credit-card, bronze-plate-mail, dart, enchant-armor, destroy-armor, cold, cancellation, crystal-ball, beartrap, magic-mapping, the two venom splashes, quarterstaff and shimmering-dragon-scales. They have under about 60 distinct colors at 32 px, where the painted tiles have 200 to 500.
4. **About 15 tiles have green matte fringe.** Examples:
   - elven-arrow and elven-bow
   - wand-of-magic-missile and wand-of-slow-monster
   - bell-of-opening, whistle, cornuthaum, elven-mithril-coat
   - can-of-grease, bugle, and the edges of several spellbooks

   Keying a green subject on green also eats its own green. For green-dominant subjects I set `"background": "magenta-key"` and the prompt asks for a magenta background. That is an addition to your schema.
5. **Duplicates that players can't tell apart:**
   - the six cloaks
   - five identified spellbooks (cause-fear, charm-monster, confuse-monster, create-familiar, flame-sphere)
   - `book-of-the-dead`, which matches the generic spellbook
   - c-ration, cram-ration and candy-bar
   - the three blue magic shields
   - the digging and drain-life wands

   The spellbook prompts give each spell its own cover color and emblem, since NetHack shuffles the vanilla book colors every game.
6. **Thin weapons are weak at 32 px.** Lance, yumi, stiletto, katana and the polearms fill only 8 to 13% of the tile. I flagged only lance and yumi, which nearly disappear.
7. **Two sharpness levels.** 257 tiles are 512 px sources that the Godot sync script crops and draws smoothed. The other 219 are crisp 32 px. Side by side, the 512 px set looks softer.
8. **Resolver and tile-map gaps** (not art, but they change what players see):
   - Names shared across classes (light, identify, levitation, protection, sleep, polymorph, and more) map to a single tile. Class-qualified names like "ring of levitation" have no mapping, so an identified ring of levitation may show the potion art. This needs checking against what the bridge actually sends.
   - There is no "gray stone" tile, so unidentified gray stones fall back to the sparkly gem class icon.
   - Unidentified potions, rings, wands, amulets and gems have no art per appearance. A "ruby potion" and an "oak wand" each show only their class icon.
