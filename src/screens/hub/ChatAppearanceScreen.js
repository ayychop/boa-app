import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useHub } from '../../context/HubContext';
import useChatVibe from '../../chat/vibes';
import { DEFAULT_THEME, PALETTE, rgba, textOn } from '../../chat/bubbleTheme';
import { PageHeader } from '../../components/kit';
import { Button, Slate } from '../../components/ui';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space } from '../../theme';

const COLOR_MS = 420;
const STEP = 0.05;
const clamp = (v) => {
  'worklet';
  return Math.max(0, Math.min(1, v));
};

/** One colour in the palette: dips when touched, a gold ring when it's yours. */
function Swatch({ swatch, selected, onPress }) {
  const scale = useSharedValue(1);
  const ring = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    ring.value = withTiming(selected ? 1 : 0, { duration: 220 });
  }, [selected, ring]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value, transform: [{ scale: 0.85 + ring.value * 0.15 }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(0.86, { damping: 16, stiffness: 420 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 12, stiffness: 300 }))}
      accessibilityRole="radio"
      accessibilityLabel={swatch.label}
      accessibilityState={{ checked: selected }}
      style={styles.swatchCell}
      testID={`appearance-color-${swatch.id}`}
    >
      <Animated.View style={[styles.swatchWrap, style]}>
        <Animated.View pointerEvents="none" style={[styles.swatchRing, ringStyle]} />
        <View style={[styles.swatch, { backgroundColor: swatch.color, boxShadow: `0px 0px 14px ${rgba(swatch.color, 0.45)}` }]}>
          {selected ? <Ionicons name="checkmark" size={18} color={textOn(swatch.color, 0, '#000000')} /> : null}
        </View>
      </Animated.View>
      <Text style={[styles.swatchLabel, selected && { color: colors.gold }]} numberOfLines={1}>
        {swatch.label}
      </Text>
    </Pressable>
  );
}

/**
 * Transparency, 0 (solid) to 1 (clear). The value lives on the UI thread so
 * the preview follows the thumb frame for frame; onChange hears where it
 * settles. Touch anywhere on the track to jump there.
 */
function TransparencySlider({ value, onChange }) {
  const width = useSharedValue(1);
  const pressed = useSharedValue(0);
  const [pct, setPct] = useState(Math.round(value.value * 100));
  const show = (v) => setPct(Math.round(v * 100));
  const set = (x) => {
    'worklet';
    const v = Math.round(clamp(x / width.value) / 0.01) * 0.01;
    if (v !== value.value) {
      value.value = v;
      scheduleOnRN(show, v);
    }
  };
  const pan = usePanGesture({
    minDistance: 0,
    onBegin: (e) => {
      'worklet';
      pressed.value = withSpring(1, { damping: 14, stiffness: 320 });
      set(e.x);
    },
    onUpdate: (e) => {
      'worklet';
      set(e.x);
    },
    onFinalize: () => {
      'worklet';
      pressed.value = withSpring(0, { damping: 14, stiffness: 320 });
      scheduleOnRN(onChange, value.value);
    },
  });
  const fill = useAnimatedStyle(() => ({ width: value.value * width.value }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: value.value * width.value - 14 }, { scale: 1 + pressed.value * 0.18 }] }));
  const step = (d) => {
    const v = Math.round(clamp(value.value + d) * 100) / 100;
    value.value = withTiming(v, { duration: 160 });
    show(v);
    onChange(v);
  };
  return (
    <View>
      <View style={styles.sliderHead}>
        <Text style={styles.sliderLabel}>Transparency</Text>
        <Text style={styles.sliderValue} testID="appearance-transparency-value">
          {pct}%
        </Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          style={styles.track}
          onLayout={(e) => {
            width.value = Math.max(1, e.nativeEvent.layout.width);
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Transparency"
          accessibilityValue={{ min: 0, max: 100, now: pct, text: `${pct}%` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? STEP : -STEP)}
          testID="appearance-transparency"
        >
          <View style={styles.rail} />
          <Animated.View style={[styles.railFill, fill]}>
            <LinearGradient colors={['#9A6A22', '#E2A84B', '#F6D38A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Animated.View style={[styles.thumb, thumb]} />
        </View>
      </GestureDetector>
      <View style={styles.sliderEnds}>
        <Text style={styles.sliderEnd}>Solid</Text>
        <Text style={styles.sliderEnd}>Glass</Text>
      </View>
    </View>
  );
}

// A band of light that sweeps across the bubble every few seconds.
function Shine() {
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withSequence(withTiming(0, { duration: 0 }), withDelay(1400, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }))), -1, false);
  }, [x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -180 + x.value * 520 }, { rotate: '18deg' }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.shine, style]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/**
 * Chat Appearance: the colour and glass of your own message bubbles. Pick
 * from BOA's palette, set how much of the chat shows through, and watch the
 * preview change as you go. Saved to your profile, so every phone you use
 * shows it; text on the bubble turns black or white to stay readable.
 */
