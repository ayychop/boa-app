import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { WHATS_NEW, appVersion } from '../lib/whats-new';
import { Button, Slate } from './ui';
import { colors, fonts, radius, space, type } from '../theme';
import { SPRING } from '../utils/motion';

/**
 * The notes for this release in a dark glass card, once per update (see
 * lib/whats-new.ts). Closes with the X, "Got it", or a tap outside.
 */
export default function WhatsNewModal({ visible, onClose, notes = WHATS_NEW }) {
  const { width, height } = useWindowDimensions();
  if (!visible) return null;
  const cardWidth = Math.min(width - space.xl * 2, 440);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close what's new" testID="whats-new-backdrop">
        <BlurView intensity={25} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,5,6,0.55)' }]} />
      </Pressable>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          entering={ZoomIn.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)}
          style={[styles.card, { width: cardWidth, maxHeight: height * 0.8 }]}
          testID="whats-new"
        >
          <BlurView intensity={50} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(226,168,75,0.20)', 'rgba(17,17,19,0.70)', 'rgba(11,11,13,0.92)']}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.header}>
            <View style={{ flex: 1, gap: space.sm }}>
              <Slate dot>{`What's new · v${appVersion()}`}</Slate>
              <Text style={styles.headline}>{notes.headline}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {notes.notes.map((n, i) => (
              <Animated.View key={n.title} entering={FadeInDown.delay(120 + i * 70).duration(380)} style={styles.note}>
                <View style={styles.icon}>
                  <Ionicons name={n.icon} size={18} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.noteTitle}>{n.title}</Text>
                  <Text style={styles.noteBody}>{n.body}</Text>
                </View>
              </Animated.View>
            ))}
          </ScrollView>
          <Animated.View entering={FadeIn.delay(300)} style={styles.footer}>
            <Button label="Got it" onPress={onClose} testID="whats-new-done" />
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(11,11,13,0.6)',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.xl, paddingBottom: space.lg },
  headline: { ...type.title, fontSize: 24, lineHeight: 29 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,239,232,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  list: { paddingHorizontal: space.xl, gap: space.lg },
  note: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.3)',
  },
  noteTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, marginBottom: 2 },
  noteBody: { ...type.bodyMuted, fontSize: 13.5, lineHeight: 19.5 },
  footer: { padding: space.xl },
});
