import { Router } from 'express';
import { declineCallByRoom } from '../socket.js';

const router = Router();

/**
 * Decline a ringing call by roomId. Intentionally unauthenticated: it's
 * triggered by the "Decline" action on an OS push notification, which can
 * fire while the app/browser is fully closed (a service worker has no access
 * to the signed-in user's bearer token). Knowing the roomId — a random,
 * single-use id delivered only to that owner's own devices — is the only
 * thing required, matching the socket-based decline which has the same
 * trust model.
 */
router.post('/:roomId/decline', (req, res) => {
  const ok = declineCallByRoom(req.params.roomId);
  res.json({ success: ok });
});

export default router;
