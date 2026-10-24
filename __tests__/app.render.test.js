import { act, screen, userEvent, within } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { curatedStations } from '../src/data/radioStations';
import { advance, bootApp, bootIntoTabs, instrument, LANDSCAPE, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

// Afrobeats, the default genre, is curated: its records render straight
// from local data.
const FIRST_STATION = curatedStations('afrobeats')[0].name;

// What each tab must always show; a missing one fails the render.
const TABS = [
  ['Home', ['Trending on BOA Radio', '01 · Afrobeats · Hip Hop · R&B · Amapiano']],
  ['BOA Originals', ['Episodes']],
  ['Radio', ['Radio', 'Afrobeats', FIRST_STATION, 'Song info']],
  ['Chat', ['Messages']],
  ['Talent', ['roster.']],
  ['Zen', ['Sleep & Meditation', 'Soundscapes']],
  ['Profile', ['Zen Mode', 'My Library', 'Home screen widget']],
];

let probe;
beforeEach(async () => {
  probe = instrument();
  await setWindow(PORTRAIT);
});

afterEach(() => {
  // Any render loop ("Maximum update depth"), crash or failed prop type
  // lands here.
  expect(probe.errors).toEqual([]);
  jest.restoreAllMocks();
});

test('vibe check: every pill toggles and Get started enters the app', async () => {
  const user = userEvent.setup();
  await bootApp();
  for (const name of ['Afrobeats', 'R&B / Hip Hop', 'Podcasts', 'BOA Originals']) {
    const pill = screen.getByRole('checkbox', { name });
    expect(pill).not.toBeChecked();
    await user.press(pill);
    expect(screen.getByRole('checkbox', { name })).toBeChecked();
  }
  expect(screen.getByText('4 picked')).toBeOnTheScreen();
  await user.press(screen.getByRole('checkbox', { name: 'Podcasts' }));
  expect(screen.getByText('3 picked')).toBeOnTheScreen();
  await user.press(screen.getByText('Get started'));
  await advance(1000);
  expect(await screen.findByText('Trending on BOA Radio')).toBeOnTheScreen();
});

test.each([
  ['portrait', PORTRAIT],
  ['landscape (folded phone on its side)', LANDSCAPE],
])('every tab renders its content in %s', async (_, size) => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await setWindow(size);
  for (const [tab, texts] of TABS) {
    await openTab(user, tab);
    for (const text of texts) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  }
  // Rotating back and forth with everything mounted.
  for (let i = 0; i < 5; i++) {
    await setWindow(i % 2 ? PORTRAIT : LANDSCAPE);
    await advance(200);
  }
  await openTab(user, 'Radio');
  expect(screen.getByText(FIRST_STATION)).toBeOnTheScreen();
});

// Anything that would sit over the app in its own native window.
const modals = () => screen.root.queryAll((n) => n.type === 'RCTModalHostView');
const tabButton = (name) => screen.queryByRole('button', { name: new RegExp(`^${name}, tab`) });

test.each(['Home', 'Radio'])('the Zen button on %s switches to the Zen tab, with its controls', async (tab) => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, tab);
  const buttons = screen.getAllByRole('button', { name: 'Start Zen Mode' });
  await user.press(buttons[buttons.length - 1]);
  await advance(600);
  expect(screen.getByTestId('zen-screen')).toBeOnTheScreen();
  expect(screen.getByText('Sleep & Meditation')).toBeOnTheScreen();
  expect(tabButton('Zen')).toBeSelected();
  expect(modals()).toHaveLength(0);
  // An ordinary tab: the rest of the app is one tap away.
  await openTab(user, 'Profile');
  expect(screen.getByText('My Library')).toBeOnTheScreen();
});

test("Profile's Zen Mode row and the Zen tab itself both open Zen, in landscape too", async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await setWindow(LANDSCAPE);
  await openTab(user, 'Profile');
  await user.press(screen.getByText('Zen Mode'));
  await advance(600);
  expect(screen.getByTestId('zen-screen')).toBeOnTheScreen();
  await openTab(user, 'Home');
  await openTab(user, 'Zen');
  expect(screen.getByTestId('zen-screen')).toBeOnTheScreen();
});

test('locking the phone: straight to the Zen screensaver, never a modal, 25 cycles, app stays responsive', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Radio');
  let from = 'radio-stage';
  for (let i = 0; i < 25; i++) {
    await probe.lock(i % 2 ? 'inactive' : 'background');
    await advance(500);
    // Navigated while locked: the screensaver is already there, no tab bar.
    expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
    expect(tabButton('Home')).toBeNull();
    expect(modals()).toHaveLength(0);
    await probe.unlock();
    await advance(400);
    expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
    // A tap goes back to the tab you locked the phone on, with the tab bar.
    await user.press(screen.getByRole('button', { name: 'Wake Zen controls' }));
    await advance(300);
    expect(screen.queryByTestId('zen-screensaver')).toBeNull();
    expect(screen.getByTestId(from)).toBeOnTheScreen();
    expect(tabButton('Home')).toBeOnTheScreen();
    // And the app answers: off to another tab, which the next lock leaves from.
    await openTab(user, i % 2 ? 'Radio' : 'Talent');
    from = i % 2 ? 'radio-stage' : 'talent-scroll';
  }
  await openTab(user, 'Radio');
  expect(screen.getByText(FIRST_STATION)).toBeOnTheScreen();
  expect(probe.errors).toEqual([]);
});

