class_name TitleScreen
extends CanvasLayer
## The front door: a living dungeon backdrop, the title, and the way in —
## continue a saved hero, recover a crashed run, or forge a new one.

var app: App
var root: Control
var menu: VBoxContainer
var showcase: TextureRect
var status_label: Label
var _saves: Array[Dictionary] = []
var _checkpoints: Array[Dictionary] = []


func setup(p_app: App) -> void:
	app = p_app
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.theme = UiTheme.theme()
	add_child(root)
	root.add_child(DungeonBackdrop.new())

	showcase = TextureRect.new()
	showcase.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	showcase.anchor_left = 0.52
	showcase.anchor_right = 0.98
	showcase.anchor_top = 0.08
	showcase.anchor_bottom = 0.98
	showcase.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	showcase.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	showcase.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	showcase.modulate = Color(1, 1, 1, 0.0)
	root.add_child(showcase)

	var column := VBoxContainer.new()
	column.position = Vector2(150, 150)
	column.add_theme_constant_override("separation", 14)
	root.add_child(column)
	var title := Label.new()
	title.text = "NetHack"
	title.add_theme_font_override("font", UiTheme.heading_font())
	title.add_theme_font_size_override("font_size", 132)
	title.add_theme_color_override("font_color", UiTheme.GOLD)
	title.add_theme_color_override("font_outline_color", Color(0.25, 0.12, 0.02, 0.9))
	title.add_theme_constant_override("outline_size", 14)
	title.add_theme_color_override("font_shadow_color", Color(1.0, 0.55, 0.15, 0.35))
	title.add_theme_constant_override("shadow_offset_x", 0)
	title.add_theme_constant_override("shadow_offset_y", 0)
	title.add_theme_constant_override("shadow_outline_size", 40)
	column.add_child(title)
	var tagline := Label.new()
	tagline.text = "Descend into the Dungeons of Doom and return with the Amulet of Yendor."
	tagline.add_theme_font_override("font", UiTheme.italic_font())
	tagline.add_theme_font_size_override("font_size", 24)
	tagline.add_theme_color_override("font_color", UiTheme.INK_DIM)
	column.add_child(tagline)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 40)
	column.add_child(gap)
	menu = VBoxContainer.new()
	menu.add_theme_constant_override("separation", 10)
	column.add_child(menu)
	status_label = Label.new()
	status_label.theme_type_variation = "CaptionLabel"
	status_label.add_theme_color_override("font_color", UiTheme.WARN)
	column.add_child(status_label)
	_build_menu()


func _build_menu() -> void:
	for child in menu.get_children():
		child.queue_free()
	var catalog := app.session.catalog()
	_saves = catalog.saves()
	_checkpoints = catalog.checkpoints()
	if not _saves.is_empty():
		var save: Dictionary = _saves[0]
		var character: Dictionary = save.character
		var who := "%s the %s" % [save.name, CharacterOptions.ROLES.get(character.get("role", ""), {}).get("label", "adventurer")]
		_add_button("Continue", who, func() -> void: app.continue_game(save), true)
		_set_showcase(character)
		_add_button("Saved heroes", "%d saved · continue or delete" % _saves.size(), _show_saves)
	if not _checkpoints.is_empty():
		# The newest crashed run, by name; the rest (and discarding) behind
		# one entry.
		var newest: Dictionary = _checkpoints[0]
		var hero := str(newest.get("name", ""))
		_add_button("Recover " + (hero if hero != "" else "crashed game"), "Crashed · " + SaveCatalog.when(int(newest.modified)),
			func() -> void: _recover(newest), _saves.is_empty())
		if _saves.is_empty() and not (newest.get("character", {}) as Dictionary).is_empty():
			_set_showcase(newest.character)
		_add_button("Crashed runs", "%d · recover or discard" % _checkpoints.size(), _show_checkpoints)
	_add_button("New adventure", "Choose your hero", func() -> void: app.show_character_creation(), _saves.is_empty() and _checkpoints.is_empty())
	_add_button("Settings", "", func() -> void: _open_overlay(SettingsScreen))
	_add_button("Help & guide", "", func() -> void: _open_overlay(HelpScreen))
	_add_button("Quit", "", func() -> void: get_tree().quit())
	if _saves.is_empty() and (_checkpoints.is_empty() or (_checkpoints[0].get("character", {}) as Dictionary).is_empty()):
		_set_showcase({"role": "Val", "race": "Hum", "gender": "Fem"})


func _add_button(text: String, detail: String, callback: Callable, primary := false) -> void:
	var button := Button.new()
	button.focus_mode = Control.FOCUS_ALL
	button.custom_minimum_size = Vector2(460, 64)
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.text = text
	if detail != "":
		# The detail is a quieter caption on the right, not part of the verb.
		var caption := Label.new()
		caption.text = detail
		caption.theme_type_variation = "CaptionLabel"
		caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
		caption.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
		caption.offset_left = -260
		caption.offset_right = -20
		caption.offset_top = -12
		caption.offset_bottom = 12
		caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		caption.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.add_child(caption)
		button.custom_minimum_size.x = 560
	button.add_theme_font_override("font", UiTheme.heading_font())
	button.add_theme_font_size_override("font_size", 22)
	var normal := UiTheme.button_style(Color(0.06, 0.06, 0.08, 0.72), Color(1, 1, 1, 0.08), 8)
	normal.content_margin_left = 22
	var hover := UiTheme.button_style(Color(0.16, 0.12, 0.06, 0.9), Color(UiTheme.GOLD, 0.8), 8)
	hover.content_margin_left = 30
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("focus", hover)
	if primary:
		button.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.2))
		button.grab_focus.call_deferred()
	button.pressed.connect(callback)
	menu.add_child(button)


