import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import BoaLogo from './BoaLogo';
import { colors } from '../theme';

const GOLD_HIGHLIGHT = '#FFE6A8';
const GOLD_SHADOW = '#B8812A';
const INK = '#1A1205';
// From this size up there is room for the wordmark under the play glyph.
const BRANDED_FROM = 72;

/** One ring of gold light swelling out of the button and fading. */
function Halo({ size, delay, still }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.cubic) }), -1, false));
    return () => cancelAnimation(t);
  }, [still, delay, t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - t.value), transform: [{ scale: 1 + t.value * 0.7 }] }));
  return <Animated.View pointerEvents="none" style={[styles.halo, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

/**
 * The BOA play button: a gold disc, lit from the top, with the play glyph
 * and (once it is big enough) the BOA wordmark under it, wrapped in a soft
 * gold glow and two slow rings of light. It is only a picture: put it in a
 * Pressable. The glow holds still under Reduce Motion.
 */
export default function BoaPlayButton({ size = 96, style, testID }) {
  const still = useReducedMotion();
  const branded = size >= BRANDED_FROM;
  const glyph = Math.round(size * (branded ? 0.4 : 0.46));
  const logo = Math.round(size * 0.15);
  return (
    <View style={[{ width: size, height: size }, styles.center, style]} testID={testID} pointerEvents="none">
      {/* The glow behind and around it. */}
      <View style={[styles.glow, { width: size * 1.5, height: size * 1.5, borderRadius: size * 0.75 }]} />
      <Halo size={size} delay={0} still={still} />
      <Halo size={size} delay={1300} still={still} />
      <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
        <LinearGradient colors={[GOLD_HIGHLIGHT, colors.gold, GOLD_SHADOW]} locations={[0, 0.55, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
        {/* The disc's rim catching the light. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: size / 2 }]} />
        <View style={styles.stack}>
          {/* The triangle's weight sits left of its box; a nudge centres it optically. */}
          <Ionicons name="play" size={glyph} color={INK} style={{ marginLeft: Math.round(glyph * 0.1) }} />
          {branded ? (
            <View style={{ marginTop: Math.round(size * 0.03) }}>
              <BoaLogo height={logo} color={INK} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', backgroundColor: 'rgba(226,168,75,0.22)', boxShadow: '0px 0px 54px 18px rgba(226,168,75,0.55)' },
  halo: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,226,160,0.8)' },
  disc: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 10px 36px rgba(226,168,75,0.7)' },
  rim: { borderWidth: 2, borderColor: 'rgba(255,248,230,0.85)' },
  stack: { alignItems: 'center', justifyContent: 'center' },
});
