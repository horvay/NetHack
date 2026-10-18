class_name App
extends Node
## Application root: owns the engine session and moves between the title
## screen, a game in progress and the end-of-run screen.

signal game_started(screen: GameScreen)
signal game_finished(summary: Dictionary)

var session: NetHackSession
var game: GameScreen
var title: Node
var settings := Settings.load_or_default()

static var instance: App


var _quit_after_save := false
## How the app exits; tests replace it to observe quitting.
var quit_handler := func() -> void: get_tree().quit()


func _ready() -> void:
	instance = self
	get_tree().auto_accept_quit = false
	get_window().title = "NetHack"
	RenderingServer.set_default_clear_color(Color("06070a"))
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(settings.master_volume, 0.0001)))
	# The smallest window the layout is checked at (tests/scenarios/small_window).
	get_window().min_size = Vector2i(1280, 720)
	apply_fullscreen()
	apply_ui_scale()
	get_window().size_changed.connect(apply_ui_scale)
	_bind_pad_to_ui()
	session = NetHackSession.new()
	session.name = "NetHackSession"
	add_child(session)
	session.game_ended.connect(_on_session_ended)
	if not OS.get_cmdline_user_args().has("--no-title") and not Engine.is_editor_hint():
		if get_tree().current_scene == self:
			show_title()


func show_title() -> void:
	_clear_menus()
	title = TitleScreen.new()
	title.name = "Title"
	add_child(title)
	title.setup(self)
	if settings.load_error != "" and title.status_label.text == "":
		title.status_label.text = settings.load_error


func show_character_creation() -> void:
	_clear_menus()
	title = CharacterCreation.new()
	title.name = "CharacterCreation"
	add_child(title)
	title.setup(self)


func _clear_menus() -> void:
	if is_instance_valid(title):
		title.queue_free()
	title = null
	if is_instance_valid(game) and not session.is_running():
		game.queue_free()
		game = null


## Resumes a saved hero (spec is just the name; NetHack finds the save).
func continue_game(save: Dictionary) -> GameScreen:
	var screen := start_game(str(save.name))
	if screen == null:
		return null
	screen.state.restored = true
	var character: Dictionary = save.get("character", {})
	if not character.is_empty():
		screen.state.character = character.duplicate()
		screen.state.character["name"] = save.name
	return screen


## NetHack seeds are numbers; any other text is hashed to one.
static func normalize_seed(seed: String) -> String:
	var text := seed.strip_edges()
	# Decimal and 0x-hex seeds go to NetHack as typed (it reads both, like
	# Electron); any other text becomes a stable number.
	if RegEx.create_from_string("^0[xX][0-9a-fA-F]{1,16}$").search(text):
		return text
	if RegEx.create_from_string("^[0-9]{1,19}$").search(text):
		# NetHack reads a leading 0 as octal ("089" would be invalid and
		# silently random): send plain decimal.
		var trimmed := text.lstrip("0")
		return trimmed if trimmed != "" else "0"
	if text == "":
		return text
	return str(absi(hash(text)))


## Starts a new game (or continues a saved one when spec is just a name).
func start_game(spec: String, seed := "", options := "") -> GameScreen:
	if is_instance_valid(title):
		title.queue_free()
		title = null
	if is_instance_valid(game):
		game.queue_free()
	game = GameScreen.new(session)
	game.name = "Game"
	game.save_failed.connect(func() -> void: _quit_after_save = false)
	# Closed while dying, then saved by an amulet: still save and quit.
	game.state.ending_cancelled.connect(func() -> void:
		if _quit_after_save:
			game.save_from_anywhere())
	add_child(game)
	var error := game.begin(spec, normalize_seed(seed), options if options != "" else settings.nethack_options())
	if error != OK:
		# Back to the title with the reason, never a dead game screen.
		push_warning("could not start NetHack: %s" % error_string(error))
		game.queue_free()
		game = null
		show_title()
		var why := {ERR_ALREADY_IN_USE: "Another game is still running in this window.",
			ERR_FILE_BAD_PATH: "The game data folder could not be opened."}.get(error, "NetHack could not start (%s)." % error_string(error))
		title.status_label.text = why
		return null
	game_started.emit(game)
	return game


