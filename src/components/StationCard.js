import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StationLogo from './StationLogo';
import { colors, radius, space, type } from '../theme';

function StationCard({ station, active, onPress }) {
  const meta = [station.country, station.bitrate ? `${station.bitrate} kbps` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={() => onPress(station)}
      accessibilityRole="button"
      accessibilityLabel={`Play ${station.name}`}
      style={({ pressed, hovered }) => [
        styles.card,
        active && styles.cardActive,
        hovered && !active && styles.cardHover,
        pressed && styles.cardPressed,
      ]}
    >
      <StationLogo station={station} size={56} />
      <View style={styles.body}>
        <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
          {station.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta || 'Live radio'}
        </Text>
        {station.tags.length > 0 && (
          <Text style={styles.tags} numberOfLines={1}>
            {station.tags.slice(0, 3).join(' • ')}
          </Text>
        )}
      </View>
      <View style={[styles.play, active && styles.playActive]}>
        <Ionicons name={active ? 'pulse' : 'play'} size={18} color={active ? colors.bg : colors.text} />
      </View>
    </Pressable>
  );
}

export default memo(StationCard);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardHover: { backgroundColor: colors.surfaceRaised },
  cardActive: { borderColor: 'rgba(30,215,96,0.45)', backgroundColor: '#13201A' },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.body, fontWeight: '700' },
  nameActive: { color: colors.live },
  meta: type.caption,
  tags: { ...type.caption, color: colors.textFaint, textTransform: 'capitalize' },
  play: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  playActive: { backgroundColor: colors.live },
});
