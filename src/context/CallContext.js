import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Vibration } from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import { useHub } from './HubContext';
import { usePremium } from './PremiumContext';
import * as signal from '../calls/signaling';
import * as media from '../calls/media';
import { startRingtone, stopRingtone } from '../calls/ringtone';
import { DEFAULT_BEAUTY, fromStored, toStored } from '../calls/beauty';
import { DEFAULT_BACKGROUND, fromStored as backgroundFromStored } from '../calls/backgrounds';
import CallScreen from '../components/calls/CallScreen';
import { haptics } from '../utils/haptics';
import { blockScreenshots } from '../calls/privacy';
import { notifyMissedCall } from '../chat/notifications';
import * as BoaCall from '../../modules/boa-call';
import { askForCallWakeUp } from '../calls/wakeUp';
import { RING_MS, callFromPush, parseCallLink, pendingCall, ringLeft, ringNotification, stopRingNotification } from '../calls/incoming';

const CallContext = createContext(null);

// How long a call rings before it's a missed call.
export { RING_MS };
// How long "Call ended" stays up before the screen closes.
const ENDED_MS = 1600;
const BEAUTY_KEY = 'boa.call.beauty';
const BACKGROUND_KEY = 'boa.call.background';
// Whether you've hidden your own picture (it's still sent; you just don't see it).
const SELF_VIEW_KEY = 'boa.call.selfHidden';
// Off by default: while the call floats in its window, taps elsewhere pass
// through to the app. On, the background is locked against accidental taps.
const LOCK_PIP_KEY = 'boa.call.lockPip';
// How long a call got ready ahead of time stays usable (its token lasts an hour).
const PRIMED_MS = 40 * 60 * 1000;
// Leaving the app mid-call on Android passes through the background on its
// way into picture in picture: the camera waits this long for the window
// before it rests.
const AWAY_MS = Platform.OS === 'android' ? 700 : 0;
// Back on screen with a call ringing: how long before the call screen rings it.
const RESUME_RING_MS = 400;
// Unknown (just started) counts as on screen; only a known background rings by notification.
const onScreen = () => AppState.currentState !== 'background';

// The call's id is also its Agora channel name, so it has to be unguessable.
const newId = () => Crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
const personOf = (p) =>
  p
    ? {
        id: p.id,
        name: p.display_name || (p.username ? `@${p.username}` : 'BOA HUB member'),
        avatar_url: p.avatar_url ?? null,
      }
    : null;

/** What the call screen says about a call that's over. */
export const END_REASONS = {
  ended: 'Call ended',
  declined: 'Declined',
  busy: 'On another call',
  missed: 'No answer',
  unreachable: "Couldn't reach them",
};

const NO_MEDIA = Object.freeze({
  status: 'idle',
  remoteUid: null,
  remoteVideo: false,
  remotePrivacy: false,
  error: null,
});
const NO_CONTROLS = Object.freeze({
  muted: false,
  cameraOff: false,
  speaker: true,
  privacy: false,
});

/**
 * BOA video calls: the call in progress and everything about it (who,
 * which way, ringing, connecting, live, ended), the in-call controls (mute,
 * camera, speaker) and the beauty filters. Ringing travels over
 * src/calls/signaling.js; picture and sound over Agora (src/calls/media).
 * Starting a call is BOA Premium; answering one never is.
 */
