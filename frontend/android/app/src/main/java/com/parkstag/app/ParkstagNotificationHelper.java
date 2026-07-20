package com.parkstag.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;

import java.util.Map;

/** Builds WhatsApp-style call + chat notifications (full-screen call, inline reply). */
public final class ParkstagNotificationHelper {
    public static final String CHANNEL_CALLS = "parkstag_calls";
    public static final String CHANNEL_MESSAGES = "parkstag_messages";
    public static final String CHANNEL_ALERTS = "parkstag_alerts";

    public static final String ACTION_REPLY = "com.parkstag.app.ACTION_REPLY";
    public static final String ACTION_OPEN_CHAT = "com.parkstag.app.ACTION_OPEN_CHAT";
    public static final String ACTION_ANSWER = "com.parkstag.app.ACTION_ANSWER";
    public static final String ACTION_DECLINE = "com.parkstag.app.ACTION_DECLINE";
    public static final String KEY_REPLY_TEXT = "parkstag_reply_text";

    public static final String EXTRA_KIND = "kind";
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_SESSION_ID = "sessionId";
    public static final String EXTRA_ROOM_ID = "roomId";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";

    private ParkstagNotificationHelper() {}

    public static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        NotificationChannel calls =
                new NotificationChannel(CHANNEL_CALLS, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        calls.setDescription("Phone-style alerts when someone calls about your vehicle");
        calls.enableVibration(true);
        calls.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            calls.setAllowBubbles(true);
        }
        nm.createNotificationChannel(calls);

