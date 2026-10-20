import { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

// Heavy and slightly under-damped (ratio ≈ 0.8): the record carries momentum,
// then settles with a small, satisfying overshoot.
const SPRING = { mass: 1.3, stiffness: 170, damping: 24 };
// How far past the first/last record you can drag, as a fraction of the drag.
const RUBBER_BAND = 0.3;
// Only mount records near the active one.
const RENDER_WINDOW = 3;

function Slide({ index, x, itemWidth, left, children }) {
  const style = useAnimatedStyle(() => {
    const d = index + x.value / itemWidth; // 0 = centred, ±1 = neighbour
    const a = Math.abs(d);
    return {
      opacity: interpolate(a, [0, 1, 2.2], [1, 0.38, 0], Extrapolation.CLAMP),
      zIndex: Math.round(100 - a * 10),
      transform: [
        { translateX: d * itemWidth },
        { scale: interpolate(a, [0, 1], [1, 0.74], Extrapolation.CLAMP) },
      ],
    };
  });
  return <Animated.View style={[styles.slide, { left, width: itemWidth }, style]}>{children}</Animated.View>;
}

/**
 * Horizontal, spring-driven record carousel.
 * Swipe to browse; tap the centre record to play/pause; tap a side record to
 * move to it. On web, ←/→ browse and Space plays/pauses.
 */
export default function RecordCarousel({
  items,
  index,
  onIndexChange,
  onPressActive,
  width,
  height,
  discSize,
  renderItem,
}) {
  // Neighbours peek in from the edges at their scaled-down size.
  const itemWidth = Math.round(discSize * 0.9);
  const left = (width - itemWidth) / 2;
  const maxIndex = items.length - 1;

  const x = useSharedValue(-index * itemWidth);
  const dragStart = useSharedValue(0);

  // Keep latest values for the JS-thread tap handler and keyboard listener.
  const latest = useRef({});
  latest.current = { index, maxIndex, onPressActive, items };

  // The last index this carousel settled on itself (via swipe, tap or keys).
  const settled = useRef(index);
  const report = useCallback(
    (i) => {
      settled.current = i;
      onIndexChange(i);
    },
    [onIndexChange],
  );

  useEffect(() => {
    x.value = -index * itemWidth;
    // Only re-sync on resize; index changes animate below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemWidth]);

  // Parent moved the index (e.g. Home deep-linked a station): glide there.
  useEffect(() => {
    if (index === settled.current) return;
    settled.current = index;
    x.value = withSpring(-index * itemWidth, SPRING);
  }, [index, itemWidth, x]);

  const goTo = useCallback(
    (i) => {
      const target = Math.max(0, Math.min(latest.current.maxIndex, i));
      x.value = withSpring(-target * itemWidth, SPRING);
      report(target);
    },
    [itemWidth, report, x],
  );

  const pan = usePanGesture({
    activeOffsetX: [-8, 8],
    onActivate: () => {
      'worklet';
      cancelAnimation(x);
      dragStart.value = x.value;
    },
    onUpdate: (e) => {
      'worklet';
      const min = -maxIndex * itemWidth;
      let next = dragStart.value + e.translationX;
      if (next > 0) next *= RUBBER_BAND;
      else if (next < min) next = min + (next - min) * RUBBER_BAND;
      x.value = next;
    },
    onDeactivate: (e) => {
      'worklet';
      const from = Math.round(-dragStart.value / itemWidth);
      // Project where a flick would coast to, so fast swipes skip records.
      const projected = Math.round(-(x.value + e.velocityX * 0.22) / itemWidth);
      // Ordinary swipes move one record; only a hard flick skips several.
      const reach = Math.abs(e.velocityX) > 2500 ? 3 : 1;
      const target = Math.max(0, Math.min(maxIndex, Math.max(from - reach, Math.min(from + reach, projected))));
      x.value = withSpring(-target * itemWidth, { ...SPRING, velocity: e.velocityX });
      scheduleOnRN(report, target);
    },
  });

  // Runs on the JS thread so play() happens inside the user gesture, which
  // browsers require before audio may start.
  const tap = useTapGesture({
    runOnJS: true,
    maxDistance: 12,
    onActivate: (e) => {
      const { index: i, items: list, onPressActive: press } = latest.current;
      const dx = e.x - width / 2;
      if (Math.abs(dx) <= discSize / 2) press(list[i]);
      else goTo(i + Math.sign(dx));
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const onKey = (e) => {
      if (e.target?.closest?.('input, textarea, [contenteditable]')) return;
      const { index: i, items: list, onPressActive: press } = latest.current;
      if (e.key === 'ArrowRight') goTo(i + 1);
      else if (e.key === 'ArrowLeft') goTo(i - 1);
      else if (e.key === ' ') {
        e.preventDefault();
        press(list[i]);
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.stage, { width, height }]}>
        {items.map((item, i) =>
          Math.abs(i - index) > RENDER_WINDOW ? null : (
            <Slide key={item.id} index={i} x={x} itemWidth={itemWidth} left={left}>
              {renderItem(item, i)}
            </Slide>
          ),
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  stage: { overflow: 'visible', cursor: 'grab', userSelect: 'none' },
  slide: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
