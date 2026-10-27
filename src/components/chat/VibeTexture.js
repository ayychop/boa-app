import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, G, Line, Path, Pattern, Rect } from 'react-native-svg';
import Grain from '../Grain';

// The texture layer of a chat vibe (vibe.texture in src/chat/vibes.js),
// drawn over its mesh and lights and under the messages. Vector art, so
// it's sharp at any size and costs almost nothing; anything that moves
// moves by transform or opacity, on the UI thread. `still` (reduced motion,
// and the small previews in the picker) holds every one of them still.

/** A slow, endless rotation: one turn every `ms`. */
function useSpin(ms, still) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    t.value = withRepeat(withTiming(360, { duration: ms, easing: Easing.linear }), -1, false);
    return () => {
      t.value = 0;
    };
  }, [t, ms, still]);
  return useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value}deg` }] }));
}

/** A gentle breath of opacity between lo and hi. */
function useBreath(ms, lo, hi, still) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    t.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t, ms, still]);
  return useAnimatedStyle(() => ({ opacity: lo + (hi - lo) * t.value }));
}

// Turntable: a record turning, half off the bottom right of the screen.
function Vinyl({ width, height, accent, still, mini }) {
  // In the thread it's half off the bottom right; in a preview card the
  // whole record sits in frame, top right, and turns faster.
  const r = mini ? height * 0.46 : width * 0.78;
  const size = r * 2;
  const spin = useSpin(mini ? 4000 : 16000, still);
  const left = mini ? width - r * 1.55 : width * 0.78 - r;
  const top = mini ? -r * 0.35 : height * 0.74 - r;
  const grooves = [];
  for (let g = r * 0.36; g < r * 0.98; g += Math.max(3, r / 46)) grooves.push(g);
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size, left, top }, spin]} testID={mini ? 'vibe-preview-vinyl' : undefined}>
      <Svg width={size} height={size}>
        <Circle cx={r} cy={r} r={r} fill={mini ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.42)'} />
        {grooves.map((g, i) => (
          <Circle key={g} cx={r} cy={r} r={g} stroke={i % 7 === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)'} strokeWidth={1} fill="none" />
        ))}
        {/* Light catching the grooves: arcs, so the turning shows. */}
        <Circle cx={r} cy={r} r={r * 0.7} stroke="rgba(255,240,210,0.16)" strokeWidth={r * 0.5} strokeDasharray={`${r * 0.35} ${r * 4}`} fill="none" />
        <Circle cx={r} cy={r} r={r * 0.3} fill={accent} fillOpacity={mini ? 0.9 : 0.28} />
        <Circle cx={r} cy={r} r={r * 0.3} stroke={accent} strokeOpacity={0.5} strokeWidth={1.5} fill="none" />
        <Path d={`M ${r - r * 0.18} ${r - r * 0.05} L ${r + r * 0.18} ${r - r * 0.05}`} stroke={accent} strokeOpacity={0.45} strokeWidth={2} />
        <Circle cx={r} cy={r} r={Math.max(3, r * 0.025)} fill="rgba(0,0,0,0.8)" />
      </Svg>
    </Animated.View>
  );
}

// Street Luxury: a fine gold lattice, a monogram weave in the dark.
// Bold in a preview card; in the thread it sits back far enough for text.
function GoldWeave({ width, height, still, mini }) {
  const shine = useBreath(6000, 0.75, 1, still);
  const k = mini ? 1 : 0.5;
  const tile = mini ? 18 : 34;
  const h = tile / 2;
  const id = mini ? 'weave-mini' : 'weave';
  return (
    <Animated.View style={[StyleSheet.absoluteFill, shine]}>
      <Svg width={width} height={height}>
        <Defs>
          <Pattern id={id} width={tile} height={tile} patternUnits="userSpaceOnUse">
            <Path d={`M0 ${h} L${h} 0 L${tile} ${h} L${h} ${tile} Z`} stroke="#E2A84B" strokeOpacity={0.55 * k} strokeWidth={mini ? 0.9 : 1.1} fill="#E2A84B" fillOpacity={0.06 * k} />
            <Path d={`M${h} ${h * 0.45} L${h * 1.55} ${h} L${h} ${h * 1.55} L${h * 0.45} ${h} Z`} fill="#F6D38A" fillOpacity={0.45 * k} />
            <Circle cx="0" cy="0" r={mini ? 1 : 1.6} fill="#F6D38A" fillOpacity={0.7 * k} />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id})`} />
      </Svg>
      {/* A band of gold foil catching the light. */}
      <LinearGradient
        colors={['rgba(246,211,138,0)', `rgba(246,211,138,${0.28 * k})`, 'rgba(246,211,138,0)']}
        locations={[0.25, 0.45, 0.65]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

// Afro-Futurism: tribal geometry, zigzags and triangles in gold and violet.
// Bold in a preview card; in the thread it sits back far enough for text.
function Geometric({ width, height, mini }) {
  const k = mini ? 1 : 0.45;
  const id = mini ? 'geo-mini' : 'geo';
  // The tile drawn at half size in a card, so the pattern repeats enough to read.
  const t = mini ? 0.5 : 1;
  const T = 56 * t;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id={id} width={T} height={T} patternUnits="userSpaceOnUse">
          <G scale={t}>
            <Path d="M0 14 L7 7 L14 14 L21 7 L28 14 L35 7 L42 14 L49 7 L56 14" stroke="#F2C14E" strokeOpacity={0.75 * k} strokeWidth={2} fill="none" />
            <Path d="M14 42 L21 28 L28 42 Z M42 42 L49 28 L56 42 Z M0 42 L7 28 L14 42 Z" fill="#B57BFF" fillOpacity={0.4 * k} stroke="#D9B8FF" strokeOpacity={0.6 * k} strokeWidth={1.2} />
            <Path d="M28 42 L35 28 L42 42 Z" fill="#F2C14E" fillOpacity={0.45 * k} />
            <Line x1="0" y1="50" x2="56" y2="50" stroke="#F2C14E" strokeOpacity={0.5 * k} strokeWidth={2} />
            <Circle cx="35" cy="21" r="2.5" fill="#F2C14E" fillOpacity={0.8 * k} />
          </G>
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

// Y2K Luxe: chrome streaks and a scatter of four-point sparkles.
const SPARKLES = [
  [0.18, 0.16, 9],
  [0.82, 0.3, 7],
  [0.3, 0.62, 6],
  [0.7, 0.8, 10],
  [0.9, 0.55, 5],
  [0.08, 0.86, 6],
];
function Chrome({ width, height, still }) {
  const twinkle = useBreath(2600, 0.35, 1, still);
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['rgba(235,240,250,0)', 'rgba(235,240,250,0.12)', 'rgba(235,240,250,0)']}
        locations={[0.3, 0.42, 0.54]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,160,210,0)', 'rgba(255,160,210,0.08)', 'rgba(255,160,210,0)']}
        locations={[0.6, 0.68, 0.76]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, twinkle]}>
        <Svg width={width} height={height}>
          {SPARKLES.map(([x, y, s], i) => (
            <Path
              key={i}
              d={`M ${x * width} ${y * height - s} Q ${x * width} ${y * height} ${x * width + s} ${y * height} Q ${x * width} ${y * height} ${x * width} ${y * height + s} Q ${x * width} ${y * height} ${x * width - s} ${y * height} Q ${x * width} ${y * height} ${x * width} ${y * height - s} Z`}
              fill="#F4F6FB"
              fillOpacity={0.55}
            />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

// Cinema Classic: heavy grain, a projector's flicker and the odd scratch.
function Film({ width, height, still, mini }) {
  const flicker = useBreath(140, 0, 0.022, still);
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Heavy grain; held still in a preview card (one textured tile, cheap). */}
      <Grain width={width} height={height} opacity={mini ? 0.45 : 0.16} running={!still && !mini} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }, flicker]} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Line x1={width * 0.23} y1="0" x2={width * 0.235} y2={height} stroke="#FFFFFF" strokeOpacity={0.06} strokeWidth={1} />
        <Line x1={width * 0.71} y1={height * 0.1} x2={width * 0.705} y2={height * 0.7} stroke="#FFFFFF" strokeOpacity={0.05} strokeWidth={0.8} />
        {/* A preview card is a frame of film: sprocket holes top and bottom. */}
        {mini
          ? Array.from({ length: Math.ceil(width / 12) }, (_, i) => (
              <G key={i}>
                <Rect x={i * 12 + 3} y={3} width={6} height={5} rx={1} fill="#F2F2F2" fillOpacity={0.55} />
                <Rect x={i * 12 + 3} y={height - 8} width={6} height={5} rx={1} fill="#F2F2F2" fillOpacity={0.55} />
              </G>
            ))
          : null}
      </Svg>
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.4)']} locations={[0, 0.18, 0.8, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

