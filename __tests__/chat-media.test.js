import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as hub from '../src/api/hub';
import { RINGTONES } from '../src/calls/ringtone';
import HubThreadScreen, { keyboardBehavior } from '../src/screens/hub/NewChatScreen';
import HubSettingsScreen from '../src/screens/hub/HubSettingsScreen';
import { CHAT_SOUNDS, chatChannel } from '../src/chat/sounds';
import { ensureChatChannels, notifyLocal, previewOf, setOpenThread } from '../src/chat/notifications';
import { downsample, level } from '../src/components/chat/media';

jest.useFakeTimers();

const ME = 'user-me';
const AMA = { id: 'user-ama', username: 'ama', display_name: 'Ama Mensah', avatar_url: null, last_seen_at: null };
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

let mockHub;
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  getConversation: jest.fn(),
  listMessages: jest.fn(),
  sendMessage: jest.fn(),
  markRead: jest.fn(() => Promise.resolve()),
  deleteMessage: jest.fn(() => Promise.resolve()),
  uploadChatMedia: jest.fn(),
  sendMedia: jest.fn(),
  mediaUrl: jest.fn((p) => Promise.resolve(`https://cdn.example/${p}`)),
  openViewOnce: jest.fn(),
  discardViewOnce: jest.fn(() => Promise.resolve()),
  getProfile: jest.fn(() => Promise.resolve(null)),
}));

const at = (min) => new Date(Date.UTC(2026, 9, 24, 12, min)).toISOString();
const conv = { id: 'conv-1', user_a: AMA.id, user_b: ME, otherId: AMA.id, other: AMA, theirReadAt: null };
const navigation = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() };
const flush = () => act(async () => {});

async function openThread() {
  await render(
    <NavigationContainer>
      <HubThreadScreen navigation={navigation} route={{ params: { id: 'conv-1' } }} />
    </NavigationContainer>,
  );
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHub = { userId: ME, isOnline: () => false, blocked: new Set(), unblock: jest.fn() };
  hub.getConversation.mockResolvedValue(conv);
  hub.listMessages.mockResolvedValue([{ id: 'm1', conversation_id: 'conv-1', sender_id: AMA.id, body: 'Send me the reel', kind: 'text', created_at: at(1) }]);
});

describe('WhatsApp-style limits', () => {
  const MB = 1024 * 1024;
  test('photos up to 16 MB and videos up to 64 MB, at HD quality', () => {
    expect(hub.MEDIA_QUALITY).toBe(0.8);
    expect(hub.mediaProblem({ uri: 'a.jpg', type: 'image', fileSize: 15 * MB })).toBeNull();
    expect(hub.mediaProblem({ uri: 'a.jpg', type: 'image', fileSize: 17 * MB })).toMatch(/over 16 MB/);
    expect(hub.mediaProblem({ uri: 'a.mp4', type: 'video', fileSize: 60 * MB })).toBeNull();
    expect(hub.mediaProblem({ uri: 'a.mp4', mimeType: 'video/mp4', fileSize: 65 * MB })).toMatch(/over 64 MB/);
    expect(hub.mediaProblem({})).toMatch(/could not be opened/);
  });
});

