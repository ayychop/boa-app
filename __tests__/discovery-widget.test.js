import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';
import * as widget from '../modules/boa-widget';
import { fetchNowPlaying } from '../src/api/nowPlaying';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

let probe;
let opened;
beforeEach(async () => {
  probe = instrument();
  await setWindow(PORTRAIT);
  opened = [];
  // Only the web works by default, as on a phone without the apps.
  jest.spyOn(Linking, 'openURL').mockImplementation(async (url) => {
    opened.push(url);
    if (!/^https:/.test(url)) throw new Error(`No app for ${url}`);
  });
  widget.setStyle.mockClear();
  widget.setNowPlaying.mockClear();
});

afterEach(() => {
  expect(probe.errors).toEqual([]);
  jest.restoreAllMocks();
});

describe('Song info on the Radio player', () => {
  test('with no title from the station: "Tap to Shazam", app first, then the website', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Radio');
    expect(screen.getByText('Song info')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /YouTube Music/ })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Tap to Shazam' }));
    await advance(50);
    expect(opened).toEqual(['shazam://', 'https://www.shazam.com/']);
  });

  test('with a title: Shazam, and a YouTube Music search for artist and song', async () => {
    fetchNowPlaying.mockResolvedValue('Burna Boy - Last Last');
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Radio');
    await advance(100);
    const yt = await screen.findByRole('button', { name: 'Find Last Last by Burna Boy on YouTube Music' });
    await user.press(yt);
    await advance(50);
    expect(opened).toEqual(['youtubemusic://search?q=Burna%20Boy%20Last%20Last', 'https://music.youtube.com/search?q=Burna%20Boy%20Last%20Last']);
    opened.length = 0;
    await user.press(screen.getByRole('button', { name: 'Shazam Last Last' }));
    await advance(50);
    expect(opened[0]).toBe('shazam://');
    fetchNowPlaying.mockResolvedValue(null);
  });

  test('when the app is installed, its link is the only one opened', async () => {
    Linking.openURL.mockImplementation(async (url) => opened.push(url));
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Radio');
    await user.press(screen.getByRole('button', { name: 'Tap to Shazam' }));
    await advance(50);
    expect(opened).toEqual(['shazam://']);
  });
});

describe('home screen widget settings', () => {
  test('colour swatches, the hue slider and the transparency slider reach the widget', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Profile');
    await user.press(screen.getByText('Home screen widget'));
    await advance(400);
    expect(screen.getByTestId('widget-preview')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Widget colour #1E88E5' }));
    expect(widget.setStyle).toHaveBeenLastCalledWith('#1E88E5', 0.55);

    await fireEvent(screen.getByTestId('widget-transparency'), 'valueChange', 80);
    expect(widget.setStyle).toHaveBeenLastCalledWith('#1E88E5', 0.2);
    expect(screen.getByText('80%')).toBeOnTheScreen();
    // The preview's glass shows the same tint at the same opacity.
    expect(screen.getByTestId('widget-preview-glass').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'rgba(30,136,229,0.2)' })]),
    );

    await fireEvent(screen.getByTestId('widget-hue'), 'valueChange', 120);
    const [color] = widget.setStyle.mock.calls.at(-1);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(color).not.toBe('#1E88E5');

    await user.press(screen.getByRole('button', { name: 'Reset to BOA glass' }));
    expect(widget.setStyle).toHaveBeenLastCalledWith('#141416', 0.55);
  });

  test('the widget shows what is playing, and "Paused" when it stops', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    // Home's trending row: a tap plays the station.
    const station = screen.getAllByRole('button', { name: /^Play / })[0];
    const name = station.props.accessibilityLabel.replace(/^Play /, '');
    await user.press(station);
    await advance(200);
    // With the station's id, for its record artwork, and that it's on air.
    expect(widget.setNowPlaying).toHaveBeenLastCalledWith(name, 'Live on BOA Radio', expect.any(String), true);
    await openTab(user, 'Home');
    await user.press(screen.getByRole('button', { name: 'Pause' }));
    await advance(200);
    expect(widget.setNowPlaying).toHaveBeenLastCalledWith(name, 'Paused', expect.any(String), false);
  });
});
