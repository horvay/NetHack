"""The game's music: every track MiniMax Music 3 writes for it.

Each track is a structured caption in the format Music 3 was trained on
(Global Metadata / Vocal Details / Arrangement; the genre in the Basic
Attributes line) plus bare section tags as lyrics. All instrumental.

kind:
  theme    an area or room theme; plays whole, then crossfades into another
           take, so several takes make a varied playlist
  stinger  a short cue (level up, prayer...); cut to its first seconds
  piece    a menu or ending piece, played once (title, death, ascension)
"""

# Things no track should have unless it says otherwise.
NEVER = "No vocals, no choir singing words, no spoken word, no vinyl crackle, no tape hiss, no radio effects, no electronic dance beats, no synth bass drops, no rock drum kit, no electric guitar"
CALM_NEVER = NEVER + ", no drums, no percussion kit, no timpani hits, no cymbal crashes, no brass stabs, no heroic fanfare"


def caption(t):
    sections = "\n".join(f"{name.capitalize()}: {text}" for name, text in t["sections"])
    return f"""Global Metadata
Basic Attributes: bpm is {t['bpm']}. key is {t['key']}, and scale is {t['scale']}. {t['genre']}. Fully instrumental.
Global Emotional Progression: {t['mood']}
Application Scenarios & Imagery: {t['scene']}
Sonics & Production Profile: {t['sonics']} {t.get('never', CALM_NEVER)}.

Vocal Details
Fully instrumental. There is no singer, no spoken word, no choir singing words, no humming. {t['lead']}

Arrangement
Instrument Lifecycle Description (Primary/Secondary Layering):
Primary: {t['primary']}
Secondary: {t['secondary']}
Groove & Foundation Progression: {t['groove']}
{sections}
"""


def lyrics(t):
    return "\n\n".join(f"[{name}]" for name, _ in t["sections"]) + "\n"


def bare(x):
    """ "a plucked dulcimer" -> "plucked dulcimer" (for "the ...")."""
    for article in ("a ", "an "):
        if x.startswith(article):
            return x[len(article):]
    return x


def cap(x):
    return x[0].upper() + x[1:]


def calm_sections(lead, layer):
    lead, layer = bare(lead), cap(layer)
    return [
        ("intro", f"The {lead} alone, sparse, lots of space. A short opening, not a sting."),
        ("instrumental", f"{layer} enters quietly under the {lead}. No pulse from drums."),
        ("solo", f"The {lead} takes a longer, wandering melody. Nothing swells."),
        ("instrumental", f"{layer} holds a low bed. The {lead} answers between phrases."),
        ("bridge", f"Drop almost to silence: the {lead} alone, low and slow."),
        ("instrumental", f"{layer} returns at the same low level. Same motifs, nothing new."),
        ("outro", f"{layer} leaves first, the {lead} repeats the opening figure into a long decay."),
    ]


def tense_sections(lead, layer):
    lead = bare(lead)
    return [
        ("intro", f"Low drums and {layer} start at once, already uneasy. Very short."),
        ("instrumental", f"A driving ostinato in {layer}; low frame drums keep a steady pulse."),
        ("solo", f"The {lead} plays a tense, rising figure over the ostinato."),
        ("instrumental", f"The ostinato tightens; drums a little louder, still not a climax."),
        ("bridge", f"Drums drop out, {layer} hold one dissonant note, then the pulse returns."),
        ("instrumental", f"Ostinato and drums together, steady and relentless."),
        ("outro", f"The pulse thins out and stops on a low unresolved note."),
    ]


def theme(id, takes=2, **t):
    t.setdefault("seconds", 150)
    return {"id": id, "kind": "theme", "takes": takes, **t}


def calm(id, bpm, key, scale, genre, mood, scene, sonics, lead, layer, extra="", takes=2):
    return theme(id, takes, bpm=bpm, key=key, scale=scale, genre=genre, mood=mood, scene=scene, sonics=sonics,
                 lead=f"{lead[0].upper()}{lead[1:]} carries the melody.",
                 primary=f"{lead[0].upper()}{lead[1:]} from the first note to the last decay. {extra}".strip(),
                 secondary=f"{layer[0].upper()}{layer[1:]}, quiet, entering after the intro and leaving before the end.",
                 groove=f"No percussion at any point. The pulse comes from the {bare(lead)} at about {bpm} BPM.",
                 sections=calm_sections(lead, layer))


