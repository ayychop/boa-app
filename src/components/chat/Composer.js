import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { claim } from '../../audio/focus';
import { haptics } from '../../utils/haptics';
import { PulseDot } from '../ui';
import { clock, downsample, level, Waveform } from './media';
import { TYPING_EVERY_MS } from '../../chat/typing';
import { vibeById } from '../../chat/vibes';
import { colors, fonts, radius, space } from '../../theme';

const MAX_LENGTH = 2000;
// Voice notes stop themselves at five minutes.
const MAX_VOICE_MS = 5 * 60 * 1000;
const MIN_VOICE_MS = 700;
const RECORDING = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

// After recording, back to the app's playback session (audio/session.js).
const PLAYBACK_MODE = { allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' };

/**
 * A ring of the vibe's light around the mic or send button: a fine bright
 * edge, and a halo behind it that slowly breathes out and fades.
 */
function GlowRing({ children, size = 42, testID, vibe }) {
  const still = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    t.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(t);
  }, [still, t]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - t.value), transform: [{ scale: 1 + t.value * 0.35 }] }));
  return (
    <View style={{ width: size, height: size }} testID={testID}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: vibe.accentSoft }, halo]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ring, { borderRadius: size, borderColor: vibe.accentEdge }]} />
      {children}
    </View>
  );
}

/**
 * The bar under a conversation: a message field, a + for photos and
 * videos, and a mic for voice notes (tap to record, then send or bin it).
 * onSend(text), onAttach(), onVoice({ uri, durationMs, waveform }),
 * onTyping(true) while you type (at most every few seconds), false on send
 * or when the field empties. `vibe` sets its colours; on Android the glass
 * blurs `blurTarget` (the view holding what's behind it).
 */
