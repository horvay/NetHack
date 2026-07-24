cmake_minimum_required(VERSION 3.20)
project(nethack_electron_native LANGUAGES C CXX)

include(FetchContent)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
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

add_library(bridge_platform STATIC bridge-platform.c)
target_include_directories(bridge_platform PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(bridge_platform PUBLIC uv_a)
target_compile_features(bridge_platform PUBLIC c_std_11)

if(MSVC)
  target_compile_options(bridge_platform PRIVATE /W4 /WX)
else()
  target_compile_options(bridge_platform PRIVATE -Wall -Wextra -Werror)
endif()

add_executable(
  bridge_platform_contract
  "${CMAKE_CURRENT_SOURCE_DIR}/../test/native/bridge-platform-contract.c"
)
target_link_libraries(bridge_platform_contract PRIVATE bridge_platform)

enable_testing()
add_test(NAME bridge_platform_contract COMMAND bridge_platform_contract)

option(NH_ELECTRON_TEST_FIXTURES "Enable native bridge test fixtures" OFF)
option(NH_BUILD_NATIVE_BRIDGE "Build the NetHack shim bridge executable" OFF)
set(NETHACK_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../..")
set(LIBNH_ARCHIVE "${NETHACK_ROOT}/src/libnh.a")
set(HACKLIB_ARCHIVE "${NETHACK_ROOT}/src/hacklib.a")
set(LUA_ARCHIVE "${NETHACK_ROOT}/lib/lua/liblua-5.4.8.a")

if(NH_BUILD_NATIVE_BRIDGE AND UNIX AND EXISTS "${LIBNH_ARCHIVE}")
  find_library(NCURSES_LIBRARY NAMES ncurses REQUIRED)
  find_library(UUID_LIBRARY NAMES uuid REQUIRED)
  add_executable(nh_shim_bridge nh-shim-bridge.c)
  set_target_properties(
    nh_shim_bridge
    PROPERTIES
      OUTPUT_NAME "nh-shim-bridge"
      RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  )
  target_include_directories(nh_shim_bridge PRIVATE "${NETHACK_ROOT}/include")
  target_compile_definitions(nh_shim_bridge PRIVATE _GNU_SOURCE)
  if(NH_ELECTRON_TEST_FIXTURES)
    target_compile_definitions(nh_shim_bridge PRIVATE NH_ELECTRON_TEST_FIXTURES)
  endif()
  target_link_options(nh_shim_bridge PRIVATE -Wl,--allow-multiple-definition)
  target_link_libraries(
    nh_shim_bridge
    PRIVATE
      bridge_platform
      -Wl,--start-group
      "${LIBNH_ARCHIVE}"
      "${HACKLIB_ARCHIVE}"
      "${LUA_ARCHIVE}"
      -Wl,--end-group
      m
      dl
      "${NCURSES_LIBRARY}"
      "${UUID_LIBRARY}"
  )
endif()

if(NH_BUILD_NATIVE_BRIDGE AND WIN32)
  file(
    STRINGS
    "${NETHACK_ROOT}/sys/windows/vs/NetHack/NetHack.vcxproj"
    NETHACK_SOURCE_LINES
    REGEX "ClCompile Include=\"\\$\\(SrcDir\\).+\\.c\""
  )
  set(NETHACK_CORE_SOURCES)
  foreach(SOURCE_LINE IN LISTS NETHACK_SOURCE_LINES)
    string(
      REGEX REPLACE
      ".*\\$\\(SrcDir\\)([^\"]+\\.c)\".*"
      "\\1"
      SOURCE_FILE
      "${SOURCE_LINE}"
    )
    list(APPEND NETHACK_CORE_SOURCES "${NETHACK_ROOT}/src/${SOURCE_FILE}")
  endforeach()
  list(APPEND NETHACK_CORE_SOURCES
    "${NETHACK_ROOT}/src/hacklib.c"
    "${NETHACK_ROOT}/src/nhmd4.c"
    "${NETHACK_ROOT}/sys/share/cppregex.cpp"
    "${NETHACK_ROOT}/util/panic.c"
    "${NETHACK_ROOT}/sys/windows/windmain.c"
    "${NETHACK_ROOT}/sys/windows/windsys.c"
    "${NETHACK_ROOT}/win/shim/winshim.c"
  )
  file(GLOB LUA_SOURCES "${NETHACK_ROOT}/lib/lua/*.c")
  list(FILTER LUA_SOURCES EXCLUDE REGEX "/(lua|luac|onelua)\\.c$")

  add_executable(
    nh_shim_bridge
    nh-shim-bridge.c
    ${NETHACK_CORE_SOURCES}
    ${LUA_SOURCES}
  )
  set_target_properties(
    nh_shim_bridge
    PROPERTIES
      OUTPUT_NAME "nh-shim-bridge"
      RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
      RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_CURRENT_SOURCE_DIR}"
  )
  target_include_directories(
    nh_shim_bridge
    PRIVATE
      "${NETHACK_ROOT}/include"
      "${NETHACK_ROOT}/sys/windows"
      "${NETHACK_ROOT}/sys/share"
      "${NETHACK_ROOT}/win/share"
      "${NETHACK_ROOT}/lib/lua"
  )
  target_compile_definitions(
    nh_shim_bridge
    PRIVATE
      WIN32
      CRT_SECURE_NO_DEPRECATE
      _SCL_SECURE_NO_DEPRECATE
      _CRT_NONSTDC_NO_DEPRECATE
      _CRT_SECURE_NO_WARNINGS
      WINVER=0x0601
      _WIN32_WINNT=0x0601
      SHIM_GRAPHICS
      NOTTYGRAPHICS
      NOSHELL
      NO_SIGNAL
      NO_TILE_C
      NOMAIL
      LIBNH
      NOSTATICFN
      DLB
      _LIB
      HAS_STDINT_H
      HAS_INTTYPES_H
      DEFAULT_WINDOW_SYS=\"shim\"
  )
  if(NH_ELECTRON_TEST_FIXTURES)
    target_compile_definitions(nh_shim_bridge PRIVATE NH_ELECTRON_TEST_FIXTURES)
  endif()
  target_compile_options(nh_shim_bridge PRIVATE /wd4100 /wd4244 /wd4245 /wd4310 /wd4706 /wd4820 /wd4324)
  target_link_libraries(
    nh_shim_bridge
    PRIVATE
      bridge_platform
      bcrypt
      dbghelp
      user32
      gdi32
      advapi32
      shell32
      ole32
      uuid
      winmm
      userenv
      rpcrt4
  )
endif()
