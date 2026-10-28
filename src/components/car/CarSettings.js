import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../BottomSheet';
import { Slate } from '../ui';
import { CAR_THEMES, carThemeById, loadCarTheme, setCarTheme } from '../../audio/carTheme';
import { haptics } from '../../utils/haptics';
import { withAlpha } from '../../utils/color';
import { colors, fonts, radius, space, type } from '../../theme';

// A theme's stage, as the car draws it: the base, its light, its band of
// colour, then (for tiles) the accent ring and play mark.
function Stage({ theme, style, children }) {
  return (
    <View style={[styles.stage, style]}>
      <LinearGradient colors={theme.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {theme.band ? (
        <LinearGradient colors={['rgba(0,0,0,0)', withAlpha(theme.band, 0.35), 'rgba(0,0,0,0)']} start={{ x: 0, y: 0.35 }} end={{ x: 1, y: 0.75 }} style={StyleSheet.absoluteFill} />
      ) : null}
      <LinearGradient
        colors={[withAlpha(theme.glow, 0.38), withAlpha(theme.glow, 0.1), 'rgba(0,0,0,0)']}
        locations={[0, 0.4, 1]}
        start={{ x: theme.glowAt.x, y: theme.glowAt.y }}
        end={{ x: 1 - theme.glowAt.x * 0.4, y: theme.glowAt.y > 0.5 ? 0 : 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

// The car's now playing screen, in the chosen theme: the backdrop the car
// blurs from the art, the art itself and the controls.
function Dash({ theme }) {
  return (
    <Animated.View key={theme.id} entering={FadeIn.duration(260)} testID="car-theme-preview">
      <Stage theme={theme} style={styles.dash}>
        <View style={styles.dashRow}>
          <Stage theme={theme} style={styles.dashArt}>
            <View style={[styles.ring, { borderColor: withAlpha(theme.accent, 0.6) }]}>
              <Text style={[styles.initials, { color: theme.accent }]}>BOA</Text>
            </View>
          </Stage>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.dashKicker}>ANDROID AUTO</Text>
            <Text style={styles.dashTitle} numberOfLines={1}>
              BOA Radio
            </Text>
            <Text style={styles.dashSub} numberOfLines={1}>
              Live on BOA Radio
            </Text>
            <View style={styles.dashControls}>
              <Ionicons name="play-skip-back" size={18} color="rgba(255,255,255,0.8)" />
              <View style={[styles.dashPlay, { backgroundColor: theme.accent }]}>
                <Ionicons name="pause" size={16} color="#050506" />
              </View>
              <Ionicons name="play-skip-forward" size={18} color="rgba(255,255,255,0.8)" />
            </View>
          </View>
        </View>
      </Stage>
    </Animated.View>
  );
}

/**
 * Car Settings: the theme BOA Radio wears on Android Auto. Every station
 * tile, genre and the now playing art (which the car blurs into the whole
 * screen) is drawn on it, so the car is never a plain black screen. A
 * connected car redraws at once.
 */
export default function CarSettings({ open, onClose }) {
  const [chosen, setChosen] = useState(null);
  useEffect(() => {
    let alive = true;
    loadCarTheme().then((id) => alive && setChosen(id));
    return () => {
      alive = false;
    };
  }, []);
  const current = carThemeById(chosen);

  const pick = (id) => {
    if (id === chosen) return;
    haptics.selection();
    setChosen(id);
    setCarTheme(id);
  };

  return (
    <BottomSheet open={open} onClose={onClose} dragAnywhere={false}>
      <View style={styles.body} testID="car-settings">
        <Slate dot>Car Settings</Slate>
        <Text style={[type.h1, { marginTop: space.sm }]}>
          Your car, <Text style={type.serif}>your stage.</Text>
        </Text>
        <Text style={styles.intro}>The look of BOA Radio on Android Auto: every station, genre and the now playing screen.</Text>
        <Dash theme={current} />

        <Slate style={styles.section}>Theme</Slate>
        <View style={styles.grid}>
          {CAR_THEMES.map((t) => {
            const on = t.id === current.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => pick(t.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${t.label}: ${t.detail}`}
                testID={`car-theme-${t.id}`}
                style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && { opacity: 0.85 }]}
              >
                <Stage theme={t} style={styles.tileArt}>
                  <View style={[styles.ringSmall, { borderColor: withAlpha(t.accent, 0.6) }]}>
                    <Ionicons name="play" size={12} color={t.accent} style={{ marginLeft: 2 }} />
                  </View>
                  {on ? (
                    <View style={styles.check}>
                      <Ionicons name="checkmark" size={13} color={colors.bg} />
                    </View>
                  ) : null}
                </Stage>
                <Text style={[styles.tileLabel, on && { color: colors.gold }]} numberOfLines={1}>
                  {t.label}
                </Text>
                <Text style={styles.tileDetail} numberOfLines={2}>
                  {t.detail}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>Connected to the car now? It changes on the screen straight away.</Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl },
  intro: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 20, color: colors.textMuted, marginTop: space.sm, marginBottom: space.lg },
  section: { marginTop: space.xl, marginBottom: space.md },
  stage: { overflow: 'hidden', backgroundColor: '#050506' },
  dash: { borderRadius: radius.xl, aspectRatio: 2.2, padding: space.lg, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  dashRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  dashArt: { width: 92, height: 92, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 10px 24px rgba(0,0,0,0.55)' },
  ring: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1 },
  dashKicker: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.6, color: 'rgba(255,255,255,0.6)' },
  dashTitle: { fontFamily: fonts.semibold, fontSize: 18, color: '#fff', marginTop: 2 },
  dashSub: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  dashControls: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.md },
  dashPlay: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { width: '47%', flexGrow: 1, padding: space.sm, borderRadius: radius.lg, backgroundColor: 'rgba(18,18,22,0.6)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tileOn: { borderColor: colors.gold, borderWidth: 1.5, boxShadow: '0px 0px 18px rgba(226,168,75,0.3)' },
  tileArt: { aspectRatio: 1.6, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  ringSmall: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text, marginTop: space.sm, paddingHorizontal: 2 },
  tileDetail: { fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 15, color: colors.textFaint, marginTop: 2, paddingHorizontal: 2 },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: space.lg, textAlign: 'center' },
});
