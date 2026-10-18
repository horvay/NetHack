#!/usr/bin/env bash
# Plays NetHack in the Godot front end.
#   ./play.sh            build anything missing, then play
#   ./play.sh --rebuild  rebuild the engine libraries first
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
godot="$here/.tools/godot"
if [[ ! -x "$godot" ]]; then
  echo "Godot is missing: download Godot 4.7.2 (linux x86_64) into $here/.tools/ (see BIBLE.md, Layout)." >&2
  exit 1
fi
if [[ "${1:-}" == "--rebuild" || ! -f "$here/project/bin/libnethack_core.so" || ! -f "$here/project/bin/libnethack_gdext.so" ]]; then
  "$here/extension/build.sh"
fi
# The host app may export this for its own Electron; Godot never wants it.
unset ELECTRON_RUN_AS_NODE
"$godot" --headless --path "$here/project" --import >/dev/null 2>&1
exec "$godot" --path "$here/project"
