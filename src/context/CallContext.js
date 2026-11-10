import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, Vibration } from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import { useHub } from './HubContext';
import * as signal from '../calls/signaling';
import * as media from '../calls/media';
import { startRingtone, stopRingtone } from '../calls/ringtone';
import { DEFAULT_BEAUTY, fromStored, toStored } from '../calls/beauty';
import { DEFAULT_BACKGROUND, fromStored as backgroundFromStored } from '../calls/backgrounds';
import CallScreen from '../components/calls/CallScreen';
import { TransferPrompt } from '../components/calls/CallExtras';
import { haptics } from '../utils/haptics';
import { blockScreenshots } from '../calls/privacy';
import { EDGE_RING_REPEAT_MS, triggerEdgeLighting } from '../data/edgeLighting';
import { notifyMissedCall } from '../chat/notifications';
import * as BoaCall from '../../modules/boa-call';
import { setAppCall } from '../audio/interruptions';
import { askForCallWakeUp } from '../calls/wakeUp';
import { startConversation } from '../api/hub';
import { goToTab, navigationRef, openPage } from '../navigation/ref';
import { RING_MS, callFromPush, cancelFromPush, parseCallLink, pendingCall, ringLeft, ringNotification, stopRingNotification } from '../calls/incoming';
import { BEAT_MS, announce, otherPhoneCall, retract } from '../calls/presence';
import { startWaitingTone, stopWaitingTone } from '../calls/waitingTone';

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
  elsewhere: 'Answered on your other phone',
  transferred: 'Moved to your other phone',
  missed: 'No answer',
  unreachable: "Couldn't reach them",
};

