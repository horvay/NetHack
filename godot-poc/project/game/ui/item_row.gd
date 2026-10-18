class_name ItemRow
extends Button
## One item as a clickable row: art, its classic letter, the public name and
## badges for what the hero knows (blessed/cursed, worn, charges...).

var item: Dictionary = {}
var selected := false:
	set(value):
		selected = value
		_restyle()
var count_label: Label
var quantity_spin: SpinBox
var stack_size := 1
## Show the quantity stepper even when the row isn't selected (item pickers).
var always_show_quantity := false:
	set(value):
		always_show_quantity = value
		_restyle()
var _icon: TextureRect
var _name: Label
var _check: Label
var _price: Label


func _init() -> void:
	focus_mode = Control.FOCUS_ALL
	custom_minimum_size = Vector2(0, 54)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	alignment = HORIZONTAL_ALIGNMENT_LEFT
	var row := HBoxContainer.new()
	row.set_anchors_preset(Control.PRESET_FULL_RECT)
	row.offset_left = 8
	row.offset_right = -10
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(row)
	_check = Label.new()
	_check.custom_minimum_size = Vector2(18, 0)
	_check.add_theme_color_override("font_color", UiTheme.GOLD)
	_check.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_check.visible = false
	row.add_child(_check)
	_icon = TextureRect.new()
	_icon.custom_minimum_size = Vector2(40, 40)
	_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_icon)
	var letter := Label.new()
	letter.name = "Letter"
	letter.custom_minimum_size = Vector2(26, 0)
	letter.add_theme_font_override("font", UiTheme.bold_font())
	letter.add_theme_color_override("font_color", UiTheme.GOLD_DIM.lightened(0.25))
	letter.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(letter)
	_name = Label.new()
	_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_name.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name.clip_text = true
	row.add_child(_name)
	_price = Label.new()
	_price.add_theme_color_override("font_color", Color("f2d27a"))
	_price.add_theme_font_override("font", UiTheme.bold_font())
	_price.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_price.visible = false
	row.add_child(_price)
	count_label = Label.new()
	count_label.add_theme_color_override("font_color", UiTheme.GOLD)
	count_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	count_label.visible = false
	row.add_child(count_label)
	quantity_spin = SpinBox.new()
	quantity_spin.visible = false
	quantity_spin.custom_minimum_size = Vector2(120, 0)
	quantity_spin.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	quantity_spin.tooltip_text = "How many"
	row.add_child(quantity_spin)


func setup_item(p_item: Dictionary, state: GameState = null) -> void:
	item = p_item
	var letter := char(int(item.get("selector", 0)))
	(find_child("Letter", true, false) as Label).text = letter
	# The price moves to its own tag: "(unpaid, 5 zorkmids)" -> "(unpaid)".
	_name.text = RegEx.create_from_string(",\\s*\\d+\\s+zorkmids?\\)").sub(ItemText.display_name(item), ")")
	_name.add_theme_color_override("font_color", ItemText.name_color(item))
	_icon.texture = ItemText.icon(item, state)
	tooltip_text = str(item.get("text", ""))
	set_price(ItemText.price(item))


func setup_menu_entry(entry: Dictionary) -> void:
	item = entry
	var selector := int(entry.get("selector", 0))
	(find_child("Letter", true, false) as Label).text = char(selector) if selector > 0 else ""
	_name.text = ItemText.without_price(str(entry.get("text", "")))
	_name.add_theme_color_override("font_color", ItemText.name_color(entry))
	_icon.texture = ItemText.icon(entry, null)
	_icon.visible = _icon.texture != null
	set_price(ItemText.price(entry))


func setup_plain(letter: String, text: String) -> void:
	(find_child("Letter", true, false) as Label).text = letter
	_name.text = text
	_icon.visible = false


func set_checkable(on: bool) -> void:
	_check.visible = on
	_restyle()


## Stacks (e.g. "12 arrows") get a quantity stepper while selected.
func set_stack(size: int) -> void:
	stack_size = size
	quantity_spin.min_value = 1
	quantity_spin.max_value = size
	quantity_spin.value = size
	quantity_spin.mouse_filter = Control.MOUSE_FILTER_STOP
	_restyle()


## Chosen quantity, or -1 for the whole stack.
func chosen_quantity() -> int:
	if stack_size <= 1 or not quantity_spin.visible:
		return -1
	var value := int(quantity_spin.value)
	return -1 if value >= stack_size else value


## Shows a shop price tag ("5 zm"); 0 hides it.
func set_price(zorkmids: int) -> void:
	_price.visible = zorkmids > 0
	_price.text = "%d zm" % zorkmids
	_price.tooltip_text = "Shop price"


func set_count(count: int) -> void:
	count_label.visible = count > 0
	count_label.text = "×%d" % count


func _restyle() -> void:
	if _check:
		_check.text = "◆" if selected else "◇"
	if quantity_spin:
		quantity_spin.visible = (selected or always_show_quantity) and stack_size > 1
	if selected:
		add_theme_stylebox_override("normal", UiTheme.button_style(Color("2a2414"), Color(UiTheme.GOLD, 0.7), 6))
	else:
		remove_theme_stylebox_override("normal")
