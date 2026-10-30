import { createContext, useContext, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import useReducedMotion from '../hooks/useReducedMotion';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, space } from '../theme';

// Loading, shown as the shape of what's coming: soft blocks where the
// content will be, with one band of light sweeping across them all, so the
// page reads as already laid out instead of waiting on a spinner. The
// sweep is a single shared animation on the UI thread for every block
// inside one <Shimmer>; with reduced motion the blocks hold still.

const SWEEP_MS = 1400;
const Sweep = createContext(null);

/** Wrap a group of <Bone>s: they shimmer together, in one sweep. */
export function Shimmer({ children, style, testID = 'skeleton' }) {
  const still = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    t.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => {
      t.value = 0;
    };
  }, [still, t]);
  return (
    <Sweep.Provider value={still ? null : t}>
      <View style={style} accessibilityRole="progressbar" accessibilityLabel="Loading" testID={testID}>
        {children}
      </View>
    </Sweep.Provider>
  );
}

/** One block: a rounded placeholder the size of the thing it stands for. */
export function Bone({ width = '100%', height = 14, round = radius.sm, style }) {
  const t = useContext(Sweep);
  const sweep = useAnimatedStyle(() => (t ? { transform: [{ translateX: `${interpolate(t.value, [0, 1], [-100, 100])}%` }] } : { opacity: 0 }));
  return (
    <View style={[styles.bone, { width, height, borderRadius: round }, style]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sweep]}>
        <LinearGradient colors={['rgba(246,211,138,0)', 'rgba(246,211,138,0.10)', 'rgba(246,211,138,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

/** Conversation rows while the inbox loads: avatar, name, time, two lines. */
export function ThreadSkeleton({ rows = 4 }) {
  return (
    <Shimmer testID="inbox-skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.thread}>
          <Bone width={64} height={64} round={32} />
          <View style={{ flex: 1, gap: space.sm }}>
            <View style={styles.line}>
              <Bone width={`${45 + ((i * 17) % 25)}%`} height={15} />
              <Bone width={34} height={11} />
            </View>
            <Bone width="90%" height={12} />
            <Bone width={`${50 + ((i * 23) % 30)}%`} height={12} />
          </View>
        </View>
      ))}
    </Shimmer>
  );
}

/** A row of people cards while the Community Pulse loads. */
export function CardRowSkeleton({ cards = 3, width = 148, height = 196 }) {
  return (
    <Shimmer style={styles.cards} testID="pulse-skeleton">
      {Array.from({ length: cards }, (_, i) => (
        <Bone key={i} width={width} height={height} round={radius.xl} />
      ))}
    </Shimmer>
  );
}

/** A conversation opening: bubbles from both sides, shaped like a chat. */
export function MessagesSkeleton() {
  const shapes = [
    [false, '62%', 40],
    [true, '48%', 40],
    [false, '72%', 62],
    [true, '38%', 40],
    [false, '55%', 40],
    [true, '66%', 62],
  ];
  return (
    <Shimmer style={styles.messages} testID="messages-skeleton">
      {shapes.map(([mine, w, h], i) => (
        <Bone key={i} width={w} height={h} round={radius.lg} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', backgroundColor: mine ? 'rgba(226,168,75,0.10)' : undefined }} />
      ))}
    </Shimmer>
  );
}

/** People in a list while it loads: avatar, name, a line under it. */
export function ListSkeleton({ rows = 5, avatar = 48, style, testID = 'list-skeleton' }) {
  return (
    <Shimmer style={[styles.list, style]} testID={testID}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.listRow}>
          <Bone width={avatar} height={avatar} round={avatar / 2} />
          <View style={{ flex: 1, gap: space.sm }}>
            <Bone width={`${40 + ((i * 19) % 30)}%`} height={14} />
            <Bone width={`${55 + ((i * 13) % 30)}%`} height={11} />
          </View>
        </View>
      ))}
    </Shimmer>
  );
}

/** Cards stacked while they load: splits, invoices, forecasts, reports. */
export function CardsSkeleton({ count = 3, height = 112, style, testID = 'cards-skeleton' }) {
  return (
    <Shimmer style={[styles.stack, style]} testID={testID}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { height }]}>
          <Bone width="35%" height={10} />
          <Bone width={`${60 + ((i * 17) % 30)}%`} height={16} />
          <Bone width="85%" height={11} />
        </View>
      ))}
    </Shimmer>
  );
}

/** A grid of square tiles while posts load, three across. */
export function GridSkeleton({ tiles = 6, width, gap = 2, style, testID = 'grid-skeleton' }) {
  const size = width ? Math.floor((width - gap * 2) / 3) : 110;
  return (
    <Shimmer style={[styles.grid, { gap }, style]} testID={testID}>
      {Array.from({ length: tiles }, (_, i) => (
        <Bone key={i} width={size} height={size} round={0} />
      ))}
    </Shimmer>
  );
}

/** Someone's profile opening: the portrait, their name, a line, then their work. */
export function ProfileSkeleton({ width, style, testID = 'profile-skeleton' }) {
  return (
    <Shimmer style={[styles.profile, style]} testID={testID}>
      <Bone width={112} height={112} round={56} />
      <Bone width="46%" height={20} style={{ marginTop: space.lg }} />
      <Bone width="30%" height={12} style={{ marginTop: space.sm }} />
      <Bone width="78%" height={12} style={{ marginTop: space.lg }} />
      <View style={[styles.grid, { gap: 2, marginTop: space.xl, alignSelf: 'stretch' }]}>
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} width={width ? Math.floor((width - 4) / 3) : 110} height={width ? Math.floor((width - 4) / 3) : 110} round={0} />
        ))}
      </View>
    </Shimmer>
  );
}

const DOT_MS = 420;

function Dot({ color, size, delay, still }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    t.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: DOT_MS, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: DOT_MS, easing: Easing.in(Easing.quad) })), -1, false),
    );
    return () => {
      t.value = 0;
    };
  }, [t, delay, still]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + t.value * 0.65, transform: [{ scale: 0.75 + t.value * 0.35 }] }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, boxShadow: `0px 0px ${size}px ${color}` }, style]} />;
}

/**
 * Busy, in the space a spinner took: three dots rising in turn, like a
 * breath. For buttons and footers, where a skeleton has no shape to take.
 */
export function LoadingDots({ color = colors.gold, size = 6, style, testID = 'loading-dots' }) {
  const still = useReducedMotion();
  return (
    <View style={[styles.dots, { gap: size * 0.8 }, style]} accessibilityRole="progressbar" accessibilityLabel="Loading" testID={testID}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} color={color} size={size} delay={i * (DOT_MS / 3)} still={still} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, gap: space.lg, paddingTop: space.lg },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stack: { paddingHorizontal: space.lg, gap: space.md },
  card: { padding: space.lg, gap: space.sm, borderRadius: radius.xl, backgroundColor: colors.surface, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  profile: { alignItems: 'center', paddingTop: space.xl },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 20 },
  bone: { overflow: 'hidden', backgroundColor: 'rgba(243,239,232,0.07)' },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cards: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg },
  messages: { paddingHorizontal: space.lg, gap: space.sm, paddingTop: space.lg },
});
