import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.useFakeTimers();

let mockHub;
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));
jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  amIAdmin: jest.fn(async () => false),
  uploadBlockEvidence: jest.fn(async () => 'https://x.supabase.co/storage/v1/object/public/block-evidence/user-me/block-1.jpg'),
}));
// Call ringing: the test plays the other phone.
let mockSignal = null;
jest.mock('../src/calls/signaling', () => ({
  listen: jest.fn((me, fn) => {
    mockSignal = fn;
    return () => {
      mockSignal = null;
    };
  }),
  send: jest.fn(async () => true),
  pushRing: jest.fn(async () => true),
}));
jest.mock('../modules/boa-eq', () => ({ isAvailable: true, apply: jest.fn(() => true), release: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///shot.png', mimeType: 'image/png' }] })),
}));

const hub = require('../src/api/hub');
const signal = require('../src/calls/signaling');
const eqNative = require('../modules/boa-eq');

const ME = { id: 'user-me', username: 'ama', display_name: 'Ama Mensah', avatar_url: null };
const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null };
const SQL = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261026210000_premium_blocks_push.sql'), 'utf8');

beforeEach(() => {
  mockHub = { userId: 'user-me', profile: ME, isAdmin: false, blocked: new Set(), block: jest.fn(async () => {}) };
  hub.amIAdmin.mockResolvedValue(false);
});

