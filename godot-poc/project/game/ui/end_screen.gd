class_name EndScreen
extends CanvasLayer
## How the run ended, told properly: an epitaph for the fallen, a triumph
## for the ascended, a quiet "rest" for a saved game, plus the chronicle
## NetHack disclosed (possessions, attributes, foes vanquished, conduct...).

const HOW_WORDS := {
	0: "died", 1: "choked", 2: "was poisoned", 3: "starved", 4: "drowned", 5: "burned", 6: "dissolved",
	7: "was crushed", 8: "turned to stone", 9: "turned to slime", 10: "was genocided", 11: "met a panic",
	12: "was tricked", 13: "quit", 14: "escaped the dungeon", 15: "ascended",
}
const TABS := [
	["final_words", "Last moments"], ["possessions", "Possessions"], ["attributes", "Attributes"],
	["vanquished", "Vanquished"], ["genocided", "Genocided"], ["conduct", "Conduct"], ["overview", "Dungeon"],
	["achievements", "Achievements"], ["full_log", "Full log"],
]

var app: App
var outcome := "died"
var _content: RichTextLabel
var _tabs: HBoxContainer
var _state: GameState
## NetHack's xlogfile record of this run (points, death, maxlvl...).
var _record: Dictionary = {}


func setup(p_app: App, summary: Dictionary) -> void:
	app = p_app
	layer = 30
	_state = summary.get("state")
	_record = summary.get("xlog", {})
	var info: Dictionary = _state.end_info if _state else {}
	var how := int(info.get("how", -1))
	var reason := str(summary.get("reason", ""))
	var code := int(summary.get("code", 0))
	var never_played := _state != null and not _state.prompted
	if _state and _state.start_failed_code != 0 or reason == "returned" or str(summary.get("error", "")) != "":
		outcome = "failed"
	elif how < 0 and reason == "exit" and code != 0 and never_played:
		# NetHack's own error() exit before the game began (e.g. declining
		# to take over a game in progress): a failed start, not a crash.
		outcome = "failed"
	elif how < 0 and (reason == "abort" or code != 0):
		outcome = "crashed"
	elif how < 0:
		if _state and _state.save_confirmed:
			outcome = "saved"
		else:
			outcome = "stopped"
	elif how == 15:
		outcome = "ascended"
	elif how == 14:
		outcome = "escaped"
	elif how == 13:
		outcome = "quit"
	else:
		outcome = "died"

	# The run is over: the end screen replaces the game's interface, and the
	# game screen stops taking input.
	if is_instance_valid(app.game):
		app.game.retire()
	# The tombstone's lament, the ascension's glory; quiet for the rest.
	if app.music:
		app.music.unfollow()
		if outcome == "ascended":
			app.music.sting("sting-ascend")
		app.music.play({"died": "death", "ascended": "ascension"}.get(outcome, ""))
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.theme = UiTheme.theme()
	add_child(root)
	var backdrop := DungeonBackdrop.new()
	backdrop.tint = {"died": Color(1.0, 0.35, 0.25), "quit": Color(0.7, 0.7, 0.8), "saved": Color(0.6, 0.75, 1.0),
		"stopped": Color(0.7, 0.7, 0.8), "failed": Color(0.8, 0.5, 0.4), "crashed": Color(0.8, 0.5, 0.4), "escaped": Color(1.0, 0.9, 0.6), "ascended": Color(1.0, 0.92, 0.55)}[outcome]
	root.add_child(backdrop)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 64)
	root.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 48)
	margin.add_child(row)

	var hero := VBoxContainer.new()
	hero.custom_minimum_size = Vector2(420, 0)
	hero.add_theme_constant_override("separation", 10)
	row.add_child(hero)
	var portrait := TextureRect.new()
	portrait.custom_minimum_size = Vector2(420, 560)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var character: Dictionary = _state.character if _state else {}
	var resolver := TileResolver.shared()
	portrait.texture = resolver.portrait(resolver.player_avatar_id(character))
	if outcome in ["died", "quit"]:
		var gray := ShaderMaterial.new()
		gray.shader = load("res://game/ui/grayscale.gdshader")
		portrait.material = gray
	hero.add_child(portrait)
	var name_label := Label.new()
	name_label.text = str(character.get("name", "The hero"))
	name_label.theme_type_variation = "HeaderLabel"
	name_label.add_theme_font_size_override("font_size", 40)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hero.add_child(name_label)
	var title_line := Label.new()
	title_line.text = _state.status.title() if _state else ""
	title_line.theme_type_variation = "CaptionLabel"
	title_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hero.add_child(title_line)
	var identity := Label.new()
	identity.text = _identity(character)
	identity.theme_type_variation = "CaptionLabel"
	identity.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hero.add_child(identity)
	if _state and _state.seed != "":
		var seed_line := Label.new()
		seed_line.text = "Dungeon seed %s" % _state.seed
		seed_line.theme_type_variation = "CaptionLabel"
		seed_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		seed_line.tooltip_text = "Start a new adventure with this seed to play the same dungeon."
		hero.add_child(seed_line)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 14)
	row.add_child(column)
	var headline := Label.new()
	headline.text = _headline(character)
	headline.add_theme_font_override("font", UiTheme.heading_font())
	headline.add_theme_font_size_override("font_size", 64)
	headline.add_theme_color_override("font_color", UiTheme.BAD.lightened(0.1) if outcome == "died" else UiTheme.GOLD)
	headline.add_theme_constant_override("outline_size", 10)
	headline.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	column.add_child(headline)
	var epitaph := Label.new()
	epitaph.text = _epitaph(info)
	epitaph.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	epitaph.add_theme_font_override("font", UiTheme.italic_font())
	epitaph.add_theme_font_size_override("font_size", 26)
	epitaph.add_theme_color_override("font_color", UiTheme.INK)
	column.add_child(epitaph)
	column.add_child(_stats_strip(info))

	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	column.add_child(_tabs)
	var panel := PanelContainer.new()
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.04, 0.042, 0.056, 0.88), Color(UiTheme.GOLD, 0.25), 12, 1, 20))
	column.add_child(panel)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)
	_content = RichTextLabel.new()
	_content.bbcode_enabled = true
	_content.fit_content = true
	_content.add_theme_font_override("bold_font", UiTheme.bold_font())
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content.add_theme_font_override("normal_font", UiTheme.body_font())
	_content.add_theme_font_size_override("normal_font_size", 19)
	_content.add_theme_color_override("default_color", UiTheme.INK)
	scroll.add_child(_content)
	_build_tabs()

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 12)
	column.add_child(buttons)
	var checkpoints: Array = app.session.catalog().checkpoints() if outcome == "crashed" else []
	if not checkpoints.is_empty():
		_add_button(buttons, "Recover this run", true, func() -> void:
			# The title's recovery: the tool check, the "replace the saved
			# game?" question and the messages.
			queue_free()
			app.show_title()
			if app.title is TitleScreen:
				(app.title as TitleScreen)._recover(checkpoints[0]))
	match outcome:
		"saved", "failed", "crashed", "stopped":
			_add_button(buttons, "Back to title", checkpoints.is_empty(), func() -> void:
				queue_free()
				app.show_title())
			if outcome != "saved" and outcome != "failed":
				_add_button(buttons, "New adventure", false, func() -> void:
					queue_free()
					app.show_character_creation())
		_:
			_add_button(buttons, "New adventure", true, func() -> void:
				queue_free()
				app.show_character_creation())
			_add_button(buttons, "Title screen", false, func() -> void:
				queue_free()
				app.show_title())
	_add_button(buttons, "Quit", false, func() -> void: get_tree().quit())

	root.modulate.a = 0.0
	root.create_tween().tween_property(root, "modulate:a", 1.0, 1.2).set_trans(Tween.TRANS_SINE)


