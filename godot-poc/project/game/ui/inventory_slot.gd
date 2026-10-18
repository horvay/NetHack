class_name InventorySlot
extends Button
## One item in the inventory grid: art, its letter, stack size, a frame
## colored by what the hero knows (blessed/cursed), and for anything worn,
## wielded or in use a band naming where ("Body", "Left ring", "Quiver").

signal activated(slot: InventorySlot)

const SIZE := 92.0

var item: Dictionary
var state: GameState
var is_selected := false:
	set(value):
		is_selected = value
		queue_redraw()


func setup(p_item: Dictionary, p_state: GameState) -> void:
	item = p_item
	state = p_state
	focus_mode = Control.FOCUS_ALL
	custom_minimum_size = Vector2(SIZE, SIZE)
	var place := ItemText.equip_place(item)
	tooltip_text = ItemText.display_name(item) + (("\n" + str(place.where)) if not place.is_empty() else "")
	flat = true


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.double_click and event.button_index == MOUSE_BUTTON_LEFT:
		activated.emit(self)
		accept_event()


func _draw() -> void:
	var rect := Rect2(Vector2.ZERO, size)
	var frame := Color(1, 1, 1, 0.10)
	match ItemText.beatitude(item):
		"blessed":
			frame = Color(ItemText.BLESSED, 0.75)
		"cursed":
			frame = Color(ItemText.CURSED, 0.75)
		"uncursed":
			frame = Color(1, 1, 1, 0.28)
	var fill := Color("12131a")
	if is_hovered():
		fill = Color("1c1d27")
	var style := StyleBoxFlat.new()
	# Blessed and cursed tint the tile itself, so they read at a glance.
	match ItemText.beatitude(item):
		"blessed":
			fill = fill.lerp(ItemText.BLESSED, 0.10)
		"cursed":
			fill = fill.lerp(ItemText.CURSED, 0.12)
	style.bg_color = fill
	style.border_color = UiTheme.GOLD if is_selected else frame
	style.set_border_width_all(2 if is_selected or ItemText.beatitude(item) in ["blessed", "cursed"] else 1)
	style.set_corner_radius_all(8)
	style.anti_aliasing = true
	if ItemText.is_worn(item):
		style.shadow_color = Color(UiTheme.GOLD, 0.35)
		style.shadow_size = 6
	draw_style_box(style, rect)
	var icon := ItemText.icon(item, state)
	if icon:
		var icon_size := 52.0
		var lift := 8.0 if not ItemText.equip_place(item).is_empty() else 0.0
		draw_texture_rect(icon, Rect2((size - Vector2(icon_size, icon_size)) / 2.0 - Vector2(0, lift), Vector2(icon_size, icon_size)), false)
	var font := UiTheme.bold_font()
	var letter := char(int(item.get("selector", 0)))
	draw_string_outline(font, Vector2(7, 19), letter, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, 4, Color(0, 0, 0, 0.9))
	draw_string(font, Vector2(7, 19), letter, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, UiTheme.GOLD.lightened(0.15))
	# Blessed / uncursed / cursed, when known: a chip beside the letter.
	var buc := ItemText.beatitude(item)
	if buc != "":
		var chip_color: Color = ItemText.BLESSED if buc == "blessed" else (ItemText.CURSED if buc == "cursed" else Color("8a8f99"))
		var chip := Rect2(Vector2(22, 7), Vector2(15, 15))
		var chip_style := StyleBoxFlat.new()
		chip_style.bg_color = Color(chip_color, 0.9)
		chip_style.set_corner_radius_all(4)
		draw_style_box(chip_style, chip)
		var mark := buc[0].to_upper()
		var mw := font.get_string_size(mark, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
		draw_string(font, Vector2(chip.position.x + (chip.size.x - mw) / 2.0, chip.position.y + 12), mark, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("101218"))
	# The known enchantment or charges, top right: green bonus, red penalty.
	var bonus := ItemText.known_bonus(item)
	if not bonus.is_empty():
		var value := int(bonus.value)
		var bonus_color := Color("7ee08f") if value > 0 else (Color("ff7a6b") if value < 0 and bonus.kind == "enchantment" else Color("c9c3b4"))
		var btext := str(bonus.text)
		var bw := font.get_string_size(btext, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
		draw_string_outline(font, Vector2(size.x - bw - 7, 19), btext, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, 4, Color(0, 0, 0, 0.9))
		draw_string(font, Vector2(size.x - bw - 7, 19), btext, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, bonus_color)
	var place := ItemText.equip_place(item)
	var quantity := int(item.get("quantity", 1))
	if quantity > 1:
		# Bottom right, or top right when the band takes the bottom.
		var q := str(quantity)
		var w := font.get_string_size(q, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
		var at := Vector2(size.x - w - 7, size.y - 26 if not place.is_empty() else size.y - 7)
		draw_string_outline(font, at, q, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, 4, Color(0, 0, 0, 0.9))
		draw_string(font, at, q, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color.WHITE)
	if not place.is_empty():
		# Where it is, on a gold band across the bottom.
		var band := Rect2(Vector2(2, size.y - 22), Vector2(size.x - 4, 20))
		var band_style := StyleBoxFlat.new()
		band_style.bg_color = Color("3a2e12") if place.order < 20 else Color("1f2a35")
		band_style.corner_radius_bottom_left = 7
		band_style.corner_radius_bottom_right = 7
		draw_style_box(band_style, band)
		var tag := str(place.tag)
		var tag_size := 13
		var tw := font.get_string_size(tag, HORIZONTAL_ALIGNMENT_LEFT, -1, tag_size).x
		draw_string(font, Vector2((size.x - tw) / 2.0, size.y - 7), tag, HORIZONTAL_ALIGNMENT_LEFT, -1, tag_size,
			UiTheme.GOLD.lightened(0.3) if place.order < 20 else Color("a9d4ff"))
