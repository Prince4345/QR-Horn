package com.parkstag.app;

import android.app.Application;

public class ParkstagApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        ParkstagNotificationHelper.ensureChannels(this);
        ParkstagTelecom.register(this);
    }
}
