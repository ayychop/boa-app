import { MAX_RETRIES } from './engine';

// One place for the copy shown under a station while it's the current one.
export function describePlayback(status, trackTitle, retry = 0) {
  switch (status) {
    case 'loading':
      if (!retry) return 'Tuning in…';
      return retry <= MAX_RETRIES ? `Reconnecting… (${retry}/${MAX_RETRIES})` : 'Reconnecting…';
    case 'playing':
      return trackTitle || 'Live Broadcast';
    case 'paused':
      return trackTitle ? `Paused · ${trackTitle}` : 'Paused';
    case 'error':
      return "This stream isn't responding. Tap to retry.";
    default:
      return null;
  }
}
