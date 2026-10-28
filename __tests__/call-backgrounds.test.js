import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.useFakeTimers();

let mockHub;
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));
jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  getPremiumAccess: jest.fn(),
  amIAdmin: jest.fn(async () => false),
}));
jest.mock('../src/calls/signaling', () => ({
  listen: jest.fn(() => () => {}),
  send: jest.fn(async () => true),
  pushRing: jest.fn(async () => true),
}));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: () => {} })),
}));
jest.mock('../src/calls/token', () => ({ fetchToken: jest.fn(async () => ({ appId: 'boa-app-id', token: 'tok-1', uid: 4242 })) }));
// A backdrop image, once it's a file on the phone.
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn((mod) => ({ downloadAsync: jest.fn(async () => {}), localUri: `file:///cache/backdrop-${typeof mod === 'string' ? mod : 'image'}.jpg` })),
  },
}));

const bg = require('../src/calls/backgrounds');

describe('the backdrops themselves', () => {
  test('three studio tones, each a lit backdrop image with its true hex underneath', () => {
    expect(bg.STUDIO.map((s) => [s.id, s.hex])).toEqual([
      ['black', '#000000'],
      ['charcoal', '#1A1A1A'],
      ['warm-grey', '#6E675F'],
    ]);
    for (const s of bg.STUDIO) expect(s.asset).toBeTruthy();
    expect(bg.hexToInt('#1A1A1A')).toBe(0x1a1a1a);
    expect(bg.hexToInt('nonsense')).toBe(0);
  });

  test('Agora: AI segmentation always (never a green screen), the image with its colour as a fallback, and blur by depth', () => {
    const studio = bg.toAgora({ mode: 'studio', id: 'charcoal' }, '/cache/charcoal.jpg');
    expect(studio).toEqual({ enabled: true, source: { background_source_type: 2, color: 0x1a1a1a, source: '/cache/charcoal.jpg' }, segmentation: { modelType: 1 } });
    // No file yet: the tone itself still goes down.
    expect(bg.toAgora({ mode: 'studio', id: 'black' }, null).source).toEqual({ background_source_type: 1, color: 0 });
    expect(bg.toAgora({ mode: 'blur', id: 'f1.4' }).source).toEqual({ background_source_type: 3, blur_degree: 3 });
    expect(bg.toAgora({ mode: 'blur', id: 'f4' }).source.blur_degree).toBe(1);
    expect(bg.toAgora({ mode: 'off', id: null }).enabled).toBe(false);
    for (const choice of [
      { mode: 'studio', id: 'black' },
      { mode: 'blur', id: 'f2.8' },
    ])
      expect(bg.toAgora(choice, '/x.jpg').segmentation.modelType).toBe(1);
  });

  test('Banuba: its background module, the image filled to the frame, or a blur radius', () => {
    expect(bg.toBanuba({ mode: 'studio', id: 'warm-grey' }, "/data/it's/warm.jpg")).toEqual([
      "Background = require('bnb_js/background')",
      "Background.texture('/data/it\\'s/warm.jpg')",
      "Background.contentMode('scale_to_fill')",
    ]);
    expect(bg.toBanuba({ mode: 'blur', id: 'f2.8' })).toEqual(["Background = require('bnb_js/background')", 'Background.blur(0.6)']);
    expect(bg.toBanuba({ mode: 'off', id: null })).toEqual([]);
  });

  test('saved choices come back only if they are still offered', () => {
    expect(bg.fromStored({ mode: 'blur', id: 'f1.4' })).toEqual({ mode: 'blur', id: 'f1.4' });
    expect(bg.fromStored({ mode: 'scene', id: 'gone' })).toEqual(bg.DEFAULT_BACKGROUND);
    expect(bg.fromStored({ mode: 'hologram', id: 'x' })).toEqual(bg.DEFAULT_BACKGROUND);
    expect(bg.fromStored(null)).toEqual(bg.DEFAULT_BACKGROUND);
    expect(bg.describe({ mode: 'studio', id: 'charcoal' })).toBe('Studio · Charcoal');
    expect(bg.describe({ mode: 'off' })).toBe('Off');
  });
});

