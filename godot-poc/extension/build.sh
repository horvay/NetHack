#!/usr/bin/env bash
# Builds the Godot extension and the NetHack core library into project/bin.
#   build.sh             release core  (libnethack_core.so)
#   build.sh --fixtures  fixture core  (libnethack_core_fixtures.so), for tests
#
# libnh.a is rebuilt from a full clean, exactly like electron-poc's
# build:shim (Make does not track flag changes; see TESTING.md), then copied
# out of src/ immediately so later Electron builds cannot change it under us.
# Do not run this at the same time as an Electron shim build.
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
