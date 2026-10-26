import { act, render, screen, userEvent } from '@testing-library/react-native';

jest.useFakeTimers();

const mockPlay = jest.fn();
const mockOpenEpisode = jest.fn();
const mockToggleSaved = jest.fn();
let mockSaved = new Set();
jest.mock('../src/context/PlayerContext', () => ({ usePlayer: () => ({ play: mockPlay }) }));
jest.mock('../src/context/MediaContext', () => ({ useMedia: () => ({ openEpisode: mockOpenEpisode }) }));
jest.mock('../src/context/UserContext', () => ({ useUser: () => ({ isSaved: (id) => mockSaved.has(id), toggleSaved: mockToggleSaved }) }));

const STATION = { kind: 'radio', id: 'stn-1', name: 'Capital Xtra', streamUrl: 'https://s/x.mp3', logo: null };
jest.mock('../src/api/hearts', () => ({
  ...jest.requireActual('../src/api/hearts'),
  listFavourites: jest.fn(async () => [
    { target_kind: 'station', target_id: 'stn-1', target_label: 'Capital Xtra', target_meta: { kind: 'radio', id: 'stn-1', name: 'Capital Xtra', streamUrl: 'https://s/x.mp3', logo: null } },
    { target_kind: 'original', target_id: 'mind-states-uk', target_label: 'Mind States UK', target_meta: {} },
  ]),
  myHearts: jest.fn(async () => new Set()),
  heart: jest.fn(async () => {}),
  unheart: jest.fn(async () => {}),
}));

const Favourites = require('../src/components/profile/Favourites').default;
const hearts = require('../src/api/hearts');

test("someone's favourites play, and hearting one makes it yours too", async () => {
  await render(<Favourites userId="user-kofi" myId="user-me" />);
  await act(async () => {});
  expect(screen.getByText('Capital Xtra')).toBeOnTheScreen();
  expect(screen.getByText('Mind States UK')).toBeOnTheScreen();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await user.press(screen.getByRole('button', { name: 'Play Capital Xtra' }));
  expect(mockPlay).toHaveBeenCalledWith(expect.objectContaining(STATION));
  await user.press(screen.getByTestId('fav-heart-stn-1'));
  expect(mockToggleSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'stn-1' }));
  await user.press(screen.getByTestId('fav-heart-mind-states-uk'));
  expect(hearts.heart).toHaveBeenCalledWith('user-me', 'original', 'mind-states-uk', { label: 'Mind States UK' });
});

test('on your own profile there are no hearts to give yourself', async () => {
  await render(<Favourites userId="user-me" myId="user-me" />);
  await act(async () => {});
  expect(screen.getByText('Capital Xtra')).toBeOnTheScreen();
  expect(screen.queryByTestId('fav-heart-stn-1')).toBeNull();
});
