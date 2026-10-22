import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import BoaLogo from './BoaLogo';
import DriftingFog from './DriftingFog';
import Grain from './Grain';
import { Button } from './ui';
import { haptics } from '../utils/haptics';
import { colors, space, type } from '../theme';

// Same size as the native splash's wordmark (imageWidth 220 in app.json), so
// the splash dissolves straight into this.
const LOGO_WIDTH = 220;
const LOGO_HEIGHT = Math.round(LOGO_WIDTH / (1398 / 826));
// The on-air lamp hangs under the wordmark, as on the app icon.
const LAMP_GAP = 22;
const LAMP = 9;
const GROUP_HEIGHT = LOGO_HEIGHT + LAMP_GAP + LAMP;
const GLOW_W = 120;
const GLOW_H = 64;
// Returning listeners: how long the intro holds before it hands over.
const HOLD = 2500;
// First run: when the welcome and "Get started" rise into view.
const CTA_DELAY = 1500;
// Clear space kept between the wordmark and the welcome block.
const BREATHING_ROOM = space.xxl;
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
// Lands with a hint of give and no visible bounce.
const CTA_SPRING = { mass: 1, stiffness: 170, damping: 22 };
// The wordmark makes room for the welcome a touch slower, so it follows.
const MAKE_ROOM_SPRING = { mass: 1.2, stiffness: 120, damping: 24 };

// A band of light travelling through the letters themselves: a moving window
// onto a brighter copy of the wordmark, with soft edges built from six
// nested bands. Plain views and transforms, so it is native-safe everywhere.
const BANDS = [
  { width: 120, opacity: 0.07 },
  { width: 92, opacity: 0.09 },
  { width: 66, opacity: 0.12 },
  { width: 44, opacity: 0.16 },
  { width: 26, opacity: 0.24 },
  { width: 12, opacity: 0.4 },
];
const SHEEN_TRAVEL = LOGO_WIDTH + 140;

