"""The game's music: every track MiniMax Music 3 writes for it.

Captions follow MiniMax's own Structured Caption layout (the templates of
its music-caption-rewriter skill, github.com/MiniMax-AI/MiniMax-Music3):
Global Metadata / Vocal Details / Arrangement, with the genre named from one
of its style families. Two families suit the game: Cinematic Orchestral and
Traditional / Celtic Folk.

Rules (2026-10-19; the first round sang in 60 of 75 takes):
  - describe only what plays: never "no vocals", "no drums"... (naming a
    thing pulls it into the music);
  - instrumental is said MiniMax's way, under Vocal Details: "The piece is
    instrumental. <instrument> carries the lead melodic role.";
  - lyrics are bare section tags; the piece ends when they run out.

A track has one or more styles; take n uses style (n - 1) % len, so a
four-take theme with two styles gets two of each.

kind:
  theme    an area or room theme; plays whole, then another take follows; a
           new level with the same theme switches take
  stinger  a short cue (level up, prayer...); cut to its first seconds
  piece    a menu or ending piece, played once (title, death, ascension)
"""

ORCHESTRAL = "Cinematic Orchestral"
CELTIC = "Traditional Folk"
GAME = "music for a fantasy video game played for hours, sitting beneath footsteps and sound effects"


def style(genre, mood, scene, sonics, lead, primary, secondary, groove, textures):
    return {"genre": genre, "mood": mood, "scene": scene, "sonics": sonics, "lead": lead,
            "primary": primary, "secondary": secondary, "groove": groove, "textures": textures}


def caption(t, take=1):
    s = t["styles"][(take - 1) % len(t["styles"])]
    return f"""Global Metadata
Basic Attributes: bpm is {t['bpm']}. key is {t['key']}, and scale is {t['scale']}. {s['genre']}.
Global Emotional Progression: {s['mood']}
Application Scenarios & Imagery: {s['scene']}
Sonics & Production Profile: {s['sonics']}
Vocal Details
The piece is instrumental. {s['lead']}
Arrangement
Instrument Lifecycle Description (Primary/Secondary Layering):
Primary: {s['primary']}
Secondary: {s['secondary']}
Groove & Foundation Progression: {s['groove']}
Embellishments, Textures & Spatial FX: {s['textures']}
"""


THEME_TAGS = ["intro", "instrumental", "solo", "instrumental", "bridge", "instrumental", "solo", "instrumental", "outro"]
PIECE_TAGS = ["intro", "instrumental", "solo", "bridge", "instrumental", "outro"]
STINGER_TAGS = ["intro", "outro"]


def lyrics(t):
    return "\n\n".join(f"[{tag}]" for tag in t["tags"]) + "\n"


def theme(id, bpm, key, scale, *styles, takes=2, kind="theme", seconds=180, tags=THEME_TAGS):
    return {"id": id, "kind": kind, "takes": takes, "seconds": seconds, "bpm": bpm, "key": key, "scale": scale,
            "styles": list(styles), "tags": tags}


# --- Style builders -----------------------------------------------------------

HALL = "A wide, dark orchestral soundstage with a long stone-hall reverb. Warm lows and soft mids, gentle highs far in the background, and a narrow, soft dynamic range that stays steady from start to end."
STONE = "An intimate, woody acoustic sound inside a large, dark stone reverb. Warm lower mids, soft airy highs, and a narrow, gentle dynamic range that stays calm from start to end."


def orch_calm(subgenre, mood, place, lead, primary, secondary, textures, sonics=HALL):
    return style(f"{ORCHESTRAL} / {subgenre}", mood, f"Exploration {GAME}: {place}", sonics, lead, primary, secondary,
                 "The track is rubato and pulseless at first, carried by slow bowing. A deep, soft orchestral bass drum marks a distant heartbeat every few bars in the middle sections, then falls away for the outro.",
                 textures)


