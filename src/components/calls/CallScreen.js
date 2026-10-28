import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  SlideInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, GestureHandlerRootView, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useCall, END_REASONS } from '../../context/CallContext';
import { PRESETS, brightnessLabel, contrastLabel, presetById } from '../../calls/beauty';
import { BLURS, SCENES, STUDIO, choiceOf, describe as describeBackground } from '../../calls/backgrounds';
import BoaSlider from '../BoaSlider';
import { LocalVideo, RemoteVideo } from '../../calls/media';
import { haptics } from '../../utils/haptics';
import { goToTab } from '../../navigation/ref';
import { TACTICAL, settle, usePress } from '../../utils/motion';
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
// Every move on the call screen lands and stops: no bounce (utils/motion TACTICAL).
const SNAP = TACTICAL;
const DOCK_PAD = space.lg;
const DOCK_GAP = 14;
const WIDE = 600; // unfolded: every control in one row
const PILL_ROOM = 44; // the privacy pill, when it's showing
// Brightness and Contrast reach the camera at most this often while a slider moves (about 30 a second).
const TONE_EVERY_MS = 33;
// From this panel width Brightness and Contrast sit side by side; narrower, one above the other.
const TONE_SIDE_BY_SIDE = 420;
const SHRINK_SIZE = 40;
const KEEP_AWAKE_TAG = 'boa-call';

/**
 * Frosted glass: blurred on iOS; on Android, a tint alone (Android's blur
 * needs a blur target view, which paints opaque over what's behind it).
 */
function Glass({ tint = 'rgba(12,12,15,0.62)', intensity = 50 }) {
  return (
    <>
      {Platform.OS === 'ios' ? <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
    </>
  );
}

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
  const press = usePress({ to: 0.92, spring: TACTICAL });
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

/**
 * Brightness (the camera's exposure and a tone curve) or Contrast (the tone
 * curve). The slider runs on its own while your finger is on it (nothing
 * re-renders the call), sends each move straight to the camera about 30
 * times a second, and saves where you let go.
 */
function ToneSlider({ kind, value, enabled, onPreview, onCommit, style, title, hint }) {
  const bright = kind === 'brightness';
  const name = title ?? (bright ? 'Brightness' : 'Contrast');
  const middle = bright ? 'Auto' : 'Normal';
  const label = bright ? brightnessLabel : contrastLabel;
  const [shown, setShown] = useState(value);
  const dragging = useRef(false);
  const last = useRef(0);
  // A change from elsewhere (the reset, a saved value) moves it, unless you're holding it.
  useEffect(() => {
    if (!dragging.current) setShown(value);
  }, [value]);
  const move = (v) => {
    dragging.current = true;
    setShown(v);
    const now = Date.now();
    if (now - last.current >= TONE_EVERY_MS) {
      last.current = now;
      onPreview(v);
    }
  };
  const done = (v) => {
    dragging.current = false;
    last.current = 0;
    setShown(v);
    onPreview(v);
    onCommit(v);
  };
  return (
    <View style={[styles.filter, !enabled && { opacity: 0.4 }, style]}>
      <View style={styles.filterHead}>
        <Ionicons name={bright ? 'sunny-outline' : 'contrast-outline'} size={16} color={colors.gold} />
        <Text style={styles.filterLabel} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.filterValue} testID={`call-${kind}-value`}>
          {label(shown)}
        </Text>
        {Math.abs(shown - 0.5) > 0.005 ? (
          <Pressable
            onPress={() => done(0.5)}
            disabled={!enabled}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={`${name} back to ${middle}`}
            style={styles.auto}
            testID={`call-${kind}-auto`}
          >
            <Text style={styles.autoText}>{bright ? 'Auto' : 'Reset'}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.sliderRow}>
        <Ionicons name={bright ? 'moon-outline' : 'remove-circle-outline'} size={14} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          {/* The middle: the camera's own. */}
          <View pointerEvents="none" style={styles.sliderMid} />
          <BoaSlider
            minimumValue={0}
            maximumValue={1}
            step={0}
            value={shown}
            disabled={!enabled}
            onValueChange={move}
            onSlidingComplete={done}
            minimumTrackTintColor={colors.gold}
            maximumTrackTintColor="rgba(243,239,232,0.18)"
            accessibilityLabel={name}
            testID={`call-${kind}`}
          />
        </View>
        <Ionicons name={bright ? 'sunny' : 'add-circle'} size={16} color={colors.gold} />
      </View>
      {hint ? <Text style={styles.toneHint}>{hint}</Text> : null}
    </View>
  );
}

function BeautyPanel({ beauty, setBeauty, previewBrightness, previewContrast, onClose, width, maxHeight }) {
  const side = width >= TONE_SIDE_BY_SIDE;
  return (
    <Animated.View entering={settle(FadeInDown)} exiting={FadeOutDown.duration(160)} style={[styles.panel, { width }]} testID="call-filters">
      <Glass tint="rgba(10,10,12,0.82)" />
      <View style={styles.panelHead}>
        <Ionicons name="sparkles" size={16} color={colors.gold} />
        <Text style={styles.panelTitle}>BOA Studio</Text>
        <View style={{ flex: 1 }} />
        <Toggle value={beauty.enabled} onChange={(v) => setBeauty({ enabled: v })} label="Filters on" testID="call-filters-toggle" />
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close filters" style={{ marginLeft: space.md }}>
          <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.panelNote}>Done by the camera itself in 1080p, before your video is sent. What you see is what they see (your preview is mirrored; they see you the right way round).</Text>
      <ScrollView style={{ maxHeight: maxHeight }} showsVerticalScrollIndicator={false}>
        {/* Six looks, one tap each: just the name, gold when it's on. */}
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
                style={({ pressed }) => [styles.preset, on && styles.presetOn, pressed && { opacity: 0.7 }]}
                testID={`call-preset-${p.id}`}
              >
                <Text style={[styles.presetLabel, on && styles.presetLabelOn]} numberOfLines={1}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.presetDetail}>{presetById(beauty.preset).detail}</Text>
        <View style={[styles.tones, side && styles.tonesSide]}>
          <ToneSlider kind="brightness" value={beauty.brightness ?? 0.5} enabled onPreview={previewBrightness} onCommit={(v) => setBeauty({ brightness: v })} style={side && styles.toneSide} />
          <ToneSlider kind="contrast" value={beauty.contrast ?? 0.5} enabled onPreview={previewContrast} onCommit={(v) => setBeauty({ contrast: v })} style={side && styles.toneSide} />
        </View>
      </ScrollView>
    </Animated.View>
  );
}

