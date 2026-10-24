import { screen, userEvent } from '@testing-library/react-native';
import { curatedStations } from '../src/data/radioStations';
import { advance, bootApp, bootIntoTabs, instrument, LANDSCAPE, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

// Afrobeats, the default genre, is curated: its records render straight
// from local data.
const FIRST_STATION = curatedStations('afrobeats')[0].name;

// What each tab must always show; a missing one fails the render.
const TABS = [
  ['Home', ['Trending on BOA Radio', '01 · Afrobeats · Hip Hop · R&B · Amapiano']],
  ['Radio', ['Radio', 'Afrobeats', FIRST_STATION]],
  ['BOA Originals', ['Episodes']],
  ['Talent', ['roster.']],
  ['Profile', ['Zen Mode', 'My Library']],
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

test.each(['Home', 'Radio'])('the Zen button on %s opens Zen Mode with its controls, and Close closes it', async (tab) => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, tab);
  const buttons = screen.getAllByRole('button', { name: 'Start Zen Mode' });
  await user.press(buttons[buttons.length - 1]);
  await advance(1200);
  expect(screen.getByRole('button', { name: 'Close Zen Mode' })).toBeOnTheScreen();
  expect(screen.getByText('Zen Mode')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Close Zen Mode' }));
  await advance(400);
  expect(screen.queryByRole('button', { name: 'Close Zen Mode' })).not.toBeOnTheScreen();
  // The app under it still answers.
  await openTab(user, 'Profile');
  expect(screen.getByText('My Library')).toBeOnTheScreen();
});

test("Profile's Zen Mode row opens Zen Mode, in landscape too", async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await setWindow(LANDSCAPE);
  await openTab(user, 'Profile');
  await user.press(screen.getByText('Zen Mode'));
  await advance(1200);
  expect(screen.getByRole('button', { name: 'Close Zen Mode' })).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Close Zen Mode' }));
  await advance(400);
  expect(screen.queryByRole('button', { name: 'Close Zen Mode' })).not.toBeOnTheScreen();
});

test('locking the phone: nothing mounts while locked, passive Zen on return, 25 cycles, app stays responsive', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  for (let i = 0; i < 25; i++) {
    await probe.setState(i % 2 ? 'inactive' : 'background');
    await advance(1000);
    expect(screen.queryByRole('button', { name: 'Exit Zen Mode' })).not.toBeOnTheScreen();
    await probe.setState('active');
    await advance(400);
    // Passive: the picture only, no controls.
    expect(screen.getByRole('button', { name: 'Exit Zen Mode' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Close Zen Mode' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Exit Zen Mode' }));
    await advance(400);
    expect(screen.queryByRole('button', { name: 'Exit Zen Mode' })).not.toBeOnTheScreen();
  }
  await openTab(user, 'Radio');
  expect(screen.getByText(FIRST_STATION)).toBeOnTheScreen();
});

test('locking while active Zen is open keeps it open and adds nothing', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await user.press(screen.getAllByRole('button', { name: 'Start Zen Mode' })[0]);
  await advance(1200);
  await probe.setState('background');
  await advance(1000);
  await probe.setState('active');
  await advance(400);
  expect(screen.getAllByRole('button', { name: 'Close Zen Mode' })).toHaveLength(1);
});

test('the vibe check never drops into Zen on lock', async () => {
  await bootApp();
  await probe.setState('background');
  await advance(1000);
  await probe.setState('active');
  await advance(400);
  expect(screen.queryByRole('button', { name: 'Exit Zen Mode' })).not.toBeOnTheScreen();
  expect(screen.getByText('Get started')).toBeOnTheScreen();
});

test('left idle for a minute, the app drifts into passive Zen; a tap wakes it', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await advance(62000);
  expect(screen.getByRole('button', { name: 'Exit Zen Mode' })).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Exit Zen Mode' }));
  await advance(400);
  expect(screen.queryByRole('button', { name: 'Exit Zen Mode' })).not.toBeOnTheScreen();
});
