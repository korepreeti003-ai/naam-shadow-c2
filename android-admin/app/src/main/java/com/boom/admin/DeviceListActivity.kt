package com.boom.admin

import android.content.Intent
import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.boom.admin.adapters.DeviceAdapter
import com.boom.admin.api.AdminApi
import com.boom.admin.models.Device
import com.boom.admin.utils.Session
import org.json.JSONArray

class DeviceListActivity : AppCompatActivity() {
    private val devices = mutableListOf<Device>()
    private lateinit var adapter: DeviceAdapter
    private var currentPage = 1
    private var loading = false
    private var totalPages = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_device_list)
        Session.init(this)
        if (Session.token.isEmpty()) { startActivity(Intent(this, LoginActivity::class.java)); finish(); return }

        val rvDevices = findViewById<RecyclerView>(R.id.rvDevices)
        val etSearch = findViewById<EditText>(R.id.etSearch)
        val btnSearch = findViewById<Button>(R.id.btnSearch)
        val tvStats = findViewById<TextView>(R.id.tvStats)

        adapter = DeviceAdapter(devices) { device ->
            startActivity(Intent(this, DeviceDetailActivity::class.java).apply {
                putExtra("deviceId", device.deviceId); putExtra("deviceName", device.name)
            })
        }
        rvDevices.layoutManager = LinearLayoutManager(this)
        rvDevices.adapter = adapter

        rvDevices.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(rv: RecyclerView, dx: Int, dy: Int) {
                val lm = rv.layoutManager as LinearLayoutManager
                if (!loading && currentPage < totalPages && lm.findLastVisibleItemPosition() >= devices.size - 5) {
                    currentPage++; loadDevices(etSearch.text.toString())
                }
            }
        })

        btnSearch.setOnClickListener { devices.clear(); currentPage = 1; loadDevices(etSearch.text.toString()) }
        findViewById<Button>(R.id.btnFirebase).setOnClickListener { startActivity(Intent(this, FirebaseSlotsActivity::class.java)) }
        findViewById<Button>(R.id.btnSmsSearch).setOnClickListener { startActivity(Intent(this, SmsSearchActivity::class.java)) }
        findViewById<Button>(R.id.btnLogout).setOnClickListener {
            Session.logout(); startActivity(Intent(this, LoginActivity::class.java)); finish()
        }

        Thread {
            val stats = AdminApi.getDeviceStats()
            runOnUiThread { if (stats != null) tvStats.text = "Total: ${stats.optInt("total")} | Online: ${stats.optInt("online")} | Offline: ${stats.optInt("offline")}" }
        }.start()
        loadDevices("")
    }

    private fun loadDevices(search: String) {
        if (loading) return
        loading = true
        Thread {
            val result = AdminApi.getDevices(currentPage, search)
            runOnUiThread {
                loading = false
                if (result != null) {
                    totalPages = result.optInt("pages", 1)
                    val arr = result.optJSONArray("devices") ?: JSONArray()
                    for (i in 0 until arr.length()) devices.add(Device.fromJson(arr.getJSONObject(i)))
                    adapter.notifyDataSetChanged()
                } else Toast.makeText(this, "Load failed", Toast.LENGTH_SHORT).show()
            }
        }.start()
    }
}
