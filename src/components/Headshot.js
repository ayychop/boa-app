import { useEffect, useId, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { ClipPath, Defs, G, LinearGradient as SvgGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import useReducedMotion from '../hooks/useReducedMotion';
import { Fog, Slate } from './ui';
import { withAlpha } from '../utils/color';
import { colors, fonts } from '../theme';
import Panel from './Panel';

function initials(name) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);
// Clear air between the initials' area and the name plate under them.
const PLATE_GAP = 18;
// The sheen: one sweep across the letters, then a rest before the next.
const SWEEP_MS = 1500;
const REST_MS = 2800;

/**
 * The initials in BOA gold, with a band of light that sweeps across the
 * letters like a star catching a spotlight. It's drawn in the letters
 * themselves (a gold gradient and the band, clipped to the text), so it
 * never spills onto the frame. Each person starts at a slightly different
 * moment, so a row of them shimmers in turn. Still gold with reduced motion.
 */
function StarInitials({ text, width, height, fontSize, delay = 0, lift = 0 }) {
  const id = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const band = width * 0.42;
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    sweep.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), withDelay(REST_MS, withTiming(0, { duration: 0 }))), -1, false),
    );
  }, [reduce, delay, sweep]);
  const sheen = useAnimatedProps(() => ({ x: -band + sweep.value * (width + band) }));
  // Capitals sit centred when the baseline is half their cap height below
  // the middle; the italic leans right, so it's nudged back a touch.
  const x = width / 2 - fontSize * 0.03;
  // `lift` raises the letters clear of a name plate under them.
  const y = height / 2 + fontSize * 0.34 - lift;
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <SvgGradient id={`gold${id}`} x1="0" y1="0" x2="0.35" y2="1">
          <Stop offset="0" stopColor="#FBE3A6" />
          <Stop offset="0.45" stopColor={colors.gold} />
          <Stop offset="1" stopColor={colors.goldDeep} />
        </SvgGradient>
        <SvgGradient id={`sheen${id}`} x1="0" y1="0" x2="1" y2="0.25">
          <Stop offset="0" stopColor="#FFF8E6" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFF8E6" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#FFF8E6" stopOpacity="0" />
        </SvgGradient>
        <ClipPath id={`letters${id}`}>
          <SvgText x={x} y={y} fontSize={fontSize} fontFamily={fonts.serif} letterSpacing={-1} textAnchor="middle">
            {text}
          </SvgText>
        </ClipPath>
      </Defs>
      <G clipPath={`url(#letters${id})`}>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#gold${id})`} />
        {reduce ? null : <AnimatedRect animatedProps={sheen} x={-band} y={0} width={band} height={height} fill={`url(#sheen${id})`} />}
      </G>
    </Svg>
  );
}

/**
 * Frosted glass plate along the foot of the frame, so the caption reads over
 * smoke or a photo alike. Real blur on iOS and web; Android gets the same
 * frosted tint without a live blur, which would cost too much in a grid.
 */
function GlassCaption({ kicker, title, highlight, compact, onHeight }) {
  return (
    <View style={[styles.glass, compact && styles.glassCompact]} onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      {Platform.OS === 'android' ? null : <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />}
      <LinearGradient
        colors={['rgba(243,239,232,0.14)', 'rgba(243,239,232,0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={[StyleSheet.absoluteFill, Platform.OS === 'android' && { backgroundColor: 'rgba(12,12,14,0.55)' }]}
      />
      <Slate lines={2}>{kicker}</Slate>
      <Text style={[styles.glassTitle, compact && { fontSize: 14 }, highlight && { color: colors.gold }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  );
}

/**
 * Talent frame. Until real headshots exist it mirrors the site's tinted
 * placeholder, with serif initials so each person still reads as distinct,
 * and smoke that fills the frame edge to edge at any size. Pass `caption`
 * ({ kicker, title, highlight }) to set it on a glass plate in the frame.
 */
export default function Headshot({ person, width, ratio = 4 / 5, round = false, label = true, caption }) {
  const height = round ? width : Math.round(width / ratio);
  // The initials centre in the space above the caption plate.
  const [plate, setPlate] = useState(0);
  return (
    <Panel shimmer={false}
      style={[
        styles.frame,
        { width, height, borderRadius: round ? width / 2 : 14 },
        round && { borderColor: withAlpha(person.tint, 0.4) },
      ]}
    >
      {person.headshot ? (
        <Image source={{ uri: person.headshot }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <>
          <LinearGradient
            colors={[withAlpha(person.tint, 0.44), withAlpha(person.tint, 0.07), 'transparent']}
            locations={[0, 0.5, 1]}
            start={{ x: 0.75, y: 0.1 }}
            end={{ x: 0.2, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Fog opacity={0.32} variant={person.name.length} />
          <View style={[styles.center, caption && !round && { paddingBottom: plate + PLATE_GAP }]} accessible accessibilityLabel={initials(person.name)}>
            <StarInitials
              text={initials(person.name)}
              width={width}
              height={caption && !round ? Math.max(0, height - plate - PLATE_GAP) : height}
              // Never taller than the room above the plate (60% of it), so the letters can't reach the name.
              fontSize={Math.min(width * (round ? 0.42 : 0.34), (caption && !round ? Math.max(0, height - plate - PLATE_GAP) : height) * 0.62)}
              lift={caption && !round ? width * 0.05 + 4 : 0}
              delay={(person.name.length % 7) * 260}
            />
          </View>
          {label && !round && <Slate style={styles.tag}>Headshot · 4:5</Slate>}
        </>
      )}
      {caption && !round && <GlassCaption {...caption} compact={width < 170} onHeight={setPlate} />}
    </Panel>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', top: 12, left: 12, opacity: 0.55 },
  glass: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,239,232,0.22)',
  },
  glassCompact: { left: 6, right: 6, bottom: 6, paddingHorizontal: 10, paddingVertical: 8 },
  glassTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text, letterSpacing: -0.3 },
});
