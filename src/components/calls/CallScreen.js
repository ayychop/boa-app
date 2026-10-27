import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, SlideInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useCall, END_REASONS } from '../../context/CallContext';
import { PRESETS, describeParts, presetById } from '../../calls/beauty';
import { LocalVideo, RemoteVideo } from '../../calls/media';
import { haptics } from '../../utils/haptics';
import { SPRING, usePress } from '../../utils/motion';
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
const SNAP = SPRING;
const DOCK_PAD = space.lg;
const DOCK_GAP = 14;
const WIDE = 600; // unfolded: every control in one row
const PILL_ROOM = 44; // the privacy pill, when it's showing
// Each preset's swatch: a hint of its grade.
const PRESET_SWATCH = {
  natural: ['#C9A27E', '#8A6A50'],
  studio: ['#F4F1EC', '#A9B4C2'],
  golden: ['#F6D38A', '#C9822E'],
  cinematic: ['#1E5A64', '#E08A3C'],
  glow: ['#FFC9D6', '#E89AB0'],
  bw: ['#F2F2F2', '#3A3A3A'],
};

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
  const style = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - t.value),
    transform: [{ scale: 1 + t.value * 0.7 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.ripple, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

// The avatar's gold ring, gently swelling like a heartbeat while it rings.
function PulseRing({ size, children }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.55 + t.value * 0.45,
    transform: [{ scale: 1 + t.value * 0.06 }],
  }));
  const pad = 8;
  return (
    <View
      style={{
        width: size + pad * 2,
        height: size + pad * 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View pointerEvents="none" style={[styles.pulseRing, { width: size + pad * 2, height: size + pad * 2, borderRadius: size }, ring]} />
      {children}
    </View>
  );
}

/**
 * A round button that dips when touched and taps back through the phone.
 * caption: a label under it, for the dock. width: a pill instead of a
 * circle, with the label inside (End).
 */
function CallButton({ icon, label, caption, onPress, on = false, onColor, tone, size = 52, width, iconSize, glow, ring, testID }) {
  const press = usePress({ to: 0.9 });
  const fill = tone ? { backgroundColor: tone } : on ? (onColor ? { backgroundColor: onColor } : styles.buttonOn) : styles.buttonGlass;
  const color = tone ? '#fff' : on ? colors.bg : colors.text;
  return (
    <Pressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      hitSlop={6}
      style={styles.buttonCell}
      testID={testID}
    >
      <Animated.View
        style={[styles.button, { width: width ?? size, height: size, borderRadius: size / 2 }, fill, glow && { boxShadow: glow }, ring && { borderWidth: 2, borderColor: ring }, press.style]}
      >
        <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.42)} color={color} />
        {width ? <Text style={styles.pillLabel}>{caption}</Text> : null}
      </Animated.View>
      {caption && !width ? (
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

function BeautyPanel({ beauty, setBeauty, onClose, width, maxHeight }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown.duration(160)} style={[styles.panel, { width }]} testID="call-filters">
      <BlurView intensity={50} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.55)' }]} />
      <View style={styles.panelHead}>
        <Ionicons name="sparkles" size={16} color={colors.gold} />
        <Text style={styles.panelTitle}>BOA Studio</Text>
        <View style={{ flex: 1 }} />
        <Toggle value={beauty.enabled} onChange={(v) => setBeauty({ enabled: v })} label="Filters on" testID="call-filters-toggle" />
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close filters" style={{ marginLeft: space.md }}>
          <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.panelNote}>Done by the camera itself in 1080p, before your video is sent. What you see is what they see.</Text>
      <ScrollView style={{ maxHeight: maxHeight }} showsVerticalScrollIndicator={false}>
        {/* Six looks, one tap each: a swatch of the grade, its name and what it does. */}
        <View style={[styles.presetGrid, !beauty.enabled && { opacity: 0.4 }]} accessibilityRole="radiogroup" testID="call-presets">
          {PRESETS.map((p) => {
            const on = beauty.preset === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  haptics.selection();
                  setBeauty({ preset: p.id });
                }}
                disabled={!beauty.enabled}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: !beauty.enabled }}
                accessibilityLabel={`${p.label}: ${p.detail}`}
                style={[styles.preset, on && styles.presetOn]}
                testID={`call-preset-${p.id}`}
              >
                <LinearGradient colors={PRESET_SWATCH[p.id]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.presetSwatch}>
                  <Ionicons name={p.icon} size={18} color={p.id === 'bw' ? '#111' : '#fff'} />
                </LinearGradient>
                <Text style={[styles.presetLabel, on && { color: colors.gold }]} numberOfLines={1}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.presetDetail}>{presetById(beauty.preset).detail}</Text>
        <View style={[styles.filter, !beauty.enabled && { opacity: 0.4 }]}>
          <View style={styles.filterHead}>
            <Ionicons name="sunny-outline" size={16} color={colors.gold} />
            <Text style={styles.filterLabel}>Brightness</Text>
            <Text style={styles.filterValue}>{Math.round((beauty.brightness ?? 0) * 100)}%</Text>
          </View>
          <Slider
            style={{ height: 36, marginHorizontal: -4 }}
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={beauty.brightness ?? 0}
            disabled={!beauty.enabled}
            onValueChange={(v) => setBeauty({ brightness: v })}
            minimumTrackTintColor={colors.gold}
            maximumTrackTintColor="rgba(243,239,232,0.18)"
            thumbTintColor={colors.gold}
            accessibilityLabel="Brightness"
            testID="call-brightness"
          />
        </View>
      </ScrollView>
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
      x.value = withSpring(Math.abs(px - minX) < Math.abs(px) ? minX : 0, {
        ...SNAP,
        velocity: e.velocityX,
      });
      y.value = withSpring(Math.abs(py - maxY) < Math.abs(py) ? maxY : 0, {
        ...SNAP,
        velocity: e.velocityY,
      });
    },
  });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));
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
    veil.value = withTiming(0, {
      duration: 650,
      easing: Easing.out(Easing.cubic),
    });
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
  const [dockH, setDockH] = useState(220);
  // Hide the controls (walking about, phone in hand) and bring them back
  // with the button they leave behind, or a tap on the picture.
  const [controlsHidden, setControlsHidden] = useState(false);
  const tuck = useSharedValue(0);
  const hideControls = () => {
    setFiltersOpen(false);
    setControlsHidden(true);
    tuck.value = withSpring(1, SPRING);
  };
  const showControls = () => {
    setControlsHidden(false);
    tuck.value = withSpring(0, SPRING);
  };
  const dockStyle = useAnimatedStyle(() => ({
    opacity: 1 - tuck.value,
    transform: [{ translateY: tuck.value * (dockH + 60) }],
  }));
  const elapsed = useElapsed(call?.phase === 'active' ? call.startedAt : null);
  useEffect(() => {
    if (call) return;
    setFiltersOpen(false);
    setControlsHidden(false);
    tuck.value = 0;
  }, [call, tuck]);
  if (!call) return null;

  const { peer, phase, direction } = call;
  const incoming = direction === 'in' && phase === 'ringing';
  const status = phase === 'ended' ? (END_REASONS[call.reason] ?? END_REASONS.ended) : phase === 'active' ? clock(elapsed) : incoming ? 'Incoming video call' : 'Ringing…';
  const avatar = Math.min(150, width * 0.36);
  const wide = width >= WIDE;
  const pipW = Math.round(Math.min(wide ? 176 : 150, width * 0.34));
  const pip = { width: pipW, height: Math.round(pipW * 1.42) };
  const panelWidth = Math.min(width - space.lg * 2, 480);
  // The dock: one row of seven unfolded; on the cover screen a 4 x 2 grid,
  // so every button can be big. Never smaller than 56, never past 72.
  const dockWidth = Math.min(width - space.lg * 2, wide ? 720 : 440);
  const cols = wide ? 7 : 4;
  const button = Math.floor(Math.max(56, Math.min(72, (dockWidth - DOCK_PAD * 2 - DOCK_GAP * (cols - 1)) / cols)));
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
          {/* A tap on the picture hides or brings back the controls, like FaceTime. */}
          {!incoming && phase !== 'ended' ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={controlsHidden ? showControls : hideControls}
              accessibilityLabel={controlsHidden ? 'Show controls' : 'Hide controls'}
              testID="call-picture"
            />
          ) : null}

          {incoming ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  paddingTop: insets.top,
                  paddingBottom: insets.bottom + space.xl,
                },
              ]}
            >
              <Incoming peer={peer} status={status} width={width} onAccept={accept} onDecline={decline} />
            </View>
          ) : (
            // One column, top to bottom: the brand, the caller (centred in
            // all the room there is), the filter chips, then the dock. Nothing
            // is pinned to an edge, so no dead space and nothing overlaps.
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  paddingBottom: insets.bottom + (phase === 'ended' ? space.xl : space.lg),
                },
              ]}
              pointerEvents="box-none"
            >
              {theirs ? (
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
                  <View style={styles.center} pointerEvents="none">
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
              {/* Over their video the picture is the middle: keep the dock at the bottom. */}
              {theirs ? <View style={{ flex: 1 }} pointerEvents="none" /> : null}

              {phase !== 'ended' ? (
                <View style={styles.bottom} pointerEvents="box-none" onLayout={(e) => setDockH(e.nativeEvent.layout.height)}>
                  {/* The filters panel opens above the dock, over the caller, without moving anything. */}
                  {filtersOpen ? (
                    <View style={styles.panelWrap} pointerEvents="box-none">
                      <BeautyPanel
                        beauty={beauty}
                        setBeauty={setBeauty}
                        onClose={() => setFiltersOpen(false)}
                        width={panelWidth}
                        maxHeight={Math.max(180, height - dockH - insets.top - insets.bottom - 260)}
                      />
                    </View>
                  ) : null}
                  {!filtersOpen && !controlsHidden ? (
                    <Animated.View entering={FadeIn.duration(200)} style={[styles.filterRow, { width: dockWidth }]} testID="call-filter-line">
                      {describeParts(beauty).map((p) => (
                        <View key={p.id} style={styles.filterChip}>
                          <Text style={styles.filterChipLabel}>{p.label}</Text>
                          {p.value ? <Text style={styles.filterChipValue}>{p.value}</Text> : null}
                        </View>
                      ))}
                    </Animated.View>
                  ) : null}
                  <Animated.View entering={SlideInDown.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)} style={{ width: dockWidth }}>
                    <Animated.View style={[styles.dock, dockStyle]} pointerEvents={controlsHidden ? 'none' : 'auto'} testID="call-controls">
                      <View style={styles.dockGlass}>
                        <BlurView intensity={60} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,14,18,0.86)' }]} />
                      </View>
                      <Pressable onPress={hideControls} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide controls" style={styles.dockHandle} testID="call-hide-controls">
                        <View style={styles.grabber} />
                      </Pressable>
                      <View style={[styles.dockGrid, { gap: DOCK_GAP }]}>
                        <CallButton
                          size={button}
                          caption={controls.muted ? 'Unmute' : 'Mute'}
                          icon={controls.muted ? 'mic-off' : 'mic'}
                          label={controls.muted ? 'Unmute' : 'Mute'}
                          on={controls.muted}
                          onPress={() => toggle('muted')}
                          testID="call-mute"
                        />
                        <CallButton
                          size={button}
                          caption="Camera"
                          icon={controls.cameraOff ? 'videocam-off' : 'videocam'}
                          label={controls.cameraOff ? 'Camera on' : 'Camera off'}
                          on={controls.cameraOff}
                          onPress={() => toggle('cameraOff')}
                          testID="call-camera"
                        />
                        <CallButton size={button} caption="Flip" icon="camera-reverse" label="Switch camera" onPress={flipCamera} testID="call-flip" />
                        <CallButton size={button} caption="Filters" icon="sparkles" label="Filters" on={filtersOpen} onPress={() => setFiltersOpen((o) => !o)} testID="call-filters-button" />
                        <CallButton
                          size={button}
                          caption="Privacy"
                          icon={controls.privacy ? 'shield-checkmark' : 'shield-outline'}
                          label={controls.privacy ? 'Privacy Mode on' : 'Privacy Mode off'}
                          on={controls.privacy}
                          onColor={colors.gold}
                          onPress={() => toggle('privacy')}
                          testID="call-privacy"
                        />
                        <CallButton
                          size={button}
                          caption={controls.speaker ? 'Speaker' : 'Phone'}
                          icon={controls.speaker ? 'volume-high' : 'ear'}
                          label={controls.speaker ? 'Speaker' : 'Phone'}
                          onPress={() => toggle('speaker')}
                          testID="call-speaker"
                        />
                        <CallButton
                          size={button}
                          width={wide ? undefined : button * 2 + DOCK_GAP}
                          caption="End"
                          icon="call"
                          label="End"
                          tone={RED}
                          glow="0px 0px 22px rgba(255,59,78,0.55)"
                          onPress={hangUp}
                          testID="call-end"
                        />
                      </View>
                    </Animated.View>
                    {/* Controls tucked away: one small glass button brings them back. */}
                    {controlsHidden ? (
                      <Animated.View entering={FadeIn.delay(120).duration(200)} exiting={FadeOut.duration(120)} style={styles.showWrap}>
                        <CallButton size={56} icon="chevron-up" label="Show controls" onPress={showControls} testID="call-show-controls" />
                      </Animated.View>
                    ) : null}
                  </Animated.View>
                </View>
              ) : null}
            </View>
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
            <SelfView size={pip} top={top} bottomRoom={insets.bottom + space.lg + dockH + space.md} width={width} height={height}>
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
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050506' },
  top: { alignItems: 'center' },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  brand: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 3,
    color: 'rgba(246,211,138,0.9)',
  },
  // Everything between the brand and the chips: the caller sits in the middle of it.
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  ripple: { position: 'absolute', borderWidth: 1.5, borderColor: colors.gold },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.gold,
    boxShadow: '0px 0px 36px rgba(226,168,75,0.55)',
  },
  avatarRing: {
    borderRadius: 999,
    boxShadow: '0px 0px 40px rgba(226,168,75,0.45)',
  },
  name: {
    fontFamily: fonts.semibold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -1,
    color: colors.text,
    marginTop: space.xl,
    textAlign: 'center',
  },
  status: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: GOLD_LIGHT,
    marginTop: space.sm,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  incoming: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: space.lg,
  },
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
  cardAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xxl,
  },
  answerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  answer: { alignItems: 'center', gap: space.md },
  answerLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
    letterSpacing: 0.2,
  },
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
  liveName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    letterSpacing: -0.2,
    color: colors.text,
  },
  liveClock: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    color: GOLD_LIGHT,
    fontVariant: ['tabular-nums'],
  },
  pending: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    letterSpacing: 1.2,
    color: colors.textFaint,
    marginTop: space.md,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  pip: {
    position: 'absolute',
    borderRadius: radius.lg,
    boxShadow: '0px 0px 18px rgba(226,168,75,0.35), 0px 12px 30px rgba(0,0,0,0.55)',
  },
  pipInner: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.gold,
    backgroundColor: 'rgba(18,18,22,0.85)',
  },
  pipShield: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,5,6,0.7)',
  },
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
  privacyText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: GOLD_LIGHT,
    letterSpacing: 0.1,
  },
  pipTag: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,5,6,0.7)',
  },
  bottom: {
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  // Above the dock, the panel's bottom on the dock's top.
  panelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    alignItems: 'center',
    paddingBottom: space.md,
  },
  // The filter readout: chips in a row, just above the dock.
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.md,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(12,12,15,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,239,232,0.18)',
  },
  filterChipLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  filterChipValue: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  dock: {
    paddingHorizontal: DOCK_PAD,
    paddingBottom: DOCK_PAD,
    borderRadius: 34,
    boxShadow: '0px 16px 40px rgba(0,0,0,0.5)',
    // Above everything else on the call screen, so nothing shows through it.
    zIndex: 20,
    elevation: 20,
  },
  dockGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,239,232,0.22)',
  },
  dockHandle: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: space.xl,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(243,239,232,0.35)',
  },
  dockGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: space.md,
  },
  showWrap: { position: 'absolute', bottom: 0, alignSelf: 'center' },
  buttonCell: { alignItems: 'center', gap: 6 },
  button: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  pillLabel: { fontFamily: fonts.semibold, fontSize: 16, color: '#fff' },
  buttonGlass: { backgroundColor: 'rgba(243,239,232,0.12)' },
  buttonOn: { backgroundColor: colors.text },
  panel: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246,211,138,0.4)',
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  panelTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  panelNote: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  filter: { marginTop: space.md },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.sm, marginTop: space.md },
  // Three to a row: big enough to hit at arm's length.
  preset: {
    width: '31.5%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(243,239,232,0.12)',
    backgroundColor: 'rgba(243,239,232,0.05)',
  },
  presetOn: { borderColor: colors.gold, backgroundColor: 'rgba(226,168,75,0.14)' },
  presetSwatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  presetLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  presetDetail: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: space.sm, textAlign: 'center' },
  filterHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  filterLabel: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
  },
  filterValue: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
});