## Interface size on top of the window's own scaling (accessibility).
## The layout is designed for 1920x1080 and shrinks with the window; below
## MIN_EFFECTIVE_SCALE text gets too small to read, so small windows get a
## boost (the layout then has less room, and panels fit themselves).
const MIN_EFFECTIVE_SCALE := 0.8


func apply_ui_scale() -> void:
	var window := get_window()
	var size := Vector2(window.size)
	var base := Vector2(window.content_scale_size) if window.content_scale_size != Vector2i.ZERO else Vector2(1920, 1080)
	var stretch := minf(size.x / base.x, size.y / base.y) if size.x > 0 and size.y > 0 else 1.0
	var boost := maxf(1.0, MIN_EFFECTIVE_SCALE / maxf(stretch, 0.01))
	window.content_scale_factor = clampf(settings.ui_scale, 0.75, 1.5) * boost


## Godot's UI actions have no controller buttons by default here: A presses
## the focused control, the D-pad and left stick move focus.
func _bind_pad_to_ui() -> void:
	var buttons := {"ui_accept": JOY_BUTTON_A, "ui_up": JOY_BUTTON_DPAD_UP, "ui_down": JOY_BUTTON_DPAD_DOWN,
		"ui_left": JOY_BUTTON_DPAD_LEFT, "ui_right": JOY_BUTTON_DPAD_RIGHT}
	for action in buttons:
		var event := InputEventJoypadButton.new()
		event.button_index = buttons[action]
		if not InputMap.action_has_event(action, event):
			InputMap.action_add_event(action, event)
	var axes := {"ui_up": [JOY_AXIS_LEFT_Y, -1.0], "ui_down": [JOY_AXIS_LEFT_Y, 1.0], "ui_left": [JOY_AXIS_LEFT_X, -1.0], "ui_right": [JOY_AXIS_LEFT_X, 1.0]}
	for action in axes:
		var motion := InputEventJoypadMotion.new()
		motion.axis = axes[action][0]
		motion.axis_value = axes[action][1]
		if not InputMap.action_has_event(action, motion):
			InputMap.action_add_event(action, motion)


## Static caches hold resources for the whole run; let them go at exit so
## nothing is reported as leaked.
func _exit_tree() -> void:
	TerrainPainter._shared = null
	TileResolver._shared = null
	SoundBank._shared = null
	UiTheme._heading = null
	UiTheme._body = null
	UiTheme._body_bold = null
	UiTheme._body_italic = null
	UiTheme._theme = null
	MessageLog._category_regexes.clear()
	if instance == self:
		instance = null


## Settings > Fullscreen, and F11 anywhere (NetHack doesn't use F11).
func apply_fullscreen() -> void:
	var mode := Window.MODE_FULLSCREEN if settings.fullscreen else Window.MODE_WINDOWED
	if get_window().mode != mode and not (mode == Window.MODE_WINDOWED and get_window().mode == Window.MODE_MAXIMIZED):
		get_window().mode = mode


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F11:
		settings.fullscreen = not settings.fullscreen
		settings.save()
		apply_fullscreen()
		get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		request_quit()


## Closing the app never abandons a run: it saves, from any prompt (the
## open question is declined first, as NetHack's own hangup save does).
## During the end-of-game questions it lets the run end (so the score is
## recorded) and then quits.
func request_quit() -> void:
	if not session.is_running() or not is_instance_valid(game):
		quit_handler.call()
		return
	# A wish can't be put off: declining it would waste it.
	var request := game.state.request
	if str(request.get("kind", "")) == "line" and str(request.get("query", "")).to_lower().contains("wish"):
		var confirm := ConfirmDialog.new()
		confirm.setup("Make your wish first?", "Saving now leaves the wish blank, and NetHack then picks a random object for you.", "Save and quit anyway", func() -> void:
			_quit_after_save = true
			game.save_from_anywhere())
		game.dialogs.root.add_child(confirm)
		return
	_quit_after_save = true
	if game.state.ending:
		return
	game.save_from_anywhere()


func _on_session_ended(result: Dictionary) -> void:
	if _quit_after_save:
		_quit_after_save = false
		quit_handler.call()
		return
	var summary := result.duplicate()
	if is_instance_valid(game):
		summary["state"] = game.state
	game_finished.emit(summary)
	var end := EndScreen.new()
	end.name = "EndScreen"
	add_child(end)
	end.setup(self, summary)
