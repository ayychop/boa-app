import { useEffect, useState } from 'react';
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
  withTiming
} from 'react-native-reanimated';
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

/** The alarm going off: the time, its name, Snooze and Stop. */
export default function AlarmRingingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { ringing, stop, snooze } = useAlarms();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);
  // Closes itself once the alarm is dealt with.
  useEffect(() => {
    if (!ringing && navigation.canGoBack()) navigation.goBack();
  }, [ringing, navigation]);

  const wakeTo = ringing?.sound?.type === 'station' ? `Tuning in ${ringing.sound.station?.name}` : 'Good morning';
  return (
    <View style={styles.screen} testID="alarm-ringing">
      <LinearGradient colors={['#3A2408', '#140D05', colors.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.body, { paddingTop: insets.top + space.xxl }]}>
        <BoaLogo height={26} />
        <View style={styles.center}>
          <Halo />
          <Text style={styles.time} accessibilityRole="timer">
            {formatTime(now.getHours(), now.getMinutes())}
          </Text>
          <Animated.View entering={FadeInDown.delay(200)} style={{ alignItems: 'center' }}>
            <Text style={styles.name}>{ringing?.name ?? 'Alarm'}</Text>
            <Slate color={colors.gold} style={{ marginTop: space.sm }}>
              {wakeTo}
            </Slate>
          </Animated.View>
        </View>
        <View style={[styles.actions, { paddingBottom: insets.bottom + space.xl }]}>
          <Pressable
            onPress={() => {
              haptics.tap();
              snooze();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Snooze for ${SNOOZE_MINUTES} minutes`}
            style={({ pressed }) => [styles.snooze, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <Ionicons name="moon-outline" size={18} color={colors.text} />
            <Text style={styles.snoozeText}>Snooze {SNOOZE_MINUTES} min</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.success();
              stop();
            }}
            accessibilityRole="button"
            accessibilityLabel="Stop alarm"
            testID="alarm-stop"
            style={({ pressed }) => [styles.stop, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <Text style={styles.stopText}>Stop</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: space.xl },
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
