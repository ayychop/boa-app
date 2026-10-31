import { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming
} from 'react-native-reanimated';
import useReducedMotion from '../hooks/useReducedMotion';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import BoaLogo from './BoaLogo';
import DriftingFog from './DriftingFog';
import Grain from './Grain';
import { colors } from '../theme';

// The wordmark is vector, drawn at its own aspect ratio inside a box of
// exactly that ratio, so nothing can crop it. It never fills more than 62%
// of the screen's width.
const RATIO = 1398 / 826;
const MAX_LOGO_WIDTH = 240;
// The loading line under the wordmark: a hairline track with a soft gold
// highlight gliding along it.
const LINE_GAP = 28;
const LINE_WIDTH = 72;
const LINE_GLINT = 28;
const LINE_LOOP = 1400;
// The entrance: a long, soft fade while the wordmark eases up from 90%.
const FADE = 1600;
const RISE = 2400;
// When the boot loader dissolves into the app, and how long that takes.
const HOLD = 2700;
const DISSOLVE = 600;
// Hands over no matter what: if an animation callback never arrives (an
// interrupted animation, a busy UI thread), this timer still moves on.
const FAILSAFE = HOLD + DISSOLVE + 400;
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
// The glow is drawn small and scaled up: a soft gradient loses nothing, and
// its bitmap stays tiny.
const GLOW = 96;

/**
 * Cinematic boot. The BOA wordmark fades in slowly while it rises from 90%
 * to full size and a soft gold glow blooms behind it, over faint drifting
 * smoke and film grain; a thin gold loading line glints beneath it. After 2.7s it dissolves
 * and calls onDone; a plain timer guarantees that happens even if an
 * animation callback is lost, so it can never hang. It is its own screen:
 * the app mounts only after it has gone.
 */
export default function Intro({ onDone }) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const logoWidth = Math.round(Math.min(MAX_LOGO_WIDTH, width * 0.62));
  const logoHeight = Math.round(logoWidth / RATIO);

  const fade = useSharedValue(0);
  const rise = useSharedValue(reduceMotion ? 1 : 0.9);
  const glow = useSharedValue(0);
  const line = useSharedValue(0);
  const glint = useSharedValue(0);
  const atmosphere = useSharedValue(0);
  const curtain = useSharedValue(1);

  // onDone once, whichever path gets there first.
  const done = useRef(false);
  const finish = useRef(onDone);
  finish.current = onDone;

  useEffect(() => {
    const leave = () => {
      if (done.current) return;
      done.current = true;
      finish.current();
    };
    // The native splash fades out as the wordmark here fades in.
    SplashScreen.hideAsync().catch(() => {});
    fade.value = withTiming(1, { duration: FADE, easing: EASE_OUT });
    if (!reduceMotion) rise.value = withTiming(1, { duration: RISE, easing: EASE_OUT });
    glow.value = withDelay(400, withTiming(1, { duration: 1800, easing: EASE_IN_OUT }));
    line.value = withDelay(900, withTiming(1, { duration: 700, easing: EASE_OUT }));
    if (!reduceMotion) glint.value = withRepeat(withTiming(1, { duration: LINE_LOOP, easing: EASE_IN_OUT }), -1, false);
    atmosphere.value = withDelay(200, withTiming(1, { duration: 1600, easing: EASE_IN_OUT }));

    const timers = [
      setTimeout(() => {
        curtain.value = withTiming(0, { duration: DISSOLVE, easing: EASE_IN_OUT });
      }, HOLD),
      // Leave as the dissolve ends, from the JS thread rather than an
      // animation callback.
      setTimeout(leave, HOLD + DISSOLVE),
      setTimeout(leave, FAILSAFE),
    ];
    return () => {
      timers.forEach(clearTimeout);
      [fade, rise, glow, line, glint, atmosphere, curtain].forEach(cancelAnimation);
    };
  }, [reduceMotion, fade, rise, glow, line, glint, atmosphere, curtain]);

  const curtainStyle = useAnimatedStyle(() => ({ opacity: curtain.value }));
  const atmosphereStyle = useAnimatedStyle(() => ({ opacity: atmosphere.value }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: rise.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: ((logoWidth * 1.9) / GLOW) * (0.85 + glow.value * 0.15) }],
  }));
  const lineStyle = useAnimatedStyle(() => ({ opacity: line.value, transform: [{ scaleX: 0.4 + line.value * 0.6 }] }));
  const glintStyle = useAnimatedStyle(() => ({
    // Fades in at the start and out at the end of each pass, so the loop
    // never visibly jumps back.
    opacity: Math.sin(glint.value * Math.PI),
    transform: [{ translateX: -LINE_GLINT + glint.value * (LINE_WIDTH + LINE_GLINT) }],
  }));

  return (
    <Animated.View style={[styles.screen, curtainStyle]} accessibilityLabel="BOA Networks" accessibilityRole="image">
      {/* Kept quiet so the wordmark always leads. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, atmosphereStyle]}>
        <DriftingFog width={width} height={height} opacity={0.55} />
        <LinearGradient
          colors={['rgba(226,168,75,0)', 'rgba(226,168,75,0.05)', 'rgba(226,168,75,0)']}
          locations={[0.2, 0.5, 0.8]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Grain width={width} height={height} opacity={0.035} />

      {/* Wordmark and loading line in normal flow, centred by the screen
          itself: no fixed-height parent, no clipping. */}
      <View pointerEvents="none" style={styles.stack}>
        <View style={{ width: logoWidth, height: logoHeight }}>
          <Animated.View style={[styles.glow, { left: logoWidth / 2 - GLOW / 2, top: logoHeight / 2 - GLOW / 2 }, glowStyle]}>
            <Svg width={GLOW} height={GLOW}>
              <Defs>
                <RadialGradient id="intro-glow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={colors.gold} stopOpacity={0.3} />
                  <Stop offset="0.45" stopColor={colors.gold} stopOpacity={0.1} />
                  <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect width={GLOW} height={GLOW} fill="url(#intro-glow)" />
            </Svg>
          </Animated.View>
          <Animated.View style={logoStyle}>
            <BoaLogo height={logoHeight} />
          </Animated.View>
        </View>
        <Animated.View style={[styles.line, lineStyle]} accessibilityLabel="Loading">
          <Animated.View style={[styles.glint, glintStyle]}>
            <LinearGradient
              colors={['rgba(226,168,75,0)', colors.gold, 'rgba(226,168,75,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  // Space above matching the loading line below, so the wordmark itself sits
  // exactly on the centre line.
  stack: { alignItems: 'center', paddingTop: LINE_GAP + 2 },
  glow: { position: 'absolute', width: GLOW, height: GLOW },
  line: {
    marginTop: LINE_GAP,
    width: LINE_WIDTH,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(226,168,75,0.16)',
  },
  glint: { position: 'absolute', top: 0, left: 0, width: LINE_GLINT, height: 2 },
});
