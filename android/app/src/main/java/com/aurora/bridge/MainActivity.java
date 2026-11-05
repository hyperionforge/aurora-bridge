package com.aurora.bridge;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

/**
 * The whole app is one full-screen WebView. This activity:
 *  - runs the relay server (serves the game to this phone and to the others),
 *  - finds games on the Wi-Fi (Discovery) and advertises the one we host,
 *  - casts the main viewer to a Chromecast (CastHelper),
 *  - gives the web pages a small bridge object: window.AuroraNative.
 */
public class MainActivity extends AppCompatActivity {
    static final int BASE_PORT = 8737;

    private WebView web;
    private RelayServer relay;
    private Discovery discovery;
    private CastHelper cast;
    private SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean inGame;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("aurora", MODE_PRIVATE);
        if (!prefs.contains("pid")) prefs.edit().putString("pid", "a" + UUID.randomUUID().toString().substring(0, 8)).apply();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER; // keep the panels clear of the camera notch
            getWindow().setAttributes(lp);
        }

        startRelay();
        discovery = new Discovery(this);
        discovery.startBrowsing();
        cast = new CastHelper(this, prefs, (on) -> runJs("window.onCastState && window.onCastState(" + on + ")"));

        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false; // every page (ours or another phone's game) opens inside the app
            }
        });
        web.addJavascriptInterface(new Bridge(), "AuroraNative");
        setContentView(web);
        hideSystemBars();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (inGame) confirmLeave();
                else finish();
            }
        });
        showStart();
    }

    private void startRelay() {
        final AssetManager am = getAssets();
        RelayServer.Assets assets = path -> {
            try (InputStream in = am.open("web/" + path)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return out.toByteArray();
            }
        };
        for (int p = BASE_PORT; p < BASE_PORT + 10 && relay == null; p++) {
            RelayServer r = new RelayServer(assets, p);
            try {
                r.start();
                relay = r;
            } catch (IOException e) {
                // port busy (another app, or an old copy of us) - try the next one
            }
        }
    }

    int port() { return relay != null ? relay.getPort() : BASE_PORT; }

    private void showStart() {
        inGame = false;
        if (cast != null) cast.stop();
        discovery.stopAdvertising();
        web.loadUrl("http://127.0.0.1:" + port() + "/start.html");
    }

    private void confirmLeave() {
        new AlertDialog.Builder(this)
                .setTitle("Leave the bridge?")
                .setMessage(discovery.isAdvertising() ? "You are the host: the game ends for everyone." : "You can rejoin from the start screen.")
                .setPositiveButton("Leave", (d, w) -> showStart())
                .setNegativeButton("Stay", null)
                .show();
    }

    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        cast.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        cast.onPause();
    }

    @Override
    protected void onDestroy() {
        cast.stop();
        discovery.stopAll();
        if (relay != null) relay.stop();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    void runJs(String js) {
        main.post(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    private static String q(String s) { return Uri.encode(s == null ? "" : s); }

    /** Methods the web pages can call as window.AuroraNative.xxx(). They run on a WebView thread. */
    class Bridge {
        @JavascriptInterface public boolean isApp() { return true; }
        @JavascriptInterface public String getName() { return prefs.getString("name", ""); }
        @JavascriptInterface public void setName(String n) { prefs.edit().putString("name", n).apply(); }
        @JavascriptInterface public String getPid() { return prefs.getString("pid", "a0"); }
        @JavascriptInterface public int getPort() { return port(); }
        @JavascriptInterface public String getLanUrls() {
            StringBuilder sb = new StringBuilder("[");
            int i = 0;
            for (String ip : RelayServer.lanAddresses()) sb.append(i++ > 0 ? "," : "").append("\"http://").append(ip).append(':').append(port()).append("/\"");
            return sb.append("]").toString();
        }
        /** Bridges found on the Wi-Fi: [{"name":..,"host":..,"port":..}] */
        @JavascriptInterface public String getHosts() { return discovery.hostsJson(); }

        @JavascriptInterface public void host(String name) {
            setName(name);
            main.post(() -> {
                discovery.advertise(name.toUpperCase() + "'S BRIDGE", port());
                inGame = true;
                web.loadUrl("http://127.0.0.1:" + port() + "/?host=1&name=" + q(name) + "&pid=" + q(getPid()));
            });
        }
        @JavascriptInterface public void join(String baseUrl, String name) {
            setName(name);
            String b = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
            main.post(() -> {
                inGame = true;
                web.loadUrl(b + "?name=" + q(name) + "&pid=" + q(getPid()));
            });
        }
        @JavascriptInterface public void leave() { main.post(MainActivity.this::confirmLeave); }

        // ---- Chromecast
        @JavascriptInterface public boolean castAvailable() { return cast.available(); }
        @JavascriptInterface public boolean castState() { return cast.connected(); }
        @JavascriptInterface public void castToggle() { main.post(cast::toggle); }
        @JavascriptInterface public void castSend(String json) { cast.send(json); }
        @JavascriptInterface public String getCastAppId() { return prefs.getString("castAppId", ""); }
        @JavascriptInterface public void setCastAppId(String id) {
            prefs.edit().putString("castAppId", id == null ? "" : id.trim().toUpperCase()).apply();
        }

        @JavascriptInterface public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(Math.max(10, Math.min(ms, 500)), VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(Math.max(10, Math.min(ms, 500)));
        }
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
    }
}
