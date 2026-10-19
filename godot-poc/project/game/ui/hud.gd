class_name Hud
extends CanvasLayer
## Always-on game interface: the hero card (portrait, HP/Pw, key stats,
## conditions), the message feed, the hover inspector and the action bar.

var screen: GameScreen
var state: GameState
var root: Control
var portrait: TextureRect
## The asset the portrait shows (a monster's while polymorphed).
var portrait_asset := ""
var portrait_invisible := false
var name_label: Label
var title_label: Label
var hp_bar: StatBar
var pw_bar: StatBar
var stats_row: HBoxContainer
var conditions_row: HFlowContainer
var feed: MessageFeed
var inspector: CellInspector
var action_bar: ActionBar
var level_banner: Label
var minimap: MiniMap
var pile_peek: PilePeek
var fade: ColorRect
var _stat_labels: Dictionary = {}
var hero_card: PanelContainer
## The full status line (attributes, score, experience), shown while the
## pointer is over the hero card or always (Settings).
var details: VBoxContainer
var _detail_labels: Dictionary = {}


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	state = screen.state
	layer = 10
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiTheme.theme()
	add_child(root)
	_build_hero_card()
	var feed_backing := TextureRect.new()
	var gradient := GradientTexture2D.new()
	gradient.gradient = Gradient.new()
	gradient.gradient.set_color(0, Color(0.01, 0.01, 0.02, 0.0))
	gradient.gradient.set_color(1, Color(0.01, 0.01, 0.02, 0.78))
	gradient.fill_from = Vector2(0, 0)
	gradient.fill_to = Vector2(0, 1)
	feed_backing.texture = gradient
	feed_backing.stretch_mode = TextureRect.STRETCH_SCALE
	feed_backing.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	feed_backing.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	feed_backing.offset_top = -360
	feed_backing.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(feed_backing)
	feed = MessageFeed.new()
	feed.setup(state)
	feed.history_requested.connect(func() -> void: screen.input_router.open_ui("history"))
	feed.covered = func() -> bool: return screen.dialogs != null and screen.dialogs.owns_input()
	root.add_child(feed)
	inspector = CellInspector.new()
	inspector.setup(screen)
	root.add_child(inspector)
	state.map_changed.connect(inspector.refresh.call_deferred)
	action_bar = ActionBar.new()
	action_bar.setup(screen)
	root.add_child(action_bar)
	pile_peek = PilePeek.new()
	pile_peek.setup(screen)
	root.add_child(pile_peek)
	minimap = MiniMap.new()
	minimap.setup(screen)
	root.add_child(minimap)
	fade = ColorRect.new()
	fade.color = Color(0, 0, 0, 0)
	fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(fade)
	root.move_child(fade, 0)
	_build_level_banner()
	state.status_changed.connect(_refresh_status)
	state.map_changed.connect(_refresh_portrait)
	state.skill_ready_changed.connect(func(_ready: bool) -> void: _refresh_conditions())
	state.hero_moved.connect(func(_f: Vector2i, _t: Vector2i) -> void: _refresh_status())
	state.command_refused.connect(func(reason: String) -> void: feed.flash_notice(ItemText.sentence(reason)))
	state.level_changed.connect(_on_level_changed)
	state.level_changed.connect(func(_d: int) -> void: _refresh_status())


func _build_hero_card() -> void:
	var card := PanelContainer.new()
	hero_card = card
	card.position = Vector2(18, 16)
	card.add_theme_stylebox_override("panel", UiTheme.panel_style(UiTheme.PANEL, UiTheme.LINE, 12, 1, 22))
	root.add_child(card)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	card.add_child(row)

	var frame := PanelContainer.new()
	var frame_style := UiTheme.panel_style(Color("0a0b10"), Color(UiTheme.GOLD, 0.55), 10, 2, 0)
	frame_style.set_content_margin_all(3)
	frame.add_theme_stylebox_override("panel", frame_style)
	row.add_child(frame)
	portrait = TextureRect.new()
	portrait.custom_minimum_size = Vector2(88, 88)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	frame.add_child(portrait)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 5)
	row.add_child(column)
	name_label = Label.new()
	name_label.theme_type_variation = "HeaderLabel"
	name_label.add_theme_font_size_override("font_size", 22)
	column.add_child(name_label)
	title_label = Label.new()
	title_label.theme_type_variation = "CaptionLabel"
	column.add_child(title_label)
	hp_bar = StatBar.new(UiTheme.HP, "HP")
	column.add_child(hp_bar)
	pw_bar = StatBar.new(UiTheme.ENERGY, "Pw")
	pw_bar.custom_minimum_size = hp_bar.custom_minimum_size
	column.add_child(pw_bar)
	stats_row = HBoxContainer.new()
	stats_row.add_theme_constant_override("separation", 12)
	column.add_child(stats_row)
	for key in ["Dlvl", "Lv", "AC", "$", "T"]:
		var chip := Label.new()
		chip.add_theme_font_size_override("font_size", 16)
		chip.add_theme_color_override("font_color", UiTheme.INK_DIM)
		chip.tooltip_text = {"Dlvl": "Dungeon level", "Lv": "Experience level", "AC": "Armor class (lower is better)", "$": "Gold", "T": "Turns"}[key]
		chip.mouse_filter = Control.MOUSE_FILTER_PASS
		stats_row.add_child(chip)
		_stat_labels[key] = chip
	conditions_row = HFlowContainer.new()
	conditions_row.add_theme_constant_override("h_separation", 6)
	conditions_row.add_theme_constant_override("v_separation", 4)
	conditions_row.custom_minimum_size = Vector2(220, 0)
	column.add_child(conditions_row)
	_build_details(column)


