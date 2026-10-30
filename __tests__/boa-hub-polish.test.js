import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.useFakeTimers();

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('People and Flags come back to the emoji picker', () => {
  const { TONES, FLAGS, PEOPLE, takesTone, withTone } = require('../src/chat/emojiSet');
  const stickers = require('../src/chat/stickers');

  test('skin tones go right after the person or hand, in every combination', () => {
    expect(TONES).toHaveLength(6);
    expect(withTone('👋', 5)).toBe('👋🏿');
    expect(withTone('👋', 0)).toBe('👋');
    expect(withTone('👨‍⚕️', 4)).toBe('👨🏾‍⚕️');
    expect(withTone('👩‍🦱', 5)).toBe('👩🏿‍🦱');
    // A variation selector gives way to the modifier.
    expect(withTone('🖐️', 3)).toBe('🖐🏽');
    expect(withTone('✌️', 2)).toBe('✌🏼');
    // Two people (a couple) and things that aren't people take no tone.
    expect(takesTone('👩‍❤️‍👨')).toBe(false);
    expect(withTone('🔥', 5)).toBe('🔥');
    expect(PEOPLE.length).toBeGreaterThan(150);
    expect(PEOPLE.filter((p) => takesTone(p.emoji)).length).toBeGreaterThan(80);
  });

  test('every flag: the UK and home nations first, then the world, each searchable by name', () => {
    expect(FLAGS.length).toBeGreaterThan(250);
    const emoji = FLAGS.map((f) => f.emoji);
    for (const flag of ['🇬🇧', '🇳🇬', '🇬🇭', '🇯🇲', '🇺🇸', '🇿🇦', '🇰🇪', '🇹🇹', '🇧🇧', '🇸🇴', '🇫🇷', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '🏳️‍🌈']) expect(emoji).toContain(flag);
    expect(new Set(emoji).size).toBe(emoji.length);
    expect(emoji.slice(0, 4)).toEqual(['🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '🇬🇧']);
    expect(FLAGS.find((f) => f.emoji === '🇳🇬').tags).toEqual(expect.arrayContaining(['ng', 'nigeria']));
  });

  test('the picker always has People and Flags tabs, a tone row, and search across both', async () => {
    await AsyncStorage.clear();
    stickers.__reset();
    const StickerPicker = require('../src/components/chat/StickerPicker').default;
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onPick = jest.fn();
    await render(<StickerPicker open purpose="send" onPick={onPick} onClose={() => {}} />);
    await act(async () => {});
    expect(screen.getByTestId('sticker-tab-People')).toBeOnTheScreen();
    expect(screen.getByTestId('sticker-tab-Flags')).toBeOnTheScreen();

    await user.press(screen.getByTestId('sticker-tab-People'));
    expect(screen.getByTestId('sticker-tones')).toBeOnTheScreen();
    expect(screen.getByTestId('sticker-👋')).toBeOnTheScreen();
    await user.press(screen.getByTestId('sticker-tone-5'));
    await act(async () => {});
    // The whole tab is in the chosen tone, and it's remembered.
    expect(screen.getByTestId('sticker-👋🏿')).toBeOnTheScreen();
    expect(await AsyncStorage.getItem('boa.stickers.tone')).toBe('5');

    await user.press(screen.getByTestId('sticker-tab-Flags'));
    expect(screen.queryByTestId('sticker-tones')).toBeNull();
    expect(screen.getByTestId('sticker-🇬🇧')).toBeOnTheScreen();

    // Search finds a flag by country name.
    await user.type(screen.getByTestId('sticker-search'), 'nigeria');
    await act(async () => {});
    expect(screen.getByTestId('sticker-🇳🇬')).toBeOnTheScreen();
    await user.press(screen.getByTestId('sticker-🇳🇬'));
    expect(onPick).toHaveBeenCalledWith('🇳🇬');
  });
});

describe('GIFs: GIPHY, picked in the app', () => {
  const gifs = require('../src/chat/gifs');
  const entry = (id, over = {}) => ({
    id,
    title: `GIF ${id}`,
    images: {
      downsized_medium: { url: `https://media2.giphy.com/media/${id}/giphy.gif`, width: '300', height: '400' },
      fixed_width_small: { url: `https://media2.giphy.com/media/${id}/100w.gif`, width: '100', height: '133' },
    },
    ...over,
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_GIPHY_API_KEY;
    delete global.fetch;
  });

  test('only GIPHY media addresses over https are ever loaded or sent', () => {
    expect(gifs.isGifUrl('https://media2.giphy.com/media/abc/giphy.gif')).toBe(true);
    expect(gifs.isGifUrl('https://i.giphy.com/abc.gif')).toBe(true);
    expect(gifs.isGifUrl('http://media2.giphy.com/media/abc/giphy.gif')).toBe(false);
    expect(gifs.isGifUrl('https://evil.example/media.giphy.com/x.gif')).toBe(false);
    expect(gifs.isGifUrl('https://media.giphy.com.evil.example/x.gif')).toBe(false);
    expect(gifs.isGifUrl('javascript:alert(1)')).toBe(false);
    expect(gifs.isGifUrl(null)).toBe(false);
  });

  test("the response is shaped for the picker, dropping anything that isn't a GIPHY address", () => {
    const out = gifs.shapeGifs({ data: [entry('a'), entry('b', { images: { downsized_medium: { url: 'https://evil.example/x.gif' } } }), { id: 'c' }] });
    expect(out).toEqual([{ id: 'a', url: 'https://media2.giphy.com/media/a/giphy.gif', preview: 'https://media2.giphy.com/media/a/100w.gif', width: 300, height: 400, title: 'GIF a' }]);
  });

  test('trending and search hit GIPHY; no key says so instead of failing; errors are readable', async () => {
    await expect(gifs.loadGifs()).rejects.toThrow('NO_KEY');
    process.env.EXPO_PUBLIC_GIPHY_API_KEY = 'test-key';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [entry('a')], pagination: { total_count: 50 } }) }));
    const page = await gifs.loadGifs();
    expect(global.fetch.mock.calls[0][0]).toMatch(/^https:\/\/api\.giphy\.com\/v1\/gifs\/trending\?/);
    expect(global.fetch.mock.calls[0][0]).toMatch(/api_key=test-key/);
    expect(global.fetch.mock.calls[0][0]).toMatch(/rating=pg-13/);
    expect(page.items).toHaveLength(1);
    expect(page.next).toBe(1);
    await gifs.loadGifs({ query: 'tiktok trend' });
    expect(global.fetch.mock.calls[1][0]).toMatch(/\/v1\/gifs\/search\?.*q=tiktok\+trend/);
    global.fetch = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(gifs.loadGifs()).rejects.toThrow(/busy/);
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(gifs.loadGifs()).rejects.toThrow(/Check your connection/);
    expect(gifs.GIF_SHELVES.map((s) => s.id)).toEqual(expect.arrayContaining(['trending', 'tiktok']));
  });

  test('the picker lists trending GIFs, and tapping one sends it', async () => {
    process.env.EXPO_PUBLIC_GIPHY_API_KEY = 'test-key';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [entry('a'), entry('b')], pagination: { total_count: 2 } }) }));
    const GifPicker = require('../src/components/chat/GifPicker').default;
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onPick = jest.fn();
    const onClose = jest.fn();
    await render(<GifPicker open onPick={onPick} onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByTestId('gif-shelf-tiktok')).toBeOnTheScreen();
    await user.press(screen.getByTestId('gif-a'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', url: 'https://media2.giphy.com/media/a/giphy.gif', width: 300, height: 400 }));
    expect(onClose).toHaveBeenCalled();
  });

  test('without a key the picker explains itself rather than showing an empty box', async () => {
    const GifPicker = require('../src/components/chat/GifPicker').default;
    await render(<GifPicker open onPick={() => {}} onClose={() => {}} />);
    await act(async () => {});
    expect(screen.getByTestId('gif-nokey')).toBeOnTheScreen();
  });

  test('a GIF is its own kind of message: the Composer has a GIF button, and the database allows only GIPHY addresses', () => {
    expect(read('src/components/chat/Composer.js')).toMatch(/testID="hub-gifs"/);
    expect(read('src/screens/hub/NewChatScreen.js')).toMatch(/<GifPicker open=\{gifs\}/);
    const sql = read('supabase/migrations/20261030120000_gif_messages.sql');
    expect(sql).toMatch(/'gif'\)\)/);
    expect(sql).toMatch(/giphy\\\.com/);
    expect(read('src/chat/notifications.js')).toMatch(/case 'gif'/);
    expect(read('supabase/functions/message-push/index.ts')).toMatch(/case 'gif'/);
  });

  test('sendGif refuses an address that is not GIPHY before it ever reaches the database', async () => {
    const { sendGif } = require('../src/api/hub');
    await expect(sendGif('c1', { url: 'https://evil.example/x.gif' })).rejects.toThrow(/can't be sent/);
  });
});

