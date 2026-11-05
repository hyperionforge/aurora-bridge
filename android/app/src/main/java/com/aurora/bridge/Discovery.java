package com.aurora.bridge;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;

import java.net.InetAddress;
import java.util.ArrayDeque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Finds bridges on the local network with Android's built-in network service
 * discovery (mDNS), and advertises the bridge this phone hosts.
 * Service type: _aurorabridge._tcp
 */
class Discovery {
    static final String TYPE = "_aurorabridge._tcp.";

    private final NsdManager nsd;
    private final WifiManager.MulticastLock lock;
    private final Handler main = new Handler(Looper.getMainLooper());
    private NsdManager.RegistrationListener reg;
    private NsdManager.DiscoveryListener disc;
    private final Map<String, Found> found = new LinkedHashMap<>();
    private final ArrayDeque<NsdServiceInfo> toResolve = new ArrayDeque<>();
    private boolean resolving;
    private String myName = "";

    static final class Found {
        String name, host;
        int port;
        long seen;
    }

    Discovery(Context ctx) {
        nsd = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
        WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        lock = wm != null ? wm.createMulticastLock("aurora-nsd") : null;
        if (lock != null) lock.setReferenceCounted(false);
    }

    // ------------------------------------------------------------------ advertise
    void advertise(String name, int port) {
        stopAdvertising();
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName(name);
        info.setServiceType(TYPE);
        info.setPort(port);
        myName = name;
        reg = new NsdManager.RegistrationListener() {
            @Override public void onServiceRegistered(NsdServiceInfo i) { myName = i.getServiceName(); }
            @Override public void onRegistrationFailed(NsdServiceInfo i, int err) { }
            @Override public void onServiceUnregistered(NsdServiceInfo i) { }
            @Override public void onUnregistrationFailed(NsdServiceInfo i, int err) { }
        };
        try {
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, reg);
        } catch (Exception e) {
            reg = null;
        }
    }

    boolean isAdvertising() { return reg != null; }

    void stopAdvertising() {
        if (reg != null) {
            try { nsd.unregisterService(reg); } catch (Exception ignored) { }
            reg = null;
        }
    }

    // ------------------------------------------------------------------ browse
    void startBrowsing() {
        if (disc != null) return;
        if (lock != null) lock.acquire();
        disc = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String t) { }
            @Override public void onDiscoveryStopped(String t) { }
            @Override public void onStartDiscoveryFailed(String t, int e) { disc = null; }
            @Override public void onStopDiscoveryFailed(String t, int e) { }
            @Override public void onServiceFound(NsdServiceInfo s) {
                main.post(() -> { toResolve.add(s); resolveNext(); });
            }
            @Override public void onServiceLost(NsdServiceInfo s) {
                main.post(() -> {
                    synchronized (found) { found.remove(s.getServiceName()); }
                });
            }
        };
        try {
            nsd.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, disc);
        } catch (Exception e) {
            disc = null;
        }
    }

    /** Older Android versions resolve one service at a time, so queue them. */
    @SuppressWarnings("deprecation")
    private void resolveNext() {
        if (resolving || toResolve.isEmpty()) return;
        resolving = true;
        NsdServiceInfo s = toResolve.poll();
        try {
            nsd.resolveService(s, new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo i, int err) {
                    main.post(() -> { resolving = false; resolveNext(); });
                }
                @Override public void onServiceResolved(NsdServiceInfo i) {
                    InetAddress a = i.getHost();
                    if (a != null && a.getAddress().length == 4) {
                        Found f = new Found();
                        f.name = i.getServiceName();
                        f.host = a.getHostAddress();
                        f.port = i.getPort();
                        f.seen = System.currentTimeMillis();
                        synchronized (found) { found.put(f.name, f); }
                    }
                    main.post(() -> { resolving = false; resolveNext(); });
                }
            });
        } catch (Exception e) {
            resolving = false;
        }
    }

    String hostsJson() {
        StringBuilder sb = new StringBuilder("[");
        synchronized (found) {
            Iterator<Found> it = found.values().iterator();
            int n = 0;
            while (it.hasNext()) {
                Found f = it.next();
                if (n++ > 0) sb.append(',');
                sb.append("{\"name\":\"").append(f.name.replace("\\", "").replace("\"", "'"))
                  .append("\",\"host\":\"").append(f.host).append("\",\"port\":").append(f.port)
                  .append(",\"mine\":").append(f.name.equals(myName) && reg != null).append('}');
            }
        }
        return sb.append(']').toString();
    }

    void stopAll() {
        stopAdvertising();
        if (disc != null) {
            try { nsd.stopServiceDiscovery(disc); } catch (Exception ignored) { }
            disc = null;
        }
        if (lock != null && lock.isHeld()) lock.release();
    }
}
