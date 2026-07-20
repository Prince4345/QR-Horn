package com.parkstag.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps ringing like a real phone call until Answer, Decline, or timeout.
 * Started from FCM even when the WebView is dead.
 */
public class IncomingCallService extends Service {
    private static final String TAG = "IncomingCallService";
    public static final String ACTION_START = "com.parkstag.app.CALL_START";
    public static final String ACTION_ANSWER = "com.parkstag.app.CALL_ANSWER";
    public static final String ACTION_DECLINE = "com.parkstag.app.CALL_DECLINE";
    public static final String ACTION_TIMEOUT = "com.parkstag.app.CALL_TIMEOUT";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_ROOM_ID = "roomId";
    public static final String EXTRA_URL = "url";

    private static final int NOTIFY_ID = 71001;
    private static final long RING_TIMEOUT_MS = 90_000;

    private Ringtone ringtone;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String roomId = "";
    private String url = "/?view=dashboard";
    private String title = "Incoming call";
    private String body = "";
    private boolean stopping = false;

    public static void start(Context context, String title, String body, String roomId, String url) {
        Intent i = new Intent(context, IncomingCallService.class);
        i.setAction(ACTION_START);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_BODY, body);
        i.putExtra(EXTRA_ROOM_ID, roomId);
        i.putExtra(EXTRA_URL, url);
        ContextCompat.startForegroundService(context, i);
    }

    public static void answer(Context context) {
        Intent i = new Intent(context, IncomingCallService.class);
        i.setAction(ACTION_ANSWER);
        ContextCompat.startForegroundService(context, i);
    }

    public static void decline(Context context) {
        Intent i = new Intent(context, IncomingCallService.class);
        i.setAction(ACTION_DECLINE);
        ContextCompat.startForegroundService(context, i);
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, IncomingCallService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction() != null ? intent.getAction() : ACTION_START;

        if (ACTION_ANSWER.equals(action)) {
            handleAnswer();
            return START_NOT_STICKY;
        }
        if (ACTION_DECLINE.equals(action) || ACTION_TIMEOUT.equals(action)) {
            handleDecline(ACTION_TIMEOUT.equals(action));
            return START_NOT_STICKY;
        }

        title = intent.getStringExtra(EXTRA_TITLE);
        if (title == null || title.isEmpty()) title = "Incoming call";
        body = intent.getStringExtra(EXTRA_BODY);
        if (body == null) body = "";
        roomId = intent.getStringExtra(EXTRA_ROOM_ID);
        if (roomId == null) roomId = "";
        url = intent.getStringExtra(EXTRA_URL);
        if (url == null || url.isEmpty()) url = "/?view=dashboard";
        if (!roomId.isEmpty() && !url.contains("call=")) {
            url = "/?view=dashboard&call=" + roomId;
        }

        ParkstagNotificationHelper.ensureChannels(this);
        acquireWakeLock();
        Notification notification = buildCallNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // shortService cannot be combined with other FGS types
                startForeground(
                        NOTIFY_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFY_ID, notification);
            } else {
                startForeground(NOTIFY_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "startForeground failed, falling back", e);
            startForeground(NOTIFY_ID, notification);
        }

        startRinging();
        launchFullScreenUi();

        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(
                () -> {
                    Intent timeout = new Intent(this, IncomingCallService.class);
                    timeout.setAction(ACTION_TIMEOUT);
                    startService(timeout);
                },
                RING_TIMEOUT_MS);

        // Also register with Telecom for system-level incoming call UX when supported
        ParkstagTelecom.reportIncomingCall(this, title, body, roomId, url);

        return START_STICKY;
    }

    private Notification buildCallNotification() {
        Intent fullScreen = new Intent(this, IncomingCallActivity.class);
        fullScreen.putExtra(IncomingCallActivity.EXTRA_TITLE, title);
        fullScreen.putExtra(IncomingCallActivity.EXTRA_BODY, body);
        fullScreen.putExtra(IncomingCallActivity.EXTRA_ROOM_ID, roomId);
        fullScreen.putExtra(IncomingCallActivity.EXTRA_URL, url);
        fullScreen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent fullScreenPi =
                PendingIntent.getActivity(
                        this,
                        1,
                        fullScreen,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent open = ParkstagNotificationHelper.openAppIntent(this, url, "call", roomId, null);
        PendingIntent contentPi =
                PendingIntent.getActivity(
                        this,
                        2,
                        open,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent answer = new Intent(this, IncomingCallService.class);
        answer.setAction(ACTION_ANSWER);
        PendingIntent answerPi =
                PendingIntent.getService(
                        this,
                        3,
                        answer,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent decline = new Intent(this, IncomingCallService.class);
        decline.setAction(ACTION_DECLINE);
        PendingIntent declinePi =
                PendingIntent.getService(
                        this,
                        4,
                        decline,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, ParkstagNotificationHelper.CHANNEL_CALLS)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body.isEmpty() ? "Tap to answer" : body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(contentPi)
                .setFullScreenIntent(fullScreenPi, true)
                .addAction(0, "Decline", declinePi)
                .addAction(0, "Answer", answerPi)
                .setColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
                .setVibrate(new long[] {0, 800, 400, 800, 400, 800})
                .setDefaults(NotificationCompat.DEFAULT_LIGHTS)
                .build();
    }

    private void launchFullScreenUi() {
        try {
            Intent fullScreen = new Intent(this, IncomingCallActivity.class);
            fullScreen.putExtra(IncomingCallActivity.EXTRA_TITLE, title);
            fullScreen.putExtra(IncomingCallActivity.EXTRA_BODY, body);
            fullScreen.putExtra(IncomingCallActivity.EXTRA_ROOM_ID, roomId);
            fullScreen.putExtra(IncomingCallActivity.EXTRA_URL, url);
            fullScreen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(fullScreen);
        } catch (Exception e) {
            Log.w(TAG, "Could not launch full-screen call UI", e);
        }
    }

    private void startRinging() {
        stopRingingAudio();
        try {
            Uri tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ringtone = RingtoneManager.getRingtone(getApplicationContext(), tone);
            if (ringtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    ringtone.setLooping(true);
                }
                ringtone.setAudioAttributes(
                        new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build());
                ringtone.play();
            }
        } catch (Exception e) {
            Log.w(TAG, "ringtone failed", e);
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE);
                vibrator = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            }
            if (vibrator != null) {
                long[] pattern = new long[] {0, 900, 500, 900, 500};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "vibrate failed", e);
        }
    }

    private void stopRingingAudio() {
        try {
            if (ringtone != null && ringtone.isPlaying()) ringtone.stop();
        } catch (Exception ignored) {
        }
        ringtone = null;
        try {
            if (vibrator != null) vibrator.cancel();
        } catch (Exception ignored) {
        }
    }

    private void handleAnswer() {
        if (stopping) return;
        stopping = true;
        handler.removeCallbacksAndMessages(null);
        stopRingingAudio();
        ParkstagTelecom.endCall();
        ParkstagNotificationHelper.cancelCall(this, roomId);

        Intent open = ParkstagNotificationHelper.openAppIntent(this, url, "call", roomId, null);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            startActivity(open);
        } catch (Exception e) {
            Log.e(TAG, "answer open failed", e);
        }
        finishService();
    }

    private void handleDecline(boolean timedOut) {
        if (stopping) return;
        stopping = true;
        handler.removeCallbacksAndMessages(null);
        stopRingingAudio();
        ParkstagTelecom.endCall();
        ParkstagNotificationHelper.cancelCall(this, roomId);

        final String declineRoom = roomId;
        new Thread(
                        () -> {
                            try {
                                String apiBase = ParkstagAuthStore.getApiBase(this);
                                if (apiBase != null
                                        && !apiBase.isEmpty()
                                        && declineRoom != null
                                        && !declineRoom.isEmpty()) {
                                    java.net.URL u =
                                            new java.net.URL(
                                                    apiBase
                                                            + "/api/calls/"
                                                            + declineRoom
                                                            + "/decline");
                                    java.net.HttpURLConnection conn =
                                            (java.net.HttpURLConnection) u.openConnection();
                                    conn.setConnectTimeout(10000);
                                    conn.setReadTimeout(10000);
                                    conn.setRequestMethod("POST");
                                    conn.getResponseCode();
                                    conn.disconnect();
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "decline api failed timedOut=" + timedOut, e);
                            }
                        })
                .start();

        finishService();
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null) return;
            wakeLock =
                    pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "parkstag:incoming_call");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(RING_TIMEOUT_MS + 5_000);
        } catch (Exception e) {
            Log.w(TAG, "wake lock failed", e);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
    }

    private void finishService() {
        stopRingingAudio();
        releaseWakeLock();
        try {
            stopForeground(true);
        } catch (Exception ignored) {
        }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        stopRingingAudio();
        releaseWakeLock();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
