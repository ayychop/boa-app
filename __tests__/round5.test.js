import { screen, userEvent, within } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as widget from '../modules/boa-widget';
import * as ambient from '../src/audio/ambient';
import * as engine from '../src/audio/engine';
import { categoryById, soundscapeById } from '../src/data/sleep';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

describe('Zen kinds, the sound picker and the mini player', () => {
  let probe;
  beforeEach(async () => {
    probe = instrument();
    AppState.currentState = 'active';
    await setWindow(PORTRAIT);
    ambient.stop();
    jest.clearAllMocks();
  });
  afterEach(() => {
    expect(probe.errors).toEqual([]);
    jest.restoreAllMocks();
  });

  test('tapping a kind plays its first sound, and the card names what is playing', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Zen');
    expect(screen.getByTestId('soundscape-rain-label')).toHaveTextContent('Rain');
    await user.press(screen.getByRole('button', { name: 'Play Rain' }));
    await advance(200);
    expect(ambient.getState()).toMatchObject({ id: 'rain', status: 'playing' });
    expect(screen.getByTestId('soundscape-rain-label')).toHaveTextContent(soundscapeById('rain').label);

    // The other five are a tap away, and the card follows the choice.
    const picker = screen.getByTestId('zen-sounds-rain');
    expect(picker).toBeOnTheScreen();
    for (const s of categoryById('rain').sounds) expect(screen.getByRole('button', { name: `Choose ${s.label}` })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Choose Thunderstorm' }));
    await advance(200);
    expect(ambient.getState().id).toBe('rain-storm');
    expect(screen.getByTestId('soundscape-rain-label')).toHaveTextContent('Thunderstorm');

    // Pausing and playing the kind again keeps the chosen sound.
    await user.press(screen.getByRole('button', { name: 'Pause Rain' }));
    await user.press(screen.getByRole('button', { name: 'Play Rain' }));
    await advance(200);
    expect(ambient.getState()).toMatchObject({ id: 'rain-storm', status: 'playing' });
  });

  test('a generated sound plays straight from the app, no download', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Zen');
    await user.press(screen.getByRole('button', { name: 'Play Frequencies' }));
    await advance(200);
    await user.press(screen.getByRole('button', { name: 'Choose 528 Hz' }));
    await advance(200);
    expect(ambient.getState()).toMatchObject({ id: '528hz', status: 'playing' });
    const audio = require('expo-audio');
    const player = audio.__players[audio.__players.length - 1];
    expect(player.replace).toHaveBeenLastCalledWith(soundscapeById('528hz').asset);
  });

  test('the mini player shows the Zen sound (not a paused station) with its own pause', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    // Radio on, then paused.
    await user.press(screen.getAllByRole('button', { name: /^Play / })[0]);
    await advance(300);
    await openTab(user, 'Zen');
    await user.press(screen.getByRole('button', { name: 'Play Rain' }));
    await advance(300);
    await openTab(user, 'Talent');

    expect(screen.getByTestId('mini-player-zen')).toBeOnTheScreen();
    const pill = () => within(screen.getByTestId('mini-player-zen'));
    // Rain plays the sound last chosen there (an earlier test may have
    // picked another), so the pill names whichever it is.
    const playing = soundscapeById(ambient.getState().id);
    expect(playing.category).toBe('rain');
    expect(pill().getByText('Rain')).toBeOnTheScreen();
    expect(pill().getByText(`${playing.label} · Zen`)).toBeOnTheScreen();
    expect(pill().queryByText(/Paused/)).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Pause Rain' }));
    await advance(100);
    expect(ambient.getState().status).toBe('paused');
    expect(pill().getByText(`${playing.label} · Paused`)).toBeOnTheScreen();

    // The radio coming back on takes the mini player back.
    await user.press(screen.getByRole('button', { name: 'Play Rain' }));
    await advance(100);
    await openTab(user, 'Home');
    await user.press(screen.getAllByRole('button', { name: /^Play / })[0]);
    await advance(300);
    await openTab(user, 'Talent');
    expect(screen.queryByTestId('mini-player-zen')).toBeNull();
    expect(ambient.getState().status).toBe('paused');
    expect(engine.play).toHaveBeenCalled();
  });

  test("the widget's Glass style can swap sides, Samsung style", async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Profile');
    await user.press(screen.getByText('Home screen widget'));
    await advance(500);
    await user.press(screen.getByTestId('widget-layout-glass'));
    await user.press(screen.getByTestId('widget-flip'));
    expect(widget.setFlipped).toHaveBeenLastCalledWith(true);
    // Only Glass has sides to swap.
    await user.press(screen.getByTestId('widget-layout-record'));
    expect(screen.queryByTestId('widget-flip')).toBeNull();
  });
});

