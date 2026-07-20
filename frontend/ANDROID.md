# ParksTAG Android app (Capacitor)

This wraps the React web app in a native Android shell so you can run it on a phone and publish to Google Play.

## Prerequisites

1. [Android Studio](https://developer.android.com/studio) (with Android SDK)
2. Node.js 20+ (already used for this project)
3. Your **live** ParksTAG URL (Render / custom domain) — phones cannot use `localhost`
4. Firebase project (same one as web push) for native FCM

## Login (Google + phone) — required Supabase settings

**Why Google opened your website:** Supabase was redirecting to the Site URL in Chrome. The app now redirects to a **custom scheme** so Android opens ParksTAG instead.

### 1) Supabase Redirect URLs (required)

[Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **URL Configuration** → **Redirect URLs** — add **exactly**:

```
com.parkstag.app://auth/callback
https://qr-horn.onrender.com/auth/native-callback
https://qr-horn.onrender.com/auth/native-callback.html
```

Save. If this URL is missing, Google login will keep opening the website.

### 2) Rebuild the Android app

```bash
cd frontend
npm run android:open
```

Uninstall the old app from the phone/emulator, then **Run** again.

### 3) Deploy backend (recommended)

So `https://qr-horn.onrender.com/auth/native-callback` serves the app-open bridge (not the marketing page). Push/deploy the monorepo to Render.

Phone OTP stays inside the app — enter the SMS **code**. If Captcha is enabled in Supabase Auth, turn it off for testing (it often breaks in the app).

### Signed in but “Could not reach the server”

The Android WebView origin is `https://localhost`. The backend must allow that in CORS (shipped automatically). If you set `CORS_ORIGIN` on Render, you do **not** need to add localhost yourself anymore — Capacitor origins are always merged in.

Also wait for Render to finish deploying after a push; free tier may take ~30–60s to wake on first request — tap **Retry**.

## One-time setup

```bash
cd frontend
npm install
```

Create `frontend/.env.android` from the example (use your real live URL):

```bash
copy .env.android.example .env.android
```

Edit `.env.android`:

```env
VITE_APP_URL="https://YOUR_APP.onrender.com"
VITE_API_URL="https://YOUR_APP.onrender.com"
VITE_SUPABASE_URL="..."
VITE_SUPABASE_ANON_KEY="..."
```

Optional — load the live website inside the app (instant web updates, no rebuild for UI changes):

```env
CAPACITOR_SERVER_URL="https://YOUR_APP.onrender.com"
```

If `CAPACITOR_SERVER_URL` is set, set it in your shell before sync:

```powershell
$env:CAPACITOR_SERVER_URL="https://YOUR_APP.onrender.com"
npm run android:open
```

## Native push notifications (required for alerts / chat / calls)

Web FCM does **not** wake the Capacitor Android app reliably. Use Capacitor Push + Firebase Android:

1. Open [Firebase Console](https://console.firebase.google.com) → your ParksTAG project
2. **Add app → Android**
3. Package name: `com.parkstag.app`
4. Download `google-services.json`
5. Place it at:

```
frontend/android/app/google-services.json
```

6. Rebuild and sync:

```bash
cd frontend
npm run android:build
```

7. Run the app → sign in as owner → **Enable notifications** (Dashboard or Profile)

8. Test:
   - Profile / Dashboard → send test push
   - From another device: scan sticker → notify / message / **voice call**
   - Incoming call opens a **full-screen phone-style** Accept / Decline UI

### Notification channels

| Channel ID | Use |
|------------|-----|
| `parkstag_calls` | Incoming voice calls (max importance) |
| `parkstag_messages` | Chat messages |
| `parkstag_alerts` | Move / lights / parking / theft |

Do **not** commit `google-services.json` if your team treats it as secret (it is often committed for client apps; follow your policy).

## Build & open in Android Studio

```bash
cd frontend
npm run android:open
```

This loads `.env.android` (if present), builds the web app, syncs into `android/`, and opens Android Studio.

Or manually:

```bash
cd frontend
npm run build
npx cap sync android
npx cap open android
```

In Android Studio:

1. Wait for Gradle sync
2. Pick an emulator or USB phone (Developer options + USB debugging)
3. Click **Run** (green play)

## Day-to-day after web changes

```bash
cd frontend
npm run android:build
# then Run again in Android Studio
```

Or just `npx cap sync android` after `npm run build`.

## App identity

| Field | Value |
|--------|--------|
| App name | ParksTAG |
| Application ID | `com.parkstag.app` |
| Project folder | `frontend/android` |

## Permissions included

- Internet
- Camera (QR scan)
- Microphone (voice calls)
- Notifications (Android 13+)
- Full-screen intent / wake lock (incoming call urgency)
- Vibrate

## Call & chat notifications (WhatsApp-style)

After rebuild, the native app should:

- Show **incoming call** in the tray / lock screen with **Answer** and **Decline** (no need to open the app first to know a call is ringing)
- Show chat as **sender name** (or `Anonymous · AB12`) with message preview
- Allow **Reply** from the notification shade (sends while signed in)

If calls still do not pop over the lock screen on Android 14+:

1. **Settings → Apps → ParksTAG → Notifications → Incoming calls** — importance High / lock screen
2. Allow **Full screen intents** when the app prompts (or Apps → ParksTAG → Special app access)
3. Disable battery optimization for ParksTAG (Settings → Apps → ParksTAG → Battery → Unrestricted)
4. Redeploy backend + rebuild the app after call-notification fixes (system tray push + 5‑min FCM TTL)

## Play Store (later)

1. Create a Play Console account
2. In Android Studio: **Build → Generate Signed App Bundle**
3. Upload the `.aab`
4. Fill store listing (icon, screenshots, privacy policy)
5. For verified HTTPS deep links, add [Digital Asset Links](https://developer.android.com/training/app-links/verify-android-applinks) on your domain

## Deep links

Manifest includes:

- `parkstag://…` custom scheme
- `https://parkstag.app/…` host placeholder — change the host in  
  `android/app/src/main/AndroidManifest.xml` to your real domain

Call / chat deep links from push:

- `/?view=dashboard&call={roomId}`
- `/?view=dashboard&chat={sessionId}`

## Notes

- Device tokens are saved as `android-native` (Capacitor) vs `android-web` / `desktop-web` (browser).
- Server Firebase Admin credentials (`FIREBASE_*` in backend) stay the same.
- Do not commit `.env.android` (secrets).
- Do **not** use Android Studio’s Firebase assistant “Add Crashlytics” on the whole project — it injects Crashlytics into Capacitor library modules and breaks Gradle sync. If you need Crashlytics later, apply the plugin only in `android/app/build.gradle`.
