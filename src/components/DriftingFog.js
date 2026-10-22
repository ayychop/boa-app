import { useEffect } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Asset } from 'expo-asset';

const fogTile = require('../../assets/fog.png');
const TILE = 256;

/** The site's fog texture, tiled across a plane one tile wider than needed. */
function FogTiles({ width, height, opacity }) {
  const plane = { position: 'absolute', left: 0, top: 0, width: width + TILE * 2, height: height + TILE * 2, opacity };
  if (Platform.OS === 'web') {
    const { uri } = Asset.fromModule(fogTile);
    return <div aria-hidden style={{ ...plane, backgroundImage: `url(${uri})`, backgroundRepeat: 'repeat', backgroundSize: `${TILE}px ${TILE}px` }} />;
  }
  return <Image source={fogTile} resizeMode="repeat" style={plane} />;
}

/**
 * One layer of smoke drifting endlessly. It slides exactly one tile and
 * loops, which is seamless because the texture repeats every tile.
 */
function FogLayer({ width, height, opacity, duration, reverse, flip }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [reduceMotion, duration, t]);
  const style = useAnimatedStyle(() => {
    const d = (reverse ? t.value - 1 : -t.value) * TILE;
    return { transform: [{ translateX: d }, { translateY: d * 0.35 }, { scaleX: flip ? -1 : 1 }] };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', left: -TILE / 2, top: -TILE / 2, width: width + TILE * 2, height: height + TILE * 2 }, style]}
    >
      <FogTiles width={width} height={height} opacity={opacity} />
    </Animated.View>
  );
}

/**
 * The site's smoke: two layers of fog drifting across each other at
 * different speeds and directions, so it never visibly repeats. Still under
 * Reduce Motion.
 */
export default function DriftingFog({ width, height, opacity = 1 }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity, overflow: 'hidden' }]}>
      <FogLayer width={width} height={height} opacity={0.1} duration={60000} />
      <FogLayer width={width} height={height} opacity={0.07} duration={38000} reverse flip />
    </View>
  );
}