const ATTRIBUTES := [["St", StatusModel.Field.STR, "Strength"], ["Dx", StatusModel.Field.DX, "Dexterity"],
	["Co", StatusModel.Field.CO, "Constitution"], ["In", StatusModel.Field.IN, "Intelligence"],
	["Wi", StatusModel.Field.WI, "Wisdom"], ["Ch", StatusModel.Field.CH, "Charisma"]]


func _build_details(column: VBoxContainer) -> void:
	details = VBoxContainer.new()
	details.add_theme_constant_override("separation", 4)
	details.visible = false
	column.add_child(details)
	# Covers the card's children too (Godot 4.2+ hover semantics), as long
	# as none of them stops the mouse first.
	for child in hero_card.find_children("*", "Control", true, false):
		if (child as Control).mouse_filter == Control.MOUSE_FILTER_STOP:
			(child as Control).mouse_filter = Control.MOUSE_FILTER_PASS
	hero_card.mouse_entered.connect(_on_card_hover.bind(true))
	hero_card.mouse_exited.connect(_on_card_hover.bind(false))
	if App.instance:
		App.instance.settings.changed.connect(_refresh_details_visibility)
	_refresh_details_visibility.call_deferred()
	var rule := ColorRect.new()
	rule.color = Color(UiTheme.GOLD, 0.25)
	rule.custom_minimum_size = Vector2(0, 1)
	details.add_child(rule)
	var attributes := HBoxContainer.new()
	attributes.add_theme_constant_override("separation", 12)
	details.add_child(attributes)
	for spec in ATTRIBUTES:
		var label := Label.new()
		label.add_theme_font_size_override("font_size", 16)
		label.tooltip_text = spec[2]
		label.mouse_filter = Control.MOUSE_FILTER_PASS
		attributes.add_child(label)
		_detail_labels[spec[1]] = label
	var progress := HBoxContainer.new()
	progress.add_theme_constant_override("separation", 12)
	details.add_child(progress)
	for spec in [[StatusModel.Field.EXP, "Experience points"], [StatusModel.Field.SCORE, "Score"], [StatusModel.Field.TERRAIN, "What the hero stands on"]]:
		var label := Label.new()
		label.add_theme_font_size_override("font_size", 16)
		label.add_theme_color_override("font_color", UiTheme.INK_DIM)
		label.tooltip_text = spec[1]
		label.mouse_filter = Control.MOUSE_FILTER_PASS
		progress.add_child(label)
		_detail_labels[spec[0]] = label


var _card_hovered := false


func _process(_delta: float) -> void:
	# The level banner never peeks out from behind a dialog.
	level_banner.visible = not screen.dialogs.owns_input()


func _on_card_hover(hovered: bool) -> void:
	_card_hovered = hovered
	_refresh_details_visibility()


func _refresh_details_visibility() -> void:
	var show := _card_hovered or (App.instance != null and App.instance.settings.detailed_status)
	if details.visible != show:
		details.visible = show
		hero_card.reset_size()


func _build_level_banner() -> void:
	level_banner = Label.new()
	level_banner.theme_type_variation = "HeaderLabel"
	level_banner.add_theme_font_size_override("font_size", 40)
	level_banner.add_theme_constant_override("outline_size", 10)
	level_banner.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	level_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	level_banner.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	# A dark band behind it, so it reads as a title card over the map, not
	# text painted on the walls.
	var band := StyleBoxFlat.new()
	band.bg_color = Color(0.02, 0.02, 0.03, 0.72)
	band.border_color = Color(UiTheme.GOLD, 0.35)
	band.border_width_top = 1
	band.border_width_bottom = 1
	band.content_margin_top = 10
	band.content_margin_bottom = 10
	level_banner.add_theme_stylebox_override("normal", band)
	level_banner.set_anchors_preset(Control.PRESET_CENTER_TOP)
	# Below the minimap, so the two never overlap.
	level_banner.position = Vector2(-520, 236)
	level_banner.size = Vector2(1040, 76)
	level_banner.modulate.a = 0.0
	level_banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(level_banner)
	minimap.size_changed.connect(_place_level_banner)