def tense(id, bpm, key, scale, genre, mood, scene, sonics, lead, layer, drums, takes=2):
    return theme(id, takes, bpm=bpm, key=key, scale=scale, genre=genre, mood=mood, scene=scene, sonics=sonics,
                 never=NEVER + ", no heroic fanfare, no triumphant brass",
                 lead=f"{lead[0].upper()}{lead[1:]} carries the melody.",
                 primary=f"A driving ostinato in {layer}, and {lead} above it.",
                 secondary=f"{drums}. They keep a steady pulse, never a rock beat, never a march.",
                 groove=f"A steady {bpm} BPM pulse from {drums.lower()} and the ostinato.",
                 sections=tense_sections(lead, layer))


STINGER_SECTIONS = [("intro", "The whole cue happens here, in the first seconds, then it rings out."), ("outro", "Silence after a long natural decay.")]


def stinger(id, bpm, key, scale, genre, what, instruments):
    return {"id": id, "kind": "stinger", "takes": 2, "seconds": 30, "bpm": bpm, "key": key, "scale": scale, "genre": genre,
            "mood": f"{what} It is over almost at once, then rings out.",
            "scene": "A short musical cue in a fantasy video game, a few seconds long. Not a song.",
            "sonics": "Close, clear, short reverb tail.", "never": NEVER,
            "lead": f"{instruments[0].upper()}{instruments[1:]}.",
            "primary": f"{instruments[0].upper()}{instruments[1:]} play the whole cue in the first five seconds.",
            "secondary": "Nothing else.", "groove": "No groove. A single gesture.",
            "sections": STINGER_SECTIONS}


DUNGEON = "Dark fantasy ambient / Orchestral underscore"
ROOM = "A roguelike dungeon crawl in pixel art, played for hours; the music sits under footsteps and sound effects and must never tire the ear."
QUIET_MIX = "Wide, dark soundstage with a long stone-hall reverb. Small dynamic range, soft attacks, deep but gentle lows."

