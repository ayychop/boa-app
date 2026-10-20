// One place for the copy shown under a station while it's the current one.
export function describePlayback(status, trackTitle) {
  switch (status) {
    case 'loading':
      return 'Tuning in…';
    case 'playing':
      return trackTitle || 'Live now';
    case 'paused':
      return trackTitle ? `Paused · ${trackTitle}` : 'Paused';
    case 'error':
      return "This stream isn't responding. Tap to retry.";
    default:
      return null;
  }
}
