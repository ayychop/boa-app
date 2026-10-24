import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius } from '../../theme';

const ROW = 52;
const VISIBLE = 5;

function Cell({ value, index, offset }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(offset.value / ROW - index);
    return {
      opacity: interpolate(d, [0, 1, 2.5], [1, 0.45, 0.12], 'clamp'),
      transform: [{ scale: interpolate(d, [0, 1, 2], [1, 0.82, 0.7], 'clamp') }, { rotateX: `${interpolate(offset.value / ROW - index, [-2.5, 0, 2.5], [55, 0, -55], 'clamp')}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.cell, style]}>
      <Text style={styles.cellText}>{String(value).padStart(2, '0')}</Text>
    </Animated.View>
  );
}

// One snapping column of numbers, drawn like a drum turning.
function Column({ values, value, onChange, label, testID }) {
  const ref = useRef(null);
  const offset = useSharedValue(values.indexOf(value) * ROW);
  const last = useRef(value);
  useEffect(() => {
    const i = values.indexOf(value);
    if (i < 0) return;
    ref.current?.scrollTo?.({ y: i * ROW, animated: false });
    // Only on mount and when the value changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onScroll = useAnimatedScrollHandler((e) => {
    offset.value = e.contentOffset.y;
  });
  const settle = (y) => {
    const i = Math.max(0, Math.min(values.length - 1, Math.round(y / ROW)));
    if (values[i] !== last.current) {
      last.current = values[i];
      haptics.selection();
      onChange(values[i]);
    }
  };
  return (
    <View style={styles.column} accessible accessibilityRole="adjustable" accessibilityLabel={`${label} ${value}`} testID={testID}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const i = values.indexOf(value) + (e.nativeEvent.actionName === 'increment' ? 1 : -1);
        const next = values[(i + values.length) % values.length];
        ref.current?.scrollTo?.({ y: values.indexOf(next) * ROW, animated: true });
        last.current = next;
        onChange(next);
      }}
    >
      <Animated.ScrollView
        ref={ref}
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentOffset={{ x: 0, y: values.indexOf(value) * ROW }}
        contentContainerStyle={{ paddingVertical: ROW * ((VISIBLE - 1) / 2) }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => {
          if (!e.nativeEvent.velocity?.y) settle(e.nativeEvent.contentOffset.y);
        }}
      >
        {values.map((v, i) => (
          <Cell key={v} value={v} index={i} offset={offset} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

/** Hours and minutes on two drums, with a gold band across the chosen time. */
export default function TimeWheel({ hour, minute, onChange }) {
  return (
    <View style={styles.wheel}>
      <View pointerEvents="none" style={styles.band} />
      <Column values={HOURS} value={hour} label="Hour" testID="alarm-hour" onChange={(h) => onChange(h, minute)} />
      <Text style={styles.colon}>:</Text>
      <Column values={MINUTES} value={minute} label="Minute" testID="alarm-minute" onChange={(m) => onChange(hour, m)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: { height: ROW * VISIBLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  band: {
    position: 'absolute',
    left: -16,
    right: -16,
    top: ROW * ((VISIBLE - 1) / 2),
    height: ROW,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.5)',
  },
  column: { width: 92, height: ROW * VISIBLE },
  cell: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontFamily: fonts.light, fontSize: 44, color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  colon: { fontFamily: fonts.light, fontSize: 40, color: colors.gold, marginHorizontal: 4, marginTop: -6 },
});
