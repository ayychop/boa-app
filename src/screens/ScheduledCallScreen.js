import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, FadeOutUp, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useHub } from '../context/HubContext';
import { useCallMaybe } from '../context/CallContext';
import useScheduledRoom from '../hooks/useScheduledRoom';
import useReducedMotion from '../hooks/useReducedMotion';
import { cancelRoom, startRoom } from '../api/scheduledCalls';
import { countdownParts, longDate, clock, roomLink, spokenCountdown, timeOf } from '../calls/schedule';
import { cancelReminder, remindForRow, savedReminders } from '../calls/reminders';
import Text from '../components/ScopedText';
import BoaLogo from '../components/BoaLogo';
import { Avatar } from '../components/kit';
import { Button, Slate } from '../components/ui';
import { LoadingDots } from '../components/Skeleton';
import { haptics } from '../utils/haptics';
import { colors, fonts, space, type } from '../theme';

// The scheduled call's waiting room: BOA gold on black, the time to go in big
// light numerals that roll over each second, who's on the call, and what you
// can do while you wait. It listens to the call (useScheduledRoom), so the
// moment the host starts it, a guest goes straight into the video call, and
// the host sees it too. The room id is the call's id, so this is the same
// call the host rings.

const ROLL_MS = 300;
const ROLL_OUT_MS = 200;

/** The seconds left to the time, re-read a few times a second but only re-rendering when the whole second changes. */
function useTimeLeft(target) {
  const read = () => (Number.isFinite(target) ? Math.ceil((target - Date.now()) / 1000) * 1000 : 0);
  const [left, setLeft] = useState(read);
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    const tick = () => setLeft(Math.ceil((target - Date.now()) / 1000) * 1000);
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [target]);
  return left;
}

/**
 * One numeral. When it changes, the old one rolls up and out while the new
 * one rolls up from below, inside a window the height of the digit, so a
 * second ticks over like a departure board. Still under Reduce Motion (and
 * on a warm phone), and not animated on the first draw.
 */
function Tick({ char, size, color, still, glow }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => setSettled(true), []);
  const animate = settled && !still;
  const h = Math.round(size * 1.18);
  return (
    <View style={{ width: Math.round(size * 0.6), height: h, overflow: 'hidden' }}>
      <Animated.Text
        key={char}
        entering={animate ? FadeInDown.duration(ROLL_MS).easing(Easing.out(Easing.cubic)) : undefined}
        exiting={animate ? FadeOutUp.duration(ROLL_OUT_MS).easing(Easing.in(Easing.quad)) : undefined}
        style={[
          styles.digit,
          { fontSize: size, lineHeight: h, height: h, width: Math.round(size * 0.6), color },
          glow && { textShadowColor: 'rgba(226,168,75,0.55)', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
        ]}
        allowFontScaling={false}
      >
        {char}
      </Animated.Text>
    </View>
  );
}

function Unit({ unit, size, color, still, glow }) {
  return (
    <View style={styles.unit} testID={`countdown-${unit.id}`} accessible accessibilityLabel={`${Number(unit.value)} ${unit.label.toLowerCase()}`}>
      <View style={styles.digits}>
        {unit.value.split('').map((c, i) => (
          // Keyed by place, so the tens roll on their own and the ones on theirs.
          <Tick key={i} char={c} size={size} color={color} still={still} glow={glow} />
        ))}
      </View>
      <Text style={styles.unitLabel}>{unit.label}</Text>
    </View>
  );
}

/** The countdown: days (when there are any), hours, minutes, seconds. */
function Countdown({ ms, width, still, waiting }) {
  const parts = countdownParts(ms);
  const count = parts.units.length;
  const size = Math.max(40, Math.min(88, Math.floor((width - space.xl * 2) / (1.2 * count + 0.42 * (count - 1)))));
  return (
    <View
      style={styles.countdown}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={parts.done ? 'The call is due' : `The call starts ${spokenCountdown(ms)}`}
      testID="countdown"
    >
      {parts.units.map((u, i) => (
        <View key={u.id} style={styles.countdownItem}>
          {i > 0 ? <Text style={[styles.colon, { fontSize: size * 0.5, marginTop: size * 0.12 }]}>:</Text> : null}
          <Unit unit={u} size={size} color={u.id === 'seconds' ? colors.gold : colors.text} still={still} glow={u.id === 'seconds' && !waiting} />
        </View>
      ))}
    </View>
  );
}

