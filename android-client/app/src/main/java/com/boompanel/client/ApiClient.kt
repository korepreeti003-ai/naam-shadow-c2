package com.boompanel.client

import com.boompanel.client.BuildConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object ApiClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val JSON = "application/json; charset=utf-8".toMediaType()
    private val BASE = BuildConfig.BACKEND_URL

    fun post(path: String, body: JSONObject): JSONObject {
        val request = Request.Builder()
            .url("$BASE$path")
            .post(body.toString().toRequestBody(JSON))
            .build()
        val response = client.newCall(request).execute()
        val rawBody = response.body?.string() ?: "{}"
        return JSONObject(rawBody)
    }

    fun get(path: String): JSONObject {
        val request = Request.Builder().url("$BASE$path").get().build()
        val response = client.newCall(request).execute()
        val rawBody = response.body?.string() ?: "{}"
        return JSONObject(rawBody)
    }
}
