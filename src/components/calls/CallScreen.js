import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, FadeOutDown, SlideInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useCall, END_REASONS } from '../../context/CallContext';
import { FILTERS, describe } from '../../calls/beauty';
import { LocalVideo, RemoteVideo } from '../../calls/media';
import { haptics } from '../../utils/haptics';
import { Avatar, Toggle } from '../kit';
import { GoldBadge } from '../ui';
import { colors, fonts, radius, space } from '../../theme';

const RED = '#FF3B4E';
const GREEN = '#2BD576';
const GOLD_LIGHT = '#F6D38A';
const VIDEO_NOTE = {
  connecting: 'Connecting HD video',
  reconnecting: 'Reconnecting',
  failed: "Video couldn't connect",
};
const PRESS = { damping: 18, stiffness: 420 };
const SNAP = { damping: 20, stiffness: 220 };
const BAR_ROOM = 112; // the control bar and its gap, kept clear of your picture
const BAR_PAD = 10;
const BAR_GAP = 6;
const PILL_ROOM = 44; // the privacy pill, when it's showing

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
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - t.value), transform: [{ scale: 1 + t.value * 0.7 }] }));
  return <Animated.View pointerEvents="none" style={[styles.ripple, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

// The avatar's gold ring, gently swelling like a heartbeat while it rings.
function PulseRing({ size, children }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.55 + t.value * 0.45, transform: [{ scale: 1 + t.value * 0.06 }] }));
  const pad = 8;
  return (
    <View style={{ width: size + pad * 2, height: size + pad * 2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[styles.pulseRing, { width: size + pad * 2, height: size + pad * 2, borderRadius: size }, ring]} />
      {children}
    </View>
  );
}

/** A round button that dips when touched and taps back through the phone. */
function CallButton({ icon, label, onPress, on = false, onColor, tone, size = 52, iconSize, glow, ring, testID }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fill = tone ? { backgroundColor: tone } : on ? (onColor ? { backgroundColor: onColor } : styles.buttonOn) : styles.buttonGlass;
  return (
    <Pressable
      onPressIn={() => {
        haptics.tap();
        scale.value = withSpring(0.88, PRESS);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS);
      }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      hitSlop={4}
      testID={testID}
    >
      <Animated.View
        style={[styles.button, { width: size, height: size, borderRadius: size / 2 }, fill, glow && { boxShadow: glow }, ring && { borderWidth: 2, borderColor: ring }, style]}
      >
        <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.44)} color={tone ? '#fff' : on ? colors.bg : colors.text} />
      </Animated.View>
    </Pressable>
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
      <Text style={styles.panelNote}>Tuned for melanin-rich skin: smoother and richer, with your skin tone protected.</Text>
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
 * You, floating over their picture. Starts top right; drag it anywhere and
 * it springs to the nearest corner, clear of the controls.
 */
function SelfView({ size, top, bottomRoom, width, height, children }) {
  const margin = space.lg;
  const minX = -(width - size.width - margin * 2);
  const maxY = Math.max(0, height - top - size.height - bottomRoom);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const from = useSharedValue({ x: 0, y: 0 });
  // A fold or rotation moves the corners: stay in the same one.
  useEffect(() => {
    x.value = x.value < minX / 2 ? minX : 0;
    y.value = y.value > maxY / 2 ? maxY : 0;
  }, [minX, maxY, x, y]);
  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      from.value = { x: x.value, y: y.value };
    },
    onUpdate: (e) => {
      'worklet';
      x.value = from.value.x + e.translationX;
      y.value = from.value.y + e.translationY;
    },
    onDeactivate: (e) => {
      'worklet';
      // Where a flick was heading decides the corner, not just where it let go.
      const px = x.value + e.velocityX * 0.12;
      const py = y.value + e.velocityY * 0.12;
      x.value = withSpring(Math.abs(px - minX) < Math.abs(px) ? minX : 0, { ...SNAP, velocity: e.velocityX });
      y.value = withSpring(Math.abs(py - maxY) < Math.abs(py) ? maxY : 0, { ...SNAP, velocity: e.velocityY });
    },
  });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View entering={FadeIn.delay(150).duration(300)} style={[styles.pip, size, { top, right: margin }, style]} testID="call-self-view">
        <View style={styles.pipInner}>{children}</View>
      </Animated.View>
    </GestureDetector>
  );
}

