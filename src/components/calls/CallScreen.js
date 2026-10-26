import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useCall, END_REASONS } from '../../context/CallContext';
import { FILTERS, describe } from '../../calls/beauty';
import { LocalVideo, RemoteVideo } from '../../calls/media';
import { Avatar, Toggle } from '../kit';
import { GoldBadge } from '../ui';
import { colors, fonts, radius, space } from '../../theme';

const RED = '#FF3B4E';
const VIDEO_NOTE = {
  connecting: 'Connecting HD video',
  reconnecting: 'Reconnecting',
  failed: "Video couldn't connect",
};
const GREEN = '#2BD576';

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

function useElapsed(startedAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt ? now - startedAt : 0;
}

// Gold rings breathing out from the avatar while it rings.
function Ripple({ size, delay = 0 }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const start = setTimeout(() => {
      t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false);
    }, delay);
    return () => clearTimeout(start);
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - t.value), transform: [{ scale: 1 + t.value * 0.7 }] }));
  return <Animated.View pointerEvents="none" style={[styles.ripple, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

function Control({ icon, label, onPress, on = false, tone, big = false, testID }) {
  const size = big ? 72 : 58;
  return (
    <View style={styles.control}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        testID={testID}
        style={({ pressed }) => [
          styles.controlBtn,
          { width: size, height: size, borderRadius: size / 2 },
          tone ? { backgroundColor: tone, borderColor: tone } : on && styles.controlOn,
          pressed && { transform: [{ scale: 0.92 }] },
        ]}
      >
        {!tone && !on ? <BlurView intensity={30} tint="dark" blurMethod="dimezisBlurView" style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} /> : null}
        <Ionicons name={icon} size={big ? 30 : 24} color={tone ? '#fff' : on ? colors.bg : colors.text} />
      </Pressable>
      <Text style={styles.controlLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function BeautyPanel({ beauty, setBeauty, onClose, width }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown.duration(160)} style={[styles.panel, { width }]} testID="call-filters">
      <BlurView intensity={50} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.55)' }]} />
      <View style={styles.panelHead}>
        <Ionicons name="sparkles" size={16} color={colors.gold} />
        <Text style={styles.panelTitle}>BOA Filters</Text>
        <View style={{ flex: 1 }} />
        <Toggle value={beauty.enabled} onChange={(v) => setBeauty({ enabled: v })} label="Filters on" testID="call-filters-toggle" />
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close filters" style={{ marginLeft: space.md }}>
          <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.panelNote}>Tuned for melanin-rich skin: smoother and richer, never lighter.</Text>
      {FILTERS.map((f) => (
        <View key={f.id} style={[styles.filter, !beauty.enabled && { opacity: 0.4 }]}>
          <View style={styles.filterHead}>
            <Ionicons name={f.icon} size={16} color={colors.gold} />
            <Text style={styles.filterLabel}>{f.label}</Text>
            <Text style={styles.filterValue}>{Math.round(beauty[f.id] * 100)}%</Text>
          </View>
          <Text style={styles.filterDetail}>{f.detail}</Text>
          <Slider
            style={{ height: 36, marginHorizontal: -4 }}
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={beauty[f.id]}
            disabled={!beauty.enabled}
            onValueChange={(v) => setBeauty({ [f.id]: v })}
            minimumTrackTintColor={colors.gold}
            maximumTrackTintColor="rgba(243,239,232,0.18)"
            thumbTintColor={colors.gold}
            accessibilityLabel={f.label}
            testID={`call-filter-${f.id}`}
          />
        </View>
      ))}
    </Animated.View>
  );
}

/**
 * The BOA video call screen: dark glass over the other person's picture.
 * Incoming: answer or decline. Ringing out, live and ended: mute, camera,
 * filters, speaker and end. Shown whenever a call is in progress.
 */