func _set_showcase(character: Dictionary) -> void:
	var resolver := TileResolver.shared()
	var avatar := resolver.player_avatar_id(character)
	showcase.texture = resolver.portrait(avatar)
	var tween := showcase.create_tween()
	tween.tween_property(showcase, "modulate:a", 0.85, 1.2)


func _recover(checkpoint: Dictionary, overwrite_ok := false) -> void:
	# NetHack's recover replaces a save of the same hero without asking.
	var hero := str(checkpoint.get("name", ""))
	if NetHackSession.find_tool("recover") == "":
		status_label.text = "Recovery isn't available in this build."
		return
	if not overwrite_ok and hero != "":
		for save in app.session.catalog().saves():
			if str(save.name) == hero:
				var confirm := ConfirmDialog.new()
				confirm.setup("Replace %s's saved game?" % hero, "%s has a saved game from %s. Recovering the crashed run from %s replaces it." % [hero, SaveCatalog.when(int(save.modified)), SaveCatalog.when(int(checkpoint.modified))],
					"Recover anyway", func() -> void: _recover(checkpoint, true))
				root.add_child(confirm)
				GamepadRouter.focus_dialog.call_deferred(confirm)
				return
	var moved: Array[String] = []
	if overwrite_ok and hero != "":
		moved = app.session.catalog().set_aside_saves(hero)
	status_label.text = "Recovering…"
	var recovered := app.session.catalog().recover(str(checkpoint.base))
	if recovered == "":
		# Nothing may be lost on a failed recovery: the save goes back.
		app.session.catalog().restore_set_aside(moved)
		status_label.text = "That crashed run could not be recovered." + (" Your saved game is unchanged." if not moved.is_empty() else "")
	else:
		status_label.text = "Recovered. Continue your hero."
	_build_menu()


func _show_checkpoints() -> void:
	var card := ModalCard.new()
	card.card_width = 620.0
	card.set_title("Crashed runs", "NetHack keeps a crashed run so it can be recovered. Discarding one deletes it for good.")
	for checkpoint in _checkpoints:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		var label := Label.new()
		var hero := str(checkpoint.get("name", ""))
		var role := str(CharacterOptions.ROLES.get(str((checkpoint.get("character", {}) as Dictionary).get("role", "")), {}).get("label", ""))
		label.text = "%s%s   ·   %s" % [hero if hero != "" else "Unknown hero", (" the " + role) if role != "" else "", SaveCatalog.when(int(checkpoint.modified))]
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(label)
		var recover := Button.new()
		recover.text = "Recover"
		recover.focus_mode = Control.FOCUS_ALL
		recover.pressed.connect(func() -> void:
			card.close()
			_recover(checkpoint))
		row.add_child(recover)
		var discard := Button.new()
		discard.text = "Discard"
		discard.focus_mode = Control.FOCUS_ALL
		discard.add_theme_color_override("font_color", UiTheme.BAD)
		discard.pressed.connect(func() -> void:
			var confirm := ConfirmDialog.new()
			confirm.setup("Discard %s's crashed run?" % (hero if hero != "" else "this"), "It can't be recovered afterwards.", "Discard", func() -> void:
				app.session.catalog().discard_checkpoint(str(checkpoint.base))
				card.close()
				_build_menu())
			root.add_child(confirm)
			GamepadRouter.focus_dialog.call_deferred(confirm))
		row.add_child(discard)
		card.body.add_child(row)
	card.add_footer_button("Close  Esc", card.close, true)
	root.add_child(card)
	GamepadRouter.focus_dialog.call_deferred(card)


func _show_saves() -> void:
	var picker := SavePicker.new()
	picker.setup(_saves, func(save: Dictionary) -> void: app.continue_game(save))
	picker.on_deleted = func() -> void:
		_saves = app.session.catalog().saves()
		_build_menu()
	root.add_child(picker)
	GamepadRouter.focus_dialog.call_deferred(picker)


func _open_overlay(kind: Script) -> void:
	var overlay: Control = kind.new()
	overlay.setup(null)
	root.add_child(overlay)
	GamepadRouter.focus_dialog.call_deferred(overlay)


func _input(event: InputEvent) -> void:
	# The topmost card (the last child) gets the keys.
	var children := root.get_children()
	children.reverse()
	for child in children:
		if child is ModalCard and not child.is_queued_for_deletion() and event is InputEventKey and event.pressed:
			# Keys the card doesn't use go on to the GUI (focus navigation);
			# Esc closes a card that doesn't handle it.
			if child.handle_key(event):
				get_viewport().set_input_as_handled()
			elif event.keycode == KEY_ESCAPE:
				child.close()
				get_viewport().set_input_as_handled()
			return
