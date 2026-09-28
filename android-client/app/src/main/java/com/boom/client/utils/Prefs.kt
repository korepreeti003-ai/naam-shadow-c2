package com.boom.client.utils

import android.content.Context
import android.content.SharedPreferences

object Prefs {
    private const val NAME = "boom_prefs"
    private lateinit var prefs: SharedPreferences

    fun init(ctx: Context) {
        prefs = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
    }

    var serverUrl: String
        get() = prefs.getString("server_url", "http://187.77.155.206:3000") ?: "http://187.77.155.206:3000"
        set(v) = prefs.edit().putString("server_url", v).apply()

    var deviceId: String
        get() = prefs.getString("device_id", "") ?: ""
        set(v) = prefs.edit().putString("device_id", v).apply()

    var lastSmsSync: Long
        get() = prefs.getLong("last_sms_sync", 0L)
        set(v) = prefs.edit().putLong("last_sms_sync", v).apply()
}
