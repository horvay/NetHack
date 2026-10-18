class_name ConfirmDialog
extends ModalCard
## "Are you sure?" for actions that can hurt the hero or end the run.

var _on_yes: Callable


func setup(question: String, detail: String, yes_label: String, on_yes: Callable) -> void:
	name = "Confirm"
	_on_yes = on_yes
	# While it is open, nothing reaches the game (DialogHost.owns_input).
	add_to_group("blocking_modal")
	card_width = 480.0
	dim_alpha = 0.5
	set_title(question, detail)
	# The safe answer has the focus: Enter (or pad A) on it cancels.
	var cancel := add_footer_button("Cancel  Esc", close)
	add_footer_button(yes_label, _yes, true)
	set_meta("safe_focus", cancel)


func _ready() -> void:
	super._ready()
	GamepadRouter.focus_dialog.call_deferred(self)


func handle_key(event: InputEventKey) -> bool:
	if event.keycode == KEY_ESCAPE:
		close()
		return true
	return false


func _yes() -> void:
	close()
	_on_yes.call()


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_ESCAPE:
			close()
			get_viewport().set_input_as_handled()
