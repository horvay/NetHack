class_name Settings
extends RefCounted
## Player preferences, saved to user://settings.cfg. Gameplay choices become
## NETHACKOPTIONS for the next game; presentation choices apply live.

const PATH := "user://settings.cfg"

var autopickup := "gold"        # gold | all (useful items) | everything | off
var number_pad := false
var reduced_motion := false
var screen_shake := true
var master_volume := 0.7
var music_volume := 0.6
var default_zoom := 4
var show_key_hints := true
var confirm_dangerous := true
var ascii_overlay := false
var high_contrast := false
var ui_scale := 1.0
var detailed_status := false
var keep_diagnostics := false
var interface_sounds := true
var game_sounds := true
## Follow-up actions after "This door is locked" (Electron's contextual
## prompts): off | essential (only with an unlocking tool) | full.
var contextual_prompts := "full"
var minimap_size := "medium"    # small | medium | large
var fullscreen := false
## NetHack's rest_on_space: Space waits a turn (as in Electron). Off, as in
## classic tty, by default.
var rest_on_space := false
## Any other NetHack options, as in an rc file's OPTIONS= line
## ("paranoid_confirmation:pray,pickup_burden:burdened,fruit:mango").
## NetHack reads no ~/.nethackrc in this front end; this replaces it.
## Options the interface owns (menustyle) are always set after these.
var extra_options := ""

## Why the stored settings couldn't be read ("" when they could, or when
## there were none yet); the title screen says so.
var load_error := ""

signal changed


static func load_or_default() -> Settings:
	var settings := Settings.new()
	var file := ConfigFile.new()
	var result := file.load(PATH)
	if result == ERR_FILE_NOT_FOUND:
		# First run: follow the system's reduced-motion preference where the
		# platform reports one (1 yes, 0 no, -1 unknown, as on Linux).
		settings.reduced_motion = os_reduces_motion()
	elif result != OK:
		settings.load_error = "Your settings couldn't be read (%s), so the defaults are in use." % error_string(result)
	if result == OK:
		settings.autopickup = file.get_value("gameplay", "autopickup", settings.autopickup)
		settings.number_pad = file.get_value("gameplay", "number_pad", settings.number_pad)
		settings.confirm_dangerous = file.get_value("gameplay", "confirm_dangerous", settings.confirm_dangerous)
		settings.reduced_motion = file.get_value("display", "reduced_motion", settings.reduced_motion)
		settings.screen_shake = file.get_value("display", "screen_shake", settings.screen_shake)
		settings.default_zoom = file.get_value("display", "default_zoom", settings.default_zoom)
		settings.show_key_hints = file.get_value("display", "show_key_hints", settings.show_key_hints)
		settings.ascii_overlay = file.get_value("display", "ascii_overlay", settings.ascii_overlay)
		settings.high_contrast = file.get_value("display", "high_contrast", settings.high_contrast)
		settings.master_volume = file.get_value("audio", "master_volume", settings.master_volume)
		settings.music_volume = file.get_value("audio", "music_volume", settings.music_volume)
		settings.ui_scale = file.get_value("display", "ui_scale", settings.ui_scale)
		settings.detailed_status = file.get_value("display", "detailed_status", settings.detailed_status)
		settings.keep_diagnostics = file.get_value("advanced", "keep_diagnostics", settings.keep_diagnostics)
		settings.interface_sounds = file.get_value("audio", "interface_sounds", settings.interface_sounds)
		settings.game_sounds = file.get_value("audio", "game_sounds", settings.game_sounds)
		settings.contextual_prompts = file.get_value("gameplay", "contextual_prompts", settings.contextual_prompts)
		settings.minimap_size = file.get_value("display", "minimap_size", settings.minimap_size)
		settings.fullscreen = file.get_value("display", "fullscreen", settings.fullscreen)
		settings.rest_on_space = file.get_value("gameplay", "rest_on_space", settings.rest_on_space)
		settings.extra_options = file.get_value("gameplay", "extra_options", settings.extra_options)
	return settings