def orch_tense(subgenre, mood, place, lead, primary, secondary, drums, textures):
    return style(f"{ORCHESTRAL} / {subgenre}", mood, f"Battle {GAME}: {place}",
                 "A wide, dark orchestral soundstage with a stone-hall reverb. Weighty lows and a tight, driving low end, with a moderate dynamic range that stays steadily urgent.",
                 lead, primary, secondary,
                 f"{drums} keep a steady, driving pulse from the first bar, with a low string ostinato locked to them. The pulse thins out for a few bars in the bridge, then returns and drives to a sudden, unresolved stop.",
                 textures)


def celtic_calm(subgenre, mood, place, lead, primary, secondary, textures, sonics=STONE):
    return style(f"{CELTIC} / {subgenre}", mood, f"Exploration {GAME}: {place}", sonics, lead, primary, secondary,
                 "The track begins free and pulseless over a low drone. A soft bodhrán enters in the middle sections with a slow, steady heartbeat pattern, then drops out before the outro.",
                 textures)


def celtic_tense(subgenre, mood, place, lead, primary, secondary, textures):
    return style(f"{CELTIC} / {subgenre}", mood, f"Battle {GAME}: {place}",
                 "A close, woody acoustic sound in a dark stone reverb, the bodhrán and low strings forward, a moderate dynamic range that stays urgent.",
                 lead, primary, secondary,
                 "A driving bodhrán and frame drum keep a fast, steady pulse from the first bar under a rhythmic fiddle drone. The drums thin out in the bridge, then return and drive to an abrupt stop.",
                 textures)


# --- Area themes ----------------------------------------------------------------

DUNGEON_PLACE = "a lone adventurer walking torchlit corridors and crypts of an old dungeon deep beneath the earth."

dungeon_orch = orch_calm("Dark Fantasy Soundtrack",
    "The piece opens with a lonely, watchful stillness in the low strings that establishes a sense of ancient stone and deep shadow. A slow, sorrowful melody emerges and returns several times, each time with a little more weight, carrying a quiet, held dread. It settles back into the same hushed darkness it began with, unresolved.",
    DUNGEON_PLACE, "A solo cello carries the lead melodic role throughout, answered by a low French horn.",
    "A solo cello plays the slow, sorrowful main melody from the intro to the outro, legato and close.",
    "Divided low strings (violas, cellos and double basses) hold long sustained chords beneath it. A soft French horn answers the cello's phrases in the middle sections. A harp adds sparse, low arpeggios that ring into the reverb.",
    "High violins hold a faint tremolo shimmer far in the background. Low string swells rise and fall like breathing between phrases, and the final chord decays into the long hall reverb.")

dungeon_celtic = celtic_calm("Dark Celtic Folk",
    "The piece opens with a solitary, ancient melancholy, a lone melody over a low drone. It slowly gathers a little warmth and motion as more instruments join, a wary, wandering feeling, then thins back to the lone melody and drone, ending in quiet unease.",
    "an adventurer wandering the torchlit stone halls of an old dungeon beneath a ruined keep.",
    "A Celtic harp carries the lead melodic role, with a low whistle taking the melody in the middle sections.",
    "A Celtic harp plays modal arpeggios and the main melody from the intro to the outro, each note ringing into the reverb.",
    "A low whistle takes over the melody in the middle sections, slow and mournful. A bowed fiddle holds long low notes beneath it. A bagpipe-like drone sustains a single low note throughout.",
    "Distant wind through stone halls in the quiet passages. The harp's low strings resonate long into the reverb, and the drone fades last.")

DUNGEON_FIGHT = "monsters close in around the hero in a torchlit dungeon; grim, desperate danger."