describe('the typeface is worn in three places only', () => {
  const { APP_FONTS, fontById, FontProvider } = require('../src/context/FontContext');
  const ScopedText = require('../src/components/ScopedText');
  const Text = ScopedText.default;
  const { FontScope, scopedStyle } = ScopedText;
  const { fonts } = require('../src/theme');

  test('more fonts, each with four weights, the old ids kept', () => {
    expect(APP_FONTS.length).toBeGreaterThanOrEqual(12);
    for (const id of ['signature', 'rounded', 'technical', 'editorial']) expect(APP_FONTS.some((f) => f.id === id)).toBe(true);
    for (const f of APP_FONTS) expect(Object.keys(f.weights).sort()).toEqual(['bold', 'medium', 'regular', 'semibold']);
    expect(new Set(APP_FONTS.map((f) => f.id)).size).toBe(APP_FONTS.length);
  });

  test('house body faces become the same weight of the chosen face; mono, serif and timestamps stay', () => {
    const poppins = fontById('poppins');
    expect(scopedStyle(poppins, { fontFamily: fonts.regular })).toEqual({ fontFamily: 'Poppins_400Regular', fontWeight: 'normal' });
    expect(scopedStyle(poppins, [{ fontFamily: fonts.semibold }, { fontSize: 20 }])).toEqual({ fontFamily: 'Poppins_600SemiBold', fontWeight: 'normal' });
    expect(scopedStyle(poppins, { fontFamily: fonts.chatBold }).fontFamily).toBe('Poppins_700Bold');
    expect(scopedStyle(poppins, { fontFamily: fonts.extrabold }).fontFamily).toBe('Poppins_700Bold');
    // No face of its own: its weight decides.
    expect(scopedStyle(poppins, { fontWeight: '700' }).fontFamily).toBe('Poppins_700Bold');
    expect(scopedStyle(poppins, {}).fontFamily).toBe('Poppins_400Regular');
    // Never governed.
    expect(scopedStyle(poppins, { fontFamily: fonts.mono })).toBeNull();
    expect(scopedStyle(poppins, { fontFamily: fonts.serif })).toBeNull();
    expect(scopedStyle(poppins, { fontFamily: fonts.stamp })).toBeNull();
    // The house face changes nothing.
    expect(scopedStyle(null, { fontFamily: fonts.regular })).toBeNull();
  });

  test('inside a FontScope the text changes; outside it never does', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('boa.appFont.v1', 'lora');
    await render(
      <FontProvider>
        <Text testID="outside" style={{ fontFamily: fonts.regular }}>
          Outside
        </Text>
        <FontScope>
          <Text testID="inside" style={{ fontFamily: fonts.regular }}>
            Inside
          </Text>
          <Text testID="mono" style={{ fontFamily: fonts.mono }}>
            Mono
          </Text>
        </FontScope>
      </FontProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('outside')).toHaveStyle({ fontFamily: fonts.regular });
    expect(screen.getByTestId('inside')).toHaveStyle({ fontFamily: 'Lora_400Regular' });
    expect(screen.getByTestId('mono')).toHaveStyle({ fontFamily: fonts.mono });
  });

  test('only the chat, the profile page and profile settings are scoped; section titles and Originals are not', () => {
    for (const f of ['src/screens/hub/NewChatScreen.js', 'src/screens/hub/HubProfileScreen.js', 'src/screens/hub/HubSettingsScreen.js']) expect(read(f)).toMatch(/<FontScope>/);
    // The shared section header no longer reads the font, so it can't leak onto BOA Originals or Home.
    expect(read('src/components/ui.js')).not.toMatch(/useHeadlineFont|FontContext/);
    for (const f of ['src/screens/OriginalsScreen.js', 'src/components/Poster.js', 'App.js']) {
      const src = read(f);
      expect(src).not.toMatch(/FontScope/);
      expect(src).not.toMatch(/useAppFont|useHeadlineFont/);
    }
  });
});

