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
    // Clear air under the letters: our own plate, or `reserve` px for a caller's text.
    expect(src).toMatch(/PLATE_GAP = 22/);
    expect(src).toMatch(/reserve = 0/);
    expect(src).toMatch(/lift=\{/);
    expect(src).toMatch(/- lift;/);
    // The Chat "Featured talent" card (the one whose name sat over the initials) reserves its text.
    expect(read('src/screens/hub/ChatHome.js')).toMatch(/reserve=\{TALENT_TEXT\}/);
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
    expect(read('src/screens/ZenScreen.js')).toMatch(/roomMoving = focused && !isPlaying && !warm/);
  });
});

describe('Zen screensaver', () => {
  test('no dark bar: the radio line and sound button are barless, the vignette is symmetric', () => {
    const src = read('src/screens/ZenScreen.js');
    expect(src).toMatch(/radioCardBare: \{ backgroundColor: 'transparent', borderWidth: 0 \}/);
    expect(src).toMatch(/soundChipBare: \{ backgroundColor: 'transparent', borderWidth: 0 \}/);
    expect(src).toMatch(/<RadioCard bare \/>/);
    // The clock is centred on the screen: the same room above and below.
    expect(src).toMatch(/bottom: ambient \? Math\.max\(top,/);
  });

  test('seven styles (the two original videos first), saved, with the choice shared', () => {
    const store = require('../src/data/screensavers');
    expect(store.SCREENSAVERS.map((s) => s.id)).toEqual(['night', 'rain', 'room', 'aurora', 'halo', 'ember', 'midnight']);
    // The originals: Starry Night and Rainy Window play their own scene's video, and the first is the default.
    expect(store.SCREENSAVERS.slice(0, 2).map((s) => s.scene)).toEqual(['night', 'rain']);
    expect(store.DEFAULT_SCREENSAVER).toBe('night');
    expect(store.getScreensaver()).toBe('night');
    store.setScreensaver('halo');
    expect(store.getScreensaver()).toBe('halo');
    store.setScreensaver('nonsense');
    expect(store.getScreensaver()).toBe('night');
  });

  test('the picker lists them and picking one changes the saver', async () => {
    const store = require('../src/data/screensavers');
    const { ScreensaverPicker } = require('../src/components/zen/Screensavers');
    store.setScreensaver('room');
    await render(<ScreensaverPicker />);
    expect(screen.getAllByRole('radio').length).toBe(7);
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

describe('round 2: Zen glow, section title, in-app Zen alignment', () => {
  test('the active tab has no circle: no boxShadow ring on the icon, no border on the glow', () => {
    const app = read('App.js');
    expect(app).not.toMatch(/tabIconGlow/);
    expect(app).toMatch(/tabCapsule: \{ position: 'absolute' \}/);
    expect(app).toMatch(/<TabGlow /);
  });
  test('the glyph glow follows the drawing (halo passes), and the bloom is a gradient', () => {
    const src = read('src/components/TabGlyph.js');
    expect(src).toMatch(/glyph\('none', true\)/);
    expect(src).toMatch(/RadialGradient/);
  });
  test('the glyphs and the glow render focused for every tab', async () => {
    const TabGlyph = require('../src/components/TabGlyph').default;
    const { TabGlow, TAB_GLYPHS } = require('../src/components/TabGlyph');
    for (const name of TAB_GLYPHS) {
      await render(<TabGlyph name={name} color="#F6D38A" focused />);
      expect(screen.getByTestId(`tab-glyph-halo-${name}`, { includeHiddenElements: true })).toBeTruthy();
    }
    await render(<TabGlow width={60} height={50} />);
  });
  test('"big screen": the section title has room for descenders', () => {
    expect(read('src/components/ui.js')).toMatch(/sectionTitle: \{ marginTop: space\.md, lineHeight: 34, paddingBottom: 8 \}/);
  });
  test('the screensaver: one even veil (no dark bands), the originals by scene, generative ones drawn', () => {
    const z = read('src/screens/ZenScreen.js');
    expect(z).toMatch(/'rgba\(5,5,6,0\.62\)', 'rgba\(5,5,6,0\.36\)', 'rgba\(5,5,6,0\.46\)', 'rgba\(5,5,6,0\.9\)'/);
    expect(z).not.toMatch(/<Vignette/);
    expect(z).toMatch(/roomMoving = focused && !isPlaying && !warm/);
    // As the screensaver the scrim is a single even veil, not the controls' top and foot bands.
    expect(z).toMatch(/testID="zen-veil"/);
    expect(z).toMatch(/ambient && saverDef\.generative/);
    expect(z).toMatch(/\(ambient && saverDef\.scene\) \|\| sceneId/);
  });
  test('the Zen page centres its date, time and status', () => {
    const z = read('src/screens/ZenScreen.js');
    expect(z).toMatch(/dateSlate: \{ paddingLeft: 2\.3 \}/);
    expect(z).toMatch(/marginHorizontal: -size \* 0\.0175/);
    expect(z).not.toMatch(/letterSpacing: -size \* 0\.035/);
    expect(z).toMatch(/const sway = signed \? DRIFT : 0/);
    expect(z).toMatch(/translateX: Math\.sin\(a\) \* sway/);
    expect(z).toMatch(/nowTextCentred: \{ textAlign: 'center' \}/);
  });
});
