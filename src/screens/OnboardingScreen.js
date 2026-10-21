import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
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
import { Button, LogoWatermark, Slate, Viewfinder } from '../components/ui';
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
    haptics.selection();
    // Little pop on every toggle, like a chip snapping into place.
    scale.value = withSequence(withTiming(0.92, { duration: 80 }), withSpring(1, { duration: 380, dampingRatio: 0.45 }));
    onToggle(vibe.id);
  };
  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 70).springify().damping(18)} style={style}>
      <Pressable
        onPress={press}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={vibe.label}
        style={[styles.pill, selected && styles.pillOn]}
      >
        <Ionicons name={selected ? 'checkmark-circle' : vibe.icon} size={20} color={selected ? colors.bg : colors.gold} />
        <Text style={[styles.pillText, selected && { color: colors.bg }]}>{vibe.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const STAGE = '#0A0A0A';
const SPOT_Y = 0.64; // the spotlight sits behind the copy, not the empty top

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
      <Svg width={width} height={height}>
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

// Inner shadow: clear in the middle, near-black at the corners.
function Vignette({ width, height }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="vig" cx={width / 2} cy={height * 0.55} r={Math.hypot(width, height) * 0.6} gradientUnits="userSpaceOnUse">
          <Stop offset="0.35" stopColor="#000" stopOpacity={0} />
          <Stop offset="0.75" stopColor="#000" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.92} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#vig)" />
    </Svg>
  );
}

/** First-run "vibe check": welcome, then pick what you're into. */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { completeOnboarding } = useUser();
  const [step, setStep] = useState(0);
  const [vibes, setVibes] = useState([]);

  const toggle = (id) => setVibes((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const contentWidth = Math.min(width - space.xl * 2, 520);

  return (
    <View style={styles.screen}>
      {/* Cinematic stage: a gold spotlight breathing behind the copy, the
          wordmark as a ghost, and a vignette crushing the edges to black. */}
      <Spotlight width={width} height={height} />
      <LogoWatermark
        height={Math.round(Math.min(width * 1.15, 1100) / (1398 / 826))}
        opacity={0.03}
        style={{ left: (width - Math.min(width * 1.15, 1100)) / 2, bottom: Math.max(height * 0.2, 150) }}
      />
      <Vignette width={width} height={height} />
      <Viewfinder inset={16} />

      <View style={[styles.top, { paddingTop: insets.top + space.xl }]}>
        <BoaLogo height={30} />
        <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of 2`}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
      </View>

      <View style={[styles.body, { width: contentWidth, paddingBottom: insets.bottom + space.xxl }]}>
        {step === 0 ? (
          <Animated.View key="welcome" entering={FadeIn.duration(500)} exiting={FadeOut.duration(160)}>
            <Slate dot color={colors.text}>Scene 01 · Take 01</Slate>
            <Animated.Text entering={FadeInDown.delay(100).springify().damping(18)} style={styles.headline}>
              Welcome to BOA.
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(200).springify().damping(18)} style={[type.serif, styles.serifLine]}>
              Best of all networks.
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(300).springify().damping(18)} style={[type.bodyMuted, styles.lede]}>
              Radio, originals, podcasts and the talent behind them, all in one place.
            </Animated.Text>
            <Animated.View entering={FadeInDown.delay(420).springify().damping(18)}>
              <Button label="Get started" icon="arrow-forward" onPress={() => setStep(1)} style={styles.cta} />
            </Animated.View>
          </Animated.View>
        ) : (
          <Animated.View key="vibes" entering={FadeInDown.springify().damping(20)}>
            <Slate dot color={colors.text}>The vibe check</Slate>
            <Text style={styles.headline}>
              What's your <Text style={[type.serif, styles.serifInline]}>vibe?</Text>
            </Text>
            <Text style={[type.bodyMuted, styles.lede]}>Pick as many as you like. We'll set the app up around them.</Text>
            <View style={styles.pills}>
              {VIBES.map((v, i) => (
                <VibePill key={v.id} vibe={v} index={i} selected={vibes.includes(v.id)} onToggle={toggle} />
              ))}
            </View>
            <Button
              label={vibes.length ? "Let's go" : 'Pick at least one'}
              icon="arrow-forward"
              disabled={!vibes.length}
              onPress={() => completeOnboarding(vibes)}
              style={styles.cta}
            />
            <Pressable onPress={() => completeOnboarding([])} hitSlop={10} style={styles.skip} accessibilityRole="button">
              <Text style={styles.skipText}>Skip for now</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: STAGE, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl + 8 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(243,239,232,0.25)' },
  dotOn: { width: 22, backgroundColor: colors.gold },
  body: { flex: 1, justifyContent: 'flex-end', alignSelf: 'center' },
  headline: { fontFamily: fonts.semibold, fontSize: 46, lineHeight: 50, letterSpacing: -2, color: colors.text, marginTop: space.md },
  serifLine: { fontSize: 40, lineHeight: 46, marginTop: 2 },
  serifInline: { fontSize: 50, letterSpacing: -1 },
  lede: { marginTop: space.md, maxWidth: 420 },
  cta: { marginTop: space.xl, alignSelf: 'stretch' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xl },
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
  skip: { alignSelf: 'center', marginTop: space.lg, paddingVertical: 6 },
  skipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textFaint },
});
