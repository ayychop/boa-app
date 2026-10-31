import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { guarded } from '../utils/safely';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createAudioPlayer } from 'expo-audio';
import { isConfigured, supabase } from '../lib/supabase';
import { ownChannel } from '../lib/realtime';
import * as hub from '../api/hub';
import { claimDayOne, forgetDayOnes } from '../api/dayOne';
import * as hearts from '../api/hearts';
import { useUser } from './UserContext';
import * as chat from '../chat/notifications';
import { chatSoundById, DEFAULT_CHAT_SOUND } from '../chat/sounds';
import { cleanTheme } from '../chat/bubbleTheme';
import { DEFAULT_RINGTONE, adoptChosenRingtone, ringtoneById } from '../calls/ringtone';
import { openPage } from '../navigation/ref';
import { usePlayer } from './PlayerContext';
import { useMedia } from './MediaContext';
import * as ambient from '../audio/ambient';
import { soundscapeById, categoryById } from '../data/sleep';

const SHARE_KEY = 'boa.hub.shareStatus';
const CHAT_THEME_KEY = 'boa:chat-theme:v1:';
const RINGTONE_KEY = 'boa:ringtone:v1:';
// Status writes wait a moment, so flicking between stations is one update.
const STATUS_DEBOUNCE_MS = 1500;
// While something plays the status is re-stamped this often, so a phone
// that dies mid-song doesn't leave "Listening to" up for good (statusLine
// hides one older than STATUS_STALE_MS).
const STATUS_HEARTBEAT_MS = 15 * 60 * 1000;

