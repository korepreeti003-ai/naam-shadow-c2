package com.boom.admin

import android.content.Intent
import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import com.boom.admin.api.AdminApi
import com.boom.admin.utils.Session

class LoginActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)
        Session.init(this)
        if (Session.token.isNotEmpty()) { startActivity(Intent(this, DeviceListActivity::class.java)); finish(); return }

        val etServer = findViewById<EditText>(R.id.etServer)
        val etUser = findViewById<EditText>(R.id.etUsername)
        val etPass = findViewById<EditText>(R.id.etPassword)
        val btnLogin = findViewById<Button>(R.id.btnLogin)
        val tvStatus = findViewById<TextView>(R.id.tvStatus)

        etServer.setText(Session.serverUrl)

        btnLogin.setOnClickListener {
            val server = etServer.text.toString().trimEnd('/')
            val user = etUser.text.toString()
            val pass = etPass.text.toString()
            if (server.isEmpty() || user.isEmpty() || pass.isEmpty()) { tvStatus.text = "Fill all fields"; return@setOnClickListener }
            Session.serverUrl = server
            tvStatus.text = "Connecting..."
            btnLogin.isEnabled = false
            Thread {
                val result = AdminApi.login(user, pass)
                runOnUiThread {
                    btnLogin.isEnabled = true
                    if (result != null) {
                        Session.token = result.optString("token")
                        Session.role = result.optString("role")
                        startActivity(Intent(this, DeviceListActivity::class.java)); finish()
                    } else { tvStatus.text = "Login failed" }
                }
            }.start()
        }
    }
}
