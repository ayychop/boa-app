// Email and password sign-in, sign-up with a confirmation link, and the
// link coming back to the app, against a stand-in Supabase.
import { act, render, screen, userEvent } from '@testing-library/react-native';

jest.useFakeTimers();

const mockAuth = {
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  resend: jest.fn(async () => ({ error: null })),
  exchangeCodeForSession: jest.fn(),
  verifyOtp: jest.fn(),
  setSession: jest.fn(),
};
jest.mock('../src/lib/supabase', () => ({ isConfigured: true, supabase: { auth: mockAuth } }));
jest.mock('../src/context/HubContext', () => ({ useHub: () => ({ userId: null, session: null, finishOnboarding: jest.fn() }) }));

const hub = require('../src/api/hub');
const SESSION = { access_token: 'a', user: { id: 'user-me' } };

beforeEach(() => jest.clearAllMocks());

describe('the API', () => {
  test('sign-up asks Supabase to send the confirmation link to network.boa://auth-callback', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: 'u', identities: [{ id: 'i' }] }, session: null }, error: null });
    await expect(hub.signUpWithEmail(' me@boa.network ', 'longenough')).resolves.toMatchObject({ session: null });
    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: 'me@boa.network',
      password: 'longenough',
      options: { emailRedirectTo: 'network.boa://auth-callback' },
    });
  });

  test('an email that already has an account is caught, whichever way Supabase says it', async () => {
    // Confirm email on: no error, a user with no identities.
    mockAuth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u', identities: [] }, session: null }, error: null });
    await expect(hub.signUpWithEmail('taken@boa.network', 'longenough')).rejects.toMatchObject({ code: 'user_already_exists', message: hub.EXISTING_EMAIL });
    // Confirm email off: an error.
    mockAuth.signUp.mockResolvedValueOnce({ data: {}, error: { code: 'user_already_exists', message: 'User already registered' } });
    await expect(hub.signUpWithEmail('taken@boa.network', 'longenough')).rejects.toMatchObject({ message: hub.EXISTING_EMAIL });
  });

  test('sign-in errors read plainly', async () => {
    mockAuth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    await expect(hub.signInWithEmail('me@boa.network', 'wrongpass')).rejects.toThrow("That email and password don't match an account.");
    mockAuth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    await expect(hub.signInWithEmail('me@boa.network', 'longenough')).rejects.toMatchObject({ code: 'email_not_confirmed' });
  });

  test('the confirmation link signs you in, in each form Supabase sends', async () => {
    mockAuth.exchangeCodeForSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    mockAuth.verifyOtp.mockResolvedValue({ data: { session: SESSION }, error: null });
    mockAuth.setSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    await expect(hub.completeAuthLink('network.boa://auth-callback?code=abc')).resolves.toBe(SESSION);
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    await expect(hub.completeAuthLink('network.boa://auth-callback?token_hash=th&type=signup')).resolves.toBe(SESSION);
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'signup' });
    await expect(hub.completeAuthLink('network.boa://auth-callback#access_token=at&refresh_token=rt&type=signup')).resolves.toBe(SESSION);
    expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
  });

  test('an expired link says so; a link from another phone says the email is confirmed', async () => {
    await expect(hub.completeAuthLink('network.boa://auth-callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).rejects.toThrow(
      'Email link is invalid or has expired',
    );
    mockAuth.exchangeCodeForSession.mockResolvedValue({ data: null, error: { message: 'code verifier not found' } });
    await expect(hub.completeAuthLink('network.boa://auth-callback?code=abc')).rejects.toMatchObject({ code: 'confirmed_sign_in' });
  });
});

describe('the sign-in screen', () => {
  async function show() {
    const { HubGate } = require('../src/screens/hub/HubWelcomeScreen');
    await render(<HubGate stage="signedOut" />);
  }
  const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });

  test('email and password only: no Google button', async () => {
    await show();
    expect(screen.queryByText(/Google/)).toBeNull();
    expect(screen.getByTestId('hub-email')).toBeOnTheScreen();
    expect(screen.getByTestId('hub-password')).toBeOnTheScreen();
  });

  test('creating an account shows "Check your inbox", with a resend', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: 'u', identities: [{ id: 'i' }] }, session: null }, error: null });
    const u = user();
    await show();
    await u.press(screen.getByTestId('hub-mode-signUp'));
    await u.type(screen.getByTestId('hub-email'), 'new@boa.network');
    await u.type(screen.getByTestId('hub-password'), 'longenough');
    await u.type(screen.getByTestId('hub-password-confirm'), 'longenough');
    await u.press(screen.getAllByText('Create account')[1]);
    await act(async () => {});
    expect(screen.getByTestId('hub-check-inbox')).toBeOnTheScreen();
    expect(screen.getByText(/new@boa\.network/)).toBeOnTheScreen();
    await u.press(screen.getByText('Resend the email'));
    await act(async () => {});
    expect(mockAuth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'new@boa.network', options: { emailRedirectTo: 'network.boa://auth-callback' } });
  });

  test('an existing email: told plainly, and one tap to sign in instead', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: 'u', identities: [] }, session: null }, error: null });
    const u = user();
    await show();
    await u.press(screen.getByTestId('hub-mode-signUp'));
    await u.type(screen.getByTestId('hub-email'), 'taken@boa.network');
    await u.type(screen.getByTestId('hub-password'), 'longenough');
    await u.type(screen.getByTestId('hub-password-confirm'), 'longenough');
    await u.press(screen.getAllByText('Create account')[1]);
    await act(async () => {});
    expect(screen.getByTestId('hub-auth-error')).toHaveTextContent(hub.EXISTING_EMAIL);
    await u.press(screen.getByText('Sign in with taken@boa.network'));
    expect(screen.queryByTestId('hub-password-confirm')).toBeNull();
  });

  test('passwords must match before an account can be made', async () => {
    const u = user();
    await show();
    await u.press(screen.getByTestId('hub-mode-signUp'));
    await u.type(screen.getByTestId('hub-email'), 'new@boa.network');
    await u.type(screen.getByTestId('hub-password'), 'longenough');
    await u.type(screen.getByTestId('hub-password-confirm'), 'different1');
    expect(screen.getByText("Those passwords don't match.")).toBeOnTheScreen();
    await u.press(screen.getAllByText('Create account')[1]);
    expect(mockAuth.signUp).not.toHaveBeenCalled();
  });

  test('signing in before confirming offers to resend the link', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    const u = user();
    await show();
    await u.type(screen.getByTestId('hub-email'), 'me@boa.network');
    await u.type(screen.getByTestId('hub-password'), 'longenough');
    await u.press(screen.getAllByText('Sign in')[1]);
    await act(async () => {});
    expect(screen.getByTestId('hub-auth-error')).toHaveTextContent(/Confirm your email first/);
    await u.press(screen.getByTestId('hub-resend'));
    await act(async () => {});
    expect(mockAuth.resend).toHaveBeenCalled();
  });
});
