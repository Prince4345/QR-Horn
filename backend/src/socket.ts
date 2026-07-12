import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import {
  endVoiceRoom,
  getVoiceRoom,
  setVoiceRoomStatus,
  clearPendingCall,
} from './lib/voiceRooms.js';
import {
  bufferOffer,
  bufferAnswer,
  bufferIce,
  clearSignals,
  replaySignalsToSocket,
} from './lib/callSignaling.js';

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer) {
  const corsEnv = process.env.CORS_ORIGIN?.trim();
  const origins = corsEnv
    ? corsEnv.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:3000'];

  io = new Server(httpServer, {
    cors: { origin: origins.length ? origins : true, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket: Socket) => {
    socket.on('owner:register', ({ ownerId }: { ownerId?: string }) => {
      if (!ownerId) return;
      socket.join(`owner:${ownerId}`);
    });

    socket.on('call:join', (payload: { roomId?: string }, ack?: (r: { ok: boolean }) => void) => {
      const roomId = payload?.roomId;
      if (!roomId || !getVoiceRoom(roomId)) {
        ack?.({ ok: false });
        return;
      }
      socket.join(`voice:${roomId}`);
      replaySignalsToSocket(socket, roomId);
      ack?.({ ok: true });
    });

    socket.on('call:accept', ({ roomId }: { roomId?: string }) => {
      const room = roomId ? getVoiceRoom(roomId) : null;
      if (!room) return;
      setVoiceRoomStatus(roomId!, 'active');
      clearPendingCall(room.ownerId, roomId!);
      io!.to(`voice:${roomId}`).emit('call:accepted', { roomId });
    });

    socket.on('call:decline', ({ roomId }: { roomId?: string }) => {
      if (!roomId) return;
      const room = getVoiceRoom(roomId);
      if (room) clearPendingCall(room.ownerId, roomId);
      endVoiceRoom(roomId);
      clearSignals(roomId);
      io!.to(`voice:${roomId}`).emit('call:declined', { roomId });
    });

    socket.on('call:end', ({ roomId }: { roomId?: string }) => {
      if (!roomId) return;
      endVoiceRoom(roomId);
      clearSignals(roomId);
      io!.to(`voice:${roomId}`).emit('call:ended', { roomId });
    });

    socket.on('webrtc:offer', ({ roomId, offer }: { roomId?: string; offer?: object }) => {
      if (!roomId || !offer) return;
      bufferOffer(roomId, offer);
      socket.to(`voice:${roomId}`).emit('webrtc:offer', { roomId, offer });
    });

    socket.on('webrtc:answer', ({ roomId, answer }: { roomId?: string; answer?: object }) => {
      if (!roomId || !answer) return;
      bufferAnswer(roomId, answer);
      socket.to(`voice:${roomId}`).emit('webrtc:answer', { roomId, answer });
    });

    socket.on('webrtc:ice', ({ roomId, candidate }: { roomId?: string; candidate?: object }) => {
      if (!roomId || !candidate) return;
      bufferIce(roomId, candidate);
      socket.to(`voice:${roomId}`).emit('webrtc:ice', { roomId, candidate });
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function emitIncomingCall(
  ownerId: string,
  payload: { roomId: string; vehicleName: string; vehicleNumber: string }
) {
  if (!io) return;
  io.to(`owner:${ownerId}`).emit('call:incoming', payload);
}
