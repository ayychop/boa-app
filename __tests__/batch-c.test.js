import fs from 'fs';
import path from 'path';
import { act, render, screen, fireEvent } from '@testing-library/react-native';

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('premium tab glyphs', () => {
  const TabGlyph = require('../src/components/TabGlyph').default;
  const { TAB_GLYPHS } = require('../src/components/TabGlyph');

  test('there is a drawn glyph for every tab, in both states', async () => {
    expect(TAB_GLYPHS.sort()).toEqual(['Chat', 'Home', 'Originals', 'Profile', 'Radio', 'Talent', 'Zen'].sort());
    for (const name of TAB_GLYPHS) {
      for (const focused of [true, false]) {
        await render(<TabGlyph name={name} color="#fff" focused={focused} />);
        expect(screen.getByTestId(`tab-glyph-${name}`, { includeHiddenElements: true })).toBeTruthy();
      }
    }
  });

  test('the bar draws them (not Ionicons) and keeps its haptics and glow', () => {
    const app = read('App.js');
    expect(app).toMatch(/<TabGlyph name=\{name\}/);
    expect(app).not.toMatch(/ICONS\[name\]/);
    expect(app).toMatch(/tabPress/);
    expect(app).toMatch(/testID=\{focused \? 'tab-active-glow'/);
  });
});

describe('lettering is never clipped', () => {
  test('fixed-height chips have a line tall enough for descenders', () => {
    expect(read('src/components/chat/GifPicker.js')).toMatch(/shelfText: \{[^}]*lineHeight: 18/);
    expect(read('src/components/kit.js')).toMatch(/chipText: \{[^}]*lineHeight: 18/);
    expect(read('src/screens/ZenScreen.js')).toMatch(/chipText: \{[^}]*lineHeight: 18/);
  });
  test('the talent card lifts its initials clear of the name plate', () => {
    const src = read('src/components/Headshot.js');
    expect(src).toMatch(/PLATE_GAP = 18/);
    expect(src).toMatch(/lift=\{/);
    expect(src).toMatch(/- lift;/);
  });
});

describe('Panel', () => {
  const Panel = require('../src/components/Panel').default;
  const { Text } = require('react-native');

  test('renders its children and sweeps once it has a size', async () => {
    await render(
      <Panel testID="p" style={{ borderRadius: 20 }}>
        <Text>inside</Text>
      </Panel>,
    );
    expect(screen.getByText('inside')).toBeTruthy();
    expect(screen.queryByTestId('panel-sweep', { includeHiddenElements: true })).toBeNull();
    await fireEvent(screen.getByTestId('p'), 'layout', { nativeEvent: { layout: { width: 300, height: 100 } } });
    expect(screen.getByTestId('panel-sweep', { includeHiddenElements: true })).toBeTruthy();
  });

  test('no sweep when the phone is warm', async () => {
    const thermal = require('../src/calls/thermal');
    jest.spyOn(thermal, 'isWarm').mockReturnValue(true);
    const src = read('src/hooks/useReducedMotion.js');
    expect(src).toMatch(/useWarm/);
    expect(read('src/components/Panel.js')).toMatch(/!calm/);
  });
});

describe('heat pauses the app\'s animations', () => {
  test('every animated surface asks the shared hook, not reanimated\'s own', () => {
    for (const f of ['App.js', 'src/components/DriftingFog.js', 'src/components/Grain.js', 'src/components/Headshot.js', 'src/components/Vinyl.js', 'src/screens/ZenScreen.js', 'src/screens/HomeScreen.js', 'src/components/Skeleton.js']) {
      const src = read(f);
      expect(src).toMatch(/hooks\/useReducedMotion'/);
      expect(src).not.toMatch(/useReducedMotion[^;]*from 'react-native-reanimated'/);
    }
  });
  test('the Zen room stops moving when warm', () => {
    expect(read('src/screens/ZenScreen.js')).toMatch(/roomMoving = focused && !isPlaying && !reduceMotion/);
  });
});

describe('Zen screensaver', () => {
  test('no dark bar: the radio line and sound button are barless, the vignette is symmetric', () => {
    const src = read('src/screens/ZenScreen.js');
    expect(src).toMatch(/radioCardBare: \{ backgroundColor: 'transparent', borderWidth: 0 \}/);
    expect(src).toMatch(/soundChipBare: \{ backgroundColor: 'transparent', borderWidth: 0 \}/);
    expect(src).toMatch(/<RadioCard bare \/>/);
    expect(src).toMatch(/\{ambient \? \(\s*<Vignette \/>/);
    // The clock is centred on the screen: the same room above and below.
    expect(src).toMatch(/bottom: ambient \? Math\.max\(top,/);
  });

  test('five styles, saved, with the choice shared', () => {
    const store = require('../src/data/screensavers');
    expect(store.SCREENSAVERS.map((s) => s.id)).toEqual(['room', 'aurora', 'halo', 'ember', 'midnight']);
    expect(store.getScreensaver()).toBe('room');
    store.setScreensaver('halo');
    expect(store.getScreensaver()).toBe('halo');
    store.setScreensaver('nonsense');
    expect(store.getScreensaver()).toBe('room');
  });

  test('the picker lists them and picking one changes the saver', async () => {
    const store = require('../src/data/screensavers');
    const { ScreensaverPicker } = require('../src/components/zen/Screensavers');
    store.setScreensaver('room');
    await render(<ScreensaverPicker />);
    expect(screen.getAllByRole('radio').length).toBe(5);
    await fireEvent.press(screen.getByTestId('zen-saver-pick-midnight'));
    expect(store.getScreensaver()).toBe('midnight');
    await act(async () => {});
    expect(screen.getByTestId('zen-saver-pick-midnight').props.accessibilityState.selected).toBe(true);
  });

  test('a backdrop renders for each style', async () => {
    const { SaverBackdrop } = require('../src/components/zen/Screensavers');
    for (const id of ['aurora', 'halo', 'ember', 'midnight']) {
      await render(<SaverBackdrop id={id} width={400} height={800} running />);
      expect(screen.getByTestId(`zen-saver-${id}`, { includeHiddenElements: true })).toBeTruthy();
    }
  });
});