func _add_button(box: HBoxContainer, text: String, primary: bool, callback: Callable) -> void:
	var button := Button.new()
	button.name = text.replace(" ", "")
	button.text = text
	button.custom_minimum_size = Vector2(260 if primary else 180, 58)
	if primary:
		button.add_theme_font_override("font", UiTheme.heading_font())
		button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("3a2c12"), UiTheme.GOLD, 10))
		button.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.3))
		button.grab_focus.call_deferred()
	button.pressed.connect(callback)
	box.add_child(button)


## "Lawful female human Valkyrie", from the -u character spec.
func _identity(character: Dictionary) -> String:
	var selection := {"role": str(character.get("role", "")), "race": str(character.get("race", "")),
		"gender": str(character.get("gender", "")), "align": str(character.get("align", ""))}
	if not (CharacterOptions.ROLES.has(selection.role) and CharacterOptions.RACES.has(selection.race)
			and CharacterOptions.GENDERS.has(selection.gender) and CharacterOptions.ALIGNS.has(selection.align)):
		return ""
	return CharacterOptions.describe(selection)


func _headline(character: Dictionary) -> String:
	match outcome:
		"failed":
			return "The dungeon would not open"
		"crashed":
			return "The run was interrupted"
		"died":
			return "Here lies %s" % character.get("name", "a hero")
		"quit":
			return "The quest is abandoned"
		"saved":
			return "Your hero rests"
		"stopped":
			return "The run was left behind"
		"escaped":
			return "Escaped the dungeon"
		"ascended":
			return "Ascended to demigodhood!"
	return ""


