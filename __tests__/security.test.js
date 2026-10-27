import fs from 'fs';
import path from 'path';
import { Platform } from 'react-native';

const JailMonkey = require('jail-monkey').default;
const Device = require('expo-device');
const { checkDevice, reportDeviceThreats, SEVERITY } = require('../src/security/integrity');

describe('runtime tripwires', () => {
  const os = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'android';
    Device.isDevice = true;
  });
  afterEach(() => {
    Platform.OS = os;
    jest.restoreAllMocks();
  });

  test('a clean phone has no threats and logs nothing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await reportDeviceThreats()).threats).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  test('root, hooks and an emulator are reported, worst first, and only logged', async () => {
    JailMonkey.isJailBroken.mockReturnValueOnce(true);
    JailMonkey.AdbEnabled.mockReturnValueOnce(true);
    JailMonkey.hookDetected.mockReturnValueOnce(true);
    Device.isDevice = false;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await reportDeviceThreats();
    expect(result.threats).toEqual(['rooted', 'hooked', 'emulator', 'adb']);
    expect(warn).toHaveBeenCalledWith('[security] device integrity', 'rooted (high), hooked (high), emulator (medium), adb (low)');
  });

  test('a native check that throws never takes the others, or the app, down', async () => {
    JailMonkey.isJailBroken.mockImplementationOnce(() => {
      throw new Error('native module missing');
    });
    JailMonkey.isDebuggedMode.mockRejectedValueOnce(new Error('nope'));
    JailMonkey.canMockLocation.mockReturnValueOnce(true);
    await expect(checkDevice()).resolves.toEqual(expect.objectContaining({ rooted: false, mockLocation: true, threats: ['mockLocation'] }));
  });

  test('on the web there is nothing to check', async () => {
    Platform.OS = 'web';
    expect(await checkDevice()).toEqual({ threats: [] });
  });

  test('every check has a severity, and the app runs them at launch', () => {
    expect(Object.values(SEVERITY).every((s) => ['high', 'medium', 'low'].includes(s))).toBe(true);
    const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
    expect(app).toMatch(/reportDeviceThreats\(\)/);
  });
});
