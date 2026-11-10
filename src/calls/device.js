import * as Crypto from 'expo-crypto';

// Which phone this is, for as long as the app runs. Signed in on two phones
// (say a Fold and a Galaxy S), both hear every ring on the same inbox
// (src/calls/signaling.js); a call's answers, its end and the "taken on your
// other phone" notice say which phone they are for or from, so one phone
// never ends a call that the other one is on.
const make = () => Crypto.randomUUID?.() || `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

export const DEVICE_ID = make();