## Below the minimap, so the two never overlap (it grows with Settings >
## Minimap).
func _place_level_banner() -> void:
	level_banner.position.y = maxf(236.0, minimap.offset_top + minimap.get_combined_minimum_size().y + 14.0)


## The hero's portrait, or the monster's tile while polymorphed; faded
## while the hero is invisible.
func _refresh_portrait() -> void:
	var resolver := TileResolver.shared()
	var hero_cell := state.map.cell(state.map.hero) if state.map.hero.x >= 0 else {}
	portrait_invisible = hero_cell.get("heroInvisible", false) == true
	portrait.modulate.a = ActorLayer.INVISIBLE_HERO_ALPHA if portrait_invisible else 1.0
	portrait.tooltip_text = "Invisible" if portrait_invisible else ""
	var asset := resolver.hero_form_asset(hero_cell)
	if asset == "":
		asset = resolver.player_avatar_id(state.character)
	if asset == portrait_asset:
		return
	portrait_asset = asset
	portrait.texture = resolver.portrait(asset)
	# Monster tiles are pixel art; the hero's portrait is painted.
	portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR if resolver.assets.get(asset, {}).get("portrait", false) else CanvasItem.TEXTURE_FILTER_NEAREST


func _refresh_status() -> void:
	var status := state.status
	var character := state.character
	_refresh_portrait()
	name_label.text = str(character.get("name", ""))
	var title := status.title()
	var dash := title.find(" the ")
	title_label.text = ItemText.sentence(title.substr(dash + 1) if dash >= 0 else title) + "  ·  " + _alignment_word(status.text(StatusModel.Field.ALIGN))
	hp_bar.set_values(status.hp(), status.hp_max())
	pw_bar.set_values(status.energy(), status.energy_max())
	_stat_labels["Dlvl"].text = state.level_name()
	_stat_labels["Dlvl"].tooltip_text = state.level_name(true)
	# While polymorphed NetHack reports hit dice instead of a level.
	var hit_dice := status.number(StatusModel.Field.HD) if status.polymorphed else 0
	_stat_labels["Lv"].text = ("HD %d" % hit_dice) if hit_dice > 0 else "Lv " + status.text(StatusModel.Field.XP)
	_stat_labels["Lv"].tooltip_text = "Hit dice (polymorphed)" if hit_dice > 0 else "Experience level"
	_stat_labels["AC"].text = "AC " + status.text(StatusModel.Field.AC)
	_stat_labels["$"].text = "◆ " + status.text(StatusModel.Field.GOLD)
	_stat_labels["T"].text = ("T " + status.text(StatusModel.Field.TIME)) if status.text(StatusModel.Field.TIME) != "" else ""
	for spec in ATTRIBUTES:
		var value := status.text(spec[1])
		var label: Label = _detail_labels[spec[1]]
		label.text = "%s %s" % [spec[0], value] if value != "" else ""
		label.add_theme_color_override("font_color", UiTheme.nh_color(int(status.colors.get(spec[1], UiTheme.NO_COLOR)), UiTheme.INK))
	var exp := status.text(StatusModel.Field.EXP)
	_detail_labels[StatusModel.Field.EXP].text = ("%s experience points" % exp) if exp != "" else ""
	var score := status.text(StatusModel.Field.SCORE)
	_detail_labels[StatusModel.Field.SCORE].text = ("Score %s" % score) if score != "" else ""
	var terrain := status.text(StatusModel.Field.TERRAIN).strip_edges()
	if terrain == "":
		terrain = CellDescriber.ground_under_hero(state)
	_detail_labels[StatusModel.Field.TERRAIN].text = ("On " + terrain.to_lower()) if terrain != "" else ""
	for pair in [["Lv", StatusModel.Field.XP], ["AC", StatusModel.Field.AC], ["$", StatusModel.Field.GOLD], ["T", StatusModel.Field.TIME]]:
		# NetHack's status highlights (hilite_status), when the player set any.
		var color := UiTheme.nh_color(int(status.colors.get(pair[1], UiTheme.NO_COLOR)), UiTheme.INK_DIM)
		if color != UiTheme.INK_DIM:
			_stat_labels[pair[0]].add_theme_color_override("font_color", color)
	for key in ["Dlvl", "Lv", "AC", "$"]:
		var label: Label = _stat_labels[key]
		if label.has_meta("last") and label.get_meta("last") != label.text:
			_pulse(label)
		label.set_meta("last", label.text)
	_refresh_conditions()