func _epitaph(info: Dictionary) -> String:
	if outcome == "failed":
		var said := ""
		if _state and not _state.start_messages.is_empty():
			var lines := _state.start_messages.filter(func(t: String) -> bool: return t.strip_edges() != "")
			said = "\nNetHack said: " + " ".join(lines.slice(maxi(0, lines.size() - 3))) if not lines.is_empty() else ""
		return "NetHack could not start this game%s. Check that no other copy is using the same hero, then try again.%s" % [(" (code %d)" % _state.start_failed_code) if _state and _state.start_failed_code != 0 else "", said]
	if outcome == "crashed":
		return "NetHack stopped unexpectedly. Its last checkpoint was kept, so the run can usually be recovered."
	if outcome == "saved":
		return "%s waits at the threshold. Continue from the title screen whenever you are ready." % (_state.character.get("name", "Your hero") if _state else "Your hero")
	if outcome == "stopped":
		return "This game was abandoned without saving."
	var killer := str(info.get("killer", "")).strip_edges()
	var how := int(info.get("how", 0))
	var where := (" at " + _state.level_name(true)) if _state else (" at depth %d" % int(info.depth) if info.has("depth") else "")
	var when := ", after %d turns" % int(info.moves) if info.has("moves") else ""
	if how < 10 and killer != "":
		# NetHack's own words for the death ("killed by a warg girl",
		# "choked on a lichen corpse"), as its tombstone gives them.
		return "%s%s%s%s." % [killer.substr(0, 1).to_upper(), killer.substr(1), where, when]
	return "%s %s%s%s." % [(_state.character.get("name", "The hero") if _state else "The hero"), HOW_WORDS.get(how, "fell"), where, when]


func _stats_strip(info: Dictionary) -> Control:
	var strip := HBoxContainer.new()
	strip.add_theme_constant_override("separation", 34)
	if _state == null:
		return strip
	var status := _state.status
	var facts := []
	if _record.has("points"):
		facts.append(["Score", str(_record.points)])
	facts.append_array([
		["Level", status.text(StatusModel.Field.XP)], ["Max HP", status.text(StatusModel.Field.HPMAX)],
		["Gold", status.text(StatusModel.Field.GOLD)], ["Depth", str(int(info.get("depth", _state.map.depth)))],
		["Turns", str(int(info.get("moves", status.turn())))],
	])
	for fact in facts:
		var box := VBoxContainer.new()
		var label := Label.new()
		label.text = fact[0]
		label.theme_type_variation = "CaptionLabel"
		box.add_child(label)
		var value := Label.new()
		value.text = str(fact[1]) if str(fact[1]) != "" else "—"
		value.add_theme_font_override("font", UiTheme.heading_font())
		value.add_theme_font_size_override("font_size", 30)
		value.add_theme_color_override("font_color", UiTheme.GOLD)
		box.add_child(value)
		strip.add_child(box)
	return strip


func _build_tabs() -> void:
	var chronicle: Dictionary = _state.chronicle if _state else {}
	var first := ""
	for tab in TABS:
		var lines: Array = _lines_for(tab[0], chronicle)
		if lines.is_empty():
			continue
		if first == "":
			first = tab[0]
		var button := Button.new()
		button.text = tab[1]
		button.custom_minimum_size = Vector2(0, 42)
		button.pressed.connect(_show.bind(tab[0]))
		_tabs.add_child(button)
	if first != "":
		_show(first)
	else:
		_content.text = "No chronicle was recorded for this run."


func _lines_for(key: String, chronicle: Dictionary) -> Array:
	match key:
		"final_words":
			# Only a death has last moments; a save or quit just stops.
			if outcome not in ["died", "escaped", "ascended"]:
				return []
			var words: Array = chronicle.get("final_words", [])
			if words.is_empty() and _state:
				for entry in _state.messages.recent(12):
					words.append(entry.text)
			return words
		"full_log":
			var lines: Array = []
			if _state:
				var last_turn := -1
				for entry in _state.messages.entries:
					var turn := int(entry.turn)
					if turn <= 0:
						lines.append(str(entry.text))
					elif turn != last_turn:
						lines.append("T%d  ·  %s" % [turn, entry.text])
					else:
						lines.append("        " + str(entry.text))
					last_turn = turn
			return lines
	return chronicle.get(key, [])


func _show(key: String) -> void:
	var chronicle: Dictionary = _state.chronicle if _state else {}
	var lines: Array = _lines_for(key, chronicle)
	var out := PackedStringArray()
	for raw in lines:
		var line := str(raw).replace("[", "[lb]")
		if line.begins_with("## "):
			out.append("\n[color=#e2b65f][b]%s[/b][/color]" % line.substr(3))
		elif line.ends_with(":") and not line.begins_with(" "):
			out.append("\n[color=#e2b65f][b]%s[/b][/color]" % line)
		else:
			out.append(line)
	_content.text = "\n".join(out).strip_edges()
	for i in _tabs.get_child_count():
		var button: Button = _tabs.get_child(i)
		var match_key := ""
		for tab in TABS:
			if tab[1] == button.text:
				match_key = tab[0]
		if match_key == key:
			button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("2c2414"), Color(UiTheme.GOLD, 0.85), 6))
		else:
			button.remove_theme_stylebox_override("normal")