/** A soft gold bloom behind the numbers that slowly breathes. */
function Bloom({ still }) {
  const glow = useSharedValue(0.7);
  useEffect(() => {
    if (still) {
      glow.value = 0.7;
      return;
    }
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.sin) }), withTiming(0.55, { duration: 3600, easing: Easing.inOut(Easing.sin) })), -1, false);
  }, [still, glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="bloom" cx="50%" cy="34%" rx="75%" ry="48%" fx="50%" fy="34%">
            <Stop offset="0" stopColor={colors.gold} stopOpacity="0.2" />
            <Stop offset="0.5" stopColor={colors.gold} stopOpacity="0.055" />
            <Stop offset="1" stopColor={colors.gold} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bloom)" />
      </Svg>
    </Animated.View>
  );
}

/** The two of you, with a fine gold line and a camera between. */
function Pair({ host, guest, me }) {
  const face = (p, fallback) => ({ uri: p?.avatar_url ?? null, name: p?.display_name || p?.username || fallback });
  const a = face(host, 'Host');
  const b = face(guest, 'Guest');
  return (
    <View style={styles.pair} testID="call-pair">
      <View style={styles.face}>
        <Avatar uri={a.uri} name={a.name} size={64} ring />
        <Text style={styles.faceName} numberOfLines={1}>
          {host?.id && host.id === me ? 'You' : a.name}
        </Text>
        <Text style={styles.faceRole}>Host</Text>
      </View>
      <View style={styles.link}>
        <View style={styles.linkLine} />
        <View style={styles.linkDot}>
          <Ionicons name="videocam" size={14} color={colors.gold} />
        </View>
        <View style={styles.linkLine} />
      </View>
      <View style={styles.face}>
        <Avatar uri={b.uri} name={b.name} size={64} ring />
        <Text style={styles.faceName} numberOfLines={1}>
          {guest?.id && guest.id === me ? 'You' : b.name}
        </Text>
        <Text style={styles.faceRole}>Guest</Text>
      </View>
    </View>
  );
}

function Pulse({ label, still }) {
  const o = useSharedValue(1);
  useEffect(() => {
    if (still) return;
    o.value = withRepeat(withSequence(withTiming(0.35, { duration: 900 }), withTiming(1, { duration: 900 })), -1, false);
  }, [still, o]);
  const dot = useAnimatedStyle(() => ({ opacity: still ? 1 : o.value }));
  return (
    <View style={styles.pulse} testID="call-waiting">
      <Animated.View style={[styles.pulseDot, dot]} />
      <Text style={styles.pulseText}>{label}</Text>
    </View>
  );
}

