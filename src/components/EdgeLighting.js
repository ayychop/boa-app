import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Notifications from 'expo-notifications';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import useReducedMotion from '../hooks/useReducedMotion';
import { isEdgeLightingOn, onEdgePulse, useEdgeLighting } from '../data/edgeLighting';

// Edge Lighting. A notification arrives while BOA is open and a band of gold
// light runs once around the rim of the screen, with a soft glow along the
// edges that swells and fades behind it. 1.9 seconds, then nothing is
// left running: no loop, no timer.
//
// Reduced motion, or a warm phone (see useReducedMotion): no travelling
// light, just the edge glow breathing once.
//
// It never takes a touch (pointerEvents none) and sits above everything,
// calls included.

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export const EDGE_PULSE_MS = 1900;
const GOLD = '#E2A84B';
const BRIGHT = '#FFE3A0';
// The corner radius of the light's path: close to a phone's own screen corner.
const CORNER = 38;

// Notifications that aren't news: a call has its own screen, an alarm too.
const quiet = (n) => {
  const type = n?.request?.content?.data?.type;
  return type === 'call' || !!n?.request?.content?.data?.alarmId;
};

/** The rim of the screen as a path of length `perimeter`, inset by `inset`. */
export function rimOf(width, height, inset = 3, radius = CORNER) {
  const w = Math.max(0, width - inset * 2);
  const h = Math.max(0, height - inset * 2);
  const r = Math.min(radius, w / 2, h / 2);
  return { w, h, r, inset, perimeter: 2 * (w + h) - 8 * r + 2 * Math.PI * r };
}

function EdgeGlow({ width, height, glow }) {
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  const band = 56;
  // Four soft strips, brightest at the very edge and gone by `band` points in.
  const strip = (id, x1, y1, x2, y2) => (
    <SvgGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      <Stop offset="0" stopColor={GOLD} stopOpacity={0.55} />
      <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
    </SvgGradient>
  );
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={height}>
        <Defs>
          {strip('edge-t', '0', '0', '0', '1')}
          {strip('edge-b', '0', '1', '0', '0')}
          {strip('edge-l', '0', '0', '1', '0')}
          {strip('edge-r', '1', '0', '0', '0')}
        </Defs>
        <Rect x={0} y={0} width={width} height={band} fill="url(#edge-t)" />
        <Rect x={0} y={height - band} width={width} height={band} fill="url(#edge-b)" />
        <Rect x={0} y={0} width={band} height={height} fill="url(#edge-l)" />
        <Rect x={width - band} y={0} width={band} height={height} fill="url(#edge-r)" />
      </Svg>
    </Animated.View>
  );
}

function Runner({ width, height, travel, fade }) {
  const { w, h, r, inset, perimeter } = rimOf(width, height);
  const seg = perimeter * 0.3;
  // Three passes of the same band, wide and faint to narrow and bright: a glow with a hot core.
  const layer = (strokeWidth, opacity, color) => ({ strokeWidth, opacity, color });
  const layers = [layer(16, 0.16, GOLD), layer(8, 0.34, GOLD), layer(3, 1, BRIGHT)];
  const animated = useAnimatedProps(() => ({ strokeDashoffset: -travel.value * perimeter }));
  const style = useAnimatedStyle(() => ({ opacity: fade.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={height}>
        {layers.map((l, i) => (
          <AnimatedRect
            key={i}
            x={inset}
            y={inset}
            width={w}
            height={h}
            rx={r}
            ry={r}
            fill="none"
            stroke={l.color}
            strokeOpacity={l.opacity}
            strokeWidth={l.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={[seg, perimeter - seg]}
            animatedProps={animated}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

/**
 * The overlay. Mounted once, at the root; listens for notifications that
 * arrive while the app is open and pulses if Edge Lighting is on.
 */
export default function EdgeLighting() {
  const on = useEdgeLighting();
  const calm = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [showing, setShowing] = useState(false);
  const glow = useSharedValue(0);
  const travel = useSharedValue(0);
  const fade = useSharedValue(0);
  const run = useRef(0);
  const timer = useRef(null);

  const done = useCallback((id) => {
    if (run.current === id) setShowing(false);
  }, []);

  const pulse = useCallback(() => {
    const id = ++run.current;
    // The overlay unmounts when the lap is over, so nothing is left running.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => done(id), (calm ? 1400 : EDGE_PULSE_MS) + 150);
    cancelAnimation(glow);
    cancelAnimation(travel);
    cancelAnimation(fade);
    setShowing(true);
    travel.value = 0;
    glow.value = 0;
    fade.value = 0;
    const ease = Easing.bezier(0.4, 0, 0.2, 1);
    if (calm) {
      // One slow breath of the edge glow, no travelling light.
      glow.value = withSequence(withTiming(1, { duration: 500 }), withTiming(0, { duration: 900 }));
      return;
    }
    glow.value = withSequence(withTiming(1, { duration: 420 }), withTiming(0.7, { duration: 800 }), withTiming(0, { duration: 680 }));
    fade.value = withSequence(withTiming(1, { duration: 180 }), withTiming(1, { duration: EDGE_PULSE_MS - 520 }), withTiming(0, { duration: 340 }));
    travel.value = withTiming(1, { duration: EDGE_PULSE_MS, easing: ease });
  }, [calm, glow, travel, fade, done]);

  // A notification arrives while the app is open.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      if (!isEdgeLightingOn() || AppState.currentState !== 'active' || quiet(n)) return;
      pulse();
    });
    return () => sub.remove();
  }, [pulse]);

  // The toggle's preview, and anything else that asks for one.
  useEffect(() => onEdgePulse(pulse), [pulse]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Turned off mid-pulse: gone at once.
  useEffect(() => {
    if (on) return;
    run.current += 1;
    clearTimeout(timer.current);
    cancelAnimation(glow);
    cancelAnimation(travel);
    cancelAnimation(fade);
    setShowing(false);
  }, [on, glow, travel, fade]);

  if (!showing) return null;
  return (
    <View pointerEvents="none" style={styles.root} testID="edge-lighting">
      <EdgeGlow width={width} height={height} glow={glow} />
      {calm ? null : <Runner width={width} height={height} travel={travel} fade={fade} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 },
});
