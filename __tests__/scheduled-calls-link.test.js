// The deep link, through the app's own router (App.js routeLink).
jest.mock('../src/calls/openRoom', () => ({ openScheduledCall: jest.fn(() => true) }));

const { openScheduledCall } = require('../src/calls/openRoom');
const { routeLink } = require('../App');

const ROOM = '3f0c9a52-7d1e-4b8a-9c36-0e5d2b7a41f8';

beforeEach(() => jest.clearAllMocks());

test('boahub://call/<room> opens that room', () => {
  expect(routeLink(`boahub://call/${ROOM}`)).toBe(true);
  expect(openScheduledCall).toHaveBeenCalledWith(ROOM);
});

test('network.boa://call/<room> does too', () => {
  expect(routeLink(`network.boa://call/${ROOM}`)).toBe(true);
  expect(openScheduledCall).toHaveBeenCalledWith(ROOM);
});

test('a ring link (with from=) is not a room: the call model handles it', () => {
  expect(routeLink(`network.boa://call/${ROOM}?from=someone`)).toBe(false);
  expect(openScheduledCall).not.toHaveBeenCalled();
});

test('a malformed room link opens nothing', () => {
  expect(routeLink('boahub://call/nope')).toBe(false);
  expect(routeLink('boahub://call/')).toBe(false);
  expect(openScheduledCall).not.toHaveBeenCalled();
});