describe('BOA Originals and the tab bar', () => {
  test('the Originals art has no border or panel colour showing, and the cards animate with a Reanimated scale and fade', () => {
    const poster = read('src/components/Poster.js');
    expect(poster).toMatch(/framed: \{ backgroundColor: colors\.bg \}/);
    const originals = read('src/screens/OriginalsScreen.js');
    expect(originals).toMatch(/resizeMode="cover"/);
    expect(originals).toMatch(/function PremiumCard/);
    expect(originals).toMatch(/useReducedMotion/);
  });

  test('the play button is the BOA mark in gold, with a glow', () => {
    const src = read('src/components/BoaPlayButton.js');
    expect(src).toMatch(/BOA/);
    expect(src).toMatch(/name="play"/);
    expect(src).toMatch(/boxShadow/);
  });

  test('the active tab has a gold glass capsule with a glow', () => {
    const app = read('App.js');
    expect(app).toMatch(/testID=\{focused \? 'tab-active-glow'/);
    expect(app).toMatch(/tabBarEdge/);
  });
});

describe('Enhance: a glass-clear skin look that keeps dark skin rich', () => {
  const { enhanceOf, toAgora, fromStored, toStored, describeParts, DEFAULT_ENHANCE } = require('../src/calls/beauty');
  const { enhanceSkin } = require('../src/calls/luts');

  test('one level drives smoothing up to a heavy cap and almost no lightening', () => {
    const off = enhanceOf(0);
    expect(off.on).toBe(false);
    const full = enhanceOf(1);
    expect(full.on).toBe(true);
    expect(full.smoothnessLevel).toBeGreaterThan(0.8);
    // Lightening is what turns deep skin ashy, so it stays tiny.
    expect(full.lighteningLevel).toBeLessThanOrEqual(0.08);
    expect(enhanceOf(0.5).smoothnessLevel).toBeGreaterThan(enhanceOf(0.2).smoothnessLevel);
    // Responsive: the first half of the slider already does most of the work.
    expect(enhanceOf(0.5).smoothnessLevel).toBeGreaterThan(full.smoothnessLevel * 0.55);
  });

  test('Enhance goes to Agora with skin protection at full and no exposure or tone change', () => {
    const { beauty, colorEnhance, filter, tone } = toAgora({ mode: 'enhance', enhance: 0.8, enabled: true });
    expect(beauty.enabled).toBe(true);
    expect(beauty.smoothnessLevel).toBeGreaterThan(0.6);
    expect(colorEnhance.skinProtectLevel).toBe(1);
    expect(filter.lut).toBe('enhance');
    expect(tone).toEqual({ brightness: 0, contrast: 0 });
    // Enhance is switched off by taking it to nothing, not by the Filters toggle.
    expect(toAgora({ mode: 'enhance', enhance: 0 }).beauty.enabled).toBe(false);
  });

  test('the mode and strength are saved and come back; unknown modes fall back to Filters', () => {
    const saved = toStored({ preset: 'natural', brightness: 0.5, contrast: 0.5, enabled: true, mode: 'enhance', enhance: 0.7 });
    expect(fromStored(saved)).toMatchObject({ mode: 'enhance', enhance: 0.7 });
    expect(fromStored({ mode: 'nope' }).mode).toBe('filters');
    expect(fromStored({}).enhance).toBe(DEFAULT_ENHANCE);
    expect(describeParts({ mode: 'enhance', enhance: 0.55, enabled: true })).toEqual([{ id: 'enhance', label: 'Enhance', value: '55%' }]);
  });

  test('the Enhance grade lifts the mid-tones but holds black, white and the hue of deep skin', () => {
    const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const [br, bg, bb] = enhanceSkin(0, 0, 0);
    expect(Math.max(br, bg, bb)).toBeLessThan(0.01);
    const white = enhanceSkin(1, 1, 1);
    for (const c of white) expect(c).toBeGreaterThan(0.97);
    // A deep skin tone: lifted a little, never grey: its red still leads blue by about as much.
    const deep = [0.36, 0.22, 0.15];
    const out = enhanceSkin(...deep);
    expect(lum(out)).toBeGreaterThan(lum(deep));
    expect(lum(out)).toBeLessThan(lum(deep) * 1.25);
    expect(out[0] / out[2]).toBeGreaterThan((deep[0] / deep[2]) * 0.9);
    for (const c of out) expect(c).toBeLessThanOrEqual(1);
  });
});

describe('the chat thread leaves smoothly', () => {
  test('the backdrop pauses after the slide, and the keyboard going down does not re-lay-out the page on its way out', () => {
    const src = read('src/screens/hub/NewChatScreen.js');
    expect(src).toMatch(/LEAVE_SETTLE_MS/);
    expect(src).toMatch(/setTimeout\(\(\) => setFocused\(false\), LEAVE_SETTLE_MS\)/);
    expect(src).toMatch(/addListener\('beforeRemove'/);
    expect(src).toMatch(/if \(!leaving\.current\) setKeyboard\(false\)/);
  });
});

describe('the Zen screensaver wordmark', () => {
  test('is a larger brushed-gold mark with a halo, nowhere near the old faint one', () => {
    const src = read('src/screens/ZenScreen.js');
    expect(src).toMatch(/<BoaLogo sheen /);
    expect(src).toMatch(/markGlow/);
    expect(src).not.toMatch(/mark: \{ marginTop: space\.lg, opacity: 0\.42 \}/);
  });
});
