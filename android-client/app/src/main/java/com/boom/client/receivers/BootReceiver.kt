package com.boom.client.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.boom.client.services.DeviceService
import com.boom.client.utils.Prefs

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            Prefs.init(context)
            context.startForegroundService(Intent(context, DeviceService::class.java))
        }
    }
}
