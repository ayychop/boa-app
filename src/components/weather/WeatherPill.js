import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useWeather } from '../../context/WeatherContext';
import { haptics } from '../../utils/haptics';
import WeatherGlyph from './WeatherGlyph';
import { colors, fonts, radius } from '../../theme';
import { LoadingDots } from '../Skeleton';

// The temperature counts up to its value once, when it first arrives.
function useCountUp(target, ms = 900) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce || target == null ? target : Math.round(target * 0.6));
  useEffect(() => {
    if (target == null || reduce) return setShown(target);
    const from = shown ?? target;
    if (from === target) return;
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(from + (target - from) * eased));
      if (t >= 1) clearInterval(id);
    }, 32);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduce]);
  return shown;
}

/**
 * Home's weather, in the hero's corner: a frosted pill with the live glyph,
 * the temperature and the rain outlook. Tap for the coming days. Before
 * location is allowed it offers to show the local weather.
 */
export default function WeatherPill({ onOpen, style }) {
  const { status, data, enable } = useWeather();
  const temp = useCountUp(data?.temp);

  if (!data) {
    const loading = status === 'loading';
    return (
      <Pressable
        hitSlop={8}
        onPress={() => {
          haptics.selection();
          if (status === 'denied') onOpen?.();
          else enable();
        }}
        accessibilityRole="button"
        accessibilityLabel={status === 'denied' ? 'Weather. Location is off' : 'Show my local weather'}
        testID="weather-pill-setup"
        style={({ pressed }) => [styles.pill, styles.setup, style, pressed && styles.pressed]}
      >
        <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        {loading ? <LoadingDots size={4} /> : <Ionicons name="location-outline" size={14} color={colors.gold} />}
        <Text style={styles.setupText}>{loading ? 'Finding you' : status === 'denied' ? 'Location off' : 'Local weather'}</Text>
      </Pressable>
    );
  }

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={style}>
      <Pressable
        hitSlop={10}
        onPress={() => {
          haptics.selection();
          onOpen?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${data.temp} degrees, ${data.label}${data.place ? ` in ${data.place}` : ''}. ${data.outlook}. Opens the forecast.`}
        testID="weather-pill"
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      >
        <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <WeatherGlyph kind={data.kind} size={30} />
        <View>
          <View style={styles.row}>
            <Text style={styles.temp}>{temp}°</Text>
            {data.place ? (
              <Text style={styles.place} numberOfLines={1}>
                {data.place}
              </Text>
            ) : null}
          </View>
          <Animated.Text key={data.outlook} entering={FadeIn.duration(500)} style={styles.outlook} numberOfLines={1}>
            {data.outlook}
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    paddingRight: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,12,14,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,239,232,0.22)',
  },
  pressed: { transform: [{ scale: 0.96 }] },
  setup: { paddingLeft: 12, paddingVertical: 8 },
  setupText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  temp: { fontFamily: fonts.light, fontSize: 20, lineHeight: 22, color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -0.6 },
  place: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.textMuted, maxWidth: 110 },
  outlook: { fontFamily: fonts.medium, fontSize: 10.5, color: colors.textFaint, maxWidth: 160 },
});
