package com.boom.admin.models

import org.json.JSONObject

data class SmsMessage(
    val id: String, val address: String, val body: String,
    val direction: String, val timestamp: String, val status: String
) {
    val isOutgoing get() = direction == "outgoing"
    companion object {
        fun fromJson(j: JSONObject) = SmsMessage(
            id = j.optString("_id"), address = j.optString("address"),
            body = j.optString("body"), direction = j.optString("direction", "incoming"),
            timestamp = j.optString("timestamp"), status = j.optString("status", "received")
        )
    }
}
