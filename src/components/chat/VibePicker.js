import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VIBES } from '../../chat/vibes';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space } from '../../theme';

/**
 * The three chat vibes side by side, each a small window onto its look: the
 * mesh, one of their bubbles and one of yours. Picking one applies it at once.
 */
export default function VibePicker({ value, onChange }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {VIBES.map((v) => {
        const on = v.id === value;
        return (
          <Pressable
            key={v.id}
            onPress={() => {
              haptics.selection();
              onChange(v.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${v.label}: ${v.detail}`}
            style={({ pressed }) => [styles.card, on && { borderColor: v.accentEdge }, pressed && { transform: [{ scale: 0.96 }] }]}
            testID={`chat-vibe-${v.id}`}
          >
            <LinearGradient colors={v.mesh} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preview}>
              <View style={[styles.light, { backgroundColor: v.lights[0].color }]} />
              <View style={[styles.theirs, { backgroundColor: v.theirsFill, borderColor: v.theirsEdge }]} />
              <LinearGradient colors={v.mine} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={[styles.mine, { borderColor: v.mineEdge }]} />
            </LinearGradient>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{v.label}</Text>
              {on ? <Ionicons name="checkmark-circle" size={15} color={v.accent} testID={`chat-vibe-${v.id}-selected`} /> : null}
            </View>
            <Text style={styles.detail} numberOfLines={2}>
              {v.detail}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  card: {
    flex: 1,
    padding: 6,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  preview: { height: 92, borderRadius: radius.md, overflow: 'hidden', padding: 8, justifyContent: 'flex-end', gap: 5 },
  light: { position: 'absolute', width: 70, height: 70, borderRadius: 35, top: -24, left: -18, opacity: 0.45 },
  theirs: { width: '62%', height: 16, borderRadius: 8, borderBottomLeftRadius: 3, borderWidth: 1 },
  mine: { alignSelf: 'flex-end', width: '55%', height: 16, borderRadius: 8, borderBottomRightRadius: 3, borderWidth: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm, paddingHorizontal: 4 },
  label: { fontFamily: fonts.chatBold, fontSize: 14, color: colors.text },
  detail: { fontFamily: fonts.chat, fontSize: 11, lineHeight: 15, color: colors.textFaint, marginTop: 2, paddingHorizontal: 4 },
});
