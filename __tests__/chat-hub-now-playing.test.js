import fs from 'fs';
import path from 'path';
import { act, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import * as hub from '../src/api/hub';
import { CHAT_SOUNDS, DEFAULT_CHAT_SOUND, RETIRED_CHAT_SOUNDS, chatChannel, chatSoundById } from '../src/chat/sounds';
import { ensureChatChannels } from '../src/chat/notifications';
import { STATUS_STALE_MS, statusLine } from '../src/components/hub/hubNav';
import NowPlaying from '../src/components/hub/NowPlaying';
import AmbientGlow from '../src/components/chat/AmbientGlow';
import { VIBES } from '../src/chat/vibes';
import { ThreadRow } from '../src/screens/hub/HubChatsScreen';
import HubThreadScreen from '../src/screens/hub/HubThreadScreen';
import { zenStatusText } from '../src/context/HubContext';
import { TAB_BAR_HEIGHT, tabSizing } from '../App';

jest.useFakeTimers();

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p));
const ME = 'user-me';
const fresh = () => new Date().toISOString();
const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null, roles: [], last_seen_at: null };

jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  getConversation: jest.fn(),
  listMessages: jest.fn(() => Promise.resolve([])),
  markRead: jest.fn(() => Promise.resolve()),
  listConversations: jest.fn(() => Promise.resolve([])),
  listNewMembers: jest.fn(() => Promise.resolve([])),
  listSuggested: jest.fn(() => Promise.resolve([])),
  listFeatured: jest.fn(() => Promise.resolve([])),
}));

// Only for the screens that use it; the provider's own pieces are tested directly.
jest.mock('../src/context/HubContext', () => ({
  ...jest.requireActual('../src/context/HubContext'),
  useHub: () => ({
    userId: 'user-me',
    profile: { id: 'user-me', username: 'me', display_name: 'Me', avatar_url: null, roles: [], quote_category: 'career' },
    isOnline: () => false,
    blocked: new Set(),
    unblock: jest.fn(),
  }),
}));

// ------------------------------------------------------------- the sounds

describe('urban notification sounds', () => {
  // Walks the RIFF chunks: 'fmt ' has channels, rate and bits; 'data' the
  // sample bytes (ffmpeg puts a LIST chunk between them).
  const wavSeconds = (buf) => {
    let fmt = null;
    for (let at = 12; at + 8 <= buf.length; ) {
      const id = buf.toString('ascii', at, at + 4);
      const size = buf.readUInt32LE(at + 4);
      if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(at + 10), rate: buf.readUInt32LE(at + 12), bits: buf.readUInt16LE(at + 22) };
      if (id === 'data' && fmt) return size / (fmt.rate * fmt.channels * (fmt.bits / 8));
      at += 8 + size + (size % 2);
    }
    return 0;
  };

  test('air horn, record scratch, cha-ching and bass drop replace the generic ones', () => {
    const ids = CHAT_SOUNDS.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['airhorn', 'scratch', 'cashregister', 'bassdrop']));
    for (const old of RETIRED_CHAT_SOUNDS) expect(ids).not.toContain(old);
    expect(CHAT_SOUNDS.map((s) => s.label)).toEqual(expect.arrayContaining(['Air horn', 'Record scratch', 'Cha-ching', 'Bass drop']));
  });

  test('each is a real, short WAV, bundled and built into the app, and credited', () => {
    const plugin = JSON.parse(read('app.json').toString()).expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
    for (const s of CHAT_SOUNDS) {
      const wav = read(`assets/sounds/${s.file}`);
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
      const secs = wavSeconds(wav);
      // A notification sound: long enough to hear, well under Android's 30 s.
      expect(secs).toBeGreaterThan(0.5);
      expect(secs).toBeLessThan(5);
      expect(plugin[1].sounds).toContain(`./assets/sounds/${s.file}`);
      if (s.license !== 'Original') expect(s.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    }
    for (const old of RETIRED_CHAT_SOUNDS) {
      expect(plugin[1].sounds).not.toContain(`./assets/sounds/chat_${old}.wav`);
      expect(fs.existsSync(path.join(__dirname, '..', `assets/sounds/chat_${old}.wav`))).toBe(false);
    }
  });

  test('someone who had a retired sound gets the default, and its channel is removed', async () => {
    expect(chatSoundById('rimshot').id).toBe(DEFAULT_CHAT_SOUND);
    expect(chatChannel('laugh')).toBe(`boa-chat-${DEFAULT_CHAT_SOUND}`);
    const os = Platform.OS;
    Platform.OS = 'android';
    try {
      await ensureChatChannels();
    } finally {
      Platform.OS = os;
    }
    for (const old of RETIRED_CHAT_SOUNDS) expect(Notifications.deleteNotificationChannelAsync).toHaveBeenCalledWith(`boa-chat-${old}`);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('boa-chat-bassdrop', expect.objectContaining({ sound: 'chat_bassdrop.wav' }));
  });

  test('the notification handler is in place from startup, so a message pops up at once', async () => {
    const handler = Notifications.setNotificationHandler.mock.calls.at(-1)?.[0];
    expect(handler).toBeTruthy();
    const chat = await handler.handleNotification({ request: { content: { data: { type: 'chat', conversationId: 'conv-9' } } } });
    expect(chat).toEqual(expect.objectContaining({ shouldShowBanner: true, shouldPlaySound: true }));
    const alarm = await handler.handleNotification({ request: { content: { data: { alarmId: 'a1' } } } });
    expect(alarm.shouldShowBanner).toBe(false);
  });
});