// Golden Hour: sun rays fanning from the top right, swaying a little.
function Rays({ width, height, still }) {
  const sway = useBreath(9000, 0.55, 1, still);
  const cx = width * 0.85;
  const rays = [-62, -48, -36, -24, -12];
  const len = Math.hypot(width, height) * 1.1;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, sway]}>
      <Svg width={width} height={height}>
        {rays.map((deg, i) => {
          const a = ((180 + deg) * Math.PI) / 180;
          const b = ((180 + deg + 5) * Math.PI) / 180;
          return (
            <Path
              key={deg}
              d={`M ${cx} -20 L ${cx + Math.cos(a) * len} ${-20 - Math.sin(a) * len} L ${cx + Math.cos(b) * len} ${-20 - Math.sin(b) * len} Z`}
              fill="#FFC56B"
              fillOpacity={0.05 + (i % 2) * 0.025}
            />
          );
        })}
      </Svg>
    </Animated.View>
  );
}

// Cyberpunk: scanlines over everything and a band of interference.
function Scanlines({ width, height, still }) {
  const glitch = useBreath(3400, 0, 1, still);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
            <Rect width="4" height="1.2" fill="#000000" fillOpacity={0.28} />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill="url(#scan)" />
      </Svg>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: height * 0.38, height: 2, backgroundColor: 'rgba(0,229,255,0.18)' }, glitch]} />
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: height * 0.38 + 5, height: 1, backgroundColor: 'rgba(255,42,77,0.2)' }, glitch]} />
    </View>
  );
}

