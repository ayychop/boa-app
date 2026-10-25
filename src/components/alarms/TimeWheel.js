import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { to12h, to24h } from '../../data/alarms';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius } from '../../theme';

const ROW = 52;
const VISIBLE = 5;

function Cell({ label, index, offset }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(offset.value / ROW - index);
    return {
      opacity: interpolate(d, [0, 1, 2.5], [1, 0.45, 0.12], 'clamp'),
      transform: [{ scale: interpolate(d, [0, 1, 2], [1, 0.82, 0.7], 'clamp') }, { rotateX: `${interpolate(offset.value / ROW - index, [-2.5, 0, 2.5], [55, 0, -55], 'clamp')}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.cell, style]}>
      <Text style={styles.cellText}>{label}</Text>
    </Animated.View>
  );
}

// One snapping column of numbers, drawn like a drum turning. It sits inside
// the editor's own vertical ScrollView, so on Android it must be a nested
// scroll (nestedScrollEnabled): otherwise the page takes every drag and the
// drum never turns.
function Column({ values, value, onChange, label, format, testID }) {
  const ref = useRef(null);
  const offset = useSharedValue(values.indexOf(value) * ROW);
  const last = useRef(value);
  useEffect(() => {
    const i = values.indexOf(value);
    if (i < 0) return;
    ref.current?.scrollTo?.({ y: i * ROW, animated: false });
    // Only on mount: after that the drum is where the finger left it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    last.current = value;
  }, [value]);
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
  const step = (by) => {
    const i = values.indexOf(value) + by;
    const next = values[(i + values.length) % values.length];
    ref.current?.scrollTo?.({ y: values.indexOf(next) * ROW, animated: true });
    last.current = next;
    onChange(next);
  };
  return (
    <View
      style={styles.column}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      testID={testID}
    >
      <Animated.ScrollView
        ref={ref}
        nestedScrollEnabled
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentOffset={{ x: 0, y: values.indexOf(value) * ROW }}
        contentContainerStyle={{ paddingVertical: ROW * ((VISIBLE - 1) / 2) }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => {
          if (!e.nativeEvent.velocity?.y) settle(e.nativeEvent.contentOffset.y);
        }}
        testID={`${testID}-scroll`}
      >
        {values.map((v, i) => (
          <Cell key={v} label={format(v)} index={i} offset={offset} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const plain = (v) => String(v);
const twoDigits = (v) => String(v).padStart(2, '0');

function Period({ pm, onChange }) {
  return (
    <View style={styles.period} accessibilityRole="radiogroup" accessibilityLabel="Morning or evening">
      {[
        { id: false, label: 'AM' },
        { id: true, label: 'PM' },
      ].map((o) => {
        const on = o.id === pm;
        return (
          <Pressable
            key={o.label}
            onPress={() => {
              if (on) return;
              haptics.selection();
              onChange(o.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            hitSlop={6}
            testID={`alarm-${o.label.toLowerCase()}`}
            style={[styles.periodOption, on && styles.periodOn]}
          >
            <Text style={[styles.periodText, on && { color: colors.bg }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The time in 12-hour form: hours (1 to 12) and minutes on two drums with a
 * gold band across the chosen time, and AM / PM beside them. `hour` in and
 * out is 24-hour (0 to 23), which is what alarms store and schedule by.
 */
export default function TimeWheel({ hour, minute, onChange }) {
  const { hour12, pm } = to12h(hour);
  return (
    <View style={styles.wheel}>
      <View pointerEvents="none" style={styles.band} />
      <Column values={HOURS} value={hour12} label="Hour" format={plain} testID="alarm-hour" onChange={(h) => onChange(to24h(h, pm), minute)} />
      <Text style={styles.colon}>:</Text>
      <Column values={MINUTES} value={minute} label="Minute" format={twoDigits} testID="alarm-minute" onChange={(m) => onChange(hour, m)} />
      <Period pm={pm} onChange={(next) => onChange(to24h(hour12, next), minute)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: { height: ROW * VISIBLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  band: {
    position: 'absolute',
    left: -12,
    right: -12,
    top: ROW * ((VISIBLE - 1) / 2),
    height: ROW,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.5)',
  },
  column: { width: 84, height: ROW * VISIBLE },
  cell: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontFamily: fonts.light, fontSize: 44, color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  colon: { fontFamily: fonts.light, fontSize: 40, color: colors.gold, marginHorizontal: 2, marginTop: -6 },
  period: {
    marginLeft: 10,
    padding: 3,
    gap: 3,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  periodOption: { width: 54, height: 40, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center' },
  periodOn: { backgroundColor: colors.gold },
  periodText: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: 0.6, color: colors.textMuted },
});
