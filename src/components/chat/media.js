import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { mediaUrl } from '../../api/hub';
import { claim, register } from '../../audio/focus';
import { ensureAudioSession } from '../../audio/session';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space } from '../../theme';

export const WAVE_BARS = 40;

/** m:ss */
export function clock(ms) {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Squeezes recorded levels (0..100) into `bars` bars, keeping each stretch's peak. */
export function downsample(levels, bars = WAVE_BARS) {
  if (!levels?.length) return [];
  const out = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * levels.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars));
    out.push(Math.round(Math.max(...levels.slice(from, to))));
  }
  return out;
}

/** A recorder's metering (dBFS, about -60 quiet to 0 loud) as 0..100. */
export const level = (db) => (typeof db === 'number' ? Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) : 0);

/** A message's file: its local copy while sending, else a signed link. */
export function useMediaUrl(message) {
  const [url, setUrl] = useState(message.localUri ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (message.localUri) {
      setUrl(message.localUri);
      return undefined;
    }
    if (!message.media_path) return undefined;
    let alive = true;
    mediaUrl(message.media_path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [message.localUri, message.media_path]);
  return { url, failed };
}

export function Waveform({ levels, progress = 0, mine, height = 28 }) {
  const bars = levels?.length ? levels : Array.from({ length: WAVE_BARS }, (_, i) => 18 + ((i * 37) % 30));
  const played = mine ? colors.bg : colors.gold;
  const rest = mine ? 'rgba(5,5,6,0.32)' : 'rgba(243,239,232,0.28)';
  return (
    <View style={[styles.wave, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bars.map((v, i) => (
        <View
          key={i}
          style={[styles.bar, { height: Math.max(3, (v / 100) * height), backgroundColor: i / bars.length < progress ? played : rest }]}
        />
      ))}
    </View>
  );
}

/** A voice note in a bubble: play / pause, its waveform filling as it plays, and the time. */
export function VoiceNote({ message, mine }) {
  const { url, failed } = useMediaUrl(message);
  const player = useAudioPlayer(url ? { uri: url } : null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const name = `voice:${message.id}`;

  // Another sound starting (the radio, another voice note) pauses this one.
  useEffect(() => register(name, () => player?.pause?.()), [name, player]);
  // Back to the start when it finishes.
  useEffect(() => {
    if (status?.didJustFinish) player?.seekTo?.(0);
  }, [status?.didJustFinish, player]);

  const duration = (status?.duration ? status.duration * 1000 : 0) || message.media_duration_ms || 0;
  const position = (status?.currentTime ?? 0) * 1000;
  const playing = !!status?.playing;
  const progress = duration ? Math.min(1, position / duration) : 0;

  const toggle = async () => {
    if (!url || !player) return;
    haptics.tap();
    if (playing) return player.pause();
    await ensureAudioSession();
    claim(name);
    player.play();
  };

  return (
    <View style={styles.voice} testID={`voice-note-${message.id}`}>
      <Pressable
        onPress={toggle}
        disabled={!url}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : `Play voice note, ${clock(duration)}`}
        style={[styles.play, mine ? styles.playMine : styles.playTheirs]}
      >
        {!url && !failed ? (
          <ActivityIndicator size="small" color={mine ? colors.gold : colors.bg} />
        ) : (
          <Ionicons name={failed ? 'alert' : playing ? 'pause' : 'play'} size={18} color={mine ? colors.gold : colors.bg} style={!playing && !failed && { marginLeft: 2 }} />
        )}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Waveform levels={message.waveform} progress={progress} mine={mine} />
        <Text style={[styles.voiceTime, mine && { color: 'rgba(5,5,6,0.62)' }]}>{clock(playing || position ? position : duration)}</Text>
      </View>
    </View>
  );
}

const MAX_TILE = 240;

/** A photo or video in a bubble, sized to its shape. Tapping opens it full screen. */
export function MediaTile({ message, onOpen }) {
  const { url, failed } = useMediaUrl(message);
  const w = message.media_width || 4;
  const h = message.media_height || 3;
  const ratio = Math.max(0.56, Math.min(1.6, w / h));
  const width = ratio >= 1 ? MAX_TILE : Math.round(MAX_TILE * ratio + 40);
  const height = Math.round(width / ratio);
  const video = message.kind === 'video';
  return (
    <Pressable
      onPress={() => url && onOpen?.({ ...message, url })}
      accessibilityRole="imagebutton"
      accessibilityLabel={video ? `Video${message.media_duration_ms ? `, ${clock(message.media_duration_ms)}` : ''}. Open` : 'Photo. Open'}
      style={[styles.tile, { width, height }]}
      testID={`media-${message.id}`}
    >
      {url && !video ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      {video ? <View style={[StyleSheet.absoluteFill, styles.videoBack]} /> : null}
      {!url && !failed ? <ActivityIndicator color={colors.gold} /> : null}
      {failed ? <Ionicons name="image-outline" size={26} color={colors.textFaint} /> : null}
      {video && url ? (
        <View style={styles.playBig}>
          <Ionicons name="play" size={26} color={colors.text} style={{ marginLeft: 3 }} />
        </View>
      ) : null}
      {video && message.media_duration_ms ? <Text style={styles.tileTime}>{clock(message.media_duration_ms)}</Text> : null}
      {message.pending ? (
        <View style={[StyleSheet.absoluteFill, styles.uploading]}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : null}
    </Pressable>
  );
}

function FullVideo({ url }) {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = false;
    p.play();
  });
  useEffect(() => {
    claim('chat-video');
    return register('chat-video', () => player.pause());
  }, [player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls allowsFullscreen />;
}

/** A photo or video full screen, over everything. */
export function MediaViewer({ item, onClose }) {
  const insets = useSafeAreaInsets();
  const last = useRef(item);
  if (item) last.current = item;
  const shown = item ?? last.current;
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        {shown?.kind === 'video' ? <FullVideo url={shown.url} /> : shown ? <Image source={{ uri: shown.url }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={[styles.close, { top: insets.top + space.md }]}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  bar: { flex: 1, borderRadius: 2 },
  voice: { flexDirection: 'row', alignItems: 'center', gap: space.md, width: 230, paddingVertical: 2 },
  play: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  playMine: { backgroundColor: colors.bg },
  playTheirs: { backgroundColor: colors.gold },
  voiceTime: { fontFamily: fonts.mono, fontSize: 9.5, color: colors.textFaint, marginTop: 4 },
  tile: {
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  videoBack: { backgroundColor: '#0E0E12' },
  playBig: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,5,6,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  tileTime: {
    position: 'absolute',
    right: space.sm,
    bottom: space.sm,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.text,
    backgroundColor: 'rgba(5,5,6,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  uploading: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.45)' },
  viewer: { flex: 1, backgroundColor: '#000' },
  close: {
    position: 'absolute',
    right: space.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,5,6,0.6)',
  },
});