describe('the whole app is free', () => {
  const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

  test('no paywall, price, plan or payment code is left in the app', () => {
    expect(fs.existsSync(path.join(__dirname, '../src/context/PremiumContext.js'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../src/components/premium'))).toBe(false);
    const files = [...walk(path.join(__dirname, '../src')), path.join(__dirname, '../App.js')].filter((f) => /\.js$/.test(f));
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text).not.toMatch(/PremiumContext|PremiumProvider|requirePremium|usePremium|PAYWALL|isPremiumVibe/);
      expect(text).not.toMatch(/Go Premium|Upgrade to BOA|Unlock with BOA|part of BOA Premium/);
      expect(text).not.toMatch(/stripe|revenuecat|react-native-purchases/i);
    }
    const pkg = SRC('package.json');
    expect(pkg).not.toMatch(/stripe|revenuecat|react-native-purchases/i);
  });

  test('Profile has no upgrade banner and the Hi Fi sheet has no lock', () => {
    expect(SRC('src/screens/ProfileScreen.js')).not.toMatch(/premium/i);
    expect(SRC('src/components/radio/EqualizerSheet.js')).not.toMatch(/premium|eq-locked|lock-closed/i);
  });

  test('every chat vibe, and Custom, is open to everyone', () => {
    const vibes = require('../src/chat/vibes');
    expect(vibes.isPremiumVibe).toBeUndefined();
    expect(vibes.allowedVibe).toBeUndefined();
    expect(vibes.FREE_VIBES).toBeUndefined();
  });
});

describe('Hi-Fi audio', () => {
  const eq = require('../src/audio/eq');
  const EqualizerSheet = require('../src/components/radio/EqualizerSheet').default;

  test('settings clamp to -1..1 and shape the sound for everyone', () => {
    eq.setSession(42);
    eq.setSettings({ bass: 3, treble: -0.5, spatial: true });
    expect(eq.getSettings()).toEqual({ bass: 1, treble: -0.5, loudness: 0, vocals: 0, spatial: true, boost: false, link: true });
    expect(eq.setAllowed).toBeUndefined();
    expect(eqNative.apply).toHaveBeenLastCalledWith(42, { bass: 1, treble: -0.5, loudness: 0, vocals: 0, spatial: true, boost: false, link: true });
    eq.setSettings(eq.PRESETS.find((p) => p.id === 'bass').settings);
    expect(eq.presetOf(eq.getSettings())).toBe('bass');
  });

  test('Bass Boost: a preset and a switch, reaching the native effects (BassBoost and LoudnessEnhancer)', () => {
    eq.setSession(42);
    eq.setSettings(eq.PRESETS.find((p) => p.id === 'boost').settings);
    expect(eq.presetOf(eq.getSettings())).toBe('boost');
    expect(eqNative.apply).toHaveBeenLastCalledWith(42, expect.objectContaining({ bass: 1, boost: true }));
    eq.setSettings({ boost: false });
    expect(eq.presetOf(eq.getSettings())).toBeNull();
    const kt = require('fs').readFileSync(require('path').join(__dirname, '../modules/boa-eq/android/src/main/java/expo/modules/boaeq/BoaEqModule.kt'), 'utf8');
    expect(kt).toMatch(/LoudnessEnhancer\(sessionId\)/);
    expect(kt).toMatch(/if \(boost\) BOOST_GAIN_MILLIBELS/);
    eq.setSettings(eq.SIGNATURE);
  });

  test('the old maximum is the new zero: everyone starts on BOA Signature, and Flat is truly flat', () => {
    expect(eq.SIGNATURE).toEqual({ bass: 0, treble: 0, loudness: 0, vocals: 0, spatial: false, boost: false, link: true });
    expect(eq.FLAT).toEqual({ bass: -1, treble: -1, loudness: 0, vocals: 0, spatial: false, boost: false, link: true });
    expect(eq.PRESETS[0]).toEqual(expect.objectContaining({ id: 'signature', settings: eq.SIGNATURE }));
    expect(eq.PRESETS.find((p) => p.id === 'flat').settings).toBe(eq.FLAT);
    eq.setSession(42);
    eq.setSettings(eq.FLAT);
    expect(eqNative.apply).toHaveBeenLastCalledWith(42, eq.FLAT);
    eq.setSettings(eq.SIGNATURE);
    expect(eqNative.apply).toHaveBeenLastCalledWith(42, eq.SIGNATURE);
    expect(eq.presetOf(eq.getSettings())).toBe('signature');
  });

  test('a fresh install starts on Signature; settings saved on the old scale start on Signature too, keeping Spatial and Bass Boost', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.clear();
    let fresh;
    jest.isolateModules(() => {
      fresh = require('../src/audio/eq');
    });
    await act(async () => {});
    expect(fresh.getSettings()).toEqual(fresh.SIGNATURE);

    await AsyncStorage.setItem('boa.eq.v1', JSON.stringify({ bass: 0.2, treble: -0.4, spatial: true, boost: true }));
    let migrated;
    jest.isolateModules(() => {
      migrated = require('../src/audio/eq');
    });
    await act(async () => {});
    expect(migrated.getSettings()).toEqual({ bass: 0, treble: 0, loudness: 0, vocals: 0, spatial: true, boost: true, link: true });

    // Saved on the new scale: read as it is.
    await AsyncStorage.setItem('boa.eq.v2', JSON.stringify({ bass: 0.5, treble: 0.2, spatial: false, boost: false }));
    let saved;
    jest.isolateModules(() => {
      saved = require('../src/audio/eq');
    });
    await act(async () => {});
    expect(saved.getSettings()).toEqual({ bass: 0.5, treble: 0.2, loudness: 0, vocals: 0, spatial: false, boost: false, link: true });
    await AsyncStorage.clear();
  });

  test('open to everyone: no lock, and presets shape the sound', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(
        <EqualizerSheet open onClose={() => {}} />,
    );
    expect(screen.queryByTestId('eq-locked')).toBeNull();
    await user.press(screen.getByTestId('eq-preset-vocal'));
    expect(eq.getSettings()).toEqual(eq.PRESETS.find((p) => p.id === 'vocal').settings);
  });

  test('maxing the bass: the card lights gold, says PAST STOCK and reads +12 dB; Signature reads as such', async () => {
    await render(
        <EqualizerSheet open onClose={() => {}} />,
    );
    await act(async () => eq.setSettings(eq.SIGNATURE));
    expect(screen.getByTestId('eq-bass-value')).toHaveTextContent('Signature');
    expect(screen.queryByTestId('eq-bass-past')).toBeNull();
    // The slider snaps to its steps, so presets match exactly after a drag.
    await act(async () => screen.getByTestId('eq-bass').props.onValueChange(0.99999));
    expect(eq.getSettings().bass).toBe(1);
    expect(screen.getByTestId('eq-bass-value')).toHaveTextContent('+12 dB');
    expect(screen.getByTestId('eq-bass-past')).toHaveTextContent('PAST STOCK');
    expect(screen.getByTestId('eq-bass-card')).toHaveStyle({ borderColor: 'rgba(226,168,75,0.55)' });
    await act(async () => screen.getByTestId('eq-bass').props.onValueChange(-1));
    expect(screen.getByTestId('eq-bass-value')).toHaveTextContent('Flat');
    await act(async () => eq.setSettings(eq.SIGNATURE));
  });
});

