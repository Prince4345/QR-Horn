# Deploy QRHorn to production

This guide gets QRHorn live on **Render** (free tier works). One service runs the API, WebSockets, and the built React app on a single URL — best for QR stickers, voice calls, and auth.

## Before you deploy

1. **Push the repo to GitHub** (Render deploys from Git).
2. **Supabase** project is set up (database + auth).
3. **Firebase** project is set up (push notifications).
4. Run `npm run db:setup` locally once if you have not already (creates tables).

## 1. Create the Render web service

1. Go to [render.com](https://render.com) → **New** → **Blueprint** (if `render.yaml` is in the repo) **or** **Web Service**.
2. Connect your GitHub repo.
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm run install:all && npm run build:prod`
   - **Start command:** `npm run start:prod`
   - **Health check path:** `/api/health`

Render assigns a URL like `https://qrhorn-xxxx.onrender.com`. Use that as your production domain (or add a custom domain later).

## 2. Environment variables (Render dashboard)

Set these on the **web service** (not in committed `.env` files).

### Required — backend

| Variable | Example / notes |
|----------|-------------------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase **session pooler** (port 5432) |
| `DIRECT_URL` | **Same session pooler URL** as `DATABASE_URL` (for `prisma db push`). Avoid `db.*.supabase.co` locally — it often fails on Windows. |
| `SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (secret) |
| `FIREBASE_PROJECT_ID` | From Firebase console |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Full key; use `\n` for newlines in Render |
| `FIREBASE_API_KEY` | Web API key |
| `FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `FIREBASE_MESSAGING_SENDER_ID` | From Firebase |
| `FIREBASE_APP_ID` | From Firebase |
| `FIREBASE_VAPID_KEY` | Web Push VAPID key |
| `CORS_ORIGIN` | Your live URL, e.g. `https://qrhorn-xxxx.onrender.com` |

### Required — frontend (build time on Render)

These are baked into the JS bundle during `npm run build:prod`:

| Variable | Example / notes |
|----------|-------------------|
| `VITE_APP_URL` | **Same as live URL** — encoded in QR stickers |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public) |

Leave `VITE_API_URL` **unset** in production so the app uses the same origin as the website.

### Optional

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | AI sticker backgrounds |
| `FAST2SMS_API_KEY` | SMS via Fast2SMS (India, cheap) — see section below |
| `FAST2SMS_ROUTE` | Fast2SMS route (default `q` = Quick SMS) |
| `TWILIO_*` | SMS via Twilio (global, optional alternative) |

### SMS with Fast2SMS (India — recommended)

QRHorn uses SMS only as a **fallback** when push notifications fail. Voice calls stay free (WebRTC).

#### Step 1 — Create account

