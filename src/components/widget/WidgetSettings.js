import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import BottomSheet from '../BottomSheet';
import { Slate } from '../ui';
import useWidgetStyle, { DEFAULT_WIDGET_STYLE, WIDGET_LAYOUTS } from '../../hooks/useWidgetStyle';
import { hslHex, hueOf, parseHex, withAlpha } from '../../utils/color';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space, type } from '../../theme';

// Ready-made tints: BOA's own, then a spread round the wheel.
const SWATCHES = ['#141416', '#E2A84B', '#9A6A22', '#F3EFE8', '#1E88E5', '#7E57C2', '#D81B60', '#00897B', '#43A047', '#F4511E'];

function luminance(hex) {
  const c = parseHex(hex);
  return c ? (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 : 0;
}

// The glass itself: tint, clarity and sheen, under any style's content.
function Glass({ color, opacity, style, children, testID }) {
  return (
    <View style={[styles.widget, style]} testID={testID}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(color, opacity) }]} testID={testID ? `${testID}-glass` : undefined} />
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

function MiniRecord({ size }) {
  return (
    <View style={[styles.record, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.label, { width: size * 0.38, height: size * 0.38, borderRadius: size * 0.19 }]} />
    </View>
  );
}

// A small model of the widget, in the chosen style, on a wallpaper-ish
// backdrop, so the glass's tint and clarity read as they will on the home
// screen.
function Preview({ color, opacity, layout }) {
  const dark = luminance(color) > 0.6 && opacity > 0.5;
  const primary = dark ? '#141416' : colors.text;
  const secondary = dark ? 'rgba(20,20,22,0.7)' : 'rgba(243,239,232,0.7)';
  const accent = dark ? colors.goldDeep : colors.gold;
  let widget;
  if (layout === 'compact') {
    widget = (
      <Glass color={color} opacity={opacity} style={styles.compact} testID="widget-preview">
        <Text style={[styles.time, { color: primary, fontSize: 24, lineHeight: 28 }]}>10:47</Text>
        <View style={[styles.vrule, { backgroundColor: secondary }]} />
        <MiniRecord size={28} />
        <Text style={[styles.cta, { color: accent, flex: 1, marginTop: 0 }]} numberOfLines={1}>
          BOA RADIO · TAP TO TUNE IN
        </Text>
        <Text style={[styles.temp, { color: primary }]}>14°</Text>
      </Glass>
    );
  } else if (layout === 'record') {
    widget = (
      <Glass color={color} opacity={opacity} style={styles.square} testID="widget-preview">
        <MiniRecord size={84} />
        <Text style={[styles.cta, { color: accent, marginTop: 10 }]}>TAP TO TUNE IN</Text>
      </Glass>
    );
  } else {
    widget = (
      <Glass color={color} opacity={opacity} testID="widget-preview">
        <MiniRecord size={64} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.time, { color: primary }]}>10:47</Text>
          <Text style={[styles.date, { color: secondary }]}>Saturday 24 October</Text>
          <Text style={[styles.cta, { color: accent }]}>BOA RADIO · TAP TO TUNE IN</Text>
        </View>
        <Text style={[styles.temp, { color: primary }]}>14°</Text>
      </Glass>
    );
  }
  return (
    <View style={styles.wallpaper}>
      <LinearGradient colors={['#3B2F63', '#C2185B', '#F57C00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {widget}
    </View>
  );
}

/**
 * Home screen widget settings: its style (Glass, Compact or Record), the
 * glass's colour (swatches, or any hue on the slider) and how see-through
 * it is. Changes reach the widget at once.
 */
export default function WidgetSettings({ open, onClose }) {
  const { style, update, available } = useWidgetStyle();
  const hue = Math.round(hueOf(style.color));
  return (
    <BottomSheet open={open} onClose={onClose} dragAnywhere={false}>
      <View style={styles.body}>
        <Slate dot>Home screen widget</Slate>
        <Text style={[type.h1, { marginTop: space.sm }]}>
          Your glass, <Text style={type.serif}>your colour.</Text>
        </Text>
        <Preview color={style.color} opacity={style.opacity} layout={style.layout} />

        <Slate style={styles.section}>Style</Slate>
        <View style={styles.layouts}>
          {WIDGET_LAYOUTS.map((l) => {
            const on = style.layout === l.id;
            return (
              <Pressable
                key={l.id}
                onPress={() => {
                  haptics.selection();
                  update({ layout: l.id });
                }}
                accessibilityRole="button"
                accessibilityLabel={`${l.label} widget: ${l.detail}`}
                accessibilityState={{ selected: on }}
                testID={`widget-layout-${l.id}`}
                style={({ pressed }) => [styles.layout, on && styles.layoutOn, pressed && { opacity: 0.8 }]}
              >
                <Text style={[styles.layoutLabel, on && { color: colors.bg }]}>{l.label}</Text>
                <Text style={[styles.layoutDetail, on && { color: 'rgba(5,5,6,0.7)' }]} numberOfLines={1}>
                  {l.detail}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Slate style={styles.section}>Colour</Slate>
        <View style={styles.swatches}>
          {SWATCHES.map((c) => {
            const on = c.toLowerCase() === style.color.toLowerCase();
            return (
              <Pressable
                key={c}
                onPress={() => {
                  haptics.selection();
                  update({ color: c });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Widget colour ${c}`}
                accessibilityState={{ selected: on }}
                style={[styles.swatch, { backgroundColor: c }, on && styles.swatchOn]}
              />
            );
          })}
        </View>
        <View style={styles.sliderRow}>
          <LinearGradient
            colors={[0, 60, 120, 180, 240, 300, 360].map((h) => hslHex(h))}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.hueTrack}
          />
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={359}
            step={1}
            value={hue}
            onValueChange={(h) => update({ color: hslHex(h) })}
            minimumTrackTintColor="transparent"
            maximumTrackTintColor="transparent"
            thumbTintColor={colors.text}
            accessibilityLabel="Custom colour"
            testID="widget-hue"
          />
        </View>

        <View style={styles.rowHead}>
          <Slate style={styles.section}>Transparency</Slate>
          <Text style={styles.value}>{Math.round((1 - style.opacity) * 100)}%</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={Math.round((1 - style.opacity) * 100)}
          onValueChange={(t) => update({ opacity: Math.round(100 - t) / 100 })}
          minimumTrackTintColor={colors.gold}
          maximumTrackTintColor="rgba(243,239,232,0.2)"
          thumbTintColor={colors.gold}
          accessibilityLabel="Widget transparency"
          testID="widget-transparency"
        />

        <Pressable
          onPress={() => update({ color: DEFAULT_WIDGET_STYLE.color, opacity: DEFAULT_WIDGET_STYLE.opacity })}
          accessibilityRole="button"
          style={styles.reset}
        >
          <Text style={styles.resetText}>Reset to BOA glass</Text>
        </Pressable>
        <Text style={styles.note}>
          {Platform.OS === 'android'
            ? available
              ? 'Add it from your home screen: long-press, Widgets, BOA Networks.'
              : 'Widget styling needs the installed Android app.'
            : 'The home screen widget is on Android.'}
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl },
  wallpaper: { marginTop: space.lg, borderRadius: radius.lg, overflow: 'hidden', padding: space.lg },
  widget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  compact: { paddingVertical: space.sm, gap: space.sm },
  square: { alignSelf: 'center', width: 170, height: 170, flexDirection: 'column', justifyContent: 'center' },
  vrule: { width: 1, height: 22, opacity: 0.4 },
  temp: { fontFamily: fonts.light, fontSize: 20, alignSelf: 'flex-start' },
  record: { backgroundColor: '#0B0B0D', borderWidth: 3, borderColor: '#C9C9CF', alignItems: 'center', justifyContent: 'center' },
  label: { backgroundColor: colors.gold },
  layouts: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  layout: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(243,239,232,0.14)',
    backgroundColor: 'rgba(243,239,232,0.05)',
  },
  layoutOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  layoutLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  layoutDetail: { fontFamily: fonts.medium, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  time: { fontFamily: fonts.light, fontSize: 32, lineHeight: 36 },
  date: { fontFamily: fonts.medium, fontSize: 11 },
  cta: { fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 1.2, marginTop: 6 },
  section: { marginTop: space.xl },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  swatchOn: { borderWidth: 3, borderColor: colors.text },
  sliderRow: { marginTop: space.md, justifyContent: 'center' },
  hueTrack: { position: 'absolute', left: 10, right: 10, height: 10, borderRadius: 5 },
  slider: { width: '100%', height: 40 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  value: { fontFamily: fonts.mono, fontSize: 13, color: colors.gold },
  reset: { marginTop: space.md, alignSelf: 'flex-start', paddingVertical: space.sm },
  resetText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold },
  note: { ...type.bodyMuted, fontSize: 13, marginTop: space.sm },
});
