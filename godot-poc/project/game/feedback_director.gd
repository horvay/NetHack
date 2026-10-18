class_name FeedbackDirector
extends Node
## Game feel. Watches the game state and answers with motion, light and
## sound-like punctuation: damage/heal numbers over the hero, a red pulse at
## the screen edge when hurt, camera shake scaled to the blow, attack lunges
## and hit flashes read from combat messages, and level-up flourishes.

var screen: GameScreen
var _last_hp := -1
var _last_xp := -1
var _vignette: ColorRect
var _last_command_dir := Vector2i.ZERO


const HIT_WORDS := ["hit", "hits", "bite", "bites", "kick", "kicks", "claw", "claws", "sting", "stings", "butt", "butts", "touch", "touches", "smite", "smites", "slash", "slashes", "stab", "stabs", "bash", "bashes", "strike", "strikes"]


func attach(game_screen: GameScreen) -> void:
	screen = game_screen
	name = "FeedbackDirector"
	screen.add_child(self)
	screen.state.status_changed.connect(_on_status)
	screen.state.message_added.connect(_on_message)
	screen.state.hero_moved.connect(func(from: Vector2i, to: Vector2i) -> void:
		if is_instance_valid(_callout):
			_callout.queue_free()
		if from.x >= 0:
			_last_command_dir = (to - from).clampi(-1, 1))
	_build_vignette()
	screen.state.getpos_result.connect(func(lines: Array, cell: Vector2i) -> void: _show_callout(cell, str(lines[-1])))


func _build_vignette() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)
	_vignette = ColorRect.new()
	_vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	_vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var material := ShaderMaterial.new()
	material.shader = load("res://game/world/vignette.gdshader")
	_vignette.material = material
	layer.add_child(_vignette)


func _on_status() -> void:
	var status := screen.state.status
	var hp := status.hp()
	var xp := status.number(StatusModel.Field.XP)
	var hero := screen.state.map.hero
	var shapeshift := Time.get_ticks_msec() - _shapeshift_at < 1500
	if _last_hp >= 0 and hp != _last_hp and hero.x >= 0 and not shapeshift:
		var delta := hp - _last_hp
		if delta < 0:
			screen.world.floaters.float_text(hero, str(delta), UiTheme.HP.lightened(0.15), 18)
			screen.world.actors.flash(hero)
			var severity := clampf(float(-delta) / maxf(1.0, status.hp_max()), 0.0, 1.0)
			screen.world.shake(0.35 + severity * 2.0)
			_pulse_vignette(0.35 + severity * 0.65)
		else:
			screen.world.floaters.float_text(hero, "+%d HP" % delta, UiTheme.GOOD, 16)
	if _last_xp >= 0 and xp > _last_xp and hero.x >= 0:
		screen.world.floaters.float_text(hero, "Level up!", UiTheme.GOLD, 20)
	_last_hp = hp
	_last_xp = xp
	var fraction := float(hp) / maxf(1.0, status.hp_max())
	(_vignette.material as ShaderMaterial).set_shader_parameter("danger", clampf((0.35 - fraction) / 0.35, 0.0, 1.0))


func _pulse_vignette(strength: float) -> void:
	if not Motion.enabled():
		return
	var material := _vignette.material as ShaderMaterial
	material.set_shader_parameter("hit", strength)
	var tween := create_tween()
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("hit", v), strength, 0.0, 0.5)


var _shapeshift_at := -100000


