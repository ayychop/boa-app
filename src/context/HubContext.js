import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isConfigured, supabase } from '../lib/supabase';
import * as hub from '../api/hub';
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

  const value = useMemo(
    () => ({
      configured: isConfigured,
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
    }),
    [stage, session, userId, profile, online, blocked, shareStatus, setShareStatus, loadProfile, saveProfile, finishOnboarding, block, unblock, signOut, deleteAccount],
  );
  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

export function useHub() {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error('useHub must be used inside <HubProvider>');
  return ctx;
}
