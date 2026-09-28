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

class SmsSearchActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_sms_search)
        title = "Global SMS Search"

        val etQ = findViewById<EditText>(R.id.etSearchQuery)
        val btnSearch = findViewById<Button>(R.id.btnSearch)
        val rvResults = findViewById<RecyclerView>(R.id.rvSmsResults)
        val tvCount = findViewById<TextView>(R.id.tvResultCount)
        val results = mutableListOf<SmsMessage>()
        val adapter = SmsAdapter(results)
        rvResults.layoutManager = LinearLayoutManager(this)
        rvResults.adapter = adapter

        btnSearch.setOnClickListener {
            val q = etQ.text.toString().trim()
            if (q.isEmpty()) return@setOnClickListener
            Thread {
                val r = AdminApi.searchSms(q)
                runOnUiThread {
                    results.clear()
                    if (r != null) {
                        val arr = r.optJSONArray("messages") ?: JSONArray()
                        for (i in 0 until arr.length()) results.add(SmsMessage.fromJson(arr.getJSONObject(i)))
                        tvCount.text = "Found: ${r.optInt("total")} messages"
                    } else tvCount.text = "Search failed"
                    adapter.notifyDataSetChanged()
                }
            }.start()
        }
    }
}
