import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../src/api/hype', () => ({ hypeStation: jest.fn(() => Promise.resolve(true)) }));

const stickers = require('../src/chat/stickers');
const liked = require('../src/audio/liked');
const { hypeStation } = require('../src/api/hype');

const STATION = { kind: 'radio', id: 'st-1', name: 'Softlife Afrofusion Radio', streamUrl: 'https://a.example/radio.mp3', country: 'Nigeria', bitrate: 128 };

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  stickers.__reset();
  liked.__reset();
});

describe('animated emoji', () => {
  test('an emoji and Google’s file name map both ways, sequences included', () => {
    expect(stickers.toCode('🔥')).toBe('1f525');
    expect(stickers.toCode('❤️')).toBe('2764_fe0f');
    expect(stickers.toCode('❤️‍🔥')).toBe('2764_fe0f_200d_1f525');
    expect(stickers.fromCode('2764_fe0f_200d_1f525')).toBe('❤️‍🔥');
    expect(stickers.stickerUrl('🔥')).toBe('https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.webp');
  });

  test('the catalogue: most used first, skin tones left out', () => {
    const icons = stickers.shapeCatalogue({
      icons: [
        { codepoint: '1f44d', popularity: 5, categories: ['People'], tags: [':thumbs-up:'] },
        { codepoint: '1f44d_1f3fd', popularity: 4, categories: ['People'], tags: [':thumbs-up:'] },
        { codepoint: '1f602', popularity: 9, categories: ['Smileys and emotions'], tags: [':joy:'] },
      ],
    });
    expect(icons.map((i) => i.emoji)).toEqual(['😂', '👍']);
  });

  test('new emoji from Google turn up on their own, marked New, and are downloaded ahead', async () => {
    const { Image } = require('expo-image');
    const prefetch = jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
    const day1 = { icons: [{ codepoint: '1f602', popularity: 9, categories: ['Smileys and emotions'], tags: [':joy:'] }] };
    const day2 = { icons: [...day1.icons, { codepoint: '1f426_200d_1f525', popularity: 3, categories: ['Animals and nature'], tags: [':phoenix:'] }] };
    const fetcher = (json) => jest.fn(async () => ({ ok: true, json: async () => json }));
    const first = await stickers.loadStickers({ fetcher: fetcher(day1), now: 0 });
    // The first fetch isn't news.
    expect(first.fresh).toEqual([]);
    const second = await stickers.loadStickers({ fetcher: fetcher(day2), now: 25 * 3600e3 });
    expect(second.fresh).toEqual(['1f426_200d_1f525']);
    expect(prefetch.mock.calls.at(-1)[0][0]).toBe(stickers.stickerUrl('🐦‍🔥'));
    // Within the day: no refetch.
    const f = fetcher(day2);
    await stickers.loadStickers({ fetcher: f, now: 26 * 3600e3 });
    expect(f).not.toHaveBeenCalled();
    stickers.clearFresh();
    expect((await stickers.loadStickers({ fetcher: f, now: 26 * 3600e3 })).fresh).toEqual([]);
  });

  test('offline the first time: the built-in set still works', async () => {
    const out = await stickers.loadStickers({ fetcher: jest.fn(async () => Promise.reject(new Error('offline'))), now: 0 });
    expect(out.icons.map((i) => i.emoji)).toEqual(expect.arrayContaining(['🔥', '❤️', '😂']));
  });

  test('recently used come first, without repeats', async () => {
    await stickers.rememberSticker('🔥');
    await stickers.rememberSticker('😂');
    expect(await stickers.rememberSticker('🔥')).toEqual(['🔥', '😂']);
  });
});

describe('the station you last loved', () => {
  function Last() {
    const v = liked.useLastLiked();
    return <Text testID="last">{v ? `${v.emoji} ${v.station.name}` : 'none'}</Text>;
  }

  test('a 🔥 or ❤️ on a playing station becomes the last loved one, live and saved; 🔥 is Hype too', async () => {
    await render(<Last />);
    await act(async () => {});
    expect(screen.getByTestId('last')).toHaveTextContent('none');
    await act(async () => liked.likeStation(STATION, 'heart'));
    expect(screen.getByTestId('last')).toHaveTextContent('❤️ Softlife Afrofusion Radio');
    expect(hypeStation).not.toHaveBeenCalled();
    await act(async () => liked.likeStation({ ...STATION, id: 'st-2', name: 'Hotmix Afro Beats' }, 'fire'));
    expect(screen.getByTestId('last')).toHaveTextContent('🔥 Hotmix Afro Beats');
    expect(hypeStation).toHaveBeenCalledWith('st-2');
    liked.__reset();
    expect((await liked.lastLiked()).station.name).toBe('Hotmix Afro Beats');
  });

  test('the Radio reaction bar reports which one was tapped', async () => {
    const Reactions = require('../src/components/Reactions').default;
    const onReact = jest.fn();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    jest.useFakeTimers();
    await render(<Reactions onReact={onReact} />);
    await user.press(screen.getByTestId('radio-react-fire'));
    await user.press(screen.getByTestId('radio-react-heart'));
    expect(onReact.mock.calls).toEqual([['fire'], ['heart']]);
    jest.useRealTimers();
  });
});

describe('Car Settings', () => {
  test('every theme can be reached: the sheet scrolls, and picking one saves it', async () => {
    jest.useFakeTimers();
    const CarSettings = require('../src/components/car/CarSettings').default;
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(<CarSettings open onClose={() => {}} />);
    await act(async () => {});
    const scroller = screen.getByTestId('car-settings');
    expect(scroller.type).toBe('RCTScrollView');
    for (const id of ['noir', 'aurora', 'chrome', 'sunset', 'carbon']) expect(screen.getByTestId(`car-theme-${id}`)).toBeOnTheScreen();
    await user.press(screen.getByTestId('car-theme-carbon'));
    expect(screen.getByTestId('car-theme-carbon').props.accessibilityState).toEqual({ checked: true });
    expect(await AsyncStorage.getItem('boa.car.theme')).toBe('carbon');
    jest.useRealTimers();
  });
});
