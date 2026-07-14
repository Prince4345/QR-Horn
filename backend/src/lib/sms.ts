import { prisma } from './prisma.js';
import { formatE164, formatIndianMobile } from './phone.js';

const REASON_TITLES: Record<string, string> = {
  move: 'Please move your vehicle',
  lights: 'Lights are ON',
  parking: 'Wrong parking',
  emergency: 'Emergency contact',
  other: 'Someone needs to reach you',
  call: 'Someone is trying to call you',
};

function sanitizeDltPart(value: string): string {
  return value.replace(/\|/g, ' ').trim();
}

function buildAlertBody(payload: {
  reason: string;
  vehicleName: string;
  vehicleNumber: string;
  theftMode: boolean;
}): string {
  const reason = REASON_TITLES[payload.reason] ?? payload.reason;
  const prefix = payload.theftMode ? 'QRHorn THEFT ALERT' : 'QRHorn';
  return `${prefix}: ${payload.vehicleName} (${payload.vehicleNumber}) — ${reason}`;
}

/** DLT template vars for: QRHorn: {#var#} ({#var#}) - {#var#}. */
function buildDltVariables(payload: {
  reason: string;
  vehicleName: string;
  vehicleNumber: string;
  theftMode: boolean;
}): string {
  const reason = REASON_TITLES[payload.reason] ?? payload.reason;
  const line = payload.theftMode ? `THEFT - ${reason}` : reason;
  return [
    sanitizeDltPart(payload.vehicleName),
    sanitizeDltPart(payload.vehicleNumber),
    sanitizeDltPart(line),
  ].join('|');
}

function fast2SmsRoute(): string {
  return process.env.FAST2SMS_ROUTE?.trim().toLowerCase() || 'dlt';
}

export function isFast2SmsConfigured(): boolean {
  const apiKey = process.env.FAST2SMS_API_KEY?.trim();
  if (!apiKey) return false;

  if (fast2SmsRoute() === 'dlt') {
    return !!(
      process.env.FAST2SMS_SENDER_ID?.trim() &&
      process.env.FAST2SMS_MESSAGE_ID?.trim()
    );
  }

  return true;
}

export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

export function isSmsConfigured(): boolean {
  return isFast2SmsConfigured() || isTwilioConfigured();
}

async function sendViaFast2Sms(
  to: string,
  payload: { reason: string; vehicleName: string; vehicleNumber: string; theftMode: boolean }
): Promise<boolean> {
  const apiKey = process.env.FAST2SMS_API_KEY!.trim();
  const route = fast2SmsRoute();

  const body =
    route === 'dlt'
      ? {
          route: 'dlt',
          sender_id: process.env.FAST2SMS_SENDER_ID!.trim(),
          message: process.env.FAST2SMS_MESSAGE_ID!.trim(),
          variables_values: buildDltVariables(payload),
          numbers: to,
        }
      : {
          route: 'q',
          message: buildAlertBody(payload),
          numbers: to,
          language: 'english',
        };

  try {
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => null)) as {
      return?: boolean;
      message?: string | string[];
      status_code?: number;
    } | null;

    if (!res.ok || data?.return === false) {
      const detail = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
      console.error('Fast2SMS failed:', detail ?? res.status);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Fast2SMS error:', err);
    return false;
  }
}

async function sendViaTwilio(to: string, body: string): Promise<boolean> {
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

  if (isFast2SmsConfigured()) {
    const indian = formatIndianMobile(owner.phone);
    if (!indian) {
      console.warn(`Invalid Indian mobile for owner ${ownerId} — Fast2SMS skipped`);
      return false;
    }
    return sendViaFast2Sms(indian, payload);
  }

  const to = formatE164(owner.phone);
  if (!to) {
    console.warn(`Invalid owner phone for ${ownerId} — SMS skipped`);
    return false;
  }

  return sendViaTwilio(to, buildAlertBody(payload));
}
