import { openPage } from '../navigation/ref';

// Opens a scheduled call's countdown over whatever is on screen. A link or a
// notification tap can arrive before navigation is ready (a cold start), so
// it tries again for a few seconds rather than being lost.
const RETRY_MS = 400;
const MAX_TRIES = 25;

export function openScheduledCall(roomId, tries = 0) {
  if (!roomId) return false;
  if (openPage('ScheduledCall', { roomId })) return true;
  if (tries < MAX_TRIES) setTimeout(() => openScheduledCall(roomId, tries + 1), RETRY_MS);
  return false;
}
