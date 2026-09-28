package com.boom.admin.models

import org.json.JSONObject

data class Device(
    val deviceId: String, val name: String, val phoneNumber: String,
    val model: String, val manufacturer: String, val androidVersion: String,
    val isOnline: Boolean, val lastSeen: String, val batteryLevel: Int,
    val simOperator: String, val tag: String, val fcmToken: Boolean
) {
    companion object {
        fun fromJson(j: JSONObject) = Device(
            deviceId = j.optString("deviceId"), name = j.optString("name", "Unknown"),
            phoneNumber = j.optString("phoneNumber", "-"), model = j.optString("model", "-"),
            manufacturer = j.optString("manufacturer", "-"), androidVersion = j.optString("androidVersion", "-"),
            isOnline = j.optBoolean("isOnline", false), lastSeen = j.optString("lastSeen", "-"),
            batteryLevel = j.optInt("batteryLevel", 0), simOperator = j.optString("simOperator", "-"),
            tag = j.optString("tag", ""), fcmToken = j.optString("fcmToken", "").isNotEmpty()
        )
    }
}