describe('beauty filters', () => {
  const { toAgora, describe: describeBeauty } = require('../src/calls/beauty');

  test('six presets and Brightness, each capped so no face is ever washed out', () => {
    const { PRESETS, fromStored } = require('../src/calls/beauty');
    for (const p of PRESETS) {
      const { beauty, colorEnhance } = toAgora({ preset: p.id, brightness: 1, enabled: true });
      expect(beauty.smoothnessLevel).toBeLessThanOrEqual(0.5);
      expect(beauty.rednessLevel).toBeLessThanOrEqual(0.3);
      expect(beauty.sharpnessLevel).toBeLessThanOrEqual(0.8);
      expect(beauty.lighteningLevel).toBeLessThanOrEqual(0.35);
      expect(colorEnhance.strengthLevel).toBeLessThanOrEqual(0.7);
      expect(colorEnhance.skinProtectLevel).toBe(1);
    }
    expect(describeBeauty({ preset: 'cinematic', brightness: 0.7, enabled: true })).toBe('Cinematic · Bright +40');
    // Brightness saved before it became exposure meant lightening: it starts again on Auto.
    expect(fromStored({ studio: 0.7, flawless: 0.2, enabled: false })).toEqual({ preset: 'natural', brightness: 0.5, contrast: 0.5, enabled: false, mode: 'filters', enhance: 0.55 });
    expect(fromStored({ preset: 'golden', brightness: 0.3 })).toEqual({ preset: 'golden', brightness: 0.5, contrast: 0.5, enabled: true, mode: 'filters', enhance: 0.55 });
    expect(fromStored({ preset: 'golden', brightness: 0.3, v: 2 })).toEqual({ preset: 'golden', brightness: 0.3, contrast: 0.5, enabled: true, mode: 'filters', enhance: 0.55 });
    expect(fromStored({ preset: 'nope' }).preset).toBe('natural');
  });

  test('no filter copy singles anyone out: inclusive words only', () => {
    const src = ['src/calls/beauty.js', 'src/components/calls/CallScreen.js'].map((f) => require('fs').readFileSync(require('path').join(__dirname, '..', f), 'utf8')).join('');
    expect(src).not.toMatch(/melanin/i);
  });
});

describe('video calls', () => {
  const { CallProvider, useCall } = require('../src/context/CallContext');
  function Dial() {
    const { startCall } = useCall();
    return <Text onPress={() => startCall(KOFI)}>Call Kofi</Text>;
  }
  const mount = () =>
    render(
      <CallProvider>
        <Dial />
      </CallProvider>,
    );

  test('ringing out, answered, live controls, filters, then hanging up', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Call Kofi'));
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'ring', expect.objectContaining({ video: true, from: expect.objectContaining({ id: 'user-me', name: 'Ama Mensah' }) }));
    expect(screen.getByTestId('call-status')).toHaveTextContent('Ringing…');
    const { callId } = signal.send.mock.calls.at(-1)[2];

    await act(async () => mockSignal('accept', { callId }));
    await act(async () => jest.advanceTimersByTime(3000));
    expect(screen.getByTestId('call-status')).toHaveTextContent('00:03');

    await user.press(screen.getByTestId('call-mute'));
    expect(screen.getByLabelText('Unmute')).toBeOnTheScreen();
    await user.press(screen.getByTestId('call-filters-button'));
    expect(screen.getByTestId('call-filters')).toBeOnTheScreen();
    for (const label of ['Natural', 'Studio', 'Golden', 'Cinematic', 'Glow', 'B&W', 'Brightness']) expect(screen.getByText(label)).toBeOnTheScreen();
    // A preset is one tap, and reaches the camera with its grade.
    await user.press(screen.getByTestId('call-preset-bw'));
    expect(screen.getByTestId('call-preset-bw').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));

    await user.press(screen.getByTestId('call-end'));
    expect(signal.send).toHaveBeenLastCalledWith('user-kofi', 'end', { callId });
    expect(screen.getByTestId('call-status')).toHaveTextContent('Call ended');
    await act(async () => jest.advanceTimersByTime(2000));
    expect(screen.queryByTestId('call-screen')).toBeNull();
  });

  test('an incoming call can be declined; a blocked caller never rings', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await act(async () => mockSignal('ring', { callId: 'c-1', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    expect(screen.getByTestId('call-status')).toHaveTextContent('Incoming video call');
    await user.press(screen.getByTestId('call-decline'));
    expect(signal.send).toHaveBeenLastCalledWith('user-kofi', 'decline', { callId: 'c-1' });
    await act(async () => jest.advanceTimersByTime(2000));

    mockHub = { ...mockHub, blocked: new Set(['user-zed']) };
    await mount();
    await act(async () => mockSignal('ring', { callId: 'c-2', from: { id: 'user-zed', name: 'Zed' } }));
    expect(screen.queryByTestId('call-screen')).toBeNull();
  });

  test('anyone can start a call: there is no plan to check', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    signal.send.mockClear();
    await mount();
    await user.press(screen.getByText('Call Kofi'));
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'ring', expect.anything());
    expect(screen.queryByTestId('premium-paywall')).toBeNull();
  });
});

