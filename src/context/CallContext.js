import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHub } from './HubContext';
import { usePremium } from './PremiumContext';
import * as signal from '../calls/signaling';
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

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const personOf = (p) => (p ? { id: p.id, name: p.display_name || (p.username ? `@${p.username}` : 'BOA HUB member'), avatar_url: p.avatar_url ?? null } : null);

/** What the call screen says about a call that's over. */
export const END_REASONS = {
  ended: 'Call ended',
  declined: 'Declined',
  busy: 'On another call',
  missed: 'No answer',
  unreachable: "Couldn't reach them",
};

/**
 * BOA video calls: the call in progress and everything about it (who,
 * which way, ringing, connecting, live, ended), the in-call controls (mute,
 * camera, speaker) and the beauty filters. Ringing travels over
 * src/calls/signaling.js; a media service (Agora/WebRTC) plugs in at the
 * marked spots once it's chosen. Starting a call is BOA Premium; answering
 * one never is.
 */
export function CallProvider({ children }) {
  const { userId, profile, blocked } = useHub();
  const { requirePremium } = usePremium();
  const [call, setCall] = useState(null); // { id, peer, direction, phase, startedAt, reason }
  const [controls, setControls] = useState({ muted: false, cameraOff: false, speaker: true });
  const [beauty, setBeautyState] = useState(DEFAULT_BEAUTY);
  const callRef = useRef(null);
  callRef.current = call;
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
      // Media service: engine.setBeautyEffectOptions / setColorEnhanceOptions(toAgora(next)).
      return next;
    });
  }, []);

  const clearTimers = () => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    Vibration.cancel();
  };

  // A call ends: say why for a moment, then close the screen.
  const finish = useCallback((reason = 'ended') => {
    clearTimers();
    // Media service: leave the channel and release the camera here.
    setCall((c) => (c && c.phase !== 'ended' ? { ...c, phase: 'ended', reason } : c));
    timers.current.close = setTimeout(() => {
      setCall(null);
      setControls({ muted: false, cameraOff: false, speaker: true });
    }, ENDED_MS);
  }, []);

  const goLive = useCallback(() => {
    clearTimers();
    haptics.success();
    // Media service: join the channel named by call.id here.
    setCall((c) => (c ? { ...c, phase: 'active', startedAt: Date.now() } : c));
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
        Vibration.vibrate(RING_VIBRATION, true);
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

  useEffect(() => () => clearTimers(), []);

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
        haptics.selection();
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

  // Media service: mute the mic / stop the camera / route audio here.
  const toggle = useCallback((key) => {
    haptics.selection();
    setControls((c) => ({ ...c, [key]: !c[key] }));
  }, []);

  const value = useMemo(
    () => ({ call, controls, beauty, setBeauty, startCall, accept, decline, hangUp, toggle }),
    [call, controls, beauty, setBeauty, startCall, accept, decline, hangUp, toggle],
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