// ------------------------------------------------------------ now playing

describe('now playing', () => {
  test('radio, Zen and the screening room each read naturally', () => {
    expect(statusLine({ status_kind: 'listening', status_text: 'Capital Xtra', status_updated_at: fresh() })).toBe('Listening to Capital Xtra');
    expect(statusLine({ status_kind: 'zen', status_text: 'Rain · On the window', status_updated_at: fresh() })).toBe('In the Zen Zone: Rain · On the window');
    expect(statusLine({ status_kind: 'watching', status_text: 'Mind States', status_updated_at: fresh() })).toBe('Watching Mind States');
    expect(statusLine({ status_kind: null, status_text: null })).toBeNull();
  });

  test('a status the phone stopped refreshing is hidden', () => {
    const old = new Date(Date.now() - STATUS_STALE_MS - 60000).toISOString();
    expect(statusLine({ status_kind: 'listening', status_text: 'Capital Xtra', status_updated_at: old })).toBeNull();
  });

  test('Zen sounds are named by their kind and sound', () => {
    expect(zenStatusText('no-such-sound')).toBeNull();
    const { SOUNDSCAPES, categoryById } = require('../src/data/sleep');
    const s = SOUNDSCAPES.find((x) => x.category === 'rain' && !x.label.toLowerCase().includes('rain'));
    if (s) expect(zenStatusText(s.id)).toBe(`${categoryById('rain').label} · ${s.label}`);
    const named = SOUNDSCAPES.find((x) => x.label.toLowerCase().includes(categoryById(x.category).label.toLowerCase()));
    if (named) expect(zenStatusText(named.id)).toBe(named.label);
  });

  test('the badge spins a record for radio, breathes for Zen, and is gone when nothing plays', async () => {
    await render(<NowPlaying person={{ status_kind: 'zen', status_text: 'Pink noise', status_updated_at: fresh() }} />);
    expect(screen.getByTestId('now-playing')).toHaveTextContent('In the Zen Zone: Pink noise');
    await render(<NowPlaying person={{ status_kind: null, status_text: null }} />);
    expect(screen.queryByTestId('now-playing')).toBeNull();
  });

  test('the chat list shows it under their name', async () => {
    const conv = {
      id: 'conv-1',
      otherId: KOFI.id,
      other: { ...KOFI, status_kind: 'listening', status_text: 'Joy Prime', status_updated_at: fresh() },
      last_message_at: fresh(),
      last_message_preview: 'Shoot is Friday',
      last_sender_id: KOFI.id,
      unread: false,
    };
    await render(<ThreadRow conv={conv} online={false} onPress={() => {}} index={0} myId={ME} />);
    // (The spinning record is an icon-font glyph, so match the words.)
    expect(screen.getByTestId('now-playing')).toHaveTextContent(/Listening to Joy Prime$/);
    expect(screen.getByText('Kofi Boateng')).toBeOnTheScreen();
  });

  test('the thread header shows it under their name', async () => {
    hub.getConversation.mockResolvedValue({
      id: 'conv-1',
      user_a: KOFI.id,
      user_b: ME,
      otherId: KOFI.id,
      other: { ...KOFI, status_kind: 'zen', status_text: 'Rain · Thunderstorm', status_updated_at: fresh() },
      theirReadAt: null,
    });
    await render(
      <NavigationContainer>
        <HubThreadScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} route={{ params: { id: 'conv-1' } }} />
      </NavigationContainer>,
    );
    await act(async () => {});
    expect(screen.getByTestId('now-playing')).toHaveTextContent('In the Zen Zone: Rain · Thunderstorm');
  });
});

// --------------------------------------------------------------- the look

describe('chat ambiance and layout', () => {
  test('every ambient light, in every vibe, travels across the screen, never off it', async () => {
    for (const vibe of VIBES) {
      for (const l of vibe.lights) {
        for (const v of [...l.x, ...l.y]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        expect(Math.min(...l.opacity)).toBeGreaterThan(0.15);
      }
      await render(<AmbientGlow vibe={vibe} />);
      for (const l of vibe.lights) expect(screen.getByTestId(`chat-ambient-${l.id}`)).toBeOnTheScreen();
      await screen.unmount();
    }
  });

  test('the Messages title stays on one line on any width', async () => {
    const ChatHome = require('../src/screens/hub/ChatHome').default;
    await render(
      <NavigationContainer>
        <ChatHome navigation={{ navigate: jest.fn() }} bottomPadding={100} />
      </NavigationContainer>,
    );
    await act(async () => {});
    const title = screen.getByTestId('chat-title');
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.adjustsFontSizeToFit).toBe(true);
  });

  test('the tab bar is tall, with icons of at least 24 and labels of at least 11', () => {
    expect(TAB_BAR_HEIGHT).toBeGreaterThanOrEqual(60);
    for (const slot of [44, 54, 60, 70, 120]) {
      expect(tabSizing(slot).icon).toBeGreaterThanOrEqual(24);
      expect(tabSizing(slot).label).toBeGreaterThanOrEqual(11);
    }
  });
});

describe('the database migration', () => {
  const sql = read('supabase/migrations/20261025200000_now_playing_zen.sql').toString();
  test("lets 'zen' statuses save, streams profiles live, and moves retired sounds to the default", () => {
    expect(sql).toMatch(/check \(status_kind in \('listening', 'watching', 'zen'\)\)/);
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.profiles/);
    expect(sql).toMatch(/set sound = 'pager'/);
  });
});
