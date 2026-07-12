import { nanoid } from 'nanoid';

export interface VoiceRoom {
  roomId: string;
  vehicleId: string;
  ownerId: string;
  vehicleName: string;
  vehicleNumber: string;
  status: 'ringing' | 'active' | 'ended';
  createdAt: number;
}

export interface PendingIncomingCall {
  roomId: string;
  vehicleName: string;
  vehicleNumber: string;
  createdAt: number;
}

const rooms = new Map<string, VoiceRoom>();
const pendingByOwner = new Map<string, PendingIncomingCall[]>();

export function createVoiceRoom(data: Omit<VoiceRoom, 'roomId' | 'status' | 'createdAt'> & { roomId?: string }) {
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

  setTimeout(() => {
    const current = rooms.get(roomId);
    if (current?.status === 'ringing') {
      current.status = 'ended';
      clearPendingCall(data.ownerId, roomId);
    }
  }, 60000);

  return room;
}

export function getVoiceRoom(roomId: string) {
  return rooms.get(roomId) ?? null;
}

export function getPendingCalls(ownerId: string): PendingIncomingCall[] {
  const now = Date.now();
  const list = (pendingByOwner.get(ownerId) ?? []).filter((c) => now - c.createdAt < 60000);
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
  if (room) room.status = status;
  if (status !== 'ringing' && room) {
    clearPendingCall(room.ownerId, roomId);
  }
}

export function endVoiceRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (room) {
    room.status = 'ended';
    clearPendingCall(room.ownerId, roomId);
  }
}
