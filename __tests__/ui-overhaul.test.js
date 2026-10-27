import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

jest.useFakeTimers();

const { VIBES, CUSTOM_ID, customVibe, resetChatVibe, default: useChatVibe } = require('../src/chat/vibes');
const { contrast } = require('../src/chat/bubbleTheme');
const ChatBackdrop = require('../src/components/chat/ChatBackdrop').default;
const VibePicker = require('../src/components/chat/VibePicker').default;
const { hsvToHex, hexToHsv } = require('../src/components/chat/ColorPicker');

const lum = ([r, g, b]) => {
  const lin = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const rgbOf = (c) => {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const [r, g, b, a = 1] = c.match(/[\d.]+/g).map(Number);
  return { rgb: [r, g, b], a };
};
const over = (top, bottom) => {
  const t = rgbOf(top);
  const b = rgbOf(bottom).rgb;
  return t.rgb.map((v, i) => v * t.a + b[i] * (1 - t.a));
};

describe('12 chat vibes and Custom', () => {
  test('the twelve, in order, each with its own texture where it has one', () => {
    expect(VIBES.map((v) => v.label)).toEqual([
      'Noir',
      'Neon',
      'Midnight Drive',
      'Turntable',
      'Street Luxury',
      'Afro-Futurism',
      'Y2K Luxe',
      'Cinema Classic',
      'Golden Hour',
      'Cyberpunk',
      'Minimalist',
      'The Block',
    ]);
    expect(Object.fromEntries(VIBES.filter((v) => v.texture).map((v) => [v.id, v.texture]))).toEqual({
      turntable: 'vinyl',
      'street-luxury': 'gold',
      afrofuturism: 'geo',
      y2k: 'chrome',
      cinema: 'film',
      'golden-hour': 'rays',
      cyberpunk: 'scan',
      'the-block': 'concrete',
    });
    expect(VIBES.find((v) => v.id === 'minimalist').radius).toBe(6);
  });

  test('your bubbles read clearly in every vibe, Custom included (4.5:1 or better)', () => {
    const all = [...VIBES, ...['#2F7BFF', '#FFFFFF', '#0E0E12', '#FFD400', '#8B3FD9'].map(customVibe)];
    for (const v of all) {
      const bubble = over(v.mine[1], v.mesh[1]);
      const ratio = contrast(lum(bubble), lum(rgbOf(v.mineText).rgb));
      if (ratio < 4.5) throw new Error(`${v.id} ${v.customColor ?? ''}: ${ratio.toFixed(2)}`);
    }
  });

  test('Custom washes your colour over Noir at 15%, and lifts a too-dark accent so it shows', () => {
    const c = customVibe('#C8102E');
    expect(c.id).toBe(CUSTOM_ID);
    expect(c.veil).toBe('rgba(200,16,46,0.15)');
    expect(c.mesh).toEqual(VIBES[0].mesh);
    expect(customVibe('#0E0E12').accent).not.toBe('#0E0E12');
    expect(customVibe('not a colour').customColor).toBe('#2F7BFF');
  });

  // The record is the turntable scene's own; every other texture is drawn as a texture.
  test.each(VIBES.filter((v) => v.texture && v.texture !== 'vinyl').map((v) => [v.id, v.texture]))('%s draws its %s texture in the thread backdrop', async (id, texture) => {
    await render(<ChatBackdrop vibe={VIBES.find((v) => v.id === id)} />);
    expect(screen.getByTestId(`chat-texture-${texture}`)).toBeOnTheScreen();
    await screen.unmount();
  });

  test.each([
    ['turntable', 'chat-turntable'],
    ['midnight', 'chat-particles-stars'],
    ['golden-hour', 'chat-particles-embers'],
    ['cyberpunk', 'chat-particles-rain'],
  ])('%s draws its scene in the thread backdrop', async (id, testID) => {
    await render(<ChatBackdrop vibe={VIBES.find((v) => v.id === id)} />);
    expect(screen.getByTestId(testID)).toBeOnTheScreen();
    await screen.unmount();
  });

  test('colour maths round-trips', () => {
    for (const hex of ['#E2A84B', '#2F7BFF', '#FFFFFF', '#000000', '#C8102E']) {
      const { h, s, v } = hexToHsv(hex);
      expect(hsvToHex(h, s, v)).toBe(hex);
    }
  });

  test('the picker scrolls sideways with snap; Custom opens the colour picker and saves your colour', async () => {
    resetChatVibe();
    await AsyncStorage.clear();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    function Picker() {
      const { vibe, setVibe, customColor, setCustomColor } = useChatVibe();
      return (
        <GestureHandlerRootView>
          <VibePicker value={vibe.id} onChange={setVibe} customColor={customColor} onCustomColor={setCustomColor} />
        </GestureHandlerRootView>
      );
    }
    await render(<Picker />);
    const list = screen.getByTestId('chat-vibe-list');
    expect(list.props.horizontal).toBe(true);
    expect(list.props.snapToInterval).toBeGreaterThan(100);
    for (const v of VIBES) expect(screen.getByTestId(`chat-vibe-${v.id}`)).toBeOnTheScreen();

    await user.press(screen.getByTestId('chat-vibe-the-block'));
    expect(screen.getByTestId('chat-vibe-the-block-selected')).toBeOnTheScreen();

    await user.press(screen.getByTestId('chat-vibe-custom'));
    expect(screen.getByTestId('chat-vibe-custom-selected')).toBeOnTheScreen();
    expect(screen.getByTestId('chat-color-picker')).toBeOnTheScreen();
    await user.press(screen.getByTestId('color-quick-FF5FB3'));
    expect(screen.getByTestId('color-hex')).toHaveTextContent('#FF5FB3');
    await user.press(screen.getByTestId('color-done'));
    await act(async () => {});
    expect(screen.queryByTestId('chat-color-picker')).toBeNull();
    expect(await AsyncStorage.getItem('boa:chat-vibe:v1')).toBe('custom');
    expect(await AsyncStorage.getItem('boa:chat-vibe-custom:v1')).toBe('#FF5FB3');
  });
});

describe('the preview cards', () => {
  const { StyleSheet } = require('react-native');
  const mountPicker = () => render(<VibePicker value="noir" onChange={() => {}} />);

  test('Turntable spins its record in the card, and it is the only card that moves', async () => {
    const reanimated = require('react-native-reanimated');
    const repeat = jest.spyOn(reanimated, 'withRepeat');
    await mountPicker();
    expect(screen.getByTestId('chat-vibe-turntable-preview')).toContainElement(screen.getByTestId('vibe-preview-vinyl'));
    // One endless animation in the whole row: the record turning.
    expect(repeat).toHaveBeenCalledTimes(1);
    repeat.mockRestore();
  });

  test("each card's mock bubbles are the theme's real bubbles, text colour included", async () => {
    await mountPicker();
    for (const v of VIBES) {
      const card = screen.getByTestId(`chat-vibe-${v.id}-preview`);
      const texts = screen.getAllByText('You up?').filter((t) => card.props.children && containsNode(card, t));
      expect(texts).toHaveLength(1);
      expect(StyleSheet.flatten(texts[0].props.style).color).toBe(v.theirsText);
      const mine = screen.getAllByText('Pull up').find((t) => containsNode(card, t));
      expect(StyleSheet.flatten(mine.props.style).color).toBe(v.mineText);
    }
    // Midnight's text glows.
    const midnight = screen.getAllByText('You up?').find((t) => containsNode(screen.getByTestId('chat-vibe-midnight-preview'), t));
    expect(StyleSheet.flatten(midnight.props.style).textShadowRadius).toBeGreaterThan(0);
  });

  test('Cinema has heavy film grain in its card; Street Luxury and Afro-Futurism draw bold patterns', async () => {
    await mountPicker();
    const cinema = screen.getByTestId('chat-vibe-cinema-preview');
    const hasImage = (n) => typeof n === 'object' && n !== null && (n.type === 'Image' || n.props?.source != null || (n.children ?? []).some(hasImage));
    expect(hasImage(cinema)).toBe(true);
    const src = fs.readFileSync(path.join(__dirname, '../src/components/chat/VibeTexture.js'), 'utf8');
    expect(src).toMatch(/opacity=\{mini \? 0\.45/); // the grain, held still in the card
    expect(src).toMatch(/id = mini \? 'weave-mini'/);
    expect(src).toMatch(/id = mini \? 'geo-mini'/);
  });

  test('all twelve look different: no two share a backdrop, and two are light themes', () => {
    const looks = VIBES.map((v) => `${v.mesh.join()}|${v.texture ?? ''}`);
    expect(new Set(looks).size).toBe(VIBES.length);
    const mids = VIBES.map((v) => rgbOf(v.mesh[1]).rgb);
    // Every pair of backdrops visibly apart in colour, or told apart by a texture.
    for (let i = 0; i < VIBES.length; i++)
      for (let j = i + 1; j < VIBES.length; j++) {
        const d = Math.hypot(...mids[i].map((c, k) => c - mids[j][k]));
        if (d < 24) expect(VIBES[i].texture ?? 'none').not.toBe(VIBES[j].texture ?? 'none');
      }
    expect(VIBES.filter((v) => v.light).map((v) => v.id)).toEqual(['y2k', 'minimalist']);
  });
});

function containsNode(root, node) {
  if (root === node) return true;
  return (root.children ?? []).some((c) => typeof c === 'object' && containsNode(c, node));
}

describe('copy and assets', () => {
  const read = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? read(path.join(dir, e.name)) : /\.(js|ts|tsx)$/.test(e.name) ? [fs.readFileSync(path.join(dir, e.name), 'utf8')] : []));
  test('"melanin" appears nowhere in the app', () => {
    for (const src of read(path.join(__dirname, '../src'))) expect(src).not.toMatch(/melanin/i);
  });
  test('the casting card is drawn, not a low-res photo', () => {
    const card = fs.readFileSync(path.join(__dirname, '../src/components/casting/CastingBoard.js'), 'utf8');
    expect(card).not.toMatch(/casting-on-set\.jpg|<Image/);
    expect(card).toMatch(/function CinematicBackdrop/);
    expect(fs.existsSync(path.join(__dirname, '../assets/images/casting-on-set.jpg'))).toBe(false);
  });
  test("this release is a new version, so What's New shows once on it", () => {
    // EAS's robot token can't raise preview build numbers, so a release is announced by bumping app.json's version (1.4.0: first-try calls, native 1080p filters, the vibe overhaul).
    expect(require('../app.json').expo.version).toBe('1.4.0');
  });
});