describe('the thread', () => {
  test('stays above the keyboard and has the living backdrop', async () => {
    await openThread();
    expect(screen.getByTestId('hub-thread-keyboard')).toBeOnTheScreen();
    expect(keyboardBehavior('ios')).toBe('padding');
    expect(keyboardBehavior('android')).toBe('height');
    expect(screen.getByTestId('chat-backdrop')).toBeOnTheScreen();
  });

  test('sends a photo: HD from the library, shown at once, then saved', async () => {
    const user = userEvent.setup();
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///pic.jpg', type: 'image', mimeType: 'image/jpeg', width: 1200, height: 900, fileSize: 2_000_000 }],
    });
    let finishUpload;
    hub.uploadChatMedia.mockReturnValue(new Promise((r) => (finishUpload = r)));
    hub.sendMedia.mockResolvedValue({ id: 'm9', conversation_id: 'conv-1', sender_id: ME, kind: 'image', body: '', media_path: 'conv-1/user-me/image-1.jpg', created_at: at(9) });
    await openThread();
    await user.press(screen.getByTestId('hub-attach'));
    await flush();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images', 'videos'], quality: 0.8 }));
    // A look at it first, View once off, then Send.
    expect(screen.getByTestId('send-media-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('send-view-once').props.accessibilityState.checked).toBe(false);
    expect(hub.uploadChatMedia).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('send-media'));
    await flush();
    expect(hub.uploadChatMedia).toHaveBeenCalledWith('conv-1', ME, expect.objectContaining({ kind: 'image', uri: 'file:///pic.jpg', mimeType: 'image/jpeg' }));
    expect(screen.getByText(/Sending…/)).toBeOnTheScreen();
    await act(async () => finishUpload({ path: 'conv-1/user-me/image-1.jpg', size: 2_000_000, mime: 'image/jpeg' }));
    expect(hub.sendMedia).toHaveBeenCalledWith('conv-1', expect.objectContaining({ kind: 'image', path: 'conv-1/user-me/image-1.jpg', width: 1200, height: 900 }));
    expect(screen.getByTestId('media-m9')).toBeOnTheScreen();
    expect(screen.queryByText(/Sending…/)).toBeNull();
  });

  test('a view-once photo: sent with the switch on, shown as "View once" and never previewed', async () => {
    const user = userEvent.setup();
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///secret.jpg', type: 'image', mimeType: 'image/jpeg', width: 1000, height: 1000, fileSize: 1_000_000 }],
    });
    hub.uploadChatMedia.mockResolvedValue({ path: 'conv-1/user-me/image-2.jpg', size: 1_000_000, mime: 'image/jpeg' });
    hub.sendMedia.mockImplementation(async (_c, f) => ({
      id: 'm11',
      conversation_id: 'conv-1',
      sender_id: ME,
      kind: 'image',
      body: '',
      media_path: f.path,
      view_once: f.viewOnce,
      viewed_at: null,
      created_at: at(11),
    }));
    await openThread();
    await user.press(screen.getByTestId('hub-attach'));
    await flush();
    await user.press(screen.getByTestId('send-view-once'));
    await user.press(screen.getByTestId('send-media'));
    await flush();
    expect(hub.sendMedia).toHaveBeenCalledWith('conv-1', expect.objectContaining({ kind: 'image', viewOnce: true }));
    expect(screen.getByTestId('view-once-m11')).toBeOnTheScreen();
    expect(screen.getByText('View once · not opened yet')).toBeOnTheScreen();
    expect(screen.queryByTestId('media-m11')).toBeNull();
    expect(hub.mediaUrl).not.toHaveBeenCalledWith('conv-1/user-me/image-2.jpg');
  });

  test('a view-once photo you were sent opens once, securely, and is deleted when closed', async () => {
    const user = userEvent.setup();
    const screenModule = require('../modules/boa-screen');
    hub.listMessages.mockResolvedValue([
      { id: 'm12', conversation_id: 'conv-1', sender_id: AMA.id, kind: 'image', body: '', media_path: 'conv-1/user-ama/image-9.jpg', view_once: true, viewed_at: null, created_at: at(12) },
    ]);
    hub.openViewOnce.mockResolvedValue('https://signed.example/once.jpg');
    await openThread();
    expect(screen.getByText('Tap to open')).toBeOnTheScreen();
    await user.press(screen.getByTestId('view-once-m12'));
    await flush();
    expect(hub.openViewOnce).toHaveBeenCalledWith(expect.objectContaining({ id: 'm12' }));
    expect(screen.getByTestId('view-once-viewer')).toBeOnTheScreen();
    expect(screenModule.setSecure).toHaveBeenLastCalledWith(true);
    await user.press(screen.getByTestId('view-once-close'));
    await flush();
    expect(screen.queryByTestId('view-once-viewer')).toBeNull();
    expect(screenModule.setSecure).toHaveBeenLastCalledWith(false);
    expect(hub.discardViewOnce).toHaveBeenCalledWith('conv-1/user-ama/image-9.jpg');
    expect(screen.getByText('Opened')).toBeOnTheScreen();
    expect(screen.getByText('No longer available')).toBeOnTheScreen();
  });

  test('a video over 64 MB is refused before uploading', async () => {
    const user = userEvent.setup();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///long.mp4', type: 'video', mimeType: 'video/mp4', fileSize: 80 * 1024 * 1024 }],
    });
    await openThread();
    await user.press(screen.getByTestId('hub-attach'));
    await flush();
    expect(alert).toHaveBeenCalledWith("Can't send that", expect.stringMatching(/over 64 MB/));
    expect(hub.uploadChatMedia).not.toHaveBeenCalled();
  });

  test('records and sends a voice note with its waveform', async () => {
    const user = userEvent.setup();
    hub.uploadChatMedia.mockResolvedValue({ path: 'conv-1/user-me/voice-1.m4a', size: 30000, mime: 'audio/mp4' });
    hub.sendMedia.mockImplementation(async (_c, f) => ({
      id: 'm10',
      conversation_id: 'conv-1',
      sender_id: ME,
      kind: 'voice',
      body: '',
      media_path: f.path,
      media_duration_ms: f.durationMs,
      waveform: f.waveform,
      created_at: at(10),
    }));
    await openThread();
    await user.press(screen.getByTestId('hub-mic'));
    await flush();
    expect(screen.getByTestId('voice-recording')).toBeOnTheScreen();
    await user.press(screen.getByTestId('voice-send'));
    await flush();
    expect(hub.uploadChatMedia).toHaveBeenCalledWith('conv-1', ME, expect.objectContaining({ kind: 'voice', mimeType: 'audio/mp4', uri: 'file:///cache/voice-note.m4a' }));
    const sent = hub.sendMedia.mock.calls[0][1];
    expect(sent.durationMs).toBe(4200);
    expect(sent.waveform).toHaveLength(40);
    expect(screen.getByTestId('voice-note-m10')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Play voice note, 0:04/ })).toBeOnTheScreen();
  });

  test('disappearing messages show their time left and vanish when it runs out', async () => {
    const soon = new Date(Date.now() + 20000).toISOString();
    hub.listMessages.mockResolvedValue([{ id: 'm2', conversation_id: 'conv-1', sender_id: AMA.id, body: 'This will self-destruct', kind: 'text', created_at: at(2), expires_at: soon }]);
    await openThread();
    expect(screen.getByText('This will self-destruct')).toBeOnTheScreen();
    expect(screen.getByText(/1m left/)).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(31000));
    expect(screen.queryByText('This will self-destruct')).toBeNull();
  });

  test('expired messages are recognised', () => {
    expect(hub.isExpired({ expires_at: new Date(Date.now() - 1000).toISOString() })).toBe(true);
    expect(hub.isExpired({ expires_at: new Date(Date.now() + 60000).toISOString() })).toBe(false);
    expect(hub.isExpired({ expires_at: null })).toBe(false);
  });
});

