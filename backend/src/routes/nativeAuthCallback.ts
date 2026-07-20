import { Router } from 'express';

/**
 * HTTPS bridge for Capacitor Google OAuth.
 * Supabase redirects here with ?code=… then we bounce into the Android app.
 *
 * Allow in Supabase Redirect URLs:
 *   https://YOUR_APP.onrender.com/auth/native-callback
 *   https://YOUR_APP.onrender.com/auth/native-callback.html
 */
const router = Router();

function buildBridgeHtml(queryString: string): string {
  const qs = queryString.startsWith('?') || !queryString ? queryString : `?${queryString}`;
  const deep = `com.parkstag.app://auth/callback${qs}`;
  const intent =
    `intent://auth/callback${qs}` +
    '#Intent;scheme=com.parkstag.app;package=com.parkstag.app;end';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ParksTAG — Opening app…</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      font-family:system-ui,sans-serif; background:#0d0118; color:#fff; text-align:center; padding:24px; }
    a { color:#ff7eb3; }
  </style>
</head>
<body>
  <div>
    <p id="msg">Opening ParksTAG…</p>
    <p style="opacity:.7;font-size:14px;margin-top:16px">
      <a id="open" href="${deep}">Tap here if the app does not open</a>
    </p>
  </div>
  <script>
    (function () {
      var intent = ${JSON.stringify(intent)};
      var deep = ${JSON.stringify(deep)};
      try { window.location.replace(intent); } catch (e) { window.location.href = deep; }
      setTimeout(function () {
        var el = document.getElementById('msg');
        if (el) el.textContent = 'Switch to the ParksTAG app to finish signing in.';
      }, 1500);
    })();
  </script>
</body>
</html>`;
}

function handle(req: { url?: string; originalUrl?: string }, res: {
  status: (n: number) => unknown;
  type: (t: string) => { send: (b: string) => void };
}): void {
  const raw = req.originalUrl || req.url || '';
  const qIndex = raw.indexOf('?');
  const queryString = qIndex >= 0 ? raw.slice(qIndex) : '';
  res.status(200);
  res.type('html').send(buildBridgeHtml(queryString));
}

router.get('/native-callback', handle);
router.get('/native-callback.html', handle);

export default router;
