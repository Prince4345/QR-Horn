import { getApiBase } from './apiBase';

let getAccessToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(fn: () => Promise<string | null>) {
  getAccessToken = fn;
}

/** Wait until Vite can reach the backend (avoids proxy errors right after npm run dev). */
export async function waitForApiReady(maxAttempts = 20, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${getApiBase()}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return true;
    } catch {
      // backend not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (getAccessToken) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _t, ...fetchOptions } = options ?? {};
    const res = await fetch(`${getApiBase()}${path}`, {
      headers: { ...(await authHeaders()), ...fetchOptions?.headers },
      ...fetchOptions,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed: ${res.status}`);
    }

    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out — is the backend running on port 3001?');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export interface Vehicle {
  id: string;
  name: string;
  number: string;
  type: 'car' | 'bike';
  active: boolean;
  theftMode: boolean;
  verified: boolean;
  verifiedAt: string | null;
  stickerCode: string | null;
  stickerTheme: string;
  stickerCustomImage: string | null;
  stickerCustomization?: import('./stickerStyle').StickerCustomization;
  totalPings: number;
  callsMasked: number;
}

export interface VehicleVerifyChecks {
  platesMatch: boolean;
  typedPlateMatch: boolean;
  ownerNameMatch: boolean;
  ownerNameScore: number;
  confidence: number;
  lowConfidenceWarning: boolean;
}

export interface VehicleVerifyExtracted {
  rcPlate: string | null;
  photoPlate: string | null;
  ownerNameOnRc: string | null;
  vehicleName: string | null;
  vehicleType: 'car' | 'bike' | null;
}

export interface VehicleVerifyResult {
  ok: boolean;
  reason?: string;
  message: string;
  verificationId?: string;
  expiresAt?: string;
  extracted: VehicleVerifyExtracted;
  checks: VehicleVerifyChecks;
}

export interface Activity {
  id: string;
  type: 'notification' | 'call' | 'chat';
  reason: string;
  time: string;
}

export interface ScanData {
  vehicleId: string;
  vehicleName: string;
  vehicleNumber: string;
  ownerName: string;
  theftMode: boolean;
  stickerCode: string | null;
  registered: boolean;
}

export interface OwnerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  fcmToken: string | null;
  createdAt?: string;
}

export type ContactMethod = 'qr' | 'plate';
export type ContactReason = 'move' | 'lights' | 'parking' | 'emergency' | 'other';

export const api = {
  getAuthConfig: () =>
    request<{
      pushEnabled: boolean;
      smsEnabled: boolean;
      voiceEnabled: boolean;
      geminiEnabled: boolean;
      firebase: Record<string, string | null>;
    }>('/api/auth/config'),

  getMe: () =>
    request<{ setupComplete: boolean; owner?: OwnerProfile; authUserId?: string }>('/api/auth/me'),

  getPendingCalls: () =>
    request<{ roomId: string; vehicleName: string; vehicleNumber: string }[]>('/api/auth/calls/pending'),

  setupProfile: (name: string, phone: string) =>
    request<{ setupComplete: boolean; owner: OwnerProfile }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ name, phone }),
    }),

  updateProfile: (data: { name?: string; phone?: string }) =>
    request<{ owner: OwnerProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  saveFcmToken: (fcmToken: string, device?: string) =>
    request<{ success: boolean }>('/api/auth/fcm-token', {
      method: 'PATCH',
      body: JSON.stringify({ fcmToken, device }),
    }),

  testPush: () =>
    request<{ sent: number; total: number; errors: string[] }>('/api/auth/push-test', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getVehicles: () => request<Vehicle[]>('/api/vehicles'),

  getVehicle: (vehicleId: string) => request<Vehicle>(`/api/vehicles/${vehicleId}`),

  verifyRcDocument: (data: { rcImageDataUrl: string }) =>
    request<VehicleVerifyResult>('/api/vehicles/verify-rc', {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: 90000,
    }),

  verifyPlatePhoto: (data: {
    verificationId: string;
    plateImageDataUrl: string;
    typedPlate: string;
  }) =>
    request<VehicleVerifyResult>('/api/vehicles/verify-plate', {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: 90000,
    }),

  addVehicle: (data: { verificationId: string; name: string; type: 'car' | 'bike' }) =>
    request<Vehicle>('/api/vehicles', { method: 'POST', body: JSON.stringify(data) }),

  updateVehicle: (
    vehicleId: string,
    data: { name?: string; number?: string; active?: boolean }
  ) =>
    request<Vehicle>(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteVehicle: (vehicleId: string) =>
    request<{ success: boolean }>(`/api/vehicles/${vehicleId}`, { method: 'DELETE' }),

  getActivity: (vehicleId: string) => request<Activity[]>(`/api/vehicles/${vehicleId}/activity`),

  updateTheftMode: (vehicleId: string, theftMode: boolean) =>
    request<{ id: string; theftMode: boolean }>(`/api/vehicles/${vehicleId}/theft-mode`, {
      method: 'PATCH',
      body: JSON.stringify({ theftMode }),
    }),

  updateSticker: (
    vehicleId: string,
    data: {
      themeId?: string;
      customImageData?: string | null;
      customization?: import('./stickerStyle').StickerCustomization;
    }
  ) =>
    request<{
      code: string;
      themeId: string;
      customImageData: string | null;
      customization: import('./stickerStyle').StickerCustomization;
    }>(`/api/vehicles/${vehicleId}/sticker`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  stylizeStickerImage: (
    vehicleId: string,
    data: {
      style: string;
      imageData?: string;
      aiPrompt?: string;
      headline?: string;
      tagline?: string;
    }
  ) =>
    request<{ imageDataUrl: string }>(`/api/vehicles/${vehicleId}/sticker/stylize`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getScanData: (code: string) => request<ScanData>(`/api/scan/${encodeURIComponent(code)}`),

  lookupByVehicleNumber: (number: string) =>
    request<ScanData>(`/api/scan/by-number/${encodeURIComponent(number)}`),

  sendNotification: (method: ContactMethod, id: string, reason: ContactReason) =>
    request<{ success: boolean; pushDelivered: boolean; smsDelivered: boolean; alertDelivered: boolean; message: string }>(
      method === 'qr'
        ? `/api/scan/${encodeURIComponent(id)}/notify`
        : `/api/scan/by-number/${encodeURIComponent(id)}/notify`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),

  initiateCall: (method: ContactMethod, id: string) =>
    request<{
      success: boolean;
      roomId: string;
      chatSessionId?: string;
      scannerToken?: string;
      callInitiated: boolean;
      alertDelivered: boolean;
      message: string;
    }>(
      method === 'qr'
        ? `/api/scan/${encodeURIComponent(id)}/call`
        : `/api/scan/by-number/${encodeURIComponent(id)}/call`,
      { method: 'POST', body: JSON.stringify({}) }
    ),

  startChat: (vehicleId: string, data?: { reason?: ContactReason; callRoomId?: string; scannerToken?: string }) =>
    request<{
      sessionId: string;
      scannerToken: string;
      session: import('./chatClient').ChatSession;
    }>(`/api/chat/start/${encodeURIComponent(vehicleId)}`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),

  getScannerChat: (sessionId: string, token: string) =>
    request<import('./chatClient').ChatSession>(
      `/api/chat/scanner/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`
    ),

  sendScannerChatMessage: (sessionId: string, token: string, body: string, isQuickReply?: boolean) =>
    request<{ message: import('./chatClient').ChatMessage; session: import('./chatClient').ChatSession }>(
      `/api/chat/scanner/${encodeURIComponent(sessionId)}/messages`,
      { method: 'POST', body: JSON.stringify({ token, body, isQuickReply }) }
    ),

  getChatSessions: () => request<import('./chatClient').ChatSessionSummary[]>('/api/chat/sessions'),

  getChatSession: (sessionId: string) =>
    request<import('./chatClient').ChatSession>(`/api/chat/sessions/${encodeURIComponent(sessionId)}`),

  sendOwnerChatMessage: (sessionId: string, body: string, isQuickReply?: boolean) =>
    request<{ message: import('./chatClient').ChatMessage; session: import('./chatClient').ChatSession }>(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
      { method: 'POST', body: JSON.stringify({ body, isQuickReply }) }
    ),

  blockChatSession: (sessionId: string) =>
    request<{ success: boolean }>(`/api/chat/sessions/${encodeURIComponent(sessionId)}/block`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};
