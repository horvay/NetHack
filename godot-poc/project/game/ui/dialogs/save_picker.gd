class_name SavePicker
extends ModalCard
## Lists every saved hero to continue.

var _on_pick: Callable
## Called after a save file was deleted (the title screen rebuilds).
var on_deleted: Callable


func setup(saves: Array[Dictionary], on_pick: Callable) -> void:
	_on_pick = on_pick
	card_width = 620.0
	set_title("Saved heroes")
	var resolver := TileResolver.shared()
	for save in saves:
		var character: Dictionary = save.character
		var button := Button.new()
		button.custom_minimum_size = Vector2(0, 64)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.icon = resolver.texture(resolver.player_avatar_id(character))
		button.add_theme_constant_override("icon_max_width", 48)
		var role: String = CharacterOptions.ROLES.get(character.get("role", ""), {}).get("label", "adventurer")
		button.text = "%s the %s   ·   saved %s" % [save.name, role, SaveCatalog.when(int(save.modified))]
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(func() -> void:
			close()
			_on_pick.call(save))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		row.add_child(button)
		var delete := Button.new()
		delete.text = "Delete"
		delete.custom_minimum_size = Vector2(96, 64)
		delete.add_theme_color_override("font_color", UiTheme.BAD)
		delete.tooltip_text = "Delete this saved game for good"
		delete.pressed.connect(_confirm_delete.bind(save, row))
		row.add_child(delete)
		body.add_child(row)
	add_footer_button("Cancel  Esc", close)


func _confirm_delete(save: Dictionary, row: Control) -> void:
	var confirm := ConfirmDialog.new()
	confirm.setup("Delete %s?" % save.name, "The saved game is removed for good. This can't be undone.", "Delete", func() -> void:
		DirAccess.remove_absolute(str(save.path))
		row.queue_free()
		if on_deleted.is_valid():
			on_deleted.call())
	add_child(confirm)


func handle_key(event: InputEventKey) -> bool:
	if event.keycode == KEY_ESCAPE:
		close()
		return true
	return false
