class_name GameMenu
extends ModalCard
## Esc menu: resume, help, settings, save, quit.

var screen: GameScreen


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	card_width = 420.0
	var state := screen.state
	var info := "%s  ·  turn %d" % [state.level_name(true), state.status.turn()]
	if state.seed != "":
		info += "\nSeed %s" % state.seed
	set_title("Paused", info)
	for spec in [
		["Resume", "resume", false], ["Commands", "palette", false], ["Help & guide", "help", false],
		["Settings", "settings", false], ["Message history", "history", false],
		["Save and exit", "save", true], ["Quit run", "quit", true],
	]:
		if spec[1] == "save" and state.seed != "":
			var copy := Button.new()
			copy.text = "Copy seed (share this dungeon)"
			copy.focus_mode = Control.FOCUS_ALL
			copy.custom_minimum_size = Vector2(0, 40)
			copy.pressed.connect(func() -> void:
				DisplayServer.clipboard_set(state.seed)
				copy.text = "Seed copied")
			body.add_child(copy)
		var button := Button.new()
		button.text = spec[0]
		button.focus_mode = Control.FOCUS_ALL
		button.custom_minimum_size = Vector2(0, 48)
		button.add_theme_font_size_override("font_size", 20)
		if spec[2]:
			button.add_theme_color_override("font_color", UiTheme.WARN if spec[1] == "save" else UiTheme.BAD)
		button.pressed.connect(_choose.bind(spec[1]))
		body.add_child(button)


func _choose(id: String) -> void:
	close()
	match id:
		"resume":
			pass
		"save":
			screen.input_router.send_command("S")
		"quit":
			screen.input_router.send_command("#quit\n")
		_:
			screen.input_router.open_ui(id)
