import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptics } from '../utils/haptics';
import { colors, fonts, radius, space } from '../theme';

// Building blocks for the full-screen pages over the tabs (alarms, the
// forecast, the Creative Hub), in the app's dark-and-gold style.

/** Back (or close), a title, and an optional action on the right. */
export function PageHeader({ title, onBack, backIcon = 'chevron-back', right, kicker }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      {/* A tab's own screen has nowhere to go back to. */}
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.round, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name={backIcon} size={22} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {right ?? <View style={{ width: 40 }} />}
    </View>
  );
}

export function IconButton({ icon, label, onPress, tone = colors.text, filled, testID }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.round, filled && styles.roundFilled, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      <Ionicons name={icon} size={20} color={filled ? colors.bg : tone} />
    </Pressable>
  );
}

/** A labelled text field that lights up gold when focused. */
export function Field({ label, hint, error, style, inputStyle, ...input }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.gold}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[styles.input, input.multiline && styles.inputMulti, focused && styles.inputFocused, error && styles.inputError, inputStyle]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** A switch: the knob springs across and the track fills gold. */
export function Toggle({ value, onChange, label, testID }) {
  const t = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    t.value = withSpring(value ? 1 : 0, { duration: 380, dampingRatio: 0.7 });
  }, [value, t]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(t.value, [0, 1], ['rgba(243,239,232,0.16)', colors.gold]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * 20 }] }));
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onChange(!value);
      }}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      testID={testID}
    >
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Pressable>
  );
}

/** A row with a title, detail and a control on the right. */
export function SettingRow({ icon, title, detail, children, onPress, danger, last }) {
  const Body = (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      {icon ? <Ionicons name={icon} size={19} color={danger ? '#FF6B6B' : colors.gold} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, danger && { color: '#FF6B6B' }]}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
  if (!onPress) return Body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { backgroundColor: colors.surfaceRaised }}>
      {Body}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, testID }) {
  const t = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(selected ? 1 : 0, { duration: 220 });
  }, [selected, t]);
  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], ['rgba(243,239,232,0.06)', colors.gold]),
    borderColor: interpolateColor(t.value, [0, 1], ['rgba(243,239,232,0.14)', colors.gold]),
  }));
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      testID={testID}
    >
      <Animated.View style={[styles.chip, style]}>
        {icon ? <Ionicons name={icon} size={13} color={selected ? colors.bg : colors.textMuted} /> : null}
        <Text style={[styles.chipText, selected && { color: colors.bg }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** Two or three options in a pill, the chosen one lit. */
export function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              haptics.selection();
              onChange(o.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && styles.segmentOn]}
          >
            {o.icon ? <Ionicons name={o.icon} size={14} color={on ? colors.bg : colors.textMuted} /> : null}
            <Text style={[styles.segmentText, on && { color: colors.bg }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A round profile picture with initials behind it and an optional online dot. */
/**
 * A round profile picture (initials if there isn't one). People who are
 * online, or `ring`, get BOA's gold ring: a gradient band with a dark gap
 * between it and the photo, like a story ring.
 */
export function Avatar({ uri, name = '?', size = 48, online = false, ring = false }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || '?')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const dot = Math.max(10, Math.round(size * 0.26));
  const gold = ring || online;
  const band = Math.max(2, Math.round(size * 0.045));
  const gap = Math.max(2, Math.round(size * 0.035));
  const inner = gold ? size - (band + gap) * 2 : size;
  return (
    <View style={{ width: size, height: size }}>
      {gold ? (
        <LinearGradient
          colors={[colors.gold, '#F6D38A', colors.goldDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          testID="avatar-gold-ring"
        >
          <View style={{ position: 'absolute', top: band, left: band, right: band, bottom: band, borderRadius: size / 2, backgroundColor: colors.bg }} />
        </LinearGradient>
      ) : null}
      <View
        style={[
          styles.avatar,
          { width: inner, height: inner, borderRadius: inner / 2 },
          gold && { position: 'absolute', top: band + gap, left: band + gap },
        ]}
      >
        {uri && !failed ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
        ) : (
          <Text style={[styles.initials, { fontSize: inner * 0.36 }]}>{initials || '?'}</Text>
        )}
      </View>
      {online ? (
        <View
          testID="online-dot"
          accessibilityLabel="Online"
          style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2, borderWidth: Math.max(2, size * 0.05) }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,22,0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  roundFilled: { backgroundColor: colors.gold, borderColor: colors.gold },
  kicker: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 2, color: colors.gold, textTransform: 'uppercase' },
  title: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.6, color: colors.text },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.textMuted, marginBottom: 8 },
  input: {
    minHeight: 50,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
  inputFocused: { borderColor: 'rgba(226,168,75,0.8)', backgroundColor: colors.surfaceRaised },
  inputError: { borderColor: '#FF6B6B' },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 6 },
  error: { fontFamily: fonts.medium, fontSize: 12, color: '#FF8A8A', marginTop: 6 },
  track: { width: 48, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', boxShadow: '0px 2px 6px rgba(0,0,0,0.35)' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    minHeight: 60,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  rowDetail: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, height: 34, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segment: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 36, borderRadius: radius.pill },
  segmentOn: { backgroundColor: colors.gold },
  segmentText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted },
  avatar: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong },
  initials: { fontFamily: fonts.bold, color: colors.gold, letterSpacing: -0.5 },
  dot: { position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.live, borderColor: colors.bg },
});
