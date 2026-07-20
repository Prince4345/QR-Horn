package com.parkstag.app;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.HashMap;
import java.util.Map;

/**
 * Receives data-only FCM and posts WhatsApp-style tray notifications even when the app is killed.
 * Still forwards to Capacitor so the WebView can ring / open chat when it is alive.
 */
public class ParkstagFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (data != null && !data.isEmpty()) {
            // Always show a native tray notification for background/killed reliability.
            // Foreground also gets Capacitor → local notify; duplicate tags replace each other.
            ParkstagNotificationHelper.showFromPushData(this, new HashMap<>(data));
        } else if (remoteMessage.getNotification() != null) {
            Map<String, String> fallback = new HashMap<>();
            fallback.put("title", remoteMessage.getNotification().getTitle());
            fallback.put("body", remoteMessage.getNotification().getBody());
            fallback.put("kind", "notify");
            ParkstagNotificationHelper.showFromPushData(this, fallback);
        }

        // Keep Capacitor JS listeners in sync when the bridge is running
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }
}
