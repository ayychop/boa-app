import fs from 'fs';
import path from 'path';
import { act, render, screen } from '@testing-library/react-native';

jest.useFakeTimers();

const mockRpc = jest.fn(async () => ({ data: null, error: null }));
const mockUpdate = jest.fn();
jest.mock('../src/lib/supabase', () => {
  const chain = new Proxy(
    {},
    {
      get(_, key) {
        if (key === 'then') return (ok) => Promise.resolve({ data: [], error: null }).then(ok);
        if (key === 'update') return (...a) => (mockUpdate(...a), chain);
        return () => chain;
      },
    },
  );
  return { isConfigured: true, supabase: { from: () => chain, rpc: (...a) => mockRpc(...a) } };
});

const { assertCloudUrl, isCloudUrl } = require('../src/api/upload');
const hub = require('../src/api/hub');
const { floorInsets, ANDROID_MIN_BOTTOM_INSET } = require('../src/components/SafeBottomFloor');
const { tabSizing, tabLabel, routeLink } = require('../App');
const { applyMeta, missingMeta, profileHandleFromPath, profileMeta } = require('../src/web/seo');
const { boaCodeLink, qrMatrix } = require('../src/components/hub/BoaCode');
const PublicProfileScreen = require('../src/screens/PublicProfileScreen').default;

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('media is saved to the cloud, never as a phone path', () => {
  test('only https links count as cloud links', () => {
    expect(isCloudUrl('https://x.supabase.co/storage/v1/object/public/avatars/me/a.jpg')).toBe(true);
    expect(isCloudUrl('file:///data/user/0/com.boa/cache/a.jpg')).toBe(false);
    expect(isCloudUrl('content://media/external/images/1')).toBe(false);
    expect(() => assertCloudUrl(null)).not.toThrow();
    expect(() => assertCloudUrl('file:///a.jpg')).toThrow(/hasn't finished uploading/);
  });

  test('a profile picture saved as a phone path is refused before it reaches the database', async () => {
    await expect(hub.updateProfile('me', { avatar_url: 'file:///cache/me.jpg' })).rejects.toThrow(/hasn't finished uploading/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('uploads read files from disk, and the database refuses phone paths too', () => {
    for (const f of ['src/api/hub.js', 'src/api/posts.js']) expect(read(f)).not.toMatch(/fetch\((asset\.)?uri\)\)\.arrayBuffer/);
    const sql = read('supabase/migrations/20261026180000_cloud_media_view_once_public_profiles.sql');
    expect(sql).toMatch(/profiles_avatar_cloud_check[\s\S]*\^https:\/\//);
    expect(sql).toMatch(/posts_media_cloud_check/);
  });
});

describe('tab bar and safe areas', () => {
  test('phones get big icons and labels in a taller bar', () => {
    // S26 Ultra (412pt / 7) and a Fold cover screen (344pt / 7).
    expect(tabSizing(412 / 7, true)).toEqual(expect.objectContaining({ icon: 29, label: 12.5, height: 74 }));
    expect(tabSizing(344 / 7, true).icon).toBeGreaterThanOrEqual(26);
    expect(tabSizing(344 / 7, true).label).toBeGreaterThanOrEqual(11.5);
    expect(tabLabel('Originals', true)).toBe('Originals');
    expect(tabLabel('Originals', false)).toBe('BOA Originals');
  });

  test('Android never gets less than the gesture bar at the bottom', () => {
    expect(floorInsets({ top: 24, bottom: 0, left: 0, right: 0 }, 'android').bottom).toBe(ANDROID_MIN_BOTTOM_INSET);
    expect(floorInsets({ top: 24, bottom: 48, left: 0, right: 0 }, 'android').bottom).toBe(48);
    expect(floorInsets({ top: 47, bottom: 0, left: 0, right: 0 }, 'ios').bottom).toBe(0);
  });
});

describe('view once', () => {
  test('opening goes through the database, which allows it once and only for the recipient', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: "You've already opened this." } });
    await expect(hub.openViewOnce({ id: 'm1' })).rejects.toThrow(/already opened/);
    expect(mockRpc).toHaveBeenCalledWith('open_view_once', { msg: 'm1' });
    const sql = read('supabase/migrations/20261026180000_cloud_media_view_once_public_profiles.sql');
    expect(sql).toMatch(/create or replace function public\.open_view_once/);
    expect(sql).toMatch(/interval '2 minutes'/);
    expect(sql).toMatch(/chat media delete opened view once/);
  });

  test('FLAG_SECURE is part of the native screen module', () => {
    expect(read('modules/boa-screen/android/src/main/java/expo/modules/boascreen/BoaScreenModule.kt')).toMatch(/FLAG_SECURE/);
  });
});

