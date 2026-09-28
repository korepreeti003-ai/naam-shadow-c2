package com.boom.admin

import android.app.AlertDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.boom.admin.api.AdminApi
import org.json.JSONArray
import org.json.JSONObject

class FirebaseSlotsActivity : AppCompatActivity() {
    private val slots = mutableListOf<JSONObject>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_firebase_slots)
        title = "Firebase Slots"

        val rv = findViewById<RecyclerView>(R.id.rvSlots)
        val adapter = SlotsAdapter()
        rv.layoutManager = LinearLayoutManager(this)
        rv.adapter = adapter
        loadSlots(adapter)

        findViewById<Button>(R.id.btnAddSlot).setOnClickListener { showAddDialog(adapter) }
    }

    private fun loadSlots(adapter: SlotsAdapter) {
        Thread {
            val arr = AdminApi.getFirebaseSlots()
            runOnUiThread {
                slots.clear()
                if (arr != null) for (i in 0 until arr.length()) slots.add(arr.getJSONObject(i))
                adapter.notifyDataSetChanged()
            }
        }.start()
    }

    private fun showAddDialog(adapter: SlotsAdapter) {
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_add_slot, null)
        AlertDialog.Builder(this).setTitle("Add Firebase Slot").setView(view)
            .setPositiveButton("Add") { _, _ ->
                val name = view.findViewById<EditText>(R.id.etSlotName).text.toString()
                val pid = view.findViewById<EditText>(R.id.etProjectId).text.toString()
                val json = view.findViewById<EditText>(R.id.etServiceJson).text.toString()
                val max = view.findViewById<EditText>(R.id.etMaxDevices).text.toString().toIntOrNull() ?: 10000
                Thread {
                    val r = AdminApi.addFirebaseSlot(name, pid, json, max)
                    runOnUiThread {
                        Toast.makeText(this, if (r != null) "Slot added" else "Failed — check JSON", Toast.LENGTH_LONG).show()
                        if (r != null) loadSlots(adapter)
                    }
                }.start()
            }.setNegativeButton("Cancel", null).show()
    }

    inner class SlotsAdapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
        override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): RecyclerView.ViewHolder {
            val tv = TextView(parent.context).apply { setPadding(32, 24, 32, 24); textSize = 14f; setTextColor(android.graphics.Color.WHITE) }
            return object : RecyclerView.ViewHolder(tv) {}
        }
        override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
            val s = slots[position]
            (holder.itemView as TextView).text = "${if (s.optBoolean("isActive")) "✅" else "❌"} ${s.optString("name")}\nProject: ${s.optString("projectId")}\nDevices: ${s.optInt("deviceCount")} / ${s.optInt("maxDevices")}"
        }
        override fun getItemCount() = slots.size
    }
}