describe('notifications', () => {
  test('every sound is bundled, credited, and built into the app', () => {
    const plugin = JSON.parse(read('app.json')).expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
    expect(CHAT_SOUNDS.length).toBeGreaterThanOrEqual(5);
    for (const s of CHAT_SOUNDS) {
      expect(fs.existsSync(path.join(__dirname, '..', 'assets/sounds', s.file))).toBe(true);
      expect(plugin[1].sounds).toContain(`./assets/sounds/${s.file}`);
      expect(s.license).toBeTruthy();
      if (s.license !== 'Original') expect(s.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    }
  });

  test('Android gets one buzzing channel per sound, and one ringing call channel per ringtone', async () => {
    const os = Platform.OS;
    Platform.OS = 'android';
    try {
      await ensureChatChannels();
    } finally {
      Platform.OS = os;
    }
    // One per sound, one per ringtone, and the quiet one for message requests.
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(CHAT_SOUNDS.length + RINGTONES.length + 1);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'boa-chat-requests',
      expect.objectContaining({ importance: Notifications.AndroidImportance.LOW, sound: null, enableVibrate: false }),
    );
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(chatChannel('airhorn'), expect.objectContaining({ sound: 'chat_airhorn.wav', vibrationPattern: expect.any(Array) }));
    // Calls ring on their own channel, with the ringtone the call-push function names.
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('boa-call-rnb', expect.objectContaining({ sound: 'rnb.wav', importance: Notifications.AndroidImportance.MAX }));
    for (const r of RINGTONES) expect(require('../app.json').expo.plugins.find((p) => p[0] === 'expo-notifications')[1].sounds).toContain(`./assets/sounds/ringtones/${r.id}.wav`);
  });

  test('a message rings with your sound, but not for the thread on screen', async () => {
    await notifyLocal({ title: 'Ama Mensah', body: 'Hey', conversationId: 'conv-2', messageId: 'x', sound: 'cashregister' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ title: 'Ama Mensah', sound: 'chat_cashregister.wav', data: expect.objectContaining({ type: 'chat', conversationId: 'conv-2' }) }) }),
    );
    Notifications.scheduleNotificationAsync.mockClear();
    setOpenThread('conv-2');
    await notifyLocal({ title: 'Ama Mensah', body: 'Again', conversationId: 'conv-2', messageId: 'y', sound: 'cashregister' });
    setOpenThread(null);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('media says what it is', () => {
    expect(previewOf({ kind: 'voice' })).toMatch(/Voice note/);
    expect(previewOf({ kind: 'image' })).toMatch(/Photo/);
    expect(previewOf({ kind: 'text', body: 'hi' })).toBe('hi');
    // A Giphy link sent as plain text (an older app) is a GIF in the notification, not the raw address.
    expect(previewOf({ kind: 'text', body: 'https://media3.giphy.com/media/v1.Yz/abc/100.gif' })).toBe('[GIF]');
    expect(previewOf({ kind: 'gif', body: 'https://media3.giphy.com/media/v1.Yz/abc/100.gif' })).toBe('[GIF]');
  });
});

