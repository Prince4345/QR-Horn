import { io, type Socket } from 'socket.io-client';
import { getSocketBase, getApiBase } from './apiBase';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
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

let cachedIceServers: RTCIceServer[] | null = null;

/** Load ICE servers from the backend (env-configurable TURN); cache for the session. */
async function loadIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) return cachedIceServers;
  try {
    const res = await fetch(`${getApiBase()}/api/auth/config`);
    const cfg = await res.json();
    if (Array.isArray(cfg.iceServers) && cfg.iceServers.length > 0) {
      cachedIceServers = cfg.iceServers as RTCIceServer[];
      return cachedIceServers;
    }
  } catch {
    // fall through to defaults
  }
  cachedIceServers = DEFAULT_ICE_SERVERS;
  return cachedIceServers;
}

export type CallPhase = 'idle' | 'ringing' | 'connecting' | 'active' | 'ended' | 'declined' | 'failed';

export interface IncomingCall {
  roomId: string;
  vehicleName: string;
  vehicleNumber: string;
}

type JoinAck = {
  ok?: boolean;
  status?: string;
  reason?: 'not_found' | 'ended' | 'declined' | 'expired' | 'active' | 'ringing';
};

let sharedSocket: Socket | null = null;
let registeredOwnerId: string | null = null;

function attachOwnerReconnect(socket: Socket) {
  socket.off('connect');
  socket.on('connect', () => {
    if (registeredOwnerId) {
      socket.emit('owner:register', { ownerId: registeredOwnerId });
    }
  });
}

// Polling first, then upgrade to websocket — most reliable behind Render's proxy.
const SOCKET_OPTS = {
  transports: ['polling', 'websocket'] as string[],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 800,
  timeout: 20000,
};

function getSocket(): Socket {
  const url = getSocketBase();
  if (!sharedSocket) {
    sharedSocket = io(url, SOCKET_OPTS);
    attachOwnerReconnect(sharedSocket);
  } else {
    try {
      const currentHost = sharedSocket.io.opts.hostname;
      const targetHost = new URL(url).hostname;
      if (currentHost !== targetHost) {
        sharedSocket.disconnect();
        sharedSocket = io(url, SOCKET_OPTS);
        attachOwnerReconnect(sharedSocket);
      }
    } catch {
      // keep existing socket
    }
  }
  return sharedSocket;
}

function joinRoom(socket: Socket, roomId: string): Promise<JoinAck> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Could not join call room')), 10000);
    socket.emit('call:join', { roomId }, (res: JoinAck) => {
      clearTimeout(timeout);
      resolve(res ?? { ok: false, reason: 'not_found' });
    });
  });
}

/** Turn a getUserMedia error into a clear, accurate message. */
function micError(err: unknown): Error {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new Error('Microphone blocked. Tap the lock icon in your browser address bar and allow Microphone, then try again.');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new Error('No microphone found on this device.');
    case 'NotReadableError':
      return new Error('Your microphone is in use by another app. Close it and try again.');
    default:
      return new Error('Could not start the microphone. Make sure no other app is using it and try again.');
  }
}

function joinErrorMessage(ack: JoinAck): string {
  switch (ack.reason) {
    case 'declined':
      return 'Owner declined the call';
    case 'expired':
      return 'Owner did not answer in time';
    case 'ended':
      return 'Call already ended';
    default:
      return 'Call room not found or no longer available';
  }
}

export class VoiceCallSession {
  private socket: Socket;
  private pc: RTCPeerConnection;
  private roomId: string;
  private localStream: MediaStream | null = null;
  private onPhaseChange?: (phase: CallPhase) => void;
  private onRemoteStream?: (stream: MediaStream) => void;
  private acceptPromise: Promise<void> | null = null;
  private acceptResolve: (() => void) | null = null;
  private acceptReject: ((e: Error) => void) | null = null;
  private acceptTimeout: ReturnType<typeof setTimeout> | null = null;
  private acceptHandled = false;
  private isCaller = false;
  private iceQueue: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private cleaned = false;
  private connectWatchdog: ReturnType<typeof setTimeout> | null = null;

