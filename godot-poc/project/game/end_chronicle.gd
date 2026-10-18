class_name EndChronicle
extends Node
## Takes over when the hero's run ends: answers NetHack's closing questions
## ("Do you want your possessions identified?" ...) with yes so every
## disclosure is shown, and files each one into a chapter of the chronicle
## (possessions, attributes, vanquished, genocided, conduct, overview) for
## the end screen. Never answers with Escape, which upsets NetHack here.

const SECTIONS := [
	["possessions", "possessions"], ["attributes", "attributes"], ["vanquished", "vanquished"],
	["genocided", "genocided"], ["conduct", "conduct"], ["overview", "overview"], ["achievements", "achievements"],
]

var screen: GameScreen
var section := "notes"


func attach(game_screen: GameScreen) -> void:
	screen = game_screen
	name = "EndChronicle"
	screen.add_child(self)
	screen.state.request_changed.connect(_on_request)
	screen.state.text_window_shown.connect(_on_text_window)
	screen.state.message_added.connect(_on_message)


## Files lines under the chapter their heading names; NetHack shows some
## disclosures without asking first, so the text itself decides.
func _file(lines: Array) -> void:
	var head := ""
	for line in lines:
		if str(line).strip_edges() != "":
			head = str(line).to_lower()
			break
	if head.contains("attributes:"):
		section = "attributes"
	elif head.contains("voluntary challenges") or head.contains("conduct"):
		section = "conduct"
	elif head.contains("vanquished"):
		section = "vanquished"
	elif head.contains("genocided"):
		section = "genocided"
	elif head.contains("achievements"):
		section = "achievements"
	elif head.contains("the dungeons of doom") or head.contains("you were here") or head.contains("dungeon overview"):
		section = "overview"
	var chapter: Array = screen.state.chronicle.get(section, [])
	chapter.append_array(lines)
	screen.state.chronicle[section] = chapter


func _on_message(entry: Dictionary) -> void:
	if screen.state.ending:
		var deaths: Array = screen.state.chronicle.get("final_words", [])
		deaths.append(entry.text)
		screen.state.chronicle["final_words"] = deaths


func _on_request(request: Dictionary) -> void:
	if not screen.state.ending:
		return
	match str(request.get("kind", "")):
		"yn":
			var query := str(request.get("query", "")).to_lower()
			var choices := str(request.get("choices", ""))
			for entry in SECTIONS:
				if query.contains(entry[0]):
					section = entry[1]
			if query.begins_with("do you want") and choices.contains("y"):
				screen.send_keys("y")
			elif choices.contains("n"):
				screen.send_keys("n")
			elif choices.contains("q"):
				screen.send_keys("q")
			else:
				screen.send_keys("y")
		"menu":
			var lines := []
			for item in request.get("items", []):
				var text := str(item.get("text", ""))
				# Headers (no selector) are marked so the end screen can style them.
				lines.append(("## " + text) if int(item.get("selector", 0)) == 0 and not text.begins_with(" ") else text)
			var purpose := str(request.get("purpose", ""))
			if purpose.contains("finalInventory"):
				section = "possessions"
				screen.state.chronicle[section] = []
			_file(lines)
			if int(request.get("how", 0)) == 0:
				screen.send_keys(" ")
			else:
				screen.send_keycode(27)
		"key":
			screen.send_keys(" ")
		"line":
			screen.send_keys("\n")
		"direction", "map_target":
			screen.send_keycode(27)


func _on_text_window(window: Dictionary) -> void:
	if not screen.state.ending:
		return
	var lines := []
	for line in window.get("lines", []):
		lines.append(str(line.get("text", "")))
	_file(lines)
