package com.parkstag.app;

import android.content.ComponentName;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.telecom.Connection;
import android.telecom.ConnectionRequest;
import android.telecom.ConnectionService;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.util.Log;

/** Self-managed VoIP ConnectionService — system treats ParksTAG like a calling app. */
public class ParkstagConnectionService extends ConnectionService {
    private static final String TAG = "ParkstagConnSvc";
    public static final String ACCOUNT_ID = "parkstag_voice";

    private static volatile ParkstagConnection active;

    public static PhoneAccountHandle handleFor(Context context) {
        return new PhoneAccountHandle(
                new ComponentName(context, ParkstagConnectionService.class), ACCOUNT_ID);
    }

    @Override
    public Connection onCreateIncomingConnection(
            PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        Bundle extras = request.getExtras() != null ? request.getExtras() : new Bundle();
        String title = extras.getString(IncomingCallService.EXTRA_TITLE, "Incoming call");
        String body = extras.getString(IncomingCallService.EXTRA_BODY, "");
        String roomId = extras.getString(IncomingCallService.EXTRA_ROOM_ID, "");
        String url = extras.getString(IncomingCallService.EXTRA_URL, "/?view=dashboard");

        ParkstagConnection connection = new ParkstagConnection(this, title, body, roomId, url);
        connection.setCallerDisplayName(title, TelecomManager.PRESENTATION_ALLOWED);
        connection.setAddress(Uri.fromParts("sip", "parkstag", null), TelecomManager.PRESENTATION_ALLOWED);
        connection.setRinging();
        active = connection;
        return connection;
    }

    @Override
    public void onCreateIncomingConnectionFailed(
            PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        Log.w(TAG, "Incoming connection failed — IncomingCallService still rings");
    }

    static void clearActive(ParkstagConnection connection) {
        if (active == connection) active = null;
    }

    static void endActive() {
        ParkstagConnection c = active;
        if (c != null) {
            try {
                c.setDisconnected(new android.telecom.DisconnectCause(android.telecom.DisconnectCause.LOCAL));
                c.destroy();
            } catch (Exception ignored) {
            }
            active = null;
        }
    }

    static final class ParkstagConnection extends Connection {
        private final Context appContext;
        private final String roomId;
        private final String url;
        private final String title;
        private final String body;

        ParkstagConnection(Context context, String title, String body, String roomId, String url) {
            this.appContext = context.getApplicationContext();
            this.title = title;
            this.body = body;
            this.roomId = roomId;
            this.url = url;
            setConnectionProperties(PROPERTY_SELF_MANAGED);
            setAudioModeIsVoip(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                setConnectionCapabilities(CAPABILITY_SUPPORT_HOLD);
            }
        }

        @Override
        public void onAnswer() {
            setActive();
            IncomingCallService.answer(appContext);
            destroy();
            clearActive(this);
        }

        @Override
        public void onReject() {
            IncomingCallService.decline(appContext);
            setDisconnected(new android.telecom.DisconnectCause(android.telecom.DisconnectCause.REJECTED));
            destroy();
            clearActive(this);
        }

        @Override
        public void onDisconnect() {
            IncomingCallService.decline(appContext);
            setDisconnected(new android.telecom.DisconnectCause(android.telecom.DisconnectCause.LOCAL));
            destroy();
            clearActive(this);
        }

        @Override
        public void onShowIncomingCallUi() {
            // System asks us to show our own UI (self-managed)
            try {
                android.content.Intent i =
                        new android.content.Intent(appContext, IncomingCallActivity.class);
                i.putExtra(IncomingCallActivity.EXTRA_TITLE, title);
                i.putExtra(IncomingCallActivity.EXTRA_BODY, body);
                i.putExtra(IncomingCallActivity.EXTRA_ROOM_ID, roomId);
                i.putExtra(IncomingCallActivity.EXTRA_URL, url);
                i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                        | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
                appContext.startActivity(i);
            } catch (Exception e) {
                Log.e(TAG, "onShowIncomingCallUi failed", e);
            }
        }
    }
}
