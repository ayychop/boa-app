import { screen, userEvent } from '@testing-library/react-native';
import { AppState, StyleSheet } from 'react-native';
import * as screenEvents from '../modules/boa-screen';
import { SCENES, ZEN_CATEGORIES } from '../src/data/sleep';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

let probe;
beforeEach(async () => {
  probe = instrument();
  await setWindow(PORTRAIT);
  // Each test starts on screen and unlocked, whatever the last one left.
  AppState.currentState = 'active';
  jest.clearAllMocks();
  screenEvents.unlock.mockReset().mockImplementation(async () => true);
});

afterEach(() => {
  expect(probe.errors).toEqual([]);
  jest.restoreAllMocks();
});

const tabLabels = () => screen.getAllByRole('button', { name: /, tab$/ }).map((b) => b.props.accessibilityLabel);

test('the tab bar reads Home, BOA Originals, Radio, Chat, Talent, Zen, Profile', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  expect(tabLabels()).toEqual([
    'Home, tab',
    'BOA Originals, tab',
    'Radio, tab',
    'Chat, tab',
    'Talent, tab',
    'Zen, tab',
    'Profile, tab',
  ]);
  await openTab(user, 'Chat');
  expect(screen.getAllByText('Messages').length).toBeGreaterThan(0);
});

test("Home's buttons sit on a static layer, apart from the moving key art", async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  const backdrop = screen.getByTestId('home-hero-backdrop');
  const ui = screen.getByTestId('home-hero-ui');
  // The art layer takes no touches, and the buttons are not inside it.
  expect(backdrop.props.pointerEvents).toBe('none');
  const trailer = screen.getByText('Watch Trailer');
  expect(backdrop).not.toContainElement(trailer);
  expect(ui).toContainElement(trailer);
  // Nothing between the button and the hero moves (the button's own press
  // feedback aside).
  let node = trailer.parent?.parent;
  while (node && node !== ui.parent) {
    const style = StyleSheet.flatten(node.props?.style) ?? {};
    expect(style.transform ?? []).toEqual([]);
    node = node.parent;
  }
});

test('every kind of sound has a room of its own, and choosing one changes the room with no tint over it', async () => {
  const scenes = ZEN_CATEGORIES.map((k) => k.scene);
  expect(new Set(scenes).size).toBe(ZEN_CATEGORIES.length);
  scenes.forEach((id) => expect(SCENES[id]).toBeDefined());

  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Zen');
  for (const kind of ZEN_CATEGORIES) {
    await user.press(screen.getByRole('button', { name: `Play ${kind.label}` }));
    await advance(1600);
    expect(screen.getByTestId(`zen-scene-${kind.scene}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('zen-tone-wash')).toBeNull();
  }
});

test('locking: the screensaver is opened and put over the lock screen while the screen is off', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Talent');
  await probe.lock();
  await advance(300);
  expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
  expect(screenEvents.showOverLock).toHaveBeenCalled();
});

test('waking over the lock screen asks to unlock first; cancelling stays on Zen, unlocking returns to the tab', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Talent');
  await probe.lock();
  await advance(300);
  await probe.unlock();

  screenEvents.unlock.mockImplementationOnce(async () => false);
  await user.press(screen.getByRole('button', { name: 'Wake Zen controls' }));
  await advance(300);
  expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Wake Zen controls' }));
  await advance(300);
  expect(screenEvents.unlock).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId('zen-screensaver')).toBeNull();
  expect(screen.getByTestId('talent-scroll')).toBeOnTheScreen();
});

test('unlocking with a fingerprint while the screensaver shows goes straight back to the tab', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Radio');
  await probe.lock();
  await advance(300);
  await probe.unlock();
  await advance(100);
  expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
  await probe.emit('unlocked');
  await advance(300);
  expect(screen.queryByTestId('zen-screensaver')).toBeNull();
  expect(screen.getByTestId('radio-stage')).toBeOnTheScreen();
});

test('the BOA Listener card opens sign-in', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Profile');
  await user.press(screen.getByTestId('profile-card'));
  await advance(600);
  expect(screen.getByTestId('hub-welcome')).toBeOnTheScreen();
});
