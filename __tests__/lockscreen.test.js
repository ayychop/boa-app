import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as audio from 'expo-audio';
import { captureRef } from 'react-native-view-shot';
import { File } from 'expo-file-system';

// The real native engine, not the stand-in the app tests use.
const engine = jest.requireActual('../src/audio/engine.native.js');

jest.useFakeTimers();

const station = {
  kind: 'radio',
  id: 'joy',
  name: 'Joy FM',
  streamUrl: 'https://example.com/joy.mp3',
  logo: 'https://example.com/joy.png',
};

const flush = () => act(async () => {});

beforeAll(async () => {
  AppState.currentState = 'active';
  engine.setRemoteControls({ next: jest.fn(), previous: jest.fn() });
  engine.play(station);
  await flush();
  await flush();
});

const player = () => audio.__players[0];

test('playing a station puts it on the lock screen like a music app: title, artist, album, artwork', () => {
  expect(player().setActiveForLockScreen).toHaveBeenCalledWith(
    true,
    { title: 'Joy FM', artist: 'BOA Radio · Live', albumTitle: 'BOA Networks', artworkUrl: station.logo },
    expect.objectContaining({ isLiveStream: true, showNextTrack: true, showPreviousTrack: true }),
  );
});

test('when the stream says what is on, the song becomes the title and the artist leads the subtitle', () => {
  engine.setNowPlaying('joy', 'Burna Boy - Last Last');
  expect(player().updateLockScreenMetadata).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: 'Last Last', artist: 'Burna Boy · Joy FM', albumTitle: 'BOA Networks' }),
  );
  engine.setNowPlaying('joy', 'Morning Drive with Kojo');
  expect(player().updateLockScreenMetadata).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: 'Morning Drive with Kojo', artist: 'Joy FM' }),
  );
});

test('the rendered record replaces the bare logo as the artwork', () => {
  engine.setArtwork('joy', 'file:///cache/record-joy.png');
  expect(player().updateLockScreenMetadata).toHaveBeenLastCalledWith(
    expect.objectContaining({ artworkUrl: 'file:///cache/record-joy.png' }),
  );
});

test('splitTrack reads "Artist - Title" and leaves anything else alone', () => {
  expect(engine.splitTrack('Wizkid - Essence')).toEqual({ artist: 'Wizkid', title: 'Essence' });
  expect(engine.splitTrack('News at Six')).toBeNull();
});

test('fadeOut ramps the volume down, pauses, then restores the volume', async () => {
  player().emit('playbackStatusUpdate', { playing: true, isBuffering: false });
  const done = engine.fadeOut(10000);
  jest.advanceTimersByTime(5000);
  expect(player().volume).toBeCloseTo(0.25, 1);
  expect(player().pause).not.toHaveBeenCalled();
  jest.advanceTimersByTime(5100);
  await done;
  expect(player().pause).toHaveBeenCalled();
  expect(player().volume).toBe(1);
});

test('RecordArtwork draws the record off screen and hands the captured PNG to the engine', async () => {
  const { PlayerProvider, usePlayer } = require('../src/context/PlayerContext');
  const RecordArtwork = require('../src/components/RecordArtwork').default;
  const appEngine = require('../src/audio/engine');
  let api;
  function Grab() {
    api = usePlayer();
    return null;
  }
  const screen = await render(
    <PlayerProvider>
      <Grab />
      <RecordArtwork />
    </PlayerProvider>,
  );
  await act(async () => api.play(station));
  // The station's logo is downloaded into the cache first...
  await flush();
  await flush();
  // ...then the record is drawn with it as its label...
  // Hidden from screen readers (it's only for the lock screen).
  expect(screen.getByTestId('record-artwork', { includeHiddenElements: true })).toBeOnTheScreen();
  const logo = screen.getByTestId('record-artwork-logo', { includeHiddenElements: true });
  expect(logo.props.source.uri).toBe('file:///cache/logos/joy-0');
  expect(File.downloadFileAsync).toHaveBeenCalledWith(station.logo, expect.objectContaining({ uri: 'file:///cache/logos/joy-0' }), expect.anything());
  // ...and once the logo has loaded it's captured and passed on.
  await fireEvent(logo, 'load');
  // A moment for the logo to be drawn, then the snapshot, at 1024 px so
  // it stays sharp however large the lock screen shows it.
  await act(async () => jest.advanceTimersByTime(100));
  expect(captureRef).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(300));
  expect(captureRef).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ format: 'png', width: 1024, height: 1024 }));
  expect(appEngine.setArtwork).toHaveBeenCalledWith('joy', expect.stringMatching(/^file:\/\/\/cache\/record-\d+\.png$/));
});

test("a station logo that won't load gives way to the BOA logo, never a blank label", async () => {
  const { RecordFace } = require('../src/components/RecordArtwork');
  const settled = jest.fn();
  const screen = await render(<RecordFace station={{ id: 'x' }} logo="https://dead.example/logo.png" onLogoSettled={settled} />);
  await fireEvent(screen.getByTestId('record-artwork-logo'), 'error');
  expect(screen.queryByTestId('record-artwork-logo')).toBeNull();
  expect(screen.getByTestId('record-artwork-boa')).toBeOnTheScreen();
  expect(settled).toHaveBeenCalled();
});
