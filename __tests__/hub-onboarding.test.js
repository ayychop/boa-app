import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as hub from '../src/api/hub';
import { HubGate } from '../src/screens/hub/HubWelcomeScreen';

jest.useFakeTimers();

const mockFinish = jest.fn(async () => ({}));
jest.mock('../src/context/HubContext', () => ({
  useHub: () => ({ userId: 'user-me', session: null, finishOnboarding: mockFinish }),
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  isUsernameFree: jest.fn(async () => true),
  uploadAvatar: jest.fn(),
}));

const flush = () => act(async () => jest.advanceTimersByTimeAsync(600));

async function fillUpTo18Plus(user, { photo } = {}) {
  await render(<HubGate stage="needsProfile" />);
  await user.type(screen.getByTestId('hub-username'), 'ama.directs');
  await flush();
  await user.press(screen.getByText('Next'));
  if (photo) {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [photo] });
    await user.press(screen.getByRole('button', { name: 'Choose a profile photo' }));
    await flush();
  }
  await user.press(screen.getByText(photo ? 'Next' : 'Skip'));
  await user.press(screen.getByText('Director'));
  await user.press(screen.getByText('Next'));
  await user.type(screen.getByTestId('hub-dob-d'), '01');
  await user.type(screen.getByTestId('hub-dob-m'), '02');
  await user.type(screen.getByTestId('hub-dob-y'), '1990');
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('ticking "I am 18 or over" stamps the time, and Join the Hub sends it as adult_confirmed_at', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await fillUpTo18Plus(user);
  // Not ticked yet: Join the Hub does nothing.
  await user.press(screen.getByText('Join the Hub'));
  await flush();
  expect(mockFinish).not.toHaveBeenCalled();
  jest.setSystemTime(new Date('2026-10-24T18:30:00.000Z'));
  await user.press(screen.getByTestId('hub-terms'));
  await user.press(screen.getByText('Join the Hub'));
  await flush();
  expect(mockFinish).toHaveBeenCalledWith(
    expect.objectContaining({ username: 'ama.directs', roles: ['director'] }),
    { adultConfirmedAt: expect.stringMatching(/^2026-10-24T18:30:00\.\d{3}Z$/) },
  );
});

test('a photo that fails to upload never stops the profile being created', async () => {
  hub.uploadAvatar.mockRejectedValue(new Error("Couldn't upload: no connection. Try again in a moment."));
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await fillUpTo18Plus(user, { photo: { uri: 'file:///me.jpg', mimeType: 'image/jpeg', fileSize: 100000 } });
  await user.press(screen.getByTestId('hub-terms'));
  await user.press(screen.getByText('Join the Hub'));
  await flush();
  expect(hub.uploadAvatar).toHaveBeenCalled();
  expect(mockFinish).toHaveBeenCalledWith(expect.objectContaining({ avatar_url: null }), expect.any(Object));
  expect(Alert.alert).toHaveBeenCalledWith('Your photo wasn’t added', expect.stringContaining('no connection'));
});

test('a photo over 5 MB is turned away with a message, before any upload', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await render(<HubGate stage="needsProfile" />);
  await user.type(screen.getByTestId('hub-username'), 'ama.directs');
  await flush();
  await user.press(screen.getByText('Next'));
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///big.jpg', mimeType: 'image/jpeg', fileSize: 9e6 }] });
  await user.press(screen.getByRole('button', { name: 'Choose a profile photo' }));
  await flush();
  expect(screen.getByText('That photo is over 5 MB. Choose a smaller one.')).toBeOnTheScreen();
  // Still skippable: nothing was kept.
  expect(screen.getByText('Skip')).toBeOnTheScreen();
  expect(hub.uploadAvatar).not.toHaveBeenCalled();
});

test('if the photo library will not open, it says so instead of crashing', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await render(<HubGate stage="needsProfile" />);
  await user.type(screen.getByTestId('hub-username'), 'ama.directs');
  await flush();
  await user.press(screen.getByText('Next'));
  ImagePicker.launchImageLibraryAsync.mockRejectedValue(new Error('permission denied'));
  await user.press(screen.getByRole('button', { name: 'Choose a profile photo' }));
  await flush();
  expect(screen.getByText(/Couldn't open your photos/)).toBeOnTheScreen();
});