/** "Rain · On the window" for a Zen soundscape (just its name if that already says it). */
export function zenStatusText(soundscapeId) {
  const s = soundscapeById(soundscapeId);
  if (!s) return null;
  const cat = categoryById(s.category)?.label;
  if (!cat || s.label.toLowerCase().includes(cat.toLowerCase())) return s.label;
  return `${cat} · ${s.label}`;
}
const PRESENCE_CHANNEL = 'hub:presence';
// A new message's notification waits at most this long for a stranger's name.
const NAME_WAIT_MS = 350;

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
    const sub = AppState.addEventListener(
      'change',
      guarded('hub app state', (s) => {
        if (s === 'active' && profile?.visible_on_hub !== false) join();
        else if (s === 'background') {
          hub.updateProfile(userId, { last_seen_at: new Date().toISOString() }).catch(() => {});
          leave();
        }
      }),
    );
    return () => {
      sub.remove();
      leave();
    };
  }, [stage, userId, profile?.visible_on_hub]);

  // Now playing: "Listening to <station>" while the radio plays, "In the
  // Zen Zone: <sound>" while a Zen soundscape plays, "Watching <Original>"
  // in the screening room; cleared when nothing plays (or sharing is off).
  const player = usePlayer();
  const { watching, watchingId } = useMedia();
  const [zen, setZen] = useState(ambient.getState);
  useEffect(() => ambient.subscribe(setZen), []);
  const radio = player.current?.kind === 'radio' && player.isPlaying ? player.current : null;
  const zenText = zen.id && zen.status === 'playing' ? zenStatusText(zen.id) : null;
  const status = !shareStatus
    ? null
    : watching
      ? { status_kind: 'watching', status_text: watching.slice(0, 120) }
      : radio
        ? { status_kind: 'listening', status_text: (radio.name || 'BOA Radio').slice(0, 120) }
        : zenText
          ? { status_kind: 'zen', status_text: zenText.slice(0, 120) }
          : null;
  const statusKey = status ? `${status.status_kind}|${status.status_text}` : '';
  const sentKey = useRef(null);
  const sendStatus = useCallback(
    async (next) => {
      const stamp = new Date().toISOString();
      const patch = next ? { ...next, status_updated_at: stamp } : { status_kind: null, status_text: null, status_updated_at: stamp };
      try {
        setProfile(await hub.updateProfile(userId, patch));
      } catch (err) {
        // A database without the 'zen' kind yet: say it as listening.
        if (next?.status_kind === 'zen') {
          const fallback = { status_kind: 'listening', status_text: `the Zen Zone: ${next.status_text}`.slice(0, 120), status_updated_at: stamp };
          hub.updateProfile(userId, fallback).then(setProfile).catch(() => {});
        }
      }
    },
    [userId],
  );
  useEffect(() => {
    if (stage !== 'ready' || !userId || sentKey.current === statusKey) return undefined;
    const id = setTimeout(() => {
      sentKey.current = statusKey;
      sendStatus(status);
    }, STATUS_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, stage, userId]);
  useEffect(() => {
    if (stage !== 'ready' || !userId || !status) return undefined;
    const id = setInterval(() => sendStatus(status), STATUS_HEARTBEAT_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, stage, userId]);

  // Day One: the first time you play a station or watch an Original, the
  // database gives you your place in the queue (the first 1,000 earn the
  // badge). Asked once per thing per session; the database keeps the rest.
  const claimed = useRef(new Set());
  const [dayOneNews, setDayOneNews] = useState(null);
  const firstPlay = watchingId ? ['original', watchingId, watching] : radio?.id ? ['station', radio.id, radio.name] : null;
  const firstPlayKey = firstPlay ? `${firstPlay[0]}:${firstPlay[1]}` : '';
  useEffect(() => {
    if (stage !== 'ready' || !userId || !firstPlay || claimed.current.has(firstPlayKey)) return;
    claimed.current.add(firstPlayKey);
    claimDayOne(firstPlay[0], firstPlay[1], firstPlay[2])
      .then((res) => {
        if (res?.new && res.day_one) {
          forgetDayOnes(userId);
          setDayOneNews({ kind: firstPlay[0], label: firstPlay[2], rank: res.rank });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPlayKey, stage, userId]);
  const clearDayOneNews = useCallback(() => setDayOneNews(null), []);

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
    async (otherId, details) => {
      await hub.blockUser(userId, otherId, details);
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
    chat.getChatSound().then((id) => {
      chatSoundRef.current = id;
      setChatSoundState(id);
    });
    // Tapping a message notification opens its thread.
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r?.notification?.request?.content?.data ?? {};
      if (data.type === 'chat' && data.conversationId) openPage('HubThread', { id: data.conversationId });
      // A heart: their profile, to look them over (they're never told).
      if (data.type === 'heart' && data.likerId) openPage('HubProfile', { id: data.likerId });
      // A missed call: the caller's profile, to call them back.
      if (data.type === 'missed-call' && data.peerId) openPage('HubProfile', { id: data.peerId });
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
  // messages from its own conversations). It rings at once: names come
  // from the people you already talk to, fetched ahead; a stranger's name
  // gets a moment to load, never longer.
  useEffect(() => {
    if (!supabase || stage !== 'ready' || !userId) return undefined;
    const names = new Map();
    const label = (p) => p?.display_name || (p?.username ? `@${p.username}` : null);
    hub
      .listConversations(userId)
      .then((rows) => rows.forEach((c) => c.other && names.set(c.otherId, label(c.other))))
      .catch(() => {});
    const nameOf = async (id) => {
      if (names.get(id)) return names.get(id);
      const lookup = hub.getProfile(id).then((p) => {
        if (label(p)) names.set(id, label(p));
        return label(p);
      });
      const quick = new Promise((r) => setTimeout(() => r(null), NAME_WAIT_MS));
      return (await Promise.race([lookup, quick]).catch(() => null)) || 'New message';
    };
    const channel = ownChannel(`hub:inbox:${userId}`)
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

  // Hearts on your posts: a notification while the app is open, unless
  // push already covers it (the database sends those). Opening your hearts
  // is noted on this phone only, never in the database.
  const [heartsUnseen, setHeartsUnseen] = useState(0);
  useEffect(() => {
    if (!supabase || stage !== 'ready' || !userId) return undefined;
    let alive = true;
    Promise.all([hearts.listHeartsOnMine(userId, 60), hearts.heartsSeenAt()])
      .then(([rows, seen]) => alive && setHeartsUnseen(rows.filter((h) => h.liker_id !== userId && (!seen || h.created_at > seen)).length))
      .catch(() => {});
    const channel = ownChannel(`hub:hearts:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hearts', filter: `owner_id=eq.${userId}` }, async ({ new: h }) => {
        if (!h || h.liker_id === userId) return;
        setHeartsUnseen((n) => n + 1);
        if (pushToken.current) return;
        const p = await hub.getProfile(h.liker_id).catch(() => null);
        chat.notifyHeart({ name: p?.display_name || (p?.username ? `@${p.username}` : 'Someone'), likerId: h.liker_id, sound: chatSoundRef.current });
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [stage, userId]);
  const seeHearts = useCallback(() => {
    setHeartsUnseen(0);
    hearts.markHeartsSeen();
  }, []);

  // Saved stations are your favourites on the Hub: saving or unsaving one
  // on the radio hearts or unhearts it on your profile.
  const { saved = [] } = useUser();
  const savedKey = saved.map((s) => s.id).join(',');
  const syncedStations = useRef(null);
  useEffect(() => {
    if (!supabase || stage !== 'ready' || !userId) return;
    const now = new Map(saved.map((s) => [s.id, s]));
    const before = syncedStations.current;
    syncedStations.current = new Set(now.keys());
    const sync = async () => {
      // The first time this session: whatever the database has that isn't saved here goes.
      let had = before;
      if (!had) {
        const favs = await hearts.listFavourites(userId, 200);
        had = new Set(favs.filter((f) => f.target_kind === 'station').map((f) => f.target_id));
      }
      for (const [id, s] of now) if (!had.has(id)) await hearts.heart(userId, 'station', id, { label: s.name, meta: hearts.stationMeta(s) }).catch(() => {});
      for (const id of had) if (!now.has(id)) await hearts.unheart(userId, 'station', id).catch(() => {});
    };
    sync().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, stage, userId]);

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

  // Chat Appearance: your bubbles' colour and glass, kept on your profile so
  // every phone you sign in on shows it. This phone remembers it too, so the
  // thread opens in your colour before the database answers.
  const [chatTheme, setChatThemeState] = useState(null);
  useEffect(() => {
    if (!supabase || stage !== 'ready' || !userId) return undefined;
    let alive = true;
    const key = CHAT_THEME_KEY + userId;
    AsyncStorage.getItem(key)
      .then((raw) => alive && raw && setChatThemeState((t) => t ?? cleanTheme(JSON.parse(raw))))
      .catch(() => {});
    hub
      .getChatTheme(userId)
      .then((theme) => {
        if (!alive || theme === undefined) return;
        const clean = cleanTheme(theme);
        setChatThemeState(clean);
        AsyncStorage.setItem(key, JSON.stringify(clean)).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [stage, userId]);
  const setChatTheme = useCallback(
    async (theme) => {
      const clean = cleanTheme(theme);
      await hub.setChatTheme(userId, clean);
      setChatThemeState(clean);
      AsyncStorage.setItem(CHAT_THEME_KEY + userId, JSON.stringify(clean)).catch(() => {});
    },
    [userId],
  );

  // Call ringtone: on your profile like Chat Appearance, and remembered on
  // this phone so an incoming call rings the right one even offline.
  const [ringtone, setRingtoneState] = useState(DEFAULT_RINGTONE);
  useEffect(() => {
    if (!supabase || stage !== 'ready' || !userId) return undefined;
    let alive = true;
    const key = RINGTONE_KEY + userId;
    AsyncStorage.getItem(key)
      .then((id) => {
        if (!alive || !id) return;
        setRingtoneState(ringtoneById(id).id);
        adoptChosenRingtone(ringtoneById(id).id);
      })
      .catch(() => {});
    hub
      .getRingtone(userId)
      .then((id) => {
        if (!alive || id === undefined) return;
        setRingtoneState(ringtoneById(id).id);
        AsyncStorage.setItem(key, ringtoneById(id).id).catch(() => {});
        // Chosen before the phone's own ringtone was the default: it keeps ringing.
        adoptChosenRingtone(ringtoneById(id).id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [stage, userId]);
  const setRingtone = useCallback(
    async (id) => {
      const next = ringtoneById(id).id;
      const before = ringtone;
      setRingtoneState(next);
      try {
        await hub.setRingtone(userId, next);
        AsyncStorage.setItem(RINGTONE_KEY + userId, next).catch(() => {});
      } catch (err) {
        setRingtoneState(before);
        throw err;
      }
    },
    [userId, ringtone],
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
      chatTheme,
      setChatTheme,
      ringtone,
      setRingtone,
      setDisappearing,
      dayOneNews,
      clearDayOneNews,
      heartsUnseen,
      seeHearts,
    }),
    [heartsUnseen, seeHearts, dayOneNews, clearDayOneNews, chatSound, setChatSound, disappearing, setDisappearing, chatTheme, setChatTheme, ringtone, setRingtone, isAdmin, stage, session, userId, profile, online, blocked, shareStatus, setShareStatus, loadProfile, saveProfile, finishOnboarding, block, unblock, signOut, deleteAccount],
  );
  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

export function useHub() {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error('useHub must be used inside <HubProvider>');
  return ctx;
}
