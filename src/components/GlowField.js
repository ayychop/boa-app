import { StyleSheet, View } from 'react-native';
import Animated, { Extrapolation, FadeIn, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Fog } from './ui';

// How fast the backdrop travels relative to the records (0 = fixed, 1 = locked
// to them). Lower reads as further away.
const GLOW_PARALLAX = 0.35;
const FOG_PARALLAX = 0.12;

function Glow({ index, x, itemWidth, size, color, id }) {
  const style = useAnimatedStyle(() => {
    const d = index + x.get() / itemWidth; // 0 when its record is centred
    return {
      opacity: interpolate(Math.abs(d), [0, 0.9], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: d * itemWidth * GLOW_PARALLAX }],
    };
  });
  // Fade-in on mount lives on the outer view; the parallax opacity on the
  // inner one, so the two never fight over the same property.
  return (
    <Animated.View entering={FadeIn.duration(500)} style={[styles.glow, { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }]}>
      <Animated.View style={style}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={color} stopOpacity={0.6} />
              <Stop offset="0.36" stopColor={color} stopOpacity={0.3} />
              <Stop offset="0.7" stopColor={color} stopOpacity={0.07} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={size} height={size} fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Colour glows behind the record carousel, one per record, each sliding
 * slower than its record so the scene has depth. Glows only exist for
 * stations whose logo gave a usable colour; otherwise the stage stays
 * charcoal. Render it centred on the carousel, underneath it.
 */
export default function GlowField({ items, colorsById, index, x, itemWidth, discSize, centerY, width }) {
  const glowSize = Math.round(discSize * 2.1);
  return (
    <View pointerEvents="none" style={[styles.anchor, { top: centerY, left: width / 2 }]}>
      {items.map((item, i) =>
        Math.abs(i - index) > 2 || !colorsById[item.id] ? null : (
          <Glow key={item.id} id={`glow-${item.id}`} index={i} x={x} itemWidth={itemWidth} size={glowSize} color={colorsById[item.id]} />
        ),
      )}
    </View>
  );
}

/** Full-screen fog plane that drifts at a fraction of the carousel's speed. */
export function FogPlane({ x, width, span }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * FOG_PARALLAX }] }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.fogPlane, { width: width * 2 + span * FOG_PARALLAX, left: -width / 2 }, style]}>
        <Fog opacity={0.09} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fogPlane: { position: 'absolute', top: 0, bottom: 0 },
  anchor: { position: 'absolute', width: 0, height: 0 },
  glow: { position: 'absolute' },
});
