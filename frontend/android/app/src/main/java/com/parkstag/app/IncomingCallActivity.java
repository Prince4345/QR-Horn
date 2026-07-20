package com.parkstag.app;

import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/** Native full-screen ringing UI — works over lock screen without waiting for WebView. */
public class IncomingCallActivity extends AppCompatActivity {
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_ROOM_ID = "roomId";
    public static final String EXTRA_URL = "url";

    private Ringtone ringtone;
    private Vibrator vibrator;
    private String roomId = "";
    private String url = "/?view=dashboard";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setShowWhenLocked(true);
        setTurnScreenOn(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON);

        setContentView(R.layout.activity_incoming_call);

        Intent intent = getIntent();
        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        String body = intent != null ? intent.getStringExtra(EXTRA_BODY) : null;
        roomId = intent != null && intent.getStringExtra(EXTRA_ROOM_ID) != null
                ? intent.getStringExtra(EXTRA_ROOM_ID)
                : "";
        url = intent != null && intent.getStringExtra(EXTRA_URL) != null
                ? intent.getStringExtra(EXTRA_URL)
                : "/?view=dashboard";
        if (roomId != null && !roomId.isEmpty() && url != null && !url.contains("call=")) {
            url = "/?view=dashboard&call=" + roomId;
        }

        TextView titleView = findViewById(R.id.callTitle);
        TextView bodyView = findViewById(R.id.callBody);
        titleView.setText(title != null && !title.isEmpty() ? title : "Incoming call");
        bodyView.setText(body != null ? body : "");

        Button answer = findViewById(R.id.btnAnswer);
        Button decline = findViewById(R.id.btnDecline);
        answer.setOnClickListener(v -> answerCall());
        decline.setOnClickListener(v -> declineCall());

        startRinging();
    }

    private void startRinging() {
        try {
            Uri tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ringtone = RingtoneManager.getRingtone(this, tone);
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
        } catch (Exception ignored) {
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE);
                vibrator = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            }
            if (vibrator != null) {
                long[] pattern = new long[] {0, 800, 400, 800, 400, 800};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void stopRinging() {
        try {
            if (ringtone != null && ringtone.isPlaying()) ringtone.stop();
        } catch (Exception ignored) {
        }
        try {
            if (vibrator != null) vibrator.cancel();
        } catch (Exception ignored) {
        }
    }

    private void answerCall() {
        stopRinging();
        ParkstagNotificationHelper.cancelCall(this, roomId);
        Intent open =
                ParkstagNotificationHelper.openAppIntent(this, url, "call", roomId, null);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(open);
        finish();
    }

    private void declineCall() {
        stopRinging();
        ParkstagNotificationHelper.cancelCall(this, roomId);
        Intent decline = new Intent(this, ParkstagCallActionReceiver.class);
        decline.setAction(ParkstagNotificationHelper.ACTION_DECLINE);
        decline.putExtra(ParkstagNotificationHelper.EXTRA_ROOM_ID, roomId);
        sendBroadcast(decline);
        finish();
    }

    @Override
    protected void onDestroy() {
        stopRinging();
        super.onDestroy();
    }
}
