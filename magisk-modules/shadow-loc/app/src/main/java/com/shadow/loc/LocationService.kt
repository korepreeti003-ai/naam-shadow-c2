package com.shadow.loc

// System-level mock location provider service
// Runs as android.uid.system — no per-app "mock location" toggle needed
// Reads config from /data/local/tmp/shadowloc.conf every INTERVAL_MS
// Also listens on Unix socket for updates from shadowlocd

import android.app.*
import android.content.Context
import android.content.Intent
import android.location.*
import android.net.LocalServerSocket
import android.net.LocalSocket
import android.os.*
import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.File

class LocationService : Service() {

    companion object {
        private const val TAG = "ShadowLoc"
        private const val PROVIDER_NAME = LocationManager.GPS_PROVIDER
        private const val CONF_PATH = "/data/local/tmp/shadowloc.conf"
        private const val SOCK_NAME = "shadowloc"   // abstract namespace
        private const val NOTIF_ID = 0x5141_0001
        private const val CHANNEL_ID = "shadow_loc_channel"
    }

    private lateinit var locationManager: LocationManager
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private data class LocState(
        val lat: Double = 28.6139,
        val lon: Double = 77.2090,
        val alt: Double = 216.0,
        val accuracy: Float = 5.0f,
        val speed: Float = 0.0f,
        val bearing: Float = 0.0f,
        val intervalMs: Long = 1000L
    )

    @Volatile private var state = LocState()

    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        startForegroundCompat()
        registerProvider()
        scope.launch { confReaderLoop() }
        scope.launch { socketListenerLoop() }
        scope.launch { injectLoop() }
        Log.d(TAG, "LocationService started")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) =
        START_STICKY

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        removeProvider()
    }

    // ── Provider registration ────────────────────────────────────────────────

    private fun registerProvider() {
        runCatching {
            // Remove real GPS so our mock takes priority
            if (locationManager.isProviderEnabled(PROVIDER_NAME)) {
                locationManager.removeTestProvider(PROVIDER_NAME)
            }
        }
        runCatching {
            locationManager.addTestProvider(
                PROVIDER_NAME,
                false, // requiresNetwork
                false, // requiresSatellite
                false, // requiresCell
                false, // hasMonetaryCost
                true,  // supportsAltitude
                true,  // supportsSpeed
                true,  // supportsBearing
                Criteria.POWER_LOW,
                Criteria.ACCURACY_FINE
            )
            locationManager.setTestProviderEnabled(PROVIDER_NAME, true)
            Log.d(TAG, "Mock GPS provider registered")
        }.onFailure { Log.e(TAG, "registerProvider failed: ${it.message}") }
    }

    private fun removeProvider() {
        runCatching { locationManager.removeTestProvider(PROVIDER_NAME) }
    }

    // ── Inject loop — pushes fake location every INTERVAL_MS ────────────────

    private suspend fun injectLoop() {
        while (true) {
            val s = state
            pushLocation(s)
            delay(s.intervalMs)
        }
    }

    private fun pushLocation(s: LocState) {
        val loc = Location(PROVIDER_NAME).apply {
            latitude  = s.lat
            longitude = s.lon
            altitude  = s.alt
            accuracy  = s.accuracy
            speed     = s.speed
            bearing   = s.bearing
            time      = System.currentTimeMillis()
            elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
            // Extra fields to pass SafetyNet/play integrity checks
            if (Build.VERSION.SDK_INT >= 26) {
                verticalAccuracyMeters = s.accuracy
                speedAccuracyMetersPerSecond = 0.5f
                bearingAccuracyDegrees = 1.0f
            }
        }
        runCatching {
            locationManager.setTestProviderLocation(PROVIDER_NAME, loc)
        }.onFailure {
            // Provider got removed — re-register
            registerProvider()
        }
    }

    // ── Config file reader ───────────────────────────────────────────────────

    private suspend fun confReaderLoop() {
        while (true) {
            runCatching { state = parseConf(File(CONF_PATH)) }
            delay(2000)
        }
    }

    private fun parseConf(f: File): LocState {
        if (!f.exists()) return state
        val map = f.readLines()
            .filter { it.contains('=') && !it.startsWith('#') }
            .associate {
                val (k, v) = it.split('=', limit = 2)
                k.trim() to v.trim()
            }
        return LocState(
            lat       = map["LAT"]?.toDoubleOrNull()  ?: state.lat,
            lon       = map["LON"]?.toDoubleOrNull()  ?: state.lon,
            alt       = map["ALT"]?.toDoubleOrNull()  ?: state.alt,
            accuracy  = map["ACCURACY"]?.toFloatOrNull() ?: state.accuracy,
            speed     = map["SPEED"]?.toFloatOrNull()    ?: state.speed,
            bearing   = map["BEARING"]?.toFloatOrNull()  ?: state.bearing,
            intervalMs= map["INTERVAL_MS"]?.toLongOrNull() ?: state.intervalMs
        )
    }

    // ── Unix socket listener — receives updates from shadowlocd / C2 ─────────

    private suspend fun socketListenerLoop() {
        withContext(Dispatchers.IO) {
            while (true) {
                runCatching {
                    val server = LocalServerSocket(SOCK_NAME)
                    Log.d(TAG, "Socket listening on @$SOCK_NAME")
                    while (true) {
                        val client: LocalSocket = server.accept()
                        scope.launch { handleClient(client) }
                    }
                }.onFailure {
                    Log.e(TAG, "Socket error: ${it.message}")
                    delay(5000)
                }
            }
        }
    }

    private suspend fun handleClient(client: LocalSocket) {
        withContext(Dispatchers.IO) {
            runCatching {
                val stream = client.inputStream
                stream.bufferedReader().forEachLine { line: String ->
                    runCatching {
                        val j = JSONObject(line)
                        val cur = state
                        state = LocState(
                            lat        = j.optDouble("lat", cur.lat),
                            lon        = j.optDouble("lon", cur.lon),
                            alt        = j.optDouble("alt", cur.alt),
                            accuracy   = j.optDouble("acc", cur.accuracy.toDouble()).toFloat(),
                            speed      = j.optDouble("spd", cur.speed.toDouble()).toFloat(),
                            bearing    = j.optDouble("brg", cur.bearing.toDouble()).toFloat(),
                            intervalMs = cur.intervalMs
                        )
                        Log.d(TAG, "Location updated: ${state.lat},${state.lon}")
                    }
                }
            }
            runCatching { client.close() }
        }
    }

    // ── Foreground notification (hide from user) ─────────────────────────────

    private fun startForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Location", NotificationManager.IMPORTANCE_MIN
            ).apply { setShowBadge(false) }
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
        val notif = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Location Service")
            .setOngoing(true)
            .build()
        startForeground(NOTIF_ID, notif)
    }
}
