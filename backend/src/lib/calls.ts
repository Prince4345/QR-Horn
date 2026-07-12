/** In-app WebRTC voice is always available; Twilio is used for SMS only. */
export function isVoiceConfigured(): boolean {
  return true;
}

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * ICE servers for WebRTC. STUN alone works on the same network; cross-network
 * (WiFi ↔ mobile data) needs TURN. Configure a reliable TURN provider via env:
 *   TURN_URLS="turn:host:3478,turns:host:5349"  TURN_USERNAME=...  TURN_CREDENTIAL=...
 * Falls back to the free (best-effort) OpenRelay project TURN.
 */
export function getIceServers(): IceServer[] {
  const servers: IceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrls = process.env.TURN_URLS?.trim();
  const turnUser = process.env.TURN_USERNAME?.trim();
  const turnCred = process.env.TURN_CREDENTIAL?.trim();

  if (turnUrls && turnUser && turnCred) {
    servers.push({
      urls: turnUrls.split(',').map((u) => u.trim()).filter(Boolean),
      username: turnUser,
      credential: turnCred,
    });
  } else {
    // Best-effort free relay (may be congested/unreliable)
    servers.push({
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    });
  }

  return servers;
}
