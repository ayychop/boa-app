import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../theme';

// Sky tones per condition: the forecast page's backdrop and the glyph's glow.
export const SKY = {
  sun: ['#3A2408', '#1A1206', '#050506'],
  moon: ['#0D1430', '#080A18', '#050506'],
  partly: ['#2A2414', '#14120C', '#050506'],
  cloud_night: ['#151826', '#0B0C14', '#050506'],
  cloud: ['#1C1E24', '#0F1014', '#050506'],
  rain: ['#0E1C33', '#08101E', '#050506'],
  storm: ['#1B1430', '#0D0A18', '#050506'],
  snow: ['#1E2630', '#10141A', '#050506'],
};

const GLOW = { sun: colors.gold, moon: '#9DB4FF', partly: colors.gold, rain: '#5B8CFF', storm: '#A78BFA', snow: '#DDE8F5' };

function loop(value, duration, easing = Easing.linear, reverse = false) {
  value.value = withRepeat(withTiming(1, { duration, easing }), -1, reverse);
}

// Rays turning slowly round the sun.
function Rays({ size, color }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    loop(t, 24000);
    return () => cancelAnimation(t);
  }, [reduce, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value * 360}deg` }] }));
  const ray = size * 0.16;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {Array.from({ length: 8 }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: size / 2 - 1,
            top: 0,
            width: 2,
            height: ray,
            borderRadius: 1,
            backgroundColor: color,
            opacity: 0.85,
            transform: [{ translateY: size / 2 - ray / 2 }, { rotate: `${i * 45}deg` }, { translateY: -size / 2 + ray / 2 }],
          }}
        />
      ))}
    </Animated.View>
  );
}

// One drop (or flake) falling from under the cloud, on a stagger.
function Drop({ x, delay, size, color, snow }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 0.5 : 0);
  useEffect(() => {
    if (reduce) return;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: snow ? 2200 : 900, easing: Easing.in(Easing.quad) }), -1, false));
    return () => cancelAnimation(t);
  }, [reduce, t, delay, snow]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.1 ? t.value * 10 : 1 - t.value,
    transform: [{ translateY: t.value * size * 0.32 }, { translateX: snow ? Math.sin(t.value * 6) * 2 : -t.value * 2 }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          top: size * 0.62,
          width: snow ? 3.5 : 2,
          height: snow ? 3.5 : size * 0.13,
          borderRadius: 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * The weather, drawn small and alive: a sun with turning rays, a cloud
 * drifting, rain or snow falling from it, lightning flickering. All of it
 * on the UI thread; still under Reduce Motion.
 */
export default function WeatherGlyph({ kind = 'cloud', size = 40, tint = colors.text }) {
  const reduce = useReducedMotion();
  const drift = useSharedValue(0);
  const glow = useSharedValue(0);
  const flash = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    loop(drift, 5200, Easing.inOut(Easing.quad), true);
    loop(glow, 3400, Easing.inOut(Easing.quad), true);
    if (kind === 'storm') {
      flash.value = withRepeat(
        withSequence(withDelay(2600, withTiming(1, { duration: 60 })), withTiming(0, { duration: 140 }), withTiming(0.8, { duration: 50 }), withTiming(0, { duration: 260 })),
        -1,
        false,
      );
    }
    return () => {
      cancelAnimation(drift);
      cancelAnimation(glow);
      cancelAnimation(flash);
    };
  }, [reduce, kind, drift, glow, flash]);

  const cloudStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (drift.value - 0.5) * size * 0.08 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.18 + glow.value * 0.22, transform: [{ scale: 0.9 + glow.value * 0.15 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const glowColor = GLOW[kind] ?? 'rgba(243,239,232,0.5)';
  const sunny = kind === 'sun' || kind === 'partly';
  const night = kind === 'moon' || kind === 'cloud_night';
  const wet = kind === 'rain' || kind === 'storm' || kind === 'snow';
  const cloudy = kind !== 'sun' && kind !== 'moon';

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: size * 0.05, top: size * 0.05, width: size * 0.9, height: size * 0.9, borderRadius: size, backgroundColor: glowColor }, glowStyle]}
      />
      {sunny && (
        <View style={{ position: 'absolute', left: kind === 'partly' ? -size * 0.14 : 0, top: kind === 'partly' ? -size * 0.14 : 0, width: size, height: size }}>
          <Rays size={size} color={colors.gold} />
          <View style={{ position: 'absolute', left: size * 0.3, top: size * 0.3, width: size * 0.4, height: size * 0.4, borderRadius: size, backgroundColor: colors.gold }} />
        </View>
      )}
      {night && (
        <Ionicons
          name="moon"
          size={kind === 'moon' ? size * 0.7 : size * 0.46}
          color="#C9D6FF"
          style={{ position: 'absolute', left: kind === 'moon' ? size * 0.15 : 0, top: kind === 'moon' ? size * 0.15 : 0 }}
        />
      )}
      {cloudy && (
        <Animated.View style={[{ position: 'absolute', left: size * 0.08, top: wet ? size * 0.04 : size * 0.16 }, cloudStyle]}>
          <Ionicons name="cloud" size={size * 0.84} color={tint} />
        </Animated.View>
      )}
      {wet &&
        [0.3, 0.5, 0.7].map((x, i) => (
          <Drop key={x} x={size * x} delay={i * 280} size={size} snow={kind === 'snow'} color={kind === 'snow' ? '#FFFFFF' : '#7FA8FF'} />
        ))}
      {kind === 'storm' && (
        <Animated.View style={[{ position: 'absolute', left: size * 0.4, top: size * 0.52 }, flashStyle]}>
          <Ionicons name="flash" size={size * 0.36} color={colors.gold} />
        </Animated.View>
      )}
    </View>
  );
}
