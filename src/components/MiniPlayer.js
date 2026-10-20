import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../context/PlayerContext';
import StationLogo from './StationLogo';
import { colors, radius, space, type } from '../theme';

export default function MiniPlayer() {
  const { station, isPlaying, togglePlay } = usePlayer();
  if (!station) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <StationLogo station={station} size={42} rounded={8} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {station.name}
          </Text>
          <View style={styles.liveRow}>
            <View style={[styles.dot, !isPlaying && styles.dotPaused]} />
            <Text style={styles.subtitle} numberOfLines={1}>
              {isPlaying ? 'Live · track info coming soon' : 'Paused'}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={togglePlay}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.text} />
        </Pressable>
        {/* Thin progress-style rule, Spotify-like. Live radio has no duration. */}
        <View style={styles.rule}>
          <View style={[styles.ruleFill, !isPlaying && { backgroundColor: colors.textFaint }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.sm, paddingBottom: space.xs, backgroundColor: 'transparent' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.md,
    borderRadius: radius.md,
    backgroundColor: '#2A1416',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  body: { flex: 1, minWidth: 0 },
  title: { ...type.body, fontSize: 14, fontWeight: '700' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  dotPaused: { backgroundColor: colors.textFaint },
  subtitle: { ...type.caption, flexShrink: 1 },
  toggle: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  rule: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ruleFill: { width: '100%', height: '100%', backgroundColor: colors.text, opacity: 0.85 },
});
