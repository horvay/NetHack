class_name ShopLedgerScreen
extends ModalCard
## NetHack's shop lists as a ledger, each row the item's art, NetHack's name
## for it and its price in gold:
##   - "Fine goods for sale:" (#chat beside goods): the price of each;
##   - Iu, the unpaid items you carry, NetHack's class headings, the total
##     against your gold, and Pay (p);
##   - Ix, "Unpaid articles already used up", with the total owed.
## Only what NetHack's list says. Any key closes it, as NetHack's window.

var screen: GameScreen
var kind := ""  # "goods", "bill", "used"
var groups: Array = []  # [{heading, rows: [{letter, name, price, each, free}]}]
var total := -1
var currency := "zm"
var notes: Array = []  # NetHack's other lines ("(There are 2 more unpaid objects on the floor.)")


static func kind_of(lines: Array) -> String:
	if lines.is_empty():
		return ""
	var first := str(lines[0].get("text", "")).strip_edges()
	if first == "Fine goods for sale:":
		return "goods"
	if first.begins_with("Unpaid articles already used up"):
		return "used"
	# Iu: a "* - Total:" row (class headings only with sortpack).
	for line in lines:
		if str(line.get("text", "")).strip_edges().begins_with("* - Total:"):
			return "bill"
	return ""


func setup(game_screen: GameScreen, lines: Array, p_kind: String) -> void:
	screen = game_screen
	kind = p_kind
	_parse(lines)
	card_width = 900.0
	var gold := screen.state.status.number(StatusModel.Field.GOLD)
	match kind:
		"goods":
			set_title("For sale", "What the shopkeeper asks for each.")
		"bill":
			set_title("Your bill", "Unpaid items you carry  ·  you have %d zm" % gold)
		"used":
			set_title("Used up", "Unpaid items you used: you owe for these.")
	_build()
	if total >= 0:
		var sum := Label.new()
		sum.text = "Total  %d %s" % [total, currency]
		sum.add_theme_font_override("font", UiTheme.heading_font())
		sum.add_theme_font_size_override("font_size", 20)
		sum.add_theme_color_override("font_color", UiTheme.BAD if kind == "bill" and total > gold else UiTheme.GOLD)
		sum.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		footer.add_child(sum)
		footer.move_child(sum, 0)
	if kind != "goods":
		add_footer_button("Pay  p", func() -> void:
			close()
			screen.send_keys("p"))
	var close_button := add_footer_button("Close  Esc", close, kind == "goods")
	set_meta("safe_focus", close_button)


func _parse(lines: Array) -> void:
	# The currency is NetHack's own word(s): "zorkmids", or while
	# hallucinating "Altarian Dollars"…
	var goods := RegEx.create_from_string("^(.+), (?:(\\d+) (.+?)( each)?|no charge)$")
	var billed := RegEx.create_from_string("^(.) - (.+?)\\s+(\\d+) (.+)$")
	var current: Dictionary = {}
	# (The bill's first line is already a class heading; the others' a title.)
	for line in (lines if kind == "bill" else lines.slice(1)):
		var text := str(line.get("text", "")).strip_edges()
		if text == "":
			continue
		if text.begins_with("("):
			notes.append(text)
			continue
		if kind == "goods":
			var g := goods.search(text)
			if g == null:
				notes.append(text)
				continue
			if current.is_empty():
				current = {"heading": "", "rows": []}
				groups.append(current)
			if g.get_string(3) != "":
				_currency(g.get_string(3))
			(current.rows as Array).append({"letter": "", "name": g.get_string(1), "price": int(g.get_string(2)) if g.get_string(2) != "" else 0,
				"each": g.get_string(4) != "", "free": g.get_string(2) == ""})
			continue
		var b := billed.search(text)
		if b == null:
			# A class heading ("Unpaid Weapons", "Unpaid Bagged/Boxed items").
			current = {"heading": text.trim_prefix("Unpaid "), "rows": []}
			groups.append(current)
			continue
		_currency(b.get_string(4))
		if b.get_string(1) == "*":
			total = int(b.get_string(3))
			continue
		if current.is_empty():
			current = {"heading": "", "rows": []}
			groups.append(current)
		(current.rows as Array).append({"letter": b.get_string(1) if b.get_string(1) not in ["x", ">"] else "",
			"name": b.get_string(2), "price": int(b.get_string(3)), "each": false, "free": false})


## "zorkmids" reads "zm"; any other currency NetHack names is kept as it is.
func _currency(words: String) -> void:
	currency = "zm" if words.begins_with("zorkmid") else words


func _build() -> void:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 4)
	scroll.add_child(column)
	var count := 0
	for group in groups:
		if str(group.heading) != "":
			var heading := Label.new()
			heading.text = str(group.heading)
			heading.add_theme_font_override("font", UiTheme.heading_font())
			heading.add_theme_font_size_override("font_size", 16)
			heading.add_theme_color_override("font_color", UiTheme.GOLD)
			column.add_child(heading)
			count += 1
		for row in group.rows:
			column.add_child(_row(row))
			count += 1
	for text in notes:
		var note := Label.new()
		note.text = str(text)
		note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		note.theme_type_variation = "CaptionLabel"
		column.add_child(note)
		count += 1
	scroll.custom_minimum_size = Vector2(0, clampi(count * 58 + 10, 80, 600))


func _row(row: Dictionary) -> Control:
	var panel := PanelContainer.new()
	panel.set_meta("row", row)
	var style := UiTheme.panel_style(Color(1, 1, 1, 0.04), Color(1, 1, 1, 0.1), 8, 1, 0)
	style.content_margin_left = 8
	style.content_margin_right = 12
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	panel.add_theme_stylebox_override("panel", style)
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 12)
	panel.add_child(line)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(44, 44)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var item := _item_for(row)
	if not item.is_empty():
		icon.texture = ItemText.icon(item, screen.state)
	line.add_child(icon)
	var name := Label.new()
	name.text = (str(row.letter) + "  ·  " if str(row.letter) != "" else "") + str(row.name)
	name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.add_theme_font_size_override("font_size", 17)
	name.add_theme_color_override("font_color", UiTheme.INK)
	line.add_child(name)
	var price := Label.new()
	price.text = "no charge" if bool(row.free) else ("%d %s%s" % [int(row.price), currency, " each" if bool(row.each) else ""])
	price.add_theme_font_override("font", UiTheme.bold_font())
	price.add_theme_font_size_override("font_size", 18)
	price.add_theme_color_override("font_color", UiTheme.INK_DIM if bool(row.free) else UiTheme.GOLD)
	line.add_child(price)
	return panel


## The item a row names: in the pack by its letter (Iu), or in the pile under
## the hero by NetHack's name for it (goods); {} when neither has it.
func _item_for(row: Dictionary) -> Dictionary:
	var letter := str(row.letter)
	if letter != "":
		for item in screen.state.inventory:
			if char(int(item.get("selector", 0))) == letter:
				return item
	var words := str(row.name)
	for item in screen.state.map.pile(screen.state.map.hero) + screen.state.inventory:
		var text := str(item.get("text", ""))
		if text == words or text.ends_with(" - " + words) or text.begins_with(words):
			return item
	return {}


func handle_key(event: InputEventKey) -> bool:
	if event.pressed and InputRouter.key_to_nethack(event) == "p" and kind != "goods":
		close()
		screen.send_keys("p")
		return true
	# (Shift, Ctrl and the like alone don't count as a key.)
	if event.pressed and not event.echo and not event.keycode in [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META, KEY_CAPSLOCK]:
		close()
	return true
