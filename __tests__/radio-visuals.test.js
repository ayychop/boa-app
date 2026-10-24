import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import ImageColors from 'react-native-image-colors';
import Vinyl from '../src/components/Vinyl';
import { FALLBACK_GLOW, glowFor } from '../src/api/stationColor';
import { colors } from '../src/theme';

jest.useFakeTimers();

const station = { kind: 'radio', id: 's1', name: 'Test', logo: 'https://example.com/logo.png' };

describe('the record spins only while the radio plays', () => {
  test('starts turning on play and stops (coasting to rest) on pause', async () => {
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    const cancel = jest.spyOn(Reanimated, 'cancelAnimation');
    const screen = await render(<Vinyl station={station} size={200} spinning={false} status="paused" />);
    expect(repeat).not.toHaveBeenCalled();

    await screen.rerender(<Vinyl station={station} size={200} spinning status="playing" />);
    expect(repeat).toHaveBeenCalledTimes(1);

    await screen.rerender(<Vinyl station={station} size={200} spinning={false} status="paused" />);
    expect(cancel).toHaveBeenCalled();
    // Paused stays paused: no new spin is started.
    expect(repeat).toHaveBeenCalledTimes(1);

    await screen.rerender(<Vinyl station={station} size={200} spinning status="playing" />);
    expect(repeat).toHaveBeenCalledTimes(2);
  });
});

describe("the glow comes from the station's logo, else BOA gold", () => {
  test('the fallback is BOA gold', () => {
    expect(FALLBACK_GLOW).toBe(colors.gold);
  });

  test('a vibrant logo gives its own colour', async () => {
    ImageColors.getColors.mockResolvedValueOnce({ platform: 'android', vibrant: '#1E88E5', dominant: '#101010' });
    const c = await glowFor({ ...station, id: 'blue' });
    expect(c).not.toBe(FALLBACK_GLOW);
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('a blank or all-grey logo falls back to gold', async () => {
    ImageColors.getColors.mockResolvedValueOnce({ platform: 'android', vibrant: '#808080', dominant: '#000000', muted: '#FFFFFF' });
    expect(await glowFor({ ...station, id: 'grey' })).toBe(colors.gold);
  });

  test('a logo that fails to load falls back to gold', async () => {
    ImageColors.getColors.mockRejectedValueOnce(new Error('404'));
    expect(await glowFor({ ...station, id: 'broken' })).toBe(colors.gold);
  });

  test('a station with no logo falls back to gold', async () => {
    expect(await glowFor({ ...station, id: 'none', logo: null })).toBe(colors.gold);
  });
});
