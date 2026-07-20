package com.parkstag.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Persists owner auth so notification Reply/Decline can hit the API while the app is closed. */
public final class ParkstagAuthStore {
    private static final String PREFS = "parkstag_secure";
    private static final String KEY_TOKEN = "access_token";
    private static final String KEY_API = "api_base";

    private ParkstagAuthStore() {}

    public static void save(Context context, String accessToken, String apiBase) {
        SharedPreferences.Editor editor =
                context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (accessToken == null || accessToken.isEmpty()) {
            editor.remove(KEY_TOKEN);
        } else {
            editor.putString(KEY_TOKEN, accessToken);
        }
        if (apiBase != null && !apiBase.isEmpty()) {
            editor.putString(KEY_API, apiBase.replaceAll("/$", ""));
        }
        editor.apply();
    }

    public static void clear(Context context) {
        context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_TOKEN)
                .apply();
    }

    public static String getAccessToken(Context context) {
        return context
                .getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_TOKEN, null);
    }

    public static String getApiBase(Context context) {
        return context
                .getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_API, null);
    }
}
