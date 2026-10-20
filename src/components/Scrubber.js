import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, fonts } from '../theme';

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

const GROW = { stiffness: 420, damping: 28 };

/**
 * Apple-style scrubber: drag anywhere on the track (it thickens under your
 * finger) or tap to jump. Seeks once, on release.
 */
export default function Scrubber({ position, duration, onSeek, tint = colors.text }) {
  const [width, setWidth] = useState(0);
  const [preview, setPreview] = useState(null); // seconds while dragging
  const drag = useSharedValue(-1); // 0..1 while dragging, -1 otherwise
  const active = useSharedValue(0);

  const fraction = duration > 0 ? Math.min(1, position / duration) : 0;
  const enabled = duration > 0 && width > 0;

  const toFraction = (x) => {
    'worklet';
    return Math.max(0, Math.min(1, x / width));
  };

  const pan = usePanGesture({
    enabled,
    minDistance: 0,
    onBegin: (e) => {
      'worklet';
      active.value = withSpring(1, GROW);
      drag.value = toFraction(e.x);
      scheduleOnRN(setPreview, drag.value * duration);
    },
    onUpdate: (e) => {
      'worklet';
      drag.value = toFraction(e.x);
      scheduleOnRN(setPreview, drag.value * duration);
    },
    // minDistance 0 means a plain tap also lands here and seeks.
    onFinalize: () => {
      'worklet';
      active.value = withSpring(0, GROW);
      if (drag.value >= 0) scheduleOnRN(onSeek, drag.value * duration);
      drag.value = -1;
      scheduleOnRN(setPreview, null);
    },
  });


  const trackStyle = useAnimatedStyle(() => ({ height: 4 + active.value * 4, borderRadius: 2 + active.value * 2 }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${(drag.value >= 0 ? drag.value : fraction) * 100}%` }));

  const shown = preview ?? position;

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          style={styles.hit}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel="Playback position"
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown), text: formatTime(shown) }}
        >
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.fill, { backgroundColor: tint }, fillStyle]} />
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(shown)}</Text>
        <Text style={styles.time}>{duration > 0 ? `-${formatTime(duration - shown)}` : '--:--'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 28, justifyContent: 'center', cursor: 'pointer' },
  track: { backgroundColor: 'rgba(243,239,232,0.18)', overflow: 'hidden' },
  fill: { height: '100%' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  time: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted, letterSpacing: 0.5 },
});
