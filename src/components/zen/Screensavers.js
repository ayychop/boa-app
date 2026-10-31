import { useEffect } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import useReducedMotion from '../../hooks/useReducedMotion';
import { startLoop } from '../../utils/loop';
import { haptics } from '../../utils/haptics';
import { MEDIA_HEADERS, SCENES } from '../../data/sleep';
import { SCREENSAVERS, setScreensaver, useScreensaver } from '../../data/screensavers';
import { colors, fonts, radius, space } from '../../theme';

// The screensaver backdrops other than "The Room". Each is built from one
// shared clock on the UI thread (a few cheap transforms, nothing drawn per
// frame), runs only while `running`, and stops dead when the phone is warm
// or the system asks for reduced motion (useReducedMotion): it then simply
// holds its still composition.

const GLOW = 192;

function Glow({ clock, spec, width, height, id }) {
  const long = Math.max(width, height);
  const scale = (long * spec.size) / GLOW;
  const style = useAnimatedStyle(() => {
    const a = clock.value * Math.PI * 2;
    return {
      transform: [
        { translateX: Math.sin(a * spec.fx + spec.phase) * width * spec.ax },
        { translateY: Math.cos(a * spec.fy + spec.phase) * height * spec.ay },
        { scale: scale * (1 + Math.sin(a + spec.phase) * 0.06) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: width * spec.x - GLOW / 2, top: height * spec.y - GLOW / 2, width: GLOW, height: GLOW }, style]}>
      <Svg width={GLOW} height={GLOW}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={spec.color} stopOpacity={spec.alpha} />
            <Stop offset="0.55" stopColor={spec.color} stopOpacity={spec.alpha * 0.35} />
            <Stop offset="1" stopColor={spec.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={GLOW} height={GLOW} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

const AURORA = [
  { x: 0.25, y: 0.3, size: 1.1, ax: 0.18, ay: 0.08, fx: 1, fy: 1, phase: 0, color: '#2FB6A5', alpha: 0.34 },
  { x: 0.8, y: 0.45, size: 1.0, ax: 0.14, ay: 0.12, fx: 1, fy: 2, phase: 2.1, color: '#7A5CE0', alpha: 0.32 },
  { x: 0.5, y: 0.78, size: 0.95, ax: 0.2, ay: 0.06, fx: 2, fy: 1, phase: 4.2, color: '#E2A84B', alpha: 0.26 },
];

function Aurora({ width, height, running, calm }) {
  const clock = useSharedValue(0);
  useEffect(() => {
    if (calm || !running) return;
    return startLoop(clock, 70000, Easing.linear);
  }, [calm, running, clock]);
  return (
    <>
      {AURORA.map((spec, i) => (
        <Glow key={i} id={`saver-aurora-${i}`} clock={clock} spec={spec} width={width} height={height} />
      ))}
    </>
  );
}

const RINGS = 3;
function Ring({ clock, i, size }) {
  const style = useAnimatedStyle(() => {
    const p = (clock.value + i / RINGS) % 1;
    return { opacity: Math.sin(p * Math.PI) * 0.34, transform: [{ scale: 0.3 + p * 0.9 }] };
  });
  return <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, marginLeft: -size / 2, marginTop: -size / 2 }, style]} />;
}

function Halo({ width, height, running, calm }) {
  const clock = useSharedValue(0);
  useEffect(() => {
    if (calm || !running) return;
    return startLoop(clock, 15000, Easing.linear);
  }, [calm, running, clock]);
  const size = Math.min(width, height) * 1.05;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'flex-start' }]}>
      <View style={{ position: 'absolute', left: width / 2, top: height / 2 }}>
        {Array.from({ length: RINGS }, (_, i) => (
          <Ring key={i} i={i} clock={clock} size={size} />
        ))}
      </View>
    </View>
  );
}

// Where each ember starts (fractions across), how big, and how fast it
// climbs (laps per loop) and sways.
const EMBERS = [
  [0.08, 3, 1, 0.0], [0.17, 2, 2, 0.35], [0.26, 4, 1, 0.7], [0.35, 2, 2, 0.12], [0.44, 3, 1, 0.55], [0.53, 2, 2, 0.9],
  [0.62, 4, 1, 0.25], [0.71, 2, 2, 0.6], [0.8, 3, 1, 0.45], [0.89, 2, 2, 0.8], [0.95, 3, 1, 0.15], [0.3, 2, 2, 0.5],
];

