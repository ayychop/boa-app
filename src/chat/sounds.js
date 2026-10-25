// New-message sounds for BOA HUB Chat, bundled as WAV in assets/sounds so
// they ring with the app closed (the expo-notifications plugin in app.json
// copies them into the native build). Android fixes a notification's sound
// per channel, so each sound has its own channel: boa-chat-<id>. The
// database sends pushes on the recipient's channel (push_tokens.sound).
//
// The air horn, record scratch, bass drop, pager ping and messenger chirp
// are BOA's own, synthesized for the app (no samples). The cash register is
// a public domain recording from Wikimedia Commons, trimmed and levelled.
export const CHAT_SOUNDS = [
  {
    id: 'airhorn',
    label: 'Air horn',
    detail: 'Bap bap baaap. Pull up!',
    icon: 'megaphone-outline',
    file: 'chat_airhorn.wav',
    asset: require('../../assets/sounds/chat_airhorn.wav'),
    author: 'BOA',
    license: 'Original',
  },
  {
    id: 'scratch',
    label: 'Record scratch',
    detail: 'The DJ cuts in',
    icon: 'disc-outline',
    file: 'chat_scratch.wav',
    asset: require('../../assets/sounds/chat_scratch.wav'),
    author: 'BOA',
    license: 'Original',
  },
  {
    id: 'cashregister',
    label: 'Cha-ching',
    detail: 'Money talks',
    icon: 'cash-outline',
    file: 'chat_cashregister.wav',
    asset: require('../../assets/sounds/chat_cashregister.wav'),
    title: 'Cash register',
    author: 'Wikimedia Commons contributor',
    license: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:Cash_register.ogg',
  },
  {
    id: 'bassdrop',
    label: 'Bass drop',
    detail: 'A whoosh, then the boom',
    icon: 'pulse-outline',
    file: 'chat_bassdrop.wav',
    asset: require('../../assets/sounds/chat_bassdrop.wav'),
    author: 'BOA',
    license: 'Original',
  },
  {
    id: 'pager',
    label: 'Pager ping',
    detail: 'Two bright pings, old-phone style',
    icon: 'phone-portrait-outline',
    file: 'chat_pager.wav',
    asset: require('../../assets/sounds/chat_pager.wav'),
    author: 'BOA',
    license: 'Original',
  },
  {
    id: 'messenger',
    label: 'Messenger',
    detail: 'A rising desktop-chat chirp',
    icon: 'chatbubbles-outline',
    file: 'chat_messenger.wav',
    asset: require('../../assets/sounds/chat_messenger.wav'),
    author: 'BOA',
    license: 'Original',
  },
];

export const DEFAULT_CHAT_SOUND = 'pager';

// Sounds earlier builds had: their channels are removed from the phone.
export const RETIRED_CHAT_SOUNDS = ['beep', 'rimshot', 'laugh', 'trombone', 'boing'];

/** A sound by id; an unknown (or retired) one is the default. */
export const chatSoundById = (id) => CHAT_SOUNDS.find((s) => s.id === id) ?? CHAT_SOUNDS.find((s) => s.id === DEFAULT_CHAT_SOUND);

/** The Android notification channel for a sound. */
export const chatChannel = (id) => `boa-chat-${chatSoundById(id).id}`;