func _on_message(entry: Dictionary) -> void:
	var text := str(entry.text).to_lower()
	var hero := screen.state.map.hero
	if hero.x < 0 or entry.get("history", false):
		return
	if text.begins_with("you turn into") or text.contains("return to human form") or text.contains("you return to") and text.contains("form"):
		_shapeshift_at = Time.get_ticks_msec()
	if text.begins_with("you hit") or text.begins_with("you smite") or text.begins_with("you kill") or text.begins_with("you destroy"):
		var target := _target_named(hero, text)
		if target.x >= 0:
			screen.world.actors.lunge("hero", target)
			screen.world.actors.flash(target, Color(1.0, 0.9, 0.6))
			screen.world.shake(0.25)
	elif text.begins_with("you miss"):
		var target := _target_named(hero, text)
		if target.x >= 0:
			screen.world.actors.lunge("hero", target)
			screen.world.floaters.float_text(target, "miss", UiTheme.INK_DIM, 14)
	elif text.begins_with("the ") and (" misses" in text or " miss" in text):
		var attacker := _monster_named(hero, text, false)
		if attacker.x >= 0:
			screen.world.actors.lunge(_actor_id_at(attacker), hero)
	elif text.begins_with("the ") or text.begins_with("it "):
		for word in HIT_WORDS:
			if (" %s!" % word) in text or (" %s you" % word) in text:
				var attacker := _monster_named(hero, text, false)
				if attacker.x >= 0:
					screen.world.actors.lunge(_actor_id_at(attacker), hero)
				break


## The creature the hero attacked: the one named in the message, preferring
## the direction of the last move/F command; never the pet unless named.
func _target_named(hero: Vector2i, text: String) -> Vector2i:
	var preferred := hero + screen.state.last_direction
	if screen.state.last_direction != Vector2i.ZERO and _actor_id_at(preferred) != "" and _name_matches(preferred, text):
		return preferred
	var named := _monster_named(hero, text, true)
	if named.x >= 0:
		return named
	if screen.state.last_direction != Vector2i.ZERO and _actor_id_at(preferred) != "":
		return preferred
	return Vector2i(-1, -1)


## An adjacent creature whose public name appears in the message.
func _monster_named(hero: Vector2i, text: String, allow_pet: bool) -> Vector2i:
	var fallback := Vector2i(-1, -1)
	for delta in GameState.DIRECTION_ORDER:
		var cell: Vector2i = hero + delta
		if _actor_id_at(cell) == "":
			continue
		var tame := int(screen.state.map.cell(cell).get("glyphFlags", 0)) & 0x10
		if _name_matches(cell, text):
			if not tame or allow_pet:
				return cell
		elif not tame and fallback.x < 0:
			fallback = cell
	return fallback


func _name_matches(cell: Vector2i, text: String) -> bool:
	var name := CellDescriber.public_name(screen.state.map.cell(cell)).to_lower()
	return name != "" and text.contains(name)


func _nearest_adjacent_monster(hero: Vector2i) -> Vector2i:
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			var cell := hero + Vector2i(dx, dy)
			if cell != hero and _actor_id_at(cell) != "":
				return cell
	return Vector2i(-1, -1)


func _actor_id_at(cell: Vector2i) -> String:
	var c := screen.state.map.cell(cell)
	var id := str(c.get("actorId", ""))
	return id if id != "hero" else ""


## A card over a map cell with what NetHack said about it (farlook). It
## follows the cell as the camera moves and leaves when the hero acts.
func _show_callout(cell: Vector2i, raw: String) -> void:
	if is_instance_valid(_callout):
		_callout.queue_free()
	var text := DialogHost._strip_symbol(raw)
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.05, 0.05, 0.07, 0.95), Color(UiTheme.GOLD, 0.6), 8, 1, 14))
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var label := Label.new()
	label.text = text.substr(0, 1).to_upper() + text.substr(1)
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", UiTheme.INK)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size = Vector2(minf(420.0, 12.0 * text.length() + 20.0), 0)
	card.add_child(label)
	screen.hud.root.add_child(card)
	card.reset_size()
	card.set_meta("cell", cell)
	_callout = card
	_callout_age = 0.0
	_place_callout()


var _callout: PanelContainer
var _callout_age := 0.0


func _place_callout() -> void:
	var cell: Vector2i = _callout.get_meta("cell")
	var at := screen.world.screen_of_cell(cell)
	_callout.position = Vector2(at.x - _callout.size.x / 2.0, at.y - _callout.size.y - 34.0)


func _process(delta: float) -> void:
	if not is_instance_valid(_callout):
		return
	_callout_age += delta
	_place_callout()
	if _callout_age > 6.0:
		_callout.queue_free()
