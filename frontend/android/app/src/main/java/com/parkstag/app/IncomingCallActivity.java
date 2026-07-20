package com.parkstag.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Full-screen Answer/Decline UI over the lock screen.
 * Audio is owned by {@link IncomingCallService} so ringing continues if this activity is covered.
 */
public class IncomingCallActivity extends AppCompatActivity {
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_ROOM_ID = "roomId";
    public static final String EXTRA_URL = "url";

    private String roomId = "";
    private String url = "/?view=dashboard";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON);

        setContentView(R.layout.activity_incoming_call);
        bindFromIntent(getIntent());

        findViewById(R.id.btnAnswer).setOnClickListener(v -> answerCall());
        findViewById(R.id.btnDecline).setOnClickListener(v -> declineCall());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        bindFromIntent(intent);
    }

    private void bindFromIntent(Intent intent) {
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
    }

    private void answerCall() {
        IncomingCallService.answer(this);
        finish();
    }

    private void declineCall() {
        IncomingCallService.decline(this);
        finish();
    }

    @Override
    public void onBackPressed() {
        // Don't dismiss the call with back — user must Answer or Decline
    }
}