  private startConnectWatchdog() {
    if (this.connectWatchdog) return;
    // If media doesn't connect within 25s of negotiation, surface a clear failure
    this.connectWatchdog = setTimeout(() => {
      if (this.cleaned) return;
      if (this.pc.connectionState !== 'connected') {
        console.warn('WebRTC did not connect in time; state:', this.pc.connectionState);
        this.setPhase('failed');
        this.socket.emit('call:end', { roomId: this.roomId });
        this.cleanup();
      }
    }, 25000);
  }

  private clearConnectWatchdog() {
    if (this.connectWatchdog) {
      clearTimeout(this.connectWatchdog);
      this.connectWatchdog = null;
    }
  }

  private onOffer = async ({ roomId: rid, offer }: { roomId: string; offer: RTCSessionDescriptionInit }) => {
    if (rid !== this.roomId || !offer || this.cleaned) return;
    try {
      await this.pc.setRemoteDescription(offer);
      this.remoteSet = true;
      await this.flushIceQueue();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.socket.emit('webrtc:answer', { roomId: this.roomId, answer });
      this.setPhase('connecting');
      this.startConnectWatchdog();
    } catch (err) {
      console.error('handle offer failed:', err);
      this.setPhase('failed');
      this.cleanup();
    }
  };

  private onAnswer = async ({ roomId: rid, answer }: { roomId: string; answer: RTCSessionDescriptionInit }) => {
    if (rid !== this.roomId || !answer || this.cleaned) return;
    try {
      await this.pc.setRemoteDescription(answer);
      this.remoteSet = true;
      await this.flushIceQueue();
      this.setPhase('connecting');
      this.startConnectWatchdog();
    } catch (err) {
      console.error('handle answer failed:', err);
      this.setPhase('failed');
      this.cleanup();
    }
  };

  private onIce = async ({ roomId: rid, candidate }: { roomId: string; candidate: RTCIceCandidateInit }) => {
    if (rid !== this.roomId || !candidate || this.cleaned) return;
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

  // Bound at construction so it catches call:accepted even if the owner
  // accepts before waitUntilAccepted() attaches (fast-answer race).
  private onCallAccepted = async ({ roomId: rid }: { roomId?: string } = {}) => {
    // Only the caller creates the offer; the owner sends the accept and answers.
    if (!this.isCaller) return;
    if (rid && rid !== this.roomId) return;
    if (this.acceptHandled || this.cleaned) return;
    this.acceptHandled = true;
    if (this.acceptTimeout) {
      clearTimeout(this.acceptTimeout);
      this.acceptTimeout = null;
    }
    try {
      const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
      await this.pc.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', { roomId: this.roomId, offer });
      this.setPhase('connecting');
      this.startConnectWatchdog();
      this.acceptResolve?.();
    } catch (err) {
      this.cleanup();
      this.setPhase('failed');
      this.acceptReject?.(err as Error);
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

  private constructor(socket: Socket, roomId: string, iceServers: RTCIceServer[]) {
    this.socket = socket;
    this.roomId = roomId;
    this.pc = new RTCPeerConnection({ iceServers });
    this.setupPeer();
    this.bindSocket();
  }

  static async beginOutgoing(roomId: string): Promise<VoiceCallSession> {
    const socket = getSocket();
    if (!socket.connected) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Could not connect to call server')), 10000);
        socket.once('connect', () => {
          clearTimeout(t);
          resolve();
        });
        socket.connect();
      });
    }

    const iceServers = await loadIceServers();
    const session = new VoiceCallSession(socket, roomId, iceServers);
    session.isCaller = true;
    try {
      await session.initLocalAudio();
    } catch (err) {
      session.cleanup();
      throw micError(err);
    }

    const ack = await joinRoom(socket, roomId);
    if (!ack.ok) {
      session.cleanup();
      throw new Error(joinErrorMessage(ack));
    }

    session.setPhase('ringing');
    return session;
  }

  waitUntilAccepted(timeoutMs = 55_000): Promise<void> {
    if (this.acceptPromise) return this.acceptPromise;

    this.acceptPromise = new Promise<void>((resolve, reject) => {
      // Owner may have accepted before we got here (fast-answer / late join).
      if (this.acceptHandled) {
        resolve();
        return;
      }
      this.acceptResolve = resolve;
      this.acceptReject = reject;
      this.acceptTimeout = setTimeout(() => {
        if (this.acceptHandled) return;
        this.socket.emit('call:end', { roomId: this.roomId });
        this.cleanup();
        this.setPhase('failed');
        reject(new Error('Owner did not answer in time'));
      }, timeoutMs);
    });

    return this.acceptPromise;
  }

