import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import {
  endVoiceRoom,
  getJoinableRoom,
  getVoiceRoom,
  setVoiceRoomStatus,
  clearPendingCall,
  setRoomExpireHandler,
  setRoomClosedHandler,
} from './lib/voiceRooms.js';
import { logCallOutcome } from './lib/callLog.js';
import {
  bufferOffer,
  bufferAnswer,
  bufferIce,
  clearSignals,
  replaySignalsToSocket,
  type SignalRole,
} from './lib/callSignaling.js';

let io: Server | null = null;

type JoinAck = {
  ok: boolean;
  status?: string;
  reason?: 'not_found' | 'ended' | 'declined' | 'expired' | 'active' | 'ringing';
};

export function initSocketServer(httpServer: HttpServer) {
  const corsEnv = process.env.CORS_ORIGIN?.trim();
  const origins = corsEnv
    ? corsEnv.split(',').map((o) => o.trim()).filter(Boolean)
    : true;

  io = new Server(httpServer, {
    cors: { origin: origins, methods: ['GET', 'POST'] },
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  // Ringing timeout → notify anyone already in the voice room AND every
  // owner device (most owner devices never join the voice room until they
  // accept, so without this they'd ring forever).
  setRoomExpireHandler((roomId, reason) => {
    clearSignals(roomId);
    const event = reason === 'expired' ? 'call:declined' : 'call:ended';
    const room = getJoinableRoom(roomId);
    io?.to(`voice:${roomId}`).emit(event, { roomId, reason });
    if (room) io?.to(`owner:${room.ownerId}`).emit(event, { roomId, reason });
  });

  // Terminal room state → write outcome + duration to call history
  setRoomClosedHandler((room, outcome, durationSec) => {
    void logCallOutcome(room, outcome, durationSec);
  });

  io.on('connection', (socket: Socket) => {
    socket.on('owner:register', ({ ownerId }: { ownerId?: string }) => {
      if (!ownerId || typeof ownerId !== 'string') return;
      socket.join(`owner:${ownerId}`);
    });

    socket.on('call:join', (payload: { roomId?: string; role?: string }, ack?: (r: JoinAck) => void) => {
      const roomId = payload?.roomId;
      const role: SignalRole = payload?.role === 'owner' ? 'owner' : 'caller';
      if (!roomId) {
        ack?.({ ok: false, reason: 'not_found' });
        return;
      }

      const room = getJoinableRoom(roomId);
      if (!room) {
        ack?.({ ok: false, reason: 'not_found' });
        return;
      }

      if (room.status === 'ended' || room.status === 'declined' || room.status === 'expired') {
        ack?.({ ok: false, status: room.status, reason: room.status });
        // Still join briefly so they can receive any last events, but report failure
        socket.join(`voice:${roomId}`);
        socket.emit(room.status === 'declined' || room.status === 'expired' ? 'call:declined' : 'call:ended', {
          roomId,
          reason: room.status,
        });
        return;
      }

      socket.join(`voice:${roomId}`);
      replaySignalsToSocket(socket, roomId, role);
      // If the owner already accepted before this socket joined (fast-answer
      // race, or a reconnect), tell the caller right away so it sends its offer.
      if (room.status === 'active' && role === 'caller') {
        socket.emit('call:accepted', { roomId });
      }
      ack?.({ ok: true, status: room.status, reason: room.status });
    });

    socket.on('call:accept', ({ roomId }: { roomId?: string }, ack?: (r: { ok: boolean; reason?: string }) => void) => {
      const room = roomId ? getVoiceRoom(roomId) : null;
      if (!room || !roomId) {
        ack?.({ ok: false, reason: 'not_found' });
        return;
      }
      if (room.status === 'ringing') {
        setVoiceRoomStatus(roomId, 'active');
        clearPendingCall(room.ownerId, roomId);
        io!.to(`voice:${roomId}`).emit('call:accepted', { roomId });
        io!.to(`owner:${room.ownerId}`).emit('call:accepted', { roomId });
        ack?.({ ok: true });
        return;
      }
      if (room.status === 'active') {
        // Idempotent re-accept after reconnect — replay to this socket only
        socket.emit('call:accepted', { roomId });
        ack?.({ ok: true });
        return;
      }
      ack?.({ ok: false, reason: room.status });
    });

    socket.on('call:decline', ({ roomId }: { roomId?: string }) => {
      if (!roomId) return;
      declineCallByRoom(roomId);
    });

    socket.on('call:end', ({ roomId }: { roomId?: string }) => {
      if (!roomId) return;
      const room = getJoinableRoom(roomId);
      endVoiceRoom(roomId, 'ended');
      clearSignals(roomId);
      io!.to(`voice:${roomId}`).emit('call:ended', { roomId, reason: 'ended' });
      if (room) io!.to(`owner:${room.ownerId}`).emit('call:ended', { roomId, reason: 'ended' });
    });

    socket.on('webrtc:offer', ({ roomId, offer }: { roomId?: string; offer?: object }) => {
      if (!roomId || !offer || !getVoiceRoom(roomId)) return;
      bufferOffer(roomId, offer);
      socket.to(`voice:${roomId}`).emit('webrtc:offer', { roomId, offer });
    });

    socket.on('webrtc:answer', ({ roomId, answer }: { roomId?: string; answer?: object }) => {
      if (!roomId || !answer || !getVoiceRoom(roomId)) return;
      bufferAnswer(roomId, answer);
      socket.to(`voice:${roomId}`).emit('webrtc:answer', { roomId, answer });
    });

    socket.on('webrtc:ice', ({ roomId, candidate, role }: { roomId?: string; candidate?: object; role?: string }) => {
      if (!roomId || !candidate || !getVoiceRoom(roomId)) return;
      bufferIce(roomId, role === 'owner' ? 'owner' : 'caller', candidate);
      socket.to(`voice:${roomId}`).emit('webrtc:ice', { roomId, candidate });
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

/**
 * Decline a ringing call by roomId. Shared by the socket handler and the
 * public HTTP endpoint (used by the "Decline" action on the OS notification,
 * which can fire even while the app is fully closed).
 */
export function declineCallByRoom(roomId: string): boolean {
  const room = getJoinableRoom(roomId);
  if (!room) return false;

  // Always drop from the pending list so poll/UI cannot resurrect this ring.
  clearPendingCall(room.ownerId, roomId);

  if (room.status !== 'ringing') {
    if (room.status === 'declined' || room.status === 'expired') {
      io?.to(`owner:${room.ownerId}`).emit('call:declined', { roomId, reason: room.status });
      return true;
    }
    return false;
  }

  endVoiceRoom(roomId, 'declined');
  clearSignals(roomId);
  io?.to(`voice:${roomId}`).emit('call:declined', { roomId, reason: 'declined' });
  io?.to(`owner:${room.ownerId}`).emit('call:declined', { roomId, reason: 'declined' });
  return true;
}

export function emitIncomingCall(
  ownerId: string,
  payload: { roomId: string; vehicleName: string; vehicleNumber: string }
) {
  if (!io) return;
  io.to(`owner:${ownerId}`).emit('call:incoming', payload);
}