// The Block: concrete slabs with seams, cracks and grit, under a streetlight.
function Concrete({ width, height, still, mini }) {
  const slab = Math.max(60, width / 2.6);
  const seams = [];
  for (let y = slab; y < height; y += slab) seams.push(y);
  return (
    <View style={StyleSheet.absoluteFill}>
      {mini ? null : <Grain width={width} height={height} opacity={0.14} running={!still} />}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {[0.15, 0.55, 0.85].map((x, i) => (
          <Circle key={x} cx={x * width} cy={(0.2 + i * 0.3) * height} r={width * (0.3 + i * 0.08)} fill={i % 2 ? '#000000' : '#FFFFFF'} fillOpacity={0.035} />
        ))}
        {seams.map((y) => (
          <G key={y}>
            <Line x1="0" y1={y} x2={width} y2={y} stroke="#000000" strokeOpacity={0.3} strokeWidth={1.2} />
            <Line x1="0" y1={y + 1.5} x2={width} y2={y + 1.5} stroke="#FFFFFF" strokeOpacity={0.05} strokeWidth={1} />
          </G>
        ))}
        <Line x1={width * 0.5} y1="0" x2={width * 0.5} y2={height} stroke="#000000" strokeOpacity={0.22} strokeWidth={1} />
        <Path d={`M ${width * 0.12} ${height * 0.3} l 14 10 l -6 16 l 18 12 l 4 20`} stroke="#000000" strokeOpacity={0.35} strokeWidth={1} fill="none" />
        <Path d={`M ${width * 0.78} ${height * 0.62} l -10 12 l 8 14 l -14 18`} stroke="#000000" strokeOpacity={0.3} strokeWidth={1} fill="none" />
      </Svg>
    </View>
  );
}

const TEXTURES = { vinyl: Vinyl, gold: GoldWeave, geo: Geometric, chrome: Chrome, film: Film, rays: Rays, scan: Scanlines, concrete: Concrete };

export default function VibeTexture({ vibe, width, height, still = false, mini = false }) {
  const Texture = TEXTURES[vibe?.texture];
  if (!Texture || !width || !height) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} testID={mini ? undefined : `chat-texture-${vibe.texture}`}>
      <Texture width={width} height={height} accent={vibe.accent} still={still} mini={mini} />
    </View>
  );
}
