// What the call screen says when the agora-token function refuses: its own
// { error } and the status, not supabase-js's "non-2xx status code".
const mockInvoke = jest.fn();
jest.mock('../src/lib/supabase', () => ({ supabase: { functions: { invoke: (...a) => mockInvoke(...a) } } }));
const { fetchToken } = require('../src/calls/token');

const httpError = (status, body) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: { status, clone: () => ({ json: async () => body }) },
});

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test("the function's own reason and status reach the screen, and the console", async () => {
  mockInvoke.mockResolvedValueOnce({ data: null, error: httpError(401, { error: 'Sign in first.' }) });
  await expect(fetchToken('chan-0000000000000001')).rejects.toThrow('Sign in first. (401)');
  expect(console.error).toHaveBeenCalledWith('[call] agora-token failed', expect.objectContaining({ status: 401, message: 'Sign in first.' }));
});

test('a body that is not JSON keeps the status', async () => {
  mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status: 502, clone: () => ({ json: async () => { throw new Error('html'); } }) } } });
  await expect(fetchToken('chan-0000000000000001')).rejects.toThrow('Edge Function returned a non-2xx status code (502)');
});

test('a good answer comes straight back', async () => {
  mockInvoke.mockResolvedValueOnce({ data: { appId: 'a', token: 't', uid: 7, channel: 'c' }, error: null });
  await expect(fetchToken('chan-0000000000000001')).resolves.toEqual({ appId: 'a', token: 't', uid: 7, channel: 'c' });
});
