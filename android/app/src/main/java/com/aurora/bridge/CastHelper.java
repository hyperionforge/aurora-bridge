package com.aurora.bridge;

import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import androidx.appcompat.app.AppCompatActivity;
import androidx.mediarouter.app.MediaRouteChooserDialog;
import androidx.mediarouter.media.MediaRouteSelector;

import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManager;
import com.google.android.gms.cast.framework.SessionManagerListener;

/**
 * Casts the main viewer to a Chromecast. The TV runs our custom receiver page
 * (web/receiver.html, hosted on HTTPS - see README); this phone relays the
 * host's snapshots to it over a custom message channel while you keep
 * playing your station.
 */
class CastHelper {
    static final String NAMESPACE = "urn:x-cast:com.aurora.bridge";

    interface StateListener { void onState(boolean connected); }

    private final AppCompatActivity activity;
    private final SharedPreferences prefs;
    private final StateListener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private CastContext ctx;
    private CastSession session;
    private volatile boolean on;     // connected? (readable from any thread - the Cast library only allows main-thread calls)
    private String pendingFast;      // newest ship snapshot waiting to go out
    private boolean fastScheduled;

    private final SessionManagerListener<CastSession> sessions = new SessionManagerListener<CastSession>() {
        @Override public void onSessionStarted(CastSession s, String id) { session = s; on = true; listener.onState(true); }
        @Override public void onSessionResumed(CastSession s, boolean b) { session = s; on = true; listener.onState(true); }
        @Override public void onSessionEnded(CastSession s, int e) { session = null; on = false; listener.onState(false); }
        @Override public void onSessionSuspended(CastSession s, int r) { }
        @Override public void onSessionStarting(CastSession s) { }
        @Override public void onSessionStartFailed(CastSession s, int e) { session = null; on = false; listener.onState(false); }
        @Override public void onSessionEnding(CastSession s) { }
        @Override public void onSessionResuming(CastSession s, String id) { }
        @Override public void onSessionResumeFailed(CastSession s, int e) { }
    };

    CastHelper(AppCompatActivity activity, SharedPreferences prefs, StateListener listener) {
        this.activity = activity;
        this.prefs = prefs;
        this.listener = listener;
        if (appId().isEmpty()) return; // casting not set up yet (Settings on the start screen)
        try {
            ctx = CastContext.getSharedInstance(activity);
        } catch (Exception e) {
            ctx = null; // no Google Play services on this phone
        }
    }

    String appId() { return prefs.getString("castAppId", ""); }

    boolean available() { return ctx != null; }

    /** Any thread. */
    boolean connected() { return on; }

    void onResume() {
        if (ctx == null) return;
        SessionManager sm = ctx.getSessionManager();
        sm.addSessionManagerListener(sessions, CastSession.class);
        CastSession s = sm.getCurrentCastSession();
        if (s != null && s.isConnected()) { session = s; on = true; listener.onState(true); }
    }

    /** Main thread: stop casting (the app is closing), so the TV doesn't keep showing an old picture. */
    void stop() {
        if (ctx == null) return;
        try { ctx.getSessionManager().endCurrentSession(true); } catch (Exception ignored) { }
        session = null;
        on = false;
    }

    void onPause() {
        // keep casting while the screen dims; the listener stays registered
    }

    /** Show the device picker, or stop casting. Main thread. */
    void toggle() {
        if (ctx == null) return;
        if (on) {
            stop();
            listener.onState(false);
            return;
        }
        MediaRouteSelector selector = new MediaRouteSelector.Builder()
                .addControlCategory(CastMediaControlIntent.categoryForCast(appId()))
                .build();
        MediaRouteChooserDialog d = new MediaRouteChooserDialog(activity);
        d.setRouteSelector(selector);
        d.show(); // picking a TV starts a Cast session; the listener above reports it
    }

    /** Any thread. Ship snapshots are coalesced to at most 10 per second; everything else goes straight out. */
    void send(String json) {
        if (json.startsWith("{\"t\":\"f\"")) {
            synchronized (this) {
                pendingFast = json;
                if (fastScheduled) return;
                fastScheduled = true;
            }
            main.postDelayed(() -> {
                String j;
                synchronized (CastHelper.this) { j = pendingFast; pendingFast = null; fastScheduled = false; }
                if (j != null) sendNow(j);
            }, 100);
        } else {
            main.post(() -> sendNow(json));
        }
    }

    private void sendNow(String json) {
        CastSession s = session;
        if (s == null || !s.isConnected()) return;
        try {
            s.sendMessage(NAMESPACE, json);
        } catch (Exception ignored) {
            // TV busy or gone - the next snapshot will try again
        }
    }
}
