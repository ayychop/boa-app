import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('Contact Book', () => {
  const contacts = require('../src/chat/contacts');
  beforeEach(async () => {
    await AsyncStorage.clear();
    contacts.__reset();
  });

  test('saves a name for a person, persists it and shows it in place of the username', async () => {
    expect(await contacts.saveContact('u1', '  David  ', '@7thDon')).toBe('David');
    expect(JSON.parse(await AsyncStorage.getItem('boa.contacts.v1')).u1).toMatchObject({ name: 'David', handle: '7thDon' });
    const person = { username: '7thDon', display_name: null };
    expect(contacts.nameFor(person, 'David')).toBe('David');
    expect(contacts.nameFor(person, null)).toBe('@7thDon');
    expect(contacts.nameFor({ username: 'x', display_name: 'Shown' }, null)).toBe('Shown');
    expect(contacts.nameFor(null, null, 'Conversation')).toBe('Conversation');
  });

  test('reads back after a restart, and an empty name removes the contact', async () => {
    await contacts.saveContact('u1', 'David', '7thDon');
    contacts.__reset();
    expect(await contacts.loadContacts()).toHaveProperty('u1.name', 'David');
    expect(await contacts.saveContact('u1', '   ')).toBeNull();
    expect(await contacts.loadContacts()).not.toHaveProperty('u1');
  });

  test('cleans names: one line, trimmed, capped', () => {
    expect(contacts.cleanAlias('a\n\tb   c')).toBe('a b c');
    expect(contacts.cleanAlias('x'.repeat(100))).toHaveLength(contacts.NAME_MAX);
    expect(contacts.cleanAlias(null)).toBe('');
  });

  test('lists A to Z', async () => {
    await contacts.saveContact('1', 'Zed');
    await contacts.saveContact('2', 'Amy');
    expect(contacts.contactList(await contacts.loadContacts()).map((c) => c.name)).toEqual(['Amy', 'Zed']);
  });

  test('the inbox, chat header and profile all use it', () => {
    expect(read('src/screens/hub/HubChatsScreen.js')).toMatch(/nameFor\(conv\.other, alias\)/);
    expect(read('src/screens/hub/NewChatScreen.js')).toMatch(/nameFor\(other, alias, 'Conversation'\)/);
    expect(read('src/screens/hub/NewChatScreen.js')).toMatch(/<ContactSheet/);
    expect(read('src/screens/hub/HubProfileScreen.js')).toMatch(/testID="profile-contact"/);
    expect(read('src/screens/hub/ChatHome.js')).toMatch(/<ContactSheet/);
  });
});

describe('the [GIF] inbox preview', () => {
  const { previewText, GIF_TAG } = require('../src/chat/gifs');
  test('a Giphy link reads as [GIF]; real text is untouched', () => {
    expect(GIF_TAG).toBe('[GIF]');
    expect(previewText('https://media4.giphy.com/media/v1.Y2lk/abc/giphy.gif')).toBe('[GIF]');
    expect(previewText('https://i.giphy.com/abc.gif')).toBe('[GIF]');
    // Words around a Giphy link stay; the link itself never shows.
    expect(previewText('hello https://media4.giphy.com/x')).toBe('hello [GIF]');
    expect(previewText('https://media3.giphy.com/media/v1.Yz/abc/100.gif')).toBe('[GIF]');
    expect(previewText('see https://example.com/x')).toBe('see https://example.com/x');
    expect(previewText(null)).toBe('');
  });
  test('new messages get it from the database, old rows are rewritten, pushes say it too', () => {
    const sql = read('supabase/migrations/20261030190000_gif_inbox_preview.sql');
    expect(sql).toMatch(/new\.kind = 'gif' then '\[GIF\]'/);
    expect(sql).toMatch(/update public\.conversations/);
    // The view-once cases from the last definition are kept.
    expect(sql).toMatch(/view_once/);
    expect(read('supabase/functions/message-push/index.ts')).toMatch(/case 'gif':\s*return '\[GIF\]'/);
  });
});

describe('the GIF button icon', () => {
  const GifIcon = require('../src/components/chat/GifIcon').default;
  test('is an SVG tag with the three letters, not text that a font can clip', async () => {
    await render(<GifIcon size={24} color="#fff" testID="gif-icon" />);
    expect(screen.getByTestId('gif-icon', { includeHiddenElements: true })).toBeTruthy();
    const composer = read('src/components/chat/Composer.js');
    expect(composer).toMatch(/<GifIcon/);
    expect(composer).not.toMatch(/gifBadge|gifText/);
  });
  test('the letters sit on the middle line of the tag', () => {
    const src = read('src/components/chat/GifIcon.js');
    // I runs 7.8 to 16.2 on a 24 high grid: centred on 12.
    expect(src).toMatch(/M19\.6 7\.8 L19\.6 16\.2/);
  });
});

describe('the sheet cannot freeze the phone', () => {
  test('a swipe-down finishes its slide on the UI thread, once, then tells the parent', () => {
    const src = read('src/components/BottomSheet.js');
    expect(src).toMatch(/leaving\.value = true/);
    expect(src).toMatch(/withTiming\(OFFSCREEN, \{ duration: 220 \}/);
    expect(src).toMatch(/scheduleOnRN\(notifyClose\)/);
    expect(src).toMatch(/failOffsetX/);
  });
  test('the emoji grid animates only what is on screen, and nothing while closing', () => {
    const src = read('src/components/chat/StickerPicker.js');
    expect(src).not.toMatch(/removeClippedSubviews/);
    expect(src).toMatch(/MAX_LIVE = 24/);
    expect(src).toMatch(/animate=\{!item\.flag && !closing && live\.has\(item\.code\)\}/);
    expect(src).toMatch(/setClosing\(true\)/);
  });
});

describe('layout clearances', () => {
  test('the tab bar clears the system bar; the composer sits higher', () => {
    const app = read('App.js');
    expect(app).toMatch(/ANDROID_BOTTOM_COMFORT = 20/);
    expect(app).toMatch(/lineHeight: Math\.round\(sizing\.label \* 1\.4\)/);
    expect(read('src/components/chat/Composer.js')).toMatch(/bottomInset \+ space\.sm \+ BAR_LIFT/);
  });
});
