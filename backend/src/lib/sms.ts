import { prisma } from './prisma.js';
import { formatE164 } from './phone.js';

const REASON_TITLES: Record<string, string> = {
  move: 'Please move your vehicle',
  lights: 'Lights are ON',
  parking: 'Wrong parking',
  emergency: 'Emergency contact',
  other: 'Someone needs to reach you',
  call: 'Someone is trying to call you',
};

export function isSmsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

export async function sendSmsToOwner(
  ownerId: string,
  payload: { reason: string; vehicleName: string; vehicleNumber: string; theftMode: boolean }
): Promise<boolean> {
  if (!isSmsConfigured()) return false;

  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    select: { phone: true },
  });

  if (!owner?.phone?.trim()) {
    console.warn(`No phone number for owner ${ownerId} — SMS skipped`);
    return false;
  }

  const to = formatE164(owner.phone);
  if (!to) {
    console.warn(`Invalid owner phone for ${ownerId} — SMS skipped`);
    return false;
  }

  const reason = REASON_TITLES[payload.reason] ?? payload.reason;
  const prefix = payload.theftMode ? 'QRHorn THEFT ALERT' : 'QRHorn';
  const body = `${prefix}: ${payload.vehicleName} (${payload.vehicleNumber}) — ${reason}`;

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_PHONE_NUMBER!;

  const params = new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  });

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Twilio SMS failed:', err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Twilio SMS error:', err);
    return false;
  }
}
