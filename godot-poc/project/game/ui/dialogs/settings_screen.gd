class_name SettingsScreen
extends ModalCard
## Preferences. Gameplay choices shape the next new game (they become
## NetHack options); display and audio choices apply immediately.

var screen: GameScreen
var settings: Settings
var _list: VBoxContainer
var _scroll: ScrollContainer


func _ready() -> void:
	super._ready()
	# The window or the interface size changed: the rows' room changes too.
	get_viewport().size_changed.connect(func() -> void: _fit_scroll.call_deferred(_scroll))


func _fit_scroll(scroll: ScrollContainer) -> void:
	if not is_instance_valid(scroll):
		return
	var room := get_viewport().get_visible_rect().size.y - 230.0
	scroll.custom_minimum_size = Vector2(card_width - 40.0, minf(_list.get_combined_minimum_size().y, room))


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	settings = App.instance.settings if App.instance else Settings.load_or_default()
	card_width = 680.0
	set_title("Settings")
	# The rows scroll when the window is too short for all of them.
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus = true
	body.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_list)
	_scroll = scroll
	_fit_scroll.call_deferred(scroll)
	_list.add_child(_heading("Gameplay — applies to your next new game"))
	_list.add_child(_choice("Autopickup", [["gold", "Gold only"], ["all", "Useful items"], ["everything", "Everything"], ["off", "Off"]], settings.autopickup,
		func(v: String) -> void: settings.autopickup = v))
	_list.add_child(_choice("Movement keys", [["classic", "Arrows & hjkl"], ["numpad", "Number pad"]], "numpad" if settings.number_pad else "classic",
		func(v: String) -> void: settings.number_pad = v == "numpad"))
	_list.add_child(_toggle("Ask before dangerous actions", settings.confirm_dangerous, func(on: bool) -> void: settings.confirm_dangerous = on))
	_list.add_child(_toggle("Space waits a turn", settings.rest_on_space, func(on: bool) -> void: settings.rest_on_space = on))
	_list.add_child(_choice("Locked-door suggestions", [["full", "Always"], ["essential", "With a key"], ["off", "Off"]], settings.contextual_prompts,
		func(v: String) -> void: settings.contextual_prompts = v))
	_list.add_child(_heading("Display"))
	_list.add_child(_slider("Default zoom", 0, WorldView.ZOOMS.size() - 1, settings.default_zoom, func(v: float) -> void:
		settings.default_zoom = int(v)
		if screen:
			screen.world.set_zoom_index(int(v))))
	_list.add_child(_slider("Interface size", 75, 150, int(settings.ui_scale * 100), func(v: float) -> void:
		settings.ui_scale = v / 100.0
		if App.instance:
			App.instance.apply_ui_scale()
		_fit_scroll.call_deferred(_scroll), "%d%%"))
	_list.add_child(_choice("Minimap", [["small", "Small"], ["medium", "Medium"], ["large", "Large"]], settings.minimap_size, func(v: String) -> void:
		settings.minimap_size = v
		if screen:
			screen.hud.minimap.apply_size()))
	var fullscreen_row := _toggle("Fullscreen  (F11)", settings.fullscreen, func(on: bool) -> void:
		settings.fullscreen = on
		if App.instance:
			App.instance.apply_fullscreen())
	_list.add_child(fullscreen_row)
	# F11 while this card is open moves the switch too.
	var fullscreen_switch: CheckButton = fullscreen_row.get_child(1)
	settings.changed.connect(func() -> void:
		if is_instance_valid(fullscreen_switch):
			fullscreen_switch.set_pressed_no_signal(settings.fullscreen))
	_list.add_child(_toggle("Screen shake", settings.screen_shake, func(on: bool) -> void: settings.screen_shake = on))
	_list.add_child(_toggle("Reduced motion", settings.reduced_motion, func(on: bool) -> void: settings.reduced_motion = on))
	_list.add_child(_toggle("Show keys on buttons", settings.show_key_hints, func(on: bool) -> void: settings.show_key_hints = on))
	_list.add_child(_toggle("Always show the full status", settings.detailed_status, func(on: bool) -> void: settings.detailed_status = on))
	_list.add_child(_toggle("Diagnostics log (bug reports)", settings.keep_diagnostics, func(on: bool) -> void: settings.keep_diagnostics = on))
	_list.add_child(_toggle("Show NetHack symbols on the map", settings.ascii_overlay, func(on: bool) -> void:
		settings.ascii_overlay = on
		_refresh_world()))
	_list.add_child(_toggle("High-contrast map", settings.high_contrast, func(on: bool) -> void:
		settings.high_contrast = on
		_refresh_world()))
	_list.add_child(_heading("Audio"))
	_list.add_child(_slider("Volume", 0, 100, int(settings.master_volume * 100), func(v: float) -> void:
		settings.master_volume = v / 100.0
		AudioServer.set_bus_volume_db(0, linear_to_db(maxf(settings.master_volume, 0.0001))), "%d%%"))
	_list.add_child(_toggle("Game sounds (fights, steps, the dungeon)", settings.game_sounds, func(on: bool) -> void: settings.game_sounds = on))
	_list.add_child(_toggle("Interface sounds (clicks, panels)", settings.interface_sounds, func(on: bool) -> void: settings.interface_sounds = on))
	_list.add_child(_heading("Advanced — NetHack options for your next new game"))
	var extra_row := _row("Extra NetHack options")
	var extra := LineEdit.new()
	extra.text = settings.extra_options
	extra.placeholder_text = "paranoid_confirmation:pray, pickup_burden:burdened"
	extra.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	extra.text_changed.connect(func(text: String) -> void: settings.extra_options = text)
	extra_row.add_child(extra)
	_list.add_child(extra_row)
	var extra_note := Label.new()
	extra_note.text = "As in a .nethackrc OPTIONS= line (this game reads no .nethackrc). Settings decides autopickup, pickup types, number pad and Space; menu style stays full (the screens rely on it)."
	extra_note.theme_type_variation = "CaptionLabel"
	extra_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_list.add_child(extra_note)
	add_footer_button("Reset to defaults", _reset)
	add_footer_button("Close  Esc", _done, true)


