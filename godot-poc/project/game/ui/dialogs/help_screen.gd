class_name HelpScreen
extends ModalCard
## The field guide: how to play, every control, what the screen is showing,
## and the survival lore new heroes learn the hard way.

const PAGES := [
	["Basics", """[b]Your quest[/b]
Descend through the Dungeons of Doom, find the Amulet of Yendor deep below, and bring it back up. Death is permanent — every run is a new life.

[b]Moving[/b]
Arrow keys, the number pad, or the classic [color=#e2b65f]h j k l y u b n[/color] keys step one square. Hold Shift to run. Left-click any square you have seen to walk there; NetHack plots the route.

[b]Fighting[/b]
Walk into a monster to attack it. [color=#e2b65f]F[/color] plus a direction attacks even what you cannot see. Your pet fights beside you — swap places by walking into it.

[b]Doing things[/b]
Right-click anything on the map for what you can do there. The bar at the bottom shows actions for the square you stand on. Press [color=#e2b65f]i[/color] for your pack, and the Commands button (or [color=#e2b65f]#[/color]) for every command.

[b]Waiting[/b]
NetHack is turn-based: nothing moves until you act. Take your time."""],
	["Controls", """[b]Movement[/b]   arrows · numpad · h j k l y u b n · Shift to run · click to travel · [color=#e2b65f]_[/color] travel · [color=#e2b65f]<[/color] [color=#e2b65f]>[/color] stairs
[b]Looking[/b]   hover to inspect · right-click for actions · [color=#e2b65f];[/color] look at · [color=#e2b65f]:[/color] look here · Tab map overview · Ctrl +/- or wheel to zoom
[b]Items[/b]   [color=#e2b65f]i[/color] pack · [color=#e2b65f],[/color] pick up · [color=#e2b65f]d[/color] drop · [color=#e2b65f]e[/color] eat · [color=#e2b65f]q[/color] drink · [color=#e2b65f]r[/color] read · [color=#e2b65f]a[/color] apply · [color=#e2b65f]z[/color] zap · [color=#e2b65f]t[/color] throw · [color=#e2b65f]f[/color] fire
[b]Equipment[/b]   [color=#e2b65f]w[/color] wield · [color=#e2b65f]x[/color] swap weapons · [color=#e2b65f]W[/color] wear · [color=#e2b65f]T[/color] take off · [color=#e2b65f]P[/color] put on · [color=#e2b65f]R[/color] remove · [color=#e2b65f]Q[/color] quiver
[b]Magic & gods[/b]   [color=#e2b65f]Z[/color] cast · [color=#e2b65f]+[/color] spells · [color=#e2b65f]#pray[/color] · [color=#e2b65f]#offer[/color]
[b]Doors & the world[/b]   [color=#e2b65f]o[/color] open · [color=#e2b65f]c[/color] close · Ctrl+D kick · [color=#e2b65f]s[/color] search · [color=#e2b65f]#loot[/color] · [color=#e2b65f]#force[/color] · [color=#e2b65f]#untrap[/color]
[b]Game[/b]   Esc menu · F2 message history · Ctrl+X character · [color=#e2b65f]S[/color] save and exit · [color=#e2b65f]?[/color] NetHack's own help

Every classic NetHack key works exactly as in the original. Prompts accept the letters NetHack asks for, and Esc cancels."""],
	["Reading the map", """[b]Light and memory[/b]
Squares you can see right now are lit. Places you remember but cannot see fade to cold blue-gray — monsters there may have moved. Black is unexplored.

[b]Rings under creatures[/b]
[color=#5af08c]Green[/color] — your pet.  [color=#73b3ff]Blue[/color] — peaceful (attacking angers them, and sometimes your god).  No ring — assume hostile.

[b]Glows[/b]
Stairs shimmer gold so you can find the way down. Fountains glow blue, altars glow warm, lava burns.

[b]Items[/b]
A gold dot on an item means a pile. In your pack, a blue frame means blessed, red means cursed, and white means uncursed — when you know. Unidentified items show only what your hero can see."""],
	["Survival", """• [b]Eat when Hungry[/b] — but be careful with corpses: old ones are poisonous and some are deadly.
• [b]Pray when in real trouble[/b] (very low HP, Weak from hunger) — but not too often. Your god needs time between favors.
• [b]Engrave Elbereth[/b] in the dust ([color=#e2b65f]E[/color], then [color=#e2b65f]-[/color] for fingers) to scare most monsters away.
• [b]Don't anger peacefuls[/b], shopkeepers or your god.
• [b]Unknown potions, scrolls and wands[/b] are a gamble. Price-identify in shops, or test them when it is safe.
• [b]Floating eyes[/b] (blue spheres): never hit them in melee.
• [b]Cockatrices[/b]: never touch or eat them without gloves and a cure.
• [b]Rest with[/b] [color=#e2b65f]20s[/color] to recover HP, but not where monsters gather.
• [b]Save often[/b] — [color=#e2b65f]S[/color] saves and exits; continue from the title screen."""],
]

