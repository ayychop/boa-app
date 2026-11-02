import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); });
};

const SPEC = {
  id: 'ep-1',
  kind: 'audio',
  title: 'How to build a future',
  subtitle: 'The Mindset Mentor',
  url: 'https://cdn.example.com/audio/ep-1.mp3?x=1',
  image: 'https://cdn.example.com/art.jpg',
  meta: { podcastId: 'the-mindset-mentor', item: { kind: 'podcast', id: 'ep-1', name: 'How to build a future', streamUrl: 'https://cdn.example.com/audio/ep-1.mp3?x=1' } },
};

const dl = require('../src/offline/downloads');
const net = require('@react-native-community/netinfo');
const FS = require('expo-file-system');

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  FS.File.downloadFileAsync.mockReset();
  FS.File.downloadFileAsync.mockImplementation(async (url, dest, options) => {
    options?.onProgress?.({ bytesWritten: 512, totalBytes: 1024 });
    FS.__files.set(dest.uri, 1024);
    return dest;
  });
  FS.__files.clear();
  dl.__reset();
  await act(async () => net.__emit({ isConnected: true, isInternetReachable: true }));
});

describe('the download store', () => {
  test('a download runs to the end: progress, a file on the phone, saved in the list', async () => {
    const seen = [];
    const off = dl.subscribe(() => seen.push(dl.getDownload('ep-1')?.status));
    let partUri;
    FS.File.downloadFileAsync.mockImplementationOnce(async (url, dest, options) => {
      partUri = dest.uri;
      options.onProgress({ bytesWritten: 512, totalBytes: 1024 });
      FS.__files.set(dest.uri, 1024);
      return dest;
    });
    const res = await dl.startDownload(SPEC);
    expect(res).toEqual({ ok: true });
    await flush();
    off();
    expect(seen).toContain('queued');
    expect(seen).toContain('downloading');
    const e = dl.getDownload('ep-1');
    expect(e.status).toBe('done');
    expect(e.progress).toBe(1);
    expect(e.file).toBe('ep-1.mp3');
    // It went to <name>.part first and was moved into place whole.
    const [url, , options] = FS.File.downloadFileAsync.mock.calls[0];
    expect(url).toBe(SPEC.url);
    expect(partUri).toMatch(/downloads\/ep-1\.mp3\.part$/);
    expect(typeof options.onProgress).toBe('function');
    expect(options.signal).toBeDefined();
    expect(dl.localUriFor('ep-1')).toMatch(/file:\/\/\/documents\/downloads\/ep-1\.mp3$/);
    // And it is remembered for next time.
    const saved = JSON.parse(await AsyncStorage.getItem('boa.downloads.v1'));
    expect(saved.map((s) => s.id)).toEqual(['ep-1']);
  });

  test('the same download twice is one download', async () => {
    await dl.startDownload(SPEC);
    await dl.startDownload(SPEC);
    await flush();
    await dl.startDownload(SPEC);
    expect(FS.File.downloadFileAsync.mock.calls.filter(([u]) => u === SPEC.url)).toHaveLength(1);
  });

  test('deleting a download removes the file and the entry', async () => {
    await dl.startDownload(SPEC);
    await flush();
    const uri = dl.localUriFor('ep-1');
    expect(FS.__files.has(uri)).toBe(true);
    dl.removeDownload('ep-1');
    expect(FS.__files.has(uri)).toBe(false);
    expect(dl.getDownload('ep-1')).toBeNull();
    expect(dl.localUriFor('ep-1')).toBeNull();
    expect(JSON.parse(await AsyncStorage.getItem('boa.downloads.v1'))).toEqual([]);
  });

  test('cancelling a download in progress aborts it and leaves nothing behind', async () => {
    let signal;
    FS.File.downloadFileAsync.mockImplementationOnce((url, dest, options) => {
      signal = options.signal;
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    });
    await dl.startDownload(SPEC);
    await flush();
    expect(dl.getDownload('ep-1').status).toBe('downloading');
    dl.cancelDownload('ep-1');
    await flush();
    expect(signal.aborted).toBe(true);
    expect(dl.getDownload('ep-1')).toBeNull();
  });

  test('a failed download says so, and can be retried', async () => {
    FS.File.downloadFileAsync.mockImplementationOnce(async () => {
      throw new Error('network lost');
    });
    await dl.startDownload(SPEC);
    await flush();
    expect(dl.getDownload('ep-1')).toMatchObject({ status: 'error', error: 'network lost' });
    expect(dl.localUriFor('ep-1')).toBeNull();
    await dl.startDownload(SPEC);
    await flush();
    expect(dl.getDownload('ep-1').status).toBe('done');
  });

  test('no internet: a new download is refused, what is saved still plays', async () => {
    await dl.startDownload(SPEC);
    await flush();
    await act(async () => net.__emit({ isConnected: false }));
    expect(await dl.startDownload({ ...SPEC, id: 'ep-2' })).toEqual({ ok: false, reason: 'offline' });
    expect(dl.localUriFor('ep-1')).toBeTruthy();
  });

  test('only plain files can be saved: not a live stream, not a YouTube page', async () => {
    expect(dl.isDownloadable('https://x.com/a.mp3')).toBe(true);
    expect(dl.isDownloadable('https://x.com/live/stream.m3u8')).toBe(false);
    expect(dl.isDownloadable('https://www.youtube.com/watch?v=abc')).toBe(false);
    expect(dl.isDownloadable('https://youtu.be/abc')).toBe(false);
    expect(dl.isDownloadable(null)).toBe(false);
    expect(await dl.startDownload({ ...SPEC, id: 'live', url: 'https://x.com/radio.m3u8' })).toEqual({ ok: false, reason: 'unavailable' });
    expect(dl.getDownload('live')).toBeNull();
  });

  test('the list is read back on the next start, and a file that has gone is dropped', async () => {
    await dl.startDownload(SPEC);
    await flush();
    await dl.startDownload({ ...SPEC, id: 'ep-2', url: 'https://x.com/two.mp3' });
    await flush();
    FS.__files.delete(dl.localUriFor('ep-2'));
    // A fresh start: nothing in memory, only what was saved.
    dl.__reset();
    await dl.ready();
    expect(dl.getDownloads().map((d) => d.id)).toEqual(['ep-1']);
  });

  test('sizes read like a person would say them', () => {
    expect(dl.formatBytes(0)).toBe('0 KB');
    expect(dl.formatBytes(500 * 1024)).toBe('500 KB');
    expect(dl.formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
    expect(dl.formatBytes(48 * 1024 * 1024)).toBe('48 MB');
    expect(dl.formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  test('only two download at once; the rest wait their turn', async () => {
    const gates = [];
    FS.File.downloadFileAsync.mockImplementation(
      (url, dest) =>
        new Promise((resolve) => {
          gates.push(() => {
            FS.__files.set(dest.uri, 2048);
            resolve(dest);
          });
        }),
    );
    for (const id of ['a', 'b', 'c']) await dl.startDownload({ ...SPEC, id, url: `https://x.com/${id}.mp3` });
    await flush();
    expect(dl.getDownloads().filter((d) => d.status === 'downloading')).toHaveLength(2);
    expect(dl.getDownload('c').status).toBe('queued');
    await act(async () => gates[0]());
    await flush();
    expect(dl.getDownload('c').status).toBe('downloading');
  });
});

describe('Offline Mode (NetInfo)', () => {
  test('offline means no connection, or a connection with no internet; unknown counts as online', () => {
    const { isOfflineState } = require('../src/offline/network');
    expect(isOfflineState({ isConnected: false, isInternetReachable: false })).toBe(true);
    expect(isOfflineState({ isConnected: true, isInternetReachable: false })).toBe(true);
    expect(isOfflineState({ isConnected: true, isInternetReachable: null })).toBe(false);
    expect(isOfflineState({ isConnected: null, isInternetReachable: null })).toBe(false);
    expect(isOfflineState({ isConnected: true, isInternetReachable: true })).toBe(false);
  });

  test('the banner appears when the connection goes and leaves when it is back', async () => {
    const OfflineMode = require('../src/components/offline/OfflineMode').default;
    const { PlayerProvider } = require('../src/context/PlayerContext');
    await render(
      <PlayerProvider>
        <OfflineMode />
      </PlayerProvider>,
    );
    expect(screen.queryByTestId('offline-banner')).toBeNull();
    await act(async () => net.__emit({ isConnected: false, isInternetReachable: false }));
    expect(screen.getByTestId('offline-banner')).toBeOnTheScreen();
    expect(screen.getByText('OFFLINE MODE')).toBeOnTheScreen();
    await act(async () => net.__emit({ isConnected: true, isInternetReachable: true }));
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  test('going offline: a streaming episode carries on from its download; a live station hands over to the newest download', () => {
    const { switchToDevice } = require('../src/components/offline/OfflineMode');
    const engine = require('../src/audio/engine');
    const play = jest.fn();
    const downloads = [{ id: 'ep-1', kind: 'audio', status: 'done', meta: { item: { id: 'ep-1', kind: 'podcast' } } }];
    // A podcast that was streaming is reloaded from the phone's own copy.
    expect(switchToDevice({ player: { current: { kind: 'podcast', id: 'ep-1' }, isPlaying: true, play }, downloads })).toBe('reload');
    expect(engine.reloadFromDevice).toHaveBeenCalled();
    // A live station can't play offline: the newest download takes over.
    expect(switchToDevice({ player: { current: { kind: 'radio', id: 's' }, isPlaying: true, play }, downloads })).toBe('download');
    expect(play).toHaveBeenCalledWith({ id: 'ep-1', kind: 'podcast' });
    // Nothing downloaded, nothing playing: nothing happens.
    expect(switchToDevice({ player: { current: { kind: 'radio' }, isPlaying: true, play }, downloads: [] })).toBe('none');
    expect(switchToDevice({ player: { current: null, isPlaying: false, play }, downloads })).toBe('idle');
  });

  test('the engine plays an episode from its local file, and accepts file:// links', () => {
    const src = read('src/audio/engine.native.js');
    expect(src).toMatch(/localUriFor\(item\.id\)/);
    expect(src).toMatch(/\(https\?\|file\)/);
    expect(src).toMatch(/p\.replace\(\{ uri \}\)/);
    expect(src).toMatch(/export async function reloadFromDevice/);
  });
});

describe('the download button', () => {
  const DownloadButton = () => require('../src/components/offline/DownloadButton').default;

  test('a cloud with a down arrow; tapping it downloads, shows progress, then a tick', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const Button = DownloadButton();
    const { DownloadBar } = require('../src/components/offline/DownloadButton');
    const user = userEvent.setup();
    await render(
      <>
        <Button spec={SPEC} />
        <DownloadBar id="ep-1" />
      </>,
    );
    expect(screen.getByLabelText(`Download ${SPEC.title}`)).toBeOnTheScreen();
    let pending;
    FS.File.downloadFileAsync.mockImplementationOnce(async (url, dest, options) => {
      options.onProgress({ bytesWritten: 300, totalBytes: 1000 });
      await new Promise((r) => (pending = r));
      FS.__files.set(dest.uri, 1000);
      return dest;
    });
    await user.press(screen.getByTestId('download-ep-1'));
    await flush();
    expect(screen.getByLabelText(/Downloading How to build a future, 30 percent/)).toBeOnTheScreen();
    expect(screen.getByTestId('download-bar-ep-1')).toBeOnTheScreen();
    await act(async () => pending());
    await flush();
    expect(screen.getByLabelText(`${SPEC.title} is downloaded. Tap to delete`)).toBeOnTheScreen();
  });

  test('offline, it says why instead of failing quietly', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const Button = DownloadButton();
    const user = userEvent.setup();
    await act(async () => net.__emit({ isConnected: false }));
    await render(<Button spec={SPEC} />);
    await user.press(screen.getByTestId('download-ep-1'));
    await flush();
    expect(alert.mock.calls[0][0]).toBe('You are offline');
    expect(alert.mock.calls[0][1]).toMatch(/Connect to the internet/);
  });

  test('a video that only lives on YouTube shows the button dimmed and says it is streaming only', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const Button = DownloadButton();
    const { videoSpec } = require('../src/offline/specs');
    const { productions } = require('../src/data/boaContent');
    const mind = productions.find((p) => p.id === 'mind-states-uk');
    const user = userEvent.setup();
    await render(<Button spec={videoSpec(mind, mind.episodes[0])} />);
    const btn = screen.getByLabelText(/is streaming only/);
    expect(btn).toBeOnTheScreen();
    await user.press(btn);
    expect(alert.mock.calls[0][0]).toBe('Streaming only');
  });

  test('deleting asks first', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const Button = DownloadButton();
    const user = userEvent.setup();
    await dl.startDownload(SPEC);
    await flush();
    await render(<Button spec={SPEC} />);
    await user.press(screen.getByTestId('download-ep-1'));
    expect(alert).toHaveBeenCalledWith('Remove this download?', expect.any(String), expect.arrayContaining([expect.objectContaining({ text: 'Delete' })]));
    expect(dl.getDownload('ep-1')).toBeTruthy();
    alert.mock.calls[0][2].find((b) => b.text === 'Delete').onPress();
    expect(dl.getDownload('ep-1')).toBeNull();
  });
});

describe('the Downloads page in Profile', () => {
  test('it is registered, reachable from Profile, and the Offline pill is mounted app-wide', () => {
    const app = read('App.js');
    expect(app).toMatch(/Stack\.Screen name="Downloads" component=\{DownloadsScreen\}/);
    expect(app).toMatch(/<OfflineMode \/>/);
    const profile = read('src/screens/ProfileScreen.js');
    expect(profile).toMatch(/navigation\.navigate\('Downloads'\)/);
    expect(profile).toMatch(/cloud-download-outline/);
  });

  test('it lists what was saved, plays it offline and deletes it', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const Downloads = require('../src/screens/DownloadsScreen').default;
    const { PlayerProvider } = require('../src/context/PlayerContext');
    const { MediaProvider } = require('../src/context/MediaContext');
    const engine = require('../src/audio/engine');
    const user = userEvent.setup();
    await dl.startDownload(SPEC);
    await flush();
    const nav = { goBack: jest.fn(), navigate: jest.fn() };
    await render(
      <PlayerProvider>
        <MediaProvider>
          <Downloads navigation={nav} />
        </MediaProvider>
      </PlayerProvider>,
    );
    expect(screen.getByTestId('download-row-ep-1')).toBeOnTheScreen();
    expect(screen.getByText(SPEC.title)).toBeOnTheScreen();
    expect(screen.getByText(/1 saved/)).toBeOnTheScreen();
    // Tabs filter by kind.
    await user.press(screen.getByTestId('downloads-tab-video'));
    expect(screen.queryByTestId('download-row-ep-1')).toBeNull();
    await user.press(screen.getByTestId('downloads-tab-audio'));
    // Play it.
    await user.press(screen.getByLabelText(`Play ${SPEC.title} offline`));
    expect(engine.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'ep-1' }));
    // Delete it.
    await user.press(screen.getByTestId('download-delete-ep-1'));
    alert.mock.calls.at(-1)[2].find((b) => b.text === 'Delete').onPress();
    await flush();
    expect(screen.queryByTestId('download-row-ep-1')).toBeNull();
    expect(screen.getByText('No audio downloads yet')).toBeOnTheScreen();
  });

  test('it is a page over the tabs: it never asks for the tab bar height (that crashed the app)', () => {
    const src = read('src/screens/DownloadsScreen.js');
    expect(src).not.toMatch(/useBottomSpace|useBottomTabBarHeight/);
    expect(src).toMatch(/useSafeAreaInsets/);
    for (const f of ['src/components/offline/OfflineMode.js', 'src/components/offline/DownloadButton.js', 'src/offline/downloads.js']) {
      expect(read(f)).not.toMatch(/useBottomSpace|useBottomTabBarHeight/);
    }
    // And it renders with no tab navigator around it, as it does in the app.
    // (The other tests in this file render it the same way, unmocked.)
  });

  test('in Offline Mode the page says so', async () => {
    const Downloads = require('../src/screens/DownloadsScreen').default;
    const { PlayerProvider } = require('../src/context/PlayerContext');
    const { MediaProvider } = require('../src/context/MediaContext');
    await act(async () => net.__emit({ isConnected: false }));
    await render(
      <PlayerProvider>
        <MediaProvider>
          <Downloads navigation={{ goBack: jest.fn(), navigate: jest.fn() }} />
        </MediaProvider>
      </PlayerProvider>,
    );
    expect(screen.getByTestId('downloads-offline')).toBeOnTheScreen();
  });
});

