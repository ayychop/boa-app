import { useEffect } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, FadeIn, FadeInDown, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useWeather } from '../context/WeatherContext';
import { hourLabel } from '../api/weather';
import WeatherGlyph, { SKY } from '../components/weather/WeatherGlyph';
import { Button, Slate } from '../components/ui';
import { colors, fonts, radius, space, type } from '../theme';
import { CardsSkeleton } from '../components/Skeleton';

// A day's temperature range as a bar on the week's scale, warm at the top
// end, so the week reads at a glance.
function RangeBar({ low, high, min, max, index }) {
  const reduce = useReducedMotion();
  const grow = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) grow.value = withTiming(1, { duration: 700 + index * 60, easing: Easing.out(Easing.cubic) });
  }, [reduce, grow, index]);
  const span = Math.max(1, max - min);
  const left = ((low - min) / span) * 100;
  const width = Math.max(8, ((high - low) / span) * 100);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { left: `${left}%`, width: `${width}%`, transformOrigin: 'left' }, style]}>
        <LinearGradient colors={['#7FA8FF', colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

function Stat({ icon, label, value }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={colors.gold} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * The coming days: now (big, alive), the next 24 hours as a strip, and the
 * week as rows with their temperature ranges. Opened from Home's weather
 * pill and from the widget's weather (network.boa://weather).
 */
export default function ForecastScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { status, data, enable, refresh } = useWeather();

  // The backdrop cross-fades between sky tones as the conditions change.
  const tone = useSharedValue(0);
  const sky = SKY[data?.kind] ?? SKY.cloud;
  useEffect(() => {
    tone.value = 0;
    tone.value = withTiming(1, { duration: 1200 });
  }, [data?.kind, tone]);
  const skyStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(tone.value, [0, 1], [colors.bg, sky[0]]) }));

  const close = (
    <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close forecast" style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}>
      <Ionicons name="chevron-down" size={22} color={colors.text} />
    </Pressable>
  );

  if (!data) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]} testID="forecast-empty">
        <View style={[styles.topBar, { top: insets.top + space.sm }]}>{close}</View>
        <WeatherGlyph kind="partly" size={72} />
        <Text style={[type.h1, { textAlign: 'center', marginTop: space.xl }]}>Your local weather</Text>
        <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm, maxWidth: 320 }]}>
          {status === 'denied'
            ? 'Location is off for BOA. Turn on approximate location in Settings to see the forecast here and on the widget.'
            : 'BOA uses your approximate location (never precise, never stored on a server) to show the forecast here and on the home screen widget.'}
        </Text>
        {status === 'loading' ? (
          <CardsSkeleton count={4} height={92} style={{ marginTop: space.xl, paddingHorizontal: 0 }} />
        ) : status === 'denied' ? (
          <Button label="Open Settings" icon="settings-outline" onPress={() => Linking.openSettings()} style={{ marginTop: space.xl }} />
        ) : (
          <Button label="Show my weather" icon="location-outline" onPress={enable} style={{ marginTop: space.xl }} />
        )}
      </View>
    );
  }

  const min = Math.min(...data.days.map((d) => d.low));
  const max = Math.max(...data.days.map((d) => d.high));

  return (
    <View style={styles.screen} testID="forecast-screen">
      <Animated.View style={[StyleSheet.absoluteFill, skyStyle]} />
      <LinearGradient colors={['rgba(5,5,6,0)', sky[1], sky[2]]} locations={[0, 0.45, 0.85]} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.gold} />}
      >
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.now}>
          <Slate dot>{data.place ?? 'Your location'}</Slate>
          <View style={styles.nowRow}>
            <WeatherGlyph kind={data.kind} size={96} />
            <Text style={styles.nowTemp} accessibilityLabel={`${data.temp} degrees`}>
              {data.temp}°
            </Text>
          </View>
          <Text style={styles.nowLabel}>{data.label}</Text>
          <Text style={styles.outlook}>{data.outlook}</Text>
          <Text style={styles.hilo}>
            H {data.high}° · L {data.low}° · Feels like {data.feels}°
          </Text>
        </Animated.View>

        <View style={styles.stats}>
          <Stat icon="umbrella-outline" label="Rain" value={`${data.rainChance}%`} />
          <Stat icon="water-outline" label="Humidity" value={`${data.humidity}%`} />
          <Stat icon="flag-outline" label="Wind" value={`${data.wind} ${data.windUnit}`} />
        </View>

        <View style={styles.card}>
          <Slate>Next 24 hours</Slate>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours}>
            {data.hours.map((h, i) => (
              <Animated.View key={h.time} entering={FadeIn.delay(i * 25)} style={styles.hour}>
                <Text style={styles.hourTime}>{i === 0 ? 'Now' : hourLabel(h.time)}</Text>
                <WeatherGlyph kind={h.kind} size={28} />
                <Text style={styles.hourTemp}>{h.temp}°</Text>
                <Text style={[styles.hourRain, h.precip < 20 && { opacity: 0 }]}>{h.precip}%</Text>
              </Animated.View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.card}>
          <Slate>Coming days</Slate>
          {data.days.map((d, i) => (
            <Animated.View
              key={d.date}
              entering={FadeInDown.delay(80 + i * 50)
                .springify()
                .damping(20)}
              style={[styles.day, i === data.days.length - 1 && { borderBottomWidth: 0 }]}
              accessible
              accessibilityLabel={`${d.name}: ${d.label}, high ${d.high}, low ${d.low}, ${d.precip}% chance of rain`}
            >
              <Text style={styles.dayName} numberOfLines={1}>
                {d.name}
              </Text>
              <View style={styles.dayIcon}>
                <WeatherGlyph kind={d.kind} size={26} />
                {d.precip >= 20 && <Text style={styles.dayRain}>{d.precip}%</Text>}
              </View>
              <Text style={styles.dayLow}>{d.low}°</Text>
              <RangeBar low={d.low} high={d.high} min={min} max={max} index={i} />
              <Text style={styles.dayHigh}>{d.high}°</Text>
            </Animated.View>
          ))}
        </View>

        <Text style={styles.credit} onPress={() => Linking.openURL('https://open-meteo.com/')}>
          Weather data by Open-Meteo.com (CC BY 4.0)
        </Text>
      </ScrollView>
      <View style={[styles.topBar, { top: insets.top + space.sm }]}>{close}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row' },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,22,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  now: { alignItems: 'center', paddingHorizontal: space.xl },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  nowTemp: { fontFamily: fonts.extralight, fontSize: 104, lineHeight: 110, letterSpacing: -5, color: colors.text, fontVariant: ['tabular-nums'] },
  nowLabel: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.5, color: colors.text },
  outlook: { fontFamily: fonts.serif, fontSize: 22, color: colors.gold, marginTop: 4 },
  hilo: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: space.md, textTransform: 'uppercase' },
  stats: { flexDirection: 'row', gap: space.sm, marginTop: space.xl, paddingHorizontal: space.xl },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(243,239,232,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statValue: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  statLabel: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.6, color: colors.textFaint, textTransform: 'uppercase' },
  card: {
    marginTop: space.lg,
    marginHorizontal: space.xl,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(12,12,14,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  hours: { gap: space.lg, paddingTop: space.md },
  hour: { alignItems: 'center', gap: 6, width: 44 },
  hourTime: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  hourTemp: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  hourRain: { fontFamily: fonts.mono, fontSize: 10, color: '#7FA8FF' },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayName: { width: 92, fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  dayIcon: { width: 44, alignItems: 'center' },
  dayRain: { fontFamily: fonts.mono, fontSize: 9.5, color: '#7FA8FF', marginTop: -2 },
  dayLow: { width: 34, textAlign: 'right', fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  dayHigh: { width: 34, fontFamily: fonts.semibold, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  track: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(243,239,232,0.08)', overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3, overflow: 'hidden' },
  credit: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.textFaint, textAlign: 'center', marginTop: space.xl },
});
