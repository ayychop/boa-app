// New-message sounds for BOA HUB Chat, bundled as WAV in assets/sounds so
// they ring with the app closed (the expo-notifications plugin in app.json
// copies them into the native build). Android fixes a notification's sound
// per channel, so each sound has its own channel: boa-chat-<id>. The
// database sends pushes on the recipient's channel (push_tokens.sound).
//
// Pager and Messenger are BOA's own, synthesized for the app (a nod to
// the old phone ping and desktop messenger chirp, not copies of them). The
// rest are openly licensed recordings from Wikimedia Commons, trimmed and
// levelled.
export const CHAT_SOUNDS = [
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
  {
    id: 'beep',
    label: 'Happy beep',
    detail: 'Short and sweet',
    icon: 'radio-button-on-outline',
    file: 'chat_beep.wav',
    asset: require('../../assets/sounds/chat_beep.wav'),
    title: 'Simple Happy Beep',
    author: 'waveplaySFX',
    license: 'CC0',
    source: 'https://commons.wikimedia.org/wiki/File:Simple_Happy_Beep.ogg',
  },
  {
    id: 'rimshot',
    label: 'Ba-dum-tss',
    detail: 'The punchline drum',
    icon: 'happy-outline',
    file: 'chat_rimshot.wav',
    asset: require('../../assets/sounds/chat_rimshot.wav'),
    title: 'Assorted rimshots: Kdum-keesh',
    author: 'Kevin MacLeod',
    license: 'CC BY 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_assorted_rimshots_-_Kdum-keesh.wav',
  },
  {
    id: 'laugh',
    label: 'Cartoon laugh',
    detail: 'Someone finds you hilarious',
    icon: 'happy-outline',
    file: 'chat_laugh.wav',
    asset: require('../../assets/sounds/chat_laugh.wav'),
    title: 'Cartoon Laugh',
    author: 'JohnsonBrandEditing',
    license: 'CC0',
    source: 'https://commons.wikimedia.org/wiki/File:Cartoon_Laugh.ogg',
  },
  {
    id: 'trombone',
    label: 'Sad trombone',
    detail: 'Wah wah wahhh',
    icon: 'sad-outline',
    file: 'chat_trombone.wav',
    asset: require('../../assets/sounds/chat_trombone.wav'),
    title: 'Sad Trombone',
    author: 'Joe Lamb',
    license: 'CC BY 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Sad_Trombone-Joe_Lamb-665429450.ogg',
  },
  {
    id: 'boing',
    label: 'Boing',
    detail: 'A springy cartoon bounce',
    icon: 'arrow-up-circle-outline',
    file: 'chat_boing.wav',
    asset: require('../../assets/sounds/chat_boing.wav'),
    title: 'Boing raw',
    author: 'cfork',
    license: 'CC BY 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Boing_raw.ogg',
  },
];

export const DEFAULT_CHAT_SOUND = 'pager';

export const chatSoundById = (id) => CHAT_SOUNDS.find((s) => s.id === id) ?? CHAT_SOUNDS[0];

/** The Android notification channel for a sound. */
export const chatChannel = (id) => `boa-chat-${chatSoundById(id).id}`;