test('the screensaver shows the radio with its controls while it plays, and Back returns to the tab it came from', async () => {
  const back = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, handler) => {
    back.push(handler);
    return { remove: () => back.splice(back.indexOf(handler), 1) };
  });
  const user = userEvent.setup();
  await bootIntoTabs(user);
  const station = screen.getAllByRole('button', { name: /^Play / })[0];
  const name = station.props.accessibilityLabel.replace(/^Play /, '');
  await user.press(station);
  await advance(200);
  await openTab(user, 'Talent');
  await probe.lock();
  await advance(500);
  await probe.unlock();
  await advance(400);
  expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
  expect(screen.getByText('Tap to go back to Talent')).toBeOnTheScreen();
  const card = screen.getByTestId('zen-radio-info');
  expect(within(card).getByText(name)).toBeOnTheScreen();
  // Its controls work the radio without waking Zen, and stay to play it again.
  await user.press(within(card).getByRole('button', { name: 'Pause radio' }));
  await advance(200);
  expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
  expect(within(screen.getByTestId('zen-radio-info')).getByRole('button', { name: 'Play radio' })).toBeOnTheScreen();
  // Back wakes it, straight to the tab the phone was locked on (handlers
  // run newest first, as on Android, until one takes it).
  const listening = back.length;
  await act(async () => {
    [...back].reverse().some((handler) => handler());
  });
  await advance(300);
  expect(screen.queryByTestId('zen-screensaver')).toBeNull();
  expect(screen.getByTestId('talent-scroll')).toBeOnTheScreen();
  expect(back).toHaveLength(listening - 1);
});

test('with nothing playing, the screensaver has no radio card', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Radio');
  await probe.lock();
  await advance(500);
  await probe.unlock();
  await advance(400);
  expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
  expect(screen.queryByTestId('zen-radio-info')).toBeNull();
  expect(screen.getByText('Tap to go back to Radio')).toBeOnTheScreen();
});

test('locking while Zen is open with its controls turns it into the screensaver', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Zen');
  expect(screen.getByTestId('zen-screen')).toBeOnTheScreen();
  await probe.lock();
  await advance(500);
  await probe.unlock();
  await advance(300);
  expect(screen.getAllByTestId('zen-screensaver')).toHaveLength(1);
  expect(screen.queryByTestId('zen-screen')).toBeNull();
});

test('leaving the Zen tab ends the screensaver, so coming back shows the controls', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await probe.lock();
  await advance(500);
  await probe.unlock();
  await user.press(screen.getByRole('button', { name: 'Wake Zen controls' }));
  await openTab(user, 'Home');
  await openTab(user, 'Zen');
  expect(screen.getByTestId('zen-screen')).toBeOnTheScreen();
});

test('the vibe check never drops into Zen on lock', async () => {
  await bootApp();
  await probe.lock();
  await advance(1000);
  await probe.unlock();
  await advance(400);
  expect(screen.queryByTestId('zen-screensaver')).toBeNull();
  expect(screen.getByText('Get started')).toBeOnTheScreen();
});

test('only a lock opens the screensaver: not sitting idle, not leaving the app', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Radio');
  // Left alone for a few minutes.
  await advance(180000);
  expect(screen.queryByTestId('zen-screensaver')).toBeNull();
  // Home button / app switcher / Shazam: background, but the screen stays on.
  await probe.setState('background');
  await advance(5000);
  await probe.setState('active');
  await advance(400);
  expect(screen.queryByTestId('zen-screensaver')).toBeNull();
  expect(screen.getByText(FIRST_STATION)).toBeOnTheScreen();
});

describe('nothing sits under the tab bar, with real phone insets', () => {
  // A phone with a status bar and 3-button navigation: 32pt top, 48pt bottom.
  const INSETS = { top: 32, bottom: 48, left: 0, right: 0 };
  // The bar's own height (49) plus the bottom inset it pads itself by.
  const TAB_BAR = 49 + INSETS.bottom;
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

  beforeEach(() => {
    require('react-native-safe-area-context').useSafeAreaInsets.mockImplementation(() => INSETS);
  });

  test.each([
    ['Home', 'home-scroll'],
    ['BOA Originals', 'originals-scroll'],
    ['Talent', 'talent-scroll'],
    ['Profile', 'profile-scroll'],
  ])('%s scrolls its last content clear of the tab bar', async (tab, id) => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, tab);
    const scroll = screen.getByTestId(id);
    expect(flat(scroll.props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(TAB_BAR);
  });

  test("Zen's controls sit above the tab bar", async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Zen');
    expect(flat(screen.getByTestId('zen-panel').props.style).bottom).toBeGreaterThanOrEqual(TAB_BAR);
  });

  test('each tab label stays on one line and shrinks to fit (six tabs)', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    for (const name of ['Home', 'Radio', 'Zen', 'BOA Originals', 'Talent', 'Profile']) {
      expect(tabButton(name)).toBeOnTheScreen();
      const label = screen.getAllByText(name).find((t) => t.props.adjustsFontSizeToFit);
      expect(label.props.numberOfLines).toBe(1);
    }
  });
});
