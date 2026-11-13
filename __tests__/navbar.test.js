import { Platform } from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import { hideNavBar, showNavBar } from '../src/utils/navBar';

// The Android navigation bar helpers: they only act on Android and never throw.
describe('hiding the system navigation bar', () => {
  const OS = Platform.OS;
  afterEach(() => {
    Platform.OS = OS;
    jest.clearAllMocks();
  });

  test('on Android it asks the edge-to-edge bars to hide, then show again', async () => {
    Platform.OS = 'android';
    await expect(hideNavBar()).resolves.toBe(true);
    expect(SystemBars.setHidden).toHaveBeenLastCalledWith({ navigationBar: true });
    await expect(showNavBar()).resolves.toBe(true);
    expect(SystemBars.setHidden).toHaveBeenLastCalledWith({ navigationBar: false });
  });

  test('elsewhere it does nothing', async () => {
    Platform.OS = 'ios';
    await expect(hideNavBar()).resolves.toBe(false);
    expect(SystemBars.setHidden).not.toHaveBeenCalled();
  });

  test('a throw from the activity going away is swallowed, not thrown', async () => {
    Platform.OS = 'android';
    SystemBars.setHidden.mockImplementationOnce(() => {
      throw new Error('activity is gone');
    });
    await expect(hideNavBar()).resolves.toBe(false);
  });
});
