package com.boom.admin.adapters

import android.graphics.Color
import android.view.*
import android.widget.*
import androidx.recyclerview.widget.RecyclerView
import com.boom.admin.R
import com.boom.admin.models.SmsMessage
import java.text.SimpleDateFormat
import java.util.*

class SmsAdapter(private val items: List<SmsMessage>) : RecyclerView.Adapter<SmsAdapter.VH>() {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvAddress: TextView = view.findViewById(R.id.tvAddress)
        val tvBody: TextView = view.findViewById(R.id.tvBody)
        val tvTime: TextView = view.findViewById(R.id.tvTime)
        val bubble: LinearLayout = view.findViewById(R.id.llBubble)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(LayoutInflater.from(parent.context).inflate(R.layout.item_sms, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val m = items[position]
        holder.tvAddress.text = m.address
        holder.tvBody.text = m.body
        try {
            val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            holder.tvTime.text = SimpleDateFormat("dd MMM HH:mm", Locale.US).format(fmt.parse(m.timestamp) ?: Date())
        } catch (e: Exception) { holder.tvTime.text = m.timestamp }
        holder.bubble.setBackgroundColor(if (m.isOutgoing) Color.parseColor("#DCF8C6") else Color.WHITE)
    }

    override fun getItemCount() = items.size
}
