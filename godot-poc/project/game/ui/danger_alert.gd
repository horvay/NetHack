class_name DangerAlert
extends CanvasLayer
## Life-or-death states the eye must not miss, wherever the player is
## looking and whatever panel is open (this layer sits above the dialogs):
## a pulsing alert at the top centre that says what is wrong in plain words
## (and, for hunger, offers Eat), and a red glow pulsing around the screen
## edge while something is deadly. A short alarm sounds when a deadly state
## starts. Reduced motion: no pulse, still big and bright.
##
## Only what the hero can tell (the no-spoiler rule): no cures, except that
## the hungry should eat.

const DEADLY_HUNGER := ["Fainting", "Fainted", "Starved"]

var screen: GameScreen
var panel: PanelContainer
var title_label: Label
var detail_label: Label
var action_button: Button
var _glow: ColorRect
var _glow_material: ShaderMaterial
var _alerts: Array = []
var _time := 0.0
## When each deadly state was last seen (msec): the alarm sounds when one
## begins, not when NetHack's field-by-field status updates blink it.
var _seen_at := {}

const GLOW_SHADER := """
shader_type canvas_item;
uniform vec4 tint : source_color = vec4(1.0, 0.12, 0.06, 1.0);
uniform float strength = 0.0;
void fragment() {
	vec2 d = abs(UV - 0.5) * 2.0;
	float edge = max(d.x * 0.92, d.y);
	COLOR = vec4(tint.rgb, smoothstep(0.62, 1.0, edge) * strength);
}
"""


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	name = "DangerAlert"
	layer = 30
	_glow = ColorRect.new()
	_glow.set_anchors_preset(Control.PRESET_FULL_RECT)
	_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_glow_material = ShaderMaterial.new()
	var shader := Shader.new()
	shader.code = GLOW_SHADER
	_glow_material.shader = shader
	_glow.material = _glow_material
	_glow.visible = false
	add_child(_glow)

	panel = PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER_TOP)
	panel.anchor_left = 0.5
	panel.anchor_right = 0.5
	panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	panel.offset_top = 18
	panel.theme = UiTheme.theme()
	panel.visible = false
	add_child(panel)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	panel.add_child(row)
	var mark := Label.new()
	mark.text = "!"
	mark.name = "Mark"
	mark.add_theme_font_override("font", UiTheme.bold_font())
	mark.add_theme_font_size_override("font_size", 30)
	mark.add_theme_color_override("font_color", Color.WHITE)
	mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	mark.custom_minimum_size = Vector2(44, 44)
	row.add_child(mark)
	var words := VBoxContainer.new()
	words.add_theme_constant_override("separation", 0)
	row.add_child(words)
	title_label = Label.new()
	title_label.add_theme_font_override("font", UiTheme.heading_font())
	title_label.add_theme_font_size_override("font_size", 26)
	title_label.add_theme_color_override("font_color", Color.WHITE)
	words.add_child(title_label)
	detail_label = Label.new()
	detail_label.add_theme_font_size_override("font_size", 17)
	detail_label.add_theme_color_override("font_color", Color(1, 1, 1, 0.92))
	words.add_child(detail_label)
	action_button = Button.new()
	action_button.focus_mode = Control.FOCUS_NONE
	action_button.custom_minimum_size = Vector2(0, 44)
	action_button.add_theme_font_size_override("font_size", 18)
	action_button.pressed.connect(func() -> void: screen.input_router.send_command("e"))
	row.add_child(action_button)

	screen.state.status_changed.connect(_refresh)
	_refresh()


