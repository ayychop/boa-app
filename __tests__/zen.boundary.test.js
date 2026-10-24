import { screen, userEvent } from '@testing-library/react-native';
import { curatedStations } from '../src/data/radioStations';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

// A layer of the screensaver that blows up on mount once armed (the boot
// loader draws grain too, before Zen is ever opened).
let mockArmed = false;
jest.mock('../src/components/Grain', () => () => {
  if (mockArmed) throw new Error('Grain failed to draw');
  return null;
});

jest.useFakeTimers();

// Afrobeats, the default genre, is curated: its records render straight
// from local data.
const FIRST_STATION = curatedStations('afrobeats')[0].name;

test('if Zen Mode fails to draw, it closes and the app carries on', async () => {
  const probe = instrument();
  await setWindow(PORTRAIT);
  const user = userEvent.setup();
  await bootIntoTabs(user);
  mockArmed = true;
  await user.press(screen.getAllByRole('button', { name: 'Start Zen Mode' })[0]);
  await advance(500);
  expect(screen.queryByRole('button', { name: 'Close Zen Mode' })).not.toBeOnTheScreen();
  // The app is still there and still answers taps.
  await openTab(user, 'Radio');
  expect(screen.getByText(FIRST_STATION)).toBeOnTheScreen();
  // React reports the caught error; nothing else may.
  expect(probe.errors.every((e) => /Grain failed to draw|error boundary|ZenBoundary/.test(e))).toBe(true);
  jest.restoreAllMocks();
});
