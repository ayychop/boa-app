import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';

jest.useFakeTimers();

// Car Settings (the Android Auto theme), and the profile's BOA mark.

const mockAuto = { setTheme: jest.fn() };
jest.mock('../modules/boa-auto', () => ({
  isAvailable: true,
  setCatalogue: () => {},
  setPlayback: () => {},
  setTheme: (id) => mockAuto.setTheme(id),
  addCommandListener: () => () => {},
}));

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('Car Settings', () => {
  const CarSettings = require('../src/components/car/CarSettings').default;

  test('five themes to choose from, Noir Gold on, and a car-screen preview', async () => {
    await render(<CarSettings open onClose={() => {}} />);
    await act(async () => {});
    for (const id of ['noir', 'aurora', 'chrome', 'sunset', 'carbon']) expect(screen.getByTestId(`car-theme-${id}`)).toBeOnTheScreen();
    expect(screen.getByTestId('car-theme-noir').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('car-theme-preview')).toBeOnTheScreen();
  });

  test('a tap chooses it: the car is told at once and the tick moves', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(<CarSettings open onClose={() => {}} />);
    await act(async () => {});
    await user.press(screen.getByTestId('car-theme-aurora'));
    expect(mockAuto.setTheme).toHaveBeenLastCalledWith('aurora');
    expect(screen.getByTestId('car-theme-aurora').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('car-theme-noir').props.accessibilityState.checked).toBe(false);
    await user.press(screen.getByTestId('car-theme-noir'));
  });

  test('lives in the profile under Car Settings', () => {
    const src = read('src/screens/ProfileScreen.js');
    expect(src).toMatch(/<Slate[^>]*>Car Settings<\/Slate>/);
    expect(src).toMatch(/testID="profile-car-settings"/);
    expect(src).toMatch(/<CarSettings open=\{carOpen\}/);
  });
});

describe("the profile's BOA mark", () => {
  test('on the Hub profile: small, dead centre and faint, never off to the right', () => {
    const src = read('src/screens/hub/HubProfileScreen.js');
    const mark = src.match(/<LogoWatermark[\s\S]*?\/>/)[0];
    expect(mark).toMatch(/\* 0\.16\)/);
    expect(mark).toMatch(/left: 0, right: 0, alignItems: 'center'/);
    expect(mark).not.toMatch(/right: -/);
    const opacities = [...mark.matchAll(/0\.(\d+)/g)].map((m) => Number(`0.${m[1]}`)).filter((n) => n !== 0.16 && n !== 0.1);
    for (const o of opacities) expect(o).toBeLessThanOrEqual(0.08);
  });

  test('on the Profile tab: smaller, centred and faint too', () => {
    const src = read('src/screens/ProfileScreen.js');
    expect(src).toMatch(/<LogoWatermark height=\{84\} opacity=\{0\.05\} style=\{\{ left: 0, right: 0, top: 84, alignItems: 'center' \}\} \/>/);
  });
});
