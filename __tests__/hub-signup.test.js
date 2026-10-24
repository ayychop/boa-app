// The profile insert and the avatar upload, against a stand-in Supabase.
const mockInsert = jest.fn();
const mockUpload = jest.fn();
const mockList = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  isConfigured: true,
  supabase: {
    from: () => ({
      insert: (row) => {
        mockInsert(row);
        return { select: () => ({ single: () => mockInsert.result }) };
      },
    }),
    storage: {
      from: () => ({
        upload: (...args) => mockUpload(...args),
        list: (...args) => mockList(...args),
        remove: jest.fn(async () => ({})),
        getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn.example/${p}` } }),
      }),
    },
  },
}));

const hub = require('../src/api/hub');

const FIELDS = { username: 'Ama.Directs', display_name: 'Ama', avatar_url: null, bio: null, roles: ['director'] };

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.result = Promise.resolve({ data: { id: 'user-me', username: 'ama.directs' }, error: null });
  mockUpload.mockResolvedValue({ data: {}, error: null });
  mockList.mockResolvedValue({ data: [] });
  global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(1024) }));
});

describe('creating a profile', () => {
  test('sends the moment "I am 18 or over" was ticked as adult_confirmed_at', async () => {
    const ticked = '2026-10-24T18:30:00.000Z';
    await hub.createProfile('user-me', FIELDS, { adultConfirmedAt: ticked });
    const row = mockInsert.mock.calls[0][0];
    expect(row).toMatchObject({ id: 'user-me', username: 'ama.directs', adult_confirmed_at: ticked, terms_version: hub.TERMS_VERSION });
    expect(Date.parse(row.terms_accepted_at)).not.toBeNaN();
  });

  test('without the 18+ confirmation nothing is sent', async () => {
    await expect(hub.createProfile('user-me', FIELDS)).rejects.toThrow('confirm you are 18 or over');
    await expect(hub.createProfile('user-me', FIELDS, { adultConfirmedAt: 'not a date' })).rejects.toThrow();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('a failed insert logs the exact database error and says what went wrong', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const message = "Could not find the 'adult_confirmed_at' column of 'profiles' in the schema cache";
    mockInsert.result = Promise.resolve({ data: null, error: { code: 'PGRST204', message, details: null, hint: null } });
    const ticked = '2026-10-24T18:30:00.000Z';
    const failure = await hub.createProfile('user-me', FIELDS, { adultConfirmedAt: ticked }).catch((e) => e);
    expect(failure.message).toBe(`The Hub's database isn't up to date, so your profile couldn't be saved. (${message})`);
    expect(failure.code).toBe('PGRST204');
    const [label, logged] = warn.mock.calls.find((c) => c[0] === '[hub] createProfile insert failed');
    expect(label).toBeTruthy();
    expect(JSON.parse(logged)).toMatchObject({ code: 'PGRST204', message, adult_confirmed_at: ticked });
    expect(JSON.parse(logged).columns).toEqual(expect.arrayContaining(['adult_confirmed_at', 'terms_accepted_at', 'username']));
    warn.mockRestore();
  });
});

describe('uploading a photo', () => {
  const photo = { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', fileSize: 200000 };

  test('a normal photo uploads and returns its public address', async () => {
    await expect(hub.uploadAvatar('user-me', photo)).resolves.toMatch(/^https:\/\/cdn\.example\/user-me\/avatar-\d+\.jpg$/);
  });

  test('a photo over 5 MB is refused before anything is sent', async () => {
    await expect(hub.uploadAvatar('user-me', { ...photo, fileSize: 8 * 1024 * 1024 })).rejects.toThrow('over 5 MB');
    expect(mockUpload).not.toHaveBeenCalled();
    expect(hub.avatarProblem({ ...photo, mimeType: 'image/heic' })).toMatch(/JPEG, PNG or WebP/);
  });

  test('a dropped connection gives a readable error, never a crash', async () => {
    mockUpload.mockRejectedValue(new TypeError('Network request failed'));
    await expect(hub.uploadAvatar('user-me', photo)).rejects.toThrow("Couldn't upload: no connection");
    mockUpload.mockResolvedValue({ data: null, error: { message: 'The object exceeded the maximum allowed size' } });
    await expect(hub.uploadAvatar('user-me', photo)).rejects.toThrow('over 5 MB');
  });

  test('a stalled upload times out', async () => {
    jest.useFakeTimers();
    mockUpload.mockReturnValue(new Promise(() => {}));
    const pending = hub.uploadAvatar('user-me', photo);
    const check = expect(pending).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(31000);
    await check;
    jest.useRealTimers();
  });

  test('cleaning up old photos failing does not undo the new one', async () => {
    mockList.mockRejectedValue(new Error('offline'));
    await expect(hub.uploadAvatar('user-me', photo)).resolves.toContain('/user-me/avatar-');
  });
});
