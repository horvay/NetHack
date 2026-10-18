#!/usr/bin/env bash
# Runs deep-path scenarios: tests/run.sh [scenario ...]  (default: all)
#
# Scenarios render for real on a private Xvfb display (:97 by default, from
# .tools/bin/Xvfb), so they never open windows on the desktop. Screenshots
# land in godot-poc/test-output/<scenario>/; open and inspect every one
# (TESTING.md). NH_GODOT_HEADLESS=1 skips rendering (no screenshots).
set -uo pipefail

godot_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
godot="$godot_dir/.tools/godot"
xvfb="$godot_dir/.tools/bin/Xvfb"
project="$godot_dir/project"
display="${NH_GODOT_XVFB_DISPLAY:-:97}"

scenarios=("$@")
if [[ ${#scenarios[@]} -eq 0 ]]; then
  for file in "$project"/tests/scenarios/*.gd; do
    scenarios+=("$(basename "$file" .gd)")
  done
fi

# New or changed art must be imported before scenes can load it.
"$godot" --headless --path "$project" --import >/dev/null 2>&1

# Fail fast on any script that does not compile.
if ! check_output="$("$godot" --headless --path "$project" -s res://tools/check_scripts.gd 2>&1)"; then
  echo "$check_output" | grep -E "BROKEN|Parse Error|Compile Error|at: GDScript|Can.t open" | head -40
  echo "FAIL script check"
  exit 1
fi

render_args=(--headless)
if [[ "${NH_GODOT_HEADLESS:-}" != "1" ]]; then
  if ! DISPLAY="$display" xdpyinfo >/dev/null 2>&1 && [[ ! -e "/tmp/.X${display#:}-lock" ]]; then
    "$xvfb" "$display" -screen 0 1920x1080x24 -nolisten tcp >/dev/null 2>&1 &
    sleep 1
  fi
  export DISPLAY="$display"
  unset WAYLAND_DISPLAY
  render_args=(--display-driver x11 --rendering-driver opengl3)
fi

failed=0
for scenario in "${scenarios[@]}"; do
  log_dir="$godot_dir/test-output/$scenario"
  mkdir -p "$log_dir"
  rm -f "$log_dir"/*.png  # no stale screenshots from earlier runs
  # Tests never make noise on the desktop's speakers. The full Godot log is
  # kept, and any script or engine error fails the scenario even if every
  # assertion passed (scenario failures themselves are "ERROR: FAIL:").
  # Each scenario gets a throwaway home, user directory (settings) and playground
  # (saves, scores, crash files): tests never touch the player's own data,
  # and every scenario starts from a first run.
  sandbox="$(mktemp -d "${TMPDIR:-/tmp}/nethack-godot-test.XXXXXX")"
  mkdir -p "$sandbox/home"
  HOME="$sandbox/home" XDG_DATA_HOME="$sandbox/data" NH_GODOT_PLAYGROUND="$sandbox/playground" \
    "$godot" "${render_args[@]}" --audio-driver Dummy --path "$project" -s res://tests/run_scenario.gd -- "$scenario" 2>&1 | tee "$log_dir/godot.log"
  status=${PIPESTATUS[0]}
  rm -rf "$sandbox"
  # Engine errors a scenario provokes on purpose are listed in that
  # scenario as "## expected-error: <text>" lines; they don't count there.
  expected_errors="$(grep -oP '^## expected-error: \K.*' "$project/tests/scenarios/$scenario.gd" || true)"
  [[ -z "$expected_errors" ]] && expected_errors="#no-expected-errors#"
  if grep -vF "$expected_errors" "$log_dir/godot.log" | grep -qP "SCRIPT ERROR|^ERROR: (?!FAIL)|instances were leaked|Unicode parsing error"; then
    echo "FAIL $scenario: errors in godot.log"
    grep -vF "$expected_errors" "$log_dir/godot.log" | grep -E "SCRIPT ERROR|^ERROR:|leaked|Unicode parsing error" | grep -v "ERROR: FAIL" | head -5
    status=1
  fi
  [[ $status -ne 0 ]] && failed=1
done
exit $failed
