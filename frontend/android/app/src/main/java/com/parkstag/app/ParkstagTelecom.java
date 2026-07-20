package com.parkstag.app;

import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.util.Log;

/** Registers a self-managed PhoneAccount and reports incoming VoIP calls to Telecom. */
public final class ParkstagTelecom {
    private static final String TAG = "ParkstagTelecom";
    private static boolean registered = false;

    private ParkstagTelecom() {}

    public static void register(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            TelecomManager tm = context.getSystemService(TelecomManager.class);
            if (tm == null) return;
            PhoneAccountHandle handle = ParkstagConnectionService.handleFor(context);
            PhoneAccount account =
                    PhoneAccount.builder(handle, "ParksTAG")
                            .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                            .setShortDescription("ParksTAG voice")
                            .build();
            tm.registerPhoneAccount(account);
            registered = true;
        } catch (Exception e) {
            Log.w(TAG, "registerPhoneAccount failed", e);
        }
    }

    public static void reportIncomingCall(
            Context context, String title, String body, String roomId, String url) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            if (!registered) register(context);
            TelecomManager tm = context.getSystemService(TelecomManager.class);
            if (tm == null) return;

            PhoneAccountHandle handle = ParkstagConnectionService.handleFor(context);
            Bundle extras = new Bundle();
            extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle);
            extras.putString(IncomingCallService.EXTRA_TITLE, title);
            extras.putString(IncomingCallService.EXTRA_BODY, body != null ? body : "");
            extras.putString(IncomingCallService.EXTRA_ROOM_ID, roomId != null ? roomId : "");
            extras.putString(IncomingCallService.EXTRA_URL, url != null ? url : "/?view=dashboard");
            // Incoming call UI will be requested via Connection.onShowIncomingCallUi
            tm.addNewIncomingCall(handle, extras);
        } catch (SecurityException se) {
            Log.w(TAG, "addNewIncomingCall not permitted — service UI still works", se);
        } catch (Exception e) {
            Log.w(TAG, "addNewIncomingCall failed", e);
        }
    }

    public static void endCall() {
        ParkstagConnectionService.endActive();
    }
}
