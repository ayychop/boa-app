import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Tappable } from '../ui';
import { cancelDownload, isDownloadable, removeDownload, startDownload, supported, useDownload } from '../../offline/downloads';
import { colors, fonts } from '../../theme';
import { haptics } from '../../utils/haptics';

/** What a download is doing, as the button and the list show it. */
export function downloadState(entry, url) {
  if (entry?.status === 'done') return 'done';
  if (entry?.status === 'queued' || entry?.status === 'downloading') return 'busy';
  if (entry?.status === 'error') return 'error';
  return isDownloadable(url) ? 'idle' : 'unavailable';
}

const say = (title, message, buttons) => {
  // Alert is a no-op on the web; a plain message there.
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.alert) window.alert(`${title}\n${message}`);
    return;
  }
  Alert.alert(title, message, buttons);
};

const REASONS = {
  offline: ['You are offline', 'Connect to the internet to download this. Downloads you already have still play.'],
  unavailable: ['Streaming only', 'This one is not available to download yet. It still plays when you are online.'],
  unsupported: ['Not on the web', 'Downloads are saved by the BOA app on your phone.'],
};

/** Asks, then deletes a finished download. */
export function confirmRemove(entry) {
  say('Remove this download?', `"${entry.title}" will be deleted from your phone. You can download it again any time you are online.`, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => removeDownload(entry.id) },
  ]);
}

/** Starts a download and tells the user why if it can't. */
export async function download(spec) {
  haptics.tap();
  const res = await startDownload(spec);
  if (!res.ok) say(...(REASONS[res.reason] ?? REASONS.unavailable));
  return res;
}

const RING = 2.5;

/**
 * The download button that sits next to playable content: a cloud with a down
 * arrow. Tapping it downloads; while it downloads the button is a progress
 * ring (tap to cancel); done, it is a gold tick (tap to delete); if it
 * failed, a retry arrow.
 */
export default function DownloadButton({ spec, size = 36, style, testID, hitSlop = 8 }) {
  const entry = useDownload(spec?.id);
  if (!spec || !supported) return null;
  const state = downloadState(entry, spec.url);
  const progress = Math.max(0, Math.min(1, entry?.progress ?? 0));
  const r = (size - RING) / 2;
  const c = 2 * Math.PI * r;

  const onPress = () => {
    if (state === 'busy') {
      haptics.tap();
      cancelDownload(spec.id);
    } else if (state === 'done') {
      haptics.tap();
      confirmRemove(entry);
    } else {
      download(spec);
    }
  };

  const label = {
    idle: `Download ${spec.title}`,
    unavailable: `${spec.title} is streaming only`,
    busy: `Downloading ${spec.title}, ${Math.round(progress * 100)} percent. Tap to cancel`,
    done: `${spec.title} is downloaded. Tap to delete`,
    error: `Download of ${spec.title} failed. Tap to retry`,
  }[state];

  return (
    <Tappable
      onPress={onPress}
      hitSlop={hitSlop}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={state === 'busy' ? { min: 0, max: 100, now: Math.round(progress * 100) } : undefined}
      testID={testID ?? `download-${spec.id}`}
      style={[styles.btn, { width: size, height: size, borderRadius: size / 2 }, state === 'unavailable' && { opacity: 0.4 }, style]}
    >
      {state === 'busy' ? (
        <>
          <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(243,239,232,0.18)" strokeWidth={RING} fill="none" />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colors.gold}
              strokeWidth={RING}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - (entry?.indeterminate || entry?.status === 'queued' ? 0.18 : progress))}
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          </Svg>
          <Ionicons name="stop" size={size * 0.34} color={colors.gold} />
        </>
      ) : state === 'done' ? (
        <Ionicons name="checkmark-circle" size={size * 0.74} color={colors.gold} />
      ) : state === 'error' ? (
        <Ionicons name="refresh-circle-outline" size={size * 0.74} color={colors.text} />
      ) : (
        <Ionicons name="cloud-download-outline" size={size * 0.62} color={colors.text} />
      )}
    </Tappable>
  );
}

/** A thin gold progress bar for one download; nothing when it isn't downloading. */
export function DownloadBar({ id, style }) {
  const entry = useDownload(id);
  if (!entry || (entry.status !== 'downloading' && entry.status !== 'queued')) return null;
  const pct = Math.round((entry.progress ?? 0) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Download progress"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      testID={`download-bar-${id}`}
      style={[styles.track, style]}
    >
      <View style={[styles.fill, { width: `${entry.indeterminate || entry.status === 'queued' ? 8 : Math.max(3, pct)}%` }]} />
    </View>
  );
}

/** "Downloading 42%", "Waiting", "Failed", or a size once saved. */
export function DownloadStatus({ entry, style }) {
  if (!entry) return null;
  const text =
    entry.status === 'done'
      ? null
      : entry.status === 'queued'
        ? 'Waiting…'
        : entry.status === 'error'
          ? 'Download failed'
          : `Downloading ${Math.round((entry.progress ?? 0) * 100)}%`;
  return text ? <Text style={[styles.status, entry.status === 'error' && { color: '#E5645B' }, style]}>{text}</Text> : null;
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,239,232,0.08)' },
  track: { height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(243,239,232,0.12)' },
  fill: { height: 3, borderRadius: 2, backgroundColor: colors.gold },
  status: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.gold },
});
