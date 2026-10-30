import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../ui';
import { haptics } from '../../utils/haptics';
import { SPRING } from '../../utils/motion';
import { colors, fonts, radius, space } from '../../theme';

// Any colour: a saturation/brightness pad over the chosen hue, a hue strip
// under it, and a few quick picks. Dragging runs on the UI thread, so the
// pad, thumbs and preview follow the finger frame for frame; the hex code
// catches up when the finger lifts.

const QUICK = ['#E2A84B', '#FF5FB3', '#8B3FD9', '#2F7BFF', '#00E5FF', '#0F9D6E', '#FF7A3D', '#C8102E'];
const HUES = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];
const PAD_H = 168;
const STRIP_H = 28;
const THUMB = 26;

export function hsvToHex(h, s, v) {
  'worklet';
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const hex = (x) => {
    const c = Math.round(x * 255).toString(16);
    return c.length === 1 ? `0${c}` : c;
  };
  return `#${hex(f(5))}${hex(f(3))}${hex(f(1))}`.toUpperCase();
}

export function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

const clamp = (x) => {
  'worklet';
  return Math.max(0, Math.min(1, x));
};

export default function ColorPicker({ value = '#2F7BFF', onDone }) {
  const start = hexToHsv(value);
  const h = useSharedValue(start.h);
  const s = useSharedValue(start.s);
  const v = useSharedValue(start.v);
  const padW = useSharedValue(1);
  const stripW = useSharedValue(1);
  const [hex, setHex] = useState(value.toUpperCase());
  const settle = () => setHex(hsvToHex(h.value, s.value, v.value));

  const pad = usePanGesture({
    minDistance: 0,
    onBegin: (e) => {
      'worklet';
      s.value = clamp(e.x / padW.value);
      v.value = 1 - clamp(e.y / PAD_H);
    },
    onUpdate: (e) => {
      'worklet';
      s.value = clamp(e.x / padW.value);
      v.value = 1 - clamp(e.y / PAD_H);
    },
    onFinalize: () => {
      'worklet';
      scheduleOnRN(settle);
    },
  });
  const strip = usePanGesture({
    minDistance: 0,
    onBegin: (e) => {
      'worklet';
      h.value = clamp(e.x / stripW.value) * 359.9;
    },
    onUpdate: (e) => {
      'worklet';
      h.value = clamp(e.x / stripW.value) * 359.9;
    },
    onFinalize: () => {
      'worklet';
      scheduleOnRN(settle);
    },
  });

  const hueFill = useAnimatedStyle(() => ({ backgroundColor: hsvToHex(h.value, 1, 1) }));
  const padThumb = useAnimatedStyle(() => ({
    backgroundColor: hsvToHex(h.value, s.value, v.value),
    transform: [{ translateX: s.value * padW.value - THUMB / 2 }, { translateY: (1 - v.value) * PAD_H - THUMB / 2 }],
  }));
  const stripThumb = useAnimatedStyle(() => ({
    backgroundColor: hsvToHex(h.value, 1, 1),
    transform: [{ translateX: (h.value / 360) * stripW.value - THUMB / 2 }],
  }));
  const swatch = useAnimatedStyle(() => ({ backgroundColor: hsvToHex(h.value, s.value, v.value) }));

  const quick = (c) => {
    haptics.selection();
    const next = hexToHsv(c);
    h.value = withSpring(next.h, SPRING);
    s.value = withSpring(next.s, SPRING);
    v.value = withSpring(next.v, SPRING);
    setHex(c);
  };

  return (
    <View style={styles.wrap} testID="chat-color-picker">
      <GestureDetector gesture={pad}>
        <Animated.View style={[styles.pad, hueFill]} onLayout={(e) => (padW.value = Math.max(1, e.nativeEvent.layout.width))} accessibilityLabel="Colour: saturation and brightness" testID="color-pad">
          <LinearGradient colors={['#FFFFFF', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(0,0,0,0)', '#000000']} style={StyleSheet.absoluteFill} />
          <Animated.View pointerEvents="none" style={[styles.thumb, padThumb]} />
        </Animated.View>
      </GestureDetector>
      <GestureDetector gesture={strip}>
        <View style={styles.strip} onLayout={(e) => (stripW.value = Math.max(1, e.nativeEvent.layout.width))} accessibilityLabel="Colour: hue" testID="color-hue">
          <LinearGradient colors={HUES} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderRadius: STRIP_H / 2 }]} />
          <Animated.View pointerEvents="none" style={[styles.thumb, styles.stripThumb, stripThumb]} />
        </View>
      </GestureDetector>
      <View style={styles.quickRow}>
        {QUICK.map((c) => (
          <Pressable key={c} onPress={() => quick(c)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} testID={`color-quick-${c.slice(1)}`}>
            <View style={[styles.quick, { backgroundColor: c }, hex === c && styles.quickOn]} />
          </Pressable>
        ))}
      </View>
      <View style={styles.foot}>
        <Animated.View style={[styles.preview, swatch]} />
        <Text style={styles.hex} testID="color-hex">
          {hex}
        </Text>
        <View style={{ flex: 1 }} />
        <Button label="Use colour" icon="checkmark" onPress={() => onDone?.(hex)} testID="color-done" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, padding: space.lg, borderRadius: radius.xl, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  pad: { height: PAD_H, borderRadius: radius.md, overflow: 'hidden' },
  strip: { height: STRIP_H, borderRadius: STRIP_H / 2, justifyContent: 'center' },
  thumb: { position: 'absolute', left: 0, top: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3, borderColor: '#FFFFFF', boxShadow: '0px 2px 8px rgba(0,0,0,0.5)' },
  stripThumb: { top: (STRIP_H - THUMB) / 2 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quick: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  quickOn: { borderWidth: 2.5, borderColor: colors.text },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  preview: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  hex: { fontFamily: fonts.mono, fontSize: 14, color: colors.text, letterSpacing: 1 },
});
