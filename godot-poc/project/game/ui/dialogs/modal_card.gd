class_name ModalCard
extends Control
## Base for centered dialogs: dims the world, animates in, and lays out a
## title, a body and a footer row of buttons. Subclasses fill `body`.

signal closed

var card: PanelContainer
var title_label: Label
var subtitle_label: Label
var body: VBoxContainer
var footer: HBoxContainer
var dim: ColorRect
var center: CenterContainer
var card_width := 560.0
var dim_alpha := 0.45


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.theme()
	dim = ColorRect.new()
	dim.color = Color(0.0, 0.0, 0.02, dim_alpha)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)
	center = CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	card = PanelContainer.new()
	card.add_theme_stylebox_override("panel", UiTheme.panel_style(Color(0.05, 0.053, 0.072, 0.97), Color(UiTheme.GOLD, 0.45), 12, 1, 30))
	center.add_child(card)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	card.add_child(column)
	title_label = Label.new()
	title_label.theme_type_variation = "HeaderLabel"
	title_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(title_label)
	subtitle_label = Label.new()
	subtitle_label.theme_type_variation = "CaptionLabel"
	subtitle_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	subtitle_label.visible = false
	column.add_child(subtitle_label)
	body = VBoxContainer.new()
	body.add_theme_constant_override("separation", 6)
	column.add_child(body)
	footer = HBoxContainer.new()
	footer.alignment = BoxContainer.ALIGNMENT_END
	footer.add_theme_constant_override("separation", 8)
	column.add_child(footer)


func _ready() -> void:
	card.custom_minimum_size = Vector2(card_width, 0)
	title_label.custom_minimum_size = Vector2(card_width - 40, 0)
	dim.color.a = dim_alpha
	card.pivot_offset = card.size / 2.0
	modulate.a = 0.0
	card.scale = Vector2(0.96, 0.96) if Motion.enabled() else Vector2.ONE
	var tween := create_tween().set_parallel()
	tween.tween_property(self, "modulate:a", 1.0, 0.14)
	tween.tween_property(card, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func set_title(text: String, subtitle := "") -> void:
	title_label.text = text
	subtitle_label.text = subtitle
	subtitle_label.visible = subtitle != ""


func add_footer_button(text: String, callback: Callable, primary := false) -> Button:
	var button := Button.new()
	# Pad players see the pad's buttons instead of keys.
	if GamepadRouter.active:
		text = text.replace("  Esc", "  B").replace("  Enter", "  A")
	button.text = text
	button.focus_mode = Control.FOCUS_ALL
	button.custom_minimum_size = Vector2(110, 42)
	if primary:
		button.add_theme_stylebox_override("normal", UiTheme.button_style(Color("2a2414"), Color(UiTheme.GOLD, 0.85)))
		button.add_theme_color_override("font_color", UiTheme.GOLD.lightened(0.25))
	button.pressed.connect(callback)
	footer.add_child(button)
	return button


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tween := create_tween()
	tween.tween_property(self, "modulate:a", 0.0, 0.1)
	tween.tween_callback(queue_free)


## Subclasses handle keys here; return true when consumed.
func handle_key(_event: InputEventKey) -> bool:
	return false
