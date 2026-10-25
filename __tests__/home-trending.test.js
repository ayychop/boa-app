import { screen, userEvent } from '@testing-library/react-native';
import { AppState, StyleSheet } from 'react-native';
import { advance, bootIntoTabs, instrument, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

let mockPicked = [];
jest.mock('../src/api/trending', () => ({
  ...jest.requireActual('../src/api/trending'),
  listTrending: jest.fn(async () => mockPicked),
}));

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

test("Home's trending row shows the stations BOA's admins picked, in their order", async () => {
  const { catalogue } = jest.requireActual('../src/api/trending');
  const [a, b] = catalogue();
  mockPicked = [b, a];
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await advance(300);
  const names = screen.getAllByRole('button', { name: /^Play / }).map((n) => n.props.accessibilityLabel);
  expect(names.slice(0, 2)).toEqual([`Play ${b.name}`, `Play ${a.name}`]);
});

test('with nothing picked, Home still shows its automatic picks', async () => {
  mockPicked = [];
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await advance(300);
  expect(screen.getAllByRole('button', { name: /^Play / }).length).toBeGreaterThan(0);
});

test('there is room between the genre line and "Trending on BOA Radio"', async () => {
  mockPicked = [];
  const user = userEvent.setup();
  await bootIntoTabs(user);
  const title = screen.getByText('Trending on BOA Radio');
  expect(StyleSheet.flatten(title.props.style).marginTop).toBe(12);
});
