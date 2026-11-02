import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, FadeOut, FadeOutUp } from 'react-native-reanimated';
import useReducedMotion from '../../hooks/useReducedMotion';
import { usePlayer } from '../../context/PlayerContext';
import * as engine from '../../audio/engine';
import { useOffline } from '../../offline/network';
import { useDownloads } from '../../offline/downloads';
import { colors, fonts, radius } from '../../theme';

/**
 * What to do the moment the connection goes, for whatever is playing:
 *  - a downloaded episode that was streaming carries on from the phone's own
 *    copy, at the same place;
 *  - a live station can't play with no signal, so the newest downloaded audio
 *    takes over instead (and nothing starts if nothing is downloaded);
 *  - nothing playing: nothing to do.
 */
export function switchToDevice({ player, downloads }) {
  const current = player.current;
  if (!current || !player.isPlaying) return 'idle';
  if (current.kind === 'podcast') {
    engine.reloadFromDevice();
    return 'reload';
  }
  const next = downloads.find((d) => d.kind === 'audio' && d.status === 'done' && d.meta?.item);
  if (!next) return 'none';
  player.play(next.meta.item);
  return 'download';
}

/**
 * "Offline Mode": a small pill under the status bar while there is no
 * internet, and the automatic switch to downloaded audio (see switchToDevice).
 * Mounted once, over the whole app.
 */
export default function OfflineMode() {
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const player = usePlayer();
  const downloads = useDownloads();
  const latest = useRef({ player, downloads });
  latest.current = { player, downloads };
  const wasOffline = useRef(false);

  useEffect(() => {
    // Only on the moment it goes offline, not on every change while it is.
    if (offline && !wasOffline.current) switchToDevice(latest.current);
    wasOffline.current = offline;
  }, [offline]);

  if (!offline) return null;
  const saved = downloads.filter((d) => d.status === 'done').length;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <Animated.View
        entering={reduce ? FadeIn : FadeInUp.springify().damping(18)}
        exiting={reduce ? FadeOut : FadeOutUp.duration(220)}
        style={styles.pill}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={saved ? 'Offline Mode. Playing from your downloads.' : 'Offline Mode. No internet connection.'}
        testID="offline-banner"
      >
        <Ionicons name="cloud-offline-outline" size={13} color={colors.gold} />
        <Text style={styles.title}>OFFLINE MODE</Text>
        <Text style={styles.sub}>{saved ? 'Playing from downloads' : 'No connection'}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(11,11,13,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.55)',
  },
  title: { fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 1.6, color: colors.gold },
  sub: { fontFamily: fonts.medium, fontSize: 11, color: colors.textMuted },
});
