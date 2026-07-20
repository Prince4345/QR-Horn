package com.parkstag.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Decline from older notification actions — delegates to IncomingCallService. */
public class ParkstagCallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ParkstagNotificationHelper.ACTION_DECLINE.equals(action)
                || IncomingCallService.ACTION_DECLINE.equals(action)) {
            IncomingCallService.decline(context);
        } else if (ParkstagNotificationHelper.ACTION_ANSWER.equals(action)
                || IncomingCallService.ACTION_ANSWER.equals(action)) {
            IncomingCallService.answer(context);
        }
    }
}