describe('where the buttons sit', () => {
  test('next to every podcast episode, on the player, on Originals episodes and in the screening room', () => {
    expect(read('src/components/media/PodcastPlayer.js')).toMatch(/<DownloadButton spec=\{audioSpec\(podcast, ep\)\}/);
    expect(read('src/components/media/PodcastPlayer.js')).toMatch(/<DownloadButton spec=\{audioSpec\(podcast, episode\)\}/);
    expect(read('src/screens/OriginalsScreen.js')).toMatch(/<DownloadButton spec=\{videoSpec\(production, episode\)\}/);
    const room = read('src/components/media/ScreeningRoom.js');
    expect(room).toMatch(/<DownloadButton spec=\{videoSpec\(production, episode\)\}/);
    // A saved episode plays from the phone; offline with nothing saved says so.
    expect(room).toMatch(/localUri \? \{ videoUrl: localUri, local: true \}/);
    expect(room).toMatch(/screening-offline/);
  });

  test('a downloaded video plays through expo-video, not a placeholder', () => {
    const src = read('src/components/media/VideoPlayer.native.js');
    expect(src).toMatch(/from 'expo-video'/);
    expect(src).not.toMatch(/arrives with react-native-video/);
  });

  test('netinfo is a dependency and the lockfile has it', () => {
    expect(JSON.parse(read('package.json')).dependencies['@react-native-community/netinfo']).toBeTruthy();
    expect(read('package-lock.json')).toMatch(/node_modules\/@react-native-community\/netinfo/);
  });
});
