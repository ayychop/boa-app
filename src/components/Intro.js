import { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
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
// The on-air lamp hangs under the wordmark, as on the app icon.
const LAMP_GAP = 22;
const LAMP = 9;
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
 * to full size, a soft gold glow blooms behind it and the on-air lamp
 * lights, over faint drifting smoke and film grain. After 2.7s it dissolves
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
  const lamp = useSharedValue(0);
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
    lamp.value = withDelay(1300, withTiming(1, { duration: 600, easing: EASE_OUT }));
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
      [fade, rise, glow, lamp, atmosphere, curtain].forEach(cancelAnimation);
    };
  }, [reduceMotion, fade, rise, glow, lamp, atmosphere, curtain]);

  const curtainStyle = useAnimatedStyle(() => ({ opacity: curtain.value }));
  const atmosphereStyle = useAnimatedStyle(() => ({ opacity: atmosphere.value }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: rise.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: ((logoWidth * 1.9) / GLOW) * (0.85 + glow.value * 0.15) }],
  }));
  const lampStyle = useAnimatedStyle(() => ({ opacity: lamp.value, transform: [{ scale: 0.6 + lamp.value * 0.4 }] }));

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

      {/* Wordmark, glow and lamp in normal flow, centred: no fixed-height
          parent, no clipping. */}
      <View pointerEvents="none" style={styles.center}>
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
        <Animated.View style={[styles.lamp, lampStyle]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: GLOW, height: GLOW },
  lamp: {
    marginTop: LAMP_GAP,
    width: LAMP,
    height: LAMP,
    borderRadius: LAMP / 2,
    backgroundColor: colors.live,
    boxShadow: `0px 0px 14px ${colors.live}`,
  },
});
