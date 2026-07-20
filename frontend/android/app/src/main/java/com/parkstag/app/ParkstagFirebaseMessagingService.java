package com.parkstag.app;

import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.HashMap;
import java.util.Map;

/**
 * High-priority data FCM for calls starts {@link IncomingCallService} so the phone
 * rings on the lock screen until Answer/Decline — even when WebView is dead.
 */
public class ParkstagFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "ParkstagFCM";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        PowerManager.WakeLock wakeLock = null;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "parkstag:fcm");
                wakeLock.acquire(20_000);
            }

            Map<String, String> data = new HashMap<>();
            if (remoteMessage.getData() != null) {
                data.putAll(remoteMessage.getData());
            }
            if (remoteMessage.getNotification() != null) {
                if (!data.containsKey("title") && remoteMessage.getNotification().getTitle() != null) {
                    data.put("title", remoteMessage.getNotification().getTitle());
                }
                if (!data.containsKey("body") && remoteMessage.getNotification().getBody() != null) {
                    data.put("body", remoteMessage.getNotification().getBody());
                }
            }

            String kind = data.get("kind");
            if ("call".equals(kind)) {
                String title = data.containsKey("title") ? data.get("title") : "Incoming call";
                String body = data.containsKey("body") ? data.get("body") : "";
                String roomId = data.containsKey("roomId") ? data.get("roomId") : "";
                String url = data.containsKey("url") ? data.get("url") : "/?view=dashboard";
                Log.i(TAG, "Incoming call FCM roomId=" + roomId);
                IncomingCallService.start(this, title, body, roomId, url);
            } else if (!data.isEmpty()) {
                ParkstagNotificationHelper.showFromPushData(this, data);
            }
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                try {
                    wakeLock.release();
                } catch (Exception ignored) {
                }
            }
        }

        try {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        } catch (Exception e) {
            Log.w(TAG, "Capacitor forward failed", e);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }
}