TRACKS = [
    # --- Area themes: calm (exploring) and tense (hostiles near) -----------
    calm("dungeon-calm", 64, "D", "minor", DUNGEON,
         "Opens lonely and watchful, a little curious. It never resolves into comfort and never turns heroic.",
         "Exploring the first stone corridors and rooms of an old dungeon by torchlight. " + ROOM, QUIET_MIX,
         "a low solo cello", "soft sustained low strings and a faint dark pad"),
    tense("dungeon-tense", 92, "D", "minor", DUNGEON,
          "Starts uneasy and stays tense, a fight in a dark room. Danger without triumph.",
          "Monsters close in around the hero in a torchlit dungeon. " + ROOM, QUIET_MIX,
          "a cello", "staccato low strings", "Low frame drums and a deep soft drum"),
    calm("depths-calm", 58, "C", "minor", "Dark ambient / Orchestral drone",
         "Heavier and colder than the upper dungeon. Opens in near-darkness, never warms.",
         "Deep in the dungeon, far from daylight, the corridors older and stranger. " + ROOM, QUIET_MIX,
         "a low bowed double bass and a distant horn-like pad", "slow cluster chords in low strings"),
    tense("depths-tense", 96, "C", "minor", "Dark orchestral / Cinematic tension",
          "Grim and urgent from the first bar, then relentless.",
          "Powerful monsters fight the hero deep in the dungeon. " + ROOM, QUIET_MIX,
          "low brass swells, muted", "low strings col legno and spiccato", "Deep taiko-like drums, soft and heavy"),
    calm("mines-calm", 76, "A", "minor", "Dark folk / Fantasy underscore",
         "Earthy and a little playful, wary underneath. Never bright, never a tavern song.",
         "Twisting mine tunnels dug by gnomes and dwarves, lanterns and pickaxes in the dark. " + ROOM,
         "Close, woody, dry cave reverb. Small dynamic range.",
         "a plucked hammered dulcimer", "a low bowed viola",
         extra="Single plucked notes echo like water dripping in a cave."),
    tense("mines-tense", 104, "A", "minor", "Dark folk / Fantasy battle underscore",
          "Urgent and rough from the start, a scramble in the tunnels.",
          "Gnomes and dwarves with pickaxes swarm the hero in the mines. " + ROOM,
          "Close, woody, dry cave reverb.", "a fiddle", "low plucked and bowed strings",
          "Hand drums and a bodhran"),
    calm("minetown", 84, "G", "major", "Medieval folk / Fantasy town",
         "Warm and safe, a rest after the dark tunnels. Gentle, never boisterous.",
         "A little underground town inside the mines: a temple, shops, lamplight and gnomes going about their business. " + ROOM,
         "Warm, close room sound. Small dynamic range.",
         "a lute", "a recorder and a soft hand drum far back", extra="Light dance-like lilt, very relaxed."),
    calm("sokoban", 72, "E", "minor", "Music box / Chamber puzzle music",
         "Thoughtful and patient, a little mysterious. Steady from start to end.",
         "A tower of puzzle rooms where the hero pushes heavy boulders into holes. " + ROOM,
         "Clear, intimate, small room. Very small dynamic range.",
         "a music box and a celesta", "pizzicato strings and a soft harp",
         extra="Repeating patterns, like gears turning."),
    calm("oracle", 60, "F", "major", "Ethereal ambient / Mystical",
         "Calm, otherworldly and reverent. Floats without a pulse.",
         "The Oracle's hall: fountains, statues of centaurs, a wise woman who sees the future. " + ROOM,
         "Very wide, airy, long shimmering reverb.",
         "a harp", "a wordless choir-like pad with no words and flowing water textures"),
    calm("bigroom", 68, "B", "minor", DUNGEON,
         "Exposed and uneasy, a huge open hall where anything can see you.",
         "One enormous lit hall full of monsters. " + ROOM, QUIET_MIX,
         "a low horn-like pad", "slow tremolo strings"),
    calm("ludios", 70, "Bb", "minor", "Dark fantasy / Orchestral underscore",
         "Cold, guarded and rich, the treasury of a fort.",
         "A hidden fortress full of soldiers and a dragon guarding gold. " + ROOM, QUIET_MIX,
         "muted low brass", "low strings and a snare far back, very soft"),
    calm("medusa", 62, "Db", "minor", "Dark ambient / Aquatic underscore",
         "Still, watery and menacing, something terrible waits across the water.",
         "An island surrounded by deep water where Medusa's gaze turns heroes to stone. " + ROOM,
         "Wide and wet, long underwater-like reverb.",
         "a glass harmonica", "low strings and slow rolling water-like textures"),
    calm("castle", 66, "G", "minor", "Gothic orchestral / Dark fantasy",
         "Grand, cold and foreboding. Stately, never triumphant.",
         "A great castle behind a moat and drawbridge, full of soldiers, the last fortress before hell. " + ROOM, QUIET_MIX,
         "a pipe organ, soft", "low strings and slow muted horns"),
    calm("gehennom-calm", 54, "Eb", "minor", "Dark ambient / Infernal drone",
         "Oppressive, hot and hopeless, a slow dread that never lifts.",
         "The maze-like underworld of Gehennom, fire and brimstone. " + ROOM,
         "Huge, dark, distant reverb, low rumbling lows kept soft.",
         "a low distorted cello", "deep drones, metallic scrapes far away"),
    tense("gehennom-tense", 100, "Eb", "minor", "Dark orchestral / Infernal battle",
          "Furious and doomed from the first bar.",
          "Demons attack the hero in the underworld. " + ROOM, QUIET_MIX,
          "low brass", "low strings and metallic textures", "Huge low drums and metal hits"),
    calm("wizard-tower", 60, "F#", "minor", "Dark ambient / Arcane",
         "Arcane and sinister, a sense of being watched by something ancient.",
         "The tower of the Wizard of Yendor, deep in hell. " + ROOM, QUIET_MIX,
         "a low celesta and bowed vibraphone", "dark choir-like pad with no words"),
    calm("vlad", 58, "C#", "minor", "Gothic / Dark chamber music",
         "Aristocratic, cold and vampiric.",
         "Vlad's Tower: the vampire lord's crypt-like keep. " + ROOM, QUIET_MIX,
         "a harpsichord, slow", "a solo violin and low strings"),
    calm("planes", 70, "E", "minor", "Ethereal orchestral / Cosmic ambient",
         "Vast and elemental, awe and danger together.",
         "The elemental planes of earth, air, fire and water at the end of the game. " + ROOM,
         "Enormous, airy soundstage, long reverb.",
         "high strings in harmonics", "deep brass pads and shimmering textures"),
    calm("astral", 64, "C", "major", "Sacred orchestral / Celestial",
         "Holy and immense, the last trial before the gods.",
         "The Astral Plane: three high altars and the gods watching. " + ROOM,
         "Cathedral-sized reverb, bright but soft.",
         "a soft pipe organ", "a wordless choir-like pad with no words and high strings"),
    # The quest homeland: one theme per role, in that role's colour.
    *[calm(f"quest-{role}", bpm, key, scale, genre,
           "Purposeful and solemn: home, but home has been betrayed and must be saved.",
           f"The {name}'s quest homeland and the road to the quest nemesis. " + ROOM, QUIET_MIX,
           lead, layer, takes=1)
      for role, name, bpm, key, scale, genre, lead, layer in [
          ("arc", "Archeologist", 74, "D", "minor", "Adventure film score / Exotic", "a duduk", "low strings and a frame drum far back, very soft"),
          ("bar", "Barbarian", 70, "E", "minor", "Tribal epic / Dark folk", "a low bowed lyre", "deep drones and a slow distant drum, very soft"),
          ("cav", "Caveman", 62, "A", "minor", "Primal ambient", "a wooden flute", "a didgeridoo-like drone and stones tapped far back"),
          ("hea", "Healer", 64, "F", "major", "Gentle pastoral", "a harp", "soft strings and a recorder"),
          ("kni", "Knight", 68, "Bb", "major", "Chivalric orchestral", "a solo horn, soft", "noble low strings"),
          ("mon", "Monk", 58, "D", "minor", "Meditative East Asian ambient", "a shakuhachi", "a low singing bowl drone"),
          ("pri", "Priest", 56, "G", "major", "Sacred chamber music", "a soft organ", "low strings"),
          ("ran", "Ranger", 72, "E", "minor", "Forest folk / Fantasy", "a wooden flute", "a plucked lute and soft strings"),
          ("rog", "Rogue", 80, "C", "minor", "Sly chamber music", "pizzicato strings and a clarinet", "a soft bass clarinet"),
          ("sam", "Samurai", 62, "D", "minor", "Traditional Japanese / Cinematic", "a koto", "a shakuhachi and a low drone"),
          ("tou", "Tourist", 88, "F", "major", "Light Mediterranean folk", "a mandolin", "an accordion, soft"),
          ("val", "Valkyrie", 66, "D", "minor", "Nordic folk / Epic", "a hardanger fiddle", "a low drone and a soft horn far back"),
          ("wiz", "Wizard", 64, "F#", "minor", "Arcane fantasy", "a celesta", "a soft harp and low strings"),
      ]],
    # --- Rooms ---------------------------------------------------------------
    calm("shop", 92, "F", "major", "Medieval folk / Shop music",
         "Friendly and a little sly, welcoming customers. Light, never loud.",
         "A cosy shop in the dungeon, a shopkeeper watching every item. " + ROOM,
         "Close, warm, small room. Small dynamic range.",
         "a lute and a recorder", "pizzicato strings and a tambourine far back, very soft"),
    calm("temple", 56, "D", "major", "Sacred / Gregorian-inspired ambient",
         "Peaceful and holy, a sanctuary.",
         "A small temple with an altar and a priest. " + ROOM,
         "Stone chapel reverb, soft.",
         "a soft organ", "a wordless choir-like hum pad with no words"),
    calm("throne", 66, "Bb", "major", "Regal baroque / Courtly",
         "Stately and proud, a little decadent and dangerous.",
         "A throne room full of a monster king's court. " + ROOM, QUIET_MIX,
         "a harpsichord", "low strings and muted horns, very soft"),
    # --- Menus and endings ---------------------------------------------------
    {**calm("title", 70, "D", "minor", "Epic fantasy / Orchestral overture",
            "Opens mysterious, grows into a hopeful adventurous theme in the middle, settles back to mystery.",
            "The title screen of a dungeon-crawling fantasy game: a hero about to descend.",
            "Wide orchestral hall, warm. Moderate dynamic range.",
            "a solo horn and strings", "full strings and a harp"), "kind": "piece"},
    {**calm("death", 52, "A", "minor", "Requiem / Elegy",
            "Sad and final, a quiet lament for a fallen hero. Ends in peace.",
            "The tombstone after the hero dies.",
            "Intimate, soft hall.", "a solo cello", "soft low strings"), "kind": "piece", "takes": 2, "seconds": 120},
    {**calm("ascension", 72, "C", "major", "Triumphant orchestral / Celestial finale",
            "Grows from awe into full glory: the hero becomes a demigod.",
            "The hero offers the Amulet and ascends to godhood.",
            "Cathedral-sized, bright and wide.", "a full orchestra with a horn melody",
            "a wordless choir-like pad with no words, bells and organ"), "kind": "piece", "takes": 2, "seconds": 120,
     "never": NEVER},
    # --- Stingers --------------------------------------------------------------
    stinger("sting-levelup", 120, "C", "major", "Fantasy fanfare",
            "A short bright rising flourish of success.", "a harp glissando and a soft horn call"),
    stinger("sting-artifact", 80, "E", "major", "Mystical fantasy cue",
            "A shimmering, wondrous discovery.", "bells, celesta and a high string chord"),
    stinger("sting-prayer", 60, "F", "major", "Sacred cue",
            "A warm holy answer from above.", "a soft organ chord and a wordless choir-like pad"),
    stinger("sting-branch", 70, "D", "minor", "Dark fantasy cue",
            "Entering somewhere new and unknown.", "a low horn and a deep gong"),
    stinger("sting-death", 50, "A", "minor", "Tragic cue",
            "A heavy falling chord of doom.", "low strings and a deep bell"),
    stinger("sting-ascend", 90, "C", "major", "Triumphant cue",
            "A radiant swelling chord of glory.", "a full orchestra and bells"),
]

BY_ID = {t["id"]: t for t in TRACKS}
