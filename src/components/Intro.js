import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import BoaLogo from './BoaLogo';
import DriftingFog from './DriftingFog';
import { colors } from '../theme';

// Same size as the native splash's wordmark (imageWidth 220 in app.json), so
// the splash dissolves straight into this.
const LOGO_WIDTH = 220;
const LOGO_HEIGHT = Math.round(LOGO_WIDTH / (1398 / 826));
// How long the intro holds before it hands over to the app.
const HOLD = 2500;
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * Cinematic boot: the BOA wordmark rises out of the dark (fading in while
 * scaling 0.9 → 1), a soft beam of light sweeps across it over drifting
 * fog, and the on-air lamp lights underneath. After 2.5s, and once the app
 * is ready behind it, the whole thing fades away to reveal the app.
 * Everything runs on the UI thread.
 */
export default function Intro({ ready, onDone }) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [held, setHeld] = useState(false);

  const logo = useSharedValue(0);
  const zoom = useSharedValue(reduceMotion ? 1 : 0.9);
  const fog = useSharedValue(0);
  const sweep = useSharedValue(0);
  const lamp = useSharedValue(0);
  const curtain = useSharedValue(1);

  useEffect(() => {
    // The native splash fades out as the wordmark here fades in.
    SplashScreen.hideAsync().catch(() => {});
    logo.value = withTiming(1, { duration: 1100, easing: EASE_OUT });
    if (!reduceMotion) zoom.value = withTiming(1, { duration: HOLD, easing: EASE_OUT });
    fog.value = withDelay(200, withTiming(1, { duration: 1600, easing: EASE_IN_OUT }));
    if (!reduceMotion) sweep.value = withDelay(650, withTiming(1, { duration: 1300, easing: EASE_IN_OUT }));
    lamp.value = withDelay(1200, withTiming(1, { duration: 600, easing: EASE_OUT }));
    const id = setTimeout(() => setHeld(true), HOLD);
    return () => clearTimeout(id);
  }, [reduceMotion, logo, zoom, fog, sweep, lamp]);

  useEffect(() => {
    if (!held || !ready) return;
    curtain.value = withTiming(0, { duration: 700, easing: EASE_IN_OUT }, (done) => done && scheduleOnRN(onDone));
    // A last breath of push-in as it leaves.
    if (!reduceMotion) zoom.value = withTiming(1.04, { duration: 700, easing: Easing.in(Easing.quad) });
  }, [held, ready, reduceMotion, curtain, zoom, onDone]);

  const curtainStyle = useAnimatedStyle(() => ({ opacity: curtain.value }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: logo.value, transform: [{ scale: zoom.value }] }));
  const fogStyle = useAnimatedStyle(() => ({ opacity: fog.value }));
  const beamWidth = LOGO_WIDTH * 0.8;
  const sweepStyle = useAnimatedStyle(() => ({
    // In from the left, out to the right, brightest as it crosses the centre.
    opacity: Math.sin(sweep.value * Math.PI),
    transform: [{ translateX: (sweep.value - 0.5) * (LOGO_WIDTH + beamWidth) * 1.6 }, { rotate: '18deg' }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: lamp.value, transform: [{ scale: 0.6 + lamp.value * 0.4 }] }));

  return (
    <Animated.View style={[styles.screen, curtainStyle]} accessibilityLabel="BOA Networks" accessibilityRole="image">
      <Animated.View style={[StyleSheet.absoluteFill, fogStyle]}>
        <DriftingFog width={width} height={height} />
        {/* A faint warm pool behind the wordmark. */}
        <LinearGradient
          colors={['rgba(226,168,75,0)', 'rgba(226,168,75,0.07)', 'rgba(226,168,75,0)']}
          locations={[0.2, 0.5, 0.8]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={styles.center}>
        <Animated.View style={[styles.logo, logoStyle]}>
          <BoaLogo height={LOGO_HEIGHT} />
        </Animated.View>
        {/* A soft beam of light passing over the wordmark; tall enough that
            its ends are always off screen. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.beam, { width: beamWidth, height: height * 1.8, top: -height * 0.4 }, sweepStyle]}
        >
          <LinearGradient
            colors={['rgba(255,244,220,0)', 'rgba(255,244,220,0.09)', 'rgba(255,244,220,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View style={[styles.dot, dotStyle]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, zIndex: 1000 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  logo: { width: LOGO_WIDTH, height: LOGO_HEIGHT },
  beam: { position: 'absolute' },
  // The lamp sits under the wordmark, as on the app icon; absolutely placed
  // so the wordmark stays exactly where the native splash drew it.
  dot: {
    position: 'absolute',
    top: '50%',
    marginTop: LOGO_HEIGHT / 2 + 22,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.live,
    boxShadow: `0px 0px 14px ${colors.live}`,
  },
});