var screen: GameScreen
var _text: RichTextLabel
var _tabs: HBoxContainer
var _scroll: ScrollContainer
var _manual: TextEdit
var _manual_bar: HBoxContainer
var _sections: OptionButton
var _matches: Label
var _search: LineEdit
var _page := 0


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	card_width = 940.0
	set_title("Field guide")
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	body.add_child(_tabs)
	for i in PAGES.size() + 1:
		var button := Button.new()
		button.text = PAGES[i][0] if i < PAGES.size() else "Manual"
		button.custom_minimum_size = Vector2(0, 42)
		button.focus_mode = Control.FOCUS_ALL
		button.pressed.connect(_show.bind(i))
		_tabs.add_child(button)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tabs.add_child(spacer)
	_search = LineEdit.new()
	_search.placeholder_text = "Search the guide…"
	_search.custom_minimum_size = Vector2(280, 40)
	_search.text_submitted.connect(_find)
	_tabs.add_child(_search)
	var scroll := ScrollContainer.new()
	_scroll = scroll
	scroll.custom_minimum_size = Vector2(900, 560)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	_manual = TextEdit.new()
	_manual.editable = false
	_manual.custom_minimum_size = Vector2(900, 560)
	_manual.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_manual.add_theme_font_override("font", UiTheme.body_font())
	_manual.add_theme_font_size_override("font_size", 18)
	_manual.add_theme_color_override("font_readonly_color", UiTheme.INK)
	_manual.add_theme_stylebox_override("read_only", UiTheme.panel_style(Color("0b0c11"), Color(1, 1, 1, 0.06), 6, 1, 0))
	_manual.add_theme_color_override("search_result_color", Color(UiTheme.GOLD, 0.35))
	_manual.add_theme_color_override("search_result_border_color", UiTheme.GOLD)
	_manual.add_theme_color_override("selection_color", Color(UiTheme.GOLD, 0.45))
	_manual.visible = false
	# Manual tools: jump to a section, and where the search is.
	_manual_bar = HBoxContainer.new()
	_manual_bar.add_theme_constant_override("separation", 10)
	_manual_bar.visible = false
	body.add_child(_manual_bar)
	_sections = OptionButton.new()
	_sections.custom_minimum_size = Vector2(520, 38)
	_sections.fit_to_longest_item = false
	_sections.item_selected.connect(func(index: int) -> void:
		var line := _sections.get_item_id(index)
		_manual.set_caret_line(line)
		_manual.set_line_as_first_visible(line))
	_manual_bar.add_child(_sections)
	_matches = Label.new()
	_matches.theme_type_variation = "CaptionLabel"
	_manual_bar.add_child(_matches)
	body.add_child(_manual)
	_text = RichTextLabel.new()
	_text.bbcode_enabled = true
	_text.fit_content = true
	_text.custom_minimum_size = Vector2(880, 0)
	_text.add_theme_font_override("normal_font", UiTheme.body_font())
	_text.add_theme_font_override("bold_font", UiTheme.bold_font())
	_text.add_theme_font_size_override("normal_font_size", 20)
	_text.add_theme_font_size_override("bold_font_size", 20)
	_text.add_theme_color_override("default_color", UiTheme.INK)
	scroll.add_child(_text)
	add_footer_button("Close  Esc", close, true)
	_show(0)


