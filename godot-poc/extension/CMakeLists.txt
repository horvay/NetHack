cmake_minimum_required(VERSION 3.20)
project(nethack_godot LANGUAGES C CXX)

# Built by build.sh, which prepares NETHACK_ARCHIVE_DIR. Outputs land in
# godot-poc/project/bin next to nethack.gdextension:
#   libnethack_gdext.so        the Godot extension (NetHackCore node)
#   libnethack_core[_fixtures].so  libnh + shim bridge, dlopen'd per game

set(NETHACK_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../..")
set(BRIDGE_DIR "${NETHACK_ROOT}/electron-poc/shim-bridge")
set(GODOT_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.tools/godot-cpp")
set(PROJECT_BIN_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../project/bin")
set(NETHACK_ARCHIVE_DIR "" CACHE PATH "Directory holding libnh.a and hacklib.a")
set(LUA_SOURCE_DIR "${NETHACK_ROOT}/lib/lua-5.4.8/src")
option(NH_GODOT_TEST_FIXTURES "Build the fixture-enabled core (bridge test scenarios)" OFF)

if(NOT NETHACK_ARCHIVE_DIR)
  message(FATAL_ERROR "Set NETHACK_ARCHIVE_DIR; run godot-poc/extension/build.sh")
endif()

set(CMAKE_POSITION_INDEPENDENT_CODE ON)

include(FetchContent)
set(LIBUV_BUILD_SHARED OFF CACHE BOOL "" FORCE)
set(LIBUV_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LIBUV_BUILD_BENCH OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
  libuv
  GIT_REPOSITORY https://github.com/libuv/libuv.git
  GIT_TAG v1.52.1
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(libuv)

# --- Lua ------------------------------------------------------------------------
# NetHack's lib/lua archive is not position-independent, so the core library
# compiles the same Lua sources itself with NetHack's Linux flags.
file(GLOB LUA_SOURCES "${LUA_SOURCE_DIR}/*.c")
list(FILTER LUA_SOURCES EXCLUDE REGEX "/(lua|luac|onelua|ltests)\\.c$")
add_library(nethack_lua STATIC ${LUA_SOURCES})
target_compile_definitions(nethack_lua PRIVATE LUA_USE_LINUX)
target_include_directories(nethack_lua PUBLIC "${LUA_SOURCE_DIR}")

# --- NetHack core ------------------------------------------------------------
find_library(NCURSES_LIBRARY NAMES ncurses REQUIRED)
find_library(UUID_LIBRARY NAMES uuid REQUIRED)

if(NH_GODOT_TEST_FIXTURES)
  set(CORE_NAME "nethack_core_fixtures")
else()
  set(CORE_NAME "nethack_core")
endif()

add_library(nethack_core SHARED core/nhcore.c "${BRIDGE_DIR}/bridge-platform.c")
set_target_properties(
  nethack_core
  PROPERTIES
    OUTPUT_NAME "${CORE_NAME}"
    LIBRARY_OUTPUT_DIRECTORY "${PROJECT_BIN_DIR}"
    C_VISIBILITY_PRESET hidden
)
target_include_directories(nethack_core PRIVATE core "${BRIDGE_DIR}" "${NETHACK_ROOT}/include")
target_compile_definitions(nethack_core PRIVATE _GNU_SOURCE)
if(NH_GODOT_TEST_FIXTURES)
  target_compile_definitions(nethack_core PRIVATE NH_ELECTRON_TEST_FIXTURES)
endif()
target_link_options(
  nethack_core
  PRIVATE
    -Wl,--wrap=exit
    -Wl,--wrap=abort
    -Wl,--wrap=signal
    -Wl,--wrap=sigaction
    -Wl,--wrap=umask
    -Wl,--allow-multiple-definition
    -Wl,-Bsymbolic
    -Wl,--no-undefined
    "-Wl,--version-script=${CMAKE_CURRENT_SOURCE_DIR}/core/nhcore.map"
)
target_link_libraries(
  nethack_core
  PRIVATE
    uv_a
    -Wl,--start-group
    "${NETHACK_ARCHIVE_DIR}/libnh.a"
    "${NETHACK_ARCHIVE_DIR}/hacklib.a"
    nethack_lua
    -Wl,--end-group
    m
    dl
    pthread
    "${NCURSES_LIBRARY}"
    "${UUID_LIBRARY}"
)

# --- Godot extension -----------------------------------------------------------
add_subdirectory("${GODOT_CPP_DIR}" godot-cpp EXCLUDE_FROM_ALL)

add_library(nethack_gdext SHARED src/nethack_core.cpp src/register_types.cpp)
target_include_directories(nethack_gdext PRIVATE src core)
target_link_libraries(nethack_gdext PRIVATE godot-cpp dl pthread)
set_target_properties(
  nethack_gdext
  PROPERTIES
    CXX_STANDARD 17
    CXX_EXTENSIONS OFF
    CXX_VISIBILITY_PRESET hidden
    OUTPUT_NAME "nethack_gdext"
    LIBRARY_OUTPUT_DIRECTORY "${PROJECT_BIN_DIR}"
)
