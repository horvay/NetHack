class_name SkillsScreen
extends ModalCard
## NetHack's #enhance as a real screen: the skills in NetHack's own groups
## (Fighting, Weapon, Spellcasting), each with its icon, its rank as pips
## along Unskilled → Basic → Skilled → Expert → Master → Grand Master, and
## what NetHack says about it: ready to advance (a gold Advance button, the
## next rank and its slot cost), would advance with more skill slots, or at
## its peak. The free slots show at the top.
##
## NetHack still does the advancing: Advance (or the skill's classic letter)
## answers its menu, and NetHack shows the menu again while more can be
## advanced. Esc closes it. Only what #enhance itself shows is shown.

const RANKS := ["Unskilled", "Basic", "Skilled", "Expert", "Master", "Grand Master"]
## Icons for skills that aren't an object's name.
const SKILL_ICONS := {"saber": "silver-saber", "hammer": "war-hammer", "whip": "bullwhip", "bare handed combat": "gloves", "martial arts": "gloves", "two weapon combat": "weapon-class-icon",
	"riding": "saddle", "polearms": "halberd", "unicorn horn": "unicorn-horn", "attack spells": "spellbook-class-icon",
	"healing spells": "spellbook-class-icon", "divination spells": "spellbook-class-icon", "enchantment spells": "spellbook-class-icon",
	"clerical spells": "spellbook-class-icon", "escape spells": "spellbook-class-icon", "matter spells": "spellbook-class-icon"}

var screen: GameScreen
var request: Dictionary = {}
var rows: Array = []
var slots := -1
var _answered := false


func setup(game_screen: GameScreen, p_request: Dictionary, magic: Dictionary) -> void:
	screen = game_screen
	request = p_request
	rows = magic.get("rows", [])
	slots = int(magic.get("slots", -1))
	card_width = 1180.0
	var ready: Array = rows.filter(func(r: Dictionary) -> bool: return bool(r.get("canAdvance", false)))
	var subtitle := ""
	if not ready.is_empty():
		subtitle = "%d skill%s ready to advance" % [ready.size(), "" if ready.size() == 1 else "s"]
	else:
		subtitle = "Your training in weapons, fighting and magic."
	if slots >= 0:
		subtitle += "   ·   %d skill slot%s free" % [slots, "" if slots == 1 else "s"]
	set_title("Skills", subtitle)
	_build()
	var close_button := add_footer_button("Close  Esc", _cancel)
	set_meta("safe_focus", close_button)


func _build() -> void:
	var groups := {}
	var order: Array = []
	for row in rows:
		var group := str(row.get("group", "Skills"))
		if not groups.has(group):
			groups[group] = []
			order.append(group)
		(groups[group] as Array).append(row)
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 14)
	body.add_child(columns)
	for group in order:
		var column := VBoxContainer.new()
		column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_theme_constant_override("separation", 6)
		columns.add_child(column)
		var heading := Label.new()
		heading.text = str(group).to_upper()
		heading.add_theme_font_override("font", UiTheme.heading_font())
		heading.add_theme_font_size_override("font_size", 16)
		heading.add_theme_color_override("font_color", UiTheme.GOLD)
		column.add_child(heading)
		var scroll := ScrollContainer.new()
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		scroll.custom_minimum_size = Vector2(0, 520)
		scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
		column.add_child(scroll)
		var list := VBoxContainer.new()
		list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		list.add_theme_constant_override("separation", 6)
		scroll.add_child(list)
		# Ready ones first, then the rest in NetHack's order.
		var sorted: Array = (groups[group] as Array).duplicate()
		sorted.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return bool(a.get("canAdvance", false)) and not bool(b.get("canAdvance", false)))
		for row in sorted:
			list.add_child(_skill_row(row))


