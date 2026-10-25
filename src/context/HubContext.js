import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createAudioPlayer } from 'expo-audio';
import { isConfigured, supabase } from '../lib/supabase';
import * as hub from '../api/hub';
import * as chat from '../chat/notifications';
import { chatSoundById, DEFAULT_CHAT_SOUND } from '../chat/sounds';
import { openPage } from '../navigation/ref';
import { usePlayer } from './PlayerContext';
import { useMedia } from './MediaContext';
import useNowPlaying from '../hooks/useNowPlaying';

const SHARE_KEY = 'boa.hub.shareStatus';
// Status writes are batched: a station changing song every few minutes is
// one small update, not a stream of them.
const STATUS_DEBOUNCE_MS = 4000;
const PRESENCE_CHANNEL = 'hub:presence';

const HubContext = createContext(null);

/**
 * The Creative Hub's session: who's signed in to BOA HUB, their profile,
 * who's online right now (Supabase Presence), the people they've blocked,
 * and their "Currently listening / watching" status, kept in step with
 * the radio and the screening room when they choose to share it.
 *
 * stage: 'off' (no project configured), 'loading', 'signedOut',
 * 'needsProfile' (signed in, onboarding not done) or 'ready'.
 */
export function HubProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stage, setStage] = useState(isConfigured ? 'loading' : 'off');
  const [online, setOnline] = useState(() => new Set());
  const [blocked, setBlocked] = useState(() => new Set());
  const [shareStatus, setShareStatusState] = useState(true);
  const userId = session?.user?.id ?? null;
  // This phone's Expo push token, once registered for message pushes.
  const pushToken = useRef(null);

  // Session: restored from the phone, then kept current.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ?? null));
    AsyncStorage.getItem(SHARE_KEY)
      .then((v) => alive && v != null && setShareStatusState(v === '1'))
      .catch(() => {});
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    if (!supabase) return null;
    if (!userId) {
      setProfile(null);
      setStage('signedOut');
      return null;
    }
    try {
      const p = await hub.getProfile(userId);
      setProfile(p);
      setStage(p ? 'ready' : 'needsProfile');
      if (p) hub.listBlocked(userId).then((ids) => setBlocked(new Set(ids))).catch(() => {});
      return p;
    } catch (err) {
      console.warn('[hub] profile load failed', err.message);
      setStage('needsProfile');
      return null;
    }
  }, [userId]);

  useEffect(() => {
    if (supabase) loadProfile();
  }, [loadProfile]);

  // Presence: everyone signed in to the Hub joins one channel; whoever is
  // in it is online. Leaving the app leaves the channel.
  useEffect(() => {
    if (!supabase || stage !== 'ready' || !userId) return;
    let channel = null;
    const join = () => {
      if (channel) return;
      channel = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: userId } } });
      channel
        .on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') channel.track({ at: Date.now() });
        });
    };
    const leave = () => {
      if (!channel) return;
      supabase.removeChannel(channel);
      channel = null;
      setOnline(new Set());
    };
    if (profile?.visible_on_hub !== false) join();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && profile?.visible_on_hub !== false) join();
      else if (s === 'background') {
        hub.updateProfile(userId, { last_seen_at: new Date().toISOString() }).catch(() => {});
        leave();
      }
    });
    return () => {
      sub.remove();
      leave();
    };
  }, [stage, userId, profile?.visible_on_hub]);

  // Currently listening / watching.
  const player = usePlayer();
  const { watching } = useMedia();
  const radio = player.current?.kind === 'radio' && player.isPlaying ? player.current : null;
  const track = useNowPlaying(radio, !!radio && stage === 'ready' && shareStatus);
  const status = !shareStatus
    ? null
    : watching
      ? { status_kind: 'watching', status_text: watching }
      : radio
        ? { status_kind: 'listening', status_text: [track || null, radio.name].filter(Boolean).join(' on ').slice(0, 120) }
        : null;
  const statusKey = status ? `${status.status_kind}|${status.status_text}` : '';
  const sentKey = useRef(null);
  useEffect(() => {
    if (stage !== 'ready' || !userId || sentKey.current === statusKey) return;
    const id = setTimeout(() => {
      sentKey.current = statusKey;
      const patch = status
        ? { ...status, status_updated_at: new Date().toISOString() }
        : { status_kind: null, status_text: null, status_updated_at: new Date().toISOString() };
      hub.updateProfile(userId, patch).then(setProfile).catch(() => {});
    }, STATUS_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, stage, userId]);

  const setShareStatus = useCallback((on) => {
    setShareStatusState(on);
    AsyncStorage.setItem(SHARE_KEY, on ? '1' : '0').catch(() => {});
  }, []);

  const saveProfile = useCallback(
    async (patch) => {
      const next = await hub.updateProfile(userId, patch);
      setProfile(next);
      return next;
    },
    [userId],
  );

  const finishOnboarding = useCallback(
    async (fields, consent) => {
      const created = await hub.createProfile(userId, fields, consent);
      setProfile(created);
      setStage('ready');
      return created;
    },
    [userId],
  );

  const block = useCallback(
    async (otherId) => {
      await hub.blockUser(userId, otherId);
      setBlocked((b) => new Set([...b, otherId]));
    },
    [userId],
  );
  const unblock = useCallback(
    async (otherId) => {
      await hub.unblockUser(userId, otherId);
      setBlocked((b) => {
        const n = new Set(b);
        n.delete(otherId);
        return n;
      });
    },
    [userId],
  );

  const signOut = useCallback(async () => {
    // This phone stops getting the account's message pushes.
    if (pushToken.current) await hub.removePushToken(pushToken.current).catch(() => {});
    pushToken.current = null;
    await hub.signOut();
    setProfile(null);
    setStage('signedOut');
  }, []);

  const deleteAccount = useCallback(async () => {
    await hub.deleteMyAccount(userId);
    setProfile(null);
    setSession(null);
    setStage('signedOut');
  }, [userId]);

  // ------------------------------------------------ chat notifications
  // New messages buzz the phone: a push when the app is closed (this phone's
  // token, with its sound, is registered with the database), and a local
  // notification while it's open or in the background if push isn't set up.
  const [chatSound, setChatSoundState] = useState(DEFAULT_CHAT_SOUND);
  const chatSoundRef = useRef(DEFAULT_CHAT_SOUND);

  useEffect(() => {
    chat.installChatHandler();
    chat.getChatSound().then((id) => {
      chatSoundRef.current = id;
      setChatSoundState(id);
    });
    // Tapping a message notification opens its thread.
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r?.notification?.request?.content?.data ?? {};
      if (data.type === 'chat' && data.conversationId) openPage('HubThread', { id: data.conversationId });
    });
    return () => tapped.remove();
  }, []);

  useEffect(() => {
    if (!supabase || stage !== 'ready' || !userId) return undefined;
    let alive = true;
    (async () => {
      await chat.ensureChatChannels();
      if (!(await chat.ensurePermission()) || !alive) return;
      const token = await chat.getPushToken();
      if (!token || !alive) return;
      try {
        await hub.savePushToken(token, Platform.OS, chatSoundRef.current);
        pushToken.current = token;
      } catch (err) {
        console.warn('[chat] push registration failed', err.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [stage, userId]);

  // Without push, the app rings for messages itself (RLS only sends it
  // messages from its own conversations).
  useEffect(() => {
    if (!supabase || stage !== 'ready' || !userId) return undefined;
    const names = new Map();
    const nameOf = async (id) => {
      if (!names.has(id)) {
        const p = await hub.getProfile(id).catch(() => null);
        names.set(id, p?.display_name || (p?.username ? `@${p.username}` : 'New message'));
      }
      return names.get(id);
    };
    const channel = supabase
      .channel(`hub:inbox:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async ({ new: m }) => {
        if (!m || m.sender_id === userId || pushToken.current || hub.isExpired(m)) return;
        chat.notifyLocal({
          title: await nameOf(m.sender_id),
          body: chat.previewOf(m),
          conversationId: m.conversation_id,
          messageId: m.id,
          sound: chatSoundRef.current,
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [stage, userId]);

  const preview = useRef(null);
  /** Picks the new-message sound: plays it, saves it, and tells the database for pushes. */
  const setChatSound = useCallback((id) => {
    const sound = chatSoundById(id);
    chatSoundRef.current = sound.id;
    setChatSoundState(sound.id);
    chat.saveChatSound(sound.id);
    try {
      if (!preview.current) preview.current = createAudioPlayer(sound.asset);
      else preview.current.replace(sound.asset);
      preview.current.seekTo?.(0);
      preview.current.play();
    } catch {}
    if (pushToken.current) hub.savePushToken(pushToken.current, Platform.OS, sound.id).catch(() => {});
  }, []);

  // Disappearing messages: your setting, kept in the database (it stamps
  // everything you send).
  const [disappearing, setDisappearingState] = useState(false);
  useEffect(() => {
    if (!supabase || stage !== 'ready' || !userId) return undefined;
    let alive = true;
    hub.getDisappearing(userId).then((on) => alive && setDisappearingState(on)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [stage, userId]);
  const setDisappearing = useCallback(
    async (on) => {
      setDisappearingState(on);
      try {
        await hub.setDisappearing(userId, on);
      } catch (err) {
        setDisappearingState(!on);
        throw err;
      }
    },
    [userId],
  );

  // Admin: asked of the database whenever who's signed in changes.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!supabase || !userId) {
      setIsAdmin(false);
      return undefined;
    }
    hub.amIAdmin().then((yes) => alive && setIsAdmin(yes));
    return () => {
      alive = false;
    };
  }, [userId]);

  const value = useMemo(
    () => ({
      configured: isConfigured,
      isAdmin,
      stage,
      session,
      userId,
      profile,
      online,
      isOnline: (id) => online.has(id),
      blocked,
      shareStatus,
      setShareStatus,
      reload: loadProfile,
      saveProfile,
      finishOnboarding,
      block,
      unblock,
      signOut,
      deleteAccount,
      chatSound,
      setChatSound,
      disappearing,
      setDisappearing,
    }),
    [chatSound, setChatSound, disappearing, setDisappearing, isAdmin, stage, session, userId, profile, online, blocked, shareStatus, setShareStatus, loadProfile, saveProfile, finishOnboarding, block, unblock, signOut, deleteAccount],
  );
  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

export function useHub() {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error('useHub must be used inside <HubProvider>');
  return ctx;
}
