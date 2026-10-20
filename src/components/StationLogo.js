import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '../theme';

const GRADIENTS = [
  ['#E50914', '#5B0A10'],
  ['#1ED760', '#0B4D24'],
  ['#7C3AED', '#2E1065'],
  ['#F59E0B', '#78350F'],
  ['#0EA5E9', '#0C4A6E'],
  ['#EC4899', '#701A45'],
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function stationGradient(station) {
  return GRADIENTS[hash(station.id) % GRADIENTS.length];
}

function initials(name) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
}

// Many radio-browser favicons are missing or dead links, so every logo has a
// generated fallback that stays stable per station.
export default function StationLogo({ station, size = 56, rounded = 10, fit = 'contain' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [station.logo]);
  const frame = { width: size, height: size, borderRadius: rounded };

  if (station.logo && !failed) {
    return (
      <View style={[styles.frame, frame]}>
        <Image
          source={{ uri: station.logo }}
          style={styles.image}
          resizeMode={fit}
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={stationGradient(station)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.frame, frame, styles.center]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.34 }]}>{initials(station.name)}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.surfaceRaised },
  image: { width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.extrabold, color: 'rgba(255,255,255,0.92)', letterSpacing: -0.5 },
});
