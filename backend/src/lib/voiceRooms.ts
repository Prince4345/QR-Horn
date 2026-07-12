import { nanoid } from 'nanoid';

export interface VoiceRoom {
  roomId: string;
  vehicleId: string;
  ownerId: string;
  vehicleName: string;
  vehicleNumber: string;
  status: 'ringing' | 'active' | 'ended' | 'declined' | 'expired';
  createdAt: number;
}

export interface PendingIncomingCall {
  roomId: string;
  vehicleName: string;
  vehicleNumber: string;
  createdAt: number;
}

export type RoomExpireReason = 'expired' | 'declined' | 'ended';

const RING_TIMEOUT_MS = 60_000;
const rooms = new Map<string, VoiceRoom>();
const pendingByOwner = new Map<string, PendingIncomingCall[]>();
const expireTimers = new Map<string, ReturnType<typeof setTimeout>>();

let onRoomExpired: ((roomId: string, reason: RoomExpireReason) => void) | null = null;

/** Socket layer registers this so ringing timeouts notify both peers. */
export function setRoomExpireHandler(handler: (roomId: string, reason: RoomExpireReason) => void) {
  onRoomExpired = handler;
}

export function createVoiceRoom(data: Omit<VoiceRoom, 'roomId' | 'status' | 'createdAt'> & { roomId?: string }) {
  // One ringing/active call per owner at a time
  for (const existing of rooms.values()) {
    if (
      existing.ownerId === data.ownerId &&
      (existing.status === 'ringing' || existing.status === 'active')
    ) {
      return { error: 'Owner is already on a call', room: null as VoiceRoom | null };
    }
  }

  const roomId = data.roomId ?? nanoid(12);
  const room: VoiceRoom = {
    roomId,
    vehicleId: data.vehicleId,
    ownerId: data.ownerId,
    vehicleName: data.vehicleName,
    vehicleNumber: data.vehicleNumber,
    status: 'ringing',
    createdAt: Date.now(),
  };
  rooms.set(roomId, room);

  const pending = pendingByOwner.get(data.ownerId) ?? [];
  pending.push({
    roomId,
    vehicleName: data.vehicleName,
    vehicleNumber: data.vehicleNumber,
    createdAt: Date.now(),
  });
  pendingByOwner.set(data.ownerId, pending);

  const timer = setTimeout(() => {
    expireTimers.delete(roomId);
    const current = rooms.get(roomId);
    if (current?.status === 'ringing') {
      current.status = 'expired';
      clearPendingCall(data.ownerId, roomId);
      onRoomExpired?.(roomId, 'expired');
      // Keep room briefly so late joiners get a clear status, then drop
      setTimeout(() => rooms.delete(roomId), 15_000);
    }
  }, RING_TIMEOUT_MS);
  expireTimers.set(roomId, timer);

  return { error: null as string | null, room };
}

/** Active/ringing rooms only — ended/declined/expired return null for most ops. */
export function getVoiceRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return room;
}

export function getJoinableRoom(roomId: string) {
  return rooms.get(roomId) ?? null;
}

export function getPendingCalls(ownerId: string): PendingIncomingCall[] {
  const now = Date.now();
  const list = (pendingByOwner.get(ownerId) ?? []).filter((c) => now - c.createdAt < RING_TIMEOUT_MS);
  pendingByOwner.set(ownerId, list);
  return list;
}

export function clearPendingCall(ownerId: string, roomId: string) {
  const list = pendingByOwner.get(ownerId) ?? [];
  pendingByOwner.set(
    ownerId,
    list.filter((c) => c.roomId !== roomId)
  );
}

export function setVoiceRoomStatus(roomId: string, status: VoiceRoom['status']) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.status = status;
  if (status !== 'ringing') {
    clearPendingCall(room.ownerId, roomId);
    const timer = expireTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      expireTimers.delete(roomId);
    }
  }
}

export function endVoiceRoom(roomId: string, status: VoiceRoom['status'] = 'ended') {
  const room = rooms.get(roomId);
  if (!room) return;
  room.status = status;
  clearPendingCall(room.ownerId, roomId);
  const timer = expireTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    expireTimers.delete(roomId);
  }
  setTimeout(() => rooms.delete(roomId), 15_000);
}

export { RING_TIMEOUT_MS };