// Their picture arrives under a black veil that lifts, so it fades in.
// (A veil on top, because Android's video surface ignores its parent's opacity.)
function TheirVideo({ uid }) {
  const veil = useSharedValue(1);
  useEffect(() => {
    veil.value = withTiming(0, { duration: 650, easing: Easing.out(Easing.cubic) });
  }, [veil]);
  const style = useAnimatedStyle(() => ({ opacity: veil.value }));
  return (
    <>
      <RemoteVideo uid={uid} style={StyleSheet.absoluteFill} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#050506' }, style]} />
    </>
  );
}

function Incoming({ peer, status, width, onAccept, onDecline }) {
  const avatar = Math.min(168, width * 0.42);
  return (
    <View style={styles.incoming}>
      <Animated.View entering={FadeInDown.springify().damping(20)} style={[styles.card, { width: Math.min(width - space.lg * 2, 400) }]}>
        <BlurView intensity={60} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.cardTint]} />
        <View style={styles.brandRow}>
          <Text style={styles.brand}>BOA VIDEO</Text>
          <GoldBadge label="HD" />
        </View>
        <View style={styles.cardAvatar}>
          <Ripple size={avatar} />
          <Ripple size={avatar} delay={800} />
          <PulseRing size={avatar}>
            <Avatar uri={peer.avatar_url} name={peer.name} size={avatar} />
          </PulseRing>
        </View>
        <Text style={styles.name} numberOfLines={2} testID="call-name">
          {peer.name}
        </Text>
        <Text style={styles.status} testID="call-status">
          {status}
        </Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).springify().damping(20)} style={styles.answerRow}>
        <View style={styles.answer}>
          <CallButton icon="close" label="Decline" tone={RED} size={84} iconSize={36} glow="0px 0px 28px rgba(255,59,78,0.5)" onPress={onDecline} testID="call-decline" />
          <Text style={styles.answerLabel}>Decline</Text>
        </View>
        <View style={styles.answer}>
          <CallButton icon="videocam" label="Accept" tone={GREEN} size={84} iconSize={34} ring={colors.gold} glow="0px 0px 32px rgba(226,168,75,0.6)" onPress={onAccept} testID="call-accept" />
          <Text style={styles.answerLabel}>Accept</Text>
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * The BOA video call screen. Incoming: a glass card with their face, accept
 * or decline. Ringing out and live: their picture fills the screen, yours
 * floats in a corner, and one frosted bar holds mute, camera, flip, filters,
 * speaker and end. Shown whenever a call is in progress.
 */
