import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useHub } from './HubContext';
import { usePremium } from './PremiumContext';
import * as signal from '../calls/signaling';
import * as media from '../calls/media';
import { startRingtone, stopRingtone } from '../calls/ringtone';
import { DEFAULT_BEAUTY } from '../calls/beauty';
import CallScreen from '../components/calls/CallScreen';
import { haptics } from '../utils/haptics';

const CallContext = createContext(null);

// How long a call rings before it's a missed call.
export const RING_MS = 45000;
// How long "Call ended" stays up before the screen closes.
const ENDED_MS = 1600;
const BEAUTY_KEY = 'boa.call.beauty';
// The incoming-call buzz: long, pause, long, repeating.
const RING_VIBRATION = [0, 800, 600, 800, 1600];

// The call's id is also its Agora channel name, so it has to be unguessable.
const newId = () => Crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
const personOf = (p) => (p ? { id: p.id, name: p.display_name || (p.username ? `@${p.username}` : 'BOA HUB member'), avatar_url: p.avatar_url ?? null } : null);

/** What the call screen says about a call that's over. */
export const END_REASONS = {
  ended: 'Call ended',
  declined: 'Declined',
  busy: 'On another call',
  missed: 'No answer',
  unreachable: "Couldn't reach them",
};

const NO_MEDIA = Object.freeze({ status: 'idle', remoteUid: null, remoteVideo: false, error: null });

/**
 * BOA video calls: the call in progress and everything about it (who,
 * which way, ringing, connecting, live, ended), the in-call controls (mute,
 * camera, speaker) and the beauty filters. Ringing travels over
 * src/calls/signaling.js; picture and sound over Agora (src/calls/media).
 * Starting a call is BOA Premium; answering one never is.
 */