export default function ChatAppearanceScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { chatTheme, setChatTheme } = useHub();
  const { vibe } = useChatVibe();
  const backdrop = vibe.mesh[1];
  const start = chatTheme ?? DEFAULT_THEME;
  const [color, setColor] = useState(start.color);
  const [transparency, setTransparency] = useState(start.transparency);
  const [saving, setSaving] = useState(false);

  // The preview: a colour transition (from, to, progress) and the slider's value, all on the UI thread.
  const from = useSharedValue(start.color);
  const to = useSharedValue(start.color);
  const progress = useSharedValue(1);
  const clear = useSharedValue(start.transparency);
  const leave = useSharedValue(0);

  const pick = (hex) => {
    if (hex === color) return;
    haptics.selection();
    from.value = to.value;
    to.value = hex;
    progress.value = 0;
    progress.value = withTiming(1, { duration: COLOR_MS, easing: Easing.out(Easing.cubic) });
    setColor(hex);
  };

  const bubble = useAnimatedStyle(() => {
    const a = 1 - clear.value;
    return {
      backgroundColor: interpolateColor(progress.value, [0, 1], [rgba(from.value, a), rgba(to.value, a)]),
      borderColor: interpolateColor(progress.value, [0, 1], [rgba(from.value, Math.min(1, a + 0.35)), rgba(to.value, Math.min(1, a + 0.35))]),
    };
  });
  const text = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [textOn(from.value, clear.value, backdrop), textOn(to.value, clear.value, backdrop)]),
  }));
  const card = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ scale: 1 - leave.value * 0.08 }] }));

  const save = async () => {
    setSaving(true);
    try {
      await setChatTheme({ color, transparency });
    } catch (err) {
      setSaving(false);
      Alert.alert("Couldn't save", err.message);
      return;
    }
    haptics.success();
    const done = () => navigation.goBack();
    leave.value = withSequence(withTiming(-0.04, { duration: 110 }), withTiming(1, { duration: 300, easing: Easing.in(Easing.cubic) }, (finished) => finished && scheduleOnRN(done)));
  };

  const reset = async () => {
    try {
      await setChatTheme(null);
      haptics.tap();
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save", err.message);
    }
  };

  const a = 1 - transparency;
  return (
    <View style={styles.screen} testID="chat-appearance">
      <PageHeader kicker="Chat" title="Chat Appearance" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        {/* Live preview, over your chat vibe's own backdrop. */}
        <Animated.View style={[styles.preview, card]} testID="appearance-preview">
          <LinearGradient colors={vibe.mesh} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={[styles.theirs, { backgroundColor: vibe.theirsFill, borderColor: vibe.theirsEdge }]}>
            <Text style={styles.theirsText}>You changed your bubbles? 👀</Text>
          </View>
          <View style={styles.mineRow}>
            {/* The glow: a soft halo in your colour, crossfading when it changes. */}
            <Animated.View
              key={`${color}-${transparency}`}
              entering={FadeIn.duration(COLOR_MS)}
              exiting={FadeOut.duration(COLOR_MS)}
              pointerEvents="none"
              style={[styles.glow, { boxShadow: `0px 0px 34px 6px ${rgba(color, 0.25 + 0.35 * a)}` }]}
            />
            <Animated.View style={[styles.mine, bubble]} testID="appearance-bubble">
              <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
              <Shine />
              <Animated.Text style={[styles.mineText, text]}>My vibe, my colours ✨</Animated.Text>
              <Animated.Text style={[styles.mineMeta, text]}>now · Seen</Animated.Text>
            </Animated.View>
          </View>
        </Animated.View>

        <View style={styles.body}>
          <Slate style={styles.section}>Colour</Slate>
          <View style={styles.palette} accessibilityRole="radiogroup">
            {PALETTE.map((s) => (
              <Swatch key={s.id} swatch={s} selected={color === s.color} onPress={() => pick(s.color)} />
            ))}
          </View>

          <Slate style={styles.section}>Glass</Slate>
          <TransparencySlider value={clear} onChange={setTransparency} />
          <Text style={styles.note}>Text on your bubbles switches between black and white to stay readable, whatever you choose.</Text>

          <Button label={saving ? 'Saving…' : 'Save'} icon="checkmark" onPress={save} disabled={saving} style={{ marginTop: space.xl }} testID="appearance-save" />
          {chatTheme ? (
            <Pressable onPress={reset} accessibilityRole="button" style={styles.reset} testID="appearance-reset">
              <Text style={styles.resetText}>Use my chat vibe's colours</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  preview: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.lg,
    paddingVertical: space.xl,
    gap: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246,211,138,0.3)',
  },
  theirs: { alignSelf: 'flex-start', maxWidth: '78%', borderRadius: 20, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  theirsText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: colors.text },
  mineRow: { alignItems: 'flex-end' },
  glow: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '72%', borderRadius: 22 },
  mine: { maxWidth: '82%', borderRadius: 22, borderBottomRightRadius: 6, borderWidth: 1, overflow: 'hidden', paddingHorizontal: space.lg, paddingVertical: space.md },
  mineText: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23 },
  mineMeta: { fontFamily: fonts.medium, fontSize: 11, marginTop: 4, opacity: 0.65, alignSelf: 'flex-end' },
  shine: { position: 'absolute', top: -40, bottom: -40, width: 60 },
  body: { paddingHorizontal: space.lg },
  section: { marginTop: space.xl, marginBottom: space.md },
  palette: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md },
  swatchCell: { width: '20%', alignItems: 'center', gap: 6 },
  swatchWrap: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  swatchRing: { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: colors.gold },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)' },
  swatchLabel: { fontFamily: fonts.medium, fontSize: 10.5, color: colors.textFaint, textAlign: 'center' },
  sliderHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sliderLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  sliderValue: { fontFamily: fonts.mono, fontSize: 13, color: colors.gold, fontVariant: ['tabular-nums'] },
  track: { height: 44, justifyContent: 'center', marginTop: space.sm, marginHorizontal: 14 },
  rail: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: 'rgba(243,239,232,0.12)' },
  railFill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, overflow: 'hidden' },
  thumb: { position: 'absolute', left: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#F6D38A', borderWidth: 2, borderColor: '#FFF6E2', boxShadow: '0px 0px 14px rgba(226,168,75,0.55)' },
  sliderEnds: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 4 },
  sliderEnd: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.textFaint, textTransform: 'uppercase' },
  note: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18, color: colors.textMuted, marginTop: space.lg },
  reset: { alignSelf: 'center', padding: space.md, marginTop: space.sm },
  resetText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.textMuted, textDecorationLine: 'underline' },
});