export default function CallScreen({ me }) {
  const { call, controls, video, beauty, setBeauty, accept, decline, hangUp, toggle, flipCamera } = useCall();
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
  const pip = { width: Math.min(116, width * 0.28), height: Math.min(164, width * 0.4) };
  const panelWidth = Math.min(width - space.lg * 2, 480);
  // Seven buttons in one bar, sized to fit a folded cover screen.
  const button = Math.max(36, Math.min(52, (Math.min(width, 480) - space.lg * 2 - BAR_PAD * 2 - BAR_GAP * 6) / 7));
  // They've turned screenshots off: say so at the top, and move everything else down to make room.
  const theyrePrivate = phase === 'active' && !!video?.remotePrivacy;
  const top = insets.top + space.md + (theyrePrivate ? PILL_ROOM : 0);
  // Their picture fills the screen once it's flowing; until then, their photo.
  const theirs = phase === 'active' && video?.remoteUid != null && video.remoteVideo;
  const note =
    phase !== 'active'
      ? null
      : video?.status === 'failed' && video.error
        ? `${VIDEO_NOTE.failed}: ${video.error}`
        : video?.remoteUid == null && video?.status === 'connected'
          ? 'Waiting for their video'
          : VIDEO_NOTE[video?.status];

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={incoming ? decline : hangUp}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.screen} testID="call-screen">
          {/* Their picture, blurred, fills the screen until their video does. */}
          {theirs ? (
            <TheirVideo uid={video.remoteUid} />
          ) : peer.avatar_url ? (
            <Image source={{ uri: peer.avatar_url }} blurRadius={40} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} resizeMode="cover" />
          ) : null}
          {/* Over live video, only enough shade at the edges to read the controls. */}
          <LinearGradient
            pointerEvents="none"
            colors={theirs ? ['rgba(5,5,6,0.45)', 'rgba(5,5,6,0)', 'rgba(5,5,6,0.55)'] : ['rgba(5,5,6,0.55)', 'rgba(5,5,6,0.2)', 'rgba(5,5,6,0.9)']}
            locations={theirs ? [0, 0.25, 1] : [0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          {!theirs ? <LinearGradient pointerEvents="none" colors={['rgba(226,168,75,0.22)', 'rgba(226,168,75,0)']} locations={[0, 0.5]} style={StyleSheet.absoluteFill} /> : null}

          {incoming ? (
            <View style={[StyleSheet.absoluteFill, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}>
              <Incoming peer={peer} status={status} width={width} onAccept={accept} onDecline={decline} />
            </View>
          ) : theirs ? (
            <Animated.View entering={FadeIn.duration(300)} style={[styles.liveHead, { top, maxWidth: width - pip.width - space.lg * 3 }]}>
              <BlurView intensity={40} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={styles.liveDot} />
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.liveName} numberOfLines={1} testID="call-name">
                  {peer.name}
                </Text>
                <Text style={styles.liveClock} testID="call-status">
                  {status}
                </Text>
              </View>
            </Animated.View>
          ) : (
            <>
              <View style={[styles.top, { paddingTop: insets.top + space.lg }]}>
                <View style={styles.brandRow}>
                  <Text style={styles.brand}>BOA VIDEO</Text>
                  <GoldBadge label="HD" />
                </View>
              </View>
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
            </>
          )}

          {theyrePrivate ? (
            <Animated.View entering={FadeInDown.springify().damping(20)} style={[styles.privacyPill, { top: insets.top + space.sm, maxWidth: width - space.lg * 2 }]} testID="call-remote-privacy">
              <BlurView intensity={50} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <Text style={styles.privacyText} numberOfLines={1}>
                🔒 {peer.name} has disabled screenshots.
              </Text>
            </Animated.View>
          ) : null}

          {/* You, in the corner. */}
          {!incoming && phase !== 'ended' ? (
            <SelfView size={pip} top={top} bottomRoom={insets.bottom + space.lg + BAR_ROOM} width={width} height={height}>
              {controls.cameraOff ? (
                <Ionicons name="videocam-off" size={26} color={colors.textMuted} />
              ) : (
                <>
                  <Avatar uri={me?.avatar_url} name={me?.name ?? 'You'} size={pip.width * 0.56} />
                  <LocalVideo style={StyleSheet.absoluteFill} />
                </>
              )}
              {controls.privacy ? (
                <View style={styles.pipShield} testID="call-privacy-on">
                  <Ionicons name="shield-checkmark" size={11} color={colors.gold} />
                </View>
              ) : null}
              {beauty.enabled && !controls.cameraOff ? (
                <View style={styles.pipTag}>
                  <Ionicons name="sparkles" size={10} color={colors.gold} />
                </View>
              ) : null}
            </SelfView>
          ) : null}

          {!incoming && phase !== 'ended' ? (
            <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]} pointerEvents="box-none">
              {filtersOpen ? <BeautyPanel beauty={beauty} setBeauty={setBeauty} onClose={() => setFiltersOpen(false)} width={panelWidth} /> : null}
              {!filtersOpen ? (
                <Text style={styles.filterLine} numberOfLines={1}>
                  {describe(beauty)}
                </Text>
              ) : null}
              {/* Keyed by phase so it slides up again the moment the call connects. */}
              <Animated.View key={phase} entering={SlideInDown.springify().damping(20).stiffness(180)} style={styles.bar} testID="call-controls">
                <View style={styles.barGlass}>
                  <BlurView intensity={55} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,22,0.35)' }]} />
                </View>
                <CallButton size={button} icon={controls.muted ? 'mic-off' : 'mic'} label={controls.muted ? 'Unmute' : 'Mute'} on={controls.muted} onPress={() => toggle('muted')} testID="call-mute" />
                <CallButton size={button} icon={controls.cameraOff ? 'videocam-off' : 'videocam'} label={controls.cameraOff ? 'Camera on' : 'Camera off'} on={controls.cameraOff} onPress={() => toggle('cameraOff')} testID="call-camera" />
                <CallButton size={button} icon="camera-reverse" label="Switch camera" onPress={flipCamera} testID="call-flip" />
                <CallButton
                  size={button}
                  icon={controls.privacy ? 'shield-checkmark' : 'shield-outline'}
                  label={controls.privacy ? 'Privacy Mode on' : 'Privacy Mode off'}
                  on={controls.privacy}
                  onColor={colors.gold}
                  onPress={() => toggle('privacy')}
                  testID="call-privacy"
                />
                <CallButton size={button} icon="sparkles" label="Filters" on={filtersOpen} onPress={() => setFiltersOpen((o) => !o)} testID="call-filters-button" />
                <CallButton size={button} icon={controls.speaker ? 'volume-high' : 'ear'} label={controls.speaker ? 'Speaker' : 'Phone'} onPress={() => toggle('speaker')} testID="call-speaker" />
                <CallButton size={button} icon="call" label="End" tone={RED} glow="0px 0px 18px rgba(255,59,78,0.55)" onPress={hangUp} testID="call-end" />
              </Animated.View>
            </View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050506' },
  top: { alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  brand: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 3, color: 'rgba(246,211,138,0.9)' },
  center: { alignItems: 'center', paddingHorizontal: space.xl },
  ripple: { position: 'absolute', borderWidth: 1.5, borderColor: colors.gold },
  pulseRing: { position: 'absolute', borderWidth: 2, borderColor: colors.gold, boxShadow: '0px 0px 36px rgba(226,168,75,0.55)' },
  avatarRing: { borderRadius: 999, boxShadow: '0px 0px 40px rgba(226,168,75,0.45)' },
  name: { fontFamily: fonts.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -1, color: colors.text, marginTop: space.xl, textAlign: 'center' },
  status: { fontFamily: fonts.medium, fontSize: 16, color: GOLD_LIGHT, marginTop: space.sm, fontVariant: ['tabular-nums'], textAlign: 'center' },
  incoming: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: space.lg },
  card: {
    borderRadius: radius.xl + 6,
    overflow: 'hidden',
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246,211,138,0.35)',
  },
  cardTint: { backgroundColor: 'rgba(12,12,15,0.5)' },
  cardAvatar: { alignItems: 'center', justifyContent: 'center', marginTop: space.xxl },
  answerRow: { flexDirection: 'row', justifyContent: 'space-around', maxWidth: 400, width: '100%', alignSelf: 'center' },
  answer: { alignItems: 'center', gap: space.md },
  answerLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text, letterSpacing: 0.2 },
  liveHead: {
    position: 'absolute',
    left: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingLeft: space.md,
    paddingRight: space.lg,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,239,232,0.2)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  liveName: { fontFamily: fonts.semibold, fontSize: 15, letterSpacing: -0.2, color: colors.text },
  liveClock: { fontFamily: fonts.mono, fontSize: 11.5, color: GOLD_LIGHT, fontVariant: ['tabular-nums'] },
  pending: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.2, color: colors.textFaint, marginTop: space.md, textAlign: 'center', textTransform: 'uppercase' },
  pip: { position: 'absolute', borderRadius: radius.lg, boxShadow: '0px 10px 28px rgba(0,0,0,0.55)' },
  pipInner: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(246,211,138,0.6)',
    backgroundColor: 'rgba(18,18,22,0.85)',
  },
  pipShield: { position: 'absolute', top: 6, left: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.7)' },
  privacyPill: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,12,15,0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246,211,138,0.5)',
  },
  privacyText: { fontFamily: fonts.semibold, fontSize: 13, color: GOLD_LIGHT, letterSpacing: 0.1 },
  pipTag: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.7)' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: space.lg, gap: space.md },
  filterLine: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.textMuted, textTransform: 'uppercase', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: BAR_GAP, padding: BAR_PAD, borderRadius: radius.pill, boxShadow: '0px 12px 32px rgba(0,0,0,0.45)' },
  barGlass: { ...StyleSheet.absoluteFillObject, borderRadius: radius.pill, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(243,239,232,0.22)' },
  button: { alignItems: 'center', justifyContent: 'center' },
  buttonGlass: { backgroundColor: 'rgba(243,239,232,0.12)' },
  buttonOn: { backgroundColor: colors.text },
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