export default function Composer({ onSend, onAttach, onVoice, onTyping, bottomInset = 0, onFocus, vibe = vibeById(), blurTarget, onLayout, style }) {
  const [draft, setDraft] = useState('');
  const lastPing = useRef(0);
  const change = (text) => {
    setDraft(text);
    if (!onTyping) return;
    if (!text.trim()) {
      if (lastPing.current) onTyping(false);
      lastPing.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastPing.current >= TYPING_EVERY_MS) {
      lastPing.current = now;
      onTyping(true);
    }
  };
  const [recording, setRecording] = useState(false);
  const recorder = useAudioRecorder(RECORDING);
  const state = useAudioRecorderState(recorder, 80);
  const levels = useRef([]);

  // Collect the levels as they come, for the waveform.
  useEffect(() => {
    if (recording && state?.isRecording) levels.current.push(level(state.metering));
  }, [recording, state?.isRecording, state?.metering, state?.durationMillis]);

  const elapsed = state?.durationMillis ?? 0;
  useEffect(() => {
    if (recording && elapsed >= MAX_VOICE_MS) finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, elapsed]);

  const start = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm?.granted) {
        Alert.alert('Microphone needed', 'Allow BOA to use the microphone to send voice notes. You can turn it on in Settings.');
        return;
      }
      claim('voice-recorder');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      levels.current = [];
      recorder.record();
      setRecording(true);
      haptics.tap();
    } catch (err) {
      setAudioModeAsync(PLAYBACK_MODE).catch(() => {});
      Alert.alert("Couldn't record", err?.message ?? 'Try again in a moment.');
    }
  };

  const finish = async (send) => {
    if (!recording) return;
    setRecording(false);
    const durationMs = state?.durationMillis ?? 0;
    try {
      await recorder.stop();
    } catch {}
    setAudioModeAsync(PLAYBACK_MODE).catch(() => {});
    if (!send) return haptics.selection();
    if (durationMs < MIN_VOICE_MS || !recorder.uri) return;
    haptics.tap();
    onVoice?.({ uri: recorder.uri, durationMs, waveform: downsample(levels.current) });
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    if (lastPing.current) onTyping?.(false);
    lastPing.current = 0;
    onSend?.(text);
  };

  const typing = draft.trim().length > 0;

  return (
    <View style={[styles.wrap, { paddingBottom: bottomInset + space.sm }, style]} onLayout={onLayout} testID="hub-composer-bar">
      <BlurView intensity={50} tint={vibe.light ? 'light' : 'dark'} blurMethod="dimezisBlurView" blurTarget={blurTarget} style={StyleSheet.absoluteFill} />
      {/* The glass's tint, which is also its look wherever blur isn't drawn. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: vibe.bar }]} />
      {recording ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.row} testID="voice-recording">
          <Pressable onPress={() => finish(false)} accessibilityRole="button" accessibilityLabel="Discard voice note" hitSlop={10} style={styles.side}>
            <Ionicons name="trash-outline" size={21} color="#FF6B6B" />
          </Pressable>
          <View style={styles.recording}>
            <PulseDot color="#FF4D4D" size={8} />
            <Text style={styles.recTime}>{clock(elapsed)}</Text>
            <View style={{ flex: 1 }}>
              <Waveform levels={downsample(levels.current.slice(-60), 30)} progress={1} mine={false} height={22} />
            </View>
          </View>
          <Pressable onPress={() => finish(true)} accessibilityRole="button" accessibilityLabel="Send voice note" style={styles.send} testID="voice-send">
            <LinearGradient colors={vibe.send} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="arrow-up" size={20} color={vibe.sendIcon} />
          </Pressable>
        </Animated.View>
      ) : (
        <View style={styles.row}>
          <Pressable
            onPress={onAttach}
            accessibilityRole="button"
            accessibilityLabel="Send a photo or video"
            hitSlop={10}
            style={({ pressed }) => [styles.attach, { backgroundColor: vibe.accentSoft, borderColor: vibe.accentEdge }, pressed && styles.pressed]}
            testID="hub-attach"
          >
            <Ionicons name="add" size={24} color={vibe.accent} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={change}
            onFocus={onFocus}
            placeholder="Message"
            placeholderTextColor={vibe.light ? 'rgba(17,17,19,0.4)' : colors.textFaint}
            selectionColor={vibe.accent}
            multiline
            maxLength={MAX_LENGTH}
            // The field flips with the vibe: dark ink on a light theme,
            // and a tint of the backdrop so it never reads as a black box.
            style={[
              styles.input,
              vibe.light
                ? { backgroundColor: 'rgba(17,17,19,0.05)', borderColor: 'rgba(17,17,19,0.14)', color: '#111113' }
                : { color: vibe.ink },
            ]}
            accessibilityLabel="Message"
            testID="hub-composer"
          />
          {typing ? (
            <GlowRing testID="hub-send-glow" vibe={vibe}>
              <Pressable onPress={submit} accessibilityRole="button" accessibilityLabel="Send" style={({ pressed }) => [styles.send, pressed && styles.pressed]} testID="hub-send">
                <LinearGradient colors={vibe.send} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Ionicons name="arrow-up" size={20} color={vibe.sendIcon} />
              </Pressable>
            </GlowRing>
          ) : (
            <GlowRing testID="hub-mic-glow" vibe={vibe}>
              <Pressable onPress={start} accessibilityRole="button" accessibilityLabel="Record a voice note" style={({ pressed }) => [styles.mic, { backgroundColor: vibe.accentSoft }, pressed && styles.pressed]} testID="hub-mic">
                <Ionicons name="mic" size={20} color={vibe.accent} />
              </Pressable>
            </GlowRing>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  side: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  // The + is a small coin rimmed in the vibe's accent.
  attach: { width: 40, height: 40, marginBottom: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pressed: { transform: [{ scale: 0.92 }], opacity: 0.85 },
  ring: { borderWidth: 1.5 },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: space.md,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    color: colors.text,
    fontFamily: fonts.chat,
    fontSize: 15,
  },
  send: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  mic: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  recording: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,77,77,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,77,77,0.35)',
  },
  recTime: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.text, minWidth: 36 },
});
