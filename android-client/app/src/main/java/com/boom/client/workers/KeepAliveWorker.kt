package com.boom.client.workers

import android.content.Context
import android.content.Intent
import androidx.work.*
import com.boom.client.services.DeviceService
import com.boom.client.utils.Prefs
import java.util.concurrent.TimeUnit

class KeepAliveWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        Prefs.init(applicationContext)
        try {
            applicationContext.startForegroundService(Intent(applicationContext, DeviceService::class.java))
        } catch (_: Exception) {
            applicationContext.startService(Intent(applicationContext, DeviceService::class.java))
        }
        return Result.success()
    }

    companion object {
        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<KeepAliveWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                "boom_keepalive",
                ExistingPeriodicWorkPolicy.KEEP,
                req
            )
        }
    }
}