func _heading(text: String) -> Label:
	var label := Label.new()
	label.text = text.to_upper()
	label.add_theme_font_override("font", UiTheme.heading_font())
	label.add_theme_font_size_override("font_size", 14)
	label.add_theme_color_override("font_color", UiTheme.GOLD_DIM.lightened(0.25))
	return label


func _row(label_text: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var label := Label.new()
	label.text = label_text
	label.custom_minimum_size = Vector2(300, 0)
	row.add_child(label)
	return row


func _choice(label_text: String, options: Array, current: String, on_change: Callable) -> Control:
	var row := _row(label_text)
	var buttons: Array[Button] = []
	for option in options:
		var button := Button.new()
		button.text = option[1]
		button.toggle_mode = true
		button.button_pressed = option[0] == current
		button.focus_mode = Control.FOCUS_ALL
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_stylebox_override("pressed", UiTheme.button_style(Color("2c2414"), Color(UiTheme.GOLD, 0.85), 6))
		buttons.append(button)
		button.pressed.connect(func() -> void:
			for other in buttons:
				other.button_pressed = other == button
			on_change.call(option[0]))
		row.add_child(button)
	return row


func _toggle(label_text: String, current: bool, on_change: Callable) -> Control:
	var row := _row(label_text)
	var check := CheckButton.new()
	check.button_pressed = current
	check.focus_mode = Control.FOCUS_ALL
	check.toggled.connect(on_change)
	row.add_child(check)
	return row


func _slider(label_text: String, low: int, high: int, current: int, on_change: Callable, format := "%d") -> Control:
	var row := _row(label_text)
	var value_label := Label.new()
	value_label.custom_minimum_size = Vector2(56, 0)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value_label.add_theme_color_override("font_color", UiTheme.GOLD)
	value_label.text = format % current
	var slider := HSlider.new()
	slider.min_value = low
	slider.max_value = high
	slider.step = 1
	slider.value = current
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.focus_mode = Control.FOCUS_ALL
	slider.value_changed.connect(on_change)
	slider.value_changed.connect(func(v: float) -> void: value_label.text = format % int(v))
	row.add_child(slider)
	row.add_child(value_label)
	return row


func _refresh_world() -> void:
	if screen:
		screen.world.apply_settings()


func _reset() -> void:
	settings.reset_to_defaults()
	_save()
	# Everything the controls would apply as they change.
	if App.instance:
		App.instance.apply_ui_scale()
		App.instance.apply_fullscreen()
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(settings.master_volume, 0.0001)))
	if screen:
		screen.world.set_zoom_index(settings.default_zoom)
		screen.hud.minimap.apply_size()
		screen.hud.action_bar.relabel()
	_refresh_world()
	# Rebuilt in place: the dialog host keeps tracking this card.
	for box in [body, footer]:
		for child in box.get_children():
			box.remove_child(child)
			child.queue_free()
	setup(screen)
	GamepadRouter.focus_dialog.call_deferred(self)


func _done() -> void:
	_save()
	close()


func _save() -> void:
	if not settings.save() and screen:
		screen.hud.feed.flash_notice("Your settings couldn't be saved; they last until you quit.")


func handle_key(event: InputEventKey) -> bool:
	if event.keycode == KEY_ESCAPE:
		_done()
		return true
	# Tab, arrows, Space and Enter work the focused control.
	return false
