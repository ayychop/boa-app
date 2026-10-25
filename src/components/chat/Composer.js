import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { claim } from '../../audio/focus';
import { haptics } from '../../utils/haptics';
import { PulseDot } from '../ui';
import { clock, downsample, level, Waveform } from './media';
import { colors, fonts, radius, space } from '../../theme';

const MAX_LENGTH = 2000;
// Voice notes stop themselves at five minutes.
const MAX_VOICE_MS = 5 * 60 * 1000;
const MIN_VOICE_MS = 700;
const RECORDING = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

// After recording, back to the app's playback session (audio/session.js).
const PLAYBACK_MODE = { allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' };

/**
 * The bar under a conversation: a message field, a + for photos and
 * videos, and a mic for voice notes (tap to record, then send or bin it).
 * onSend(text), onAttach(), onVoice({ uri, durationMs, waveform }).
 */
export default function Composer({ onSend, onAttach, onVoice, bottomInset = 0, onFocus }) {
  const [draft, setDraft] = useState('');
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
    onSend?.(text);
  };

  const typing = draft.trim().length > 0;

  return (
    <View style={[styles.wrap, { paddingBottom: bottomInset + space.sm }]}>
      <BlurView intensity={60} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} />
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
            <Ionicons name="arrow-up" size={20} color={colors.bg} />
          </Pressable>
        </Animated.View>
      ) : (
        <View style={styles.row}>
          <Pressable onPress={onAttach} accessibilityRole="button" accessibilityLabel="Send a photo or video" hitSlop={10} style={styles.side} testID="hub-attach">
            <Ionicons name="add" size={26} color={colors.gold} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onFocus={onFocus}
            placeholder="Message"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.gold}
            multiline
            maxLength={MAX_LENGTH}
            style={styles.input}
            accessibilityLabel="Message"
            testID="hub-composer"
          />
          {typing ? (
            <Pressable onPress={submit} accessibilityRole="button" accessibilityLabel="Send" style={styles.send} testID="hub-send">
              <Ionicons name="arrow-up" size={20} color={colors.bg} />
            </Pressable>
          ) : (
            <Pressable onPress={start} accessibilityRole="button" accessibilityLabel="Record a voice note" style={styles.mic} testID="hub-mic">
              <Ionicons name="mic" size={20} color={colors.gold} />
            </Pressable>
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
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,11,13,0.55)' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  side: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: space.md,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  mic: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.4)',
  },
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
