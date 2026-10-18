class_name StatusAnnouncer
extends CanvasLayer
## Says out loud when a negative status starts: a card slides in near the
## upper middle of the screen (big icon, the name in the tier's colour, what
## it means), holds a few seconds and fades; a short sound plays (the deadly
## alert has its own alarm). Several at once queue up, worst first. When one
## ends, a brief green "No longer Blind". Never takes input.
##
## A state NetHack drops and restores within a few seconds (its status
## updates arrive field by field) is not announced again.

const HOLD := {"deadly": 4.5, "serious": 3.6, "mild": 3.0}
const REANNOUNCE_AFTER_MS := 8000

var screen: GameScreen
var _active := {}  # id -> effect, the negative statuses now
var _last_seen := {}  # id -> msec it was last active
var _queue: Array = []
var _showing := false
var _started := false


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	name = "StatusAnnouncer"
	layer = 25
	screen.state.status_changed.connect(_on_status)
	screen.state.skill_ready_changed.connect(_on_skill_ready)


## "You feel more confident in your weapon skills.": a gold card that stays
## until the player opens the skills screen or says Later.
var _skill_card: Control


func _on_skill_ready(ready: bool) -> void:
	if not ready:
		if is_instance_valid(_skill_card):
			_skill_card.queue_free()
		return
	if is_instance_valid(_skill_card):
		return
	var effect := {"id": "skill", "label": "Skill ready", "tier": "neutral", "icon": "", "meaning": ""}
	var card := PanelContainer.new()
	card.name = "SkillReady"
	card.theme = UiTheme.theme()
	card.add_theme_stylebox_override("panel", UiTheme.panel_style(Color("1d1708", 0.96), Color(UiTheme.GOLD, 0.95), 14, 3, 30))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	card.add_child(row)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(56, 56)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var kind := screen.state.skill_ready_kind
	var art := "spellbook-class-icon" if kind.contains("spell") else "weapon-class-icon"
	if TileResolver.shared().has_asset(art):
		icon.texture = TileResolver.shared().texture(art)
	row.add_child(icon)
	var words := VBoxContainer.new()
	row.add_child(words)
	var title := Label.new()
	title.text = "SKILL READY"
	title.add_theme_font_override("font", UiTheme.heading_font())
	title.add_theme_font_size_override("font_size", 30)
	title.add_theme_color_override("font_color", UiTheme.GOLD)
	words.add_child(title)
	var meaning := Label.new()
	meaning.text = "You feel more confident in your %s skills: you can advance one." % (kind if kind != "" else "weapon")
	meaning.add_theme_font_size_override("font_size", 18)
	meaning.add_theme_color_override("font_color", UiTheme.INK)
	words.add_child(meaning)
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 8)
	words.add_child(buttons)
	var open := Button.new()
	open.text = GamepadRouter.hint("Open skills  #enhance", "Open skills")
	open.focus_mode = Control.FOCUS_NONE
	open.add_theme_stylebox_override("normal", UiTheme.button_style(Color("4a3a12"), Color(UiTheme.GOLD, 0.95), 8))
	open.pressed.connect(func() -> void:
		card.queue_free()
		screen.input_router.send_command("#enhance\n"))
	buttons.add_child(open)
	var later := Button.new()
	later.text = "Later"
	later.focus_mode = Control.FOCUS_NONE
	later.pressed.connect(card.queue_free)
	buttons.add_child(later)
	add_child(card)
	_skill_card = card
	card.reset_size()
	var view := get_viewport().get_visible_rect().size
	card.position = Vector2((view.x - card.size.x) / 2.0, view.y * 0.62)
	var audio := screen.get_node_or_null("AudioDirector")
	if audio:
		audio.play("pickup", -4.0)
	if Motion.enabled():
		card.modulate.a = 0.0
		card.create_tween().tween_property(card, "modulate:a", 1.0, 0.25)