function Ember({ clock, spec, width, height }) {
  const [x, size, laps, phase] = spec;
  const style = useAnimatedStyle(() => {
    const p = (clock.value * laps + phase) % 1;
    return {
      opacity: Math.sin(p * Math.PI) * 0.8,
      transform: [{ translateY: height * (1.02 - p * 1.1) }, { translateX: Math.sin((p + phase) * Math.PI * 4) * 14 }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: width * x, top: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: '#F2A25C', boxShadow: '0px 0px 8px 1px rgba(242,162,92,0.7)' }, style]} />;
}

function Embers({ width, height, running, calm }) {
  const clock = useSharedValue(0);
  useEffect(() => {
    if (calm || !running) return;
    return startLoop(clock, 36000, Easing.linear);
  }, [calm, running, clock]);
  return (
    <>
      {/* A low, banked glow under the sparks. */}
      <LinearGradient pointerEvents="none" colors={['rgba(226,115,59,0)', 'rgba(226,115,59,0.16)']} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />
      {EMBERS.map((spec, i) => (
        <Ember key={i} clock={clock} spec={spec} width={width} height={height} />
      ))}
    </>
  );
}

/**
 * The backdrop for a screensaver other than "The Room" (which is the scene
 * itself, drawn by ZenScreen). Always evenly dimmed top and bottom, so the
 * clock and the BOA mark sit on a calm, symmetric field.
 */
export function SaverBackdrop({ id, width, height, running }) {
  const calm = useReducedMotion();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: id === 'midnight' ? '#000' : colors.bg }]} testID={`zen-saver-${id}`}>
      {id === 'aurora' && <Aurora width={width} height={height} running={running} calm={calm} />}
      {id === 'halo' && <Halo width={width} height={height} running={running} calm={calm} />}
      {id === 'ember' && <Embers width={width} height={height} running={running} calm={calm} />}
    </View>
  );
}

/** A gentle, symmetric vignette: dark at both edges, open in the middle. */
export function Vignette({ strength = 1 }) {
  const edge = `rgba(5,5,6,${(0.55 * strength).toFixed(2)})`;
  const mid = `rgba(5,5,6,${(0.18 * strength).toFixed(2)})`;
  return <LinearGradient pointerEvents="none" colors={[edge, mid, mid, edge]} locations={[0, 0.3, 0.7, 1]} style={StyleSheet.absoluteFill} />;
}

// A scene whose video is 4K (it has a step down for decoders that can't). iPhone
// and iPad play a smaller file: Apple's player can't read WebM.
const is4k = (saver) => Platform.OS !== 'ios' && !!saver.scene && !!SCENES[saver.scene]?.video?.fallback;

/** The picker in the Zen controls: a row of tiles, one per screensaver. */
export function ScreensaverPicker() {
  const picked = useScreensaver();
  return (
    <View testID="zen-screensaver-picker">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
        {SCREENSAVERS.map((s) => {
          const on = s.id === picked;
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                haptics.selection();
                setScreensaver(s.id);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={`${s.name} screensaver`}
              accessibilityHint={s.blurb}
              testID={`zen-saver-pick-${s.id}`}
              style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && { transform: [{ scale: 0.96 }] }]}
            >
              <View style={styles.swatch}>
                <LinearGradient colors={s.swatch} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                {/* The video screensavers show their photograph; if it can't load, the swatch stays. */}
                {s.scene && SCENES[s.scene]?.uri ? <Image source={{ uri: SCENES[s.scene].uri, headers: MEDIA_HEADERS }} resizeMode="cover" style={StyleSheet.absoluteFill} fadeDuration={200} /> : null}
                {/* The 4K clips say so. */}
                {is4k(s) ? (
                  <View style={styles.uhd} testID={`zen-saver-4k-${s.id}`}>
                    <Text style={styles.uhdText}>4K</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tileName, on && { color: colors.gold }]} numberOfLines={1}>
                {s.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.blurb} numberOfLines={1}>
        {SCREENSAVERS.find((s) => s.id === picked)?.blurb}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(226,168,75,0.85)' },
  tiles: { gap: space.sm, paddingTop: space.sm },
  tile: { width: 92, padding: 6, gap: 6, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(243,239,232,0.12)', backgroundColor: 'rgba(243,239,232,0.05)' },
  tileOn: { borderColor: colors.gold, backgroundColor: 'rgba(226,168,75,0.1)' },
  swatch: { height: 52, borderRadius: radius.md, overflow: 'hidden' },
  uhd: { position: 'absolute', top: 4, right: 4, paddingHorizontal: 5, height: 15, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(226,168,75,0.7)' },
  uhdText: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1, color: colors.gold },
  tileName: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17, color: colors.text, textAlign: 'center', paddingBottom: 1 },
  blurb: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: space.sm },
});