describe('blocking with a reason and a screenshot', () => {
  const BlockSheet = require('../src/components/hub/BlockSheet').default;

  test('the reason and the uploaded screenshot go with the block', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onClose = jest.fn();
    await render(<BlockSheet person={KOFI} onClose={onClose} />);
    await user.press(screen.getByTestId('block-reason-harassment'));
    await user.type(screen.getByTestId('block-details'), 'Kept messaging after I said no');
    await user.press(screen.getByTestId('block-add-screenshot'));
    expect(screen.getByText('Screenshot attached')).toBeOnTheScreen();
    await user.press(screen.getByTestId('block-confirm'));
    expect(hub.uploadBlockEvidence).toHaveBeenCalledWith('user-me', expect.objectContaining({ uri: 'file:///shot.png' }));
    expect(mockHub.block).toHaveBeenCalledWith('user-kofi', {
      reason: 'Harassment: Kept messaging after I said no',
      evidenceUrl: 'https://x.supabase.co/storage/v1/object/public/block-evidence/user-me/block-1.jpg',
    });
    expect(onClose).toHaveBeenCalledWith(true);
  });

  test('evidence links resolve to their storage path, and the database keeps https only', () => {
    expect(hub.evidencePath('https://x.supabase.co/storage/v1/object/public/block-evidence/user-me/block-1.jpg')).toBe('user-me/block-1.jpg');
    expect(hub.evidencePath('file:///shot.png')).toBeNull();
    expect(SQL).toMatch(/block_reason text/);
    expect(SQL).toMatch(/block_evidence_url text check \(block_evidence_url ~ '\^https:\/\/'\)/);
    expect(SQL).toMatch(/"admins read all blocks"[\s\S]*public\.is_admin\(\)/);
    expect(SQL).toMatch(/'block-evidence', 'block-evidence', false/);
  });
});

describe('push notifications', () => {
  test('the Edge Function sends heads-up pushes with the chat channel, and the icon is the BOA mark', () => {
    const fn = fs.readFileSync(path.join(__dirname, '../supabase/functions/message-push/index.ts'), 'utf8');
    expect(fn).toMatch(/priority: 'high'/);
    expect(fn).toMatch(/channelId: `boa-chat-\$\{t\.sound\}`/);
    expect(fn).toMatch(/x-boa-push-secret/);
    // Message requests arrive quietly: no sound, the low-importance channel, passive on iPhone, never the message itself.
    expect(fn).toMatch(/channelId: 'boa-chat-requests'/);
    expect(fn).toMatch(/interruptionLevel: 'passive'/);
    expect(fn).toMatch(/body: `\$\{title\} wants to message you`/);
    expect(SQL).toMatch(/private\.push_settings/);
    const app = require('../app.json').expo;
    const notif = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications')[1];
    // One compact white glyph (the skyline O), never the whole wordmark squeezed into 24dp.
    expect(notif.icon).toBe('./assets/notification-small-icon.png');
    expect(fs.existsSync(path.join(__dirname, '../assets/notification-small-icon.png'))).toBe(true);
  });
});