describe('the camera, with Agora drawing the background', () => {
  const { __engine: engine } = require('react-native-agora');
  const media = require('../src/calls/media.native');

  afterEach(() => media.reset());

  test('a choice before the call waits, then goes on with the camera; off turns it off', async () => {
    jest.clearAllMocks();
    expect(await media.setBackground({ mode: 'blur', id: 'f2.8' })).toBe('later');
    await act(async () => {
      await media.prepare('call-bg-1', { preset: 'natural', brightness: 0.5, contrast: 0.5, enabled: true });
    });
    expect(engine.enableVirtualBackground).toHaveBeenCalledWith(true, { background_source_type: 3, blur_degree: 2 }, { modelType: 1 }, 2);
    expect(media.backgroundEngine()).toBe('agora');

    expect(await media.setBackground({ mode: 'studio', id: 'charcoal' })).toBe('ok');
    const [on, source, seg] = engine.enableVirtualBackground.mock.calls.at(-1);
    expect(on).toBe(true);
    expect(source).toEqual(expect.objectContaining({ background_source_type: 2, color: 0x1a1a1a }));
    // An absolute path on the phone, as Agora needs: no file:// in front.
    expect(source.source).toMatch(/^\/cache\/backdrop-.*\.jpg$/);
    expect(seg).toEqual({ modelType: 1 });

    expect(await media.setBackground({ mode: 'off', id: null })).toBe('ok');
    expect(engine.enableVirtualBackground.mock.calls.at(-1)[0]).toBe(false);
  });

  test("a phone that can't keep up says so instead of failing silently", async () => {
    await act(async () => {
      await media.prepare('call-bg-2', { preset: 'natural', enabled: true });
    });
    engine.enableVirtualBackground.mockReturnValueOnce(-4);
    expect(await media.setBackground({ mode: 'blur', id: 'f1.4' })).toBe('unsupported');
    await media.setBackground({ mode: 'off', id: null });
  });

  test('tap to focus: focus and exposure at the tap, turned back for the mirrored front camera', async () => {
    await act(async () => {
      await media.prepare('call-focus', { preset: 'natural', enabled: true });
    });
    expect(media.focusAt(0.25, 0.4)).toBe(true);
    expect(engine.setCameraFocusPositionInPreview).toHaveBeenLastCalledWith(0.75, 0.4);
    expect(engine.setCameraExposurePosition).toHaveBeenLastCalledWith(0.75, 0.4);
    media.switchCamera();
    media.focusAt(0.25, 2);
    expect(engine.setCameraFocusPositionInPreview).toHaveBeenLastCalledWith(0.25, 1);
  });
});

describe('the camera, with Banuba drawing the background', () => {
  const load = () => {
    let out;
    jest.isolateModules(() => {
      jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { banubaToken: 'bnb-client-token' } } } }));
      out = { media: require('../src/calls/media.native'), engine: require('react-native-agora').__engine };
    });
    return out;
  };

  test('switched on straight after initialize, licensed, then its effect and scripts draw the choice', async () => {
    const { media, engine } = load();
    jest.clearAllMocks();
    await act(async () => {
      await media.prepare('call-bnb', { preset: 'natural', enabled: true });
    });
    expect(engine.enableExtension).toHaveBeenCalledWith('Banuba', 'BanubaFilter', true);
    // Banuba's rule: before anything else after initialize.
    expect(engine.initialize.mock.invocationCallOrder[0]).toBeLessThan(engine.enableExtension.mock.invocationCallOrder[0]);
    expect(engine.enableExtension.mock.invocationCallOrder[0]).toBeLessThan(engine.enableVideo.mock.invocationCallOrder[0]);
    expect(engine.setExtensionProperty).toHaveBeenCalledWith('Banuba', 'BanubaFilter', 'set_banuba_license_token', 'bnb-client-token');
    expect(media.backgroundEngine()).toBe('banuba');

    expect(await media.setBackground({ mode: 'blur', id: 'f1.4' })).toBe('ok');
    const props = engine.setExtensionProperty.mock.calls.map((c) => [c[2], c[3]]);
    expect(props).toEqual(
      expect.arrayContaining([
        ['load_effect', 'effects/BOABackground'],
        ['eval_js', 'Background.blur(0.9)'],
      ]),
    );
    expect(engine.enableVirtualBackground).not.toHaveBeenCalled();

    // The front camera flips: Banuba's mirroring follows.
    media.switchCamera();
    expect(engine.setExtensionProperty).toHaveBeenLastCalledWith('Banuba', 'BanubaFilter', 'set_require_mirroring', '0');

    expect(await media.setBackground({ mode: 'off', id: null })).toBe('ok');
    expect(engine.setExtensionProperty).toHaveBeenLastCalledWith('Banuba', 'BanubaFilter', 'unload_effect', 'effects/BOABackground');
    media.reset();
  });

  test('a refused licence falls back to Agora, so backgrounds still work', async () => {
    const { media, engine } = load();
    jest.clearAllMocks();
    engine.setExtensionProperty.mockReturnValueOnce(-3);
    await act(async () => {
      await media.prepare('call-bnb-2', { preset: 'natural', enabled: true });
    });
    expect(media.backgroundEngine()).toBe('agora');
    expect(await media.setBackground({ mode: 'studio', id: 'black' })).toBe('ok');
    expect(engine.enableVirtualBackground).toHaveBeenCalledWith(true, expect.objectContaining({ color: 0 }), { modelType: 1 }, 2);
    media.reset();
  });
});

