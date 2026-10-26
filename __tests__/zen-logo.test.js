import { screen, userEvent } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

let probe;
beforeEach(async () => {
  probe = instrument();
  AppState.currentState = 'active';
  await setWindow(PORTRAIT);
});
afterEach(() => {
  expect(probe.errors).toEqual([]);
  jest.restoreAllMocks();
});

test('the screensaver is signed with a faint BOA mark under the clock; the Zen page is not', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Zen');
  expect(screen.queryByTestId('zen-logo')).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Play Rain' }));
  await advance(200);
  await probe.lock();
  await advance(1000);
  expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
  const mark = screen.getByTestId('zen-logo');
  expect(mark).toBeOnTheScreen();
  expect(mark).toHaveStyle({ opacity: 0.3 });
});
