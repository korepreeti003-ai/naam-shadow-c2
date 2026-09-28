package com.boom.client

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.CountDownTimer
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class PayActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_pay)

        val tvTimer = findViewById<TextView>(R.id.tvTimer)
        val btnPay = findViewById<Button>(R.id.btnPay)
        val tvDesc = findViewById<TextView>(R.id.tvDesc)

        object : CountDownTimer(15 * 60 * 1000L, 1000L) {
            override fun onTick(ms: Long) {
                val m = ms / 60000; val s = (ms % 60000) / 1000
                tvTimer.text = String.format("%02d:%02d", m, s)
            }
            override fun onFinish() { tvTimer.text = "00:00" }
        }.start()

        tvDesc.text = "इस फोटो को unlock करने के लिए\nसिर्फ ₹1 का payment करें\nतुरंत access पाएं!"

        btnPay.setOnClickListener {
            val upiId = "boom@upi"
            val amount = "1.00"
            val name = "Photo Unlock"
            val upiUrl = "upi://pay?pa=$upiId&pn=$name&am=$amount&cu=INR&tn=Photo+Unlock"

            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(upiUrl)))
            } catch (_: Exception) {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://pay.google.com")))
                } catch (_: Exception) {}
            }
        }
    }
}