1. Go to [fast2sms.com](https://www.fast2sms.com) → **Sign up**
2. Verify your email and log in

#### Step 2 — Add wallet balance

1. Dashboard → **Add Funds** (minimum is usually small, e.g. ₹100)
2. Quick SMS (`route: q`) is pay-as-you-go (~₹0.15–0.25 per SMS depending on plan)

#### Step 3 — Get API key

1. Dashboard → **Dev API**
2. Copy your **Authorization Key** (enabled by default)
3. Keep it secret — treat it like a password

#### Step 4 — (Optional) Lock API to Render IP

1. Dev API → **Security** tab → enable IP whitelist
2. Add your Render service outbound IP (or skip for testing)
3. If enabled, only requests from that IP work

#### Step 5 — Set env vars on Render

| Variable | Value |
|----------|--------|
| `FAST2SMS_API_KEY` | Your Authorization Key from Dev API |
| `FAST2SMS_ROUTE` | `q` (Quick SMS — default, no DLT template needed for testing) |

Remove or leave empty any `TWILIO_*` vars if you are not using Twilio. **Fast2SMS is used when `FAST2SMS_API_KEY` is set.**

Redeploy after saving env vars.

#### Step 6 — Owner phone number format

Owners must save an **Indian 10-digit mobile** in Profile (e.g. `9876543210` or `+91 9876543210`).

#### Step 7 — Test

1. Open your live site → log in as owner → Profile → add mobile number
2. From another device, scan the QR → **Send Notification**
3. Owner should receive an SMS like: `QRHorn: HONDA (HR60N7731) — Please move your vehicle`
4. Check Render **Logs** if SMS fails (`Fast2SMS failed:` lines)

#### Troubleshooting

| Error | Fix |
|-------|-----|
| `Invalid Authentication` | Wrong or disabled API key — regenerate in Dev API |
| `Insufficient balance` | Top up wallet on Fast2SMS |
| SMS skipped in logs | Owner has no phone or not a valid 10-digit Indian number |
| IP blocked | Disable Security whitelist or add Render IP |

**Note:** For high-volume or commercial use in India, DLT registration (sender ID + template) may be required. Quick route `q` is fine for personal / low-volume QRHorn use.

### Voice calls across networks (TURN)

WiFi ↔ mobile-data calls need a TURN relay or they stay stuck on "Connecting…".
STUN alone only works on the same network.

**Recommended — Metered dynamic API** (server fetches the correct ICE array for your plan/region):

| Variable | Purpose |
|----------|---------|
| `METERED_APP_NAME` | Your app name on the Metered Dashboard home (the `<appname>` in `<appname>.metered.live`) |
| `METERED_API_KEY` | A credential's `apiKey` (Dashboard → TURN Server → your credential) |

**Alternative — fixed credentials** (coturn or one Metered credential). On Metered's **free** plan only `standard.relay.metered.ca` works:

| Variable | Example |
|----------|---------|
| `TURN_URLS` | `turn:standard.relay.metered.ca:80,turns:standard.relay.metered.ca:443?transport=tcp` |
| `TURN_USERNAME` | from Metered |
| `TURN_CREDENTIAL` | from Metered |

If none are set, the app falls back to the free OpenRelay project (best-effort, often congested). Env changes require **Save + redeploy**.

## 3. Database schema on production

After the first deploy, run migrations from your machine (uses `DIRECT_URL`):

```bash
cd backend
npx prisma db push
```

Or add a one-off Render **Shell** command with `DIRECT_URL` set.

## 4. Supabase auth redirects

In **Supabase → Authentication → URL configuration**:

- **Site URL:** `https://your-app.onrender.com`
- **Redirect URLs:** add:
  - `https://your-app.onrender.com`
  - `https://your-app.onrender.com/**`

If you use Google OAuth, add the same URLs in Google Cloud Console authorized redirect URIs.

## 5. Firebase authorized domains

In **Firebase → Authentication → Settings → Authorized domains**, add:

- `your-app.onrender.com`
- Your custom domain if you add one

## 6. Deploy

Click **Deploy** (or push to `main`). When the build finishes:

- App: `https://your-app.onrender.com`
- Health: `https://your-app.onrender.com/api/health`

Sign up, add a vehicle, and test scanning a sticker URL (`/scan/CODE`).

## 7. Rebuild stickers after going live

QR codes embed `VITE_APP_URL`. After deploy:

1. Open the dashboard on the **live** site.
2. Re-download PNG/PDF stickers so codes point to production, not `localhost`.

## Keep the free tier awake (recommended)

Render's free plan sleeps after ~15 min without traffic, so the first scan of the day
is slow (~30s wake-up) and incoming calls can miss their window. Two fixes — use both:

**A. UptimeRobot (external, most reliable):**

1. Sign up free at [uptimerobot.com](https://uptimerobot.com).
2. **Add New Monitor** → type **HTTP(s)**.
3. URL: `https://your-app.onrender.com/api/health`
4. Interval: **5 minutes** → Save.

You also get downtime email alerts for free.

**B. Self-ping (built-in):**

Set one more env var on Render and redeploy:

| Variable | Value |
|----------|-------|
| `KEEP_ALIVE_URL` | `https://your-app.onrender.com` |

The server then pings its own `/api/health` every 10 minutes.

## Custom domain (optional)

1. Render → your service → **Settings → Custom Domains**.
2. Add `app.yourdomain.com` and follow DNS instructions.
3. Update `CORS_ORIGIN`, `VITE_APP_URL`, Supabase redirects, and Firebase domains to the new URL.
4. **Redeploy** so the frontend rebuild picks up `VITE_APP_URL`.
5. Re-export all stickers.

## Local production test

```bash
# Set frontend env for the URL you will use
# frontend/.env: VITE_APP_URL=http://localhost:3001

npm run build:prod
set NODE_ENV=production
npm run start:prod
```

Open `http://localhost:3001` — API and UI on one port.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on `@types/express` or `ContactReason` | Dev deps skipped — repo uses `.npmrc` + `install:all --include=dev`; redeploy after pulling latest |
| Blank page after deploy | Check build logs; ensure `frontend/dist` exists |
| Auth redirect loop | Supabase Site URL + redirect URLs must match live domain |
| QR opens wrong host | Rebuild with correct `VITE_APP_URL` and re-download stickers |
| DB disconnected on health | Check `DATABASE_URL` (pooler URL, not direct, for runtime) |
| Free tier sleeps | First request after idle may take ~30s on Render free plan |

## Alternative: split frontend + backend

If you prefer Vercel for the UI and Render for the API:

1. Deploy backend only; set `CORS_ORIGIN` to the Vercel URL.
2. On Vercel, set `VITE_API_URL` to the Render API URL.
3. Configure Vercel rewrites for `/api` and WebSocket proxy (more complex for voice calls).

The single-service setup above is simpler and recommended.
