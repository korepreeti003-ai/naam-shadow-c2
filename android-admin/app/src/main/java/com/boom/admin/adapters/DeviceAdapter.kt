package com.boom.admin.adapters

import android.graphics.Color
import android.view.*
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.boom.admin.R
import com.boom.admin.models.Device

class DeviceAdapter(private val items: List<Device>, private val onClick: (Device) -> Unit)
    : RecyclerView.Adapter<DeviceAdapter.VH>() {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvName: TextView = view.findViewById(R.id.tvDeviceName)
        val tvPhone: TextView = view.findViewById(R.id.tvPhone)
        val tvModel: TextView = view.findViewById(R.id.tvModel)
        val tvStatus: TextView = view.findViewById(R.id.tvStatus)
        val tvBattery: TextView = view.findViewById(R.id.tvBattery)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(LayoutInflater.from(parent.context).inflate(R.layout.item_device, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val d = items[position]
        holder.tvName.text = d.name.ifEmpty { d.deviceId.takeLast(8) }
        holder.tvPhone.text = d.phoneNumber
        holder.tvModel.text = "${d.manufacturer} ${d.model} (Android ${d.androidVersion})"
        holder.tvStatus.text = if (d.isOnline) "● ONLINE" else "○ OFFLINE"
        holder.tvStatus.setTextColor(if (d.isOnline) Color.GREEN else Color.GRAY)
        holder.tvBattery.text = "🔋 ${d.batteryLevel}%"
        holder.itemView.setOnClickListener { onClick(d) }
    }

    override fun getItemCount() = items.size
}