describe('Chat settings', () => {
  test('choosing a sound and turning on disappearing messages', async () => {
    const user = userEvent.setup();
    const setChatSound = jest.fn();
    const setDisappearing = jest.fn(() => Promise.resolve());
    mockHub = {
      userId: ME,
      profile: { display_name: 'Me', username: 'me', bio: '', roles: ['actor'], visible_on_hub: true, open_for_work: false },
      saveProfile: jest.fn(),
      shareStatus: true,
      setShareStatus: jest.fn(),
      blocked: new Set(),
      unblock: jest.fn(),
      signOut: jest.fn(),
      deleteAccount: jest.fn(),
      chatSound: 'pager',
      setChatSound,
      disappearing: false,
      setDisappearing,
    };
    await render(
      <NavigationContainer>
        <HubSettingsScreen navigation={navigation} />
      </NavigationContainer>,
    );
    await flush();
    expect(screen.getByTestId('chat-sound-pager-selected')).toBeOnTheScreen();
    await user.press(screen.getByText('Air horn'));
    expect(setChatSound).toHaveBeenCalledWith('airhorn');
    await user.press(screen.getByTestId('hub-disappearing'));
    expect(setDisappearing).toHaveBeenCalledWith(true);
  });
});

describe('the database migration', () => {
  const sql = read('supabase/migrations/20261025150000_chat_media_notifications.sql');
  test('adds media and expiry columns, the private bucket, and the push trigger', () => {
    expect(sql).toMatch(/add column if not exists expires_at timestamptz/);
    expect(sql).toMatch(/add column if not exists media_path/);
    expect(sql).toMatch(/expires_at is null or expires_at > now\(\)/);
    expect(sql).toMatch(/'chat-media', 'chat-media', false, 67108864/);
    expect(sql).toMatch(/create table if not exists public\.push_tokens/);
    expect(sql).toMatch(/exp\.host\/--\/api\/v2\/push\/send/);
  });
});

describe('waveforms', () => {
  test('levels are squeezed to 40 bars, keeping peaks', () => {
    const bars = downsample(Array.from({ length: 400 }, (_, i) => (i === 205 ? 100 : 10)));
    expect(bars).toHaveLength(40);
    expect(bars[20]).toBe(100);
    expect(level(0)).toBe(100);
    expect(level(-60)).toBe(0);
    expect(level(undefined)).toBe(0);
  });
});
