package com.boom.admin.utils

import android.content.Context
import android.content.SharedPreferences

object Session {
    private lateinit var prefs: SharedPreferences

    fun init(ctx: Context) {
        prefs = ctx.getSharedPreferences("boom_admin", Context.MODE_PRIVATE)
    }

    var serverUrl: String
        get() = prefs.getString("server_url", "http://187.77.155.206:3000") ?: "http://187.77.155.206:3000"
        set(v) = prefs.edit().putString("server_url", v).apply()

    var token: String
        get() = prefs.getString("token", "") ?: ""
        set(v) = prefs.edit().putString("token", v).apply()

    var role: String
        get() = prefs.getString("role", "admin") ?: "admin"
        set(v) = prefs.edit().putString("role", v).apply()

    fun logout() { prefs.edit().remove("token").apply() }
}
