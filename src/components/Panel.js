import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import useReducedMotion from '../hooks/useReducedMotion';

// One entrance for every box panel in the app, so a card on Home, a sheet's
// content on Profile and the Zen controls all arrive the same way:
//
//   1. it rises 14px and fades in over 420ms on a long, soft ease-out;
//   2. then one thin sweep of warm light crosses it, once, 1.1s, and is gone.
//
// `index` staggers a stack of panels (60ms apiece, capped at 6) so a screen
// builds top to bottom rather than appearing at once.
//
// Reduced motion, or a warm phone (see useReducedMotion): a plain 160ms
// fade, no rise and no sweep. The panel never animates anything after that:
// there is no loop to drain the battery or add heat.

export const PANEL_EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const PANEL_MS = 420;
export const PANEL_STAGGER_MS = 60;
export const PANEL_SWEEP_MS = 1100;

/** The entering animation for a panel at `index` (also for panels not built from <Panel>). */
export function panelEntering(index = 0, calm = false) {
  if (calm) return FadeIn.duration(160);
  return FadeInDown.delay(Math.min(index, 6) * PANEL_STAGGER_MS)
    .duration(PANEL_MS)
    .easing(PANEL_EASE)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 14 }] });
}

function Sweep({ delay, width }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: PANEL_SWEEP_MS, easing: Easing.bezier(0.4, 0, 0.2, 1) }));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    // Enters with the left edge past the panel's, exits past its right.
    transform: [{ translateX: -width * 0.5 + t.value * width * 1.9 }, { skewX: '-18deg' }],
    // Visible only mid-sweep.
    opacity: Math.sin(Math.min(1, Math.max(0, t.value)) * Math.PI),
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.sweep, { width: width * 0.45 }, style]}>
      <LinearGradient
        colors={['rgba(255,236,190,0)', 'rgba(255,236,190,0.10)', 'rgba(255,236,190,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * A View that arrives the BOA way. Use it wherever a box panel was a View.
 * @param {{ index?: number, shimmer?: boolean, style?: any, children?: any }} props
 */
export default function Panel({ index = 0, shimmer = true, style, children, onLayout, ...rest }) {
  const calm = useReducedMotion();
  const [w, setW] = useState(0);
  const flat = StyleSheet.flatten(style) || {};
  const showSweep = shimmer && !calm && w > 0;
  return (
    <Animated.View
      {...rest}
      entering={panelEntering(index, calm)}
      style={style}
      onLayout={(e) => {
        setW(e.nativeEvent.layout.width);
        onLayout?.(e);
      }}
    >
      {children}
      {showSweep ? (
        // Its own clipped layer, so the sweep follows the panel's corners
        // even where the panel itself doesn't clip its children.
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: flat.borderRadius ?? 0 }]} testID="panel-sweep">
          <Sweep delay={PANEL_MS + Math.min(index, 6) * PANEL_STAGGER_MS} width={w} />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
