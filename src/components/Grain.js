import { useEffect } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Asset } from 'expo-asset';

const grainTile = require('../../assets/grain.png');
// The 256px texture drawn at 128pt, so it stays crisp on 2x and 3x screens.
const TILE = 128;
// Film grain jumps rather than glides: 8 positions a cycle, ~12 per second.
const FRAMES = 8;
const CYCLE = 660;
const OFFSETS = [
  [0, 0],
  [-37, -71],
  [-83, -19],
  [-11, -103],
  [-59, -47],
  [-97, -89],
  [-23, -29],
  [-71, -113],
];

function Tiles({ width, height }) {
  const plane = { position: 'absolute', left: 0, top: 0, width: width + TILE, height: height + TILE };
  if (Platform.OS === 'web') {
    const { uri } = Asset.fromModule(grainTile);
    return <div aria-hidden style={{ ...plane, backgroundImage: `url(${uri})`, backgroundRepeat: 'repeat', backgroundSize: `${TILE}px ${TILE}px` }} />;
  }
  return <Image source={grainTile} resizeMode="repeat" style={plane} />;
}

/**
 * Moving film grain for dark stages. One textured plane, a tile larger than
 * the frame, hops between fixed offsets on the UI thread. Still under
 * Reduce Motion.
 */
export default function Grain({ width, height, opacity = 0.05 }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false);
  }, [reduceMotion, t]);
  const style = useAnimatedStyle(() => {
    const [x, y] = OFFSETS[Math.min(FRAMES - 1, Math.floor(t.value * FRAMES))];
    return { transform: [{ translateX: x }, { translateY: y }] };
  });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity, overflow: 'hidden' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Tiles width={width} height={height} />
      </Animated.View>
    </View>
  );
}
