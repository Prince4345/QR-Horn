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

/** Resolve once the socket is truly connected (handles Render cold starts). */
function ensureConnected(socket: Socket, timeoutMs = 20000): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off('connect', onConnect);
      reject(new Error('Could not connect to call server'));
    }, timeoutMs);
    const onConnect = () => {
      clearTimeout(t);
      socket.off('connect', onConnect);
      resolve();
    };
    socket.on('connect', onConnect);
    socket.connect();
  });
}

type CallRole = 'caller' | 'owner';

function joinOnce(socket: Socket, roomId: string, role: CallRole, timeoutMs: number): Promise<JoinAck> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Could not join call room'));
    }, timeoutMs);
    socket.emit('call:join', { roomId, role }, (res: JoinAck) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(res ?? { ok: false, reason: 'not_found' });
    });
  });
}

async function joinRoom(socket: Socket, roomId: string, role: CallRole): Promise<JoinAck> {
  await ensureConnected(socket);
  try {
    return await joinOnce(socket, roomId, role, 12000);
  } catch {
    // Ack can be lost if the socket reconnected mid-flight — retry once.
    await ensureConnected(socket);
    return joinOnce(socket, roomId, role, 12000);
  }
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

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function advanceCallPhase(current: CallPhase, next: CallPhase): CallPhase {
  if (current === 'active' && (next === 'connecting' || next === 'ringing')) return current;
  return next;
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

/** Notify server the owner accepted. Fire-and-forget with a short retry — never
 *  block the call on a socket ack (acks are unreliable on mobile polling). */
async function notifyCallAccept(socket: Socket, roomId: string): Promise<void> {
  await ensureConnected(socket);
  socket.emit('call:accept', { roomId });
  // One quick retry in case the first emit landed during a reconnect flap
  await new Promise((r) => setTimeout(r, 400));
  socket.emit('call:accept', { roomId });
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
  private resyncInterval: ReturnType<typeof setInterval> | null = null;
  private audioReady = false;
  private pendingOffer: RTCSessionDescriptionInit | null = null;

  private startSignalResync() {
    if (this.resyncInterval || this.cleaned) return;
    void this.requestSignalReplay();
    this.resyncInterval = setInterval(() => {
      if (this.cleaned || this.pc.connectionState === 'connected') {
        this.stopSignalResync();
        return;
      }
      void this.requestSignalReplay();
    }, 3000);
  }

  private stopSignalResync() {
    if (this.resyncInterval) {
      clearInterval(this.resyncInterval);
      this.resyncInterval = null;
    }
  }

  private startConnectWatchdog() {
    if (this.connectWatchdog) return;
    this.startSignalResync();
    this.connectWatchdog = setTimeout(() => {
      if (this.cleaned || this.pc.connectionState === 'connected') return;
      console.warn(
        '[call] not connected after 12s — signaling:',
        this.pc.signalingState,
        'connection:',
        this.pc.connectionState,
        'remoteSet:',
        this.remoteSet
      );
      if (this.isCaller) {
        if (!this.remoteSet) {
          void this.resendOffer();
        } else {
          void this.restartConnection();
        }
      } else if (!this.remoteSet) {
        void this.requestSignalReplay();
      }
      this.connectWatchdog = setTimeout(() => {
        if (this.cleaned) return;
        if (this.pc.connectionState !== 'connected') {
          console.warn('[call] WebRTC did not connect in time; state:', this.pc.connectionState);
          this.setPhase('failed');
          this.socket.emit('call:end', { roomId: this.roomId });
          this.cleanup();
        }
      }, 18000);
    }, 12000);
  }

  /** Caller: rebroadcast the current offer or create one if missing. */
  private async resendOffer() {
    if (this.cleaned || !this.isCaller) return;
    try {
      await this.ensureSenderTrack();
      if (this.pc.signalingState === 'have-local-offer' && this.pc.localDescription) {
        const offer = {
          type: this.pc.localDescription.type,
          sdp: this.pc.localDescription.sdp,
        } as RTCSessionDescriptionInit;
        this.socket.emit('webrtc:offer', { roomId: this.roomId, offer });
        console.log('[call] re-broadcast offer (no answer yet)');
        void this.requestSignalReplay();
        return;
      }
      const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
      await this.pc.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', { roomId: this.roomId, offer });
      console.log('[call] re-sent offer (no answer yet)');
      void this.requestSignalReplay();
    } catch (err) {
      console.warn('[call] resend offer failed:', err);
    }
  }

  /** Owner: ask the server to replay buffered caller signals (offer + ICE). */
  private requestSignalReplay(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.emit(
        'call:resync',
        { roomId: this.roomId, role: this.isCaller ? 'caller' : 'owner' },
        () => resolve()
      );
      setTimeout(resolve, 2000);
    });
  }

  /** Caller-side full retry: new offer with fresh ICE credentials. */
  private async restartConnection() {
    if (this.cleaned || !this.isCaller) return;
    try {
      await this.ensureSenderTrack();
      const offer = await this.pc.createOffer({ iceRestart: true, offerToReceiveAudio: true });
      await this.pc.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', { roomId: this.roomId, offer });
    } catch (err) {
      console.warn('[call] ICE restart failed:', err);
    }
  }

  private clearConnectWatchdog() {
    if (this.connectWatchdog) {
      clearTimeout(this.connectWatchdog);
      this.connectWatchdog = null;
    }
  }

  private lastOfferSdp: string | null = null;
  private lastAnswerSdp: string | null = null;

  private onOffer = async ({ roomId: rid, offer }: { roomId: string; offer: RTCSessionDescriptionInit }) => {
    if (rid !== this.roomId || !offer || this.cleaned) return;
    // The caller creates offers; it must never apply one (its own, replayed).
    if (this.isCaller) return;
    // Ignore exact duplicates only after remote description is applied.
    if (offer.sdp && offer.sdp === this.lastOfferSdp && this.remoteSet) return;
    if (!this.audioReady) {
      this.pendingOffer = {
        type: offer.type ?? 'offer',
        sdp: offer.sdp,
      };
      console.log('[call] queued offer until mic is ready');
      return;
    }
    await this.processOffer(offer);
  };

  private async processOffer(offer: RTCSessionDescriptionInit) {
    if (this.cleaned || this.isCaller) return;
    try {
      const desc: RTCSessionDescriptionInit = {
        type: offer.type ?? 'offer',
        sdp: offer.sdp,
      };
      console.log('[call] applying remote offer, signaling:', this.pc.signalingState);
      await this.pc.setRemoteDescription(desc);
      this.lastOfferSdp = offer.sdp ?? null;
      this.remoteSet = true;
      await this.flushIceQueue();
      await this.ensureSenderTrack();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      const payload = {
        type: answer.type,
        sdp: answer.sdp,
      } as RTCSessionDescriptionInit;
      this.socket.emit('webrtc:answer', { roomId: this.roomId, answer: payload });
      console.log('[call] sent answer, signaling:', this.pc.signalingState);
      this.setPhase('connecting');
      this.startConnectWatchdog();
    } catch (err) {
      console.error('handle offer failed:', err);
      this.setPhase('failed');
    }
  }

  private onAnswer = async ({ roomId: rid, answer }: { roomId: string; answer: RTCSessionDescriptionInit }) => {
    if (rid !== this.roomId || !answer || this.cleaned) return;
    // The owner creates answers; it must never apply one (its own, replayed).
    if (!this.isCaller) return;
    // Only valid while we have a local offer outstanding; duplicates would
    // throw InvalidStateError and previously tore the whole call down.
    if (this.pc.signalingState !== 'have-local-offer') return;
    if (answer.sdp && answer.sdp === this.lastAnswerSdp && this.remoteSet) return;
    try {
      const desc: RTCSessionDescriptionInit = {
        type: answer.type ?? 'answer',
        sdp: answer.sdp,
      };
      console.log('[call] applying remote answer, signaling:', this.pc.signalingState);
      await this.pc.setRemoteDescription(desc);
      this.lastAnswerSdp = answer.sdp ?? null;
      this.remoteSet = true;
      await this.flushIceQueue();
      this.setPhase('connecting');
      this.startConnectWatchdog();
    } catch (err) {
      console.error('handle answer failed:', err);
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
      await this.ensureSenderTrack();
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
    console.log('[call] ICE servers:', iceServers.map((s) => s.urls));
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

    const ack = await joinRoom(socket, roomId, 'caller');
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

    // Join the voice room FIRST so we receive the caller's offer immediately.
    const ack = await joinRoom(socket, roomId, 'owner');
    if (!ack.ok) {
      session.cleanup();
      throw new Error(joinErrorMessage(ack));
    }

    await notifyCallAccept(socket, roomId);
    await session.requestSignalReplay();

    try {
      await session.initLocalAudio();
      session.audioReady = true;
      if (session.pendingOffer) {
        const offer = session.pendingOffer;
        session.pendingOffer = null;
        await session.processOffer(offer);
      }
    } catch (err) {
      session.cleanup();
      throw micError(err);
    }

    session.setPhase('connecting');
    session.startConnectWatchdog();
    return session;
  }

  onPhase(cb: (phase: CallPhase) => void) {
    this.onPhaseChange = cb;
  }

  onRemote(cb: (stream: MediaStream) => void) {
    this.onRemoteStream = cb;
  }

  /** Mute/unmute the local microphone. Returns the new muted state. */
  setMuted(muted: boolean): boolean {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    return muted;
  }

  isMuted(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    return track ? !track.enabled : false;
  }

  private setPhase(phase: CallPhase) {
    this.onPhaseChange?.(phase);
  }

  private async ensureSenderTrack(): Promise<void> {
    let track = this.localStream?.getAudioTracks()[0];
    if (track?.readyState === 'live') {
      track.enabled = true;
      console.log('[call] local mic live, enabled:', track.enabled);
      return;
    }

    console.warn('[call] local mic not live — re-acquiring before SDP');
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: false,
    });
    track = this.localStream.getAudioTracks()[0];
    track.enabled = true;

    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (sender) {
      await sender.replaceTrack(track);
    } else {
      this.pc.addTrack(track, this.localStream);
    }
    console.log('[call] local mic re-acquired, state:', track.readyState);
  }

  private async initLocalAudio() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: false,
    });
    for (const track of this.localStream.getTracks()) {
      track.enabled = true;
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
        this.socket.emit('webrtc:ice', {
          roomId: this.roomId,
          candidate: event.candidate,
          role: this.isCaller ? 'caller' : 'owner',
        });
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
        this.stopSignalResync();
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
        this.stopSignalResync();
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
    if (this.cleaned) return;
    console.log('[call] socket reconnected — rejoining room', this.roomId);
    this.socket.emit(
      'call:join',
      { roomId: this.roomId, role: this.isCaller ? 'caller' : 'owner' },
      () => {
        void this.requestSignalReplay();
      }
    );
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
    this.stopSignalResync();
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

export function declineIncomingCall(roomId: string): Promise<boolean> {
  getSocket().emit('call:decline', { roomId });
  return fetch(`${getApiBase()}/api/calls/${encodeURIComponent(roomId)}/decline`, {
    method: 'POST',
  })
    .then((res) => res.json().then((body: { success?: boolean }) => body.success === true))
    .catch(() => false);
}

export type CallLifecycleEvent = { roomId: string; type: 'accepted' | 'declined' | 'ended' };

/**
 * Cross-device call state (accept/decline/end), broadcast to every device
 * registered as this owner — not scoped to a single VoiceCallSession. Lets a
 * ringing device learn the call was handled (or dropped) on another device,
 * even if it never joined the call's own signaling room.
 */
export function subscribeCallLifecycle(cb: (evt: CallLifecycleEvent) => void) {
  const socket = getSocket();
  const make = (type: CallLifecycleEvent['type']) => (p: { roomId?: string } = {}) => {
    if (p.roomId) cb({ roomId: p.roomId, type });
  };
  const onAccepted = make('accepted');
  const onDeclined = make('declined');
  const onEnded = make('ended');
  socket.on('call:accepted', onAccepted);
  socket.on('call:declined', onDeclined);
  socket.on('call:ended', onEnded);
  return () => {
    socket.off('call:accepted', onAccepted);
    socket.off('call:declined', onDeclined);
    socket.off('call:ended', onEnded);
  };
}
