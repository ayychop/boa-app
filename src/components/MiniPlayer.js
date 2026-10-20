import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../context/PlayerContext';
import { describePlayback } from '../audio/status';
import StationLogo from './StationLogo';
import { colors, fonts, radius, space } from '../theme';

const HEIGHT = 60;
// Space screens should leave free at the bottom so content isn't hidden.
export const MINI_PLAYER_SPACE = HEIGHT + space.md * 2;

export default function MiniPlayer({ onOpen }) {
  const { station, status, trackTitle, isPlaying, toggle } = usePlayer();
  if (!station) return null;

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(17).stiffness(170)}
      exiting={FadeOutDown.duration(180)}
      style={styles.wrap}
      pointerEvents="box-none"
    >
      <View style={styles.pill}>
        <BlurView intensity={60} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View style={styles.tint} />
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`Now playing: ${station.name}. Open radio`}
          style={styles.info}
        >
          <StationLogo station={station} size={42} rounded={21} fit="cover" />
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {station.name}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {describePlayback(status, trackTitle) || 'Live radio'}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => toggle()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.92 }] }]}
        >
          {status === 'loading' ? (
            <ActivityIndicator color={colors.bg} size="small" />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={20}
              color={colors.bg}
              style={isPlaying ? null : { marginLeft: 2 }}
            />
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: '100%',
    marginBottom: space.md,
    alignItems: 'center',
  },
  pill: {
    width: '100%',
    maxWidth: 520,
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: 9,
    paddingRight: 9,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    boxShadow: '0px 12px 32px rgba(0,0,0,0.45)',
  },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,30,34,0.55)' },
  info: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.bold, color: colors.text, fontSize: 15, letterSpacing: -0.3 },
  subtitle: { fontFamily: fonts.medium, color: colors.textMuted, fontSize: 12.5, marginTop: 1 },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
});
