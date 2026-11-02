import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import useReducedMotion from '../hooks/useReducedMotion';
import { useAlarms } from '../context/AlarmContext';
import { formatTime, SNOOZE_MINUTES } from '../data/alarms';
import BoaLogo from '../components/BoaLogo';
import { Slate } from '../components/ui';
import { haptics } from '../utils/haptics';
import { colors, fonts, radius, space } from '../theme';

// Rings of gold breathing out from the clock, like a sunrise.
function Halo() {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(t);
  }, [reduce, t]);
  const a = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - t.value), transform: [{ scale: 0.7 + t.value * 0.8 }] }));
  const b = useAnimatedStyle(() => {
    const u = (t.value + 0.5) % 1;
    return { opacity: 0.45 * (1 - u), transform: [{ scale: 0.7 + u * 0.8 }] };
  });
  return (
    <View pointerEvents="none" style={styles.haloWrap}>
      <Animated.View style={[styles.halo, a]} />
      <Animated.View style={[styles.halo, b]} />
    </View>
  );
}

// The pop-up rises into place on a soft spring (the card, then the buttons one
// after another), and on dismissal slides down and fades over this long before
// the screen leaves. The sound stops the instant a button is touched, not
// when the animation ends.
export const POP_IN = { damping: 17, stiffness: 150, mass: 0.9 };
export const DISMISS_MS = 280;

/**
 * The alarm going off: the time, its name, Snooze and Stop.
 *
 * Snooze and Stop answer the first touch: they act the moment a finger lands
 * (not when it lifts, which a busy screen can lose), once, with the press
 * itself only a fallback for screen readers. The screen then animates away
 * while the alarm is already quiet.
 */
export default function AlarmRingingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { ringing, stop, snooze } = useAlarms();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);

  // What to show for the moment after the alarm has been dealt with, while the screen animates out.
  const last = useRef(ringing);
  if (ringing) last.current = ringing;
  const alarm = ringing ?? last.current;

  // 0: out of sight, 1: in place. Rises on mount; leaves on dismissal.
  const shown = useSharedValue(0);
  const leaving = useRef(false);
  useEffect(() => {
    shown.value = reduce ? withTiming(1, { duration: 160 }) : withSpring(1, POP_IN);
  }, [reduce, shown]);

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    shown.value = withTiming(0, { duration: reduce ? 120 : DISMISS_MS, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) scheduleOnRN(close);
    });
  }, [close, reduce, shown]);

  // Dealt with somewhere else (the notification, the lock-screen page): leave too.
  useEffect(() => {
    if (!ringing) leave();
  }, [ringing, leave]);
  // A new alarm after a dismissal starts again.
  useEffect(() => {
    if (ringing) leaving.current = false;
  }, [ringing]);

  const act = useCallback(
    (kind) => {
      if (leaving.current) return;
      if (kind === 'stop') {
        haptics.success();
        stop();
      } else {
        haptics.tap();
        snooze();
      }
      leave();
    },
    [stop, snooze, leave],
  );

  const card = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 48 }, { scale: 0.94 + shown.value * 0.06 }],
  }));

  const wakeTo = alarm?.sound?.type === 'station' ? `Tuning in ${alarm.sound.station?.name}` : 'Good morning';
  return (
    <View style={styles.screen} testID="alarm-ringing">
      <LinearGradient colors={['#3A2408', '#140D05', colors.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.body, { paddingTop: insets.top + space.xxl }, card]}>
        <BoaLogo height={26} />
        <View style={styles.center}>
          <Halo />
          <Text style={styles.time} accessibilityRole="timer">
            {formatTime(now.getHours(), now.getMinutes())}
          </Text>
          <Animated.View entering={FadeInDown.delay(200).springify().damping(18)} style={{ alignItems: 'center' }}>
            <Text style={styles.name}>{alarm?.name ?? 'Alarm'}</Text>
            <Slate color={colors.gold} style={{ marginTop: space.sm }}>
              {wakeTo}
            </Slate>
          </Animated.View>
        </View>
        <View style={[styles.actions, { paddingBottom: insets.bottom + space.xl }]}>
          <Animated.View entering={FadeInDown.delay(320).springify().damping(18)}>
            <Pressable
              onPressIn={() => act('snooze')}
              onPress={() => act('snooze')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Snooze for ${SNOOZE_MINUTES} minutes`}
              testID="alarm-snooze"
              style={({ pressed }) => [styles.snooze, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <Ionicons name="moon-outline" size={18} color={colors.text} />
              <Text style={styles.snoozeText}>Snooze {SNOOZE_MINUTES} min</Text>
            </Pressable>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(420).springify().damping(18)}>
            <Pressable
              onPressIn={() => act('stop')}
              onPress={() => act('stop')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Stop alarm"
              testID="alarm-stop"
              style={({ pressed }) => [styles.stop, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <Text style={styles.stopText}>Stop</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: space.xl, alignSelf: 'stretch' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  haloWrap: { position: 'absolute', width: 320, height: 320, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 300, height: 300, borderRadius: 150, borderWidth: 2, borderColor: colors.gold },
  time: { fontFamily: fonts.extralight, fontSize: 96, letterSpacing: -4, color: colors.text, fontVariant: ['tabular-nums'] },
  name: { fontFamily: fonts.semibold, fontSize: 24, letterSpacing: -0.6, color: colors.text, marginTop: space.lg },
  actions: { alignSelf: 'stretch', gap: space.md },
  snooze: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(243,239,232,0.08)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  snoozeText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  stop: { height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  stopText: { fontFamily: fonts.bold, fontSize: 18, color: colors.bg, letterSpacing: -0.2 },
});
