import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.useFakeTimers();

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// A stand-in for the Supabase client: the calls the safety layer makes, recorded.
const fake = { updates: [], inserts: [], metadata: [], invokes: [], signOuts: [], invokeResult: { data: { allowed: true }, error: null }, profileError: null };
jest.mock('../src/lib/supabase', () => {
  const profiles = {
    update: (row) => ({ eq: async () => (fake.updates.push(row), { error: fake.profileError }) }),
    insert: async (row) => (fake.inserts.push(row), { error: null }),
  };
  return {
    isConfigured: true,
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1' } } }),
        updateUser: async (arg) => (fake.metadata.push(arg), { data: {}, error: null }),
        signOut: async (arg) => (fake.signOuts.push(arg), {}),
      },
      from: () => profiles,
      functions: { invoke: async (name, opts) => (fake.invokes.push({ name, body: opts.body }), fake.invokeResult) },
    },
  };
});

// These tests use the real safety layer, not jest.setup's pass-through.
const guard = jest.requireActual('../src/safety/guard');
const consent = require('../src/safety/consent');
const moderation = require('../src/safety/moderation');
const { SafetyError, isHandled } = require('../src/safety/errors');
const { TERMS_VERSION } = require('../src/safety/terms');

const signedIn = (terms_version) => consent.sync({ user: { id: 'u1', user_metadata: {} }, profile: { id: 'u1', terms_version } });

beforeEach(() => {
  fake.updates.length = 0;
  fake.inserts.length = 0;
  fake.signOuts.length = 0;
  fake.metadata.length = 0;
  fake.invokes.length = 0;
  fake.invokeResult = { data: { allowed: true }, error: null };
  fake.profileError = null;
  moderation.dismissViolation();
  consent.sync({});
});