const NO_MEDIA = Object.freeze({
  status: 'idle',
  // Everyone else in the channel (more than one in a conference).
  uids: [],
  videos: {},
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
 */
export function CallProvider({ children }) {
  const { userId, profile, blocked, ringtone, chatSound } = useHub();
  const chatSoundRef = useRef(chatSound);
  chatSoundRef.current = chatSound;
  const ringtoneRef = useRef(ringtone);
  ringtoneRef.current = ringtone;
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
  // A second caller while you are on a call: { id, peer, sentAt, voice, device }.
  // It rings as a call waiting banner over the call (End and accept, Merge, Decline).
  const [waiting, setWaitingState] = useState(null);
  const waitingRef = useRef(null);
  const waitTimer = useRef(null);
  const setWaiting = useCallback((w) => {
    waitingRef.current = w;
    setWaitingState(w);
  }, []);
  // The call your OTHER phone has: { callId, channel, device, voice, startedAt, peer }.
  const [otherPhone, setOtherPhone] = useState(null);
  const [transferring, setTransferring] = useState(false);
  // Calls whose "move it here?" you said no to, so it asks once.
  const keptElsewhere = useRef(new Set());
  const releasedWait = useRef(null);

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
  // Only the latest press counts: an earlier one finishing late can't
  // overwrite it. A failure goes back to the plain camera, never a frozen one.
  const backgroundSeq = useRef(0);
  const setBackground = useCallback((next) => {
    const seq = ++backgroundSeq.current;
    setBackgroundState(next);
    AsyncStorage.setItem(BACKGROUND_KEY, JSON.stringify(next)).catch(() => {});
    const fallBack = () => {
      if (seq !== backgroundSeq.current) return;
      setBackgroundStatus('failed');
      setBackgroundState(DEFAULT_BACKGROUND);
      AsyncStorage.setItem(BACKGROUND_KEY, JSON.stringify(DEFAULT_BACKGROUND)).catch(() => {});
    };
    let pending;
    try {
      pending = Promise.resolve(media.setBackground(next));
    } catch (err) {
      console.warn('[call] backdrop threw', err?.message ?? err);
      fallBack();
      return;
    }
    pending
      .then((status) => {
        if (seq !== backgroundSeq.current) return;
        if (status === 'failed') fallBack();
        else setBackgroundStatus(status ?? 'ok');
      })
      .catch(fallBack);
  }, []);

  // Tap to focus, from the self view.
  const focusAt = useCallback((x, y) => media.focusAt(x, y), []);

  // Brightness and Contrast while their sliders move: straight to the camera,
  // nothing saved or re-rendered until they're let go (setBeauty then).
  const previewBrightness = useCallback((v) => media.setBrightness(v), []);
  const previewContrast = useCallback((v) => media.setContrast(v), []);
  const previewEnhance = useCallback((v) => media.setEnhance(v), []);

  // Every call starts full screen.
  const callId = call?.id ?? null;
  useEffect(() => setMinimized(false), [callId]);

  // System picture in picture (Android): while you're on a call (not one
  // still ringing in), leaving the app floats it over the home screen.
  const [pip, setPip] = useState(false);
  useEffect(() => BoaCall.addPipListener(setPip), []);
  const onCall = !!call && call.phase !== 'ended' && !(call.direction === 'in' && call.phase === 'ringing');
  // Edge Lighting: a call or video call ringing in pulses the screen's edge, and
  // again every few seconds for as long as it rings.
  const ringingIn = !!call && call.direction === 'in' && call.phase === 'ringing';
  useEffect(() => {
    if (!ringingIn) return undefined;
    triggerEdgeLighting('call');
    const id = setInterval(() => triggerEdgeLighting('call'), EDGE_RING_REPEAT_MS);
    return () => clearInterval(id);
  }, [ringingIn, callId]);
  // The radio and Zen hold for a BOA call from the moment it rings or is
  // placed until it ends (src/audio/interruptions.js).
  const callActive = !!call && call.phase !== 'ended';
  useEffect(() => {
    setAppCall(callActive);
    return () => setAppCall(false);
  }, [callActive]);
  useEffect(() => {
    BoaCall.setPipReady(onCall);
    if (!onCall) setPip(false);
  }, [onCall]);

  // Their chat, over whatever is on screen, with the call carrying on in its
  // small window: how Back on the call screen and Chat on the floating
  // window both end up. Already in that chat: stay where you are.
  const openChat = useCallback(async () => {
    const peerId = callRef.current?.peer?.id;
    if (!peerId) return;
    try {
      const id = await startConversation(peerId);
      const here = navigationRef.isReady() ? navigationRef.getCurrentRoute() : null;
      if (here?.name === 'HubThread' && here.params?.id === id) return;
      openPage('HubThread', { id });
    } catch {
      // Messages closed, or offline: the chat list is the next best thing.
      goToTab('Chat');
    }
  }, []);

  // Back on a call must never close the app or hang up. The call screen's
  // own Back goes to the chat (CallScreen). This catches Back once the call
  // is already in its small window and there's nothing left to go back to
  // (the app's root): the call floats over the phone's home screen instead
  // of the app quitting.
  useEffect(() => {
    if (!onCall || Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigationRef.isReady() && navigationRef.canGoBack()) return false;
      if (!BoaCall.isPipSupported()) return false;
      BoaCall.enterPip();
      return true;
    });
    return () => sub.remove();
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
    const sub = AppState.addEventListener('change', (state) => {
      setAppState(state);
      // No call on: nothing should hold the camera while the app is away.
      if (state === 'background' && !callRef.current) media.releaseIdle();
    });
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

  // Says something to the call's other person. When we know which of their phones
  // has the call (they may be signed in on two), it is for that phone only.
  const reply = (c, event, payload) => signal.send(c.peer.id, event, c.peerDevice ? { ...payload, toDevice: c.peerDevice } : payload);

  // A waiting caller who is no longer waiting (answered, declined, hung up, or gone): the beeps stop.
  const clearWaiting = useCallback(() => {
    clearTimeout(waitTimer.current);
    waitTimer.current = null;
    stopWaitingTone();
    setWaiting(null);
  }, [setWaiting]);
  // The call your waiting caller becomes once the call you were on is over.
  const promoteRef = useRef(null);

  // A call ends: say why for a moment, then close the screen.
  const finish = useCallback((reason = 'ended') => {
    clearTimers();
    // Every hang-up destroys the camera engine so the next call starts fresh.
    media.reset();
    if (callRef.current) media.forget(callRef.current.id);
    // Screenshots come back the moment the call ends, not when the screen closes.
    if (controlsRef.current.privacy) blockScreenshots(false);
    setControls((c) => (c.privacy ? { ...c, privacy: false } : c));
    const c = callRef.current;
    if (c?.direction === 'in') stopRingNotification(c.id);
    // A call that rang here and wasn't picked up stays in the notification shade.
    if (c && c.phase === 'ringing' && c.direction === 'in' && reason === 'missed') {
      triggerEdgeLighting('missed-call');
      notifyMissedCall({
        name: c.peer.name,
        peerId: c.peer.id,
        sound: chatSoundRef.current,
      });
    }
    // The ref too, at once: a new call can start before React renders.
    if (c && c.phase !== 'ended') callRef.current = { ...c, phase: 'ended', reason };
    setCall((cur) => (cur && cur.phase !== 'ended' ? { ...cur, phase: 'ended', reason } : cur));
    timers.current.close = setTimeout(() => {
      setCall(null);
      setControls(NO_CONTROLS);
      setVideo(NO_MEDIA);
      // A call that opened the app over the lock screen leaves it there.
      BoaCall.leaveLockScreen();
      // Someone was waiting: now that your call is over, theirs rings as an ordinary call.
      if (waitingRef.current) {
        promoteRef.current?.();
        return;
      }
      // After a call you were part of, and only if this phone would stop the
      // next one from ringing full screen, one plain question about it.
      if (c && reason === 'ended' && AppState.currentState === 'active') askForCallWakeUp();
    }, ENDED_MS);
  }, []);

  // startedAt: a call moved here from your other phone keeps its clock.
  const goLive = useCallback(({ startedAt } = {}) => {
    clearTimers();
    haptics.success();
    const c = callRef.current;
    const began = startedAt ?? Date.now();
    setCall((cur) => (cur ? { ...cur, phase: 'active', startedAt: began } : cur));
    if (!c) return;
    // A voice call starts with the camera off (the camera button still turns it on).
    if (c.voice && !controlsRef.current.cameraOff) {
      controlsRef.current = { ...controlsRef.current, cameraOff: true };
      setControls(controlsRef.current);
    }
    if (c.direction === 'in') stopRingNotification(c.id);
    // They answered while your phone was locked: the screen lights up on the
    // call, over the lock screen, like a phone call (off again once it's over).
    if (c.direction === 'out' && !screenOnRef.current) BoaCall.wakeForCall();
    // A merged call's picture and sound travel on the channel it was merged into.
    media.join(c.channel ?? c.id, {
      beauty: beautyRef.current,
      controls: controlsRef.current,
      onEvent: (patch) => {
        // The channel names the call: a call that kept going as someone else (a merged call's other person left) is the same one.
        if ((callRef.current?.channel ?? callRef.current?.id) !== (c.channel ?? c.id)) return;
        setVideo((v) => {
          const { gone, joined, videoState, ...rest } = patch;
          // Everyone else in the channel: two or more is a conference.
          let uids = v.uids ?? [];
          if (joined != null && !uids.includes(joined)) uids = [...uids, joined];
          if (gone != null) uids = uids.filter((u) => u !== gone);
          const videos = videoState ? { ...(v.videos ?? {}), [videoState.uid]: videoState.on } : (v.videos ?? {});
          if (uids.length > 1 || (v.uids ?? []).length > 1) {
            // The first person to join stays the big picture; when they leave the next takes over.
            const main = uids.includes(v.remoteUid) ? v.remoteUid : (uids[0] ?? null);
            const { remoteUid: _u, remoteVideo: _v, ...others } = rest;
            return { ...v, ...others, uids, videos, remoteUid: main, remoteVideo: main != null && !!videos[main] };
          }
          // Someone else leaving (a stale uid) doesn't take their picture away.
          if (gone != null && v.remoteUid != null && gone !== v.remoteUid) return { ...v, uids, videos };
          return { ...v, ...rest, uids, videos };
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
      if (c.direction === 'out') {
        reply(c, 'end', { callId: c.id });
        // Their phone may be asleep, ringing by notification: stop that too.
        signal.pushCancel?.(c.peer.id, c.id);
      }
      finish('missed');
    },
    [finish],
  );

  // What a ring says (Realtime): sentAt so a ring delivered late (a phone
  // waking up) only rings for the time it has left.
  const ringPayload = (id, sentAt, voice = false) => ({
    callId: id,
    video: !voice,
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
        signal.send(from.id, 'ring', ringPayload(mine.id, mine.sentAt, mine.voice));
      }
    },
    [goLive],
  );

  // A call that ends here without a word to anyone: its camera, token and ring
  // are let go and the screen is clear for the next. For a call that is over
  // anyway (the same person ringing again) or that has gone to another phone.
  const dropCall = (c) => {
    clearTimers();
    media.reset();
    media.forget(c.id);
    if (c.direction === 'in') stopRingNotification(c.id);
    if (controlsRef.current.privacy) blockScreenshots(false);
    setControls(NO_CONTROLS);
    setVideo(NO_MEDIA);
    callRef.current = null;
    setCall(null);
  };

  // A call is ringing in with nothing else going on: set it up and ring.
  const beginIncoming = useCallback(
    ({ callId, from, video: wantsVideo, device }, ms = RING_MS, { quiet = false } = {}) => {
      clearTimers();
      // The ref too, at once: it can be answered (from the notification) before React renders.
      callRef.current = {
        id: callId,
        peer: from,
        // Which of their phones is calling (they may be signed in on two).
        peerDevice: device ?? undefined,
        direction: 'in',
        phase: 'ringing',
        startedAt: null,
        reason: null,
        sentAt: Date.now() - (RING_MS - ms),
        // A voice call: the caller's ring says video: false.
        voice: wantsVideo === false,
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
    [finish],
  );

  // A second caller while you are on a call: a call waiting. It beeps over the
  // call and the call screen shows the banner (End and accept, Merge, Decline).
  const beginWaiting = useCallback(
    ({ callId, from, video: wantsVideo, device }, ms) => {
      const w = { id: callId, peer: from, peerDevice: device ?? undefined, sentAt: Date.now() - (RING_MS - ms), voice: wantsVideo === false };
      setWaiting(w);
      // They hear "call waiting" instead of silence, and know you're on a call.
      signal.send(from.id, 'waiting', device ? { callId, toDevice: device } : { callId });
      media.warmUp(callId, { engine: false }).catch(() => {});
      setMinimized(false);
      triggerEdgeLighting('call');
      if (onScreen()) startWaitingTone();
      else ringAway({ id: callId, peer: from, sentAt: w.sentAt });
      clearTimeout(waitTimer.current);
      waitTimer.current = setTimeout(() => {
        const now = waitingRef.current;
        if (now?.id !== callId) return;
        clearWaiting();
        // Nobody picked it up in time: it is a missed call, on the shade.
        stopRingNotification(callId);
        triggerEdgeLighting('missed-call');
        notifyMissedCall({ name: from.name, peerId: from.id, sound: chatSoundRef.current });
      }, ms);
    },
    [setWaiting, clearWaiting],
  );

  // The call you were on is over and someone was waiting: theirs rings as a call.
  promoteRef.current = () => {
    const w = waitingRef.current;
    if (!w) return;
    clearWaiting();
    const left = ringLeft(w.sentAt);
    if (left < 2000) return;
    beginIncoming({ callId: w.id, from: w.peer, video: !w.voice, device: w.peerDevice }, left);
  };

  /**
   * Someone is calling: ring, unless it's a call already heard. ms: how long
   * it has left. quiet: it's being answered right now (Answer on the lock
   * screen opened the app), so it doesn't ring at all.
   *
   * Already on a call with someone else, it is a call waiting (a banner over
   * the call, with a beep). Busy is only for a second waiting caller, or when
   * you are still ringing out to somebody else.
   *
   * The same person ringing again is a new attempt: whatever call you had
   * with them is over (their hang up never reached you), so it never turns
   * them away as "on another call" (a missed call, and a call back).
   */
  const ringIn = useCallback(
    ({ callId, from, video: wantsVideo, device }, ms = RING_MS, { quiet = false } = {}) => {
      if (!from?.id || !callId || blockedRef.current.has(from.id) || seen.current.has(callId)) return;
      seen.current.add(callId);
      let current = callRef.current;
      if (stale(current)) {
        expire(current);
        current = null;
      }
      if (current && current.phase !== 'ended') {
        const same = current.peer.id === from.id || (current.legs ?? []).some((l) => l.peer.id === from.id);
        if (current.direction === 'out' && current.phase === 'ringing' && current.peer.id === from.id) {
          crossed(current, callId, from);
          return;
        }
        if (same && !(current.legs ?? []).some((l) => l.peer.id === from.id)) {
          // Their old call is over: this one replaces it.
          dropCall(current);
          current = null;
        } else if (current.phase === 'active' && !same && !waitingRef.current) {
          beginWaiting({ callId, from, video: wantsVideo, device }, ms);
          return;
        } else {
          signal.send(from.id, 'busy', device ? { callId, toDevice: device } : { callId });
          return;
        }
      }
      // Someone waiting from before, now ringing as a plain call, makes room for the new one.
      if (waitingRef.current?.peer.id === from.id) clearWaiting();
      beginIncoming({ callId, from, video: wantsVideo, device }, ms, { quiet });
    },
    [finish, expire, crossed, beginIncoming, beginWaiting, clearWaiting],
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

  // Which of your phones has a call right now (src/calls/presence.js), so this
  // one can offer to take it over. Only asked while this phone has no call of its own.
  const refreshOther = useCallback(async () => {
    if (!userId || (callRef.current && callRef.current.phase !== 'ended')) {
      setOtherPhone(null);
      return;
    }
    const found = await otherPhoneCall(userId);
    // A call may have started here while that was being asked.
    if (callRef.current && callRef.current.phase !== 'ended') return;
    setOtherPhone((cur) => (found && cur?.callId === found.callId && cur.device === found.device ? { ...cur, ...found } : found));
  }, [userId]);

  // Your call's other person left and someone merged in is still there: they are the call now.
  const promoteLeg = useCallback((c) => {
    const [leg, ...rest] = c.legs;
    callRef.current = {
      ...c,
      id: leg.id,
      peer: leg.peer,
      peerDevice: leg.peerDevice,
      // The picture and sound stay on the channel they are all in.
      channel: c.channel ?? c.id,
      legs: rest,
      parties: (c.parties ?? []).filter((x) => x.id !== leg.peer.id),
    };
    setCall(callRef.current);
  }, []);

  // A call waiting follows the app too: on screen it beeps over the call; sent
  // to the background, the notification rings it instead.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const w = waitingRef.current;
      if (!w) return;
      if (state === 'active') {
        stopRingNotification(w.id);
        setMinimized(false);
        startWaitingTone();
      } else if (state === 'background') {
        stopWaitingTone();
        ringAway({ id: w.id, peer: w.peer, sentAt: w.sentAt });
      }
    });
    return () => sub?.remove?.();
  }, []);

  // Signals sent to this phone, over Realtime (the app in the foreground).
  useEffect(() => {
    if (!userId) return undefined;
    return signal.listen(userId, (event, p) => {
      const current = callRef.current;
      if (event === 'ring') {
        // Older apps don't send sentAt: a full ring.
        const left = p.sentAt ? ringLeft(p.sentAt) : RING_MS;
        // The same call already rang here by push, which doesn't say whether
        // it's voice only: this ring does.
        if (current?.id === p.callId && current.direction === 'in' && p.video === false && !current.voice) {
          callRef.current = { ...current, voice: true };
          setCall(callRef.current);
        }
        if (left >= 2000) ringIn(p, left);
        return;
      }

      // Signed in on two phones.
      if (event === 'nudge') {
        // Your other phone started or ended a call: look at which phone has it.
        refreshOther();
        return;
      }
      if (event === 'answered') {
        // This ring was answered or declined on your other phone: stop ringing, quietly.
        seen.current.add(p.callId);
        if (current?.id === p.callId && current.direction === 'in' && current.phase === 'ringing') finish('elsewhere');
        else if (waitingRef.current?.id === p.callId) {
          clearWaiting();
          stopRingNotification(p.callId);
        } else if (pendingCall(p.callId)) stopRingNotification(p.callId);
        return;
      }
      if (event === 'transfer') {
        // Your other phone asks for the call that is live here: let go of it
        // without a word to the other person, and say so.
        if (current?.id === p.callId && current.phase === 'active') {
          finish('transferred');
          signal.send(userId, 'released', { callId: p.callId, toDevice: p.device });
        }
        return;
      }
      if (event === 'released') {
        releasedWait.current?.(p);
        return;
      }
      if (event === 'moved') {
        // They moved the call to their other phone: their answers come from there now.
        if (current?.id === p.callId && p.device) {
          callRef.current = { ...current, peerDevice: p.device };
          setCall(callRef.current);
        }
        return;
      }
      if (event === 'party') {
        // Someone was merged into your call: shown beside the other person.
        if (current?.id === p.callId && p.party?.id) {
          const parties = (current.parties ?? []).filter((x) => x.id !== p.party.id).concat(p.party);
          callRef.current = { ...current, parties };
          setCall(callRef.current);
        }
        return;
      }
      if (event === 'waiting') {
        // They are on a call: yours rings as a call waiting.
        if (current?.id === p.callId && current.direction === 'out' && current.phase === 'ringing') {
          callRef.current = { ...current, theirsWaiting: true };
          setCall(callRef.current);
        }
        return;
      }

      // They answered a call that's already over here (a late push): tell them.
      if (event === 'accept' && p.by && (!current || p.callId !== current.id)) {
        signal.send(p.by, 'end', p.device ? { callId: p.callId, toDevice: p.device } : { callId: p.callId });
        return;
      }

      // Someone merged into your call hangs up or turns it away: the call carries on without them.
      const leg = current?.legs?.find((l) => l.id === p.callId);
      if (leg && (event === 'end' || event === 'decline')) {
        callRef.current = { ...current, legs: current.legs.filter((l) => l.id !== leg.id), parties: (current.parties ?? []).filter((x) => x.id !== leg.peer.id) };
        setCall(callRef.current);
        return;
      }
      // The caller who was waiting hung up before you chose.
      const w = waitingRef.current;
      if (w && p.callId === w.id && (event === 'end' || event === 'decline')) {
        seen.current.add(w.id);
        clearWaiting();
        stopRingNotification(w.id);
        triggerEdgeLighting('missed-call');
        notifyMissedCall({ name: w.peer.name, peerId: w.peer.id, sound: chatSoundRef.current });
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
      if (event === 'accept' && current.direction === 'out') {
        // Their answer says which of their phones has the call, and, when you
        // were a call waiting they merged in, which call to join.
        if (p.device || p.join) {
          callRef.current = { ...current, peerDevice: p.device ?? current.peerDevice, ...(p.join ? { channel: p.join, merged: true } : null) };
          setCall(callRef.current);
        }
        if (p.join) {
          // Your preview was on your own channel: start over on theirs.
          media.reset();
          media.forget(current.id);
        }
        goLive();
      } else if (event === 'decline') finish('declined');
      else if (event === 'busy') finish('busy');
      else if (event === 'end') {
        if (current.phase === 'active' && current.legs?.length) promoteLeg(current);
        else finish(current.phase === 'ringing' && current.direction === 'in' ? 'missed' : 'ended');
      }
    });
  }, [userId, ringIn, finish, goLive, clearWaiting, promoteLeg, refreshOther]);

  // The same ring by push (supabase/functions/call-push): it wakes the
  // phone when Android has frozen the app. Received with the app open, it
  // rings straight away; tapped (from the background, or from a cold
  // start), it opens the call screen with whatever ring time is left.
  useEffect(() => {
    if (!userId) return undefined;
    const fromPush = (n) => {
      // Stop a ring: the caller hung up, or you answered on your other phone.
      const stop = cancelFromPush(n?.request?.content?.data);
      if (stop) {
        Notifications.dismissNotificationAsync?.(n.request.identifier)?.catch?.(() => {});
        seen.current.add(stop.callId);
        const cur = callRef.current;
        const missed = stop.reason !== 'elsewhere';
        if (cur?.id === stop.callId && cur.direction === 'in' && cur.phase === 'ringing') finish(missed ? 'missed' : 'elsewhere');
        else if (waitingRef.current?.id === stop.callId) {
          const w = waitingRef.current;
          clearWaiting();
          if (missed) notifyMissedCall({ name: w.peer.name, peerId: w.peer.id, sound: chatSoundRef.current });
        }
        if (pendingCall(stop.callId)) stopRingNotification(stop.callId);
        return;
      }
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
  }, [userId, ringIn, finish, clearWaiting]);

  useEffect(
    () => () => {
      clearTimers();
      clearTimeout(waitTimer.current);
      stopWaitingTone();
      media.reset();
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

  /** Calls someone. person: their profile. */
  const startCall = useCallback(
    async (person, { voice = false, roomId = null, onStarted = null } = {}) => {
      const peer = personOf(person);
      if (!peer || !userId || peer.id === userId) return;
      if (stale(callRef.current)) expire(callRef.current);
      if (callRef.current && callRef.current.phase !== 'ended') return;
      // Use the call got ready ahead; if it's still getting ready, say
      // "Preparing call..." on the button and wait for it. A scheduled
      // room (roomId) has its own id, so the one made ahead is left for later.
      const ahead = roomId ? null : primed.current;
      if (!roomId) {
        primed.current = null;
        setPrep('idle');
      }
      if (ahead?.ready) {
        setStarting(true);
        await ahead.ready;
        setStarting(false);
        if (callRef.current && callRef.current.phase !== 'ended') return;
      }
      clearTimers();
      const id = roomId ?? ahead?.id ?? newId();
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
        voice: !!voice,
      };
      setCall(callRef.current);
      setVideo(NO_MEDIA);
      haptics.selection();
      // The scheduled call's host: the call is on, so the room turns 'active' and everyone waiting on the countdown joins.
      onStarted?.(id);
      // Your camera comes on while it rings, so you can check how you look.
      // A voice call has no picture to check: the camera stays off.
      if (voice) {
        controlsRef.current = { ...controlsRef.current, cameraOff: true };
        setControls(controlsRef.current);
      } else media.prepare(id, beautyRef.current).catch(() => {});
      // Realtime reaches a phone with the app open; the push wakes one in a pocket.
      const [live, pushed] = await Promise.all([signal.send(peer.id, 'ring', ringPayload(id, sentAt, voice)), signal.pushRing(peer.id, id)]);
      if (callRef.current?.id !== id) return;
      if (!live && !pushed) return finish('unreachable');
      timers.current.ring = setTimeout(() => {
        signal.send(peer.id, 'end', { callId: id });
        signal.pushCancel?.(peer.id, id);
        finish('missed');
      }, ringLeft(sentAt));
    },
    [userId, finish, expire],
  );

  // Signed in on two phones: this ring is dealt with here, so the other one
  // stops ringing (at once over Realtime; by push if its app is asleep).
  const tellMyPhones = useCallback((callId) => {
    const me = userIdRef.current;
    if (!me) return;
    signal.send(me, 'answered', { callId });
    signal.pushCancel?.(me, callId);
  }, []);

  const accept = useCallback(() => {
    const c = callRef.current;
    if (!c || c.direction !== 'in' || c.phase !== 'ringing') return;
    tellMyPhones(c.id);
    reply(c, 'accept', { callId: c.id, by: userId });
    goLive();
  }, [goLive, userId, tellMyPhones]);

  /**
   * Joins a scheduled room that has started: the link, or the countdown
   * turning 'active'. The room id is the call's id (and Agora's channel), so
   * this is the same call the host rang; the host is told you're here. Rooms
   * need no ring, so it goes straight to the call. Resolves to whether you're
   * in that call now (true also if you already were).
   */
  const joinRoom = useCallback(
    (roomId, host) => {
      const peer = personOf(host);
      if (!roomId || !userId || !peer?.id) return false;
      if (stale(callRef.current)) expire(callRef.current);
      const now = callRef.current;
      if (now && now.phase !== 'ended') {
        if (now.id !== roomId) return false;
        // The host's ring got here first: joining answers it.
        if (now.direction === 'in' && now.phase === 'ringing') accept();
        return true;
      }
      clearTimers();
      // The host's own ring for this room must not ring here as well.
      seen.current.add(roomId);
      stopRingNotification(roomId);
      callRef.current = { id: roomId, peer, direction: 'in', phase: 'ringing', startedAt: null, reason: null, sentAt: Date.now(), voice: false };
      setCall(callRef.current);
      setVideo(NO_MEDIA);
      signal.send(peer.id, 'accept', { callId: roomId, by: userId });
      goLive();
      return true;
    },
    [userId, expire, goLive, accept],
  );

  const decline = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    if (c.direction === 'in' && c.phase === 'ringing') tellMyPhones(c.id);
    reply(c, 'decline', { callId: c.id });
    finish('declined');
  }, [finish, tellMyPhones]);

  const hangUp = useCallback(() => {
    const c = callRef.current;
    if (!c || c.phase === 'ended') return;
    // Anyone merged into the call is told too: hanging up ends it for everyone.
    (c.legs ?? []).forEach((l) => signal.send(l.peer.id, 'end', l.peerDevice ? { callId: l.id, toDevice: l.peerDevice } : { callId: l.id }));
    reply(c, 'end', { callId: c.id });
    // Hung up while it rings: their phone may be asleep and ringing by notification.
    if (c.direction === 'out' && c.phase === 'ringing') signal.pushCancel?.(c.peer.id, c.id);
    finish('ended');
  }, [finish]);

  // ---- Call waiting ----------------------------------------------------
  // You're on a call and someone else rings: a banner over the call, and
  // three choices. Nothing is ever answered by accident: until you choose,
  // your call carries on, and the caller hears "call waiting".

  /** Decline: they hear busy (their call ends "On another call") and it shows as a missed call. */
  const declineWaiting = useCallback(() => {
    const w = waitingRef.current;
    if (!w) return;
    tellMyPhones(w.id);
    signal.send(w.peer.id, 'busy', w.peerDevice ? { callId: w.id, toDevice: w.peerDevice } : { callId: w.id });
    seen.current.add(w.id);
    clearWaiting();
    stopRingNotification(w.id);
    media.forget(w.id);
    notifyMissedCall({ name: w.peer.name, peerId: w.peer.id, sound: chatSoundRef.current });
  }, [clearWaiting, tellMyPhones]);

  /** End and accept: hang up on the call you're on and answer the one waiting. */
  const endAndAccept = useCallback(() => {
    const w = waitingRef.current;
    const c = callRef.current;
    if (!w || !c || c.phase === 'ended') return;
    tellMyPhones(w.id);
    // Hang up the current call (and anyone merged into it), silently on screen: no "Call ended" in between.
    (c.legs ?? []).forEach((l) => signal.send(l.peer.id, 'end', l.peerDevice ? { callId: l.id, toDevice: l.peerDevice } : { callId: l.id }));
    reply(c, 'end', { callId: c.id });
    clearWaiting();
    clearTimers();
    media.reset();
    media.forget(c.id);
    if (controlsRef.current.privacy) blockScreenshots(false);
    controlsRef.current = NO_CONTROLS;
    setControls(NO_CONTROLS);
    setVideo(NO_MEDIA);
    stopRingNotification(w.id);
    callRef.current = {
      id: w.id,
      peer: w.peer,
      peerDevice: w.peerDevice,
      direction: 'in',
      phase: 'ringing',
      startedAt: null,
      reason: null,
      sentAt: Date.now(),
      voice: w.voice,
    };
    setCall(callRef.current);
    reply(callRef.current, 'accept', { callId: w.id, by: userIdRef.current });
    goLive();
  }, [clearWaiting, goLive, tellMyPhones]);

  /**
   * Merge: both calls become one three way conference. The caller who was
   * waiting joins the channel your call is already on; everyone is told who
   * else is there. Hanging up ends it for all three.
   */
  const mergeWaiting = useCallback(() => {
    const w = waitingRef.current;
    const c = callRef.current;
    if (!w || !c || c.phase !== 'active') return;
    tellMyPhones(w.id);
    const channel = c.channel ?? c.id;
    const toNew = (payload) => signal.send(w.peer.id, ...payload);
    // They join your channel; they and your caller are introduced.
    signal.send(w.peer.id, 'accept', { callId: w.id, by: userIdRef.current, join: channel, ...(w.peerDevice ? { toDevice: w.peerDevice } : null) });
    toNew(['party', { callId: w.id, party: c.peer, ...(w.peerDevice ? { toDevice: w.peerDevice } : null) }]);
    reply(c, 'party', { callId: c.id, party: w.peer });
    seen.current.add(w.id);
    clearWaiting();
    stopRingNotification(w.id);
    media.forget(w.id);
    callRef.current = {
      ...c,
      legs: [...(c.legs ?? []), { id: w.id, peer: w.peer, peerDevice: w.peerDevice }],
      parties: [...(c.parties ?? []).filter((x) => x.id !== w.peer.id), w.peer],
    };
    setCall(callRef.current);
    haptics.success();
  }, [clearWaiting, tellMyPhones]);

  // ---- Your other phone -------------------------------------------------
  // The phone with a live call says so (src/calls/presence.js); your other
  // phone offers to take it over the moment you pick it up.

  const live2 = !!call && call.phase === 'active';
  useEffect(() => {
    if (!userId || !live2) return undefined;
    let alive = true;
    let told = false;
    const beat = () =>
      announce(userId, callRef.current).then((ok) => {
        // First time: nudge your other phone, so it asks at once if it is on screen.
        if (ok && alive && !told) {
          told = true;
          signal.send(userId, 'nudge', {});
        }
      });
    beat();
    const id = setInterval(beat, BEAT_MS);
    return () => {
      alive = false;
      clearInterval(id);
      retract(userId).then((ok) => ok && signal.send(userId, 'nudge', {}));
    };
  }, [userId, live2, callId]);

  // Ask whenever this phone comes to the front with no call of its own.
  useEffect(() => {
    if (!userId) return undefined;
    refreshOther();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshOther();
    });
    return () => sub?.remove?.();
  }, [userId, refreshOther, callId]);
  // And keep checking while it is offering, so the offer goes when their call ends.
  const offering = otherPhone?.callId ?? null;
  useEffect(() => {
    if (!offering) return undefined;
    const id = setInterval(refreshOther, BEAT_MS);
    return () => clearInterval(id);
  }, [offering, refreshOther]);
  // Phones that were never told the call ended (a phone that died): the offer lapses on its own.
  useEffect(() => {
    if (!offering) return undefined;
    const id = setTimeout(() => setOtherPhone(null), 40000);
    return () => clearTimeout(id);
  }, [offering, otherPhone?.startedAt]);

  /** The prompt: shown only while this phone is on screen and has no call, and asked once per call. */
  const transferOffer = otherPhone && !call && appState !== 'background' && appState !== 'inactive' && !keptElsewhere.current.has(otherPhone.callId) ? otherPhone : null;

  /** No: leave the call where it is. */
  const keepOnOtherPhone = useCallback(() => {
    setOtherPhone((cur) => {
      if (cur) keptElsewhere.current.add(cur.callId);
      return null;
    });
  }, []);

  /**
   * Yes: the call moves to this phone. The other phone is asked to let go
   * (it leaves without ending anything, so the other person stays on the
   * line), this one joins the same channel with the same clock, and the
   * other person is told which phone to answer to.
   */
  const transferHere = useCallback(async () => {
    const o = otherPhone;
    if (!o || !userId || (callRef.current && callRef.current.phase !== 'ended')) return;
    setTransferring(true);
    try {
      // One uid per account: the other phone has to be out of the channel before this one joins.
      const released = new Promise((resolve) => {
        releasedWait.current = resolve;
      });
      signal.send(userId, 'transfer', { callId: o.callId, toDevice: o.device });
      await Promise.race([released, new Promise((resolve) => setTimeout(resolve, 3500))]);
      releasedWait.current = null;
      if (callRef.current && callRef.current.phase !== 'ended') return;
      clearTimers();
      seen.current.add(o.callId);
      callRef.current = {
        id: o.callId,
        channel: o.channel,
        peer: o.peer,
        direction: 'in',
        phase: 'ringing',
        startedAt: null,
        reason: null,
        sentAt: Date.now(),
        voice: o.voice,
        moved: true,
      };
      setCall(callRef.current);
      setVideo(NO_MEDIA);
      setOtherPhone(null);
      // They answer to this phone from now on.
      signal.send(o.peer.id, 'moved', { callId: o.callId });
      goLive({ startedAt: o.startedAt });
    } finally {
      setTransferring(false);
    }
  }, [otherPhone, userId, goLive]);

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
        if (waitingRef.current?.id === callId) return declineWaiting();
        const p = pendingCall(callId);
        stopRingNotification(callId);
        seen.current.add(callId);
        if (p) signal.send(p.from.id, 'decline', { callId });
      }),
    [decline, declineWaiting],
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
  // Chat brings the app out of the window (native side) onto their chat, the
  // call shrunk to the app's own small window so you can type while it goes on.
  useEffect(
    () =>
      BoaCall.addPipActionListener((action) => {
        if (action === 'mute') toggle('muted');
        else if (action === 'end') hangUp();
        else if (action === 'chat') {
          minimize();
          openChat();
        }
      }),
    [toggle, hangUp, minimize, openChat],
  );

  // Privacy Mode protects THEIR screenshots of YOUR picture too: a screenshot
  // is taken by the phone looking at the picture, so when they turn Privacy on
  // this phone's window goes secure as well (FLAG_SECURE: black in screenshots,
  // recordings and screen sharing) for as long as their privacy is on.
  const remotePrivate = !!call && call.phase === 'active' && !!video.remotePrivacy;
  useEffect(() => {
    if (!remotePrivate) return undefined;
    blockScreenshots(true, 'remote');
    return () => blockScreenshots(false, 'remote');
  }, [remotePrivate]);
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
      previewEnhance,
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
      openChat,
      pip,
      startCall,
      joinRoom,
      accept,
      decline,
      hangUp,
      toggle,
      flipCamera,
      primeCall,
      callPrep: starting ? 'starting' : prep,
      waiting,
      declineWaiting,
      endAndAccept,
      mergeWaiting,
      transferOffer,
      transferring,
      transferHere,
      keepOnOtherPhone,
    }),
    [
      call,
      controls,
      video,
      beauty,
      setBeauty,
      previewBrightness,
      previewContrast,
      previewEnhance,
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
      openChat,
      pip,
      startCall,
      joinRoom,
      accept,
      decline,
      hangUp,
      toggle,
      flipCamera,
      primeCall,
      starting,
      prep,
      waiting,
      declineWaiting,
      endAndAccept,
      mergeWaiting,
      transferOffer,
      transferring,
      transferHere,
      keepOnOtherPhone,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallScreen me={personOf(profile)} />
      <TransferPrompt />
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
