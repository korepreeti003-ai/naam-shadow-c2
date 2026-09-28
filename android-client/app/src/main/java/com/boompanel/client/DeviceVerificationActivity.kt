package com.boompanel.client

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.boompanel.client.BuildConfig
import com.google.android.material.button.MaterialButton

class DeviceVerificationActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_device_verification)

        if (BuildConfig.IS_DEMO) {
            val badge = findViewById<TextView>(R.id.tv_demo_badge)
            badge.text = getString(R.string.demo_watermark)
            badge.visibility = if (badge.text.isNotEmpty()) View.VISIBLE else View.GONE
        }

        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        val tenantId = "TENANT-DEMO-001"

        findViewById<MaterialButton>(R.id.btn_continue).setOnClickListener {
            val intent = Intent(this, MockPaymentActivity::class.java).apply {
                putExtra(MockPaymentActivity.EXTRA_DEVICE_ID, deviceId)
                putExtra(MockPaymentActivity.EXTRA_TENANT_ID, tenantId)
            }
            startActivity(intent)
        }
    }
}
