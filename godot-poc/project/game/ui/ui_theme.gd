class_name UiTheme
extends RefCounted
## The game's visual language: fonts, palette, panel styles and the Godot
## Theme every screen uses. One place to tune the look.

const INK := Color("e9e1cf")
const INK_DIM := Color("a39b8a")
const INK_FAINT := Color("6d675d")
const GOLD := Color("e2b65f")
const GOLD_DIM := Color("8f7442")
const PANEL := Color(0.055, 0.058, 0.078, 0.90)
const PANEL_SOLID := Color("0f1016")
const PANEL_RAISED := Color("181a23")
const LINE := Color(0.89, 0.71, 0.37, 0.28)
const HP := Color("d9463b")
const HP_LOW := Color("ff2e1f")
const ENERGY := Color("4f8ef0")
const XP := Color("b07cf0")
const GOOD := Color("6fd38a")
const WARN := Color("f0b44c")
const BAD := Color("ef5b4c")
const SHADOW := Color(0, 0, 0, 0.55)
## NetHack's 16 colours (CLR_BLACK..CLR_WHITE), tuned for dark panels.
const NH_COLORS := [
	Color("5a5f6e"), Color("e0533f"), Color("6fcf6a"), Color("b9893f"), Color("5d87f0"), Color("c26fe0"), Color("4fc2c9"), Color("c9c3b4"),
	Color("8a8478"), Color("ff9a3d"), Color("9dff8a"), Color("ffe066"), Color("8fb1ff"), Color("f08ff0"), Color("8ff0f0"), Color("ffffff"),
]
const NO_COLOR := 8


## A NetHack colour index as a UI colour, or fallback for NO_COLOR.
static func nh_color(index: int, fallback: Color) -> Color:
	index &= 0xFF
	return fallback if index == NO_COLOR or index < 0 or index >= NH_COLORS.size() else NH_COLORS[index]

static var _heading: Font
static var _body: Font
static var _body_bold: Font
static var _body_italic: Font
static var _theme: Theme


static func heading_font() -> Font:
	if _heading == null:
		var font := FontVariation.new()
		font.base_font = load("res://assets/fonts/Cinzel.ttf")
		font.variation_opentype = {"wght": 700}
		_heading = font
	return _heading


static func body_font() -> Font:
	if _body == null:
		_body = load("res://assets/fonts/AlegreyaSans-Medium.ttf")
	return _body


static func bold_font() -> Font:
	if _body_bold == null:
		_body_bold = load("res://assets/fonts/AlegreyaSans-Bold.ttf")
	return _body_bold


static func italic_font() -> Font:
	if _body_italic == null:
		_body_italic = load("res://assets/fonts/AlegreyaSans-Italic.ttf")
	return _body_italic


static func panel_style(fill := PANEL, border := LINE, radius := 8, border_width := 1, shadow := 18) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(radius)
	style.shadow_color = SHADOW
	style.shadow_size = shadow
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	style.anti_aliasing = true
	return style


static func button_style(fill: Color, border: Color, radius := 6) -> StyleBoxFlat:
	var style := panel_style(fill, border, radius, 1, 0)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	return style


static func theme() -> Theme:
	if _theme != null:
		return _theme
	var t := Theme.new()
	t.default_font = body_font()
	t.default_font_size = 18

	t.set_color("font_color", "Label", INK)
	t.set_color("font_outline_color", "Label", Color(0, 0, 0, 0.6))

	t.set_stylebox("panel", "PanelContainer", panel_style())
	t.set_stylebox("panel", "Panel", panel_style())

	var normal := button_style(Color("1a1c26"), Color(1, 1, 1, 0.08))
	var hover := button_style(Color("262836"), Color(GOLD, 0.6))
	var pressed := button_style(Color("2f2a1c"), GOLD)
	var disabled := button_style(Color("14151b"), Color(1, 1, 1, 0.04))
	var focus := button_style(Color(0, 0, 0, 0), GOLD)
	focus.draw_center = false
	for type in ["Button", "MenuButton", "OptionButton"]:
		t.set_stylebox("normal", type, normal)
		t.set_stylebox("hover", type, hover)
		t.set_stylebox("pressed", type, pressed)
		t.set_stylebox("disabled", type, disabled)
		t.set_stylebox("focus", type, focus)
		t.set_color("font_color", type, INK)
		t.set_color("font_hover_color", type, Color.WHITE)
		t.set_color("font_pressed_color", type, GOLD)
		t.set_color("font_disabled_color", type, INK_FAINT)
		t.set_color("font_focus_color", type, Color.WHITE)
	t.set_constant("h_separation", "Button", 8)

	var field := button_style(Color("0b0c11"), Color(1, 1, 1, 0.12), 6)
	var field_focus := button_style(Color("0b0c11"), GOLD, 6)
	t.set_stylebox("normal", "LineEdit", field)
	t.set_stylebox("focus", "LineEdit", field_focus)
	t.set_color("font_color", "LineEdit", INK)
	t.set_color("font_placeholder_color", "LineEdit", INK_FAINT)
	t.set_color("caret_color", "LineEdit", GOLD)
	t.set_color("selection_color", "LineEdit", Color(GOLD, 0.35))

	var bar_bg := StyleBoxFlat.new()
	bar_bg.bg_color = Color(0, 0, 0, 0.55)
	bar_bg.set_corner_radius_all(4)
	t.set_stylebox("background", "ProgressBar", bar_bg)

	var scroll := StyleBoxFlat.new()
	scroll.bg_color = Color(1, 1, 1, 0.04)
	scroll.set_corner_radius_all(4)
	var grabber := StyleBoxFlat.new()
	grabber.bg_color = Color(GOLD, 0.35)
	grabber.set_corner_radius_all(4)
	var grabber_hover := grabber.duplicate()
	grabber_hover.bg_color = Color(GOLD, 0.6)
	t.set_stylebox("scroll", "VScrollBar", scroll)
	t.set_stylebox("grabber", "VScrollBar", grabber)
	t.set_stylebox("grabber_highlight", "VScrollBar", grabber_hover)
	t.set_stylebox("grabber_pressed", "VScrollBar", grabber_hover)

	var tooltip := panel_style(Color("0d0e14"), LINE, 6, 1, 10)
	t.set_stylebox("panel", "TooltipPanel", tooltip)
	t.set_color("font_color", "TooltipLabel", INK)
	t.set_font("font", "TooltipLabel", body_font())
	t.set_font_size("font_size", "TooltipLabel", 17)

	t.set_type_variation("HeaderLabel", "Label")
	t.set_font("font", "HeaderLabel", heading_font())
	t.set_font_size("font_size", "HeaderLabel", 26)
	t.set_color("font_color", "HeaderLabel", GOLD)

	t.set_type_variation("CaptionLabel", "Label")
	t.set_font_size("font_size", "CaptionLabel", 15)
	t.set_color("font_color", "CaptionLabel", INK_DIM)

	t.set_type_variation("ChoiceButton", "Button")
	t.set_stylebox("normal", "ChoiceButton", button_style(Color("15161e"), Color(1, 1, 1, 0.07), 8))
	t.set_stylebox("hover", "ChoiceButton", button_style(Color("242030"), Color(GOLD, 0.7), 8))
	t.set_font_size("font_size", "ChoiceButton", 19)
	_theme = t
	return t


## Small keycap badge text like "[i]".
static func key_hint(key: String) -> String:
	return key