export function CallProvider({ children }) {
  const { userId, profile, blocked } = useHub();
  const { requirePremium } = usePremium();
  const [call, setCall] = useState(null); // { id, peer, direction, phase, startedAt, reason }
  const [controls, setControls] = useState({ muted: false, cameraOff: false, speaker: true });
  const [beauty, setBeautyState] = useState(DEFAULT_BEAUTY);
  const [video, setVideo] = useState(NO_MEDIA); // the Agora side: status, the other person's uid and picture
  const callRef = useRef(null);
  callRef.current = call;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const beautyRef = useRef(beauty);
  beautyRef.current = beauty;
  const timers = useRef({});

  useEffect(() => {
    AsyncStorage.getItem(BEAUTY_KEY)
      .then((raw) => raw && setBeautyState({ ...DEFAULT_BEAUTY, ...JSON.parse(raw) }))
      .catch(() => {});
  }, []);

  const setBeauty = useCallback((patch) => {
    setBeautyState((b) => {
      const next = { ...b, ...patch };
      AsyncStorage.setItem(BEAUTY_KEY, JSON.stringify(next)).catch(() => {});
      media.setBeauty(next);
      return next;
    });
  }, []);

  const clearTimers = () => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    Vibration.cancel();
    stopRingtone();
  };

  // A call ends: say why for a moment, then close the screen.
  const finish = useCallback((reason = 'ended') => {
    clearTimers();
    media.leave();
    setCall((c) => (c && c.phase !== 'ended' ? { ...c, phase: 'ended', reason } : c));
    timers.current.close = setTimeout(() => {
      setCall(null);
      setControls({ muted: false, cameraOff: false, speaker: true });
      setVideo(NO_MEDIA);
    }, ENDED_MS);
  }, []);

  const goLive = useCallback(() => {
    clearTimers();
    haptics.success();
    const c = callRef.current;
    setCall((cur) => (cur ? { ...cur, phase: 'active', startedAt: Date.now() } : cur));
    if (!c) return;
    media.join(c.id, {
      beauty: beautyRef.current,
      controls: controlsRef.current,
      onEvent: (patch) => {
        if (callRef.current?.id !== c.id) return;
        setVideo((v) => {
          // Someone else leaving (a stale uid) doesn't take their picture away.
          if (patch.gone != null && v.remoteUid != null && patch.gone !== v.remoteUid) return v;
          const { gone, ...rest } = patch;
          return { ...v, ...rest };
        });
      },
    });
  }, []);

  // Signals sent to this phone.
  useEffect(() => {
    if (!userId) return undefined;
    return signal.listen(userId, (event, p) => {
      const current = callRef.current;
      if (event === 'ring') {
        const from = p.from;
        if (!from?.id || !p.callId || blocked.has(from.id)) return;
        if (current && current.phase !== 'ended') {
          signal.send(from.id, 'busy', { callId: p.callId });
          return;
        }
        clearTimers();
        setCall({ id: p.callId, peer: from, direction: 'in', phase: 'ringing', startedAt: null, reason: null });
        setVideo(NO_MEDIA);
        Vibration.vibrate(RING_VIBRATION, true);
        startRingtone();
        timers.current.ring = setTimeout(() => finish('missed'), RING_MS);
        return;
      }
      if (!current || p.callId !== current.id || current.phase === 'ended') return;
      if (event === 'accept' && current.direction === 'out') goLive();
      else if (event === 'decline') finish('declined');
      else if (event === 'busy') finish('busy');
      else if (event === 'end') finish(current.phase === 'ringing' && current.direction === 'in' ? 'missed' : 'ended');
    });
  }, [userId, blocked, finish, goLive]);

  useEffect(
    () => () => {
      clearTimers();
      media.leave();
    },
    [],
  );

  /** Calls someone (BOA Premium). person: their profile. */
  const startCall = useCallback(
    (person) =>
      requirePremium(async () => {
        const peer = personOf(person);
        if (!peer || !userId || peer.id === userId) return;
        if (callRef.current && callRef.current.phase !== 'ended') return;
        clearTimers();
        const id = newId();
        setCall({ id, peer, direction: 'out', phase: 'ringing', startedAt: null, reason: null });
        setVideo(NO_MEDIA);
        haptics.selection();
        // Your camera comes on while it rings, so you can check how you look.
        media.prepare(id, beautyRef.current).catch(() => {});
        const sent = await signal.send(peer.id, 'ring', { callId: id, video: true, from: personOf(profile) ?? { id: userId, name: 'BOA HUB member' } });
        if (callRef.current?.id !== id) return;
        if (!sent) return finish('unreachable');
        timers.current.ring = setTimeout(() => {
          signal.send(peer.id, 'end', { callId: id });
          finish('missed');
        }, RING_MS);
      }, 'Video calls are part of BOA Premium.'),
    [requirePremium, userId, profile, finish],
  );

  const accept = useCallback(() => {
    const c = callRef.current;
    if (!c || c.direction !== 'in' || c.phase !== 'ringing') return;
    signal.send(c.peer.id, 'accept', { callId: c.id });
    goLive();
  }, [goLive]);

  const decline = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    signal.send(c.peer.id, 'decline', { callId: c.id });
    finish('declined');
  }, [finish]);

  const hangUp = useCallback(() => {
    const c = callRef.current;
    if (!c || c.phase === 'ended') return;
    signal.send(c.peer.id, 'end', { callId: c.id });
    finish('ended');
  }, [finish]);

  const toggle = useCallback((key) => {
    haptics.selection();
    const next = !controlsRef.current[key];
    if (key === 'muted') media.setMuted(next);
    else if (key === 'cameraOff') media.setCameraOff(next);
    else if (key === 'speaker') media.setSpeaker(next);
    setControls((c) => ({ ...c, [key]: next }));
  }, []);

  const value = useMemo(
    () => ({ call, controls, video, beauty, setBeauty, startCall, accept, decline, hangUp, toggle }),
    [call, controls, video, beauty, setBeauty, startCall, accept, decline, hangUp, toggle],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallScreen me={personOf(profile)} />
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>');
  return ctx;
}

/** useCall, or null outside the provider (screens rendered on their own in tests). */
export const useCallMaybe = () => useContext(CallContext);
