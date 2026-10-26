import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The welcome tour after a member's first sign-in, and "What's New" once per
// update (src/components/FirstRun.js).

jest.unmock('../src/components/FirstRun');

let mockHub = { stage: 'ready', userId: 'user-me' };
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));

const mockUpdate = jest.fn();
let mockRow = { has_seen_onboarding: false };
let mockError = null;
jest.mock('../src/lib/supabase', () => ({
  isConfigured: true,
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockError ? null : mockRow, error: mockError }) }) }),
      update: (patch) => ({ eq: async (_c, id) => mockUpdate(patch, id) }),
    }),
  },
}));

const FirstRun = require('../src/components/FirstRun').default;
const { SCENES } = require('../src/components/onboarding/FeatureTour');
const { WHATS_NEW, LAST_SEEN_KEY, shouldShowWhatsNew } = require('../src/lib/whats-new');

async function show(props = {}) {
  await render(<FirstRun freshInstall={false} {...props} />);
  await act(async () => {});
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockHub = { stage: 'ready', userId: 'user-me' };
  mockRow = { has_seen_onboarding: false };
  mockError = null;
  mockUpdate.mockClear();
  // Already read this version's notes, unless a test says otherwise.
  await AsyncStorage.setItem(LAST_SEEN_KEY, WHATS_NEW.version);
});

describe('the welcome tour', () => {
  test('shows after a first sign-in, walks through every feature and ends on Let\'s Go', async () => {
    await show();
    expect(screen.getByTestId('feature-tour')).toBeTruthy();
    for (const label of ['BOA Radio', 'BOA Originals', 'Zen Mode', 'The Creative Hub', 'Casting Board']) {
      expect(SCENES.some((s) => s.kicker === label)).toBe(true);
    }
    for (let i = 1; i < SCENES.length; i++) {
      expect(screen.getByText('Next')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('feature-tour-next'));
    }
    await fireEvent.press(screen.getByText("Let's Go"));
    await act(async () => {});
    expect(screen.queryByTestId('feature-tour')).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ has_seen_onboarding: true }, 'user-me');
  });

  test('never shows again once the profile says it has been seen', async () => {
    mockRow = { has_seen_onboarding: true };
    await show();
    expect(screen.queryByTestId('feature-tour')).toBeNull();
  });

  test('seen on this phone stays seen, even before the database has the column', async () => {
    mockError = { code: '42703', message: 'column profiles.has_seen_onboarding does not exist' };
    await show();
    await fireEvent.press(screen.getByText('Skip'));
    await act(async () => {});
    await screen.unmount();
    await show();
    expect(screen.queryByTestId('feature-tour')).toBeNull();
  });

  test('waits when the profile cannot be reached', async () => {
    mockError = { code: 'PGRST000', message: 'offline' };
    await show();
    expect(screen.queryByTestId('feature-tour')).toBeNull();
  });

  test('only for signed-in members', async () => {
    mockHub = { stage: 'signedOut', userId: null };
    await show();
    expect(screen.queryByTestId('feature-tour')).toBeNull();
  });
});

describe("What's New", () => {
  beforeEach(() => {
    mockRow = { has_seen_onboarding: true };
  });

  test('the rules: a new version shows, the same one does not, a fresh install skips', () => {
    expect(shouldShowWhatsNew('1.0.0', '1.1.0', false)).toBe(true);
    expect(shouldShowWhatsNew('1.1.0', '1.1.0', false)).toBe(false);
    expect(shouldShowWhatsNew(null, '1.1.0', false)).toBe(true);
    expect(shouldShowWhatsNew(null, '1.1.0', true)).toBe(false);
  });

  test('shows the notes once after an update and closes with Got it', async () => {
    await AsyncStorage.setItem(LAST_SEEN_KEY, '0.9.0');
    await show();
    expect(screen.getByTestId('whats-new')).toBeTruthy();
    for (const n of WHATS_NEW.notes) expect(screen.getByText(n.title)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('whats-new-done'));
    await act(async () => {});
    expect(screen.queryByTestId('whats-new')).toBeNull();
    expect(await AsyncStorage.getItem(LAST_SEEN_KEY)).toBe(WHATS_NEW.version);
  });

  test('closes with the X or a tap outside', async () => {
    await AsyncStorage.setItem(LAST_SEEN_KEY, '0.9.0');
    await show();
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByTestId('whats-new')).toBeNull();
    await screen.unmount();
    await AsyncStorage.setItem(LAST_SEEN_KEY, '0.9.0');
    await show();
    await fireEvent.press(screen.getByTestId('whats-new-backdrop'));
    expect(screen.queryByTestId('whats-new')).toBeNull();
  });

  test('a fresh install skips it and starts on this version', async () => {
    await AsyncStorage.removeItem(LAST_SEEN_KEY);
    await show({ freshInstall: true });
    expect(screen.queryByTestId('whats-new')).toBeNull();
    expect(await AsyncStorage.getItem(LAST_SEEN_KEY)).toBe(WHATS_NEW.version);
  });

  test('waits for the welcome tour to finish', async () => {
    mockRow = { has_seen_onboarding: false };
    await AsyncStorage.setItem(LAST_SEEN_KEY, '0.9.0');
    await show();
    expect(screen.getByTestId('feature-tour')).toBeTruthy();
    expect(screen.queryByTestId('whats-new')).toBeNull();
    await fireEvent.press(screen.getByText('Skip'));
    await act(async () => {});
    expect(screen.getByTestId('whats-new')).toBeTruthy();
  });
});
