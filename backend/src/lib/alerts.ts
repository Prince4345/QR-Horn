import { sendPushToOwner } from './push.js';
import { sendSmsToOwner } from './sms.js';

export interface OwnerAlertPayload {
  reason: string;
  vehicleName: string;
  vehicleNumber: string;
  theftMode: boolean;
  kind?: 'notify' | 'call';
  roomId?: string;
}

export interface OwnerAlertResult {
  pushDelivered: boolean;
  smsDelivered: boolean;
  alertDelivered: boolean;
}

export async function sendOwnerAlert(
  ownerId: string,
  payload: OwnerAlertPayload
): Promise<OwnerAlertResult> {
  const pushDelivered = await sendPushToOwner(ownerId, payload);
  const smsDelivered = await sendSmsToOwner(ownerId, payload);

  return {
    pushDelivered,
    smsDelivered,
    alertDelivered: pushDelivered || smsDelivered,
  };
}