describe('the Background sheet on the call screen', () => {
  const hub = require('../src/api/hub');
  const { __engine: engine } = require('react-native-agora');
  const { PremiumProvider } = require('../src/context/PremiumContext');
  const { CallProvider, useCall } = require('../src/context/CallContext');
  const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null };

  beforeEach(() => {
    mockHub = { userId: 'user-me', profile: { id: 'user-me', username: 'ama', display_name: 'Ama' }, isAdmin: false, blocked: new Set(), block: jest.fn(async () => {}) };
    hub.getPremiumAccess.mockResolvedValue({ status: 'trial', hasAccess: true, isAdmin: false, trialEndsAt: new Date(Date.now() + 47 * 3600e3).toISOString() });
  });

  function Dial() {
    const { startCall } = useCall();
    return <Text onPress={() => startCall(KOFI)}>Call Kofi</Text>;
  }

  test('Backdrop opens three tabs; a studio tone and a blur go to the camera, and Match lighting is right there', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(
      <PremiumProvider>
        <CallProvider>
          <Dial />
        </CallProvider>
      </PremiumProvider>,
    );
    await user.press(screen.getByText('Call Kofi'));
    await act(async () => {});
    await user.press(screen.getByTestId('call-background-button'));
    expect(screen.getByTestId('call-background')).toBeOnTheScreen();
    for (const tab of ['studio', 'scene', 'blur']) expect(screen.getByTestId(`call-background-tab-${tab}`)).toBeOnTheScreen();
    // Lighting to match the backdrop: the camera's exposure.
    expect(screen.getByText('Match lighting')).toBeOnTheScreen();

    await user.press(screen.getByTestId('call-backdrop-charcoal'));
    await act(async () => {});
    expect(engine.enableVirtualBackground).toHaveBeenLastCalledWith(true, expect.objectContaining({ background_source_type: 2, color: 0x1a1a1a }), { modelType: 1 }, 2);
    expect(screen.getByTestId('call-background-now')).toHaveTextContent('Studio · Charcoal');

    // Scenes wait for their photographs.
    await user.press(screen.getByTestId('call-background-tab-scene'));
    expect(screen.getByTestId('call-scenes-empty')).toBeOnTheScreen();

    await user.press(screen.getByTestId('call-background-tab-blur'));
    await user.press(screen.getByTestId('call-blur-f1.4'));
    await act(async () => {});
    expect(engine.enableVirtualBackground).toHaveBeenLastCalledWith(true, { background_source_type: 3, blur_degree: 3 }, { modelType: 1 }, 2);

    await user.press(screen.getByTestId('call-background-off'));
    await act(async () => {});
    expect(engine.enableVirtualBackground.mock.calls.at(-1)[0]).toBe(false);

    // One panel at a time: Filters closes Background.
    await user.press(screen.getByTestId('call-filters-button'));
    expect(screen.queryByTestId('call-background')).toBeNull();
    expect(screen.getByTestId('call-filters')).toBeOnTheScreen();
  });
});
