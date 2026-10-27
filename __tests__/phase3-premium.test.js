import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.useFakeTimers();

let mockHub;
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));
jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  getPremiumAccess: jest.fn(),
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
const { PremiumProvider, usePremium, trialLeft, PAYWALL_PITCH } = require('../src/context/PremiumContext');
const { PRICE } = require('../src/components/premium/price');

const ME = { id: 'user-me', username: 'ama', display_name: 'Ama Mensah', avatar_url: null };
const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null };
const SQL = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261026210000_premium_blocks_push.sql'), 'utf8');

beforeEach(() => {
  mockHub = { userId: 'user-me', profile: ME, isAdmin: false, blocked: new Set(), block: jest.fn(async () => {}) };
  hub.getPremiumAccess.mockResolvedValue({ status: 'trial', hasAccess: true, isAdmin: false, trialEndsAt: new Date(Date.now() + 47 * 3600e3).toISOString() });
  hub.amIAdmin.mockResolvedValue(false);
});

// Shows what the provider says about Premium.
function Probe() {
  const { hasPremium, access } = usePremium();
  return <Text testID="probe">{`${hasPremium ? 'yes' : 'no'}:${access.status}`}</Text>;
}

describe('BOA Premium', () => {
  test('costs £1.99 a month, and the paywall says so', () => {
    expect(PRICE).toBe('£1.99');
    expect(PAYWALL_PITCH).toBe('Upgrade to BOA Premium for unlimited HD Video Calls, Hi-Fi Audio, and exclusive filters. £1.99/month.');
  });

  test('the database decides: a trial has access, an expired one does not', async () => {
    await render(
      <PremiumProvider>
        <Probe />
      </PremiumProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('yes:trial');

    hub.getPremiumAccess.mockResolvedValue({ status: 'expired', hasAccess: false, isAdmin: false, trialEndsAt: null });
    mockHub = { ...mockHub, userId: 'user-other' };
    await render(
      <PremiumProvider>
        <Probe />
      </PremiumProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('no:expired');
  });

  test('admins skip the paywall whatever their status', async () => {
    hub.getPremiumAccess.mockResolvedValue({ status: 'expired', hasAccess: false, isAdmin: false, trialEndsAt: null });
    mockHub = { ...mockHub, isAdmin: true };
    await render(
      <PremiumProvider>
        <Probe />
      </PremiumProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('yes:expired');
  });

  test('trial time left reads naturally', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(trialLeft('2026-10-28T12:00:00Z', now)).toBe('2 days left');
    expect(trialLeft('2026-10-27T16:00:00Z', now)).toBe('1 day 4 hrs left');
    expect(trialLeft('2026-10-26T15:00:00Z', now)).toBe('3 hrs left');
    expect(trialLeft('2026-10-26T12:40:00Z', now)).toBe('40 min left');
    expect(trialLeft('2026-10-26T11:00:00Z', now)).toBeNull();
  });

  test('the migration starts everyone on a 48-hour trial the app cannot change', () => {
    expect(SQL).toMatch(/subscription_status text not null default 'trial'/);
    expect(SQL).toMatch(/check \(subscription_status in \('trial', 'active', 'expired'\)\)/);
    expect(SQL).toMatch(/trial_start_date timestamptz not null default now\(\)/);
    expect(SQL).toMatch(/interval '48 hours'/);
    // The guard puts a new profile on a fresh trial and freezes both columns for non-admins.
    expect(SQL).toMatch(/new\.subscription_status := 'trial';\s*new\.trial_start_date := now\(\);/);
    expect(SQL).toMatch(/new\.subscription_status := old\.subscription_status;/);
    expect(SQL).toMatch(/'has_access', admin or status = 'active' or status = 'trial'/);
  });
});

describe('Hi-Fi audio', () => {
  const eq = require('../src/audio/eq');
  const EqualizerSheet = require('../src/components/radio/EqualizerSheet').default;

  test('settings clamp to -1..1, and without Premium the sound stays flat', () => {
    eq.setSession(42);
    eq.setAllowed(false);
    eq.setSettings({ bass: 3, treble: -0.5, spatial: true });
    expect(eq.getSettings()).toEqual({ bass: 1, treble: -0.5, spatial: true });
    expect(eqNative.apply).toHaveBeenLastCalledWith(42, eq.FLAT);
    eq.setAllowed(true);
    expect(eqNative.apply).toHaveBeenLastCalledWith(42, { bass: 1, treble: -0.5, spatial: true });
    eq.setSettings(eq.PRESETS.find((p) => p.id === 'bass').settings);
    expect(eq.presetOf(eq.getSettings())).toBe('bass');
  });

  test('locked behind "Unlock with BOA Premium" without access', async () => {
    hub.getPremiumAccess.mockResolvedValue({ status: 'expired', hasAccess: false, isAdmin: false, trialEndsAt: null });
    await render(
      <PremiumProvider>
        <EqualizerSheet open onClose={() => {}} />
      </PremiumProvider>,
    );
    expect(screen.getByTestId('eq-locked')).toBeOnTheScreen();
    expect(screen.getByText('Unlock with BOA Premium')).toBeOnTheScreen();
  });

  test('open with Premium: no lock, and presets shape the sound', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(
      <PremiumProvider>
        <EqualizerSheet open onClose={() => {}} />
      </PremiumProvider>,
    );
    expect(screen.queryByTestId('eq-locked')).toBeNull();
    await user.press(screen.getByTestId('eq-preset-vocal'));
    expect(eq.getSettings()).toEqual(eq.PRESETS.find((p) => p.id === 'vocal').settings);
  });
});

describe('beauty filters', () => {
  const { toAgora, describe: describeBeauty } = require('../src/calls/beauty');

  test('five native filters, each capped so no face is ever washed out', () => {
    const { FILTERS, fromStored } = require('../src/calls/beauty');
    expect(FILTERS.map((f) => f.label)).toEqual(['Brightness', 'Smooth Skin', 'Tone', 'Clarity', 'Saturation']);
    const max = toAgora({ studio: 1, flawless: 1, glow: 1, clarity: 1, saturation: 1, enabled: true });
    expect(max.beauty).toEqual(expect.objectContaining({ lighteningContrastLevel: 2, lighteningLevel: 0.2, smoothnessLevel: 0.5, rednessLevel: 0.3, sharpnessLevel: 0.8 }));
    expect(max.colorEnhance).toEqual({ enabled: true, strengthLevel: 0.7, skinProtectLevel: 1 });
    // Each slider drives only its own setting.
    expect(toAgora({ studio: 0.5 }).beauty).toEqual(expect.objectContaining({ enabled: true, lighteningLevel: 0.1, smoothnessLevel: 0, rednessLevel: 0, sharpnessLevel: 0 }));
    expect(toAgora({ flawless: 0.5 }).beauty).toEqual(expect.objectContaining({ lighteningLevel: 0, smoothnessLevel: 0.25, rednessLevel: 0, sharpnessLevel: 0.1 }));
    expect(toAgora({ glow: 0.5 }).beauty).toEqual(expect.objectContaining({ lighteningLevel: 0, smoothnessLevel: 0, rednessLevel: 0.15 }));
    // Clarity: sharpening and contrast, so tattoos and hairlines stay crisp.
    expect(toAgora({ clarity: 0.4 }).beauty).toEqual(expect.objectContaining({ enabled: true, sharpnessLevel: 0.28, lighteningContrastLevel: 1, smoothnessLevel: 0 }));
    expect(toAgora({ clarity: 1 }).beauty.lighteningContrastLevel).toBe(2);
    // Saturation: Agora's colour enhancement, with skin protected.
    expect(toAgora({ saturation: 0.5 })).toEqual({ beauty: expect.objectContaining({ enabled: false }), colorEnhance: { enabled: true, strengthLevel: 0.35, skinProtectLevel: 1 } });
    const off = toAgora({ studio: 1, flawless: 1, glow: 1, clarity: 1, saturation: 1, enabled: false });
    expect(off.beauty.enabled).toBe(false);
    expect(off.colorEnhance.enabled).toBe(false);
    expect(describeBeauty({ studio: 0.5, flawless: 0.4, glow: 0, clarity: 0.6, saturation: 0.35, enabled: true })).toBe('Bright 50% · Smooth 40% · Clarity 60% · Colour 35%');
    // Settings saved before the renames keep their strengths: smoothing is Smooth Skin, the old Tone Enhancer is Saturation.
    expect(fromStored({ smoothing: 0.7, tone: 0.2, enabled: false })).toEqual({ studio: 0.4, flawless: 0.7, glow: 0.3, clarity: 0.6, saturation: 0.2, enabled: false });
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
      <PremiumProvider>
        <CallProvider>
          <Dial />
        </CallProvider>
      </PremiumProvider>,
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
    for (const label of ['Brightness', 'Smooth Skin', 'Tone', 'Clarity', 'Saturation']) expect(screen.getByText(label)).toBeOnTheScreen();

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

  test('without Premium, calling shows the paywall instead', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    hub.getPremiumAccess.mockResolvedValue({ status: 'expired', hasAccess: false, isAdmin: false, trialEndsAt: null });
    signal.send.mockClear();
    await mount();
    await user.press(screen.getByText('Call Kofi'));
    expect(signal.send).not.toHaveBeenCalled();
    expect(screen.getByTestId('premium-paywall')).toBeOnTheScreen();
    expect(screen.getByText(PAYWALL_PITCH)).toBeOnTheScreen();
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
    expect(SQL).toMatch(/private\.push_settings/);
    const app = require('../app.json').expo;
    const notif = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications')[1];
    expect(notif.icon).toBe('./assets/notification-icon.png');
    expect(fs.existsSync(path.join(__dirname, '../assets/notification-icon.png'))).toBe(true);
  });
});

describe('the admin account skips every paywall', () => {
  const { CallProvider, useCall } = require('../src/context/CallContext');
  const EqualizerSheet = require('../src/components/radio/EqualizerSheet').default;
  function Dial() {
    const { startCall } = useCall();
    return <Text onPress={() => startCall(KOFI)}>Call Kofi</Text>;
  }
  const mount = () =>
    render(
      <PremiumProvider>
        <CallProvider>
          <Dial />
          <EqualizerSheet open onClose={() => {}} />
        </CallProvider>
      </PremiumProvider>,
    );

  beforeEach(() => {
    // Trial long over, and even with the Premium migration not yet run:
    // the database's admin check alone unlocks everything.
    hub.getPremiumAccess.mockRejectedValue(new Error('function premium_access() does not exist'));
    hub.amIAdmin.mockResolvedValue(true);
    signal.send.mockClear();
    return require('@react-native-async-storage/async-storage').clear();
  });

  test('Hi-Fi, video calls and beauty filters open straight away, with no paywall', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    expect(screen.queryByTestId('eq-locked')).toBeNull();
    await user.press(screen.getByText('Call Kofi'));
    expect(screen.queryByTestId('premium-paywall')).toBeNull();
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'ring', expect.anything());
    const { callId } = signal.send.mock.calls.at(-1)[2];
    await act(async () => mockSignal('accept', { callId }));
    await user.press(screen.getByTestId('call-filters-button'));
    expect(screen.getByTestId('call-filters')).toBeOnTheScreen();
    expect(screen.queryByTestId('premium-paywall')).toBeNull();
  });

  test('tapping before the database has answered waits for it instead of flashing the paywall', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    let answer;
    hub.amIAdmin.mockReturnValue(new Promise((r) => (answer = r)));
    await mount();
    expect(screen.queryByTestId('eq-locked')).toBeNull();
    await user.press(screen.getByText('Call Kofi'));
    expect(screen.queryByTestId('premium-paywall')).toBeNull();
    expect(signal.send).not.toHaveBeenCalled();
    await act(async () => answer(true));
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'ring', expect.anything());
    expect(screen.queryByTestId('premium-paywall')).toBeNull();
  });

  test('the same taps from a non-admin with an expired trial do show the paywall', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    hub.amIAdmin.mockResolvedValue(false);
    hub.getPremiumAccess.mockResolvedValue({ status: 'expired', hasAccess: false, isAdmin: false, trialEndsAt: null });
    await mount();
    expect(screen.getByTestId('eq-locked')).toBeOnTheScreen();
    await user.press(screen.getByText('Call Kofi'));
    expect(signal.send).not.toHaveBeenCalled();
    expect(screen.getByTestId('premium-paywall')).toBeOnTheScreen();
  });
});

