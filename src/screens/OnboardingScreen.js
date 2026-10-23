import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import BoaLogo from '../components/BoaLogo';
import { Button, Slate, Viewfinder } from '../components/ui';
import { haptics } from '../utils/haptics';
import { colors, fonts, radius, space, type } from '../theme';

export const VIBES = [
  { id: 'afrobeats', label: 'Afrobeats', icon: 'musical-notes' },
  { id: 'rnb-hiphop', label: 'R&B / Hip Hop', icon: 'mic' },
  { id: 'podcasts', label: 'Podcasts', icon: 'headset' },
  { id: 'originals', label: 'BOA Originals', icon: 'film' },
];

function VibePill({ vibe, selected, onToggle, index }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const press = () => {
    onToggle(vibe.id);
    haptics.selection();
    // Little pop on every toggle, like a chip snapping into place.
    scale.value = withSequence(withTiming(0.92, { duration: 80 }), withSpring(1, { duration: 380, dampingRatio: 0.45 }));
  };
  // Three layers, each with one job: the entrance (a layout animation) on
  // the outside, the Pressable that owns the touch, and the pop (an animated
  // transform) on a face inside it that never takes touches. A layout
  // animation and an animated transform on one view fight over it, which
  // can leave the chip drawn in one place and touchable in another.
  return (
    <Animated.View entering={FadeIn.delay(120 + index * 70).duration(420)}>
      <Pressable
        onPress={press}
        hitSlop={6}
        pointerEvents="auto"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={vibe.label}
      >
        <Animated.View pointerEvents="none" style={[styles.pill, selected && styles.pillOn, style]}>
          <Ionicons name={selected ? 'checkmark-circle' : vibe.icon} size={20} color={selected ? colors.bg : colors.gold} />
          <Text style={[styles.pillText, selected && { color: colors.bg }]}>{vibe.label}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const STAGE = '#0A0A0A';
const SPOT_Y = 0.52; // the spotlight sits behind the copy

// Soft gold pool of light behind the text, slowly breathing (scale + opacity,
// ~7s a cycle). Sized in pixels so it stays a circle on a tall phone.
function Spotlight({ width, height }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withRepeat(withTiming(1, { duration: 3500, easing: Easing.bezier(0.45, 0, 0.55, 1) }), -1, true);
  }, [reduceMotion, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.72 + t.value * 0.28,
    transform: [{ scale: 0.96 + t.value * 0.08 }],
  }));
  const r = Math.max(width, height) * 0.55;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={height} pointerEvents="none">
        <Defs>
          <RadialGradient id="spot" cx={width / 2} cy={height * SPOT_Y} r={r} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.gold} stopOpacity={0.17} />
            <Stop offset="0.35" stopColor={colors.gold} stopOpacity={0.06} />
            <Stop offset="0.7" stopColor="#1A1A1A" stopOpacity={0.35} />
            <Stop offset="1" stopColor={STAGE} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#spot)" />
      </Svg>
    </Animated.View>
  );
}

// Inner shadow: clear in the middle, near-black at the corners. Wrapped in
// a view so it can never take a touch on any platform.
function Vignette({ width, height }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} pointerEvents="none">
        <Defs>
          <RadialGradient id="vig" cx={width / 2} cy={height * 0.55} r={Math.hypot(width, height) * 0.6} gradientUnits="userSpaceOnUse">
            <Stop offset="0.35" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.75" stopColor="#000" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.92} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#vig)" />
      </Svg>
    </View>
  );
}

/** First-run "vibe check": pick what you're into. The intro welcomes you first. */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { completeOnboarding } = useUser();
  const [vibes, setVibes] = useState([]);

  const toggle = (id) => setVibes((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const contentWidth = Math.min(width - space.xl * 2, 520);

  return (
    <View style={styles.screen}>
      {/* Cinematic stage: a gold spotlight breathing behind the copy and a
          vignette crushing the edges to black. */}
      <Spotlight width={width} height={height} />
      <Vignette width={width} height={height} />
      <Viewfinder inset={16} />

      <View style={[styles.top, { paddingTop: insets.top + space.xl }]}>
        <BoaLogo height={30} />
        {/* Step one was the intro's welcome. */}
        <View style={styles.dots} accessibilityLabel="Step 2 of 2">
          <View style={styles.dot} />
          <View style={[styles.dot, styles.dotOn]} />
        </View>
      </View>

      {/* Copy is centred in the space under the top bar, with no dead area
          above it; it scrolls when a phone on its side is too short. */}
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentWidth }}>
          <Animated.View key="vibes" entering={FadeIn.duration(500)} pointerEvents="box-none">
            <Slate dot color={colors.text}>The vibe check</Slate>
            <Text style={styles.headline}>
              What's your <Text style={[type.serif, styles.serifInline]}>vibe?</Text>
            </Text>
            <Text style={[type.bodyMuted, styles.lede]}>Pick as many as you like and we'll set the app up around them.</Text>
            <View style={styles.pills}>
              {VIBES.map((v, i) => (
                <VibePill key={v.id} vibe={v} index={i} selected={vibes.includes(v.id)} onToggle={toggle} />
              ))}
            </View>
            {/* Always live: with nothing picked it simply starts with the
                full mix. */}
            <Button label="Get started" icon="arrow-forward" onPress={() => completeOnboarding(vibes)} style={styles.cta} />
            <Text style={styles.hint}>{vibes.length ? `${vibes.length} picked` : 'Nothing picked? You get the full mix.'}</Text>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: STAGE, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl + 8 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(243,239,232,0.25)' },
  dotOn: { width: 22, backgroundColor: colors.gold },
  scroll: { flex: 1, zIndex: 2 },
  body: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  headline: { fontFamily: fonts.semibold, fontSize: 46, lineHeight: 50, letterSpacing: -2, color: colors.text, marginTop: space.md },
  serifInline: { fontSize: 50, letterSpacing: -1 },
  lede: { marginTop: space.md, maxWidth: 420 },
  // A generous pause between the choices and the commit.
  cta: { marginTop: space.xxxl + space.lg, alignSelf: 'stretch' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xxl },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(243,239,232,0.07)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  pillOn: { backgroundColor: colors.gold, borderColor: colors.gold, boxShadow: '0px 8px 24px rgba(226,168,75,0.35)' },
  pillText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  hint: { alignSelf: 'center', marginTop: space.lg, fontFamily: fonts.medium, fontSize: 13, color: colors.textFaint },
});
