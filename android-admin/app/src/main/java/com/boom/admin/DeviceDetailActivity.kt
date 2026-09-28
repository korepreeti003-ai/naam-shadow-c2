package com.boom.admin

import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.boom.admin.adapters.SmsAdapter
import com.boom.admin.api.AdminApi
import com.boom.admin.models.SmsMessage
import org.json.JSONArray

class DeviceDetailActivity : AppCompatActivity() {
    private val smsList = mutableListOf<SmsMessage>()
    private lateinit var smsAdapter: SmsAdapter
    private var deviceId = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_device_detail)
        deviceId = intent.getStringExtra("deviceId") ?: ""
        title = intent.getStringExtra("deviceName") ?: deviceId

        val rvSms = findViewById<RecyclerView>(R.id.rvSms)
        val etTo = findViewById<EditText>(R.id.etSendTo)
        val etBody = findViewById<EditText>(R.id.etSendBody)
        val btnSend = findViewById<Button>(R.id.btnSendSms)
        val btnGetSms = findViewById<Button>(R.id.btnGetSms)
        val btnPing = findViewById<Button>(R.id.btnPing)

        smsAdapter = SmsAdapter(smsList)
        rvSms.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        rvSms.adapter = smsAdapter

        btnSend.setOnClickListener {
            val to = etTo.text.toString().trim()
            val body = etBody.text.toString().trim()
            if (to.isEmpty() || body.isEmpty()) { Toast.makeText(this, "Fill To and Message", Toast.LENGTH_SHORT).show(); return@setOnClickListener }
            Thread {
                val r = AdminApi.sendSms(deviceId, to, body)
                runOnUiThread {
                    Toast.makeText(this, if (r != null) "Sent!" else "Failed", Toast.LENGTH_SHORT).show()
                    if (r != null) { etTo.text.clear(); etBody.text.clear(); loadSms() }
                }
            }.start()
        }
        btnGetSms.setOnClickListener { Thread { AdminApi.sendCommand(deviceId, "get_sms") }.start(); loadSms() }
        btnPing.setOnClickListener { Thread { AdminApi.sendCommand(deviceId, "ping") }.start() }
        loadSms()
    }

    private fun loadSms() {
        Thread {
            val result = AdminApi.getSms(deviceId)
            runOnUiThread {
                if (result != null) {
                    val arr = result.optJSONArray("messages") ?: JSONArray()
                    smsList.clear()
                    for (i in arr.length() - 1 downTo 0) smsList.add(SmsMessage.fromJson(arr.getJSONObject(i)))
                    smsAdapter.notifyDataSetChanged()
                }
            }
        }.start()
    }
}
