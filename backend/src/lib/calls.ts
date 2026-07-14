/** In-app WebRTC voice is always available; SMS uses Fast2SMS (India) or Twilio. */
export function isVoiceConfigured(): boolean {
  return true;
}

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const STUN_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Cache Metered's ICE array so we don't hit their API on every call.
let cachedMeteredServers: IceServer[] | null = null;
let cachedAt = 0;
const METERED_CACHE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch the ready-to-use ICE Servers array from Metered using a
 * credential-scoped apiKey. This is the most reliable option: Metered returns
 * the correct endpoints for your plan/region (on the free plan only
 * standard.relay.metered.ca works, so hand-typed URLs often fail silently).
 *
 * Env:
 *   METERED_APP_NAME=yourappname          (Dashboard → home; the <appname> in <appname>.metered.live)
 *   METERED_API_KEY=<credential apiKey>   (safe for this server-side call)
 */
async function fetchMeteredServers(): Promise<IceServer[] | null> {
  const appName = process.env.METERED_APP_NAME?.trim();
  const apiKey = process.env.METERED_API_KEY?.trim();
  if (!appName || !apiKey) return null;

  const now = Date.now();
  if (cachedMeteredServers && now - cachedAt < METERED_CACHE_MS) {
    return cachedMeteredServers;
  }

  try {
    const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) {
      console.warn('Metered TURN fetch failed:', res.status);
      return cachedMeteredServers;
    }
    const data = (await res.json()) as IceServer[];
    if (Array.isArray(data) && data.length > 0) {
      cachedMeteredServers = data;
      cachedAt = now;
      return data;
    }
    return cachedMeteredServers;
  } catch (err) {
    console.warn('Metered TURN fetch error:', (err as Error).message);
    return cachedMeteredServers;
  }
}

/** Static TURN from explicit env vars (coturn or a fixed Metered credential). */
function staticTurnServers(): IceServer[] | null {
  const turnUrls = process.env.TURN_URLS?.trim();
  const turnUser = process.env.TURN_USERNAME?.trim();
  const turnCred = process.env.TURN_CREDENTIAL?.trim();
  if (turnUrls && turnUser && turnCred) {
    return [
      {
        urls: turnUrls.split(',').map((u) => u.trim()).filter(Boolean),
        username: turnUser,
        credential: turnCred,
      },
    ];
  }
  return null;
}

/**
 * ICE servers for WebRTC. STUN alone works on the same network; cross-network
 * (WiFi ↔ mobile data) needs TURN.
 *
 * Priority:
 *   1. Metered API (METERED_APP_NAME + METERED_API_KEY) — recommended, dynamic.
 *   2. Explicit TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL.
 *   3. Best-effort free OpenRelay (may be congested/unreliable).
 */
export async function getIceServers(): Promise<IceServer[]> {
  const metered = await fetchMeteredServers();
  if (metered && metered.length > 0) {
    return [...STUN_SERVERS, ...metered];
  }

  const staticTurn = staticTurnServers();
  if (staticTurn) {
    return [...STUN_SERVERS, ...staticTurn];
  }

  return [
    ...STUN_SERVERS,
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];
}
