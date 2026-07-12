/** In-app WebRTC voice is always available; Twilio is used for SMS only. */
export function isVoiceConfigured(): boolean {
  return true;
}
