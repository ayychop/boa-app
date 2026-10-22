import { useEffect } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Asset } from 'expo-asset';

const grainTile = require('../../assets/grain.png');
// The 256px texture drawn at 128pt, so it stays crisp on 2x and 3x screens.
const TILE = 128;
// Film grain jumps rather than glides: 8 positions a cycle, ~12 per second.
const FRAMES = 8;
const CYCLE = 660;
// Where the texture jumps to on each frame (pt), as flat number arrays so
// the per-frame lookup on the UI thread is a plain index.
const OFFSET_X = [0, -37, -83, -11, -59, -97, -23, -71];
const OFFSET_Y = [0, -71, -19, -103, -47, -89, -29, -113];

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
    return () => cancelAnimation(t);
  }, [reduceMotion, t]);
  const style = useAnimatedStyle(() => {
    const i = Math.min(FRAMES - 1, Math.max(0, Math.floor(t.value * FRAMES)));
    return { transform: [{ translateX: OFFSET_X[i] }, { translateY: OFFSET_Y[i] }] };
  });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity, overflow: 'hidden' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Tiles width={width} height={height} />
      </Animated.View>
    </View>
  );
}
