import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

const mockAuth = {
  signInWithOAuth: jest.fn(),
  exchangeCodeForSession: jest.fn(),
};
jest.mock('../src/lib/supabase', () => ({ supabase: { auth: mockAuth }, isConfigured: true }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => {
  const listeners = new Set();
  return {
    createURL: (path) => `boa://${path}`,
    addEventListener: jest.fn((type, fn) => {
      listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    }),
    __open: (url) => listeners.forEach((fn) => fn({ url })),
  };
});

const { signInWithGoogle } = require('../src/api/hub');

const SESSION = { session: { user: { id: 'user-me' } } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://hub.example/auth/v1/authorize?provider=google' }, error: null });
  mockAuth.exchangeCodeForSession.mockResolvedValue({ data: SESSION, error: null });
});

test('Continue with Google opens Google, returns to boa://auth-callback and signs in with the code', async () => {
  WebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'boa://auth-callback?code=abc123' });
  await expect(signInWithGoogle()).resolves.toEqual(SESSION);
  expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
    provider: 'google',
    options: { redirectTo: 'boa://auth-callback', skipBrowserRedirect: true },
  });
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(expect.stringContaining('provider=google'), 'boa://auth-callback');
  expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
});

test('if the browser hands the return to the app as a link, that still signs in', async () => {
  WebBrowser.openAuthSessionAsync.mockImplementation(async () => {
    Linking.__open('boa://auth-callback?code=fromlink');
    return { type: 'dismiss' };
  });
  await expect(signInWithGoogle()).resolves.toEqual(SESSION);
  expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('fromlink');
});

test('closing the browser signs nobody in, and an OAuth error is shown', async () => {
  jest.useFakeTimers();
  WebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
  const cancelled = signInWithGoogle();
  await jest.advanceTimersByTimeAsync(1000);
  await expect(cancelled).resolves.toBeNull();
  jest.useRealTimers();

  WebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'boa://auth-callback#error=access_denied&error_description=Access+denied' });
  await expect(signInWithGoogle()).rejects.toThrow('Access denied');
  expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
});
