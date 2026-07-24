cmake_minimum_required(VERSION 3.20)
project(nethack_electron_native LANGUAGES C)

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