TRACKS = [
    theme("dungeon-calm", 68, "D", "minor", dungeon_orch, dungeon_celtic, takes=4),
    theme("dungeon-tense", 96, "D", "minor",
          orch_tense("Dark Fantasy Battle Soundtrack",
                     "The piece starts uneasy and stays tense, a fight in a dark room. The urgency tightens in waves, grim and desperate, and it ends cut off, unresolved.",
                     DUNGEON_FIGHT, "A low cello section carries the lead melodic role with a tense, rising figure.",
                     "Staccato low strings play a driving ostinato from the first bar; the cellos lay a tense, rising melody over it.",
                     "Low French horns punch short, dark accents. Violins add tremolo tension in the middle sections.",
                     "Low taiko-style drums and an orchestral bass drum",
                     "Short string swells push into each new phrase. Metallic scrapes and low rumbles fill the gaps in the bridge."),
          celtic_tense("Dark Celtic Battle Folk",
                       "The piece is urgent and rough from the start, a scramble in the dark. The tension rises in waves and ends abruptly, unresolved.",
                       DUNGEON_FIGHT, "A fiddle carries the lead melodic role with a fast, tense reel-like figure.",
                       "A fiddle plays a fast, minor-key reel figure from the first bar, sharp and urgent.",
                       "A bouzouki strums driving, percussive chords. A low whistle doubles the fiddle in the middle sections. A low drone holds beneath.",
                       "The bouzouki's muted strums tighten in the bridge, and the drone swells before the final stop.")),
    theme("depths-calm", 60, "C", "minor",
          orch_calm("Dark Ambient Soundtrack",
                    "The piece opens in near-darkness, heavier and colder than the upper dungeon. A slow, grave melody surfaces from the low strings and sinks back again, a weight that never lifts. It ends as it began, in deep, still shadow.",
                    "deep in the dungeon, far from daylight, where the corridors grow older and stranger.",
                    "A low bowed double bass and a muted horn share the lead melodic role.",
                    "A bowed double bass and a muted French horn trade a slow, grave melody from the intro to the outro.",
                    "Cluster chords in the low strings hold beneath them. A contrabassoon doubles the bass line in the middle sections. A harp plucks rare low notes.",
                    "A low string tremolo swells and fades like distant movement. Deep, soft rumbles under the quiet passages, and a long dark reverb tail."),
          celtic_calm("Dark Traditional Folk",
                      "The piece opens cold and sparse, a lonely melody over a deep drone. It grows a little darker and heavier in the middle, then thins back to the drone, ending in deep unease.",
                      "the deepest halls of the dungeon, where the torchlight barely reaches.",
                      "A low whistle carries the lead melodic role, slow and mournful.",
                      "A low whistle plays a slow, mournful modal melody from the intro to the outro.",
                      "A bowed fiddle holds long low notes. Uilleann-pipe-like drones sustain a deep chord. A harp plucks sparse, low notes in the middle sections.",
                      "Wind through deep caverns, water dripping in the distance, and a long dark reverb."),
          takes=4),
    theme("depths-tense", 100, "C", "minor",
          orch_tense("Dark Orchestral Battle Soundtrack",
                     "The piece is grim and urgent from the first bar, then relentless, a fight for survival deep underground. It never resolves.",
                     "powerful monsters fight the hero deep in the dungeon.",
                     "Low brass carries the lead melodic role with grim, heavy phrases.",
                     "Low strings play a driving col legno and spiccato ostinato; low brass state a grim, heavy melody over it.",
                     "Horns swell into dark chords. Violins add tense tremolo lines in the middle sections.",
                     "Deep taiko-style drums",
                     "Heavy low string swells and brass rips mark each new phrase."),
          takes=2),
    theme("mines-calm", 76, "A", "minor",
          celtic_calm("Dark Celtic Folk",
                      "The piece is earthy and a little playful, with a wary edge underneath. It wanders and lilts gently in shadowed tones, and settles back into quiet watchfulness.",
                      "twisting mine tunnels dug by gnomes and dwarves, lanterns and pickaxes in the dark.",
                      "A hammered dulcimer carries the lead melodic role, with a tin whistle answering.",
                      "A hammered dulcimer plays a lilting modal melody from the intro to the outro, single notes echoing like dripping water.",
                      "A tin whistle answers the dulcimer's phrases in the middle sections. A bouzouki adds soft, rolling chords. A low bowed viola holds a drone.",
                      "Distant pickaxe-like taps far back in the reverb, and the drip-like dulcimer notes ringing into a close cave echo.",
                      sonics="A close, woody sound in a dry cave reverb. Warm lower mids, soft highs, and a narrow, gentle dynamic range."),
          orch_calm("Dark Fantasy Soundtrack",
                    "The piece is curious and earthy, a cautious walk through tunnels. A playful, wary motif in the low woodwinds wanders over soft strings, and it ends quietly watchful.",
                    "twisting mine tunnels dug by gnomes and dwarves, lanterns and pickaxes in the dark.",
                    "A bassoon carries the lead melodic role, answered by pizzicato strings.",
                    "A bassoon plays a wandering, slightly playful minor melody from the intro to the outro.",
                    "Pizzicato low strings walk beneath it. A clarinet answers in the middle sections. Soft sustained violas hold the harmony.",
                    "A xylophone-like tap echoes far back like tools on stone, and a close cave reverb."),
          takes=4),
    theme("mines-tense", 104, "A", "minor",
          celtic_tense("Dark Celtic Battle Folk",
                       "The piece is urgent and rough from the start, a scramble in the tunnels. It drives hard and ends abruptly.",
                       "gnomes and dwarves with pickaxes swarm the hero in the mines.",
                       "A fiddle carries the lead melodic role with a fast, driving reel.",
                       "A fiddle plays a fast, driving minor reel from the first bar.",
                       "Hand drums and a bouzouki chop percussive chords. A low whistle doubles the reel in the middle sections.",
                       "Close cave echo on the drums, the reel tightening into the abrupt final stop."),
          takes=2),
    theme("minetown", 84, "G", "major",
          celtic_calm("Celtic Folk / Village Tune",
                      "The piece is warm and safe, a rest after the dark tunnels. It lilts gently and stays relaxed and friendly from start to end.",
                      "a little underground town inside the mines: a temple, shops, lamplight and gnomes going about their business.",
                      "A lute-like cittern carries the lead melodic role, with a recorder answering.",
                      "A cittern plays a gentle, lilting dance melody from the intro to the outro.",
                      "A recorder answers its phrases. A soft hand drum keeps a relaxed beat far back. A fiddle adds warm long notes in the middle sections.",
                      "Warm, close room sound and soft lamplit ambience.",
                      sonics="A warm, close room sound. Gentle lows, soft highs, and a narrow, relaxed dynamic range.")),
    theme("sokoban", 72, "E", "minor",
          style(f"{ORCHESTRAL} / Chamber Puzzle Music",
                "The piece is thoughtful and patient, a little mysterious, and stays steady from start to end, like gears slowly turning.",
                f"Puzzle {GAME}: a tower of puzzle rooms where the hero pushes heavy boulders into holes.",
                "A clear, intimate small room. Very narrow dynamic range, close and dry.",
                "A celesta carries the lead melodic role, with a harp answering.",
                "A celesta plays a repeating, music-box-like minor melody from the intro to the outro.",
                "Pizzicato strings play a steady, interlocking pattern. A harp answers the celesta's phrases. A clarinet holds soft long notes in the middle sections.",
                "The pizzicato pattern keeps a light, steady pulse throughout, like a clock.",
                "Delicate ticking textures and a short, clear room echo.")),
    theme("oracle", 60, "F", "major",
          style(f"{ORCHESTRAL} / Ethereal Ambient Soundtrack",
                "The piece is calm, otherworldly and reverent. It floats freely from start to end.",
                f"Exploration {GAME}: the Oracle's hall, fountains and statues of centaurs, a wise woman who sees the future.",
                "A very wide, airy soundstage with a long shimmering reverb, soft and gentle throughout.",
                "A harp carries the lead melodic role, with strings in high harmonics around it.",
                "A harp plays slow, flowing arpeggios and a serene melody from the intro to the outro.",
                "Strings hold soft high harmonics. A glass harmonica adds shimmering long tones in the middle sections. A flute answers the harp once or twice.",
                "The track floats freely, carried by the harp's flowing arpeggios.",
                "Flowing water textures from the fountains and a long, shimmering reverb tail.")),
    theme("bigroom", 70, "B", "minor",
          orch_calm("Dark Fantasy Soundtrack",
                    "The piece is exposed and uneasy, a huge open hall where anything can see you. The tension stays held, never released.",
                    "one enormous lit hall full of monsters.",
                    "Low French horns carry the lead melodic role.",
                    "Low French horns play a slow, uneasy melody from the intro to the outro.",
                    "Slow tremolo strings hold wide, open chords. Timpani rolls swell softly in the middle sections.",
                    "Huge open reverb and a wide stereo spread, like a vast hall.")),
    theme("ludios", 70, "Bb", "minor",
          orch_calm("Dark Fantasy Soundtrack",
                    "The piece is cold, guarded and rich, the treasury of a fortress. It stays watchful and stately.",
                    "a hidden fortress full of soldiers and a dragon guarding gold.",
                    "Muted low brass carries the lead melodic role.",
                    "Muted trombones and horns play a stately, guarded melody from the intro to the outro.",
                    "Low strings hold dark chords. A snare drum plays a soft military roll far back in the middle sections.",
                    "Glinting celesta notes like gold in the dark, and a cold hall reverb.")),
    theme("medusa", 62, "Db", "minor",
          orch_calm("Dark Ambient Soundtrack",
                    "The piece is still, watery and menacing; something terrible waits across the water. The menace stays quiet and never breaks.",
                    "an island surrounded by deep water where Medusa's gaze turns heroes to stone.",
                    "A glass harmonica carries the lead melodic role, eerie and pure.",
                    "A glass harmonica plays an eerie, slow melody from the intro to the outro.",
                    "Low strings hold slow, rolling chords like waves. A harp plucks rare, cold notes.",
                    "Slow rolling water textures and a wide, wet, underwater-like reverb.",
                    sonics="A wide and wet soundstage with a long underwater-like reverb, soft and still throughout.")),
    theme("castle", 66, "G", "minor",
          orch_calm("Gothic Orchestral Soundtrack",
                    "The piece is grand, cold and foreboding, stately and grim, the last fortress before hell.",
                    "a great castle behind a moat and drawbridge, full of soldiers.",
                    "A pipe organ carries the lead melodic role, soft and grave.",
                    "A pipe organ plays a grave, stately melody from the intro to the outro, soft registration.",
                    "Low strings and slow muted horns hold dark chords beneath it. Timpani roll softly in the middle sections.",
                    "A cold, cathedral-sized stone reverb and a long final organ chord.")),
    theme("gehennom-calm", 54, "Eb", "minor",
          orch_calm("Dark Ambient Soundtrack",
                    "The piece is oppressive, hot and hopeless, a slow dread that never lifts. It grows heavier in the middle and sinks back into the same darkness.",
                    "the maze-like underworld of Gehennom, fire and brimstone.",
                    "A low cello carries the lead melodic role, harsh and grave.",
                    "A low cello plays a grave, harsh melody from the intro to the outro, with a rough, heavy bow.",
                    "Deep drones from contrabassoons and double basses hold beneath it. Low trombones swell in the middle sections.",
                    "Metallic scrapes far away, a distant rumble like fire, and a huge dark reverb.",
                    sonics="A huge, dark, distant reverb. Low rumbling lows kept soft, and a narrow dynamic range."),
          takes=4),
    theme("gehennom-tense", 100, "Eb", "minor",
          orch_tense("Dark Orchestral Battle Soundtrack",
                     "The piece is furious and doomed from the first bar, a fight against demons that never relents.",
                     "demons attack the hero in the underworld.",
                     "Low brass carries the lead melodic role with furious, heavy phrases.",
                     "Low strings hammer a driving ostinato; low brass blare a furious, doomed melody over it.",
                     "Horns and trombones swell into dissonant chords. Violins add frantic tremolo in the middle sections.",
                     "Huge low drums and metallic hits",
                     "Metallic impacts, dark brass rips, and a deep rumbling low end."),
          takes=2),
    theme("wizard-tower", 60, "F#", "minor",
          orch_calm("Dark Fantasy Soundtrack",
                    "The piece is arcane and sinister, a sense of being watched by something ancient. It never resolves.",
                    "the tower of the Wizard of Yendor, deep in hell.",
                    "A celesta and a bowed vibraphone share the lead melodic role.",
                    "A low celesta plays a sinister, slow melody from the intro to the outro, doubled by a bowed vibraphone.",
                    "Low strings hold dark, sliding chords. A bass clarinet answers in the middle sections.",
                    "Strange shimmering textures, reversed swells, and a long dark reverb.")),
    theme("vlad", 58, "C#", "minor",
          orch_calm("Gothic Chamber Music",
                    "The piece is aristocratic, cold and vampiric, elegant and menacing from start to end.",
                    "Vlad's Tower, the vampire lord's crypt-like keep.",
                    "A solo violin carries the lead melodic role over a harpsichord.",
                    "A solo violin plays a cold, elegant melody from the intro to the outro.",
                    "A harpsichord plays slow, stately chords. Low strings hold dark harmony beneath.",
                    "A cold, stone crypt reverb.")),
    theme("planes", 70, "E", "minor",
          orch_calm("Epic Ambient Soundtrack",
                    "The piece is vast and elemental, awe and danger together. It swells slowly and recedes.",
                    "the elemental planes of earth, air, fire and water at the end of the game.",
                    "High strings carry the lead melodic role, in long, soaring lines.",
                    "High strings play a long, soaring melody from the intro to the outro.",
                    "Deep brass pads hold wide chords. Timpani rolls rise and fall in the middle sections. A harp adds shimmering arpeggios.",
                    "Shimmering textures, wind and fire-like swells, and an enormous, airy reverb.",
                    sonics="An enormous, airy soundstage with a long reverb, a moderate dynamic range.")),
    theme("astral", 64, "C", "major",
          orch_calm("Sacred Orchestral Soundtrack",
                    "The piece is holy and immense, the last trial before the gods. It grows in awe and stays reverent.",
                    "the Astral Plane, three high altars and the gods watching.",
                    "A soft pipe organ carries the lead melodic role, with high strings above it.",
                    "A soft pipe organ plays a slow, holy melody from the intro to the outro.",
                    "High strings hold luminous chords. Tubular bells ring softly in the middle sections.",
                    "A cathedral-sized reverb, bright but soft.",
                    sonics="A cathedral-sized reverb, bright but soft, with a moderate dynamic range.")),
    # The quest homeland: one theme per role, in that role's colour.
    *[theme(f"quest-{role}", bpm, key, scale,
            (orch_calm if family == ORCHESTRAL else celtic_calm)(
                sub, "The piece is purposeful and solemn: home, but home has been betrayed and must be saved. It grows in resolve and ends quiet and steady.",
                f"the {name}'s quest homeland and the road to the quest nemesis.",
                f"{lead[0].upper()}{lead[1:]} carries the lead melodic role.",
                f"{lead[0].upper()}{lead[1:]} plays a solemn, purposeful melody from the intro to the outro.",
                f"{layer[0].upper()}{layer[1:]}.", "A long reverb and a soft final decay."),
            takes=1)
      for role, name, bpm, key, scale, family, sub, lead, layer in [
          ("arc", "Archeologist", 74, "D", "minor", ORCHESTRAL, "Adventure Film Soundtrack", "a duduk", "low strings and a frame drum far back hold the harmony"),
          ("bar", "Barbarian", 70, "E", "minor", CELTIC, "Nordic Folk", "a bowed lyre", "deep drones and a slow, distant drum hold beneath it"),
          ("cav", "Caveman", 62, "A", "minor", CELTIC, "Primal Traditional Folk", "a wooden flute", "a didgeridoo-like drone and stones tapped far back hold beneath it"),
          ("hea", "Healer", 64, "F", "major", CELTIC, "Celtic Folk Ballad", "a Celtic harp", "soft strings and a recorder answer it"),
          ("kni", "Knight", 68, "Bb", "major", ORCHESTRAL, "Chivalric Soundtrack", "a solo French horn", "noble low strings hold the harmony beneath it"),
          ("mon", "Monk", 58, "D", "minor", CELTIC, "Japanese Traditional Folk", "a shakuhachi", "a low temple bowl drone and a soft koto answer it"),
          ("pri", "Priest", 56, "G", "major", ORCHESTRAL, "Sacred Chamber Music", "a soft pipe organ", "low strings hold the harmony beneath it"),
          ("ran", "Ranger", 72, "E", "minor", CELTIC, "Forest Celtic Folk", "a wooden flute", "a plucked cittern and soft strings answer it"),
          ("rog", "Rogue", 80, "C", "minor", ORCHESTRAL, "Sly Chamber Music", "a clarinet over pizzicato strings", "a bass clarinet and pizzicato basses sneak beneath it"),
          ("sam", "Samurai", 62, "D", "minor", CELTIC, "Japanese Traditional Folk", "a koto", "a shakuhachi and a low drone answer it"),
          ("tou", "Tourist", 88, "F", "major", CELTIC, "Mediterranean Folk", "a mandolin", "a soft accordion answers it"),
          ("val", "Valkyrie", 66, "D", "minor", CELTIC, "Nordic Folk", "a hardanger fiddle", "a low drone and a soft horn far back hold beneath it"),
          ("wiz", "Wizard", 64, "F#", "minor", ORCHESTRAL, "Arcane Fantasy Soundtrack", "a celesta", "a soft harp and low strings answer it"),
      ]],
    # --- Rooms -------------------------------------------------------------------
    theme("shop", 92, "F", "major",
          celtic_calm("Celtic Folk / Tavern Tune",
                      "The piece is friendly and a little sly, welcoming customers. It stays light and easy from start to end.",
                      "a cosy shop in the dungeon, the shopkeeper watching every item.",
                      "A tin whistle carries the lead melodic role over a cittern.",
                      "A tin whistle plays a light, jaunty jig melody from the intro to the outro.",
                      "A cittern strums gentle chords. A fiddle answers in the middle sections. A soft tambourine taps far back.",
                      "A warm, close room sound.",
                      sonics="A close, warm, small room. Gentle lows, soft highs, a narrow dynamic range.")),
    theme("temple", 56, "D", "major",
          orch_calm("Sacred Orchestral Soundtrack",
                    "The piece is peaceful and holy, a sanctuary. It stays calm and reverent from start to end.",
                    "a small temple with an altar and a priest.",
                    "A soft pipe organ carries the lead melodic role.",
                    "A soft pipe organ plays a slow, peaceful hymn-like melody from the intro to the outro.",
                    "Soft high strings hold luminous chords. A harp adds gentle arpeggios in the middle sections.",
                    "A stone chapel reverb, soft and warm.",
                    sonics="A stone chapel reverb, soft and warm, very narrow dynamic range.")),
    theme("throne", 66, "Bb", "major",
          orch_calm("Baroque Chamber Music",
                    "The piece is stately and proud, a little decadent and dangerous.",
                    "a throne room full of a monster king's court.",
                    "A harpsichord carries the lead melodic role.",
                    "A harpsichord plays a stately, ornamented courtly melody from the intro to the outro.",
                    "Low strings and soft muted horns hold the harmony beneath it.",
                    "A grand hall reverb.")),
    # --- Menus and endings ---------------------------------------------------
    theme("title", 70, "D", "minor",
          style(f"{ORCHESTRAL} / Epic Fantasy Soundtrack",
                "The piece opens mysterious and quiet, grows into a hopeful, adventurous theme in the middle, and settles back into mystery.",
                "The title screen of a dungeon-crawling fantasy video game: a hero about to descend.",
                "A wide, warm orchestral hall with a moderate dynamic range.",
                "A solo French horn carries the lead melodic role, taken up by the strings.",
                "A solo French horn states the main theme in the intro; the full strings take it up in the middle and hand it back for the outro.",
                "A harp plays flowing arpeggios. Woodwinds answer the theme. Timpani and low brass swell under the middle section.",
                "The track begins pulseless; a gentle, march-like pulse from timpani and low strings carries the middle section, then fades.",
                "A warm hall reverb and a long final chord."),
          kind="piece", seconds=150, tags=PIECE_TAGS),
    theme("death", 52, "A", "minor",
          style(f"{ORCHESTRAL} / Elegy",
                "The piece is sad and final, a quiet lament for a fallen hero, and ends in peace.",
                "The tombstone after the hero of a fantasy video game dies.",
                "An intimate, soft hall, a narrow dynamic range.",
                "A solo cello carries the lead melodic role.",
                "A solo cello plays a slow, sorrowful lament from the intro to the outro.",
                "Soft low strings hold the harmony beneath it. A harp plays a few final notes.",
                "The track is rubato and pulseless throughout.",
                "A soft, long reverb and a final chord fading to silence."),
          kind="piece", seconds=120, tags=PIECE_TAGS),
    theme("ascension", 72, "C", "major",
          style(f"{ORCHESTRAL} / Triumphant Finale",
                "The piece grows from awe into full glory as the hero becomes a demigod, and ends radiant.",
                "The hero of a fantasy video game offers the Amulet and ascends to godhood.",
                "A cathedral-sized, bright and wide soundstage with a wide dynamic range.",
                "A French horn section carries the lead melodic role, with the full orchestra.",
                "French horns play a noble, triumphant theme that the full orchestra takes up.",
                "Strings, organ and tubular bells swell beneath. Trumpets crown the final section.",
                "Timpani and orchestral percussion build a stately pulse to the climax.",
                "Bells ringing into a vast reverb and a long radiant final chord."),
          kind="piece", seconds=150, tags=PIECE_TAGS),
]


