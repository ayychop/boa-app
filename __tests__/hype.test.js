import * as fs from 'fs';
import * as path from 'path';

// Hype: fires on stations from the car, ranking Home's Trending, and the
// Android Automotive OS video build, off unless asked for.

jest.mock('../src/lib/supabase', () => ({ supabase: null }));

const { rankByHype, HYPED_EXTRAS } = require('../src/api/hype');
const withAutomotiveVideo = require('../plugins/withAutomotiveVideo');

const st = (id) => ({ kind: 'radio', id, name: id, streamUrl: `https://s/${id}.mp3` });

describe('Trending with Hype', () => {
  test('the most hyped pick leads; no hype keeps the admins order', () => {
    const picked = [st('a'), st('b'), st('c')];
    const out = rankByHype(picked, new Map([['c', 5], ['b', 2]]));
    expect(out.map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(out.map((s) => s.hype)).toEqual([5, 2, 0]);
    expect(rankByHype(picked, new Map()).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  test('hyped curated stations can join the row, a few at most, and unhyped ones never do', () => {
    const picked = [st('a')];
    const curated = [st('a'), st('x'), st('y'), st('z'), st('w'), st('quiet')];
    const hype = new Map([['x', 9], ['y', 1], ['z', 4], ['w', 2]]);
    const out = rankByHype(picked, hype, curated);
    expect(out).toHaveLength(1 + HYPED_EXTRAS);
    expect(out.map((s) => s.id)).toEqual(['x', 'z', 'w', 'a']);
    expect(out.some((s) => s.id === 'quiet')).toBe(false);
  });
});

describe('the station_reactions migration', () => {
  const dir = path.join(__dirname, '../supabase/migrations');
  const sql = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('_station_reactions.sql'))), 'utf8');

  test('has the table, private rows, one fire a day, and public totals only', () => {
    expect(sql).toMatch(/create table if not exists public\.station_reactions/);
    for (const col of ['id uuid', 'user_id uuid', 'station_id text', 'reaction_type text', 'created_at timestamptz']) expect(sql).toContain(col);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/for select to authenticated using \(user_id = auth\.uid\(\)\)/);
    expect(sql).toMatch(/interval '24 hours'/);
    expect(sql).toMatch(/grant insert \(station_id, reaction_type\)/);
    expect(sql).toMatch(/function public\.station_hype/);
    expect(sql).not.toMatch(/for (update|delete)/);
  });
});

describe('the Android Automotive OS video build', () => {
  const appConfig = require('../app.config.js');
  const base = require('../app.json').expo;
  const hasPlugin = (c) => (c.plugins ?? []).includes('./plugins/withAutomotiveVideo');

  afterEach(() => {
    delete process.env.BOA_AUTOMOTIVE;
  });

  test('is off by default, so the phone build never changes', () => {
    expect(hasPlugin(appConfig({ config: base }))).toBe(false);
  });

  test('is on only with BOA_AUTOMOTIVE=1', () => {
    process.env.BOA_AUTOMOTIVE = '1';
    expect(hasPlugin(appConfig({ config: base }))).toBe(true);
  });

  test('marks the app a video app for cars, frees the phone features and forbids distractionOptimized', () => {
    const m = withAutomotiveVideo.applyAutomotive({
      $: {},
      'uses-feature': [{ $: { 'android:name': 'android.hardware.camera', 'android:required': 'true' } }],
      application: [{ $: {}, 'meta-data': [{ $: { 'android:name': 'distractionOptimized', 'android:value': 'true' } }], activity: [{ $: {} }] }],
    });
    const feature = (n) => m['uses-feature'].find((f) => f.$['android:name'] === n).$;
    expect(feature('android.hardware.type.automotive')['android:required']).toBe('true');
    for (const n of withAutomotiveVideo.NOT_REQUIRED) expect(feature(n)).toEqual(expect.objectContaining({ 'android:required': 'false', 'tools:replace': 'android:required' }));
    expect(m['uses-feature'].filter((f) => f.$['android:name'] === 'android.hardware.camera')).toHaveLength(1);
    expect(m.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    expect(m.application[0].$['android:appCategory']).toBe('video');
    expect(m.application[0]['meta-data']).toEqual([]);
  });
});