describe('public profile links', () => {
  test('/u/<username> and /@<username> are profile paths', () => {
    expect(profileHandleFromPath('/u/Jo.Boa')).toBe('jo.boa');
    expect(profileHandleFromPath('/@jo.boa/')).toBe('jo.boa');
    expect(profileHandleFromPath('/radio')).toBeNull();
  });

  test('search sees the name ("Jo BOA BOA HUB" finds it), never the bio; private profiles are noindex', () => {
    const meta = profileMeta({ username: 'jo.boa', display_name: 'Jo BOA', avatar_url: 'https://cdn/x.jpg', indexable: true, bio: 'secret bio' });
    expect(meta.title).toBe('Jo BOA (@jo.boa) · BOA HUB');
    expect(meta.description).not.toMatch(/secret bio/);
    expect(meta.image).toBe('https://cdn/x.jpg');
    expect(meta.jsonLd.mainEntity.name).toBe('Jo BOA');
    expect(meta.noindex).toBe(false);
    expect(profileMeta({ username: 'jo.boa', display_name: 'Jo', indexable: false }).noindex).toBe(true);
    expect(missingMeta().noindex).toBe(true);
  });

  test('the tags are written into the page head', () => {
    const els = [];
    const make = (tag) => {
      const attrs = {};
      const el = { tag, attrs, setAttribute: (k, v) => (attrs[k] = v), remove: jest.fn() };
      return el;
    };
    const doc = {
      title: '',
      head: {
        querySelector: (sel) => els.find((e) => Object.entries(e.attrs).some(([k, v]) => sel.includes(`${k}="${v}"`))) ?? null,
        appendChild: (e) => els.push(e),
      },
      createElement: make,
      getElementById: () => null,
    };
    applyMeta(profileMeta({ username: 'jo.boa', display_name: 'Jo BOA', indexable: true }), doc);
    expect(doc.title).toBe('Jo BOA (@jo.boa) · BOA HUB');
    expect(els.find((e) => e.attrs.property === 'og:title').attrs.content).toBe('Jo BOA (@jo.boa) · BOA HUB');
    expect(els.find((e) => e.attrs.name === 'robots').attrs.content).toBe('index, follow');
    expect(els.find((e) => e.attrs.rel === 'canonical').attrs.href).toMatch(/\/u\/jo\.boa$/);
  });

  test('signed out, a link shows the picture, name and favourites; posts and reels stay locked', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { username: 'jo.boa', display_name: 'Jo BOA', avatar_url: null, indexable: false, favourites: [{ target_kind: 'station', target_id: 's1', target_label: 'World Music Radio', target_meta: { name: 'World Music Radio' } }] },
      error: null,
    });
    await render(<PublicProfileScreen username="jo.boa" />);
    await act(async () => {});
    expect(mockRpc).toHaveBeenCalledWith('public_profile', { handle: 'jo.boa' });
    expect(screen.getByText('Jo BOA')).toBeOnTheScreen();
    expect(screen.getByText('World Music Radio')).toBeOnTheScreen();
    expect(screen.getByText(/Sign in or sign up to enjoy BOA HUB fully/)).toBeOnTheScreen();
    expect(screen.getByTestId('public-media-locked')).toBeOnTheScreen();
    expect(screen.queryByTestId('post-grid')).toBeNull();
  });

  test('the public RPC never returns posts, reels or bios', () => {
    const sql = read('supabase/migrations/20261026180000_cloud_media_view_once_public_profiles.sql');
    const fn = sql.slice(sql.indexOf('function public.public_profile(handle text)'), sql.indexOf('revoke all on function public.public_profile(text)'));
    expect(fn).not.toMatch(/public\.posts|'bio'|'roles'/);
    expect(fn).toMatch(/'favourites'/);
    expect(fn).toMatch(/'indexable'/);
  });
});

describe('BOA Code', () => {
  test('a QR of the profile deep link, which opens that profile', async () => {
    expect(boaCodeLink('jo.boa')).toBe('network.boa://u/jo.boa');
    const qr = qrMatrix(boaCodeLink('jo.boa'));
    expect(qr.size).toBeGreaterThanOrEqual(21);
    // The finder pattern's dark corner.
    expect(qr.on(0, 0)).toBe(true);
    expect(routeLink('network.boa://u/jo.boa')).toBe(true);
    expect(routeLink('network.boa://u/')).toBe(false);
  });
});