describe('Terms acceptance gate', () => {
  test('the current terms version is the one the database requires', () => {
    const sql = read('supabase/migrations/20261104180000_play_compliance.sql');
    expect(sql).toContain(`p.terms_version >= '${TERMS_VERSION}'`);
    expect(require('../src/api/hub').TERMS_VERSION).toBe(TERMS_VERSION);
  });

  test('someone who has agreed to the current terms is never asked again', async () => {
    signedIn(TERMS_VERSION);
    await expect(guard.terms()).resolves.toBe(true);
    expect(consent.getState().open).toBe(false);
  });

  test('older terms ask again; I Agree writes the profile and user_metadata, then lets the action through', async () => {
    signedIn('2026-10-24');
    expect(consent.isAccepted()).toBe(false);
    let done = false;
    const pending = guard.terms().then(() => (done = true));
    await act(async () => {});
    expect(consent.getState().open).toBe(true);
    expect(done).toBe(false);
    await act(async () => {
      await consent.accept();
    });
    await pending;
    expect(done).toBe(true);
    expect(fake.updates[0]).toMatchObject({ terms_version: TERMS_VERSION });
    expect(fake.updates[0].terms_accepted_at).toEqual(expect.any(String));
    expect(fake.metadata[0].data).toMatchObject({ terms_accepted: true, terms_version: TERMS_VERSION });
    expect(consent.isAccepted()).toBe(true);
  });

  test('closing the agreement stops the action with a handled error', async () => {
    signedIn(null);
    const pending = guard.terms();
    const caught = pending.catch((e) => e);
    await act(async () => {});
    consent.decline();
    const err = await caught;
    expect(err).toBeInstanceOf(SafetyError);
    expect(err.code).toBe('terms_declined');
    expect(isHandled(err)).toBe(true);
  });

  test('several actions at once share one agreement', async () => {
    signedIn(null);
    const a = guard.terms();
    const b = guard.terms();
    await act(async () => {
      await consent.accept();
    });
    await Promise.all([a, b]);
    expect(fake.updates).toHaveLength(1);
  });

  test('a failed save keeps the agreement open and nothing goes through', async () => {
    signedIn(null);
    fake.profileError = { message: 'offline' };
    let done = false;
    guard.terms().then(() => (done = true), () => {});
    await act(async () => {});
    await expect(consent.accept()).rejects.toThrow(/save your agreement/);
    expect(done).toBe(false);
    expect(consent.getState().open).toBe(true);
    consent.decline();
  });

  test('while signing up (no profile yet) the sign up form is the agreement', async () => {
    consent.sync({ user: { id: 'u1', user_metadata: {} }, profile: null });
    await expect(guard.terms()).resolves.toBe(true);
  });

  test('every API path that creates content goes through the guard', () => {
    const hub = read('src/api/hub.js');
    for (const fn of ['sendMessage', 'sendSticker', 'sendGif', 'uploadChatMedia', 'sendMedia', 'uploadAvatar', 'updateProfile', 'createProfile']) {
      const body = hub.slice(hub.indexOf(`function ${fn}(`));
      expect(body.slice(0, 2600)).toMatch(/guard\.(text|textOnly|terms|media)\(/);
    }
    expect(read('src/api/posts.js')).toMatch(/await guard\.terms\(\)[\s\S]*guard\.media\('post'/);
    expect(read('src/api/casting.js')).toMatch(/guard\.text\('casting', coverNote\)/);
    expect(read('src/api/casting.js')).toMatch(/guard\.text\('casting', title/);
  });
});

describe('Content moderation', () => {
  test('nothing to check is allowed without a call', async () => {
    await expect(moderation.moderate({ surface: 'message', text: '   ' })).resolves.toMatchObject({ allowed: true });
    expect(fake.invokes).toHaveLength(0);
  });

  test('clean content passes, sent to moderate-content with its surface', async () => {
    await moderation.moderate({ surface: 'post', text: 'hello', image: { bucket: 'posts', path: 'u1/image-1.jpg' } });
    expect(fake.invokes[0]).toEqual({ name: 'moderate-content', body: { surface: 'post', text: 'hello', image: { bucket: 'posts', path: 'u1/image-1.jpg' } } });
  });

  test('refused content shows the Content Violates Guidelines card and throws a handled error', async () => {
    fake.invokeResult = { data: { allowed: false, categories: ['sexual'] }, error: null };
    const err = await moderation.moderate({ surface: 'post', text: 'x' }).catch((e) => e);
    expect(err.code).toBe('violation');
    expect(isHandled(err)).toBe(true);
    expect(moderation.getViolation()).toEqual({ surface: 'post', categories: ['sexual'] });
    expect(moderation.describeCategories(['sexual', 'violence'])).toBe('nudity or sexual content and violent or graphic content');
  });

  test('when the check cannot run, nothing is posted (fails closed) and the person is told', async () => {
    fake.invokeResult = { data: null, error: { message: 'boom', context: { status: 502, json: async () => ({ error: 'The content check is unavailable.' }) } } };
    const err = await moderation.moderate({ surface: 'message', text: 'hi' }).catch((e) => e);
    expect(err.code).toBe('unavailable');
    expect(isHandled(err)).toBe(false);
    expect(err.message).toMatch(/wasn't sent/);
    expect(moderation.getViolation()).toBeNull();
  });

  test('guard.text checks the agreement first, then the text, joined', async () => {
    signedIn(TERMS_VERSION);
    await guard.text('profile', 'Display', 'A bio');
    expect(fake.invokes[0].body).toEqual({ surface: 'profile', text: 'Display\nA bio' });
    fake.invokes.length = 0;
    await guard.text('message', '  ');
    expect(fake.invokes).toHaveLength(0);
  });
});

describe('SafetyHost cards', () => {
  const SafetyHost = require('../src/components/safety/SafetyHost').default;

  test('the agreement blocks until the box is ticked, then I Agree records it', async () => {
    signedIn('2026-10-24');
    await render(<SafetyHost />);
    expect(screen.queryByTestId('terms-gate')).toBeNull();
    let done = false;
    await act(async () => {
      guard.terms().then(() => (done = true), () => {});
    });
    expect(screen.getByTestId('terms-gate')).toBeTruthy();
    expect(screen.getByTestId('terms-link')).toBeTruthy();
    expect(screen.getByTestId('guidelines-link')).toBeTruthy();
    // Disabled until the checkbox is ticked.
    await fireEvent.press(screen.getByTestId('terms-agree'));
    expect(fake.updates).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('terms-checkbox'));
    await fireEvent.press(screen.getByTestId('terms-agree'));
    await act(async () => {});
    expect(fake.updates).toHaveLength(1);
    expect(done).toBe(true);
    expect(screen.queryByTestId('terms-gate')).toBeNull();
  });

  test('"Not now" closes the agreement and stops the action', async () => {
    signedIn(null);
    await render(<SafetyHost />);
    let caught;
    await act(async () => {
      caught = guard.terms().catch((e) => e);
    });
    await fireEvent.press(screen.getByTestId('terms-decline'));
    expect((await caught).code).toBe('terms_declined');
    expect(screen.queryByTestId('terms-gate')).toBeNull();
  });

  test('the violation card names what was refused, and closes', async () => {
    await render(<SafetyHost />);
    await act(async () => {
      moderation.showViolation('message', ['harassment']);
    });
    expect(screen.getByText('Content Violates Guidelines')).toBeTruthy();
    expect(screen.getByTestId('violation-detail').props.children).toMatch(/harassment or bullying/);
    await fireEvent.press(screen.getByTestId('violation-ok'));
    expect(screen.queryByTestId('violation-card')).toBeNull();
  });
});

describe('Reporting and blocking', () => {
  test('the report reasons cover the Play basics and match what the database accepts', () => {
    const { REPORT_REASONS } = require('../src/api/hub');
    const ids = REPORT_REASONS.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['harassment', 'spam', 'sexual', 'hate', 'violence', 'self_harm', 'illegal']));
    const sql = read('supabase/migrations/20261104180000_play_compliance.sql');
    for (const id of ids) expect(sql).toContain(`'${id}'`);
  });

  test('profiles, posts and messages all have a flag; profiles have Block', () => {
    expect(read('src/screens/hub/HubProfileScreen.js')).toMatch(/flag-outline[\s\S]*hub-report-user/);
    expect(read('src/screens/hub/HubProfileScreen.js')).toMatch(/profile-block/);
    expect(read('src/screens/hub/HubPostScreen.js')).toMatch(/flag-outline[\s\S]*post-report/);
    expect(read('src/screens/hub/NewChatScreen.js')).toMatch(/onReport=/);
    expect(read('src/components/hub/ReportSheet.js')).toMatch(/post: target\.post/);
  });

  test('a post report names the post and keeps its caption', async () => {
    const hub = require('../src/api/hub');
    await hub.report({ post: { id: 'p1', author_id: 'u2', caption: 'a caption' }, reason: 'spam' });
    expect(fake.inserts[0]).toEqual(expect.objectContaining({ reported_user_id: 'u2', post_id: 'p1', content_excerpt: 'a caption', content_type: 'post', reason: 'spam' }));
    await expect(hub.report({ userId: 'u2', reason: 'nonsense' })).rejects.toThrow(/reason/);
    await hub.report({ userId: 'u2', reason: 'spam' });
    expect(fake.inserts[1]).not.toHaveProperty('post_id');
  });

  test('blocked people are hidden from the casting board, chats, directory and hearts', () => {
    expect(read('src/components/casting/CastingBoard.js')).toMatch(/blocked\?\.has\?\.\(c\.producer_id\)/);
    for (const f of ['HubChatsScreen', 'HubDirectoryScreen', 'HubHeartsScreen', 'ChatHome']) expect(read(`src/screens/hub/${f}.js`)).toMatch(/blocked\.has/);
  });

  test('chat drops a refused message instead of leaving it to retry', () => {
    expect(read('src/screens/hub/NewChatScreen.js')).toMatch(/if \(isHandled\(err\)\) \{\s*setMessages\(\(l\) => l\.filter/);
  });
});

describe('Account deletion', () => {
  const { confirmsDeletion } = require('../src/components/safety/DeleteAccountSheet');

  test('typed confirmation', () => {
    expect(confirmsDeletion('DELETE')).toBe(true);
    expect(confirmsDeletion(' delete ')).toBe(true);
    expect(confirmsDeletion('')).toBe(false);
    expect(confirmsDeletion('delet')).toBe(false);
  });

  test('the app calls the delete-account Edge Function, and the web page URL is set', async () => {
    const { DELETE_ACCOUNT_URL } = require('../src/safety/terms');
    expect(DELETE_ACCOUNT_URL).toBe('https://www.boanetworks.com/delete-account');
    const hub = require('../src/api/hub');
    fake.invokeResult = { data: { deleted: true }, error: null };
    await hub.deleteMyAccount('u1');
    expect(fake.invokes[0]).toEqual({ name: 'delete-account', body: { confirm: 'DELETE' } });
    expect(fake.signOuts[0]).toEqual({ scope: 'local' });
    fake.invokeResult = { data: null, error: { message: 'x', context: { json: async () => ({ error: 'Too many attempts.' }) } } };
    await expect(hub.deleteMyAccount('u1')).rejects.toThrow('Too many attempts.');
  });

  test('Settings has Delete Account and the legal links', () => {
    const src = read('src/screens/hub/HubSettingsScreen.js');
    expect(src).toMatch(/title="Delete Account"/);
    expect(src).toMatch(/DeleteAccountSheet/);
    for (const t of ['Terms of Service', 'Community Guidelines', 'Privacy Policy', 'Delete account on the web']) expect(src).toContain(t);
  });

  test('delete-account: own session only, typed DELETE, files, admin entry, auth user, CORS for the site, rate limits', () => {
    const src = read('supabase/functions/delete-account/index.ts');
    expect(src).toMatch(/auth\.getUser\(\)/);
    expect(src).toMatch(/confirm !== 'DELETE'/);
    expect(src).toMatch(/removeFolder\(admin, 'chat-media'/);
    for (const b of ['avatars', 'posts', 'block-evidence']) expect(src).toContain(`'${b}'`);
    expect(src).toMatch(/from\('admin_users'\)\.delete\(\)/);
    expect(src).toMatch(/auth\.admin\.deleteUser\(userId/);
    expect(src).toMatch(/https:\/\/www\.boanetworks\.com/);
    expect(src).toMatch(/https:\/\/boanetworks\.com/);
    expect(src).toMatch(/hit\(admin, memory, `delete-account:user:/);
    expect(src).toMatch(/OPTIONS/);
    // The user id comes only from the verified session, never from the body.
    expect(src).not.toMatch(/userId = String\(.*req\.json/);
  });

  test('CORS only for the BOA site', () => {
    const { corsHeaders } = require('../supabase/functions/_shared/safety.ts');
    const allowed = new Set(['https://www.boanetworks.com', 'https://boanetworks.com']);
    expect(corsHeaders('https://www.boanetworks.com', allowed)['Access-Control-Allow-Origin']).toBe('https://www.boanetworks.com');
    expect(corsHeaders('https://evil.example', allowed)['Access-Control-Allow-Origin']).toBeUndefined();
    expect(corsHeaders(null, allowed)['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('moderate-content function', () => {
  const { ownsFile, friendlyCategories } = require('../supabase/functions/_shared/safety.ts');

  test('a person can only have their own files checked', () => {
    expect(ownsFile('u1', { bucket: 'posts', path: 'u1/image-1.jpg' })).toBe(true);
    expect(ownsFile('u1', { bucket: 'posts', path: 'u2/image-1.jpg' })).toBe(false);
    expect(ownsFile('u1', { bucket: 'avatars', path: 'u1/a.png' })).toBe(true);
    expect(ownsFile('u1', { bucket: 'chat-media', path: 'conv/u1/image-1.jpg' })).toBe(true);
    expect(ownsFile('u1', { bucket: 'chat-media', path: 'conv/u2/image-1.jpg' })).toBe(false);
    expect(ownsFile('u1', { bucket: 'posts', path: 'u1/../u2/x.jpg' })).toBe(false);
    expect(ownsFile('u1', { bucket: 'secret', path: 'u1/x.jpg' })).toBe(false);
  });

  test('category names are friendly and unique', () => {
    expect(friendlyCategories({ 'harassment/threatening': true, harassment: true, 'self-harm': true, sexual: false })).toEqual(['harassment', 'self_harm']);
  });

  test('the function verifies the session, rate limits, fails closed, deletes refused files and logs no content', () => {
    const src = read('supabase/functions/moderate-content/index.ts');
    expect(src).toMatch(/omni-moderation-latest/);
    expect(src).toMatch(/auth\.getUser\(\)/);
    expect(src).toMatch(/hit\(admin, memory, `moderate:/);
    expect(src).toMatch(/refuse\(502, 'The content check is unavailable\.'/);
    expect(src).toMatch(/storage\.from\(image\.bucket\)\.remove/);
    expect(src).toMatch(/insert\(\{ user_id: userId, kind: image \? 'image' : 'text', surface, categories \}\)/);
    expect(src).toMatch(/banned_at/);
  });
});

describe('Play requirements in the build', () => {
  const expo = JSON.parse(read('app.json')).expo;
  const props = expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties')[1].android;

  test('targets Android 16 (API 36), compiled against a newer SDK', () => {
    expect(props.targetSdkVersion).toBe(36);
    expect(props.compileSdkVersion).toBeGreaterThanOrEqual(36);
  });

  test('no restricted or unneeded permissions get into the manifest', () => {
    const declared = [
      ...expo.android.permissions,
      ...['boa-alarm', 'boa-audio-guard', 'boa-call'].flatMap((m) => [...read(`modules/${m}/android/src/main/AndroidManifest.xml`).matchAll(/uses-permission[^>]*android:name="([^"]+)"/g)].map((x) => x[1])),
    ];
    const restricted = [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_PHONE_STATE',
      'android.permission.READ_CONTACTS',
      'android.permission.READ_SMS',
      'android.permission.MANAGE_EXTERNAL_STORAGE',
      'android.permission.QUERY_ALL_PACKAGES',
    ];
    for (const p of restricted) expect(declared).not.toContain(p);
    // Libraries add some of these on their own; the build strips them.
    for (const p of ['ACCESS_FINE_LOCATION', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO']) {
      expect(expo.android.blockedPermissions).toContain(`android.permission.${p}`);
    }
  });

  test('every remaining permission has a reason (the Play Console declaration list)', () => {
    const doc = read('PLAY_COMPLIANCE.md');
    for (const p of expo.android.permissions) expect(doc).toContain(p.replace('android.permission.', ''));
  });

  test('the app has no generative AI to disclose, and the doc says so', () => {
    expect(read('PLAY_COMPLIANCE.md')).toMatch(/No generative AI/);
  });
});

describe('Migration', () => {
  const sql = read('supabase/migrations/20261104180000_play_compliance.sql');
  test('post reports, the moderation log (locked), and the terms triggers on posts and messages', () => {
    expect(sql).toMatch(/add column if not exists post_id uuid references public\.posts/);
    expect(sql).toMatch(/create table if not exists public\.moderation_events/);
    expect(sql).toMatch(/alter table public\.moderation_events enable row level security/);
    expect(sql).toMatch(/revoke all on public\.moderation_events from public, anon, authenticated/);
    expect(sql).toMatch(/create trigger posts_require_terms before insert on public\.posts/);
    expect(sql).toMatch(/create trigger messages_require_terms before insert on public\.messages/);
    expect(sql).toMatch(/security definer[\s\S]*set search_path = ''/);
  });
});

describe('Edge Lighting', () => {
  const edge = require('../src/data/edgeLighting');
  const EdgeLighting = require('../src/components/EdgeLighting').default;

  const realState = AppState.currentState;
  afterEach(() => {
    edge.setEdgeLighting(false);
    edge.resetEdgeLighting();
    AppState.currentState = realState;
  });

  test('a call, a message or a heart pulses the edge once the toggle is on, and not before', async () => {
    AppState.currentState = 'active';
    await render(<EdgeLighting />);
    const seen = () => !!screen.queryByTestId('edge-lighting', { includeHiddenElements: true });
    edge.setEdgeLighting(false);
    await act(async () => void edge.triggerEdgeLighting('message', 10_000));
    expect(seen()).toBe(false);
    edge.setEdgeLighting(true);
    edge.resetEdgeLighting();
    await act(async () => void edge.triggerEdgeLighting('call', 20_000));
    expect(seen()).toBe(true);
  });

  test('one event arriving twice (realtime and push) is one pulse; a ringing call pulses again later', () => {
    AppState.currentState = 'active';
    edge.setEdgeLighting(true);
    edge.resetEdgeLighting();
    expect(edge.triggerEdgeLighting('message', 50_000)).toBe(true);
    expect(edge.triggerEdgeLighting('message', 50_300)).toBe(false);
    expect(edge.triggerEdgeLighting('call', 50_000 + edge.EDGE_RING_REPEAT_MS)).toBe(true);
  });

  test('nothing pulses when the app is in the background', () => {
    AppState.currentState = 'background';
    edge.setEdgeLighting(true);
    edge.resetEdgeLighting();
    expect(edge.triggerEdgeLighting('message', 90_000)).toBe(false);
  });

  test('calls, messages and hearts are all wired, and the call screen has its own overlay', () => {
    expect(read('src/context/CallContext.js')).toMatch(/triggerEdgeLighting\('call'\)/);
    expect(read('src/context/CallContext.js')).toMatch(/triggerEdgeLighting\('missed-call'\)/);
    expect(read('src/context/HubContext.js')).toMatch(/triggerEdgeLighting\('message'\)/);
    expect(read('src/context/HubContext.js')).toMatch(/triggerEdgeLighting\('heart'\)/);
    expect(read('src/components/calls/CallScreen.js')).toMatch(/<EdgeLighting \/>/);
  });
});

describe('Resuming where you were', () => {
  const { sanitizeNavState, saveNavState, loadNavState, RESTORE_WITHIN_MS } = require('../src/navigation/persist');
  const state = {
    key: 'k',
    index: 1,
    routeNames: ['Tabs', 'HubProfile', 'AlarmRinging'],
    routes: [
      { key: 'a', name: 'Tabs', state: { index: 3, routes: [{ key: 'b', name: 'Home' }, { key: 'c', name: 'Radio' }, { key: 'd', name: 'Talent' }, { key: 'e', name: 'Profile' }] } },
      { key: 'f', name: 'HubProfile', params: { id: 'u2' } },
      { key: 'g', name: 'AlarmRinging' },
    ],
  };

  test('keeps the tab and the page, drops screens that must not reopen by themselves', () => {
    const clean = sanitizeNavState(state);
    expect(clean.routes.map((r) => r.name)).toEqual(['Tabs', 'HubProfile']);
    expect(clean.routes[0].state.index).toBe(3);
    expect(clean.routes[1].params).toEqual({ id: 'u2' });
    expect(clean.routes.every((r) => r.key === undefined)).toBe(true);
    expect(clean.index).toBe(1);
    expect(sanitizeNavState({ routes: [{ name: 'AlarmRinging' }] })).toBeUndefined();
  });

  test('a recent visit comes back; an old one does not', async () => {
    await AsyncStorage.clear();
    await saveNavState(state, 1_000);
    expect((await loadNavState(1_000 + 60_000)).routes).toHaveLength(2);
    expect(await loadNavState(1_000 + RESTORE_WITHIN_MS + 1)).toBeUndefined();
  });

  test('the app restores it (a link wins) and keeps the activity alive through a fold', () => {
    const app = read('App.js');
    expect(app).toMatch(/initialState=\{initialState \?\? undefined\}/);
    expect(app).toMatch(/if \(!url\) state = \(await loadNavState\(\)\)/);
    const changes = JSON.parse(read('app.json')).expo.plugins.find((p) => Array.isArray(p) && p[0] === './plugins/withAndroidConfigChanges')[1].configChanges;
    for (const c of ['screenSize', 'smallestScreenSize', 'screenLayout', 'orientation', 'density', 'uiMode', 'fontScale', 'layoutDirection']) expect(changes).toContain(c);
  });
});
