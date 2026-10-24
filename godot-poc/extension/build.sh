#!/usr/bin/env bash
# Builds the Godot extension and the NetHack core library into project/bin.
#   build.sh             release core  (libnethack_core.so)
#   build.sh --fixtures  fixture core  (libnethack_core_fixtures.so), for tests
#
# libnh.a is rebuilt from a full clean (Make does not track flag changes; see
# TESTING.md), then copied out of src/ immediately so a later build of the
# other flavor cannot change it under us. Never run two builds at once.
set -euo pipefail

flavor=release
cc_args=()
fixtures=OFF
if [[ "${1:-}" == "--fixtures" ]]; then
  flavor=fixtures
  cc_args=("CC=cc -DNH_ELECTRON_TEST_FIXTURES")
  fixtures=ON
fi

ext_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$ext_dir/../.." && pwd)"
build_dir="$ext_dir/build/$flavor"
archive_dir="$build_dir/archives"

make -C "$root/src" clean
make -C "$root/src" WANT_LIBNH=1 "${cc_args[@]}" libnh.a
mkdir -p "$archive_dir"
cp "$root/src/libnh.a" "$root/src/hacklib.a" "$archive_dir/"

cmake -S "$ext_dir" -B "$build_dir" -DCMAKE_BUILD_TYPE=Release \
  -DNETHACK_ARCHIVE_DIR="$archive_dir" -DNH_GODOT_TEST_FIXTURES="$fixtures"
cmake --build "$build_dir" -j"$(nproc)" --target nethack_core nethack_gdext
