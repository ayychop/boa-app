import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { onWakeAsk } from '../../calls/wakeUp';
import { Button, Slate } from '../ui';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space } from '../../theme';

// What full-screen calls give you, one line each.
const POINTS = [
  { icon: 'lock-open-outline', text: 'Calls light up your screen, even when your phone is locked.' },
  { icon: 'call-outline', text: 'Answer or decline in one tap, like a normal phone call.' },
  { icon: 'shield-checkmark-outline', text: 'Only for calls. BOA never takes over your screen for anything else.' },
];

/**
 * BOA's own ask for Android 14+'s full-screen calls setting (src/calls/wakeUp.js
 * decides when): why it matters, and one button straight into the system
 * setting. Back from Settings, it checks again and says so when it's on.
 * Mounted once, at the root of the app.
 */
export default function CallWakeUpPrompt() {
  const [step, setStep] = useState(null);
  const [allowed, setAllowed] = useState(false);
  const done = useRef(null);

  useEffect(
    () =>
      onWakeAsk((next, finish) => {
        done.current = finish;
        setAllowed(false);
        setStep(next);
      }),
    [],
  );

  const close = () => {
    setStep(null);
    done.current?.();
    done.current = null;
  };

  const open = () => {
    haptics.selection();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      sub.remove();
      if (step?.ok()) {
        haptics.success();
        setAllowed(true);
        setTimeout(close, 1400);
      } else close();
    });
    step?.open();
  };

  return (
    <Modal visible={!!step} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.scrim}>
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.card} testID="call-wake-prompt">
          <LinearGradient colors={['rgba(226,168,75,0.18)', 'rgba(226,168,75,0)']} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
          <View style={styles.badge}>
            <LinearGradient colors={['#FBE3A6', colors.gold, colors.goldDeep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.badgeFill}>
              <Ionicons name={allowed ? 'checkmark' : 'call'} size={28} color={colors.bg} />
            </LinearGradient>
          </View>
          <Slate dot style={{ alignSelf: 'center' }}>
            Full-screen calls
          </Slate>
          {allowed ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Text style={styles.title}>You're all set.</Text>
              <Text style={styles.body}>BOA calls will now ring full screen, even on your lock screen.</Text>
            </Animated.View>
          ) : (
            <>
              <Text style={styles.title}>Never miss a BOA call.</Text>
              <Text style={styles.body}>Android keeps calls from showing full screen until you allow it. Without it, a call on a locked phone is just a notification, and easy to miss.</Text>
              <View style={styles.points}>
                {POINTS.map((p) => (
                  <View key={p.icon} style={styles.point}>
                    <Ionicons name={p.icon} size={18} color={colors.gold} />
                    <Text style={styles.pointText}>{p.text}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.how}>In Settings, switch on "Allow full screen notifications" for BOA, then come back.</Text>
              <Button label="Open Settings" icon="settings-outline" onPress={open} style={{ marginTop: space.lg }} testID="call-wake-open" />
              <Pressable onPress={close} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [styles.later, pressed && { opacity: 0.6 }]} testID="call-wake-later">
                <Text style={styles.laterText}>Not now</Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(5,5,6,0.78)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: {
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.35)',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.lg,
  },
  badge: { alignSelf: 'center', marginBottom: space.md, borderRadius: 36, padding: 4, backgroundColor: 'rgba(226,168,75,0.14)' },
  badgeFill: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.text, letterSpacing: -0.6, textAlign: 'center', marginTop: space.sm },
  body: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginTop: space.sm },
  points: { marginTop: space.lg, gap: space.md },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  pointText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.text },
  how: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: colors.textFaint, textAlign: 'center', marginTop: space.lg },
  later: { alignSelf: 'center', paddingVertical: space.md, paddingHorizontal: space.xl, marginTop: space.xs },
  laterText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted },
});