export default function ScheduledCallScreen({ navigation, route }) {
  const roomId = route?.params?.roomId;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const still = useReducedMotion();
  const { userId, stage } = useHub();
  const calls = useCallMaybe();
  const signedIn = stage === 'ready' && !!userId;
  const { state, row, host, guest, error, reload } = useScheduledRoom(roomId, { enabled: signedIn });
  const when = timeOf(row);
  const left = useTimeLeft(when);
  const isHost = !!row && row.host_id === userId;
  const other = isHost ? guest : host;
  const otherName = other?.display_name || (other?.username ? `@${other.username}` : null);

  const [reminded, setReminded] = useState(false);
  const [joinProblem, setJoinProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const joined = useRef(false);

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Tabs');
  }, [navigation]);

  // Whether this phone already has the reminder.
  useEffect(() => {
    let live = true;
    if (roomId) savedReminders().then((m) => live && setReminded(!!m[roomId]));
    return () => {
      live = false;
    };
  }, [roomId]);

  const person = useCallback((p, id) => (p ? { ...p } : { id, display_name: '' }), []);

  // Scenario B, and the live change: when the call is 'active' a guest goes
  // straight in (the countdown turning into the call), once. The host starts
  // it from here (below), so is never joined as a guest.
  useEffect(() => {
    if (state !== 'active' || !calls || !signedIn || !row || isHost || joined.current) return;
    const ok = calls.joinRoom(roomId, person(host, row.host_id));
    if (ok) {
      joined.current = true;
      setJoinProblem(null);
      close();
    } else {
      setJoinProblem("You're on another call. End it to join this one.");
    }
  }, [state, calls, signedIn, row, isHost, roomId, host, person, close]);

  const rejoin = () => {
    if (!calls || !row) return;
    joined.current = false;
    const target = isHost ? person(guest, row.participant_id) : person(host, row.host_id);
    if (calls.joinRoom(roomId, target)) {
      joined.current = true;
      setJoinProblem(null);
      close();
    } else setJoinProblem("You're on another call. End it to join this one.");
  };

  // The host starts the call: the ring goes out with the room's id, and once
  // it's on, the row turns 'active' and everyone waiting joins.
  const start = () => {
    if (!calls || !row || busy) return;
    haptics.tap();
    const mark = () => startRoom(roomId).catch(() => startRoom(roomId).catch((err) => Alert.alert("Couldn't tell everyone", err.message)));
    calls.startCall(person(guest, row.participant_id), {
      roomId,
      onStarted: () => {
        mark();
        close();
      },
    });
  };

  const toggleReminder = async () => {
    haptics.selection();
    if (reminded) {
      await cancelReminder(roomId);
      setReminded(false);
      return;
    }
    const res = await remindForRow(row, otherName);
    if (res.at) setReminded(true);
    else if (res.reason === 'denied') Alert.alert('Notifications are off', 'Turn on notifications for BOA in Settings to get a reminder.');
    else if (res.reason === 'too-soon') Alert.alert('Almost time', "It starts in under a minute, so there's no need for a reminder.");
    else Alert.alert("Couldn't set the reminder", 'Try again in a moment.');
  };

  const share = () =>
    Share.share({ message: `Join my BOA call${Number.isFinite(when) ? ` on ${longDate(when)} at ${clock(when)}` : ''}\n${roomLink(roomId)}` }).catch(() => {});

  const cancel = () =>
    Alert.alert('Cancel this call?', otherName ? `${otherName} will see that it was cancelled.` : 'Everyone will see that it was cancelled.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel call',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await cancelRoom(roomId);
            await cancelReminder(roomId);
            close();
          } catch (err) {
            Alert.alert("Couldn't cancel", err.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  const goSignIn = () => navigation.navigate('HubWelcome', { next: 'back' });

  const due = left <= 0;
  const live = state === 'pending' || state === 'active';

  let body;
  if (stage === 'loading' || (signedIn && state === 'loading')) {
    body = (
      <View style={styles.center} testID="room-loading">
        <LoadingDots color={colors.gold} size={7} />
        <Text style={styles.note}>Opening your call...</Text>
      </View>
    );
  } else if (!signedIn) {
    body = (
      <Animated.View entering={FadeIn.duration(400)} style={styles.center} testID="room-signed-out">
        <Ionicons name="lock-closed-outline" size={30} color={colors.gold} />
        <Text style={styles.headline}>{stage === 'off' ? 'Calls are not set up on this build' : 'Sign in to join'}</Text>
        <Text style={styles.note}>{stage === 'off' ? 'This call needs BOA HUB.' : "This call is waiting for you. Sign in to BOA HUB and it'll be here."}</Text>
        {stage === 'off' ? null : <Button label="Sign in" icon="log-in-outline" onPress={goSignIn} style={styles.cta} testID="room-sign-in" />}
      </Animated.View>
    );
  } else if (state === 'missing' || state === 'error' || state === 'over') {
    const copy =
      state === 'over'
        ? { icon: 'checkmark-done-outline', title: 'This call has ended', note: 'It was already held or cancelled.' }
        : state === 'error'
          ? { icon: 'cloud-offline-outline', title: "Couldn't load the call", note: error || 'Check your connection and try again.' }
          : { icon: 'help-circle-outline', title: "We couldn't find that call", note: 'The link may be wrong, or it was removed.' };
    body = (
      <Animated.View entering={FadeIn.duration(400)} style={styles.center} testID={`room-${state}`}>
        <Ionicons name={copy.icon} size={32} color={colors.gold} />
        <Text style={styles.headline}>{copy.title}</Text>
        <Text style={styles.note}>{copy.note}</Text>
        {state === 'error' ? <Button label="Try again" icon="refresh" onPress={reload} style={styles.cta} testID="room-retry" /> : null}
        <Button label="Back" variant="ghost" onPress={close} style={styles.cta} testID="room-back" />
      </Animated.View>
    );
  } else if (live) {
    const waiting = state === 'pending' && due;
    const active = state === 'active';
    body = (
      <Animated.View entering={FadeIn.duration(500)} style={styles.stage} testID={`room-${state}`}>
        <Slate dot color={colors.gold} style={{ alignSelf: 'center' }}>
          {active ? 'Live now' : 'Scheduled call'}
        </Slate>
        <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
          {otherName ? `Call with ${otherName}` : 'Your BOA call'}
        </Text>
        {Number.isFinite(when) ? (
          <Text style={styles.when} testID="room-when">
            {longDate(when)}  ·  {clock(when)}
          </Text>
        ) : null}

        <View style={styles.numbers}>
          <Countdown ms={left} width={width} still={still} waiting={waiting || active} />
        </View>

        {active ? (
          <Pulse still={still} label={isHost ? 'Your call is live' : 'Joining the call...'} />
        ) : waiting ? (
          <Pulse still={still} label={isHost ? 'It is time. Start when you are ready.' : otherName ? `Waiting for ${otherName} to start` : 'Waiting for the host to start'} />
        ) : (
          <Text style={styles.until}>{spokenCountdown(left)}</Text>
        )}

        <Pair host={host} guest={guest} me={userId} />

        {joinProblem ? (
          <Text style={styles.problem} testID="room-problem">
            {joinProblem}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {isHost ? (
            active ? (
              <Button label="Rejoin call" icon="videocam" onPress={rejoin} style={styles.cta} testID="room-rejoin" />
            ) : (
              <Button label={due ? 'Start call' : 'Start early'} icon="videocam" onPress={start} disabled={busy} style={styles.cta} testID="room-start" />
            )
          ) : active ? (
            <Button label="Join now" icon="videocam" onPress={rejoin} style={styles.cta} testID="room-join" />
          ) : (
            <Button
              label={reminded ? 'Reminder set' : 'Remind me 10 min before'}
              icon={reminded ? 'notifications' : 'notifications-outline'}
              variant={reminded ? 'ghost' : 'primary'}
              onPress={toggleReminder}
              style={styles.cta}
              testID="room-remind"
            />
          )}
          <View style={styles.secondary}>
            <Pressable onPress={share} hitSlop={10} accessibilityRole="button" style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]} testID="room-share">
              <Ionicons name="share-outline" size={16} color={colors.textMuted} />
              <Text style={styles.textButtonLabel}>Share link</Text>
            </Pressable>
            {isHost && !active ? (
              <Pressable onPress={cancel} hitSlop={10} accessibilityRole="button" style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]} testID="room-cancel">
                <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                <Text style={styles.textButtonLabel}>Cancel call</Text>
              </Pressable>
            ) : null}
            {isHost && !active ? (
              <Pressable onPress={toggleReminder} hitSlop={10} accessibilityRole="button" style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]} testID="room-remind-host">
                <Ionicons name={reminded ? 'notifications' : 'notifications-outline'} size={16} color={reminded ? colors.gold : colors.textMuted} />
                <Text style={[styles.textButtonLabel, reminded && { color: colors.gold }]}>{reminded ? 'Reminder on' : 'Remind me'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.lg }]} testID="scheduled-call-screen">
      <Bloom still={still} />
      <View style={styles.top}>
        <Pressable onPress={close} hitSlop={14} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]} testID="room-close">
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <BoaLogo height={26} sheen />
        <View style={styles.close} />
      </View>
      <View style={styles.main}>{body}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm, height: 56 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl },
  stage: { alignItems: 'center' },
  center: { alignItems: 'center', gap: space.md },
  title: { ...type.h1, marginTop: space.md, textAlign: 'center' },
  when: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1.8, color: colors.textMuted, marginTop: space.sm, textTransform: 'uppercase', textAlign: 'center' },
  numbers: { marginTop: space.xxl, marginBottom: space.lg, alignItems: 'center' },
  countdown: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  countdownItem: { flexDirection: 'row', alignItems: 'flex-start' },
  colon: { fontFamily: fonts.extralight, color: colors.gold, opacity: 0.7, marginHorizontal: 4 },
  unit: { alignItems: 'center' },
  digits: { flexDirection: 'row' },
  digit: { position: 'absolute', left: 0, top: 0, fontFamily: fonts.extralight, textAlign: 'center', fontVariant: ['tabular-nums'], letterSpacing: -2, includeFontPadding: false },
  unitLabel: { ...type.slate, fontSize: 9.5, letterSpacing: 2.2, marginTop: 6, color: colors.textMuted },
  until: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted, marginBottom: space.xs },
  pulse: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.xs },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, boxShadow: '0px 0px 10px rgba(226,168,75,0.9)' },
  pulseText: { fontFamily: fonts.medium, fontSize: 14, color: colors.gold },
  pair: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginTop: space.xl, alignSelf: 'stretch' },
  face: { width: 104, alignItems: 'center' },
  faceName: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text, marginTop: space.sm, maxWidth: 104 },
  faceRole: { ...type.slate, fontSize: 9, letterSpacing: 2, marginTop: 2 },
  link: { flex: 1, maxWidth: 120, height: 64, flexDirection: 'row', alignItems: 'center' },
  linkLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(226,168,75,0.45)' },
  linkDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(226,168,75,0.55)', backgroundColor: colors.goldSoft },
  actions: { alignSelf: 'stretch', marginTop: space.xxl, alignItems: 'center', gap: space.lg },
  cta: { alignSelf: 'stretch' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl, flexWrap: 'wrap' },
  textButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  textButtonLabel: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.textMuted },
  headline: { ...type.title, textAlign: 'center', marginTop: space.sm },
  note: { ...type.bodyMuted, textAlign: 'center', maxWidth: 320 },
  problem: { fontFamily: fonts.medium, fontSize: 13.5, color: '#E5806B', textAlign: 'center', marginTop: space.lg },
});