function SheenBand({ progress, width, opacity }) {
  const window = useAnimatedStyle(() => ({
    transform: [{ translateX: -70 + progress.value * SHEEN_TRAVEL - width / 2 }],
  }));
  const counter = useAnimatedStyle(() => ({
    transform: [{ translateX: -(-70 + progress.value * SHEEN_TRAVEL - width / 2) }],
  }));
  return (
    <Animated.View style={[styles.band, { width }, window]}>
      <Animated.View style={[styles.bandInner, { opacity }, counter]}>
        <BoaLogo height={LOGO_HEIGHT} color="#FFF4DC" />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Where the wordmark sits once the welcome block is up: the splash position
 * if there is room, else as low as it can go above the block, scaled down
 * when even that isn't enough (a phone on its side).
 */
function placeWordmark(height, top, blockTop) {
  const center = height / 2 - LOGO_HEIGHT / 2 + GROUP_HEIGHT / 2;
  const floor = blockTop - BREATHING_ROOM;
  const scale = Math.min(1, Math.max(0.5, (floor - top) / GROUP_HEIGHT));
  const placed = Math.min(center, floor - (scale * GROUP_HEIGHT) / 2);
  return { lift: placed - center, scale };
}

/**
 * Cinematic boot over drifting smoke and moving film grain. The BOA wordmark
 * rises out of the dark while a band of light sweeps through its letters and
 * a soft gold glow blooms behind it; then the on-air lamp lights.
 *
 * Returning listeners: after 2.5s, once the app is ready behind it, the
 * whole thing dissolves into the app. First run: after 1.5s the welcome and
 * "Get started" spring up from the bottom (the wordmark moves up first if
 * the screen is too short for both), and the button lifts the curtain on
 * the vibe check. `firstRun` is null until the stored profile has loaded.
 * Everything animates on the UI thread.
 */
export default function Intro({ firstRun, onDone }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  // 'cta' at 1.5s (first run's welcome), 'held' at 2.5s (returning listeners).
  const [phase, setPhase] = useState('intro');
  const [blockHeight, setBlockHeight] = useState(0);

  const logo = useSharedValue(0);
  const zoom = useSharedValue(reduceMotion ? 1 : 0.9);
  const fog = useSharedValue(0);
  const sweep = useSharedValue(0);
  const glow = useSharedValue(0);
  const lamp = useSharedValue(0);
  const cta = useSharedValue(0);
  const lift = useSharedValue(0);
  const fit = useSharedValue(1);
  const curtain = useSharedValue(1);

  useEffect(() => {
    // The native splash fades out as the wordmark here fades in.
    SplashScreen.hideAsync().catch(() => {});
    logo.value = withTiming(1, { duration: 1100, easing: EASE_OUT });
    fog.value = withDelay(200, withTiming(1, { duration: 1600, easing: EASE_IN_OUT }));
    glow.value = withDelay(500, withTiming(1, { duration: 1400, easing: EASE_IN_OUT }));
    lamp.value = withDelay(1200, withTiming(1, { duration: 600, easing: EASE_OUT }));
    if (!reduceMotion) {
      zoom.value = withTiming(1, { duration: HOLD, easing: EASE_OUT });
      sweep.value = withDelay(550, withTiming(1, { duration: 1500, easing: EASE_IN_OUT }));
    }
    const timers = [setTimeout(() => setPhase('cta'), CTA_DELAY), setTimeout(() => setPhase('held'), HOLD)];
    return () => timers.forEach(clearTimeout);
  }, [reduceMotion, logo, zoom, fog, sweep, glow, lamp]);

  // Returning listener: dissolve into the app.
  useEffect(() => {
    if (phase !== 'held' || firstRun !== false) return;
    curtain.value = withTiming(0, { duration: 700, easing: EASE_IN_OUT }, (done) => done && scheduleOnRN(onDone));
    // A last breath of push-in as it leaves.
    if (!reduceMotion) zoom.value = withTiming(1.04, { duration: 700, easing: Easing.in(Easing.quad) });
  }, [phase, firstRun, reduceMotion, curtain, zoom, onDone]);

  // First run: once the welcome block has been measured, make room for it and
  // bring it up. It is laid out (invisibly) from the start, so this is exact.
  const blockTop = height - blockHeight;
  const ctaShown = phase !== 'intro' && firstRun === true && blockHeight > 0;
  useEffect(() => {
    if (!ctaShown) return;
    const place = placeWordmark(height, insets.top + space.lg, blockTop);
    if (reduceMotion) {
      lift.value = withTiming(place.lift, { duration: 300 });
      fit.value = withTiming(place.scale, { duration: 300 });
      cta.value = withTiming(1, { duration: 400 });
      return;
    }
    lift.value = withSpring(place.lift, MAKE_ROOM_SPRING);
    fit.value = withSpring(place.scale, MAKE_ROOM_SPRING);
    cta.value = withDelay(place.lift ? 120 : 0, withSpring(1, CTA_SPRING));
  }, [ctaShown, height, blockTop, insets.top, reduceMotion, lift, fit, cta]);

  const start = () => {
    haptics.tap();
    curtain.value = withTiming(0, { duration: 600, easing: EASE_IN_OUT }, (done) => done && scheduleOnRN(onDone));
  };

  const curtainStyle = useAnimatedStyle(() => ({ opacity: curtain.value }));
  const fogStyle = useAnimatedStyle(() => ({ opacity: fog.value }));
  const groupStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }, { scale: fit.value }] }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: logo.value, transform: [{ scale: zoom.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    // Swells with the sweep, then settles to a low ember.
    opacity: glow.value * (0.55 + 0.45 * Math.sin(Math.min(1, sweep.value * 1.1) * Math.PI)),
    transform: [{ scale: 3.4 + glow.value * 0.6 }],
  }));
  const beamWidth = LOGO_WIDTH * 0.8;
  const beamStyle = useAnimatedStyle(() => ({
    // In from the left, out to the right, brightest as it crosses the centre.
    opacity: Math.sin(sweep.value * Math.PI),
    transform: [{ translateX: (sweep.value - 0.5) * (LOGO_WIDTH + beamWidth) * 1.6 }, { rotate: '18deg' }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: lamp.value, transform: [{ scale: 0.6 + lamp.value * 0.4 }] }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, cta.value * 1.4),
    transform: [{ translateY: reduceMotion ? 0 : (1 - cta.value) * 20 }],
  }));

  return (
    <Animated.View style={[styles.screen, curtainStyle]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fogStyle]}>
        <DriftingFog width={width} height={height} />
        {/* A faint warm pool behind the wordmark. */}
        <LinearGradient
          colors={['rgba(226,168,75,0)', 'rgba(226,168,75,0.07)', 'rgba(226,168,75,0)']}
          locations={[0.2, 0.5, 0.8]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Grain width={width} height={height} opacity={0.06} />

      <Animated.View
        pointerEvents="none"
        accessibilityLabel="BOA Networks"
        accessibilityRole="image"
        style={[
          styles.group,
          { top: height / 2 - LOGO_HEIGHT / 2, left: (width - LOGO_WIDTH) / 2 },
          groupStyle,
        ]}
      >
        {/* A soft gold glow, drawn small and scaled up: it has no edges to
            lose, and the bitmap behind it stays tiny. */}
        <Animated.View style={[styles.glow, glowStyle]}>
          <Svg width={GLOW_W} height={GLOW_H}>
            <Defs>
              <RadialGradient id="intro-glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={colors.gold} stopOpacity={0.22} />
                <Stop offset="0.5" stopColor={colors.gold} stopOpacity={0.08} />
                <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={GLOW_W} height={GLOW_H} fill="url(#intro-glow)" />
          </Svg>
        </Animated.View>
        {/* A soft beam of light passing over the wordmark; tall enough that
            its ends are always off screen. */}
        <Animated.View
          style={[
            styles.beam,
            { width: beamWidth, height: height * 1.8, top: LOGO_HEIGHT / 2 - height * 0.9, left: (LOGO_WIDTH - beamWidth) / 2 },
            beamStyle,
          ]}
        >
          <LinearGradient
            colors={['rgba(255,244,220,0)', 'rgba(255,244,220,0.09)', 'rgba(255,244,220,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View style={[styles.logo, logoStyle]}>
          <BoaLogo height={LOGO_HEIGHT} />
          {!reduceMotion && BANDS.map((b) => <SheenBand key={b.width} progress={sweep} width={b.width} opacity={b.opacity} />)}
        </Animated.View>
        <Animated.View style={[styles.dot, dotStyle]} />
      </Animated.View>

      {firstRun && (
        <Animated.View
          onLayout={(e) => setBlockHeight(Math.round(e.nativeEvent.layout.height))}
          pointerEvents={ctaShown ? 'box-none' : 'none'}
          style={[
            styles.welcome,
            {
              paddingBottom: Math.max(insets.bottom, space.lg) + space.xl,
              paddingLeft: insets.left + space.xl,
              paddingRight: insets.right + space.xl,
            },
            ctaStyle,
          ]}
        >
          <View style={styles.welcomeInner}>
            <Text style={[type.serif, styles.tagline]}>Best of all networks.</Text>
            <Text style={[type.bodyMuted, styles.lede]}>Radio, originals, podcasts and the talent behind them, all in one place.</Text>
            <Button label="Get started" icon="arrow-forward" onPress={start} style={styles.cta} />
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, zIndex: 1000 },
  group: { position: 'absolute', width: LOGO_WIDTH, height: GROUP_HEIGHT, alignItems: 'center' },
  glow: { position: 'absolute', top: (LOGO_HEIGHT - GLOW_H) / 2, left: (LOGO_WIDTH - GLOW_W) / 2, width: GLOW_W, height: GLOW_H },
  beam: { position: 'absolute' },
  logo: { width: LOGO_WIDTH, height: LOGO_HEIGHT },
  band: { position: 'absolute', top: 0, left: 0, height: LOGO_HEIGHT, overflow: 'hidden' },
  bandInner: { position: 'absolute', top: 0, left: 0, width: LOGO_WIDTH, height: LOGO_HEIGHT },
  dot: {
    position: 'absolute',
    top: LOGO_HEIGHT + LAMP_GAP,
    width: LAMP,
    height: LAMP,
    borderRadius: LAMP / 2,
    backgroundColor: colors.live,
    boxShadow: `0px 0px 14px ${colors.live}`,
  },
  welcome: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  welcomeInner: { width: '100%', maxWidth: 440 },
  tagline: { fontSize: 38, lineHeight: 44, textAlign: 'center' },
  lede: { marginTop: space.sm, textAlign: 'center' },
  cta: { marginTop: space.xl, alignSelf: 'stretch' },
});