        NotificationChannel messages =
                new NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH);
        messages.setDescription("Chat messages about your vehicle");
        messages.enableVibration(true);
        messages.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(messages);

        NotificationChannel alerts =
                new NotificationChannel(CHANNEL_ALERTS, "Vehicle alerts", NotificationManager.IMPORTANCE_DEFAULT);
        alerts.enableVibration(true);
        nm.createNotificationChannel(alerts);
    }

    public static void showFromPushData(Context context, Map<String, String> data) {
        ensureChannels(context);
        String kind = str(data, "kind", "notify");
        if ("call".equals(kind)) {
            showCall(context, data);
        } else if ("chat".equals(kind)) {
            showChat(context, data);
        } else {
            showAlert(context, data);
        }
    }

    private static void showCall(Context context, Map<String, String> data) {
        String title = str(data, "title", "Incoming call");
        String body = str(data, "body", "Tap to answer");
        String roomId = str(data, "roomId", "");
        String url = str(data, "url", "/?view=dashboard");
        if (!roomId.isEmpty() && !url.contains("call=")) {
            url = "/?view=dashboard&call=" + roomId;
        }

        int notifyId = stableId("call-" + (roomId.isEmpty() ? "default" : roomId));

        Intent open = openAppIntent(context, url, "call", roomId, null);
        PendingIntent contentPi =
                PendingIntent.getActivity(
                        context,
                        notifyId,
                        open,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent answer = openAppIntent(context, url, "call", roomId, null);
        answer.setAction(ACTION_ANSWER);
        PendingIntent answerPi =
                PendingIntent.getActivity(
                        context,
                        notifyId + 1,
                        answer,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent decline = new Intent(context, ParkstagCallActionReceiver.class);
        decline.setAction(ACTION_DECLINE);
        decline.putExtra(EXTRA_ROOM_ID, roomId);
        decline.putExtra(EXTRA_TITLE, title);
        PendingIntent declinePi =
                PendingIntent.getBroadcast(
                        context,
                        notifyId + 2,
                        decline,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Full-screen intent: rings over lock screen like a phone call (when OS allows)
        Intent fullScreen = openAppIntent(context, url, "call", roomId, null);
        fullScreen.putExtra("fullScreenCall", true);
        PendingIntent fullScreenPi =
                PendingIntent.getActivity(
                        context,
                        notifyId + 3,
                        fullScreen,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(context, CHANNEL_CALLS)
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setCategory(NotificationCompat.CATEGORY_CALL)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setOngoing(true)
                        .setAutoCancel(false)
                        .setTimeoutAfter(60_000)
                        .setContentIntent(contentPi)
                        .setFullScreenIntent(fullScreenPi, true)
                        .addAction(0, "Answer", answerPi)
                        .addAction(0, "Decline", declinePi)
                        .setColor(ContextCompat.getColor(context, android.R.color.holo_green_dark))
                        .setDefaults(NotificationCompat.DEFAULT_ALL);

        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(notifyId, builder.build());
    }

    private static void showChat(Context context, Map<String, String> data) {
        String sender = str(data, "senderName", str(data, "title", "Message"));
        String body = str(data, "body", "");
        String sessionId = str(data, "sessionId", "");
        String vehicle = str(data, "vehicleName", "");
        String plate = str(data, "vehicleNumber", "");
        String url = str(data, "url", "/?view=dashboard");
        if (!sessionId.isEmpty() && !url.contains("chat=")) {
            url = "/?view=dashboard&chat=" + sessionId;
        }

        String subtitle =
                vehicle.isEmpty()
                        ? plate
                        : (plate.isEmpty() ? vehicle : vehicle + " · " + plate);

        int notifyId = stableId("chat-" + (sessionId.isEmpty() ? "default" : sessionId));

        Intent open = openAppIntent(context, url, "chat", null, sessionId);
        PendingIntent contentPi =
                PendingIntent.getActivity(
                        context,
                        notifyId,
                        open,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        RemoteInput remoteInput =
                new RemoteInput.Builder(KEY_REPLY_TEXT).setLabel("Reply").build();

        Intent replyIntent = new Intent(context, ParkstagReplyReceiver.class);
        replyIntent.setAction(ACTION_REPLY);
        replyIntent.putExtra(EXTRA_SESSION_ID, sessionId);
        replyIntent.putExtra(EXTRA_TITLE, sender);
        replyIntent.putExtra(EXTRA_BODY, body);
        replyIntent.putExtra(EXTRA_URL, url);
        PendingIntent replyPi =
                PendingIntent.getBroadcast(
                        context,
                        notifyId + 11,
                        replyIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);

        NotificationCompat.Action replyAction =
                new NotificationCompat.Action.Builder(0, "Reply", replyPi)
                        .addRemoteInput(remoteInput)
                        .setAllowGeneratedReplies(true)
                        .build();

        Person person = new Person.Builder().setName(sender).setImportant(true).build();
        NotificationCompat.MessagingStyle style =
                new NotificationCompat.MessagingStyle(new Person.Builder().setName("You").build())
                        .setConversationTitle(sender)
                        .addMessage(body, System.currentTimeMillis(), person);

        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle(sender)
                        .setContentText(body)
                        .setSubText(subtitle.isEmpty() ? null : subtitle)
                        .setStyle(style)
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setAutoCancel(true)
                        .setContentIntent(contentPi)
                        .addAction(replyAction)
                        .setColor(ContextCompat.getColor(context, android.R.color.holo_green_dark))
                        .setDefaults(NotificationCompat.DEFAULT_ALL);

        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(notifyId, builder.build());
    }

    private static void showAlert(Context context, Map<String, String> data) {
        String title = str(data, "title", "ParksTAG");
        String body = str(data, "body", "New vehicle contact");
        String url = str(data, "url", "/?view=dashboard");
        int notifyId = stableId("alert-" + title + body);

        Intent open = openAppIntent(context, url, "notify", null, null);
        PendingIntent contentPi =
                PendingIntent.getActivity(
                        context,
                        notifyId,
                        open,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(context, CHANNEL_ALERTS)
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                        .setAutoCancel(true)
                        .setContentIntent(contentPi)
                        .setDefaults(NotificationCompat.DEFAULT_ALL);

        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(notifyId, builder.build());
    }

    public static Intent openAppIntent(
            Context context, String url, String kind, String roomId, String sessionId) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra(EXTRA_KIND, kind);
        intent.putExtra(EXTRA_URL, url == null ? "/?view=dashboard" : url);
        if (roomId != null) intent.putExtra(EXTRA_ROOM_ID, roomId);
        if (sessionId != null) intent.putExtra(EXTRA_SESSION_ID, sessionId);
        return intent;
    }

    public static Bundle extrasFromIntent(Intent intent) {
        Bundle b = new Bundle();
        if (intent == null) return b;
        if (intent.hasExtra(EXTRA_KIND)) b.putString(EXTRA_KIND, intent.getStringExtra(EXTRA_KIND));
        if (intent.hasExtra(EXTRA_URL)) b.putString(EXTRA_URL, intent.getStringExtra(EXTRA_URL));
        if (intent.hasExtra(EXTRA_ROOM_ID)) b.putString(EXTRA_ROOM_ID, intent.getStringExtra(EXTRA_ROOM_ID));
        if (intent.hasExtra(EXTRA_SESSION_ID))
            b.putString(EXTRA_SESSION_ID, intent.getStringExtra(EXTRA_SESSION_ID));
        return b;
    }

    public static void cancelCall(Context context, String roomId) {
        int notifyId = stableId("call-" + (roomId == null || roomId.isEmpty() ? "default" : roomId));
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(notifyId);
    }

    public static void cancelChat(Context context, String sessionId) {
        int notifyId = stableId("chat-" + (sessionId == null || sessionId.isEmpty() ? "default" : sessionId));
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(notifyId);
    }

    private static String str(Map<String, String> data, String key, String fallback) {
        if (data == null) return fallback;
        String v = data.get(key);
        return v == null || v.isEmpty() ? fallback : v;
    }

    private static int stableId(String tag) {
        int id = 0;
        for (int i = 0; i < tag.length(); i++) {
            id = 31 * id + tag.charAt(i);
        }
        id = Math.abs(id);
        return id == 0 ? 1 : id;
    }
}
