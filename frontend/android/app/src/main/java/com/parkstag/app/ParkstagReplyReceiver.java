package com.parkstag.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;

import androidx.core.app.RemoteInput;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Handles inline Reply from chat notifications (WhatsApp-style). */
public class ParkstagReplyReceiver extends BroadcastReceiver {
    private static final String TAG = "ParkstagReply";
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ParkstagNotificationHelper.ACTION_REPLY.equals(intent.getAction())) {
            return;
        }

        Bundle remote = RemoteInput.getResultsFromIntent(intent);
        CharSequence replyCs = remote != null ? remote.getCharSequence(ParkstagNotificationHelper.KEY_REPLY_TEXT) : null;
        String reply = replyCs == null ? "" : replyCs.toString().trim();
        String sessionId = intent.getStringExtra(ParkstagNotificationHelper.EXTRA_SESSION_ID);

        if (reply.isEmpty() || sessionId == null || sessionId.isEmpty()) {
            return;
        }

        String token = ParkstagAuthStore.getAccessToken(context);
        String apiBase = ParkstagAuthStore.getApiBase(context);

        if (token == null || token.isEmpty() || apiBase == null || apiBase.isEmpty()) {
            // Fall back: open the chat with the draft so the user can send after unlock
            Intent open =
                    ParkstagNotificationHelper.openAppIntent(
                            context,
                            "/?view=dashboard&chat=" + sessionId,
                            "chat",
                            null,
                            sessionId);
            open.putExtra("pendingReply", reply);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(open);
            Toast.makeText(context, "Open ParksTAG to finish sending", Toast.LENGTH_SHORT).show();
            return;
        }

        final PendingResult pending = goAsync();
        EXEC.execute(
                () -> {
                    boolean ok = false;
                    try {
                        ok = postReply(apiBase, token, sessionId, reply);
                    } catch (Exception e) {
                        Log.e(TAG, "Reply failed", e);
                    }
                    if (ok) {
                        ParkstagNotificationHelper.cancelChat(context, sessionId);
                    } else {
                        Intent open =
                                ParkstagNotificationHelper.openAppIntent(
                                        context,
                                        "/?view=dashboard&chat=" + sessionId,
                                        "chat",
                                        null,
                                        sessionId);
                        open.putExtra("pendingReply", reply);
                        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(open);
                    }
                    pending.finish();
                });
    }

    private static boolean postReply(String apiBase, String token, String sessionId, String body)
            throws Exception {
        URL url = new URL(apiBase + "/api/chat/sessions/" + sessionId + "/messages");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Authorization", "Bearer " + token);

        JSONObject json = new JSONObject();
        json.put("body", body);
        byte[] bytes = json.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(bytes);
        }

        int code = conn.getResponseCode();
        conn.disconnect();
        return code >= 200 && code < 300;
    }
}
