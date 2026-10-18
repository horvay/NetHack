class_name ChoiceScreen
extends ModalCard
## NetHack's small pick-one menus as large tiles, one per choice, each with
## its art and NetHack's own words:
##   - #name / C "What do you want to name?";
##   - #terrain "View which?";
##   - / "What do you want to look at:".
## A click or the row's letter answers, as in NetHack; Enter takes the
## highlighted (preselected) choice; Esc cancels.

## Per menu: [prompt prefix, title, subtitle, [[row text prefix, icon id], ...]].
const MENUS := [
	["What do you want to name", "Name or call", "Give a name to one thing, or call a whole kind of thing something.", [
		["a monster", "newt"], ["a particular object", "pickup-action-icon"], ["the type of an object in inventory", "potion-class-icon"],
		["the type of an object upon the floor", "gem-class-icon"], ["the type of an object on discoveries", "crystal-ball"],
		["record an annotation", "magic-mapping"]]],
	["View which", "Show terrain", "See the level as you remember it, with things out of the way.", [
		["known map without monsters, objects, and traps", "magic-mapping"], ["known map without monsters and objects", "arrow-trap"],
		["known map without monsters", "large-box"], ["full map", "crystal-ball"], ["internal levl", "magic-mapping"],
		["legacy", "magic-mapping"]]],
	["What do you want to look at", "Look at", "Pick what to look up.", [
		["something on the map", "valid-position-marker"], ["something you're carrying", "pickup-action-icon"],
		["something else", "lenses"], ["nearby monsters", "newt"], ["all monsters", "floating-eye"],
		["nearby objects", "large-box"], ["all objects", "gem-class-icon"], ["nearby traps", "arrow-trap"],
		["all seen or remembered traps", "arrow-trap"], ["nearby engravings", "engraving"], ["all seen or remembered engravings", "engraving"]]],
]

var screen: GameScreen
var request: Dictionary
var choices: Array = []  # [{selector, text, icon, preselected, button}]
var _answered := false


## The menu's entry in MENUS, or [] when this isn't one of them.
static func menu_for(request: Dictionary) -> Array:
	var prompt := str(request.get("prompt", "")).strip_edges()
	for menu in MENUS:
		if prompt.begins_with(menu[0]):
			return menu
	return []


func setup(game_screen: GameScreen, p_request: Dictionary) -> void:
	screen = game_screen
	request = p_request
	var menu := menu_for(request)
	card_width = 860.0
	set_title(menu[1], menu[2])
	for item in request.get("items", []):
		var selector := int(item.get("selector", 0))
		var text := str(item.get("text", "")).strip_edges()
		if selector == 0 or text == "":
			continue
		var icon := ""
		for pair in menu[3]:
			if text.begins_with(pair[0]):
				icon = pair[1]
				break
		choices.append({"selector": char(selector), "text": text, "icon": icon, "preselected": int(item.get("itemflags", 0)) & 0x1 != 0})
	_build()
	add_footer_button("Cancel  Esc", _cancel)


func _build() -> void:
	var grid := GridContainer.new()
	grid.columns = 3 if choices.size() != 4 else 2
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	body.add_child(grid)
	var focus: Button = null
	for choice in choices:
		var button := _tile(choice)
		choice["button"] = button
		grid.add_child(button)
		if focus == null or bool(choice.preselected):
			focus = button
	if focus:
		set_meta("safe_focus", focus)


func _tile(choice: Dictionary) -> Button:
	var button := Button.new()
	button.name = "Choice_%s" % choice.selector
	button.custom_minimum_size = Vector2(264, 150)
	button.focus_mode = Control.FOCUS_ALL
	button.tooltip_text = str(choice.text)
	var lit := bool(choice.preselected)
	button.add_theme_stylebox_override("normal", UiTheme.panel_style(Color(UiTheme.GOLD, 0.12) if lit else Color(1, 1, 1, 0.04), Color(UiTheme.GOLD, 0.7) if lit else Color(1, 1, 1, 0.12), 12, 1, 0))
	button.add_theme_stylebox_override("hover", UiTheme.panel_style(Color(UiTheme.GOLD, 0.16), Color(UiTheme.GOLD, 0.9), 12, 2, 0))
	button.add_theme_stylebox_override("focus", UiTheme.panel_style(Color(0, 0, 0, 0), Color(UiTheme.GOLD, 1.0), 12, 2, 0))
	button.add_theme_stylebox_override("pressed", UiTheme.panel_style(Color(UiTheme.GOLD, 0.24), Color(UiTheme.GOLD, 1.0), 12, 2, 0))
	button.pressed.connect(_pick.bind(choice))
	var column := VBoxContainer.new()
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 10)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 6)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(column)
	var resolver := TileResolver.shared()
	if str(choice.icon) != "" and resolver.has_asset(str(choice.icon)):
		var icon := TextureRect.new()
		icon.custom_minimum_size = Vector2(0, 64)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		icon.texture = resolver.texture(str(choice.icon))
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(icon)
	var label := Label.new()
	label.text = str(choice.text).substr(0, 1).to_upper() + str(choice.text).substr(1)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", UiTheme.INK)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(label)
	var key := Label.new()
	key.text = str(choice.selector)
	key.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	key.add_theme_font_override("font", UiTheme.bold_font())
	key.add_theme_font_size_override("font_size", 14)
	key.add_theme_color_override("font_color", UiTheme.GOLD)
	key.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(key)
	return button


func _pick(choice: Dictionary) -> void:
	if _answered:
		return
	_answered = true
	screen.send_keys(str(choice.selector))
	close()


func _cancel() -> void:
	if not _answered:
		_answered = true
		screen.send_keycode(27)
	close()


func handle_key(event: InputEventKey) -> bool:
	if not event.pressed:
		return true
	if event.keycode == KEY_ESCAPE:
		_cancel()
		return true
	# Enter and Space are the focused tile's (the preselected one at first).
	if event.keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE, KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN, KEY_TAB]:
		return false
	var typed := InputRouter.key_to_nethack(event)
	for choice in choices:
		if typed != "" and str(choice.selector) == typed:
			_pick(choice)
			return true
	return true
