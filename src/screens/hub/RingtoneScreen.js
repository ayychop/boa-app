import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useHub } from '../../context/HubContext';
import { RINGTONES, previewRingtone, stopPreview } from '../../calls/ringtone';
import { PageHeader } from '../../components/kit';
import { Slate } from '../../components/ui';
import { haptics } from '../../utils/haptics';
import { usePress } from '../../utils/motion';
import { colors, fonts, radius, space } from '../../theme';

// Three gold bars dancing while a preview plays.
function Bars() {
  const bars = [useSharedValue(0.4), useSharedValue(0.8), useSharedValue(0.55)];
  useEffect(() => {
    bars.forEach((b, i) => {
      b.value = withRepeat(withSequence(withTiming(1, { duration: 260 + i * 70 }), withTiming(0.3, { duration: 300 + i * 50 })), -1, true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.bars}>
      {bars.map((b, i) => (
        <Bar key={i} v={b} />
      ))}
    </View>
  );
}

function Bar({ v }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: v.value }] }));
  return <Animated.View style={[styles.bar, style]} />;
}

function Option({ tone, active, playing, onPick, onPlay, last }) {
  const press = usePress({ haptic: false });
  return (
    <Animated.View style={press.style}>
      <Pressable
        onPress={onPick}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="radio"
        accessibilityState={{ checked: active }}
        accessibilityLabel={tone.label}
        style={[styles.option, !last && styles.optionLine]}
        testID={`ringtone-${tone.id}`}
      >
        <View style={[styles.icon, active && styles.iconActive]}>
          <Ionicons name={tone.icon} size={20} color={active ? colors.bg : colors.gold} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.label, active && { color: colors.gold }]}>{tone.label}</Text>
          <Text style={styles.detail} numberOfLines={1}>
            {tone.detail}
          </Text>
        </View>
        <Pressable
          onPress={onPlay}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={playing ? `Stop ${tone.label}` : `Play ${tone.label}`}
          style={({ pressed }) => [styles.play, playing && styles.playOn, pressed && { opacity: 0.7 }]}
          testID={`ringtone-play-${tone.id}`}
        >
          {playing ? <Bars /> : <Ionicons name="play" size={16} color={colors.gold} style={{ marginLeft: 2 }} />}
        </Pressable>
        <View style={styles.check}>
          {active ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Ionicons name="checkmark-circle" size={24} color={colors.gold} testID={`ringtone-${tone.id}-selected`} />
            </Animated.View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Ringtone: which of BOA's four original ringtones an incoming call plays.
 * Play previews one; tapping a row makes it yours, on every phone you use.
 */
export default function RingtoneScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { ringtone, setRingtone } = useHub();
  const [playing, setPlaying] = useState(null);

  // Leaving the screen stops the preview.
  useEffect(() => () => stopPreview(), []);

  const play = (id) => {
    haptics.tap();
    if (playing === id) return stopPreview();
    setPlaying(id);
    previewRingtone(id, () => setPlaying((p) => (p === id ? null : p)));
  };

  const pick = (id) => {
    if (id === ringtone) return;
    haptics.selection();
    setRingtone?.(id).catch((err) => Alert.alert("Couldn't save", err.message));
  };

  return (
    <View style={styles.screen} testID="ringtone-screen">
      <LinearGradient colors={['rgba(226,168,75,0.16)', 'rgba(226,168,75,0)']} locations={[0, 0.45]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <PageHeader kicker="Calls" title="Ringtone" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }}>
        <Text style={styles.intro}>What plays when someone video calls you. Made for BOA, from the beat up.</Text>
        <Slate style={styles.section}>Your ringtone</Slate>
        <Animated.View entering={FadeInDown.springify().damping(20)} style={styles.card}>
          <BlurView intensity={30} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,22,0.6)' }]} />
          {RINGTONES.map((t, i) => (
            <Option key={t.id} tone={t} active={ringtone === t.id} playing={playing === t.id} onPick={() => pick(t.id)} onPlay={() => play(t.id)} last={i === RINGTONES.length - 1} />
          ))}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  intro: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  section: { marginTop: space.xl, marginBottom: space.md },
  card: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(246,211,138,0.35)' },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg, paddingHorizontal: space.lg },
  optionLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft },
  iconActive: { backgroundColor: colors.gold, boxShadow: '0px 0px 18px rgba(226,168,75,0.5)' },
  label: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  detail: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textFaint, marginTop: 2 },
  play: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(226,168,75,0.5)' },
  playOn: { backgroundColor: 'rgba(226,168,75,0.16)', borderColor: colors.gold },
  check: { width: 24, alignItems: 'center' },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 14 },
  bar: { width: 3, height: 14, borderRadius: 1.5, backgroundColor: colors.gold },
});
