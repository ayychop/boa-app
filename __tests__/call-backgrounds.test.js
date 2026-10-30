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
const bg = require('../src/calls/backgrounds');

describe('the blur itself', () => {
  test('three depths named like a lens; the backdrop pictures are gone', () => {
    expect(bg.BLURS.map((b) => b.id)).toEqual(['f4', 'f2.8', 'f1.4']);
    expect(bg.MODES).toEqual(['off', 'blur']);
    for (const gone of ['STUDIO', 'SCENES', 'assetOf', 'hexToInt']) expect(bg[gone]).toBeUndefined();
  });

  test('Agora: AI segmentation always (never a green screen), blur by depth', () => {
    expect(bg.toAgora({ mode: 'blur', id: 'f1.4' })).toEqual({ enabled: true, source: { background_source_type: 3, blur_degree: 3 }, segmentation: { modelType: 1 } });
    expect(bg.toAgora({ mode: 'blur', id: 'f4' }).source.blur_degree).toBe(1);
    expect(bg.toAgora({ mode: 'off', id: null }).enabled).toBe(false);
    expect(bg.toAgora({ mode: 'blur', id: 'f2.8' }).segmentation.modelType).toBe(1);
  });

  test('Banuba: its background module and a blur radius', () => {
    expect(bg.toBanuba({ mode: 'blur', id: 'f2.8' })).toEqual(["Background = require('bnb_js/background')", 'Background.blur(0.6)']);
    expect(bg.toBanuba({ mode: 'off', id: null })).toEqual([]);
  });

  test('saved choices come back only if they are still offered; studio and scene ones are off', () => {
    expect(bg.fromStored({ mode: 'blur', id: 'f1.4' })).toEqual({ mode: 'blur', id: 'f1.4' });
    expect(bg.fromStored({ mode: 'studio', id: 'charcoal' })).toEqual(bg.DEFAULT_BACKGROUND);
    expect(bg.fromStored({ mode: 'scene', id: 'gone' })).toEqual(bg.DEFAULT_BACKGROUND);
    expect(bg.fromStored({ mode: 'blur', id: 'f9' })).toEqual(bg.DEFAULT_BACKGROUND);
    expect(bg.fromStored(null)).toEqual(bg.DEFAULT_BACKGROUND);
    expect(bg.describe({ mode: 'blur', id: 'f2.8' })).toBe('Blur · f/2.8');
    expect(bg.describe({ mode: 'off' })).toBe('Off');
  });

  test('no backdrop images or green-screen options are left in the app', () => {
    const fs = require('fs');
    const path = require('path');
    expect(fs.existsSync(path.join(__dirname, '..', 'assets/backdrops'))).toBe(false);
    const call = fs.readFileSync(path.join(__dirname, '..', 'src/components/calls/CallScreen.js'), 'utf8');
    expect(call).not.toMatch(/call-backdrop-|call-background-tab-|Match lighting/);
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

    expect(await media.setBackground({ mode: 'blur', id: 'f4' })).toBe('ok');
    const [on, source, seg] = engine.enableVirtualBackground.mock.calls.at(-1);
    expect(on).toBe(true);
    expect(source).toEqual({ background_source_type: 3, blur_degree: 1 });
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

  test('pressing backdrops again and again: each one draws, from a clean pipeline every time', async () => {
    await act(async () => {
      await media.prepare('call-bg-repeat', { preset: 'natural', enabled: true });
    });
    const presses = [
      { mode: 'blur', id: 'f4' },
      { mode: 'blur', id: 'f1.4' },
      { mode: 'blur', id: 'f2.8' },
      { mode: 'blur', id: 'f4' },
      { mode: 'blur', id: 'f4' },
      { mode: 'blur', id: 'f1.4' },
    ];
    for (const [i, choice] of presses.entries()) {
      engine.enableVirtualBackground.mockClear();
      expect(await media.setBackground(choice)).toBe('ok');
      const calls = engine.enableVirtualBackground.mock.calls;
      // From the second press on, the one before is switched off first, then the new one goes on.
      if (i > 0) expect(calls[0][0]).toBe(false);
      expect(calls.at(-1)[0]).toBe(true);
      expect(calls.at(-1)[1]).toEqual(bg.toAgora(choice).source);
    }
    expect(await media.setBackground({ mode: 'off', id: null })).toBe('ok');
  });

  test('presses fired back to back without waiting: the last one wins', async () => {
    await act(async () => {
      await media.prepare('call-bg-burst', { preset: 'natural', enabled: true });
    });
    const results = await Promise.all([
      media.setBackground({ mode: 'blur', id: 'f1.4' }),
      media.setBackground({ mode: 'blur', id: 'f2.8' }),
      media.setBackground({ mode: 'blur', id: 'f4' }),
    ]);
    expect(results.at(-1)).toBe('ok');
    expect(engine.enableVirtualBackground).toHaveBeenLastCalledWith(true, { background_source_type: 3, blur_degree: 1 }, { modelType: 1 }, 2);
    await media.setBackground({ mode: 'off', id: null });
  });

  test('a backdrop that throws or is refused falls back to the plain camera instead of freezing', async () => {
    await act(async () => {
      await media.prepare('call-bg-throw', { preset: 'natural', enabled: true });
    });
    engine.enableVirtualBackground.mockImplementationOnce(() => {
      throw new Error('segmentation crashed');
    });
    expect(await media.setBackground({ mode: 'blur', id: 'f1.4' })).toBe('failed');
    expect(engine.enableVirtualBackground.mock.calls.at(-1)[0]).toBe(false);

    engine.enableVirtualBackground.mockReturnValueOnce(-1);
    expect(await media.setBackground({ mode: 'blur', id: 'f2.8' })).toBe('failed');
    expect(engine.enableVirtualBackground.mock.calls.at(-1)[0]).toBe(false);

    // And the next press still works.
    expect(await media.setBackground({ mode: 'blur', id: 'f4' })).toBe('ok');
    expect(engine.enableVirtualBackground.mock.calls.at(-1)[0]).toBe(true);
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
  // A phone's documents folder, for Banuba's crash breaker: file contents by name.
  const disk = new Map();
  const load = () => {
    let out;
    jest.isolateModules(() => {
      jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.4.0', extra: { banubaToken: 'bnb-client-token' } } } }));
      jest.doMock('expo-application', () => ({ nativeBuildVersion: '42' }));
      out = { media: require('../src/calls/media.native'), engine: require('react-native-agora').__engine };
    });
    return out;
  };
  // The shared expo-file-system mock (jest.setup.js) gets this documents folder for these tests:
  // Jest hands isolated modules the same mock instance, so it's swapped in place.
  class DiskFile {
    constructor(dir, name) {
      this.name = name;
    }
    get exists() {
      return disk.has(this.name);
    }
    create() {
      disk.set(this.name, '');
    }
    write(text) {
      disk.set(this.name, String(text));
    }
    textSync() {
      return disk.get(this.name);
    }
    delete() {
      disk.delete(this.name);
    }
  }
  const fsMock = jest.requireMock('expo-file-system');
  const real = { File: fsMock.File, Paths: fsMock.Paths };
  beforeEach(() => {
    disk.clear();
    fsMock.File = DiskFile;
    fsMock.Paths = { ...real.Paths, document: { uri: 'file:///docs' } };
  });
  afterEach(() => Object.assign(fsMock, real));

  test('opening a chat warms the engine up without loading Banuba when no background is chosen', async () => {
    const { media, engine } = load();
    jest.clearAllMocks();
    await media.warmUp('call-warm');
    expect(engine.initialize).toHaveBeenCalled();
    expect(engine.enableExtension).not.toHaveBeenCalledWith('Banuba', 'BanubaFilter', true);
    expect(media.backgroundEngine()).toBe('agora');
    // Choosing a background between calls lets that engine go, so the next one can start with Banuba.
    media.setBackground({ mode: 'blur', id: 'f2.8' });
    expect(engine.release).toHaveBeenCalled();
    await media.warmUp('call-warm-2');
    expect(engine.enableExtension).toHaveBeenCalledWith('Banuba', 'BanubaFilter', true);
    media.reset();
  });

  test('if Banuba takes the app down, it stays off on that build and Agora draws backgrounds', async () => {
    // The last start never finished: its trial marker is still on the phone.
    disk.set('banuba-trial', '1.4.0+42');
    const { media, engine } = load();
    jest.clearAllMocks();
    media.setBackground({ mode: 'blur', id: 'f2.8' });
    await act(async () => {
      await media.prepare('call-after-crash', { preset: 'natural', enabled: true });
    });
    expect(engine.enableExtension).not.toHaveBeenCalledWith('Banuba', 'BanubaFilter', true);
    expect(disk.get('banuba-benched')).toBe('1.4.0+42');
    expect(media.backgroundEngine()).toBe('agora');
    expect(engine.enableVirtualBackground).toHaveBeenCalledWith(true, { background_source_type: 3, blur_degree: 2 }, { modelType: 1 }, 2);
    media.reset();

    // A new build of the app tries Banuba again.
    disk.set('banuba-benched', '1.4.0+41');
    expect(load().media.banubaBenched()).toBe(false);
  });

  test('a Banuba start that runs 10 seconds, or a call that ends cleanly, clears its trial', async () => {
    const { media } = load();
    media.setBackground({ mode: 'blur', id: 'f4' });
    await act(async () => {
      await media.prepare('call-trial', { preset: 'natural', enabled: true });
    });
    expect(media.backgroundEngine()).toBe('banuba');
    expect(disk.has('banuba-trial')).toBe(true);
    jest.advanceTimersByTime(10000);
    expect(disk.has('banuba-trial')).toBe(false);
    media.reset();
  });

  test('switched on straight after initialize, licensed, then its effect and scripts draw the choice', async () => {
    const { media, engine } = load();
    jest.clearAllMocks();
    media.setBackground({ mode: 'blur', id: 'f1.4' });
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
    media.setBackground({ mode: 'blur', id: 'f4' });
    await act(async () => {
      await media.prepare('call-bnb-2', { preset: 'natural', enabled: true });
    });
    expect(media.backgroundEngine()).toBe('agora');
    expect(await media.setBackground({ mode: 'blur', id: 'f4' })).toBe('ok');
    expect(engine.enableVirtualBackground).toHaveBeenCalledWith(true, { background_source_type: 3, blur_degree: 1 }, { modelType: 1 }, 2);
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

  test('Blur opens the blur depths only: no backdrop tabs, no green screen; a depth goes to the camera, off turns it off', async () => {
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
    for (const gone of ['studio', 'scene', 'blur']) expect(screen.queryByTestId(`call-background-tab-${gone}`)).toBeNull();
    expect(screen.queryByTestId('call-backdrop-charcoal')).toBeNull();
    expect(screen.queryByText('Match lighting')).toBeNull();
    for (const id of ['f4', 'f2.8', 'f1.4']) expect(screen.getByTestId(`call-blur-${id}`)).toBeOnTheScreen();

    await user.press(screen.getByTestId('call-blur-f1.4'));
    await act(async () => {});
    expect(engine.enableVirtualBackground).toHaveBeenLastCalledWith(true, { background_source_type: 3, blur_degree: 3 }, { modelType: 1 }, 2);
    expect(screen.getByTestId('call-background-now')).toHaveTextContent('Blur · f/1.4');

    await user.press(screen.getByTestId('call-background-off'));
    await act(async () => {});
    expect(engine.enableVirtualBackground.mock.calls.at(-1)[0]).toBe(false);

    // One panel at a time: Filters closes Blur.
    await user.press(screen.getByTestId('call-filters-button'));
    expect(screen.queryByTestId('call-background')).toBeNull();
    expect(screen.getByTestId('call-filters')).toBeOnTheScreen();
  });

  test('the Blur button pressed many times in a row keeps working, and a crash falls back to the plain camera', async () => {
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

    // Open and close the sheet, picking a different depth each time.
    for (const id of ['f4', 'f1.4', 'f2.8', 'f4', 'f1.4']) {
      await user.press(screen.getByTestId('call-background-button'));
      expect(screen.getByTestId('call-background')).toBeOnTheScreen();
      await user.press(screen.getByTestId(`call-blur-${id}`));
      await act(async () => {});
      const [on, source] = engine.enableVirtualBackground.mock.calls.at(-1);
      expect(on).toBe(true);
      expect(source.blur_degree).toBe(bg.BLURS.find((b) => b.id === id).agora);
      expect(screen.getByTestId('call-background-now')).toHaveTextContent(`Blur · ${bg.BLURS.find((b) => b.id === id).label}`);
      expect(screen.queryByTestId('call-background-failed')).toBeNull();
      await user.press(screen.getByTestId('call-background-button'));
    }

    // The extension throws: the plain camera comes back, and the sheet says so.
    await user.press(screen.getByTestId('call-background-button'));
    engine.enableVirtualBackground.mockImplementationOnce(() => 0).mockImplementationOnce(() => {
      throw new Error('extension died');
    });
    await user.press(screen.getByTestId('call-blur-f2.8'));
    await act(async () => {});
    expect(engine.enableVirtualBackground.mock.calls.at(-1)[0]).toBe(false);
    expect(screen.getByTestId('call-background-failed')).toBeOnTheScreen();
    expect(screen.getByTestId('call-background-now')).toHaveTextContent('Off');

    // And it recovers on the very next press.
    await user.press(screen.getByTestId('call-blur-f4'));
    await act(async () => {});
    expect(engine.enableVirtualBackground).toHaveBeenLastCalledWith(true, { background_source_type: 3, blur_degree: 1 }, { modelType: 1 }, 2);
    expect(screen.queryByTestId('call-background-failed')).toBeNull();

    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('Filters and Enhance: a toggle in the studio panel; Enhance is one slider that goes to the camera', async () => {
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
    await user.press(screen.getByTestId('call-filters-button'));
    expect(screen.getByTestId('call-studio-modes')).toBeOnTheScreen();
    expect(screen.getByTestId('call-mode-filters')).toBeOnTheScreen();
    expect(screen.getByTestId('call-mode-enhance')).toBeOnTheScreen();
    expect(screen.queryByTestId('call-enhance-panel')).toBeNull();

    await user.press(screen.getByTestId('call-mode-enhance'));
    await act(async () => {});
    expect(screen.getByTestId('call-enhance-panel')).toBeOnTheScreen();
    expect(screen.getByTestId('call-enhance-value')).toBeOnTheScreen();
    // Enhance went to the camera at its saved strength, with skin protection at full.
    const [on, options] = engine.setBeautyEffectOptions.mock.calls.at(-1);
    expect(on).toBe(true);
    expect(options.smoothnessLevel).toBeGreaterThan(0);
    expect(engine.setColorEnhanceOptions.mock.calls.at(-1)[1].skinProtectLevel).toBe(1);

    await user.press(screen.getByTestId('call-mode-filters'));
    expect(screen.queryByTestId('call-enhance-panel')).toBeNull();

    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });
});
