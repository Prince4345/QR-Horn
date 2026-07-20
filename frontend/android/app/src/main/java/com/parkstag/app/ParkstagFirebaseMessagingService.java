package com.parkstag.app;

import android.os.PowerManager;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.HashMap;
import java.util.Map;

/**
 * Receives FCM and posts call/chat tray UI. For calls with a system notification payload,
 * Android may deliver only when the app is in the foreground — the system tray still shows
 * the FCM notification when the app is killed.
 */
public class ParkstagFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        PowerManager.WakeLock wakeLock = null;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock =
                        pm.newWakeLock(
                                PowerManager.PARTIAL_WAKE_LOCK, "parkstag:fcm");
                wakeLock.acquire(15_000);
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
            if (!data.isEmpty()) {
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

        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }
}