## A stat that just changed flashes gold for a moment.
func _pulse(label: Label) -> void:
	label.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.3))
	label.pivot_offset = label.size / 2.0
	var tween := label.create_tween()
	# Reduced motion keeps the gold highlight, without the bounce.
	if Motion.enabled():
		tween.tween_property(label, "scale", Vector2(1.25, 1.25), 0.1)
		tween.tween_property(label, "scale", Vector2.ONE, 0.25)
	tween.tween_callback(func() -> void: label.add_theme_color_override("font_color", UiTheme.INK_DIM)).set_delay(0.8)


func _alignment_word(value: String) -> String:
	return value.strip_edges()


var _conditions_key := ""


## The hero's statuses as badges under the stats: an icon, the name, the
## tier's colour (yellow mild, orange serious, red deadly), a pulse for
## serious and deadly ones, and the meaning on hover. Neutral states
## (Levitating, Riding…) are small and grey.
func _refresh_conditions() -> void:
	var effects := StatusEffects.current(state.status)
	var key := ",".join(effects.map(func(e: Dictionary) -> String: return str(e.id))) + (",skill" if state.skill_ready else "")
	if key == _conditions_key:
		return
	_conditions_key = key
	for child in conditions_row.get_children():
		child.queue_free()
	if state.skill_ready:
		# Good news, kept until used: click to open the skills screen.
		var skill := Button.new()
		skill.name = "Status_skill"
		skill.text = "Skill ready"
		skill.focus_mode = Control.FOCUS_NONE
		skill.tooltip_text = "You can advance a skill: open the skills screen (#enhance)."
		skill.add_theme_font_override("font", UiTheme.bold_font())
		skill.add_theme_font_size_override("font_size", 16)
		skill.add_theme_color_override("font_color", UiTheme.GOLD)
		skill.add_theme_stylebox_override("normal", UiTheme.button_style(Color(UiTheme.GOLD, 0.18), Color(UiTheme.GOLD, 0.9), 8))
		skill.pressed.connect(func() -> void: screen.input_router.send_command("#enhance\n"))
		conditions_row.add_child(skill)
	for effect in effects:
		conditions_row.add_child(_status_badge(effect))


func _status_badge(effect: Dictionary) -> Control:
	var color := StatusEffects.color(effect)
	var neutral: bool = effect.tier == "neutral"
	var badge := PanelContainer.new()
	badge.name = "Status_%s" % str(effect.id)
	badge.tooltip_text = "%s: %s" % [effect.label, effect.meaning] if str(effect.meaning) != "" else str(effect.label)
	badge.mouse_filter = Control.MOUSE_FILTER_PASS
	var style := UiTheme.panel_style(Color(color, 0.08 if neutral else 0.22), Color(color, 0.35 if neutral else 0.9), 8, 1 if neutral else 2, 0)
	style.content_margin_left = 6
	style.content_margin_right = 10
	style.content_margin_top = 2
	style.content_margin_bottom = 2
	badge.add_theme_stylebox_override("panel", style)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.add_child(row)
	if not neutral:
		var icon := StatusMark.new()
		icon.setup(effect, 26)
		row.add_child(icon)
	var label := Label.new()
	label.text = str(effect.label)
	label.add_theme_font_override("font", UiTheme.bold_font() if not neutral else UiTheme.body_font())
	label.add_theme_font_size_override("font_size", 13 if neutral else 17)
	label.add_theme_color_override("font_color", color.lightened(0.25) if not neutral else UiTheme.INK_DIM)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(label)
	if effect.tier in ["serious", "deadly"] and Motion.enabled():
		# A slow heartbeat on the badge (faster when deadly).
		var beat := 0.55 if effect.tier == "deadly" else 0.9
		var tween := badge.create_tween().set_loops()
		tween.tween_property(badge, "modulate", Color(1.25, 1.25, 1.25), beat).set_trans(Tween.TRANS_SINE)
		tween.tween_property(badge, "modulate", Color.WHITE, beat).set_trans(Tween.TRANS_SINE)
	return badge


func _on_level_changed(_depth: int) -> void:
	# A beat of darkness between levels.
	fade.color.a = 1.0
	if Motion.enabled():
		fade.create_tween().tween_property(fade, "color:a", 0.0, 0.55).set_trans(Tween.TRANS_SINE)
	else:
		fade.color.a = 0.0
	level_banner.text = state.level_name(true)
	var tween := level_banner.create_tween()
	if not Motion.enabled():
		# Reduced motion: shown, held, gone; no fades.
		level_banner.modulate.a = 1.0
		tween.tween_interval(2.2)
		tween.tween_property(level_banner, "modulate:a", 0.0, 0.0)
		return
	level_banner.modulate.a = 0.0
	tween.tween_property(level_banner, "modulate:a", 1.0, 0.35)
	tween.tween_interval(1.4)
	tween.tween_property(level_banner, "modulate:a", 0.0, 0.8)
