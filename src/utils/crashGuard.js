import { Alert } from 'react-native';

// One alert at a time: an error in a loop shouldn't stack up dialogs.
const QUIET_MS = 4000;

/**
 * In a release build an error thrown from a button, a timer or a listener
 * shuts the app. This catches those instead and says so in an alert; the
 * screen stays where it was. Errors while drawing are caught by the error
 * boundaries first. In development the red screen still shows.
 */
export function installCrashGuard(errorUtils = global.ErrorUtils, dev = __DEV__) {
  if (!errorUtils?.setGlobalHandler || dev) return false;
  const original = errorUtils.getGlobalHandler?.();
  let last = 0;
  errorUtils.setGlobalHandler((error) => {
    try {
      console.warn('[app] caught an error:', error?.message ?? error);
      const now = Date.now();
      if (now - last < QUIET_MS) return;
      last = now;
      Alert.alert('Something went wrong', "That didn't work. Please try again.");
    } catch (e) {
      original?.(error, false);
    }
  });
  return true;
}
