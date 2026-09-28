package com.boompanel.client

import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.CountDownTimer
import android.util.Base64
import android.view.View
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.boompanel.client.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class ActivationActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_ORDER_ID  = "order_id"
        const val EXTRA_DEVICE_ID = "device_id"
        private const val QR_TTL_MS = 5 * 60 * 1000L
    }

    private var countdownTimer: CountDownTimer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_activation)

        val orderId  = intent.getStringExtra(EXTRA_ORDER_ID)  ?: ""
        val deviceId = intent.getStringExtra(EXTRA_DEVICE_ID) ?: ""

        if (BuildConfig.IS_DEMO) {
            findViewById<TextView>(R.id.tv_demo_activation).visibility = View.VISIBLE
        }

        findViewById<TextView>(R.id.tv_order_id).text  = orderId.take(20) + if (orderId.length > 20) "…" else ""
        findViewById<TextView>(R.id.tv_device_id).text = deviceId.take(16) + if (deviceId.length > 16) "…" else ""

        startCountdown()
        loadQrCode(orderId)
    }

    private fun loadQrCode(orderId: String) {
        val ivQr        = findViewById<ImageView>(R.id.iv_qr_code)
        val pbLoading   = findViewById<ProgressBar>(R.id.pb_qr_loading)

        ivQr.visibility      = View.GONE
        pbLoading.visibility = View.VISIBLE

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val resp: JSONObject = ApiClient.get("/api/verification/qr/$orderId")
                val dataUrl = resp.optString("qr_data_url")

                if (dataUrl.startsWith("data:image/png;base64,")) {
                    val b64 = dataUrl.removePrefix("data:image/png;base64,")
                    val bytes = Base64.decode(b64, Base64.DEFAULT)
                    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    withContext(Dispatchers.Main) {
                        ivQr.setImageBitmap(bitmap)
                        ivQr.visibility      = View.VISIBLE
                        pbLoading.visibility = View.GONE
                    }
                } else {
                    throw Exception(resp.optString("error", "QR unavailable"))
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    pbLoading.visibility = View.GONE
                    Toast.makeText(this@ActivationActivity,
                        "QR error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun startCountdown() {
        val tvCountdown = findViewById<TextView>(R.id.tv_qr_countdown)
        countdownTimer = object : CountDownTimer(QR_TTL_MS, 1000) {
            override fun onTick(millisLeft: Long) {
                val m = millisLeft / 60_000
                val s = (millisLeft % 60_000) / 1000
                tvCountdown.text = "%d:%02d".format(m, s)
            }
            override fun onFinish() {
                tvCountdown.text = "Expired"
                tvCountdown.setTextColor(getColor(R.color.danger_red))
            }
        }.start()
    }

    override fun onDestroy() {
        super.onDestroy()
        countdownTimer?.cancel()
    }
}