// The Background sheet's three kinds, as tabs.
const BACKGROUND_TABS = [
  { id: 'studio', label: 'Studio', icon: 'square' },
  { id: 'scene', label: 'Scenes', icon: 'images' },
  { id: 'blur', label: 'Blur', icon: 'aperture' },
];
const UNSUPPORTED_NOTE = "This phone can't cut you out of the room smoothly enough for a backdrop. Your call is unchanged.";

/** One choice in the sheet: a framed tile, gold when it's on. */
function BackdropTile({ on, label, detail, onPress, width, height, children, testID }) {
  const press = usePress({ to: 0.95, spring: TACTICAL });
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}${detail ? `: ${detail}` : ''}`}
      testID={testID}
      style={{ width }}
    >
      <Animated.View style={[styles.tile, { height }, on && styles.tileOn, press.style]}>
        {children}
        <LinearGradient pointerEvents="none" colors={['rgba(5,5,6,0)', 'rgba(5,5,6,0.78)']} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
        {on ? (
          <Animated.View entering={settle(ZoomIn)} style={styles.tileCheck}>
            <Ionicons name="checkmark" size={13} color={colors.bg} />
          </Animated.View>
        ) : null}
        <View style={styles.tileFoot}>
          <Text style={[styles.tileLabel, on && { color: GOLD_LIGHT }]} numberOfLines={1}>
            {label}
          </Text>
          {detail ? (
            <Text style={styles.tileDetail} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Background: what's behind you, cut out by AI (src/calls/backgrounds.js).
 * Studio tones, Scenes and Blur in tabs, Off at the top, and Match lighting
 * under them (the camera's exposure), to sit you naturally in the backdrop.
 */
function BackgroundPanel({ background, setBackground, status, beauty, setBeauty, previewBrightness, onClose, width, maxHeight }) {
  const [tab, setTab] = useState(background.mode === 'off' ? 'studio' : background.mode);
  const on = background.mode !== 'off' && !!choiceOf(background);
  const inner = width - space.lg * 2;
  const pick = (mode, id) => {
    haptics.selection();
    setBackground(background.mode === mode && background.id === id ? { mode: 'off', id: null } : { mode, id });
  };
  const third = Math.floor((inner - space.sm * 2) / 3);
  return (
    <Animated.View entering={settle(FadeInDown)} exiting={FadeOutDown.duration(160)} style={[styles.panel, { width }]} testID="call-background">
      <Glass tint="rgba(10,10,12,0.84)" />
      <LinearGradient pointerEvents="none" colors={['rgba(246,211,138,0.10)', 'rgba(246,211,138,0)']} locations={[0, 0.35]} style={StyleSheet.absoluteFill} />
      <View style={styles.panelHead}>
        <Ionicons name="image" size={16} color={colors.gold} />
        <Text style={styles.panelTitle}>Background</Text>
        <Text style={styles.bgNow} numberOfLines={1} testID="call-background-now">
          {describeBackground(background)}
        </Text>
        <View style={{ flex: 1 }} />
        {on ? (
          <Pressable
            onPress={() => {
              haptics.tap();
              setBackground({ mode: 'off', id: null });
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Background off"
            style={styles.auto}
            testID="call-background-off"
          >
            <Text style={styles.autoText}>Off</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close background" style={styles.panelClose}>
          <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.panelNote}>AI finds you, hair and all, and the room behind you goes. They see exactly what you see.</Text>
      {/* The tabs: one tap each, gold under the one that's open. */}
      <View style={styles.bgTabs} accessibilityRole="tablist">
        {BACKGROUND_TABS.map((t) => {
          const open = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                if (open) return;
                haptics.selection();
                setTab(t.id);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: open }}
              style={[styles.bgTab, open && styles.bgTabOn]}
              testID={`call-background-tab-${t.id}`}
            >
              <Ionicons name={`${t.icon}${open ? '' : '-outline'}`} size={15} color={open ? colors.gold : colors.textMuted} />
              <Text style={[styles.bgTabLabel, open && { color: colors.text }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {status === 'unsupported' ? (
        <Text style={styles.bgWarn} testID="call-background-unsupported">
          {UNSUPPORTED_NOTE}
        </Text>
      ) : null}
      <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator={false}>
        <Animated.View key={tab} entering={FadeIn.duration(180)}>
          {tab === 'studio' ? (
            <View style={styles.bgRow}>
              {STUDIO.map((c) => (
                <BackdropTile
                  key={c.id}
                  on={background.mode === 'studio' && background.id === c.id}
                  label={c.label}
                  detail={c.hex}
                  width={third}
                  height={Math.round(third * 1.25)}
                  onPress={() => pick('studio', c.id)}
                  testID={`call-backdrop-${c.id}`}
                >
                  <Image source={c.asset} style={StyleSheet.absoluteFill} resizeMode="cover" />
                </BackdropTile>
              ))}
            </View>
          ) : null}
          {tab === 'scene' ? (
            SCENES.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bgCarousel} snapToInterval={Math.round(inner * 0.62) + space.sm} decelerationRate="fast">
                {SCENES.map((c) => (
                  <BackdropTile
                    key={c.id}
                    on={background.mode === 'scene' && background.id === c.id}
                    label={c.label}
                    detail={c.detail}
                    width={Math.round(inner * 0.62)}
                    height={Math.round(inner * 0.62 * 0.62)}
                    onPress={() => pick('scene', c.id)}
                    testID={`call-scene-${c.id}`}
                  >
                    <Image source={c.thumb ?? c.asset} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  </BackdropTile>
                ))}
              </ScrollView>
            ) : (
              // Until the scenes arrive: empty frames, like a gallery wall waiting for its prints.
              <View testID="call-scenes-empty">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bgCarousel} scrollEnabled={false}>
                  {[0, 1].map((i) => (
                    <View key={i} style={[styles.sceneFrame, { width: Math.round(inner * 0.62), height: Math.round(inner * 0.62 * 0.62) }]}>
                      <Ionicons name="image-outline" size={22} color="rgba(246,211,138,0.45)" />
                    </View>
                  ))}
                </ScrollView>
                <Text style={styles.presetDetail}>Scenes are being shot. They'll appear here as they land.</Text>
              </View>
            )
          ) : null}
          {tab === 'blur' ? (
            <View style={styles.bgRow}>
              {BLURS.map((c, i) => (
                <BackdropTile
                  key={c.id}
                  on={background.mode === 'blur' && background.id === c.id}
                  label={c.label}
                  detail={c.detail}
                  width={third}
                  height={Math.round(third * 1.25)}
                  onPress={() => pick('blur', c.id)}
                  testID={`call-blur-${c.id}`}
                >
                  {/* The lens opening: smaller numbers, wider aperture, softer room. */}
                  <View style={styles.aperture}>
                    <LinearGradient colors={['#2A2A30', '#0E0E11']} style={StyleSheet.absoluteFill} />
                    <View style={[styles.apertureRing, { width: 22 + i * 14, height: 22 + i * 14, borderRadius: 11 + i * 7 }]} />
                  </View>
                </BackdropTile>
              ))}
            </View>
          ) : null}
        </Animated.View>
        <ToneSlider
          kind="brightness"
          title="Match lighting"
          hint="Lift or deepen your exposure so you sit naturally in the backdrop."
          value={beauty.brightness ?? 0.5}
          enabled
          onPreview={previewBrightness}
          onCommit={(v) => setBeauty({ brightness: v })}
        />
      </ScrollView>
    </Animated.View>
  );
}

/**
 * You, floating over their picture. Starts top right; drag it anywhere and
 * it springs to the nearest corner, clear of the controls.
 */
function SelfView({ size, top, bottomRoom, width, height, onHide, onFocus, children }) {
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
  // Tap to focus: the gold square lands where you tapped, like the iPhone camera.
  const [focus, setFocus] = useState(null);
  const tap = useTapGesture({
    runOnJS: true,
    maxDistance: 10,
    onActivate: (e) => {
      if (!onFocus) return;
      // The hide button's corner is the button's, not the picture's.
      if (e.x < 44 && e.y > size.height - 44) return;
      haptics.selection();
      onFocus(e.x / size.width, e.y / size.height);
      setFocus({ x: e.x, y: e.y, key: Date.now() });
    },
  });
  const gesture = useCompetingGestures(pan, tap);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View entering={FadeIn.delay(150).duration(300)} style={[styles.pip, size, { top, right: margin }, style]} testID="call-self-view">
        <View style={styles.pipInner}>
          {children}
          {focus ? <FocusSquare key={focus.key} x={focus.x} y={focus.y} onDone={() => setFocus(null)} /> : null}
        </View>
        {/* Hide yourself: you're still sent, you just stop seeing you. */}
        <Pressable onPress={onHide} hitSlop={12} accessibilityRole="button" accessibilityLabel="Hide your video" style={styles.pipHide} testID="call-self-hide">
          <Ionicons name="eye-off" size={13} color={colors.text} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const FOCUS_SIZE = 44;

/**
 * The focus square: lands a little large, springs in to size, pulses once
 * as the camera settles, then fades, as on an iPhone camera.
 */
function FocusSquare({ x, y, onDone }) {
  const scale = useSharedValue(1.5);
  const opacity = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 260 });
    opacity.value = withDelay(900, withTiming(0, { duration: 350 }));
    const t = setTimeout(onDone, 1300);
    return () => clearTimeout(t);
  }, [scale, opacity, onDone]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.focus, { left: x - FOCUS_SIZE / 2, top: y - FOCUS_SIZE / 2 }, style]} testID="call-focus-square">
      <View style={[styles.focusTick, { top: -1, left: FOCUS_SIZE / 2 - 1, height: 6 }]} />
      <View style={[styles.focusTick, { bottom: -1, left: FOCUS_SIZE / 2 - 1, height: 6 }]} />
      <View style={[styles.focusTick, { left: -1, top: FOCUS_SIZE / 2 - 1, width: 6, height: 2 }]} />
      <View style={[styles.focusTick, { right: -1, top: FOCUS_SIZE / 2 - 1, width: 6, height: 2 }]} />
    </Animated.View>
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

const MINI_W = 116;
const MINI_H = 164;
const MINI_MARGIN = 12;
// Clear of the tab bar and mini player at the bottom of the app.
const MINI_BOTTOM_ROOM = 150;

/**
 * Picture in picture, inside the app: the call shrunk to a small floating
 * window over whatever you're doing (the feed, a chat), their picture live
 * in it. Drag it anywhere and it springs to the nearest side; tap it to go
 * back to the full call. End is right on it. The call itself carries on
 * untouched: your camera and microphone keep going.
 */
function MiniCall({ call, video, controls, status, onRestore, onEnd, locked }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const theirs = call.phase === 'active' && video?.remoteUid != null && video.remoteVideo;
  const right = width - MINI_W - MINI_MARGIN;
  const top = insets.top + 56;
  const bottom = Math.max(top, height - MINI_H - insets.bottom - MINI_BOTTOM_ROOM);
  const x = useSharedValue(right);
  const y = useSharedValue(top);
  const from = useSharedValue({ x: 0, y: 0 });
  const pan = usePanGesture({
    activeOffsetX: [-8, 8],
    activeOffsetY: [-8, 8],
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
      // To whichever side it was flung towards; up and down it stays where it's dropped, inside the room.
      const px = x.value + e.velocityX * 0.12;
      x.value = withSpring(px + MINI_W / 2 < width / 2 ? MINI_MARGIN : right, { ...SNAP, velocity: e.velocityX });
      y.value = withSpring(Math.min(bottom, Math.max(top, y.value + e.velocityY * 0.08)), { ...SNAP, velocity: e.velocityY });
    },
  });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  return (
    // A plain layer (the app already has a gesture root at its root, App.js):
    // box-none lets every touch it doesn't use fall through to the app
    // underneath, so only the floating window itself is interactive. Locked
    // (the Hub setting), it captures those touches instead, so a tap outside
    // the window can't reach the app by accident.
    <View pointerEvents={locked ? 'auto' : 'box-none'} style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]} testID="call-mini-layer">
      <GestureDetector gesture={pan}>
        <Animated.View entering={settle(ZoomIn)} style={[styles.mini, style]} testID="call-mini">
          <Pressable onPress={onRestore} accessibilityRole="button" accessibilityLabel={`Back to your call with ${call.peer.name}`} style={styles.miniInner}>
            {theirs ? (
              <RemoteVideo uid={video.remoteUid} texture style={StyleSheet.absoluteFill} />
            ) : (
              <View style={styles.miniFace}>
                <Avatar uri={call.peer.avatar_url} name={call.peer.name} size={58} />
                <Text style={styles.miniName} numberOfLines={1}>
                  {call.peer.name}
                </Text>
              </View>
            )}
            <LinearGradient pointerEvents="none" colors={['rgba(5,5,6,0)', 'rgba(5,5,6,0.85)']} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
            <View style={styles.miniFoot} pointerEvents="none">
              {controls.muted ? <Ionicons name="mic-off" size={12} color={RED} /> : <View style={styles.liveDot} />}
              <Text style={styles.miniClock} numberOfLines={1}>
                {status}
              </Text>
            </View>
          </Pressable>
          {call.phase !== 'ended' ? (
            <Pressable onPress={onEnd} hitSlop={8} accessibilityRole="button" accessibilityLabel="End call" style={styles.miniEnd} testID="call-mini-end">
              <Ionicons name="call" size={15} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * The call in Android's picture-in-picture window (over the home screen or
 * another app): their picture, edge to edge, and nothing else, since the
 * window is too small to tap controls in. Before their video, their photo
 * and the time. Not a Modal: the window shows the app's own view.
 */
function PipCall({ call, video, status }) {
  const theirs = call.phase === 'active' && video?.remoteUid != null && video.remoteVideo;
  return (
    <View style={[StyleSheet.absoluteFill, styles.pipCall]} testID="call-pip">
      {theirs ? (
        <RemoteVideo uid={video.remoteUid} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.miniFace}>
          <Avatar uri={call.peer.avatar_url} name={call.peer.name} size={64} />
          <Text style={styles.miniName} numberOfLines={1}>
            {call.peer.name}
          </Text>
          <Text style={styles.miniClock}>{status}</Text>
        </View>
      )}
    </View>
  );
}

function Incoming({ peer, status, width, onAccept, onDecline }) {
  const avatar = Math.min(168, width * 0.42);
  return (
    <View style={styles.incoming}>
      <Animated.View entering={settle(FadeInDown)} style={[styles.card, { width: Math.min(width - space.lg * 2, 400) }]}>
        <Glass tint="rgba(12,12,15,0.62)" intensity={60} />
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
      <Animated.View entering={settle(FadeInDown.delay(120))} style={styles.answerRow}>
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
  const {
    call,
    controls,
    video,
    beauty,
    setBeauty,
    previewBrightness,
    previewContrast,
    background,
    setBackground,
    backgroundStatus,
    focusAt,
    facing,
    selfHidden,
    setSelfHidden,
    lockDuringPip,
    minimized,
    minimize,
    restore,
    pip: inPip,
    accept,
    decline,
    hangUp,
    toggle,
    flipCamera,
  } = useCall();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // One panel above the dock at a time: the filters or the background.
  const [panel, setPanel] = useState(null); // null | 'filters' | 'background'
  const filtersOpen = panel === 'filters';
  const backgroundOpen = panel === 'background';
  const setFiltersOpen = (open) => setPanel(open ? 'filters' : null);
  const [dockH, setDockH] = useState(220);
  // Hide the controls (walking about, phone in hand) and bring them back
  // with the button they leave behind, or a tap on the picture.
  const [controlsHidden, setControlsHidden] = useState(false);
  const tuck = useSharedValue(0);
  const hideControls = () => {
    setPanel(null);
    setControlsHidden(true);
    tuck.value = withSpring(1, TACTICAL);
  };
  const showControls = () => {
    setControlsHidden(false);
    tuck.value = withSpring(0, TACTICAL);
  };
  const dockStyle = useAnimatedStyle(() => ({
    opacity: 1 - tuck.value,
    transform: [{ translateY: tuck.value * (dockH + 60) }],
  }));
  const elapsed = useElapsed(call?.phase === 'active' ? call.startedAt : null);
  // On a call the screen never dims or locks by itself, as on FaceTime and
  // WhatsApp. The power button still locks it: the call goes on as a voice
  // call (CallContext: away), and the picture is back once you're back.
  const awake = !!call && call.phase !== 'ended';
  useEffect(() => {
    if (!awake) return undefined;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG)?.catch?.(() => {});
      } catch {}
    };
  }, [awake]);
  useEffect(() => {
    if (call) return;
    setPanel(null);
    setControlsHidden(false);
    tuck.value = 0;
  }, [call, tuck]);
  if (!call) return null;

  const { peer, phase, direction } = call;
  const incoming = direction === 'in' && phase === 'ringing';
  const status = phase === 'ended' ? (END_REASONS[call.reason] ?? END_REASONS.ended) : phase === 'active' ? clock(elapsed) : incoming ? 'Incoming video call' : 'Ringing…';
  // A call you're on (not one ringing in) can shrink to a floating window.
  const canShrink = !incoming && phase !== 'ended';
  const shrink = () => {
    haptics.tap();
    setPanel(null);
    minimize();
  };
  // Shrink to the floating window and drop the user on the Home feed, so they
  // can browse or check messages with the call still going.
  const goHome = () => {
    haptics.tap();
    setPanel(null);
    minimize();
    goToTab('Home');
  };
  if (inPip && !incoming) return <PipCall call={call} video={video} status={status} />;
  if (minimized && !incoming) {
    return (
      <MiniCall
        call={call}
        video={video}
        controls={controls}
        status={status}
        locked={lockDuringPip}
        onRestore={() => {
          haptics.tap();
          restore();
        }}
        onEnd={hangUp}
      />
    );
  }
  const avatar = Math.min(150, width * 0.36);
  const wide = width >= WIDE;
  const pipW = Math.round(Math.min(wide ? 176 : 150, width * 0.34));
  const pip = { width: pipW, height: Math.round(pipW * 1.42) };
  const panelWidth = Math.min(width - space.lg * 2, 480);
  // The dock: one row of nine unfolded; on a phone a 5 + 4 grid, so every
  // button can be big. Never smaller than 56, never past 72.
  const dockWidth = Math.min(width - space.lg * 2, wide ? 820 : 460);
  const cols = wide ? 9 : 5;
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
    // Edge to edge: the picture runs under the status bar and the navigation bar, with no bands.
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={incoming ? decline : canShrink ? shrink : hangUp}>
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
                <Animated.View
                  entering={FadeIn.duration(300)}
                  style={[styles.liveHead, { top, left: space.lg + SHRINK_SIZE + space.sm, maxWidth: width - pip.width - space.lg * 3 - SHRINK_SIZE - space.sm }]}
                >
                  <Glass tint="rgba(12,12,15,0.55)" intensity={40} />
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
                        previewBrightness={previewBrightness}
                        previewContrast={previewContrast}
                        onClose={() => setFiltersOpen(false)}
                        width={panelWidth}
                        maxHeight={Math.max(180, height - dockH - insets.top - insets.bottom - 260)}
                      />
                    </View>
                  ) : null}
                  {backgroundOpen ? (
                    <View style={styles.panelWrap} pointerEvents="box-none">
                      <BackgroundPanel
                        background={background}
                        setBackground={setBackground}
                        status={backgroundStatus}
                        beauty={beauty}
                        setBeauty={setBeauty}
                        previewBrightness={previewBrightness}
                        onClose={() => setPanel(null)}
                        width={panelWidth}
                        maxHeight={Math.max(200, height - dockH - insets.top - insets.bottom - 220)}
                      />
                    </View>
                  ) : null}
                  <Animated.View entering={settle(SlideInDown)} style={{ width: dockWidth }}>
                    <Animated.View style={[styles.dock, dockStyle]} pointerEvents={controlsHidden ? 'none' : 'auto'} testID="call-controls">
                      <View style={styles.dockGlass}>
                        <Glass tint="rgba(14,14,18,0.86)" intensity={60} />
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
                        <CallButton
                          size={button}
                          caption="Filters"
                          icon="sparkles"
                          label="Filters"
                          on={filtersOpen}
                          onPress={() => setPanel((p) => (p === 'filters' ? null : 'filters'))}
                          testID="call-filters-button"
                        />
                        <CallButton
                          size={button}
                          caption="Backdrop"
                          icon={background.mode !== 'off' ? 'image' : 'image-outline'}
                          label="Background"
                          on={backgroundOpen}
                          onColor={background.mode !== 'off' ? colors.gold : undefined}
                          onPress={() => setPanel((p) => (p === 'background' ? null : 'background'))}
                          testID="call-background-button"
                        />
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
                        <CallButton size={button} caption="Home" icon="home" label="Minimise to Home" onPress={goHome} testID="call-home" />
                        <CallButton size={button} caption="End" icon="call" label="End" tone={RED} glow="0px 0px 22px rgba(255,59,78,0.55)" onPress={hangUp} testID="call-end" />
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

          {/* Shrink the call to a floating window and carry on using the app. */}
          {canShrink && !controlsHidden ? (
            <Pressable onPress={shrink} hitSlop={10} accessibilityRole="button" accessibilityLabel="Shrink the call" style={[styles.shrink, { top, left: space.lg }]} testID="call-minimize">
              <Glass tint="rgba(12,12,15,0.55)" intensity={40} />
              <Ionicons name="contract" size={18} color={colors.text} />
            </Pressable>
          ) : null}

          {theyrePrivate ? (
            <Animated.View entering={settle(FadeInDown)} style={[styles.privacyPill, { top: insets.top + space.sm, maxWidth: width - space.lg * 2 }]} testID="call-remote-privacy">
              <Glass tint="rgba(12,12,15,0.55)" />
              <Text style={styles.privacyText} numberOfLines={1}>
                🔒 {peer.name} has disabled screenshots.
              </Text>
            </Animated.View>
          ) : null}

          {/* You, in the corner; or, hidden, a small button to bring you back. */}
          {!incoming && phase !== 'ended' && !selfHidden ? (
            <SelfView
              size={pip}
              top={top}
              bottomRoom={insets.bottom + space.lg + dockH + space.md}
              width={width}
              height={height}
              onHide={() => setSelfHidden(true)}
              onFocus={controls.cameraOff ? null : focusAt}
            >
              {controls.cameraOff ? (
                <Ionicons name="videocam-off" size={26} color={colors.textMuted} />
              ) : (
                <>
                  <Avatar uri={me?.avatar_url} name={me?.name ?? 'You'} size={pip.width * 0.56} />
                  {/* Mirrored like a mirror on the front camera; what they get never is. */}
                  <LocalVideo style={StyleSheet.absoluteFill} mirror={facing !== 'back'} />
                </>
              )}
              {controls.privacy ? (
                <View style={styles.pipShield} testID="call-privacy-on">
                  <Ionicons name="shield-checkmark" size={11} color={colors.gold} />
                </View>
              ) : null}
              {(beauty.enabled || background.mode !== 'off') && !controls.cameraOff ? (
                <View style={styles.pipTag}>
                  <Ionicons name={background.mode !== 'off' ? 'image' : 'sparkles'} size={10} color={colors.gold} />
                </View>
              ) : null}
            </SelfView>
          ) : null}
          {!incoming && phase !== 'ended' && selfHidden ? (
            <Animated.View entering={FadeIn.duration(200)} style={[styles.selfShow, { top, right: space.lg }]}>
              <Pressable onPress={() => setSelfHidden(false)} accessibilityRole="button" accessibilityLabel="Show your video" hitSlop={8} style={styles.selfShowButton} testID="call-self-show">
                <Glass tint="rgba(12,12,15,0.62)" />
                <Ionicons name="eye" size={15} color={colors.gold} />
                <Text style={styles.selfShowText}>You</Text>
              </Pressable>
            </Animated.View>
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
  shrink: {
    position: 'absolute',
    zIndex: 6,
    width: SHRINK_SIZE,
    height: SHRINK_SIZE,
    borderRadius: SHRINK_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,239,232,0.25)',
  },
  pipCall: { zIndex: 2000, elevation: 2000, backgroundColor: '#050506' },
  mini: { position: 'absolute', left: 0, top: 0, width: MINI_W, height: MINI_H, borderRadius: radius.lg, boxShadow: '0px 0px 18px rgba(226,168,75,0.4), 0px 14px 30px rgba(0,0,0,0.6)' },
  miniInner: { flex: 1, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.gold, backgroundColor: '#0B0B0D' },
  miniFace: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm, gap: space.sm },
  miniName: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.text },
  miniFoot: { position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm, flexDirection: 'row', alignItems: 'center', gap: 5 },
  miniClock: { fontFamily: fonts.mono, fontSize: 10.5, color: GOLD_LIGHT, fontVariant: ['tabular-nums'] },
  miniEnd: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RED,
    boxShadow: '0px 0px 12px rgba(255,59,78,0.6)',
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
  pipHide: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,5,6,0.7)',
  },
  selfShow: { position: 'absolute', zIndex: 5 },
  selfShowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(246,211,138,0.5)',
  },
  selfShowText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
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
  auto: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(246,211,138,0.5)', marginLeft: space.xs },
  autoText: { fontFamily: fonts.mono, fontSize: 10, color: colors.gold, letterSpacing: 0.8, textTransform: 'uppercase' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sliderMid: { position: 'absolute', left: '50%', top: 16, width: 2, height: 16, marginLeft: -1, borderRadius: 1, backgroundColor: 'rgba(243,239,232,0.35)' },
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
    ...StyleSheet.absoluteFill,
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
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(243,239,232,0.12)',
    backgroundColor: 'rgba(243,239,232,0.05)',
  },
  presetOn: { borderColor: colors.gold, backgroundColor: 'rgba(226,168,75,0.14)' },
  presetLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text, letterSpacing: -0.2 },
  presetLabelOn: { color: colors.gold },
  tones: { marginTop: space.xs },
  tonesSide: { flexDirection: 'row', gap: space.lg },
  toneSide: { flex: 1 },
  presetDetail: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: space.sm, textAlign: 'center' },
  filterHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  toneHint: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textFaint, marginTop: -2 },
  panelClose: { marginLeft: space.sm, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  bgNow: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 0.6, color: colors.gold, marginLeft: space.xs, flexShrink: 1 },
  bgTabs: {
    flexDirection: 'row',
    marginTop: space.md,
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(243,239,232,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,239,232,0.12)',
  },
  bgTab: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill },
  bgTabOn: { backgroundColor: 'rgba(226,168,75,0.16)', borderWidth: 1, borderColor: 'rgba(246,211,138,0.55)' },
  bgTabLabel: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.textMuted },
  bgWarn: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: GOLD_LIGHT, marginTop: space.md },
  bgRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  bgCarousel: { gap: space.sm, paddingTop: space.md },
  tile: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(243,239,232,0.14)',
    backgroundColor: '#0E0E11',
  },
  tileOn: { borderColor: colors.gold, boxShadow: '0px 0px 16px rgba(226,168,75,0.45)' },
  tileFoot: { position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm },
  tileLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, letterSpacing: -0.1 },
  tileDetail: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 0.6, color: colors.textMuted, marginTop: 1, textTransform: 'uppercase' },
  tileCheck: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
  },
  sceneFrame: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(246,211,138,0.35)',
    backgroundColor: 'rgba(243,239,232,0.03)',
  },
  aperture: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingBottom: 26 },
  apertureRing: { borderWidth: 2, borderColor: 'rgba(246,211,138,0.8)', boxShadow: '0px 0px 14px rgba(226,168,75,0.5)' },
  focus: { position: 'absolute', width: FOCUS_SIZE, height: FOCUS_SIZE, borderWidth: 1.5, borderColor: colors.gold, borderRadius: 3 },
  focusTick: { position: 'absolute', width: 2, backgroundColor: colors.gold },
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
