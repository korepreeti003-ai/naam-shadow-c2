package com.shadow.loc

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Receives location updates from C2 via am broadcast
// Usage: am broadcast -a com.shadow.loc.UPDATE --ef lat <v> --ef lon <v> [...]
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val lat = intent.getDoubleExtra("lat", Double.NaN)
        val lon = intent.getDoubleExtra("lon", Double.NaN)
        if (lat.isNaN() || lon.isNaN()) return

        // Write to config file — LocationService picks it up within 2s
        val conf = java.io.File("/data/local/tmp/shadowloc.conf")
        val existing = if (conf.exists()) conf.readText() else ""
        val updated = buildString {
            existing.lines().forEach { line ->
                val key = line.substringBefore('=').trim()
                when (key) {
                    "LAT" -> appendLine("LAT=$lat")
                    "LON" -> appendLine("LON=$lon")
                    "ALT" -> {
                        val alt = intent.getDoubleExtra("alt", Double.NaN)
                        if (!alt.isNaN()) appendLine("ALT=$alt") else appendLine(line)
                    }
                    else -> appendLine(line)
                }
            }
        }
        conf.writeText(updated)
    }
}