func _show(index: int) -> void:
	_page = index
	var manual := index >= PAGES.size()
	_scroll.visible = not manual
	_manual.visible = manual
	_manual_bar.visible = manual
	if manual:
		if _manual.text == "":
			# NetHack's Guidebook, reflowed by tools/clean_guidebook.py.
			_manual.text = FileAccess.get_file_as_string("res://assets/text/manual.txt")
			var heading := RegEx.create_from_string("^(\\d+)(\\.\\d+)?\\.\\s\\s(\\S.*)$")
			for line in _manual.get_line_count():
				var found := heading.search(_manual.get_line(line))
				if found:
					var sub := found.get_string(2) != ""
					_sections.add_item(("      " if sub else "") + _manual.get_line(line), line)
	else:
		_text.text = PAGES[index][1]
	for i in PAGES.size() + 1:
		var button: Button = _tabs.get_child(i)
		if i == index:
			button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("2c2414"), Color(UiTheme.GOLD, 0.85), 6))
		else:
			button.remove_theme_stylebox_override("normal")


## Enter in the search box: in the manual, jump to the next match; on the
## guide pages, open the first page that mentions the words.
func _find(query: String) -> void:
	var needle := query.strip_edges()
	if needle == "":
		return
	if _page < PAGES.size():
		for i in PAGES.size():
			if str(PAGES[i][1]).to_lower().contains(needle.to_lower()):
				_show(i)
				return
		_show(PAGES.size())
	var from_line := _manual.get_caret_line()
	var from_col := _manual.get_caret_column() + 1
	if from_col > _manual.get_line(from_line).length():
		from_line = (from_line + 1) % maxi(1, _manual.get_line_count())
		from_col = 0
	var found := _manual.search(needle, 0, from_line, from_col)
	if found.x < 0:
		found = _manual.search(needle, 0, 0, 0)
	_manual.set_search_text(needle)
	_count_matches(needle, found)
	if found.x >= 0:
		_manual.select(found.y, found.x, found.y, found.x + needle.length())
		_manual.set_caret_line(found.y)
		_manual.set_caret_column(found.x)
		_manual.center_viewport_to_caret()


## "3 of 17 matches" for the search in the manual.
func _count_matches(needle: String, current: Vector2i) -> void:
	var total := 0
	var index := 0
	var lower := needle.to_lower()
	for line in _manual.get_line_count():
		var text := _manual.get_line(line).to_lower()
		var at := text.find(lower)
		while at >= 0:
			total += 1
			if line == current.y and at == current.x:
				index = total
			at = text.find(lower, at + 1)
	_matches.text = ("%d of %d %s" % [index, total, "match" if total == 1 else "matches"]) if total > 0 else "No matches"
	# Keep the section list on the section the match is in.
	for i in range(_sections.item_count - 1, -1, -1):
		if _sections.get_item_id(i) <= current.y:
			_sections.select(i)
			break


func handle_key(event: InputEventKey) -> bool:
	if _search.has_focus():
		if event.keycode == KEY_ESCAPE:
			_search.release_focus()
			return true
		return false
	match event.keycode:
		KEY_ESCAPE:
			close()
			return true
		KEY_LEFT, KEY_RIGHT:
			if not (get_viewport().gui_get_focus_owner() is OptionButton):
				_show(clampi(_page + (1 if event.keycode == KEY_RIGHT else -1), 0, PAGES.size()))
				return true
	return false
