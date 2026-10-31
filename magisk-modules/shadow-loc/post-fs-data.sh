#!/system/bin/sh
# Runs early in boot — set props before GPS HAL initializes
# Force allow mock location at the property level
resetprop ro.allow.mock.location 1
resetprop ro.debuggable 1

# Disable GPS hardware to force apps to use our mock provider
# (optional — comment out if you want GPS as fallback)
# resetprop ro.gps.hardware ""
