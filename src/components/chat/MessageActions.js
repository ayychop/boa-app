import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sticker from './Sticker';
import { QUICK_REACTIONS } from '../../chat/stickers';
import { haptics } from '../../utils/haptics';
import { READING } from '../../hooks/useLayout';
import { colors, fonts, radius, space } from '../../theme';

/** What a message is, in a few words, for the preview and reply quotes. */
export function describeMessage(m) {
  if (!m) return '';
  if (m.kind === 'sticker') return `${m.body} Sticker`;
  if (m.view_once) return m.kind === 'video' ? 'View once video' : 'View once photo';
  if (m.kind === 'image') return m.body?.trim() ? `📷 ${m.body.trim()}` : '📷 Photo';
  if (m.kind === 'video') return m.body?.trim() ? `🎬 ${m.body.trim()}` : '🎬 Video';
  if (m.kind === 'voice') return '🎙️ Voice note';
  return m.body ?? '';
}

/**
 * Hold a message: it lifts out over a dimmed thread with a bar of animated
 * reactions above it and what you can do below. Report sits apart, under
 * the list, rather than among the everyday actions.
 */
export default function MessageActions({ message, mine, current, vibe, onReact, onMore, onReply, onRetry, onDelete, onReport, onClose }) {
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  if (!message) return null;
  const failed = !!message.failed;
  const pop = (i) => (still ? FadeIn.duration(120) : ZoomIn.delay(40 + i * 35).springify().damping(12).stiffness(220));
  const act = (fn) => () => {
    haptics.selection();
    onClose();
    fn?.();
  };
  const rows = [
    !failed && onReply ? { icon: 'arrow-undo-outline', label: 'Reply', onPress: act(onReply), testID: 'message-action-reply' } : null,
    failed && onRetry ? { icon: 'refresh', label: 'Try again', onPress: act(onRetry), testID: 'message-action-retry' } : null,
    mine && onDelete
      ? { icon: 'trash-outline', label: failed ? 'Delete' : 'Delete for both of you', onPress: act(onDelete), danger: true, testID: 'message-action-delete' }
      : null,
  ].filter(Boolean);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={StyleSheet.absoluteFill}>
        {Platform.OS === 'ios' ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} /> : null}
        <Pressable style={[StyleSheet.absoluteFill, styles.dim]} onPress={onClose} accessibilityLabel="Close" testID="message-actions-dismiss" />
        <View
          pointerEvents="box-none"
          style={[styles.stage, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }, mine ? styles.right : styles.left]}
          testID="message-actions"
        >
          {!failed ? (
            <Animated.View entering={still ? FadeIn : ZoomIn.springify().damping(14).stiffness(200)} style={styles.bar} accessibilityRole="toolbar" testID="message-reactions-bar">
              {QUICK_REACTIONS.map((emoji, i) => {
                const on = current === emoji;
                return (
                  <Animated.View key={emoji} entering={pop(i)}>
                    <Pressable
                      onPress={() => {
                        haptics.tap();
                        onReact(on ? null : emoji);
                        onClose();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={on ? `Remove ${emoji}` : `React ${emoji}`}
                      accessibilityState={{ selected: on }}
                      hitSlop={4}
                      style={({ pressed }) => [styles.reaction, on && { backgroundColor: vibe.accentSoft, borderColor: vibe.accentEdge }, pressed && styles.pressed]}
                      testID={`react-${emoji}`}
                    >
                      <Sticker emoji={emoji} size={34} />
                    </Pressable>
                  </Animated.View>
                );
              })}
              <Animated.View entering={pop(QUICK_REACTIONS.length)}>
                <Pressable
                  onPress={act(onMore)}
                  accessibilityRole="button"
                  accessibilityLabel="More reactions"
                  hitSlop={4}
                  style={({ pressed }) => [styles.more, pressed && styles.pressed]}
                  testID="react-more"
                >
                  <Ionicons name="add" size={22} color={colors.text} />
                </Pressable>
              </Animated.View>
            </Animated.View>
          ) : null}

          <Animated.View entering={still ? FadeIn : FadeInDown.springify().damping(16).stiffness(220)} style={[styles.preview, mine ? { borderColor: vibe.mineEdge } : null]}>
            <Text style={styles.previewText} numberOfLines={6}>
              {describeMessage(message)}
            </Text>
          </Animated.View>

          {rows.length ? (
            <Animated.View entering={still ? FadeIn : FadeInDown.delay(60).springify().damping(16).stiffness(220)} style={styles.menu}>
              {rows.map((r, i) => (
                <Pressable
                  key={r.label}
                  onPress={r.onPress}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}
                  testID={r.testID}
                >
                  <Text style={[styles.rowText, r.danger && styles.danger]}>{r.label}</Text>
                  <Ionicons name={r.icon} size={19} color={r.danger ? DANGER : colors.text} />
                </Pressable>
              ))}
            </Animated.View>
          ) : null}

          {!mine && onReport ? (
            <Animated.View entering={FadeIn.delay(180).duration(200)}>
              <Pressable onPress={act(onReport)} accessibilityRole="button" hitSlop={10} style={({ pressed }) => [styles.report, pressed && { opacity: 0.6 }]} testID="message-action-report">
                <Ionicons name="flag-outline" size={12} color={colors.textFaint} />
                <Text style={styles.reportText}>Report this message</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

const DANGER = '#FF6B6B';

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(5,5,6,0.72)' },
  // Same centred column as the thread behind it, so the held message stays where it was.
  stage: { flex: 1, justifyContent: 'center', paddingHorizontal: space.lg, gap: space.md, width: '100%', maxWidth: READING, alignSelf: 'center' },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(24,24,28,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    boxShadow: '0px 16px 40px rgba(0,0,0,0.55)',
  },
  reaction: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  more: { width: 40, height: 40, marginLeft: 2, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  pressed: { transform: [{ scale: 0.88 }] },
  preview: {
    maxWidth: '86%',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(30,30,36,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  previewText: { fontFamily: fonts.chat, fontSize: 15.5, lineHeight: 22, color: colors.text },
  menu: {
    width: 240,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(24,24,28,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0px 16px 40px rgba(0,0,0,0.5)',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, minHeight: 48 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  rowText: { fontFamily: fonts.chat, fontSize: 15, color: colors.text },
  danger: { color: DANGER },
  report: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm, paddingVertical: space.xs, marginTop: space.xs },
  reportText: { fontFamily: fonts.chat, fontSize: 12, color: colors.textFaint },
});
