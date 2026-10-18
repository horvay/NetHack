class_name CodexScreen
extends DocumentCard
## NetHack's discoveries (\ and `) as a codex: one tab per object class,
## each discovery a card with its art, its name and the appearance it is
## known by ("runed dagger"), a mark for what the hero knew from the start
## (NetHack's "*"), and names the player gave ("called …"). Only what the
## discoveries list says. Any key or Esc closes it, as NetHack's window.

## NetHack's class headings and their map symbols (for the art).
const CLASS_SYMBOLS := {"weapons": ")", "armor": "[", "rings": "=", "amulets": "\"", "tools": "(", "comestibles": "%",
	"potions": "!", "scrolls": "?", "spellbooks": "+", "wands": "/", "coins": "$", "gems/stones": "*", "gems": "*",
	"boulders/statues": "`", "iron balls": "0", "chains": "_", "venoms": ".", "unique items": "(", "artifacts": ")"}

var screen: GameScreen
var groups: Array = []  # [{heading, symbol, entries: [{name, appearance, called, preknown, raw}]}]
var _tabs: TabContainer


static func recognises(lines: Array) -> bool:
	if lines.is_empty():
		return false
	# \ "Discoveries, by order…"; ` "Discovered weapons…", or a class heading
	# first ("Unique items or Relics", "Artifacts").
	var first := str(lines[0].get("text", "")).strip_edges()
	return first.begins_with("Discoveries") or first.begins_with("Discovered ") or first in ["Unique items or Relics", "Unique items", "Relics", "Artifacts"]


func setup(game_screen: GameScreen, lines: Array) -> void:
	screen = game_screen
	_parse(lines)
	card_width = 1180.0
	var count := 0
	for g in groups:
		count += (g.entries as Array).size()
	set_title("Discoveries", "%d object type%s known." % [count, "" if count == 1 else "s"] if count > 0 else "Nothing discovered yet.")
	_build()
	var close_button := add_footer_button("Close  Esc", close)
	set_meta("safe_focus", close_button)


func _parse(lines: Array) -> void:
	var current: Dictionary = {}
	var entry_re := RegEx.create_from_string("^(\\*\\s*)?(.+?)(?:\\s+\\((.+)\\))?$")
	for line in lines.slice(1):
		var text := str(line.get("text", "")).strip_edges()
		if text == "":
			continue
		var heading := text.to_lower()
		if int(line.get("attr", 0)) != 0 or CLASS_SYMBOLS.has(heading):
			current = {"heading": text, "symbol": str(CLASS_SYMBOLS.get(heading, "")), "entries": []}
			groups.append(current)
			continue
		if current.is_empty():
			continue
		var m := entry_re.search(text)
		if m == null:
			continue
		var name := m.get_string(2)
		var called := ""
		var cm := RegEx.create_from_string("^(.+?) called (.+)$").search(name)
		if cm:
			called = cm.get_string(2)
		(current.entries as Array).append({"name": name, "appearance": m.get_string(3), "called": called,
			"preknown": m.get_string(1) != "", "raw": text})


func _build() -> void:
	if groups.is_empty():
		var none := Label.new()
		none.text = "Nothing discovered yet. Identified objects and names you #call things appear here."
		none.theme_type_variation = "CaptionLabel"
		body.add_child(none)
		return
	_tabs = TabContainer.new()
	_tabs.custom_minimum_size = Vector2(0, 600)
	body.add_child(_tabs)
	for g in groups:
		var scroll := ScrollContainer.new()
		scroll.name = "%s (%d)" % [g.heading, (g.entries as Array).size()]
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		var grid := GridContainer.new()
		grid.columns = 3
		grid.add_theme_constant_override("h_separation", 10)
		grid.add_theme_constant_override("v_separation", 8)
		grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		scroll.add_child(grid)
		for entry in g.entries:
			grid.add_child(_card(entry, str(g.symbol)))
		_tabs.add_child(scroll)


func _card(entry: Dictionary, symbol: String) -> Control:
	var panel := PanelContainer.new()
	panel.name = "Disc_%s" % str(entry.name).replace(" ", "_")
	panel.set_meta("entry", entry)
	panel.custom_minimum_size = Vector2(360, 64)
	var style := UiTheme.panel_style(Color(1, 1, 1, 0.04), Color(1, 1, 1, 0.1), 10, 1, 0)
	style.content_margin_left = 8
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	panel.add_theme_stylebox_override("panel", style)
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 10)
	panel.add_child(line)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(44, 44)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var resolver := TileResolver.shared()
	var called := str(entry.called) != ""
	# A type only #called by the player: its appearance's art; else its own.
	var cell := {"char": symbol if symbol != "" else " ", "semanticKind": "object", "semanticKnown": not called,
		"semanticName": str(entry.name) if not called else "", "semanticAppearance": str(entry.appearance)}
	var id := resolver.asset_for_cell(cell)
	if id != "":
		icon.texture = resolver.texture(id)
	line.add_child(icon)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.add_theme_constant_override("separation", 0)
	line.add_child(words)
	var title := Label.new()
	title.text = str(entry.name).substr(0, 1).to_upper() + str(entry.name).substr(1)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.add_theme_font_override("font", UiTheme.bold_font())
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", UiTheme.GOLD if called else UiTheme.INK)
	words.add_child(title)
	var sub := Label.new()
	var bits: Array = []
	if str(entry.appearance) != "":
		bits.append(str(entry.appearance))
	if bool(entry.preknown):
		bits.append("known from the start")
	sub.text = "   ·   ".join(bits)
	sub.add_theme_font_size_override("font_size", 13)
	sub.add_theme_color_override("font_color", UiTheme.INK_DIM)
	words.add_child(sub)
	return panel


func handle_key(event: InputEventKey) -> bool:
	# Tab and arrows move between classes; any other key closes, as NetHack's
	# window.
	if event.pressed and _tabs and event.keycode in [KEY_TAB, KEY_LEFT, KEY_RIGHT]:
		var step := -1 if event.keycode == KEY_LEFT or event.shift_pressed else 1
		_tabs.current_tab = wrapi(_tabs.current_tab + step, 0, _tabs.get_tab_count())
		return true
	return super(event)
