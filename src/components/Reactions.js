import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import useReducedMotion from '../hooks/useReducedMotion';
import { BlurView } from 'expo-blur';
import { haptics } from '../utils/haptics';
import { colors } from '../theme';

const REACTIONS = [
  { id: 'fire', emoji: '🔥', label: 'Send fire' },
  { id: 'heart', emoji: '❤️', label: 'Send love' },
];
const BURST = 7;
const LIFETIME_MS = 1900;

const rand = (min, max) => min + Math.random() * (max - min);

// One emoji: pops up from the button, drifts on a gentle arc, spins a little,
// then fades. Transform + opacity only, all on the UI thread.
function Particle({ emoji, delay, reduceMotion }) {
  const p = useSharedValue(0);
  const fade = useSharedValue(1);
  const spec = useRef({
    rise: rand(150, 260),
    drift: rand(-46, 46),
    spin: rand(-28, 28),
    size: rand(0.85, 1.35),
    duration: rand(1100, 1500),
  }).current;

  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: spec.duration, easing: Easing.bezier(0.22, 1, 0.36, 1) }));
    fade.value = withDelay(delay + spec.duration * 0.45, withTiming(0, { duration: spec.duration * 0.55 }));
  }, [delay, fade, p, spec]);

  const style = useAnimatedStyle(() => {
    const t = p.value;
    if (reduceMotion) return { opacity: fade.value * Math.min(1, t * 4) };
    // A quick overshoot on the way out, then settle into the drift.
    const pop = t < 0.18 ? 0.4 + (t / 0.18) * 0.9 : 1.3 - Math.min(0.3, (t - 0.18) * 0.6);
    return {
      opacity: fade.value * Math.min(1, t * 6),
      transform: [
        { translateY: -spec.rise * t },
        { translateX: spec.drift * Math.sin(t * Math.PI * 0.9) },
        { rotate: `${spec.spin * t}deg` },
        { scale: pop * spec.size },
      ],
    };
  });

  return (
    <Animated.Text pointerEvents="none" style={[styles.particle, style]}>
      {emoji}
    </Animated.Text>
  );
}

function ReactionButton({ reaction, onReact }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const press = () => {
    scale.value = withSequence(withTiming(0.8, { duration: 70 }), withSpring(1, { duration: 420, dampingRatio: 0.4 }));
    onReact(reaction);
  };
  return (
    <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={reaction.label} hitSlop={6} testID={`radio-react-${reaction.id}`}>
      <Animated.View style={[styles.button, style]}>
        <Text style={styles.buttonEmoji}>{reaction.emoji}</Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Live reactions for what's playing: a floating glass bar of 🔥 / ❤️ that
 * sends a burst of floating emoji on each tap. onReact('fire' | 'heart')
 * hears each one. Position it with `style`.
 */
export default function Reactions({ style, onReact }) {
  const reduceMotion = useReducedMotion();
  const [bursts, setBursts] = useState([]);
  const timers = useRef([]);
  const heard = useRef(onReact);
  heard.current = onReact;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const react = useCallback(
    ({ id: kind, emoji }) => {
      haptics.tap();
      const id = `${Date.now()}-${Math.random()}`;
      setBursts((b) => [...b, { id, emoji }]);
      // Each burst cleans itself up once its particles have faded.
      timers.current.push(setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), LIFETIME_MS + 400));
      heard.current?.(kind);
    },
    [],
  );

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={[styles.wrap, style]} pointerEvents="box-none">
      <View style={styles.stage} pointerEvents="none">
        {bursts.map((b) =>
          Array.from({ length: reduceMotion ? 1 : BURST }, (_, i) => (
            <Particle key={`${b.id}-${i}`} emoji={b.emoji} delay={i * 45} reduceMotion={reduceMotion} />
          )),
        )}
      </View>
      <View style={styles.bar}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.tint} />
        {REACTIONS.map((r) => (
          <ReactionButton key={r.id} reaction={r} onReact={react} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  stage: { position: 'absolute', bottom: 46, width: 1, height: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  particle: { position: 'absolute', fontSize: 30, width: 44, marginLeft: -22, textAlign: 'center' },
  bar: {
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    boxShadow: '0px 14px 34px rgba(0,0,0,0.55)',
  },
  tint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18,18,22,0.35)' },
  button: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,239,232,0.08)' },
  buttonEmoji: { fontSize: 22, color: colors.text },
});
