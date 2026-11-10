// Notification sounds: the phone's default, a clip of your own, or a BOA alert
// sound; one choice that every message, heart, missed call and push respects.

import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Alert, AppState, Platform } from 'react-native';

jest.useFakeTimers();

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
// A small file system that can copy: what's on the phone, by uri.
jest.mock('expo-file-system', () => {
  const files = new Set();
  const join = (...parts) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class Directory {
    constructor(...parts) {
      this.uri = join(...parts);
    }
    create() {}
  }
  class File {
    constructor(...parts) {
      this.uri = join(...parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    copy(dest) {
      if (!files.has(this.uri)) throw new Error('no such file');
      files.add(dest.uri);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///docs' }, cache: { uri: 'file:///cache' } }, __files: files };
});

let mockHub;
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));
jest.mock('../src/api/hub', () => ({ ...jest.requireActual('../src/api/hub'), savePushToken: jest.fn(async () => {}) }));

const DocumentPicker = require('expo-document-picker');
const { __files: files } = require('expo-file-system');
const Notifications = require('expo-notifications');
const { createAudioPlayer } = require('expo-audio');
const prefs = require('../src/chat/soundPrefs');
const chat = require('../src/chat/notifications');
const { CHAT_SOUNDS, CUSTOM_CHANNEL, SYSTEM_CHANNEL, chatChannel } = require('../src/chat/sounds');
const NotificationSoundSection = require('../src/screens/hub/NotificationSoundSection').default;
// installChatHandler ran when notifications.js was imported: keep that call before the mocks are cleared.
const handleNotification = Notifications.setNotificationHandler.mock.calls[0][0].handleNotification;

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const pick = (asset) => {
  if (asset) files.add(asset.uri);
  DocumentPicker.getDocumentAsync.mockResolvedValueOnce(asset ? { canceled: false, assets: [asset] } : { canceled: true, assets: null });
};
const withAndroid = async (fn) => {
  const os = Platform.OS;
  Platform.OS = 'android';
  try {
    return await fn();
  } finally {
    Platform.OS = os;
  }
};
const lastPost = () => Notifications.scheduleNotificationAsync.mock.calls.at(-1)[0];

beforeEach(async () => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  await prefs.setCustomSound(null);
  prefs.resetSoundPrefs();
  files.clear();
});

describe('which sound a notification makes', () => {
  test('the default is the BOA pager, and BOA sounds ring on their own channel', async () => {
    expect(prefs.soundMode()).toBe('boa');
    expect(prefs.pushSound()).toBe('pager');
    await withAndroid(() => chat.notifyLocal({ title: 'Ama', body: 'Hey', conversationId: 'c1', messageId: 'm1', sound: 'airhorn' }));
    expect(lastPost().content).toMatchObject({ sound: 'chat_airhorn.wav', data: expect.objectContaining({ type: 'chat', own: false }) });
    expect(lastPost().trigger).toEqual({ channelId: chatChannel('airhorn') });
  });

  test("the phone's default sound: its own channel, 'default', and pushes ask for 'system'", async () => {
    await prefs.setSoundMode('system');
    expect(prefs.pushSound()).toBe('system');
    await withAndroid(() => chat.notifyLocal({ title: 'Ama', body: 'Hey', conversationId: 'c1', messageId: 'm1', sound: 'airhorn' }));
    expect(lastPost().content.sound).toBe('default');
    expect(lastPost().trigger).toEqual({ channelId: SYSTEM_CHANNEL });
    // Hearts and missed calls follow the same choice.
    await withAndroid(() => chat.notifyHeart({ name: 'Kofi', likerId: 'k', sound: 'airhorn' }));
    expect(lastPost().content.sound).toBe('default');
    await withAndroid(() => chat.notifyMissedCall({ name: 'Kofi', peerId: 'k', sound: 'airhorn' }));
    expect(lastPost().content.sound).toBe('default');
    expect(lastPost().trigger).toEqual({ channelId: SYSTEM_CHANNEL });
  });

  test('a BOA sound picked in Settings is the choice again, whatever it was', async () => {
    await prefs.setSoundMode('system');
    await chat.saveChatSound('scratch');
    await prefs.setSoundMode('boa');
    expect(prefs.boaSoundId()).toBe('scratch');
    expect(prefs.pushSound()).toBe('scratch');
  });

  test('every channel exists: one per BOA sound, the phone default and your own clip', async () => {
    await withAndroid(() => chat.ensureChatChannels());
    const made = Notifications.setNotificationChannelAsync.mock.calls.map((c) => c[0]);
    for (const s of CHAT_SOUNDS) expect(made).toContain(chatChannel(s.id));
    expect(made).toEqual(expect.arrayContaining([SYSTEM_CHANNEL, CUSTOM_CHANNEL]));
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(SYSTEM_CHANNEL, expect.objectContaining({ sound: 'default' }));
    // Your clip's channel pops and buzzes but is silent: the app plays the clip.
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(CUSTOM_CHANNEL, expect.objectContaining({ sound: null, enableVibrate: true }));
  });
});

describe('your own sound', () => {
  const choose = async (name = 'Air Raid.mp3') => {
    pick({ uri: `file:///picked/${name}`, name, size: 400_000 });
    return prefs.pickCustomSound();
  };

  test('a clip from the phone is copied into BOA and becomes the choice', async () => {
    const song = await choose();
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio/*', copyToCacheDirectory: true }));
    expect(song.name).toBe('Air Raid');
    expect(song.uri).toMatch(/^file:\/\/\/docs\/alert-sounds\/custom-\d+\.mp3$/);
    expect(files.has(song.uri)).toBe(true);
    expect(prefs.soundMode()).toBe('custom');
    // Pushes with the app closed can only use the phone's sound.
    expect(prefs.pushSound()).toBe('system');
    // The original can go: BOA keeps its own copy.
    files.delete('file:///picked/Air Raid.mp3');
    expect(prefs.customSound().uri).toBe(song.uri);
  });

  test('with the app open, a notification is silent and BOA plays the clip itself; once, at most 8 seconds', async () => {
    const song = await choose();
    await withAndroid(() => chat.notifyLocal({ title: 'Ama', body: 'Hey', conversationId: 'c1', messageId: 'm1' }));
    expect(lastPost().content).toMatchObject({ sound: false, data: expect.objectContaining({ own: true }) });
    expect(lastPost().trigger).toEqual({ channelId: CUSTOM_CHANNEL });
    expect(createAudioPlayer).toHaveBeenLastCalledWith({ uri: song.uri });
    const player = require('expo-audio').__players.at(-1);
    expect(player.loop).toBe(false);
    expect(player.play).toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(prefs.CUSTOM_PLAY_MS + 50));
    expect(player.remove).toHaveBeenCalled();
    // Messages close together are one sound.
    createAudioPlayer.mockClear();
    await act(async () => jest.advanceTimersByTime(5000));
    await withAndroid(() => chat.notifyHeart({ name: 'Kofi', likerId: 'k' }));
    await withAndroid(() => chat.notifyHeart({ name: 'Zed', likerId: 'z' }));
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  test("with the app closed or in the background, the phone's default sound plays instead", async () => {
    await choose();
    AppState.currentState = 'background';
    await withAndroid(() => chat.notifyLocal({ title: 'Ama', body: 'Hey', conversationId: 'c1', messageId: 'm1' }));
    expect(lastPost().content.sound).toBe('default');
    expect(lastPost().trigger).toEqual({ channelId: SYSTEM_CHANNEL });
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  test('a push that arrives with the app open: the notification is silent and the clip plays', async () => {
    const song = await choose();
    const handler = handleNotification;
    const out = await handler({ request: { content: { data: { type: 'chat', conversationId: 'other' } } } });
    expect(out).toMatchObject({ shouldShowBanner: true, shouldPlaySound: false });
    expect(createAudioPlayer).toHaveBeenLastCalledWith({ uri: song.uri });
    // A notification BOA posted itself has played already: no second sound.
    createAudioPlayer.mockClear();
    await act(async () => jest.advanceTimersByTime(5000));
    await handler({ request: { content: { data: { type: 'chat', conversationId: 'other', own: true } } } });
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  test('the other choices leave the handler to the notification channel', async () => {
    await prefs.setSoundMode('system');
    const out = await handleNotification({ request: { content: { data: { type: 'chat', conversationId: 'other' } } } });
    expect(out).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  test('removing it deletes the copy and goes back to the phone default', async () => {
    const song = await choose();
    await prefs.setCustomSound(null);
    expect(files.has(song.uri)).toBe(false);
    expect(prefs.customSound()).toBeNull();
    expect(prefs.soundMode()).toBe('system');
  });

  test('a clip over the size limit is turned away with a clear message; backing out changes nothing', async () => {
    pick({ uri: 'file:///picked/album.mp3', name: 'album.mp3', size: prefs.MAX_CUSTOM_BYTES + 1 });
    await expect(prefs.pickCustomSound()).rejects.toThrow(/over 5 MB/);
    pick(null);
    await expect(prefs.pickCustomSound()).resolves.toBeNull();
    expect(prefs.soundMode()).toBe('boa');
  });
});

describe('the database sends pushes with the same choice', () => {
  test('push_tokens.sound is the BOA sound, or system for the phone default and your own clip', async () => {
    const SQL = fs.readdirSync(path.join(__dirname, '../supabase/migrations')).map((f) => read(`supabase/migrations/${f}`)).join('\n');
    // The column accepts a lowercase word of up to 24 characters: 'system' fits.
    expect(SQL).toMatch(/sound text not null default 'pager' check \(sound ~ '\^\[a-z0-9_\]\{1,24\}\$'\)/);
    expect('system').toMatch(/^[a-z0-9_]{1,24}$/);
    const fn = read('supabase/functions/message-push/index.ts');
    expect(fn).toMatch(/t\.sound === 'system' \? 'default'/);
    expect(fn).toMatch(/channelId: `boa-chat-\$\{t\.sound\}`/);
    // And the app registers it on sign in and whenever the choice changes.
    const hubSrc = read('src/context/HubContext.js');
    expect(hubSrc).toMatch(/savePushToken\(token, Platform\.OS, pushedSound\.current\)/);
    expect(hubSrc).toMatch(/onSoundPrefs\(/);
  });
});

describe('Settings > Notification sound', () => {
  const mount = async (chatSound = 'pager') => {
    const setChatSound = jest.fn();
    await render(<NotificationSoundSection chatSound={chatSound} setChatSound={setChatSound} />);
    return setChatSound;
  };

  test('three ways to choose, with an honest note about your own sound', async () => {
    await mount();
    expect(screen.getByText('Phone default')).toBeOnTheScreen();
    expect(screen.getByText('Your own sound')).toBeOnTheScreen();
    expect(screen.getByText('BOA alert sounds')).toBeOnTheScreen();
    expect(screen.getByTestId('notif-sound-note')).toHaveTextContent('Your own sound plays while BOA is open. With BOA closed, your phone plays its default sound.');
    for (const s of CHAT_SOUNDS) expect(screen.getByText(s.label)).toBeOnTheScreen();
    expect(screen.getByTestId('chat-sound-pager-selected')).toBeOnTheScreen();
  });

  test("choosing the phone's default selects it, plays it and unselects the BOA sound", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Phone default'));
    expect(prefs.soundMode()).toBe('system');
    expect(screen.getByTestId('notif-sound-system-selected')).toBeOnTheScreen();
    expect(screen.queryByTestId('chat-sound-pager-selected')).toBeNull();
    expect(lastPost().content).toMatchObject({ sound: 'default', body: 'This is how your notifications sound.' });
  });

  test('your own sound: choose, preview, change and remove', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    pick({ uri: 'file:///picked/Intro.wav', name: 'Intro.wav', size: 90_000 });
    await user.press(screen.getByText('Your own sound'));
    await act(async () => {});
    expect(screen.getByText('Intro')).toBeOnTheScreen();
    expect(screen.getByTestId('notif-sound-custom-selected')).toBeOnTheScreen();
    expect(createAudioPlayer).toHaveBeenLastCalledWith({ uri: prefs.customSound().uri });
    await user.press(screen.getByTestId('notif-sound-remove'));
    expect(prefs.customSound()).toBeNull();
    expect(screen.queryByText('Intro')).toBeNull();
    expect(screen.getByTestId('notif-sound-system-selected')).toBeOnTheScreen();
  });

  test('an unusable file says why', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await mount();
    pick({ uri: 'file:///picked/big.mp3', name: 'big.mp3', size: 9_000_000 });
    await user.press(screen.getByText('Your own sound'));
    await act(async () => {});
    expect(alert).toHaveBeenCalledWith("Couldn't use that file", expect.stringMatching(/over 5 MB/));
    expect(prefs.soundMode()).toBe('boa');
  });

  test('picking a BOA sound calls setChatSound', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const setChatSound = await mount();
    await user.press(screen.getByText('Air horn'));
    expect(setChatSound).toHaveBeenCalledWith('airhorn');
  });

  test('the Hub settings screen shows it, and no copy has a dash', () => {
    expect(read('src/screens/hub/HubSettingsScreen.js')).toContain('<NotificationSoundSection');
    const copy = read('src/screens/hub/NotificationSoundSection.js') + read('src/chat/soundPrefs.js');
    const strings = [...copy.matchAll(/(?:title|detail|label|body|Alert\.alert\()=?\{?\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
    for (const text of strings) expect(text).not.toMatch(/[–—]/);
  });
});
