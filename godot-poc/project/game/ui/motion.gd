class_name Motion
extends RefCounted
## One switch for nonessential animation (Settings > Reduced motion).


static func enabled() -> bool:
	return not (App.instance and App.instance.settings.reduced_motion)


static func confirm_dangerous() -> bool:
	return App.instance == null or App.instance.settings.confirm_dangerous


static func key_hints() -> bool:
	return App.instance == null or App.instance.settings.show_key_hints
