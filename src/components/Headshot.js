import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Fog, Slate } from './ui';
import { colors, fonts } from '../theme';

function initials(name) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
}

/**
 * Talent frame. Until real headshots exist it mirrors the site's tinted
 * placeholder, with serif initials so each person still reads as distinct.
 */
export default function Headshot({ person, width, ratio = 4 / 5, round = false, label = true }) {
  const height = round ? width : Math.round(width / ratio);
  return (
    <View
      style={[
        styles.frame,
        { width, height, borderRadius: round ? width / 2 : 14 },
        round && { borderColor: `${person.tint}66` },
      ]}
    >
      {person.headshot ? (
        <Image source={{ uri: person.headshot }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <>
          <LinearGradient
            colors={[`${person.tint}70`, `${person.tint}12`, 'transparent']}
            locations={[0, 0.5, 1]}
            start={{ x: 0.75, y: 0.1 }}
            end={{ x: 0.2, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Fog opacity={0.16} />
          <View style={styles.center}>
            <Text style={[styles.initials, { color: person.tint, fontSize: width * (round ? 0.42 : 0.34) }]}>
              {initials(person.name)}
            </Text>
          </View>
          {label && !round && <Slate style={styles.tag}>Headshot · 4:5</Slate>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.serif, letterSpacing: -1, opacity: 0.9 },
  tag: { position: 'absolute', top: 12, left: 12, opacity: 0.55 },
});
