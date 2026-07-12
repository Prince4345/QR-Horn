interface RoomSignals {
  offer?: object;
  answer?: object;
  ice: object[];
}

const signals = new Map<string, RoomSignals>();

function roomSignals(roomId: string): RoomSignals {
  let s = signals.get(roomId);
  if (!s) {
    s = { ice: [] };
    signals.set(roomId, s);
  }
  return s;
}

export function bufferOffer(roomId: string, offer: object) {
  const s = roomSignals(roomId);
  s.offer = offer;
}

export function bufferAnswer(roomId: string, answer: object) {
  const s = roomSignals(roomId);
  s.answer = answer;
}

export function bufferIce(roomId: string, candidate: object) {
  const s = roomSignals(roomId);
  if (s.ice.length < 100) s.ice.push(candidate);
}

export function getSignals(roomId: string) {
  return signals.get(roomId);
}

export function clearSignals(roomId: string) {
  signals.delete(roomId);
}

export function replaySignalsToSocket(
  socket: { emit: (event: string, payload: object) => void },
  roomId: string
) {
  const s = signals.get(roomId);
  if (!s) return;
  if (s.offer) socket.emit('webrtc:offer', { roomId, offer: s.offer });
  if (s.answer) socket.emit('webrtc:answer', { roomId, answer: s.answer });
  for (const candidate of s.ice) {
    socket.emit('webrtc:ice', { roomId, candidate });
  }
}
