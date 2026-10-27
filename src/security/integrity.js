import { Platform } from 'react-native';

// Runtime tripwires: is this phone rooted, hooked, an emulator, or being
// debugged? For now they only report (console.warn); nothing is blocked
// and nothing crashes. A kill switch can act on checkDevice()'s result
// later. Each check is guarded on its own, so one failing native call never
// takes the others (or the app) down. See SECURITY.md.
//
// Root and hook detection come from jail-monkey (a native module, phones
// only); the emulator check from expo-device.

/** How seriously to take each finding. */
export const SEVERITY = {
  rooted: 'high', // root / jailbreak: our sandbox and keystore can't be trusted
  hooked: 'high', // Frida, Substrate or Xposed hooks in the process
  emulator: 'medium', // not a real phone
  debugger: 'medium', // a debugger attached to a release build
  mockLocation: 'low', // location can be faked (also on for some dev setups)
  adb: 'low', // USB debugging on; common on testers' phones
  devSettings: 'low', // Developer options on; common on testers' phones
  externalStorage: 'low', // app installed on SD card (Android)
};

const safe = async (fn) => {
  try {
    return !!(await fn());
  } catch {
    return false;
  }
};

/**
 * Every check, as booleans, plus `threats`: the ones that fired, worst
 * first. Never throws. On the web there's nothing to check.
 */
export async function checkDevice() {
  if (Platform.OS === 'web') return { threats: [] };
  // Loaded here, not at the top: the web build has no native module.
  const JailMonkey = require('jail-monkey').default;
  const Device = require('expo-device');
  const result = {
    rooted: await safe(() => JailMonkey.isJailBroken()),
    hooked: await safe(() => JailMonkey.hookDetected()),
    emulator: Device.isDevice === false,
    debugger: !__DEV__ && (await safe(() => JailMonkey.isDebuggedMode())),
    mockLocation: await safe(() => JailMonkey.canMockLocation()),
    adb: Platform.OS === 'android' && (await safe(() => JailMonkey.AdbEnabled())),
    devSettings: Platform.OS === 'android' && (await safe(() => JailMonkey.isDevelopmentSettingsMode())),
    externalStorage: Platform.OS === 'android' && (await safe(() => JailMonkey.isOnExternalStorage())),
  };
  const order = { high: 0, medium: 1, low: 2 };
  result.threats = Object.keys(SEVERITY)
    .filter((k) => result[k])
    .sort((a, b) => order[SEVERITY[a]] - order[SEVERITY[b]]);
  return result;
}

/** Runs the checks once and logs what fired. Report only, for now. */
export async function reportDeviceThreats() {
  const result = await checkDevice();
  if (result.threats.length) {
    console.warn(
      '[security] device integrity',
      result.threats.map((t) => `${t} (${SEVERITY[t]})`).join(', '),
    );
  }
  return result;
}