export default function CallScreen({ me }) {
  const { call, controls, video, beauty, setBeauty, accept, decline, hangUp, toggle } = useCall();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const elapsed = useElapsed(call?.phase === 'active' ? call.startedAt : null);
  useEffect(() => {
    if (!call) setFiltersOpen(false);
  }, [call]);
  if (!call) return null;

  const { peer, phase, direction } = call;
  const incoming = direction === 'in' && phase === 'ringing';
  const status =
    phase === 'ended'
      ? END_REASONS[call.reason] ?? END_REASONS.ended
      : phase === 'active'
        ? clock(elapsed)
        : incoming
          ? 'Incoming video call'
          : 'Ringing…';
  const avatar = Math.min(150, width * 0.36);
  const pip = { width: Math.min(120, width * 0.28), height: Math.min(168, width * 0.39) };
  const panelWidth = Math.min(width - space.lg * 2, 480);
  // Their picture fills the screen once it's flowing; until then, their photo.
  const theirs = phase === 'active' && video?.remoteUid != null && video.remoteVideo;
  const note = phase === 'active' ? (video?.remoteUid == null && video?.status === 'connected' ? 'Waiting for their video' : VIDEO_NOTE[video?.status]) : null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={incoming ? decline : hangUp}>
      <View style={styles.screen} testID="call-screen">
        {/* Their picture, blurred, fills the screen until their video does. */}
        {theirs ? (
          <RemoteVideo uid={video.remoteUid} style={StyleSheet.absoluteFill} />
        ) : peer.avatar_url ? (
          <Image source={{ uri: peer.avatar_url }} blurRadius={40} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} resizeMode="cover" />
        ) : null}
        {/* Over live video, only enough shade at the edges to read the controls. */}
        <LinearGradient
          pointerEvents="none"
          colors={theirs ? ['rgba(5,5,6,0.45)', 'rgba(5,5,6,0)', 'rgba(5,5,6,0.65)'] : ['rgba(5,5,6,0.55)', 'rgba(5,5,6,0.2)', 'rgba(5,5,6,0.9)']}
          locations={theirs ? [0, 0.3, 1] : [0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        {!theirs ? <LinearGradient colors={['rgba(226,168,75,0.22)', 'rgba(226,168,75,0)']} locations={[0, 0.5]} style={StyleSheet.absoluteFill} /> : null}

        <View style={[styles.top, { paddingTop: insets.top + space.lg }]}>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>BOA VIDEO</Text>
            <GoldBadge label="HD" />
          </View>
        </View>

        {theirs ? (
          <View style={[styles.liveHead, { top: insets.top + space.xxl + space.sm }]}>
            <Text style={styles.liveName} numberOfLines={1} testID="call-name">
              {peer.name}
            </Text>
            <Text style={styles.liveClock} testID="call-status">
              {status}
            </Text>
          </View>
        ) : (
          <View style={[styles.center, { marginTop: height * 0.08 }]}>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              {phase === 'ringing' ? (
                <>
                  <Ripple size={avatar} />
                  <Ripple size={avatar} delay={800} />
                </>
              ) : null}
              <View style={styles.avatarRing}>
                <Avatar uri={peer.avatar_url} name={peer.name} size={avatar} ring />
              </View>
            </View>
            <Text style={styles.name} numberOfLines={2} testID="call-name">
              {peer.name}
            </Text>
            <Animated.Text key={phase} entering={FadeIn.duration(250)} style={[styles.status, phase === 'ended' && { color: colors.textMuted }]} testID="call-status">
              {status}
            </Animated.Text>
            {note ? (
              <Text style={styles.pending} testID="call-video-note">
                {note}
              </Text>
            ) : null}
          </View>
        )}

        {/* You, in the corner. */}
        {!incoming && phase !== 'ended' ? (
          <Animated.View entering={FadeIn.delay(150)} style={[styles.pip, pip, { top: insets.top + space.xxl + space.lg }]} testID="call-self-view">
            <BlurView intensity={40} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
            {controls.cameraOff ? (
              <Ionicons name="videocam-off" size={26} color={colors.textMuted} />
            ) : (
              <>
                <Avatar uri={me?.avatar_url} name={me?.name ?? 'You'} size={pip.width * 0.56} />
                <LocalVideo style={StyleSheet.absoluteFill} />
              </>
            )}
            {beauty.enabled && !controls.cameraOff ? (
              <View style={styles.pipTag}>
                <Ionicons name="sparkles" size={10} color={colors.gold} />
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.xl }]}>
          {filtersOpen && phase !== 'ended' && !incoming ? (
            <BeautyPanel beauty={beauty} setBeauty={setBeauty} onClose={() => setFiltersOpen(false)} width={panelWidth} />
          ) : null}
          {incoming ? (
            <View style={styles.answerRow}>
              <Control icon="close" label="Decline" tone={RED} big onPress={decline} testID="call-decline" />
              <Control icon="videocam" label="Accept" tone={GREEN} big onPress={accept} testID="call-accept" />
            </View>
          ) : phase !== 'ended' ? (
            <>
              {!filtersOpen ? (
                <Text style={styles.filterLine} numberOfLines={1}>
                  {describe(beauty)}
                </Text>
              ) : null}
              <View style={styles.controls}>
                <Control icon={controls.muted ? 'mic-off' : 'mic'} label={controls.muted ? 'Unmute' : 'Mute'} on={controls.muted} onPress={() => toggle('muted')} testID="call-mute" />
                <Control icon={controls.cameraOff ? 'videocam-off' : 'videocam'} label={controls.cameraOff ? 'Camera on' : 'Camera off'} on={controls.cameraOff} onPress={() => toggle('cameraOff')} testID="call-camera" />
                <Control icon="sparkles" label="Filters" on={filtersOpen} onPress={() => setFiltersOpen((o) => !o)} testID="call-filters-button" />
                <Control icon={controls.speaker ? 'volume-high' : 'ear'} label={controls.speaker ? 'Speaker' : 'Phone'} onPress={() => toggle('speaker')} testID="call-speaker" />
                <Control icon="call" label="End" tone={RED} onPress={hangUp} testID="call-end" />
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050506' },
  top: { alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brand: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 3, color: 'rgba(246,211,138,0.9)' },
  center: { alignItems: 'center', paddingHorizontal: space.xl },
  ripple: { position: 'absolute', borderWidth: 1.5, borderColor: colors.gold },
  avatarRing: { borderRadius: 999, boxShadow: '0px 0px 40px rgba(226,168,75,0.45)' },
  name: { fontFamily: fonts.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -1, color: colors.text, marginTop: space.xl, textAlign: 'center' },
  status: { fontFamily: fonts.medium, fontSize: 16, color: '#F6D38A', marginTop: space.sm, fontVariant: ['tabular-nums'] },
  liveHead: { position: 'absolute', left: space.lg, right: space.lg + 130, gap: 2 },
  liveName: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.4, color: colors.text, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 },
  liveClock: { fontFamily: fonts.mono, fontSize: 13, color: '#F6D38A', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 },
  pending: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.2, color: colors.textFaint, marginTop: space.md, textAlign: 'center', textTransform: 'uppercase' },
  pip: {
    position: 'absolute',
    right: space.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(246,211,138,0.45)',
    backgroundColor: 'rgba(18,18,22,0.5)',
  },
  pipTag: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.7)' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: space.lg, gap: space.lg },
  filterLine: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.textMuted, textTransform: 'uppercase' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: space.md, flexWrap: 'wrap' },
  answerRow: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', maxWidth: 420, width: '100%' },
  control: { alignItems: 'center', gap: 6, minWidth: 58 },
  controlBtn: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(243,239,232,0.25)', backgroundColor: 'rgba(243,239,232,0.08)' },
  controlOn: { backgroundColor: colors.text, borderColor: colors.text },
  controlLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted },
  panel: { borderRadius: radius.xl, overflow: 'hidden', padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(246,211,138,0.4)' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  panelTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  panelNote: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: space.xs },
  filter: { marginTop: space.md },
  filterHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  filterLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  filterValue: { fontFamily: fonts.mono, fontSize: 12, color: colors.gold, fontVariant: ['tabular-nums'] },
  filterDetail: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textFaint, marginTop: 2 },
});
