import { io, type Socket } from 'socket.io-client';
import { getSocketBase } from './apiBase';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export type CallPhase = 'idle' | 'ringing' | 'connecting' | 'active' | 'ended' | 'declined' | 'failed';

export interface IncomingCall {
  roomId: string;
  vehicleName: string;
  vehicleNumber: string;
}

let sharedSocket: Socket | null = null;
let registeredOwnerId: string | null = null;

function getSocket(): Socket {
  const url = getSocketBase();
  if (!sharedSocket) {
    sharedSocket = io(url, { transports: ['websocket', 'polling'], reconnection: true });
    sharedSocket.on('connect', () => {
      if (registeredOwnerId) {
        sharedSocket?.emit('owner:register', { ownerId: registeredOwnerId });
      }
    });
  } else {
    try {
      const currentHost = sharedSocket.io.opts.hostname;
      const targetHost = new URL(url).hostname;
      if (currentHost !== targetHost) {
        sharedSocket.disconnect();
        sharedSocket = io(url, { transports: ['websocket', 'polling'], reconnection: true });
      }
    } catch {
      // keep existing socket
    }
  }
  return sharedSocket;
}

function joinRoom(socket: Socket, roomId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Could not join call room')), 8000);
    socket.emit('call:join', { roomId }, (res: { ok?: boolean }) => {
      clearTimeout(timeout);
      if (res?.ok) resolve();
      else reject(new Error('Call room not found'));
    });
  });
}

export class VoiceCallSession {
  private socket: Socket;
  private pc: RTCPeerConnection;
  private roomId: string;
  private localStream: MediaStream | null = null;
  private onPhaseChange?: (phase: CallPhase) => void;
  private onRemoteStream?: (stream: MediaStream) => void;
  private acceptPromise: Promise<void> | null = null;
  private iceQueue: RTCIceCandidateInit[] = [];
  private remoteSet = false;

  private onOffer = async ({ roomId: rid, offer }: { roomId: string; offer: RTCSessionDescriptionInit }) => {
    if (rid !== this.roomId || !offer) return;
    try {
      await this.pc.setRemoteDescription(offer);
      this.remoteSet = true;
      await this.flushIceQueue();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.socket.emit('webrtc:answer', { roomId: this.roomId, answer });
      this.setPhase('connecting');
    } catch (err) {
      console.error('handle offer failed:', err);
      this.setPhase('failed');
    }
  };

  private onAnswer = async ({ roomId: rid, answer }: { roomId: string; answer: RTCSessionDescriptionInit }) => {
    if (rid !== this.roomId || !answer) return;
    try {
      await this.pc.setRemoteDescription(answer);
      this.remoteSet = true;
      await this.flushIceQueue();
      this.setPhase('connecting');
    } catch (err) {
      console.error('handle answer failed:', err);
      this.setPhase('failed');
    }
  };

  private onIce = async ({ roomId: rid, candidate }: { roomId: string; candidate: RTCIceCandidateInit }) => {
    if (rid !== this.roomId || !candidate) return;
    if (!this.remoteSet) {
      this.iceQueue.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      // may fail if duplicate
    }
  };

  private onDeclined = ({ roomId: rid }: { roomId: string }) => {
    if (rid !== this.roomId) return;
    this.setPhase('declined');
    this.cleanup();
  };

  private onEnded = ({ roomId: rid }: { roomId: string }) => {
    if (rid !== this.roomId) return;
    this.setPhase('ended');
    this.cleanup();
  };

  private constructor(socket: Socket, roomId: string) {
    this.socket = socket;
    this.roomId = roomId;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.setupPeer();
    this.bindSocket();
  }

  static async beginOutgoing(roomId: string): Promise<VoiceCallSession> {
    const socket = getSocket();
    const session = new VoiceCallSession(socket, roomId);
    await session.initLocalAudio();
    await joinRoom(socket, roomId);
    session.setPhase('ringing');
    return session;
  }

  waitUntilAccepted(timeoutMs = 45000): Promise<void> {
    if (this.acceptPromise) return this.acceptPromise;

    this.acceptPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off('call:accepted', onAccepted);
        reject(new Error('Owner did not answer in time'));
      }, timeoutMs);

      const onAccepted = async () => {
        clearTimeout(timeout);
        this.socket.off('call:accepted', onAccepted);
        try {
          const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
          await this.pc.setLocalDescription(offer);
          this.socket.emit('webrtc:offer', { roomId: this.roomId, offer });
          this.setPhase('connecting');
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      this.socket.on('call:accepted', onAccepted);
    });

    return this.acceptPromise;
  }

  static async startIncoming(roomId: string): Promise<VoiceCallSession> {
    const socket = getSocket();
    const session = new VoiceCallSession(socket, roomId);
    await session.initLocalAudio();
    await joinRoom(socket, roomId);
    socket.emit('call:accept', { roomId });
    session.setPhase('connecting');
    return session;
  }

  onPhase(cb: (phase: CallPhase) => void) {
    this.onPhaseChange = cb;
  }

  onRemote(cb: (stream: MediaStream) => void) {
    this.onRemoteStream = cb;
  }

  private setPhase(phase: CallPhase) {
    this.onPhaseChange?.(phase);
  }

  private async initLocalAudio() {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }
  }

  private async flushIceQueue() {
    const queued = [...this.iceQueue];
    this.iceQueue = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    }
  }

  private setupPeer() {
    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        this.onRemoteStream?.(stream);
        this.setPhase('active');
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc:ice', { roomId: this.roomId, candidate: event.candidate });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === 'connected') {
        this.setPhase('active');
      } else if (state === 'failed') {
        this.setPhase('failed');
      }
    };
  }

  private bindSocket() {
    this.socket.on('webrtc:offer', this.onOffer);
    this.socket.on('webrtc:answer', this.onAnswer);
    this.socket.on('webrtc:ice', this.onIce);
    this.socket.on('call:declined', this.onDeclined);
    this.socket.on('call:ended', this.onEnded);
  }

  end() {
    this.socket.emit('call:end', { roomId: this.roomId });
    this.cleanup();
    this.setPhase('ended');
  }

  private cleanup() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    if (this.pc.connectionState !== 'closed') {
      this.pc.close();
    }
    this.socket.off('webrtc:offer', this.onOffer);
    this.socket.off('webrtc:answer', this.onAnswer);
    this.socket.off('webrtc:ice', this.onIce);
    this.socket.off('call:declined', this.onDeclined);
    this.socket.off('call:ended', this.onEnded);
  }
}

export function registerOwnerSocket(ownerId: string) {
  registeredOwnerId = ownerId;
  const socket = getSocket();
  if (socket.connected) {
    socket.emit('owner:register', { ownerId });
  }
}

export function subscribeIncomingCalls(cb: (call: IncomingCall) => void) {
  const socket = getSocket();
  const handler = (payload: IncomingCall) => cb(payload);
  socket.on('call:incoming', handler);
  return () => socket.off('call:incoming', handler);
}

export function declineIncomingCall(roomId: string) {
  getSocket().emit('call:decline', { roomId });
}
