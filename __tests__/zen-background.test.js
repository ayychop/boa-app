import { screen, userEvent } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as audio from 'expo-audio';
import * as ambient from '../src/audio/ambient';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

let probe;
beforeEach(async () => {
  probe = instrument();
  AppState.currentState = 'active';
  await setWindow(PORTRAIT);
});
afterEach(() => {
  expect(probe.errors).toEqual([]);
  jest.restoreAllMocks();
});

const zenPlayer = () => audio.__players[audio.__players.length - 1];

test('Zen played first (no radio this session) keeps playing with the phone locked', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Zen');
  expect(audio.setAudioModeAsync).not.toHaveBeenCalled();
  await user.press(screen.getByRole('button', { name: 'Play Rain' }));
  await advance(200);

  // Background playback is on before the first sound plays.
  expect(audio.setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
  const player = zenPlayer();
  expect(audio.setAudioModeAsync.mock.invocationCallOrder[0]).toBeLessThan(player.play.mock.invocationCallOrder[0]);

  // On the lock screen like the radio (which also keeps Android's media service running).
  expect(player.setActiveForLockScreen).toHaveBeenCalledWith(
    true,
    expect.objectContaining({ title: 'On the window', artist: 'Rain · BOA Zen' }),
    expect.any(Object),
  );

  // Lock: the screensaver shows, and the sound carries on.
  await probe.lock();
  await advance(1000);
  expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
  expect(player.pause).not.toHaveBeenCalled();
  expect(player.playing).toBe(true);
  expect(ambient.getState().status).toBe('playing');

  // Background (another app), then back: still playing.
  await probe.setState('background');
  await advance(5000);
  await probe.setState('active');
  expect(player.pause).not.toHaveBeenCalled();
  expect(ambient.getState().status).toBe('playing');
});

test('a pause tapped while a sound is still starting wins', async () => {
  const play = ambient.play('ocean');
  ambient.pause();
  await play;
  expect(ambient.getState().status).not.toBe('playing');
});
