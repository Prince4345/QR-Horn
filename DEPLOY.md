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
| `DIRECT_URL` | Supabase **direct** connection (for one-time `db push`) |
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
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | SMS alerts |

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