func _on_status() -> void:
	var now := Time.get_ticks_msec()
	var current := {}
	for effect in StatusEffects.current(screen.state.status):
		if StatusEffects.is_negative(effect):
			current[effect.id] = effect
	var began: Array = []
	for id in current:
		if not _active.has(id) and now - int(_last_seen.get(id, -100000)) > REANNOUNCE_AFTER_MS:
			began.append(current[id])
	var ended: Array = []
	for id in _active:
		if not current.has(id):
			ended.append(_active[id])
	for id in current:
		_last_seen[id] = now
	_active = current
	if not _started:
		# The first status of a game (or a restored save) is announced too:
		# a hungry restored hero should know.
		_started = true
	began.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return StatusEffects.TIER_ORDER[a.tier] < StatusEffects.TIER_ORDER[b.tier])
	for effect in began:
		_queue.append({"effect": effect, "ended": false})
	for effect in ended:
		# A worse hunger or load replaces a milder one: no "over" for that.
		if _same_family_still_active(effect):
			continue
		_queue.append({"effect": effect, "ended": true})
	if not _showing:
		_show_next()


func _same_family_still_active(effect: Dictionary) -> bool:
	var hunger := ["Satiated", "Hungry", "Weak", "Fainting", "Fainted"]
	var load := ["Burdened", "Stressed", "Strained", "Overtaxed", "Overloaded"]
	for family in [hunger, load]:
		if family.has(effect.id):
			return _active.keys().any(func(id: Variant) -> bool: return family.has(id))
	return false


func _show_next() -> void:
	if _queue.is_empty() or not is_instance_valid(screen):
		_showing = false
		return
	_showing = true
	# Not over the level's name banner (it fades within about two seconds).
	var banner: Control = screen.hud.level_banner if screen.hud else null
	while is_instance_valid(banner) and banner.visible and banner.modulate.a > 0.05:
		await get_tree().create_timer(0.2).timeout
	if _queue.is_empty() or not is_instance_valid(screen):
		_showing = false
		return
	var item: Dictionary = _queue.pop_front()
	var effect: Dictionary = item.effect
	var ended: bool = item.ended
	var card := _card(effect, ended)
	add_child(card)
	if not ended and effect.tier != "deadly":
		var audio := screen.get_node_or_null("AudioDirector")
		if audio:
			audio.play("warn", -6.0 if effect.tier == "mild" else -2.0)
	var hold: float = 1.6 if ended else float(HOLD.get(effect.tier, 3.0))
	var tween := card.create_tween()
	if Motion.enabled():
		card.modulate.a = 0.0
		var rest := card.position
		card.position = rest + Vector2(0, -24)
		tween.set_parallel(true)
		tween.tween_property(card, "modulate:a", 1.0, 0.22)
		tween.tween_property(card, "position", rest, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tween.set_parallel(false)
		tween.tween_interval(hold)
		tween.tween_property(card, "modulate:a", 0.0, 0.35)
	else:
		tween.tween_interval(hold)
	tween.tween_callback(func() -> void:
		card.queue_free()
		_show_next())


func _card(effect: Dictionary, ended: bool) -> Control:
	var color: Color = Color("6fdc8c") if ended else StatusEffects.color(effect)
	var card := PanelContainer.new()
	card.name = "Announce_%s" % str(effect.id)
	card.set_meta("status_id", effect.id)
	card.set_meta("ended", ended)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.theme = UiTheme.theme()
	card.add_theme_stylebox_override("panel", UiTheme.panel_style(Color("15121a", 0.94), Color(color, 0.95), 14, 3, 30))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(row)
	if not ended:
		var icon := StatusMark.new()
		icon.setup(effect, 56)
		row.add_child(icon)
	var words := VBoxContainer.new()
	words.add_theme_constant_override("separation", 2)
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(words)
	var title := Label.new()
	title.text = ("No longer %s" % str(effect.label).to_lower()) if ended else str(effect.label).to_upper()
	title.add_theme_font_override("font", UiTheme.heading_font())
	title.add_theme_font_size_override("font_size", 22 if ended else 32)
	title.add_theme_color_override("font_color", color.lightened(0.15))
	words.add_child(title)
	if not ended and str(effect.meaning) != "":
		var meaning := Label.new()
		meaning.text = str(effect.meaning)
		meaning.add_theme_font_size_override("font_size", 19)
		meaning.add_theme_color_override("font_color", UiTheme.INK)
		words.add_child(meaning)
	card.reset_size()
	var view := get_viewport().get_visible_rect().size
	card.position = Vector2((view.x - card.size.x) / 2.0, view.y * 0.24)
	return card