## The OS asks for reduced motion (1 yes, 0 no, -1 unknown, as on Linux).
static func os_reduces_motion() -> bool:
	return DisplayServer.has_method("accessibility_should_reduce_animation") and int(DisplayServer.call("accessibility_should_reduce_animation")) == 1


## Writes the settings; false (and nothing changed) when the file can't be
## written.
func save() -> bool:
	var file := ConfigFile.new()
	file.set_value("gameplay", "autopickup", autopickup)
	file.set_value("gameplay", "number_pad", number_pad)
	file.set_value("gameplay", "confirm_dangerous", confirm_dangerous)
	file.set_value("display", "reduced_motion", reduced_motion)
	file.set_value("display", "screen_shake", screen_shake)
	file.set_value("display", "default_zoom", default_zoom)
	file.set_value("display", "show_key_hints", show_key_hints)
	file.set_value("display", "ascii_overlay", ascii_overlay)
	file.set_value("display", "high_contrast", high_contrast)
	file.set_value("audio", "master_volume", master_volume)
	file.set_value("audio", "music_volume", music_volume)
	file.set_value("display", "ui_scale", ui_scale)
	file.set_value("display", "detailed_status", detailed_status)
	file.set_value("advanced", "keep_diagnostics", keep_diagnostics)
	file.set_value("audio", "interface_sounds", interface_sounds)
	file.set_value("audio", "game_sounds", game_sounds)
	file.set_value("gameplay", "contextual_prompts", contextual_prompts)
	file.set_value("display", "minimap_size", minimap_size)
	file.set_value("display", "fullscreen", fullscreen)
	file.set_value("gameplay", "rest_on_space", rest_on_space)
	file.set_value("gameplay", "extra_options", extra_options)
	if file.save(PATH) != OK:
		return false
	load_error = ""
	changed.emit()
	return true


## NETHACKOPTIONS for a new game.
func nethack_options() -> String:
	# NetHack applies a NETHACKOPTIONS list right to left (src/options.c
	# parseoptions): the LEFTMOST setting is applied last and wins. So:
	# what Settings owns first (it must win), then the player's extra
	# options, then Godot's other defaults (which extras may override).
	var owned: Array[String] = []
	match autopickup:
		"gold":
			owned.append("autopickup")
			owned.append("pickup_types:$")
		"all":
			owned.append("autopickup")
			owned.append("pickup_types:$?!/=\"+")
		"everything":
			# No pickup_types: NetHack picks up anything it may.
			owned.append("autopickup")
		_:
			owned.append("!autopickup")
	owned.append("number_pad:%d" % (1 if number_pad else 0))
	owned.append("rest_on_space" if rest_on_space else "!rest_on_space")
	var extra: Array[String] = []
	var text := extra_options.strip_edges()
	if text.to_upper().begins_with("OPTIONS="):
		text = text.substr(8)  # a pasted rc line
	# Options Settings owns are dropped here (Settings' value wins anyway;
	# NetHack negates with "!" or "no").
	var settings_owned := RegEx.create_from_string("^(?:!|no-?)?(menustyle|menu_style|rest_on_space|number_pad|autopickup|pickup_types)\\b")
	for option in text.split(",", false):
		var clean := option.strip_edges()
		if clean != "" and settings_owned.search(clean.to_lower()) == null:
			extra.append(clean)
	var defaults: Array[String] = ["!tutorial", "!tips", "time", "showexp", "showscore", "runmode:walk", "disclose:+i +a +v +g +c +o"]
	return ",".join(owned + extra + defaults)


func reset_to_defaults() -> void:
	var fresh := Settings.new()
	# Every stored setting (script variables), so new ones are never missed.
	for property in fresh.get_property_list():
		if property.usage & PROPERTY_USAGE_SCRIPT_VARIABLE and property.name != "load_error":
			set(property.name, fresh.get(property.name))
	# As on a first run.
	reduced_motion = os_reduces_motion()
