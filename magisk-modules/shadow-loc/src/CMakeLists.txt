cmake_minimum_required(VERSION 3.18)
project(shadow-loc)

set(CMAKE_CXX_STANDARD 17)

# ── Zygisk module .so ────────────────────────────────────────────────────────
add_library(shadow-loc SHARED
    zygisk/main.cpp
)
target_include_directories(shadow-loc PRIVATE
    ${CMAKE_SOURCE_DIR}/include
)
target_link_libraries(shadow-loc
    android
    log
)
# Zygisk API header — fetch from zygisk-standalone or Magisk source
# Place zygisk.hpp in src/include/

# ── shadowlocd daemon binary ─────────────────────────────────────────────────
add_executable(shadowlocd
    daemon/shadowlocd.cpp
)
target_link_libraries(shadowlocd
    log
)
set_target_properties(shadowlocd PROPERTIES
    LINK_FLAGS "-static-libstdc++"
)
