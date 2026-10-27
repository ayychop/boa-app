import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Fog } from './ui';
import { colors, fonts } from '../theme';

// A show's own cover art; when a show has none, generated art in one of three
// BOA-flavoured layouts so it still reads as part of the set.
export default function PodcastCover({ podcast, size, rounded = Math.round(size * 0.08) }) {
  const [hue, deep] = podcast.palette;
  const s = size / 100; // layout unit
  const frame = { width: size, height: size, borderRadius: rounded };

  if (podcast.artwork) {
    return (
      <View style={[styles.frame, frame]}>
        <Image
          source={{ uri: podcast.artwork }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          accessibilityLabel={`${podcast.title} cover art`}
        />
      </View>
    );
  }

  if (podcast.cover === 'stack') {
    const words = podcast.title.replace('&', '+').split(/\s+/);
    return (
      <View style={[styles.frame, frame, { backgroundColor: hue }]}>
        <View style={[styles.pad, { padding: 9 * s }]}>
          <Text style={[styles.mark, { fontSize: 6 * s, color: deep, letterSpacing: 1.2 * s }]}>PODCAST</Text>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            {words.map((w) => {
              // Shrink long words to fit the width (adjustsFontSizeToFit is
              // native-only); ~0.66em per heavy uppercase glyph.
              const fit = Math.min(19 * s, (82 * s) / (w.length * 0.66));
              return (
                <Text
                  key={w}
                  style={[styles.stack, { fontSize: fit, lineHeight: fit * 0.95, color: deep, letterSpacing: -0.05 * fit }]}
                  numberOfLines={1}
                >
                  {w.toUpperCase()}
                </Text>
              );
            })}
          </View>
        </View>
      </View>
    );
  }

  if (podcast.cover === 'slate') {
    return (
      <View style={[styles.frame, frame, { backgroundColor: deep }]}>
        <View style={{ flexDirection: 'row', height: 12 * s }}>
          {Array.from({ length: 7 }, (_, i) => (
            <View
              key={i}
              style={{ flex: 1, backgroundColor: i % 2 ? colors.text : hue, transform: [{ skewX: '-24deg' }], marginHorizontal: -0.5 }}
            />
          ))}
        </View>
        <Fog opacity={0.2} />
        <View style={[styles.pad, { top: 12 * s, padding: 9 * s }]}>
          <Text style={[styles.mono, { fontSize: 5.5 * s, letterSpacing: 1.1 * s }]}>PODCAST · ROLL 01</Text>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Text style={[styles.title, { fontSize: 15 * s, lineHeight: 15.5 * s, letterSpacing: -0.6 * s }]} numberOfLines={3}>
              {podcast.title}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // 'serif'
  return (
    <View style={[styles.frame, frame, { backgroundColor: colors.bg }]}>
      <LinearGradient colors={[`${hue}CC`, deep, colors.bg]} locations={[0, 0.55, 1]} start={{ x: 0.9, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Fog opacity={0.22} />
      <View style={[styles.pad, { padding: 9 * s }]}>
        <Text style={[styles.mono, { fontSize: 5.5 * s, letterSpacing: 1.1 * s }]}>PODCAST</Text>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Text style={[styles.serif, { fontSize: 21 * s, lineHeight: 21 * s }]} numberOfLines={3}>
            {podcast.title}
          </Text>
          <Text style={[styles.mono, { fontSize: 5 * s, letterSpacing: 1 * s, marginTop: 4 * s, color: hue }]}>
            {podcast.category.toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pad: { ...StyleSheet.absoluteFill },
  mark: { fontFamily: fonts.monoMedium },
  stack: { fontFamily: fonts.extrabold },
  mono: { fontFamily: fonts.mono, color: colors.textMuted },
  title: { fontFamily: fonts.bold, color: colors.text },
  serif: { fontFamily: fonts.serif, color: colors.text },
});
