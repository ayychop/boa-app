import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Dimensions } from 'react-native';
import App from '../App';

export const PORTRAIT = { width: 412, height: 915 };
// A folded phone on its side.
export const LANDSCAPE = { width: 915, height: 412 };

/** Resizes the window the way rotating the phone does. */
export async function setWindow({ width, height }) {
  await act(async () => {
    const size = { width, height, scale: 2.625, fontScale: 1 };
    Dimensions.set({ window: size, screen: size });
  });
  current = { width, height };
  await measureRadio();
}

/** Moves the clock on, flushing the renders and effects it causes. */
export async function advance(ms) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/**
 * Captures AppState listeners so a test can lock and unlock the phone, and
 * records console errors so a render loop or crash fails the test.
 */
export function instrument() {
  const listeners = new Set();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
    if (type === 'change') listeners.add(fn);
    return { remove: () => listeners.delete(fn) };
  });
  const errors = [];
  jest.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.map(String).join(' ')));
  const setState = async (next) => {
    await act(async () => {
      AppState.currentState = next;
      listeners.forEach((fn) => fn(next));
    });
  };
  // Locking: the screen turns off and the app goes to the background
  // (inactive, briefly, on some phones). Unlocking: the reverse.
  const screenEvents = require('../modules/boa-screen');
  const lock = async (next = 'background') => {
    await act(async () => screenEvents.__emit('off'));
    await setState(next);
  };
  const unlock = async () => {
    await act(async () => screenEvents.__emit('on'));
    await setState('active');
  };
  return { errors, setState, lock, unlock };
}

let current = PORTRAIT;

/** Boots the whole app (boot loader, then the vibe check), first run. */
export async function bootApp() {
  await AsyncStorage.clear();
  await render(<App />);
  // The boot loader hands over on its own failsafe timer.
  await advance(4000);
  return screen.findByText('Get started');
}

/** Boots straight into the main tabs. */
export async function bootIntoTabs(user) {
  await bootApp();
  await user.press(screen.getByText('Get started'));
  await advance(1000);
  await screen.findByText('Trending on BOA Radio');
}

/**
 * The test renderer never lays anything out, so Radio's stage (sized from
 * its own onLayout) gets the measurement a phone would send: the window
 * less the header and genre row.
 */
async function measureRadio() {
  let stage = null;
  try {
    stage = screen.queryByTestId('radio-stage');
  } catch {
    return; // nothing rendered yet
  }
  if (!stage) return;
  const short = current.height < 500;
  await fireEvent(stage, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: current.width, height: current.height - (short ? 50 : 110) } },
  });
  await advance(100);
}

export async function openTab(user, name) {
  await user.press(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  await advance(800);
  if (name === 'Radio') await measureRadio();
}
