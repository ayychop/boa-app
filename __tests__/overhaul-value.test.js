import fs from 'fs';
import path from 'path';
import { render, screen, userEvent } from '@testing-library/react-native';

jest.useFakeTimers();

const { shapeConversation, inboxOf, INBOX_FILTERS } = require('../src/api/hub');
const { RINGTONE_HAPTICS } = require('../src/calls/ringtoneHaptics');
const { RINGTONES, ringtoneHaptics } = require('../src/calls/ringtone');
const { VIBES, FREE_VIBES, allowedVibe, isPremiumVibe, vibeById } = require('../src/chat/vibes');

const ME = 'user-me';
const THEM = 'user-them';
// A conversation row as the database returns it, me on side a.
const row = (extra = {}) => ({
  id: 'c1',
  user_a: ME,
  user_b: THEM,
  last_message_at: new Date().toISOString(),
  last_sender_id: THEM,
  a_accepted_at: null,
  b_accepted_at: new Date().toISOString(),
  a_folder: 'primary',
  b_folder: 'primary',
  ...extra,
});

describe('the inbox: Primary, General and Requests', () => {
  test('three filters, in order', () => {
    expect(INBOX_FILTERS.map((f) => f.label)).toEqual(['Primary', 'General', 'Requests']);
  });

  test("someone new who wrote first is a request until you answer or accept; then it's Primary", () => {
    expect(inboxOf(shapeConversation(row(), ME))).toBe('requests');
    expect(inboxOf(shapeConversation(row({ a_accepted_at: new Date().toISOString() }), ME))).toBe('primary');
    // Their side: the one who wrote it never sees their own chat as a request.
    expect(inboxOf(shapeConversation(row(), THEM))).toBe('primary');
  });

  test('General is your choice per chat, on your side only', () => {
    const c = row({ a_accepted_at: new Date().toISOString(), a_folder: 'general' });
    expect(inboxOf(shapeConversation(c, ME))).toBe('general');
    expect(inboxOf(shapeConversation(c, THEM))).toBe('primary');
  });

  test('before the migration runs nothing is a request, and a chat with no folder is Primary', () => {
    const old = { id: 'c1', user_a: ME, user_b: THEM, last_message_at: new Date().toISOString(), last_sender_id: THEM };
    expect(inboxOf(shapeConversation(old, ME))).toBe('primary');
    expect(inboxOf({ id: 'x' })).toBe('primary');
  });

  test('the migration: accepted and folder per side, set by sending, and two member-only functions', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261027210000_inbox_folders_and_requests.sql'), 'utf8');
    expect(sql).toMatch(/a_accepted_at timestamptz/);
    expect(sql).toMatch(/create trigger messages_accept after insert on public\.messages/);
    // Existing chats aren't turned into requests.
    expect(sql).toMatch(/update public\.conversations c\s+set a_accepted_at = coalesce/);
    for (const fn of ['accept_conversation', 'set_conversation_folder']) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`));
      expect(sql).toMatch(new RegExp(`function public\\.${fn}[\\s\\S]*?is_member\\(conv\\)`));
    }
  });
});

describe('ringtones: the buzz lands on the bass', () => {
  test('every ringtone has a pattern: wait, buzz, ..., one loop long, never negative', () => {
    // Loop lengths of the WAVs (scripts/ringtone-haptics.py reads them from the files).
    const LOOP_MS = { afrobeats: 9231, bashment: 7500, hiphop: 8000, rnb: 6857 };
    for (const r of RINGTONES) {
      const p = RINGTONE_HAPTICS[r.id];
      expect(p).toBeDefined();
      expect(p.length % 2).toBe(1); // starts and ends on a wait
      for (const ms of p) expect(ms).toBeGreaterThanOrEqual(0);
      expect(p.reduce((a, b) => a + b, 0)).toBe(LOOP_MS[r.id]);
      // Buzzes are short taps on the hits, never a drone.
      for (let i = 1; i < p.length; i += 2) expect(p[i]).toBeLessThanOrEqual(130);
      expect(ringtoneHaptics(r.id)).toBe(p);
    }
  });

  test('the native ring gets the same pattern as the app, for a BOA ringtone', async () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/calls/incoming.js'), 'utf8');
    expect(src).toMatch(/vibration: sound\.vibration/);
    const { ringSound, setRingMode } = require('../src/calls/ringtone');
    await setRingMode('boa');
    expect(ringSound('bashment')).toEqual({ soundUri: '', channelId: 'boa-call-bashment', vibration: ringtoneHaptics('bashment') });
    // The phone's own ringtone: no channel sound, no song, the standard buzz.
    await setRingMode('phone');
    expect(ringSound('bashment')).toEqual({ soundUri: '', channelId: '', vibration: [0, 800, 600, 800, 1600] });
  });
});

describe('Premium chat vibes', () => {
  test('four free vibes; the rest, and Custom, are Premium', () => {
    expect(FREE_VIBES).toEqual(['noir', 'neon', 'minimalist', 'the-block']);
    expect(VIBES.filter((v) => isPremiumVibe(v.id)).length).toBe(8);
    expect(isPremiumVibe('custom')).toBe(true);
  });

  test('a saved Premium vibe shows as Noir while Premium is locked, and comes back with it', () => {
    const midnight = vibeById('midnight');
    expect(allowedVibe(midnight, false).id).toBe('noir');
    expect(allowedVibe(midnight, true).id).toBe('midnight');
    expect(allowedVibe(vibeById('neon'), false).id).toBe('neon');
  });

  test('locked: Premium cards wear a lock, and a tap asks instead of opening the colour picker', async () => {
    const VibePicker = require('../src/components/chat/VibePicker').default;
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onChange = jest.fn();
    await render(<VibePicker value="noir" onChange={onChange} locked />);
    expect(screen.getByTestId('chat-vibe-midnight-locked')).toBeOnTheScreen();
    expect(screen.queryByTestId('chat-vibe-neon-locked')).toBeNull();
    await user.press(screen.getByTestId('chat-vibe-custom'));
    expect(onChange).toHaveBeenCalledWith('custom');
    expect(screen.queryByTestId('chat-color-picker')).toBeNull();
  });
});

describe('the paywall only promises what Premium unlocks', () => {
  test('no ads, early access or downloads claimed anywhere', () => {
    const files = ['src/components/premium/PremiumScreen.js', 'src/screens/ProfileScreen.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
    expect(files).not.toMatch(/ad-free|early access|offline downloads/i);
    // The price comes from the one constant.
    expect(files).not.toMatch(/£\d/);
  });
});