  static async startIncoming(roomId: string): Promise<VoiceCallSession> {
    const socket = getSocket();
    if (!socket.connected) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Could not connect to call server')), 10000);
        socket.once('connect', () => {
          clearTimeout(t);
          resolve();
        });
        socket.connect();
      });
    }

    const iceServers = await loadIceServers();
    const session = new VoiceCallSession(socket, roomId, iceServers);
    try {
      await session.initLocalAudio();
    } catch (err) {
      session.cleanup();
      throw micError(err);
    }

    const ack = await joinRoom(socket, roomId);
    if (!ack.ok) {
      session.cleanup();
      throw new Error(joinErrorMessage(ack));
    }

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
      if (event.candidate && !this.cleaned) {
        this.socket.emit('webrtc:ice', { roomId: this.roomId, candidate: event.candidate });
      }
    };

    this.pc.onicegatheringstatechange = () => {
      console.log('[call] ICE gathering:', this.pc.iceGatheringState);
    };

    this.pc.onconnectionstatechange = () => {
      if (this.cleaned) return;
      const state = this.pc.connectionState;
      console.log('[call] connectionState:', state);
      if (state === 'connected') {
        this.clearConnectWatchdog();
        this.setPhase('active');
      } else if (state === 'failed') {
        this.clearConnectWatchdog();
        this.setPhase('failed');
        this.cleanup();
      } else if (state === 'closed') {
        this.clearConnectWatchdog();
        this.setPhase('ended');
        this.cleanup();
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.cleaned) return;
      const state = this.pc.iceConnectionState;
      console.log('[call] iceConnectionState:', state);
      if (state === 'connected' || state === 'completed') {
        this.clearConnectWatchdog();
        this.setPhase('active');
      } else if (state === 'failed') {
        // Try an ICE restart once before giving up
        try {
          this.pc.restartIce?.();
        } catch {
          // ignore
        }
      }
    };
  }

  private onReconnect = () => {
    // Render's polling transport can drop and reconnect mid-call.
    // Rejoin the voice room so signaling keeps flowing.
    if (this.cleaned) return;
    console.log('[call] socket reconnected — rejoining room', this.roomId);
    this.socket.emit('call:join', { roomId: this.roomId }, () => {});
  };

  private bindSocket() {
    this.socket.on('webrtc:offer', this.onOffer);
    this.socket.on('webrtc:answer', this.onAnswer);
    this.socket.on('webrtc:ice', this.onIce);
    this.socket.on('call:accepted', this.onCallAccepted);
    this.socket.on('call:declined', this.onDeclined);
    this.socket.on('call:ended', this.onEnded);
    this.socket.io.on('reconnect', this.onReconnect);
  }

  end() {
    if (!this.cleaned) {
      this.socket.emit('call:end', { roomId: this.roomId });
    }
    this.cleanup();
    this.setPhase('ended');
  }

  private cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    this.clearConnectWatchdog();
    if (this.acceptTimeout) {
      clearTimeout(this.acceptTimeout);
      this.acceptTimeout = null;
    }
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    try {
      if (this.pc.connectionState !== 'closed') {
        this.pc.close();
      }
    } catch {
      // ignore
    }
    this.socket.off('webrtc:offer', this.onOffer);
    this.socket.off('webrtc:answer', this.onAnswer);
    this.socket.off('webrtc:ice', this.onIce);
    this.socket.off('call:accepted', this.onCallAccepted);
    this.socket.off('call:declined', this.onDeclined);
    this.socket.off('call:ended', this.onEnded);
    this.socket.io.off('reconnect', this.onReconnect);
  }
}

export function registerOwnerSocket(ownerId: string) {
  registeredOwnerId = ownerId;
  const socket = getSocket();
  if (socket.connected) {
    socket.emit('owner:register', { ownerId });
  } else {
    socket.connect();
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