## The states worth an alert, worst first: {title, detail, deadly, eat}.
func alerts() -> Array:
	var status := screen.state.status
	var list := []
	var hunger := status.hunger()
	if hunger in DEADLY_HUNGER:
		list.append({"title": "FAINTING FROM HUNGER" if hunger == "Fainting" else hunger.to_upper(),
			"detail": "You will pass out. Eat something now." if hunger != "Fainted" else "You have passed out from hunger.", "deadly": true, "eat": hunger != "Fainted"})
	for condition in status.active_conditions():
		if condition.deadly:
			list.append({"title": str(condition.label).to_upper(), "detail": str(StatusEffects.TABLE.get(str(condition.id), ["", "", "", ""])[3]),
				"deadly": true, "eat": false})
	var hp := status.number(StatusModel.Field.HP)
	var hp_max := status.number(StatusModel.Field.HPMAX)
	# NetHack's own "low hit points" line (hp < 5, or below a seventh).
	if hp_max > 0 and hp > 0 and (hp < 5 or hp * 7 < hp_max):
		list.append({"title": "HIT POINTS LOW", "detail": "%d of %d left." % [hp, hp_max], "deadly": true, "eat": false})
	if hunger == "Weak":
		list.append({"title": "WEAK FROM HUNGER", "detail": "Eat soon.", "deadly": false, "eat": true})
	var burden := status.encumbrance()
	if burden in ["Strained", "Overtaxed", "Overloaded"]:
		list.append({"title": burden.to_upper(), "detail": str(StatusEffects.TABLE.get(burden, ["", "", "", ""])[3]), "deadly": false, "eat": false})
	return list


func _refresh() -> void:
	_alerts = alerts()
	if _alerts.is_empty():
		panel.visible = false
		_glow.visible = false
		return
	var top: Dictionary = _alerts[0]
	title_label.text = str(top.title)
	var detail := str(top.detail)
	if _alerts.size() > 1:
		detail += "   ·   also: " + ", ".join(_alerts.slice(1).map(func(a: Dictionary) -> String: return str(a.title).capitalize()))
	detail_label.text = detail
	var eat: bool = _alerts.any(func(a: Dictionary) -> bool: return a.eat)
	action_button.visible = eat
	action_button.text = GamepadRouter.hint("Eat…  e", "Eat…")
	var color := Color("b3241b") if top.deadly else Color("a86a10")
	panel.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(color, 0.94), Color(1, 0.85, 0.7, 0.9), 14, 2, 28))
	var mark_style := StyleBoxFlat.new()
	mark_style.bg_color = Color(0, 0, 0, 0.35)
	mark_style.set_corner_radius_all(22)
	(panel.find_child("Mark", true, false) as Label).add_theme_stylebox_override("normal", mark_style)
	panel.visible = true
	panel.reset_size()
	panel.offset_left = -panel.size.x / 2.0
	panel.offset_right = panel.size.x / 2.0
	var deadly: bool = _alerts.any(func(a: Dictionary) -> bool: return a.deadly)
	_glow.visible = deadly
	# The alarm once, when a deadly state begins (not on every update).
	var now := Time.get_ticks_msec()
	var fresh := false
	for alert in _alerts:
		if alert.deadly:
			var title := str(alert.title)
			if now - int(_seen_at.get(title, -100000)) > 5000:
				fresh = true
			_seen_at[title] = now
	if fresh:
		var audio := screen.get_node_or_null("AudioDirector")
		if audio:
			audio.play("alarm", -4.0)


func _process(delta: float) -> void:
	if not panel.visible:
		return
	_time += delta
	var deadly := _glow.visible
	if Motion.enabled():
		# A heartbeat: faster and stronger when deadly.
		var speed := 4.2 if deadly else 2.4
		var beat := 0.5 + 0.5 * sin(_time * speed)
		panel.modulate = Color(1, 1, 1, 0.82 + 0.18 * beat)
		panel.pivot_offset = panel.size / 2.0
		panel.scale = Vector2.ONE * (1.0 + (0.045 if deadly else 0.025) * beat)
		_glow_material.set_shader_parameter("strength", 0.25 + 0.4 * beat)
	else:
		panel.modulate = Color.WHITE
		panel.scale = Vector2.ONE
		_glow_material.set_shader_parameter("strength", 0.45)
