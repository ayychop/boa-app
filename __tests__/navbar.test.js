import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { hideNavBar, showNavBar } from '../src/utils/navBar';

// The Android navigation bar helpers: they only act on Android and never throw.
describe('hiding the system navigation bar', () => {
  const OS = Platform.OS;
  afterEach(() => {
    Platform.OS = OS;
    jest.clearAllMocks();
  });

  test('on Android it asks Expo to hide it, then show it again', async () => {
    Platform.OS = 'android';
    await expect(hideNavBar()).resolves.toBe(true);
    expect(NavigationBar.setVisibilityAsync).toHaveBeenLastCalledWith('hidden');
    await expect(showNavBar()).resolves.toBe(true);
    expect(NavigationBar.setVisibilityAsync).toHaveBeenLastCalledWith('visible');
  });

  test('elsewhere it does nothing', async () => {
    Platform.OS = 'ios';
    await expect(hideNavBar()).resolves.toBe(false);
    expect(NavigationBar.setVisibilityAsync).not.toHaveBeenCalled();
  });

  test('a rejection from the activity going away is swallowed, not thrown', async () => {
    Platform.OS = 'android';
    NavigationBar.setVisibilityAsync.mockRejectedValueOnce(new Error('activity is gone'));
    await expect(hideNavBar()).resolves.toBe(false);
  });
});
