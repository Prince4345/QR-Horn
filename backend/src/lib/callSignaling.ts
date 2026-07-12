export type SignalRole = 'caller' | 'owner';

interface RoomSignals {
  offer?: object; // from caller
  answer?: object; // from owner
  callerIce: object[];
  ownerIce: object[];
}

const signals = new Map<string, RoomSignals>();

function roomSignals(roomId: string): RoomSignals {
  let s = signals.get(roomId);
  if (!s) {
    s = { callerIce: [], ownerIce: [] };
    signals.set(roomId, s);
  }
  return s;
}

export function bufferOffer(roomId: string, offer: object) {
  roomSignals(roomId).offer = offer;
}

export function bufferAnswer(roomId: string, answer: object) {
  roomSignals(roomId).answer = answer;
}

export function bufferIce(roomId: string, role: SignalRole, candidate: object) {
  const s = roomSignals(roomId);
  const list = role === 'owner' ? s.ownerIce : s.callerIce;
  if (list.length < 100) list.push(candidate);
}

export function clearSignals(roomId: string) {
  signals.delete(roomId);
}

/**
 * Replay only the OTHER side's signals to a (re)joining socket.
 * Sending a peer its own offer/answer back corrupts its RTCPeerConnection.
 */
export function replaySignalsToSocket(
  socket: { emit: (event: string, payload: object) => void },
  roomId: string,
  joinerRole: SignalRole
) {
  const s = signals.get(roomId);
  if (!s) return;

  if (joinerRole === 'owner') {
    if (s.offer) socket.emit('webrtc:offer', { roomId, offer: s.offer });
    for (const candidate of s.callerIce) {
      socket.emit('webrtc:ice', { roomId, candidate });
    }
  } else {
    if (s.answer) socket.emit('webrtc:answer', { roomId, answer: s.answer });
    for (const candidate of s.ownerIce) {
      socket.emit('webrtc:ice', { roomId, candidate });
    }
  }
}
