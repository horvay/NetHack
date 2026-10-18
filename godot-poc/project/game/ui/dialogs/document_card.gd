class_name DocumentCard
extends ModalCard
## A card showing one of NetHack's documents (^X, ^O, discoveries,
## #vanquished, the shop lists, conduct…): any key closes it, as NetHack's
## window does. Shift, Ctrl and the like alone don't count as a key.

const MODIFIER_KEYS := [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META, KEY_CAPSLOCK]


func handle_key(event: InputEventKey) -> bool:
	if event.pressed and not event.echo and not event.keycode in MODIFIER_KEYS:
		close()
	return true
