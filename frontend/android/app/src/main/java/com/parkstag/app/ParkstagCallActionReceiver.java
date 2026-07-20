package com.parkstag.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Decline incoming call from the notification without opening the app. */
public class ParkstagCallActionReceiver extends BroadcastReceiver {
    private static final String TAG = "ParkstagCallAction";
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ParkstagNotificationHelper.ACTION_DECLINE.equals(intent.getAction())) {
            return;
        }
        String roomId = intent.getStringExtra(ParkstagNotificationHelper.EXTRA_ROOM_ID);
        ParkstagNotificationHelper.cancelCall(context, roomId == null ? "" : roomId);

        if (roomId == null || roomId.isEmpty()) return;

        String apiBase = ParkstagAuthStore.getApiBase(context);
        if (apiBase == null || apiBase.isEmpty()) return;

        final PendingResult pending = goAsync();
        EXEC.execute(
                () -> {
                    try {
                        URL url = new URL(apiBase + "/api/calls/" + roomId + "/decline");
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setConnectTimeout(10000);
                        conn.setReadTimeout(10000);
                        conn.setRequestMethod("POST");
                        conn.getResponseCode();
                        conn.disconnect();
                    } catch (Exception e) {
                        Log.e(TAG, "Decline failed", e);
                    } finally {
                        pending.finish();
                    }
                });
    }
}
