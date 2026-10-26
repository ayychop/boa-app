import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { CHAT_SOUNDS, DEFAULT_CHAT_SOUND, RETIRED_CHAT_SOUNDS, chatChannel, chatSoundById } from './sounds';

// New-message notifications for BOA HUB Chat.
//
// Push (the app closed): the phone registers its Expo push token with the
// database (push_tokens, with its chosen sound); a trigger on new messages
// sends the push (supabase/migrations). Local (the app open or in the
// background, or when push isn't available): HubContext hears new
// messages over realtime and calls notifyLocal. Either way, nothing rings
// for the thread you're looking at.

const SOUND_KEY = 'boa.chat.sound';
// A short double buzz, like the old pagers.
export const CHAT_VIBRATION = [0, 220, 110, 220];

let openThread = null;
/** The conversation on screen (HubThreadScreen sets it), so it doesn't ring. */
export const setOpenThread = (id) => {
  openThread = id;
};
export const getOpenThread = () => openThread;

export async function getChatSound() {
  try {
    return chatSoundById((await AsyncStorage.getItem(SOUND_KEY)) ?? DEFAULT_CHAT_SOUND).id;
  } catch {
    return DEFAULT_CHAT_SOUND;
  }
}

export async function saveChatSound(id) {
  await AsyncStorage.setItem(SOUND_KEY, chatSoundById(id).id).catch(() => {});
}

/** One Android channel per sound, at high importance so it pops and buzzes. */
export async function ensureChatChannels() {
  if (Platform.OS !== 'android') return;
  await Promise.all(RETIRED_CHAT_SOUNDS.map((id) => Notifications.deleteNotificationChannelAsync?.(`boa-chat-${id}`)?.catch(() => null)));
  await Promise.all(
    CHAT_SOUNDS.map((s) =>
      Notifications.setNotificationChannelAsync(chatChannel(s.id), {
        name: `Messages: ${s.label}`,
        importance: Notifications.AndroidImportance.HIGH,
        sound: s.file,
        vibrationPattern: CHAT_VIBRATION,
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      }).catch(() => null),
    ),
  );
}

/**
 * How notifications show while the app is open: a chat message pops up
 * unless its thread is on screen. Anything else (alarms) stays as before:
 * the app handles it itself.
 */
let handlerInstalled = false;
export function installChatHandler() {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const data = n?.request?.content?.data ?? {};
      const show = (data.type === 'chat' && data.conversationId !== openThread) || data.type === 'heart';
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
}

/** Asks for notification permission if it hasn't been decided; resolves to whether it's granted. */
export async function ensurePermission() {
  try {
    const now = await Notifications.getPermissionsAsync();
    if (now.granted) return true;
    if (now.canAskAgain === false) return false;
    const asked = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return !!asked.granted;
  } catch {
    return false;
  }
}

/** This phone's Expo push token, or null (no permission, no Firebase setup, a simulator). */
export async function getPushToken() {
  try {
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return data ?? null;
  } catch (err) {
    console.warn('[chat] no push token', err?.message ?? err);
    return null;
  }
}

// Installed as soon as this module loads (HubContext imports it at
// startup), so a message that arrives before the Hub has finished signing
// in still pops up and rings straight away.
installChatHandler();

/** Rings for a message now (the app is open or in the background). */
export async function notifyLocal({ title, body, conversationId, messageId, sound }) {
  if (conversationId === openThread) return null;
  const tone = chatSoundById(sound);
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: tone.file,
      vibrate: CHAT_VIBRATION,
      data: { type: 'chat', conversationId, messageId },
    },
    trigger: Platform.OS === 'android' ? { channelId: chatChannel(tone.id) } : null,
  }).catch(() => null);
}

/** "❤️ Kofi loved your photo": tapping it opens their profile. */
export async function notifyHeart({ name, what = 'post', likerId, sound }) {
  const tone = chatSoundById(sound);
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `❤️ ${name}`,
      body: `loved your ${what}`,
      sound: tone.file,
      data: { type: 'heart', likerId },
    },
    trigger: Platform.OS === 'android' ? { channelId: chatChannel(tone.id) } : null,
  }).catch(() => null);
}

/** What a message says in a notification. */
export function previewOf(message) {
  switch (message?.kind) {
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎬 Video';
    case 'voice':
      return '🎙️ Voice note';
    default:
      return (message?.body ?? '').slice(0, 140);
  }
}
