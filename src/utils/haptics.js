import * as Haptics from 'expo-haptics';

// One haptic per user action, fired with its visual, never the only feedback.
// Wrapped so unsupported devices (most of the web) just stay silent.
const safe = (fn) => () => {
  try {
    fn()?.catch?.(() => {});
  } catch {}
};

export const haptics = {
  /** A value ticks to a new step: tab change, record settling. */
  selection: safe(() => Haptics.selectionAsync()),
  /** Something commits: play / pause. */
  tap: safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
