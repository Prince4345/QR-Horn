package com.parkstag.app;

import android.app.Application;

public class ParkstagApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        // Create high-importance call channel before any FCM arrives
        ParkstagNotificationHelper.ensureChannels(this);
    }
}
