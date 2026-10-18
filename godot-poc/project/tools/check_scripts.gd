extends SceneTree
## Recompiles every GDScript in the project from source and reports errors.
## godot --headless --path project -s res://tools/check_scripts.gd

func _initialize() -> void:
	var failed := 0
	var checked := 0
	for path in _scripts("res://"):
		var script := GDScript.new()
		script.source_code = FileAccess.get_file_as_string(path)
		script.resource_path = path
		checked += 1
		if script.reload() != OK:
			print("BROKEN ", path)
			failed += 1
	# The engine extension must load, or every scenario just times out.
	if not ClassDB.class_exists("NetHackCore"):
		print("BROKEN extension: NetHackCore did not load (see the errors above)")
		failed += 1
	print("checked %d scripts, %d broken" % [checked, failed])
	quit(1 if failed > 0 else 0)


func _scripts(dir_path: String) -> Array[String]:
	var found: Array[String] = []
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return found
	for file in dir.get_files():
		if file.ends_with(".gd"):
			found.append(dir_path.path_join(file))
	for sub in dir.get_directories():
		if not sub.begins_with("."):
			found.append_array(_scripts(dir_path.path_join(sub)))
	return found
