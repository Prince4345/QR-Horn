import { prisma } from './prisma.js';
import type { VoiceRoom, CallOutcome } from './voiceRooms.js';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** Write the call's outcome + duration into the Call record and activity feed. */
export async function logCallOutcome(room: VoiceRoom, outcome: CallOutcome, durationSec: number) {
  try {
    const description =
      outcome === 'completed'
        ? `Voice call answered — ${formatDuration(durationSec)}`
        : outcome === 'declined'
          ? 'Voice call declined'
          : 'Missed voice call';

    await prisma.activity.create({
      data: { vehicleId: room.vehicleId, type: 'call', description },
    });

    if (room.callId) {
      await prisma.call.update({
        where: { id: room.callId },
        data: { status: outcome === 'completed' ? 'COMPLETED' : 'FAILED' },
      });
    }
  } catch (error) {
    console.error('logCallOutcome failed:', error);
  }
}
