package com.parkstag.app;

import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ParkstagNotificationHelper.ensureChannels(this);
        attachNativeBridge();
        handleLaunchIntent(getIntent(), true);
    }

    @Override
    public void onResume() {
        super.onResume();
        attachNativeBridge();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunchIntent(intent, false);
    }

    private void attachNativeBridge() {
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;
        webView.addJavascriptInterface(new NativeBridge(), "ParkstagNative");
    }

    private void handleLaunchIntent(Intent intent, boolean coldStart) {
        if (intent == null || bridge == null) return;

        String url = intent.getStringExtra(ParkstagNotificationHelper.EXTRA_URL);
        String kind = intent.getStringExtra(ParkstagNotificationHelper.EXTRA_KIND);
        String roomId = intent.getStringExtra(ParkstagNotificationHelper.EXTRA_ROOM_ID);
        String sessionId = intent.getStringExtra(ParkstagNotificationHelper.EXTRA_SESSION_ID);
        String pendingReply = intent.getStringExtra("pendingReply");

        if (url == null && kind == null && pendingReply == null) return;

        try {
            JSONObject payload = new JSONObject();
            if (url != null) payload.put("url", url);
            if (kind != null) payload.put("kind", kind);
            if (roomId != null) payload.put("roomId", roomId);
            if (sessionId != null) payload.put("sessionId", sessionId);
            if (pendingReply != null) payload.put("pendingReply", pendingReply);

            intent.removeExtra("pendingReply");

            final String path = (url == null || url.isEmpty()) ? "/?view=dashboard" : url;
            final String js =
                    "(function(){try{"
                            + "window.history.replaceState(null,'',"
                            + JSONObject.quote(path)
                            + ");"
                            + "window.dispatchEvent(new PopStateEvent('popstate'));"
                            + "window.dispatchEvent(new CustomEvent('parkstag:native-intent',{detail:"
                            + payload
                            + "}));"
                            + "}catch(e){}})();";

            WebView webView = bridge.getWebView();
            if (webView == null) return;
            long delayMs = coldStart ? 900 : 100;
            webView.postDelayed(() -> webView.evaluateJavascript(js, null), delayMs);
        } catch (Exception ignored) {
            // bridge may not be ready
        }
    }

    private class NativeBridge {
        @JavascriptInterface
        public void saveAuth(String accessToken, String apiBase) {
            ParkstagAuthStore.save(MainActivity.this, accessToken, apiBase);
        }

        @JavascriptInterface
        public void clearAuth() {
            ParkstagAuthStore.clear(MainActivity.this);
        }

        /** Android 14+: open system screen to allow full-screen incoming-call UI. */
        @JavascriptInterface
        public void openFullScreenIntentSettings() {
            runOnUiThread(
                    () -> {
                        try {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                                NotificationManager nm = getSystemService(NotificationManager.class);
                                if (nm != null && nm.canUseFullScreenIntent()) {
                                    return;
                                }
                                Intent intent =
                                        new Intent(
                                                Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                                                Uri.parse("package:" + getPackageName()));
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(intent);
                            }
                        } catch (Exception ignored) {
                            try {
                                Intent fallback =
                                        new Intent(
                                                Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                                .putExtra(
                                                        Settings.EXTRA_APP_PACKAGE, getPackageName());
                                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(fallback);
                            } catch (Exception ignored2) {
                            }
                        }
                    });
        }

        @JavascriptInterface
        public boolean canUseFullScreenIntent() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true;
            try {
                NotificationManager nm = getSystemService(NotificationManager.class);
                return nm != null && nm.canUseFullScreenIntent();
            } catch (Exception e) {
                return false;
            }
        }
    }
}
