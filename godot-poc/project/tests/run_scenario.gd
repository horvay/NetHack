extends SceneTree
## Runs one scenario: godot --path project -s res://tests/run_scenario.gd -- <name>
## Exits 0 on pass, 1 on failure. Writes output to godot-poc/test-output/<name>/.


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		printerr("usage: -- <scenario-name>")
		quit(2)
		return
	var scenario_name := args[0]
	var script := load("res://tests/scenarios/%s.gd" % scenario_name) as Script
	if script == null:
		printerr("no scenario named ", scenario_name)
		quit(2)
		return
	var output_dir := ProjectSettings.globalize_path("res://").path_join("../test-output").path_join(scenario_name).simplify_path()
	DirAccess.make_dir_recursive_absolute(output_dir)
	# The tree is not live during _initialize; nodes only become ready after.
	_run.call_deferred(scenario_name, script, output_dir)


func _run(scenario_name: String, script: Script, output_dir: String) -> void:
	var scenario: Scenario = script.new()
	scenario.name = "Scenario"
	root.add_child(scenario)
	scenario.setup(output_dir)
	print("SCENARIO ", scenario_name)
	var started := Time.get_ticks_msec()
	await scenario.run()
	if scenario.session.is_running():
		scenario.session.stop_game()
	var seconds := (Time.get_ticks_msec() - started) / 1000.0
	_write_event_log(scenario)
	var failures := scenario.failures.duplicate()
	var event_count := scenario.events.size()
	# Free the app before quitting so audio playback and caches wind down
	# inside the frame loop (nothing reported as leaked).
	scenario.queue_free()
	for i in 3:
		await process_frame
	if failures.is_empty():
		print("PASS %s (%.1fs, %d events)" % [scenario_name, seconds, event_count])
		quit(0)
	else:
		for failure in failures:
			print("  ✗ ", failure)
		print("FAIL %s (%d failures)" % [scenario_name, failures.size()])
		quit(1)


func _write_event_log(scenario: Scenario) -> void:
	var file := FileAccess.open(scenario.output_dir.path_join("events.jsonl"), FileAccess.WRITE)
	if file == null:
		return
	for event in scenario.events:
		file.store_line(JSON.stringify(event, "", false))
