package com.boompanel.client

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.cardview.widget.CardView
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class MockPaymentActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_DEVICE_ID = "device_id"
        const val EXTRA_TENANT_ID = "tenant_id"
    }

    private lateinit var deviceId: String
    private lateinit var tenantId: String
    private var orderId: String? = null
    private var isProcessing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_mock_payment)

        deviceId = intent.getStringExtra(EXTRA_DEVICE_ID) ?: ""
        tenantId = intent.getStringExtra(EXTRA_TENANT_ID) ?: ""

        initiateVerification()

        val paymentCards = listOf(
            R.id.card_upi      to "UPI",
            R.id.card_gpay     to "GooglePay",
            R.id.card_phonepe  to "PhonePe",
            R.id.card_paytm    to "Paytm",
        )
        for ((resId, method) in paymentCards) {
            findViewById<CardView>(resId).setOnClickListener {
                if (!isProcessing) processMockPayment(method)
            }
        }
    }

    private fun initiateVerification() {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val body = JSONObject().apply {
                    put("device_id", deviceId)
                    put("tenant_id", tenantId)
                }
                val resp = ApiClient.post("/api/verification/initiate", body)
                withContext(Dispatchers.Main) {
                    if (resp.optBoolean("already_activated")) {
                        openActivation(resp.optString("order_id"))
                        return@withContext
                    }
                    orderId = resp.optString("order_id")
                    findViewById<TextView>(R.id.tv_order_id).text = "Order: $orderId"
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MockPaymentActivity,
                        "Could not reach server: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun processMockPayment(method: String) {
        val currentOrderId = orderId
        if (currentOrderId.isNullOrBlank()) {
            Toast.makeText(this, "Waiting for server — please retry", Toast.LENGTH_SHORT).show()
            return
        }

        isProcessing = true
        setProcessingState(true)

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                delay(1800)

                val body = JSONObject().apply {
                    put("order_id", currentOrderId)
                    put("payment_method", method)
                }
                val payResp = ApiClient.post("/api/verification/mock-payment", body)

                if (!payResp.optBoolean("success")) {
                    throw Exception(payResp.optString("error", "Payment failed"))
                }

                val activateBody = JSONObject().apply { put("order_id", currentOrderId) }
                val activateResp = ApiClient.post("/api/verification/activate", activateBody)

                withContext(Dispatchers.Main) {
                    if (activateResp.optBoolean("activated") || activateResp.optBoolean("already_activated")) {
                        openActivation(currentOrderId)
                    } else {
                        throw Exception(activateResp.optString("error", "Activation failed"))
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    isProcessing = false
                    setProcessingState(false)
                    Toast.makeText(this@MockPaymentActivity,
                        "Error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun setProcessingState(processing: Boolean) {
        val processingLayout = findViewById<LinearLayout>(R.id.layout_processing)
        processingLayout.visibility = if (processing) View.VISIBLE else View.GONE
        listOf(R.id.card_upi, R.id.card_gpay, R.id.card_phonepe, R.id.card_paytm)
            .forEach { id -> findViewById<CardView>(id).isEnabled = !processing }
    }

    private fun openActivation(orderId: String) {
        val intent = Intent(this, ActivationActivity::class.java).apply {
            putExtra(ActivationActivity.EXTRA_ORDER_ID, orderId)
            putExtra(ActivationActivity.EXTRA_DEVICE_ID, deviceId)
        }
        startActivity(intent)
        finish()
    }
}
