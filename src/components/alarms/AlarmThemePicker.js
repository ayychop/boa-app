import { useId } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { ALARM_THEMES, alarmThemeById, setAlarmTheme, useAlarmTheme } from '../../data/alarmThemes';
import * as BoaAlarm from '../../../modules/boa-alarm';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space } from '../../theme';

const W = 112;
const H = 176;

// "rgba(r,g,b,a)" -> its colour and alpha, for an SVG stop.
function parts(rgba) {
  const m = /rgba?\(([^)]+)\)/.exec(rgba);
  const [r, g, b, a = 1] = m ? m[1].split(',').map((n) => parseFloat(n)) : [0, 0, 0, 0];
  return { color: `rgb(${r},${g},${b})`, opacity: a };
}

/** A miniature of the alarm page in one theme: its ground, its glows, its time and its lit button. */
function Preview({ theme }) {
  const id = useId().replace(/:/g, '');
  return (
    <View style={styles.preview} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={theme.bg} style={StyleSheet.absoluteFill} />
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          {theme.orbs.map((o, i) => {
            const { color, opacity } = parts(o[0]);
            return (
              <RadialGradient key={i} id={`o${id}${i}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={color} stopOpacity={opacity} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </RadialGradient>
            );
          })}
        </Defs>
        {theme.orbs.map((o, i) => {
          const size = Math.max(W, H) * o[3];
          return <Rect key={i} x={o[1] * W - size / 2} y={o[2] * H - size / 2} width={size} height={size} fill={`url(#o${id}${i})`} />;
        })}
      </Svg>
      <Text style={[styles.brand, { color: theme.accent }]}>BOA ALARM</Text>
      <Text style={[styles.time, { color: theme.time[0] }]}>6:30</Text>
      <Text style={[styles.name, { color: theme.text }]}>Wake up</Text>
      <LinearGradient colors={theme.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.stop}>
        <Text style={[styles.stopText, { color: theme.buttonText }]}>Stop</Text>
      </LinearGradient>
      <View style={[styles.snooze, { borderColor: theme.accent }]} />
    </View>
  );
}

/**
 * Six looks for the page the phone shows when a station alarm rings. Tapping
 * one chooses it; "Preview" shows the real page now, over the app.
 */
export default function AlarmThemePicker() {
  const picked = useAlarmTheme();
  const theme = alarmThemeById(picked);
  return (
    <View testID="alarm-theme-picker">
      <Text style={styles.title}>Alarm screen</Text>
      <Text style={styles.note}>How the alarm looks when a BOA Radio alarm rings, even on the lock screen.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {ALARM_THEMES.map((t) => {
          const on = t.id === picked;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                if (!on) haptics.selection();
                setAlarmTheme(t.id);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={`${t.name} alarm screen`}
              accessibilityHint={t.blurb}
              testID={`alarm-theme-${t.id}`}
              style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <Preview theme={t} />
              <View style={styles.tileFoot}>
                <Text style={[styles.tileName, on && { color: colors.gold }]} numberOfLines={1}>
                  {t.name}
                </Text>
                {on ? <Ionicons name="checkmark-circle" size={16} color={colors.gold} /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.blurb}>{theme.blurb}</Text>
      <Pressable
        onPress={() => BoaAlarm.preview(picked)}
        accessibilityRole="button"
        accessibilityLabel={`Preview the ${theme.name} alarm screen`}
        testID="alarm-theme-preview"
        style={({ pressed }) => [styles.previewBtn, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="eye-outline" size={16} color={colors.gold} />
        <Text style={styles.previewText}>Preview {theme.name}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 26, color: colors.text, letterSpacing: -0.4 },
  note: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18, color: colors.textMuted, marginTop: 2 },
  row: { gap: space.md, paddingVertical: space.md, paddingRight: space.md },
  tile: { width: W + 12, padding: 6, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tileOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  preview: { width: W, height: H, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', paddingTop: 14 },
  brand: { fontFamily: fonts.semibold, fontSize: 7, letterSpacing: 2, lineHeight: 10 },
  time: { fontFamily: fonts.extralight, fontSize: 38, lineHeight: 46, letterSpacing: -1.5, marginTop: 30 },
  name: { fontFamily: fonts.serif, fontSize: 12, lineHeight: 16, marginTop: 4 },
  stop: { position: 'absolute', bottom: 34, width: W - 28, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stopText: { fontFamily: fonts.semibold, fontSize: 9, lineHeight: 12 },
  snooze: { position: 'absolute', bottom: 12, width: W - 36, height: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, opacity: 0.6 },
  tileFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 8, paddingBottom: 3 },
  tileName: { fontFamily: fonts.semibold, fontSize: 12.5, lineHeight: 18, color: colors.text },
  blurb: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: space.sm, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(226,168,75,0.5)', backgroundColor: colors.goldSoft },
  previewText: { fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 19, color: colors.gold },
});