export function CallProvider({ children }) {
  const { userId, profile, blocked, ringtone, chatSound } = useHub();
  const chatSoundRef = useRef(chatSound);
  chatSoundRef.current = chatSound;
  const ringtoneRef = useRef(ringtone);
  ringtoneRef.current = ringtone;
  const { requirePremium } = usePremium();
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [call, setCall] = useState(null); // { id, peer, direction, phase, startedAt, reason }
  const [controls, setControls] = useState(NO_CONTROLS);
  const [beauty, setBeautyState] = useState(DEFAULT_BEAUTY);
  const [video, setVideo] = useState(NO_MEDIA); // the Agora side: status, the other person's uid and picture
  const callRef = useRef(null);
  callRef.current = call;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const beautyRef = useRef(beauty);
  beautyRef.current = beauty;
  // What's behind you on camera (src/calls/backgrounds.js), and how the
  // last change went: 'ok', 'unsupported' (this phone can't), 'failed', or 'later'.
  const [background, setBackgroundState] = useState(DEFAULT_BACKGROUND);
  const [backgroundStatus, setBackgroundStatus] = useState('ok');
  const timers = useRef({});
  // The next call you place, got ready ahead (its id, token and the engine):
  // { id, at, ready }. prep says how that's going, for the call button.
  const primed = useRef(null);
  const [prep, setPrep] = useState('idle'); // idle | preparing | ready | error
  const [starting, setStarting] = useState(false);

  const [selfHidden, setSelfHiddenState] = useState(false);
  const [lockDuringPip, setLockDuringPipState] = useState(false);
  // The call shrunk to a floating window, so the rest of the app is usable while it goes on.
  const [minimized, setMinimized] = useState(false);
  const minimize = useCallback(() => setMinimized(true), []);
  const restore = useCallback(() => setMinimized(false), []);
  const [facing, setFacing] = useState(media.cameraFacing());
  useEffect(() => media.onFacing(setFacing), []);

  useEffect(() => {
    AsyncStorage.getItem(BEAUTY_KEY)
      .then((raw) => raw && setBeautyState(fromStored(JSON.parse(raw))))
      .catch(() => {});
    AsyncStorage.getItem(BACKGROUND_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = backgroundFromStored(JSON.parse(raw));
        setBackgroundState(saved);
        // Held until a call opens the camera, then drawn from its first frame.
        media.setBackground(saved);
      })
      .catch(() => {});
    AsyncStorage.getItem(SELF_VIEW_KEY)
      .then((v) => v === '1' && setSelfHiddenState(true))
      .catch(() => {});
    AsyncStorage.getItem(LOCK_PIP_KEY)
      .then((v) => v === '1' && setLockDuringPipState(true))
      .catch(() => {});
  }, []);

  // Saved and sent to the camera once, here: never inside a state updater, which React may run twice.
  const setBeauty = useCallback((patch) => {
    const next = { ...beautyRef.current, ...patch };
    beautyRef.current = next;
    setBeautyState(next);
    AsyncStorage.setItem(BEAUTY_KEY, JSON.stringify(toStored(next))).catch(() => {});
    media.setBeauty(next);
  }, []);

  // Saved at once and sent to the camera; a phone that can't do it says so.
  const setBackground = useCallback((next) => {
    setBackgroundState(next);
    AsyncStorage.setItem(BACKGROUND_KEY, JSON.stringify(next)).catch(() => {});
    Promise.resolve(media.setBackground(next))
      .then((status) => setBackgroundStatus(status ?? 'ok'))
      .catch(() => setBackgroundStatus('failed'));
  }, []);

  // Tap to focus, from the self view.
  const focusAt = useCallback((x, y) => media.focusAt(x, y), []);

  // Brightness and Contrast while their sliders move: straight to the camera,
  // nothing saved or re-rendered until they're let go (setBeauty then).
  const previewBrightness = useCallback((v) => media.setBrightness(v), []);
  const previewContrast = useCallback((v) => media.setContrast(v), []);

  // Every call starts full screen.
  const callId = call?.id ?? null;
  useEffect(() => setMinimized(false), [callId]);

  // System picture in picture (Android): while you're on a call (not one
  // still ringing in), leaving the app floats it over the home screen.
  const [pip, setPip] = useState(false);
  useEffect(() => BoaCall.addPipListener(setPip), []);
  const onCall = !!call && call.phase !== 'ended' && !(call.direction === 'in' && call.phase === 'ringing');
  useEffect(() => {
    BoaCall.setPipReady(onCall);
    if (!onCall) setPip(false);
  }, [onCall]);

  // A call on keeps going with the screen off (Android: an ongoing-call
  // foreground service, modules/boa-call OngoingCallService). Started as the
  // call is placed or answered, with the app on screen, and again once it's
  // live, when the microphone is surely allowed.
  const live = call?.phase === 'active';
  useEffect(() => {
    if (!onCall) return undefined;
    return () => {
      BoaCall.stopOngoing();
    };
  }, [onCall]);
  useEffect(() => {
    if (onCall) BoaCall.startOngoing(callRef.current?.peer?.name, callId);
  }, [onCall, live, callId]);

  // Out of sight, your camera rests and the call carries on as a voice call
  // (media.setAway): the power button, or leaving the app without its
  // floating window. Back on screen, the picture comes straight back.
  const [appState, setAppState] = useState(AppState.currentState);
  const [screenOn, setScreenOn] = useState(true);
  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);
  useEffect(() => BoaCall.addScreenListener(setScreenOn), []);
  const screenOnRef = useRef(true);
  screenOnRef.current = screenOn;
  const away = onCall && (!screenOn || (appState === 'background' && !pip));
  useEffect(() => {
    if (!away) {
      media.setAway(false);
      return undefined;
    }
    const t = setTimeout(() => media.setAway(true), AWAY_MS);
    return () => clearTimeout(t);
  }, [away]);

  const setSelfHidden = useCallback((hidden) => {
    setSelfHiddenState(hidden);
    AsyncStorage.setItem(SELF_VIEW_KEY, hidden ? '1' : '0').catch(() => {});
  }, []);

  const setLockDuringPip = useCallback((on) => {
    setLockDuringPipState(!!on);
    AsyncStorage.setItem(LOCK_PIP_KEY, on ? '1' : '0').catch(() => {});
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
    // A call that never connected (no answer, or nobody to ring) leaves
    // nothing behind: the engine goes too, so the next call starts fresh.
    if (reason === 'missed' || reason === 'unreachable') media.reset();
    else media.leave();
    if (callRef.current) media.forget(callRef.current.id);
    // Screenshots come back the moment the call ends, not when the screen closes.
    if (controlsRef.current.privacy) blockScreenshots(false);
    setControls((c) => (c.privacy ? { ...c, privacy: false } : c));
    const c = callRef.current;
    if (c?.direction === 'in') stopRingNotification(c.id);
    // A call that rang here and wasn't picked up stays in the notification shade.
    if (c && c.phase === 'ringing' && c.direction === 'in' && reason === 'missed')
      notifyMissedCall({
        name: c.peer.name,
        peerId: c.peer.id,
        sound: chatSoundRef.current,
      });
    // The ref too, at once: a new call can start before React renders.
    if (c && c.phase !== 'ended') callRef.current = { ...c, phase: 'ended', reason };
    setCall((cur) => (cur && cur.phase !== 'ended' ? { ...cur, phase: 'ended', reason } : cur));
    timers.current.close = setTimeout(() => {
      setCall(null);
      setControls(NO_CONTROLS);
      setVideo(NO_MEDIA);
      // A call that opened the app over the lock screen leaves it there.
      BoaCall.leaveLockScreen();
      // After a call you were part of, and only if this phone would stop the
      // next one from ringing full screen, one plain question about it.
      if (c && reason === 'ended' && AppState.currentState === 'active') askForCallWakeUp();
    }, ENDED_MS);
  }, []);

  const goLive = useCallback(() => {
    clearTimers();
    haptics.success();
    const c = callRef.current;
    setCall((cur) => (cur ? { ...cur, phase: 'active', startedAt: Date.now() } : cur));
    if (!c) return;
    if (c.direction === 'in') stopRingNotification(c.id);
    // They answered while your phone was locked: the screen lights up on the
    // call, over the lock screen, like a phone call (off again once it's over).
    if (c.direction === 'out' && !screenOnRef.current) BoaCall.wakeForCall();
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

  // Calls this phone has already rung for: the same call arrives twice
  // (Realtime and push), and a late push must not ring a call that's over.
  const seen = useRef(new Set());
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  // An incoming call rings on the call screen with the app on screen, and
  // as a phone-call notification when it isn't (src/calls/incoming.js).
  // The buzz comes with the ringtone, on its bass hits (src/calls/ringtone.js).
  const ringHere = () => startRingtone(ringtoneRef.current);
  const ringAway = (c) => {
    Vibration.cancel();
    stopRingtone();
    ringNotification({
      callId: c.id,
      from: c.peer,
      sentAt: c.sentAt,
      ringtone: ringtoneRef.current,
    });
  };

  // A ring that ran out while Android had the app frozen (its timer with
  // it). Every ring has a wall-clock start, sentAt, so it can't outlive
  // RING_MS and leave the caller stuck on "Ringing..." and turning calls away.
  const stale = (c) => c?.phase === 'ringing' && ringLeft(c.sentAt) <= 0;
  const expire = useCallback(
    (c) => {
      if (c.direction === 'out') signal.send(c.peer.id, 'end', { callId: c.id });
      finish('missed');
    },
    [finish],
  );

  // What a ring says (Realtime): sentAt so a ring delivered late (a phone
  // waking up) only rings for the time it has left.
  const ringPayload = (id, sentAt) => ({
    callId: id,
    video: true,
    sentAt,
    from: personOf(profileRef.current) ?? {
      id: userIdRef.current,
      name: 'BOA HUB member',
    },
  });

  // You're ringing them and they ring you: one call, never "On another call"
  // both ways. The call with the smaller id is the one that happens, the
  // same on both phones. Theirs: drop yours and answer it. Yours: ring them
  // with it again (their app is open, they're calling), and they answer it.
  const crossed = useCallback(
    (mine, theirId, from) => {
      if (theirId < mine.id || ringLeft(mine.sentAt) < 5000) {
        clearTimers();
        media.forget(mine.id);
        signal.send(from.id, 'end', { callId: mine.id });
        seen.current.add(mine.id);
        callRef.current = {
          id: theirId,
          peer: mine.peer,
          direction: 'in',
          phase: 'ringing',
          startedAt: null,
          reason: null,
          sentAt: Date.now(),
        };
        setCall(callRef.current);
        setVideo(NO_MEDIA);
        signal.send(from.id, 'accept', {
          callId: theirId,
          by: userIdRef.current,
        });
        goLive();
      } else {
        signal.send(from.id, 'ring', ringPayload(mine.id, mine.sentAt));
      }
    },
    [goLive],
  );

  /**
   * Someone is calling: ring, unless it's a call already heard or we're
   * busy. ms: how long it has left. quiet: it's being answered right now
   * (Answer on the lock screen opened the app), so it doesn't ring at all.
   */
  const ringIn = useCallback(
    ({ callId, from }, ms = RING_MS, { quiet = false } = {}) => {
      if (!from?.id || !callId || blockedRef.current.has(from.id) || seen.current.has(callId)) return;
      seen.current.add(callId);
      let current = callRef.current;
      if (stale(current)) {
        expire(current);
        current = null;
      }
      if (current && current.phase !== 'ended') {
        if (current.direction === 'out' && current.phase === 'ringing' && current.peer.id === from.id) crossed(current, callId, from);
        else signal.send(from.id, 'busy', { callId });
        return;
      }
      clearTimers();
      // The ref too, at once: it can be answered (from the notification) before React renders.
      callRef.current = {
        id: callId,
        peer: from,
        direction: 'in',
        phase: 'ringing',
        startedAt: null,
        reason: null,
        sentAt: Date.now() - (RING_MS - ms),
      };
      setCall(callRef.current);
      setVideo(NO_MEDIA);
      // The token while it rings, so answering connects at once.
      media.warmUp(callId, { engine: false }).catch(() => {});
      if (onScreen()) {
        // The app came up on this call (a tap on its notification, a cold
        // start): the notification's ring stops, so only one ever plays.
        stopRingNotification(callId);
        if (!quiet) ringHere();
      } else ringAway(callRef.current);
      timers.current.ring = setTimeout(() => finish('missed'), ms);
    },
    [finish, expire, crossed],
  );

  // Ringing follows the app: back on screen, the call screen rings it (the
  // notification goes); sent to the background, the notification does.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const c = callRef.current;
      if (!c || c.phase !== 'ringing') return;
      if (state === 'active' && stale(c)) return expire(c);
      if (c.direction !== 'in') return;
      if (state === 'active') {
        stopRingNotification(c.id);
        // A beat first: back on screen because Answer was pressed, the call
        // is answered before this, and nothing rings in between.
        clearTimeout(timers.current.resume);
        timers.current.resume = setTimeout(() => {
          const now = callRef.current;
          if (now?.id === c.id && now.phase === 'ringing' && AppState.currentState === 'active') ringHere();
        }, RESUME_RING_MS);
      } else if (state === 'background') {
        clearTimeout(timers.current.resume);
        ringAway(c);
      }
    });
    return () => sub.remove();
  }, [expire]);

  // Signals sent to this phone, over Realtime (the app in the foreground).
  useEffect(() => {
    if (!userId) return undefined;
    return signal.listen(userId, (event, p) => {
      const current = callRef.current;
      if (event === 'ring') {
        // Older apps don't send sentAt: a full ring.
        const left = p.sentAt ? ringLeft(p.sentAt) : RING_MS;
        if (left >= 2000) ringIn(p, left);
        return;
      }
      // They answered a call that's already over here (a late push): tell them.
      if (event === 'accept' && p.by && (!current || p.callId !== current.id)) {
        signal.send(p.by, 'end', { callId: p.callId });
        return;
      }
      if (!current || p.callId !== current.id || current.phase === 'ended') {
        // A call that's over before it reached the call screen (it rang by
        // push, or crossed with yours): it must not ring late.
        if ((event === 'end' || event === 'decline') && p.callId) {
          seen.current.add(p.callId);
          if (pendingCall(p.callId)) stopRingNotification(p.callId);
        }
        return;
      }
      if (event === 'accept' && current.direction === 'out') goLive();
      else if (event === 'decline') finish('declined');
      else if (event === 'busy') finish('busy');
      else if (event === 'end') finish(current.phase === 'ringing' && current.direction === 'in' ? 'missed' : 'ended');
    });
  }, [userId, ringIn, finish, goLive]);

  // The same ring by push (supabase/functions/call-push): it wakes the
  // phone when Android has frozen the app. Received with the app open, it
  // rings straight away; tapped (from the background, or from a cold
  // start), it opens the call screen with whatever ring time is left.
  useEffect(() => {
    if (!userId) return undefined;
    const fromPush = (n) => {
      const c = callFromPush(n?.request?.content?.data);
      if (!c) return;
      Notifications.dismissNotificationAsync?.(n.request.identifier)?.catch?.(() => {});
      const left = ringLeft(c.sentAt);
      if (left < 2000) return;
      ringIn({ callId: c.callId, from: c.from }, left);
    };
    const received = Notifications.addNotificationReceivedListener(fromPush);
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => fromPush(r?.notification));
    Notifications.getLastNotificationResponseAsync?.()
      ?.then((r) => r && fromPush(r.notification))
      .catch(() => {});
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [userId, ringIn]);

  useEffect(
    () => () => {
      clearTimers();
      media.leave();
      if (controlsRef.current.privacy) blockScreenshots(false);
    },
    [],
  );

  /**
   * Gets your next call ready before you tap the call button: its id and
   * its token from agora-token. The chat thread calls this when it opens
   * and again after each call. Safe to call often. Never the Agora engine
   * or the camera: those start only when you tap call (startCall), so
   * opening a chat can never bring the camera up, or take the app down
   * with it.
   */
  const primeCall = useCallback(() => {
    if (!userId || !media.available) return;
    const p = primed.current;
    if (p && Date.now() - p.at < PRIMED_MS) return;
    if (p) media.forget(p.id);
    const next = { id: newId(), at: Date.now() };
    primed.current = next;
    setPrep('preparing');
    next.ready = media.warmUp(next.id, { engine: false }).then(
      () => {
        if (primed.current === next) setPrep('ready');
        return true;
      },
      (err) => {
        console.error('[call] warm-up failed', err?.message ?? err);
        if (primed.current === next) {
          primed.current = null;
          setPrep('error');
        }
        return false;
      },
    );
  }, [userId]);

  /** Calls someone (BOA Premium). person: their profile. */
  const startCall = useCallback(
    (person) =>
      requirePremium(async () => {
        const peer = personOf(person);
        if (!peer || !userId || peer.id === userId) return;
        if (stale(callRef.current)) expire(callRef.current);
        if (callRef.current && callRef.current.phase !== 'ended') return;
        // Use the call got ready ahead; if it's still getting ready, say
        // "Preparing call..." on the button and wait for it.
        const ahead = primed.current;
        primed.current = null;
        setPrep('idle');
        if (ahead?.ready) {
          setStarting(true);
          await ahead.ready;
          setStarting(false);
          if (callRef.current && callRef.current.phase !== 'ended') return;
        }
        clearTimers();
        const id = ahead?.id ?? newId();
        // The ref too, at once: the ring can be answered before React renders.
        const sentAt = Date.now();
        callRef.current = {
          id,
          peer,
          direction: 'out',
          phase: 'ringing',
          startedAt: null,
          reason: null,
          sentAt,
        };
        setCall(callRef.current);
        setVideo(NO_MEDIA);
        haptics.selection();
        // Your camera comes on while it rings, so you can check how you look.
        media.prepare(id, beautyRef.current).catch(() => {});
        // Realtime reaches a phone with the app open; the push wakes one in a pocket.
        const [live, pushed] = await Promise.all([signal.send(peer.id, 'ring', ringPayload(id, sentAt)), signal.pushRing(peer.id, id)]);
        if (callRef.current?.id !== id) return;
        if (!live && !pushed) return finish('unreachable');
        timers.current.ring = setTimeout(() => {
          signal.send(peer.id, 'end', { callId: id });
          finish('missed');
        }, ringLeft(sentAt));
      }, 'Video calls are part of BOA Premium.'),
    [requirePremium, userId, finish, expire],
  );

  const accept = useCallback(() => {
    const c = callRef.current;
    if (!c || c.direction !== 'in' || c.phase !== 'ringing') return;
    signal.send(c.peer.id, 'accept', { callId: c.id, by: userId });
    goLive();
  }, [goLive, userId]);

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

  // The call notification (src/calls/incoming.js): tapping it or the
  // full-screen intent opens the app on a call link, which rings the call
  // here; Answer answers it as well. Cold starts too (the link the app was
  // opened with).
  useEffect(() => {
    if (!userId) return undefined;
    const fromLink = (url) => {
      const c = parseCallLink(url);
      if (!c) return;
      const left = ringLeft(c.sentAt);
      const answering = c.action === 'accept';
      if (left >= 2000) ringIn({ callId: c.callId, from: c.from }, left, { quiet: answering });
      if (answering && callRef.current?.id === c.callId) accept();
    };
    Linking.getInitialURL()
      .then((url) => url && fromLink(url))
      .catch(() => {});
    const sub = Linking.addEventListener('url', (e) => fromLink(e?.url));
    return () => sub?.remove?.();
  }, [userId, ringIn, accept]);

  // Decline on the notification. A call the call screen never heard of
  // (it only came by push) is still declined to the caller.
  useEffect(
    () =>
      BoaCall.addDeclineListener((callId) => {
        if (callRef.current?.id === callId) return decline();
        const p = pendingCall(callId);
        stopRingNotification(callId);
        seen.current.add(callId);
        if (p) signal.send(p.from.id, 'decline', { callId });
      }),
    [decline],
  );

  // Hang up on the ongoing-call notification.
  useEffect(() => BoaCall.addHangUpListener(() => hangUp()), [hangUp]);

  // The call screen's buttons give their own haptic tap.
  const toggle = useCallback((key) => {
    const next = !controlsRef.current[key];
    if (key === 'muted') media.setMuted(next);
    else if (key === 'cameraOff') media.setCameraOff(next);
    else if (key === 'speaker') media.setSpeaker(next);
    else if (key === 'privacy') {
      blockScreenshots(next);
      media.setPrivacy(next);
    }
    setControls((c) => ({ ...c, [key]: next }));
  }, []);

  const flipCamera = useCallback(() => media.switchCamera(), []);

  // The floating picture-in-picture window's own buttons: Mute toggles the
  // mic, End hangs up. Nothing else reaches the call while it's in the window.
  useEffect(() => BoaCall.addPipActionListener((action) => (action === 'mute' ? toggle('muted') : action === 'end' ? hangUp() : undefined)), [toggle, hangUp]);
  // Keep that window's Mute button showing the call's real mute state.
  useEffect(() => {
    BoaCall.setPipMuted(controls.muted);
  }, [controls.muted]);

  const value = useMemo(
    () => ({
      call,
      controls,
      video,
      beauty,
      setBeauty,
      previewBrightness,
      previewContrast,
      background,
      setBackground,
      backgroundStatus,
      focusAt,
      facing,
      selfHidden,
      setSelfHidden,
      lockDuringPip,
      setLockDuringPip,
      minimized,
      minimize,
      restore,
      pip,
      startCall,
      accept,
      decline,
      hangUp,
      toggle,
      flipCamera,
      primeCall,
      callPrep: starting ? 'starting' : prep,
    }),
    [
      call,
      controls,
      video,
      beauty,
      setBeauty,
      previewBrightness,
      previewContrast,
      background,
      setBackground,
      backgroundStatus,
      focusAt,
      facing,
      selfHidden,
      setSelfHidden,
      lockDuringPip,
      setLockDuringPip,
      minimized,
      minimize,
      restore,
      pip,
      startCall,
      accept,
      decline,
      hangUp,
      toggle,
      flipCamera,
      primeCall,
      starting,
      prep,
    ],
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