func _skill_row(row: Dictionary) -> Control:
	var name := str(row.get("name", ""))
	var ready := bool(row.get("canAdvance", false))
	var could := bool(row.get("couldAdvance", false))
	var peaked := bool(row.get("peaked", false))
	var panel := PanelContainer.new()
	panel.name = "Skill_%s" % name.replace(" ", "_")
	panel.set_meta("skill", row)
	var fill := Color(UiTheme.GOLD, 0.14) if ready else Color(1, 1, 1, 0.04)
	var border := Color(UiTheme.GOLD, 0.9) if ready else Color(1, 1, 1, 0.08)
	var style := UiTheme.panel_style(fill, border, 10, 2 if ready else 1, 0)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	panel.add_theme_stylebox_override("panel", style)
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 10)
	panel.add_child(line)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(40, 40)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	icon.texture = _icon_for(name)
	line.add_child(icon)
	var words := VBoxContainer.new()
	words.add_theme_constant_override("separation", 0)
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(words)
	var title := Label.new()
	# NetHack's own name, first letter up ("Two-handed sword").
	title.text = name.substr(0, 1).to_upper() + name.substr(1)
	title.add_theme_font_override("font", UiTheme.bold_font())
	title.add_theme_font_size_override("font_size", 17)
	title.add_theme_color_override("font_color", UiTheme.GOLD if ready else UiTheme.INK)
	words.add_child(title)
	var current := str(row.get("currentRank", ""))
	var rank_line := HBoxContainer.new()
	rank_line.add_theme_constant_override("separation", 8)
	words.add_child(rank_line)
	var pips := SkillPips.new()
	pips.setup(RANKS.find(current), RANKS.find(str(row.get("nextRank", ""))) if ready else -1, peaked)
	rank_line.add_child(pips)
	var rank := Label.new()
	rank.add_theme_font_size_override("font_size", 14)
	rank.add_theme_color_override("font_color", UiTheme.INK_DIM)
	if ready:
		rank.text = "%s → %s" % [current, str(row.get("nextRank", ""))]
		rank.add_theme_color_override("font_color", UiTheme.GOLD)
	elif peaked:
		rank.text = "%s · at its peak" % current
	elif could:
		rank.text = "%s · needs more skill slots" % current
	else:
		rank.text = current
	rank_line.add_child(rank)
	if ready:
		var cost := int(row.get("nextCost", 0))
		var button := Button.new()
		button.text = "Advance" + ("  (%d slot%s)" % [cost, "" if cost == 1 else "s"] if cost > 0 else "") + ("  %s" % str(row.get("selector", "")) if str(row.get("selector", "")) != "" and not GamepadRouter.active else "")
		button.custom_minimum_size = Vector2(0, 40)
		button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("4a3a12"), Color(UiTheme.GOLD, 0.95), 8))
		button.pressed.connect(_advance.bind(row))
		line.add_child(button)
		if Motion.enabled():
			var tween := panel.create_tween().set_loops()
			tween.tween_property(panel, "modulate", Color(1.15, 1.12, 1.0), 0.9).set_trans(Tween.TRANS_SINE)
			tween.tween_property(panel, "modulate", Color.WHITE, 0.9).set_trans(Tween.TRANS_SINE)
	return panel


func _icon_for(name: String) -> Texture2D:
	var resolver := TileResolver.shared()
	var key := name.to_lower()
	var id: String = SKILL_ICONS.get(key, "")
	if id == "" or not resolver.has_asset(id):
		id = resolver.asset_for_semantic_name(key, "object")
	if id == "" or not resolver.has_asset(id):
		id = "spellbook-class-icon" if key.ends_with("spells") else "weapon-class-icon"
	return resolver.texture(id) if resolver.has_asset(id) else null


func _advance(row: Dictionary) -> void:
	var selector := str(row.get("selector", ""))
	if selector == "" or _answered:
		return
	_answered = true
	screen.send_keys(selector)
	close()


func _cancel() -> void:
	if not _answered:
		_answered = true
		screen.send_keycode(27)
	close()


func handle_key(event: InputEventKey) -> bool:
	if event.keycode == KEY_ESCAPE:
		_cancel()
		return true
	# The classic letters still advance a skill.
	var typed := InputRouter.key_to_nethack(event)
	for row in rows:
		if bool(row.get("canAdvance", false)) and str(row.get("selector", "")) == typed and typed != "":
			_advance(row)
			return true
	return false