# --- Stingers --------------------------------------------------------------------

def stinger(id, bpm, key, scale, what, lead, instruments, cut):
    """cut: how many seconds of the start the game keeps."""
    return {"id": id, "kind": "stinger", "takes": 2, "seconds": 30, "cut": cut, "bpm": bpm, "key": key, "scale": scale,
            "tags": STINGER_TAGS,
            "styles": [style(f"{ORCHESTRAL} / Fantasy Game Cue", f"{what} It is over almost at once, then rings out.",
                             "A short musical cue in a fantasy video game, a few seconds long.",
                             "Close and clear, with a short reverb tail.", f"{lead} carries the lead melodic role.",
                             f"{instruments} play the whole cue in the first five seconds.",
                             "The cue rings out into a natural decay.", "A single gesture, out of time.",
                             "A short, clean reverb tail.")]}


TRACKS += [
    stinger("sting-levelup", 120, "C", "major", "A short, bright rising flourish of success.", "A horn", "A harp glissando and a soft horn call", 4.5),
    stinger("sting-artifact", 80, "E", "major", "A shimmering, wondrous discovery.", "A celesta", "Bells, celesta and a high string chord", 5),
    stinger("sting-prayer", 60, "F", "major", "A warm, holy answer from above.", "An organ", "A soft organ chord with high strings and a harp", 6),
    stinger("sting-branch", 70, "D", "minor", "Entering somewhere new and unknown.", "A low horn", "A low horn and a deep gong", 6),
    stinger("sting-death", 50, "A", "minor", "A heavy, falling chord of doom.", "Low strings", "Low strings and a deep bell", 7),
    stinger("sting-ascend", 90, "C", "major", "A radiant, swelling chord of glory.", "Trumpets", "A full orchestra and bells", 9),
]

BY_ID = {t["id"]: t for t in TRACKS}
