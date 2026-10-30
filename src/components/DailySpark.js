import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { dailyQuote } from '../utils/dailyQuote';
import { Slate } from './ui';
import Panel from './Panel';
import { colors, fonts, radius, space } from '../theme';

/**
 * The Daily Spark on Profile: today's line in your chosen kind, on frosted
 * glass. The glass sits over a warm glow of its own, so the blur reads on
 * the dark page. A new line each day (checked whenever Profile comes back
 * into view). `hint` is a note under it, such as how to choose a kind.
 */
export default function DailySpark({ category, hint }) {
  const [today, setToday] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      const now = new Date();
      setToday((d) => (d.toDateString() === now.toDateString() ? d : now));
    }, []),
  );
  const { text, category: kind } = dailyQuote(category, today);
  return (
    <Panel
      style={styles.card}
      accessible
      accessibilityLabel={`Daily Spark, ${kind.label}: ${text}`}
      testID="daily-spark"
    >
      <LinearGradient
        colors={['rgba(226,168,75,0.55)', 'rgba(201,138,46,0.18)', 'rgba(90,60,140,0.35)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, { top: -40, right: -30, backgroundColor: 'rgba(226,168,75,0.5)' }]} />
      <View style={[styles.orb, { bottom: -50, left: -20, backgroundColor: 'rgba(120,80,200,0.35)' }]} />
      <BlurView intensity={45} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.frost]} />
      <View style={styles.head}>
        <Slate dot color={colors.gold}>
          Daily Spark
        </Slate>
        <View style={styles.pill} testID="daily-spark-category">
          <Ionicons name={kind.icon} size={12} color={colors.text} />
          <Text style={styles.pillText}>
            {kind.label} · {kind.theme}
          </Text>
        </View>
      </View>
      {/* An oversized opening quote mark, set back like a watermark. */}
      <Text style={styles.mark} accessibilityElementsHidden importantForAccessibility="no">
        {'\u201C'}
      </Text>
      <Text style={styles.quote} testID="daily-spark-quote">
        {text}
      </Text>
      <Text style={styles.date}>{today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · New every morning</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.lg,
    padding: space.xl,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: colors.surface,
  },
  orb: { position: 'absolute', width: 160, height: 160, borderRadius: 80 },
  frost: { backgroundColor: 'rgba(12,12,14,0.35)' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.text },
  mark: { position: 'absolute', right: space.lg, bottom: -38, fontFamily: fonts.serif, fontSize: 180, lineHeight: 180, color: 'rgba(226,168,75,0.16)' },
  quote: { fontFamily: fonts.serif, fontSize: 27, lineHeight: 34, color: colors.text, marginTop: space.lg, letterSpacing: -0.2 },
  date: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(243,239,232,0.6)', marginTop: space.lg },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: space.md },
});
