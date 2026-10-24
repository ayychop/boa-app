import { screen, userEvent } from '@testing-library/react-native';
import { curatedStations } from '../src/data/radioStations';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

// A layer of the Zen room that blows up on mount once armed (the boot
// loader draws grain too, before Zen is ever opened).
let mockArmed = false;
jest.mock('../src/components/Grain', () => () => {
  if (mockArmed) throw new Error('Grain failed to draw');
  return null;
});

jest.useFakeTimers();

test('if the Zen screen fails to draw, it says so and offers a retry; the rest of the app carries on', async () => {
  const probe = instrument();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await setWindow(PORTRAIT);
  const user = userEvent.setup();
  await bootIntoTabs(user);
  mockArmed = true;
  await openTab(user, 'Zen');
  await advance(300);
  expect(screen.getByTestId('zen-fallback')).toBeOnTheScreen();
  expect(screen.getByText('Grain failed to draw')).toBeOnTheScreen();
  // The tab bar still works.
  await openTab(user, 'Radio');
  expect(screen.getByText(curatedStations('afrobeats')[0].name)).toBeOnTheScreen();
  // Fixed, Try again brings the room back.
  mockArmed = false;
  await openTab(user, 'Zen');
  await user.press(screen.getByRole('button', { name: 'Try again' }));
  await advance(300);
  expect(screen.getByTestId('zen-screen')).toBeOnTheScreen();
  // React reports the caught error; nothing else may.
  expect(probe.errors.every((e) => /Grain failed to draw|error boundary|ZenBoundary/.test(e))).toBe(true);
  jest.restoreAllMocks();
});
