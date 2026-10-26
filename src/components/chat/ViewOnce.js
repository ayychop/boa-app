import { useEffect } from 'react';
import { ActivityIndicator, BackHandler, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { setSecure } from '../../../modules/boa-screen';
import { claim, register } from '../../audio/focus';
import BottomSheet from '../BottomSheet';
import { Toggle } from '../kit';
import { Button } from '../ui';
import { colors, fonts, radius, space, type } from '../../theme';

/** The "1" in a ring that marks view-once media everywhere. */
export function OnceMark({ size = 22, color = colors.gold, dim = false }) {
  return (
    <View
      style={[styles.mark, { width: size, height: size, borderRadius: size / 2, borderColor: color, opacity: dim ? 0.55 : 1 }, dim && { borderStyle: 'dashed' }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.markText, { color, fontSize: Math.round(size * 0.52), lineHeight: Math.round(size * 0.7) }]}>1</Text>
    </View>
  );
}

/**
 * A view-once photo or video in a bubble. Never a preview: just what it is
 * and whether it's been opened. The person it was sent to taps to open it
 * (once); the sender sees whether they have.
 */
export function ViewOnceTile({ message, mine, onOpen, opening, accent = colors.gold, textColor = colors.text }) {
  const video = message.kind === 'video';
  const opened = !!message.viewed_at;
  const what = video ? 'Video' : 'Photo';
  const label = message.pending ? `Sending ${what.toLowerCase()}` : opened ? 'Opened' : mine ? what : `${what}, view once`;
  const canOpen = !mine && !opened && !message.pending && !message.failed;
  return (
    <Pressable
      onPress={canOpen ? () => onOpen?.(message) : undefined}
      disabled={!canOpen || opening}
      accessibilityRole={canOpen ? 'button' : 'text'}
      accessibilityLabel={canOpen ? `View once ${what.toLowerCase()}. Open` : `View once ${what.toLowerCase()}, ${opened ? 'opened' : 'not opened yet'}`}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}
      testID={`view-once-${message.id}`}
    >
      {opening ? <ActivityIndicator size="small" color={accent} /> : <OnceMark color={accent} dim={opened} />}
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.tileTitle, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.tileSub, { color: textColor }]} numberOfLines={1}>
          {mine ? (opened ? `They've seen your ${what.toLowerCase()}` : 'View once · not opened yet') : opened ? 'No longer available' : 'Tap to open'}
        </Text>
      </View>
    </Pressable>
  );
}

function OnceVideo({ url }) {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = false;
    p.play();
  });
  useEffect(() => {
    claim('chat-video');
    return register('chat-video', () => player.pause());
  }, [player]);
  // No native controls: nothing to save, share or replay from.
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

/**
 * A view-once photo or video, full screen. Drawn inside the app's own
 * window (not a Modal, which on Android is a window of its own) so
 * FLAG_SECURE covers it: screenshots and recordings come out black while
 * it's open. Closing it is the end of it.
 */
export function ViewOnceViewer({ item, onClose }) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!item) return undefined;
    setSecure(true);
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => {
      sub.remove();
      setSecure(false);
    };
  }, [item, onClose]);
  if (!item) return null;
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.viewer} testID="view-once-viewer">
      {item.kind === 'video' ? <OnceVideo url={item.url} /> : <Image source={{ uri: item.url }} style={StyleSheet.absoluteFill} resizeMode="contain" />}
      <View style={[styles.viewerTop, { top: insets.top + space.md }]}>
        <View style={styles.viewerBadge}>
          <OnceMark size={18} />
          <Text style={styles.viewerBadgeText}>View once</Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={styles.close} testID="view-once-close">
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/**
 * Before a photo or video goes: a look at it, and the View once switch.
 * `file` is what was picked ({ kind, uri, ... }).
 */
export function SendMediaSheet({ file, viewOnce, onViewOnce, onCancel, onSend }) {
  const video = file?.kind === 'video';
  return (
    <BottomSheet open={!!file} onClose={onCancel} glass>
      <View style={styles.sheet} testID="send-media-sheet">
        <Text style={styles.sheetKicker}>{video ? 'Send video' : 'Send photo'}</Text>
        <View style={styles.preview}>
          {file && !video ? <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          {video ? <Ionicons name="videocam" size={34} color={colors.textMuted} /> : null}
          {viewOnce ? (
            <View style={styles.previewOnce}>
              <OnceMark size={26} color={colors.text} />
            </View>
          ) : null}
        </View>
        <View style={styles.onceRow}>
          <OnceMark size={24} />
          <View style={{ flex: 1 }}>
            <Text style={styles.onceTitle}>View once</Text>
            <Text style={[type.bodyMuted, styles.onceBody]}>
              They can open it once. Then it's deleted, and screenshots are blocked on Android.
            </Text>
          </View>
          <Toggle value={viewOnce} onChange={onViewOnce} label="View once" testID="send-view-once" />
        </View>
        <View style={styles.sheetActions}>
          <Button label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
          <Button label="Send" icon="arrow-up" onPress={onSend} style={{ flex: 1 }} testID="send-media" />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  mark: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: fonts.extrabold, includeFontPadding: false, textAlign: 'center' },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 190, paddingHorizontal: space.xs, paddingVertical: space.sm },
  tileTitle: { fontFamily: fonts.semibold, fontSize: 15 },
  tileSub: { fontFamily: fonts.medium, fontSize: 12, opacity: 0.7, marginTop: 2 },
  viewer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 50, elevation: 50 },
  viewerTop: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(5,5,6,0.6)',
  },
  viewerBadgeText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.6)' },
  sheet: { paddingHorizontal: space.xl, paddingTop: space.sm },
  sheetKicker: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.gold, marginBottom: space.md },
  preview: {
    height: 200,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  previewOnce: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.55)' },
  onceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  onceTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  onceBody: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  sheetActions: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
});
